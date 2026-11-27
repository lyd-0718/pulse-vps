package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"
)

type AuthManager struct {
	adminPassword string
	jwtSecret     string

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
		adminPassword: adminPassword,
		jwtSecret:     jwtSecret,
		failures:      make(map[string][]time.Time),
	}
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
	got := sha256.Sum256([]byte(password))
	want := sha256.Sum256([]byte(a.adminPassword))
	return subtle.ConstantTimeCompare(got[:], want[:]) == 1
}

func (a *AuthManager) SignToken(ttl time.Duration) (string, int64) {
	exp := time.Now().Add(ttl).UnixMilli()
	payloadBytes, _ := json.Marshal(struct {
		Sub string `json:"sub"`
		Exp int64  `json:"exp"`
	}{Sub: "admin", Exp: exp})
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadBytes)

	mac := hmac.New(sha256.New, []byte(a.jwtSecret))
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
	mac := hmac.New(sha256.New, []byte(a.jwtSecret))
	mac.Write([]byte(parts[0]))
	expectedSig := mac.Sum(nil)

	gotSig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		// Also tolerate standard base64url padded tokens from earlier versions
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
