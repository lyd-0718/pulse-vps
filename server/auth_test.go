package main

import (
	"path/filepath"
	"testing"
	"time"
)

func TestAuthPasswordChangeAndSessionRotation(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "auth-test.db")
	store, err := OpenStore(dbPath)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer store.Close()

	auth := NewAuthManager("initial-pass", "initial-secret")
	auth.LoadFromStore(store)

	if !auth.VerifyPassword("initial-pass") {
		t.Fatal("expected initial env password to verify")
	}
	if auth.VerifyPassword("wrong-pass") {
		t.Fatal("expected wrong password to fail")
	}

	oldTok, _ := auth.SignToken(time.Hour)
	if !auth.VerifyToken(oldTok) {
		t.Fatal("expected old token to verify before rotation")
	}

	newTok, _, err := auth.ChangePassword(store, "super-new-pass-2026")
	if err != nil {
		t.Fatalf("change password failed: %v", err)
	}

	if auth.VerifyPassword("initial-pass") {
		t.Fatal("expected old password to be rejected after change")
	}
	if !auth.VerifyPassword("super-new-pass-2026") {
		t.Fatal("expected new password to verify")
	}
	if auth.VerifyToken(oldTok) {
		t.Fatal("expected old token to be invalidated after JWT secret rotation")
	}
	if !auth.VerifyToken(newTok) {
		t.Fatal("expected newly signed token to verify")
	}

	// Simulate process restart: reload from SQLite and verify new password & token survive
	reloaded := NewAuthManager("initial-pass", "initial-secret")
	reloaded.LoadFromStore(store)
	if reloaded.VerifyPassword("initial-pass") {
		t.Fatal("expected old env password to remain overridden after reload")
	}
	if !reloaded.VerifyPassword("super-new-pass-2026") {
		t.Fatal("expected persisted PBKDF2 password to verify after reload")
	}
	if !reloaded.VerifyToken(newTok) {
		t.Fatal("expected persisted JWT secret to verify token after reload")
	}
}
