package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

const pbkdf2Iterations = 100000

type AuthManager struct {
	rw           sync.RWMutex
	envPassword  string
	passwordHash string // format: pbkdf2_sha256$<iter>$<salt_hex>$<dk_hex>
	jwtSecret    string

	mu       sync.Mutex
	failures map[string][]time.Time
}

func NewAuthManager(adminPassword, jwtSecret string) *AuthManager {
	if strings.TrimSpace(adminPassword) == "" {
		adminPassword = "admin123"
	}
	if strings.TrimSpace(jwtSecret) == "" {
		jwtSecret = adminPassword
	}
	return &AuthManager{
		envPassword: adminPassword,
		jwtSecret:   jwtSecret,
		failures:    make(map[string][]time.Time),
	}
}

// LoadFromStore restores persisted password hash and rotated JWT secret from SQLite settings.
func (a *AuthManager) LoadFromStore(store *Store) {
	if store == nil {
		return
	}
	a.rw.Lock()
	defer a.rw.Unlock()
	if h := strings.TrimSpace(store.GetSetting("admin_password_hash")); h != "" {
		a.passwordHash = h
	}
	if s := strings.TrimSpace(store.GetSetting("admin_jwt_secret")); s != "" {
		a.jwtSecret = s
	}
}

// pbkdf2SHA256 derives a 32-byte key using standard RFC 2898 PBKDF2-HMAC-SHA256 (stdlib only).
func pbkdf2SHA256(password, salt []byte, iter int) []byte {
	prf := func(msg []byte) []byte {
		mac := hmac.New(sha256.New, password)
		mac.Write(msg)
		return mac.Sum(nil)
	}
	block := make([]byte, len(salt)+4)
	copy(block, salt)
	block[len(salt)+3] = 1 // block index = 1 (big-endian uint32)
	u := prf(block)
	dk := make([]byte, len(u))
	copy(dk, u)
	for i := 1; i < iter; i++ {
		u = prf(u)
		for j := range dk {
			dk[j] ^= u[j]
		}
	}
	return dk
}

func HashAdminPassword(plain string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	dk := pbkdf2SHA256([]byte(plain), salt, pbkdf2Iterations)
	return fmt.Sprintf("pbkdf2_sha256$%d$%s$%s", pbkdf2Iterations, hex.EncodeToString(salt), hex.EncodeToString(dk)), nil
}

func verifyPasswordHash(plain, encoded string) bool {
	parts := strings.Split(encoded, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2_sha256" {
		return false
	}
	iter, err := strconv.Atoi(parts[1])
	if err != nil || iter < 10000 || iter > 1000000 {
		return false
	}
	salt, err := hex.DecodeString(parts[2])
	if err != nil || len(salt) == 0 {
		return false
	}
	want, err := hex.DecodeString(parts[3])
	if err != nil || len(want) == 0 {
		return false
	}
	got := pbkdf2SHA256([]byte(plain), salt, iter)
	return subtle.ConstantTimeCompare(got, want) == 1
}

// ChangePassword persists a new salted password hash and rotates the JWT signing secret.
func (a *AuthManager) ChangePassword(store *Store, newPassword string) (string, int64, error) {
	hash, err := HashAdminPassword(newPassword)
	if err != nil {
		return "", 0, err
	}
	secretBuf := make([]byte, 32)
	if _, err := rand.Read(secretBuf); err != nil {
		return "", 0, err
	}
	newSecret := hex.EncodeToString(secretBuf)

	if err := store.UpdateSettings(map[string]string{
		"admin_password_hash": hash,
		"admin_jwt_secret":    newSecret,
	}); err != nil {
		return "", 0, err
	}

	a.rw.Lock()
	a.passwordHash = hash
	a.jwtSecret = newSecret
	a.rw.Unlock()

	token, exp := a.SignToken(7 * 24 * time.Hour)
	return token, exp, nil
}

func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func GenerateRawToken(byteLen int) string {
	buf := make([]byte, byteLen)
	_, _ = rand.Read(buf)
	return base64.RawURLEncoding.EncodeToString(buf)
}

func GenerateID(prefix string) string {
	buf := make([]byte, 6)
	_, _ = rand.Read(buf)
	return prefix + "-" + hex.EncodeToString(buf)
}

func (a *AuthManager) IsRateLimited(ip string) bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	cutoff := time.Now().Add(-5 * time.Minute)
	list := a.failures[ip]
	kept := list[:0]
	for _, ts := range list {
		if ts.After(cutoff) {
			kept = append(kept, ts)
		}
	}
	if len(kept) == 0 {
		delete(a.failures, ip)
		return false
	}
	a.failures[ip] = kept
	return len(kept) >= 5
}

func (a *AuthManager) RecordLoginFailure(ip string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.failures[ip] = append(a.failures[ip], time.Now())
}

func (a *AuthManager) ClearLoginFailures(ip string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.failures, ip)
}

func (a *AuthManager) VerifyPassword(password string) bool {
	a.rw.RLock()
	hash := a.passwordHash
	envPass := a.envPassword
	a.rw.RUnlock()

	if hash != "" {
		return verifyPasswordHash(password, hash)
	}
	got := sha256.Sum256([]byte(password))
	want := sha256.Sum256([]byte(envPass))
	return subtle.ConstantTimeCompare(got[:], want[:]) == 1
}

func (a *AuthManager) SignToken(ttl time.Duration) (string, int64) {
	a.rw.RLock()
	secret := a.jwtSecret
	a.rw.RUnlock()

	exp := time.Now().Add(ttl).UnixMilli()
	payloadBytes, _ := json.Marshal(struct {
		Sub string `json:"sub"`
		Exp int64  `json:"exp"`
	}{Sub: "admin", Exp: exp})
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadBytes)

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payloadB64))
	sigB64 := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return payloadB64 + "." + sigB64, exp
}

func (a *AuthManager) VerifyToken(token string) bool {
	token = strings.TrimSpace(token)
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return false
	}
	a.rw.RLock()
	secret := a.jwtSecret
	a.rw.RUnlock()

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(parts[0]))
	expectedSig := mac.Sum(nil)

	gotSig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		gotSig, err = base64.URLEncoding.DecodeString(parts[1])
		if err != nil {
			return false
		}
	}
	if !hmac.Equal(gotSig, expectedSig) {
		return false
	}

	rawPayload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		rawPayload, err = base64.URLEncoding.DecodeString(parts[0])
		if err != nil {
			return false
		}
	}
	var parsed struct {
		Sub string `json:"sub"`
		Exp int64  `json:"exp"`
	}
	if err := json.Unmarshal(rawPayload, &parsed); err != nil {
		return false
	}
	return parsed.Sub == "admin" && parsed.Exp > time.Now().UnixMilli()
}

func ExtractBearerToken(r *http.Request) string {
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	if len(auth) > 7 && strings.EqualFold(auth[:7], "Bearer ") {
		return strings.TrimSpace(auth[7:])
	}
	return ""
}

func ClientIPFromRequest(r *http.Request) string {
	if cf := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); cf != "" {
		return cf
	}
	if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 && strings.TrimSpace(parts[0]) != "" {
			return strings.TrimSpace(parts[0])
		}
	}
	if xr := strings.TrimSpace(r.Header.Get("X-Real-IP")); xr != "" {
		return xr
	}
	host := r.RemoteAddr
	if idx := strings.LastIndex(host, ":"); idx > 0 {
		host = host[:idx]
	}
	return strings.Trim(host, "[]")
}
