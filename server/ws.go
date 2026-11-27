package main

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type wsClient struct {
	conn          *websocket.Conn
	authenticated bool
	send          chan []byte
}

type WSHub struct {
	store   *Store
	auth    *AuthManager
	mu      sync.RWMutex
	clients map[*wsClient]struct{}

	notifyCh chan struct{}
	upgrader websocket.Upgrader
}

func NewWSHub(store *Store, auth *AuthManager) *WSHub {
	h := &WSHub{
		store:    store,
		auth:     auth,
		clients:  make(map[*wsClient]struct{}),
		notifyCh: make(chan struct{}, 1),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 16 * 1024,
			CheckOrigin: func(r *http.Request) bool {
				return true
			},
		},
	}
	go h.loop()
	return h
}

func (h *WSHub) TriggerBroadcast() {
	select {
	case h.notifyCh <- struct{}{}:
	default:
	}
}

func (h *WSHub) loop() {
	// Debounce bursts of agent heartbeats so browsers receive crisp <= 1 Hz snapshots
	var pending bool
	ticker := time.NewTicker(1200 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-h.notifyCh:
			pending = true
		case <-ticker.C:
			if !pending {
				continue
			}
			pending = false
			h.broadcastAll()
		}
	}
}

func (h *WSHub) broadcastAll() {
	h.mu.RLock()
	if len(h.clients) == 0 {
		h.mu.RUnlock()
		return
	}
	hasAuth := false
	hasPublic := false
	for c := range h.clients {
		if c.authenticated {
			hasAuth = true
		} else {
			hasPublic = true
		}
	}
	h.mu.RUnlock()

	var authBytes, pubBytes []byte
	if hasAuth {
		if data, err := h.store.BuildBootstrap(true); err == nil {
			authBytes, _ = json.Marshal(struct {
				Type string            `json:"type"`
				Data BootstrapResponse `json:"data"`
			}{Type: "bootstrap", Data: data})
		}
	}
	if hasPublic {
		if data, err := h.store.BuildBootstrap(false); err == nil {
			pubBytes, _ = json.Marshal(struct {
				Type string            `json:"type"`
				Data BootstrapResponse `json:"data"`
			}{Type: "bootstrap", Data: data})
		}
	}

	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		msg := pubBytes
		if c.authenticated {
			msg = authBytes
		}
		if len(msg) == 0 {
			continue
		}
		select {
		case c.send <- msg:
		default:
			// Drop frame for slow client instead of blocking hub
		}
	}
}

func (h *WSHub) ServeWS(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		token = ExtractBearerToken(r)
	}
	authenticated := h.auth.VerifyToken(token)
	if settings, err := h.store.ReadSettings(false); err == nil {
		if settings.PublicAccess == "private" && !authenticated {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	client := &wsClient{
		conn:          conn,
		authenticated: authenticated,
		send:          make(chan []byte, 8),
	}

	h.mu.Lock()
	h.clients[client] = struct{}{}
	h.mu.Unlock()

	// Send immediate bootstrap snapshot on connect
	if data, err := h.store.BuildBootstrap(authenticated); err == nil {
		if msg, err := json.Marshal(struct {
			Type string            `json:"type"`
			Data BootstrapResponse `json:"data"`
		}{Type: "bootstrap", Data: data}); err == nil {
			client.send <- msg
		}
	}

	// Writer goroutine
	go func() {
		pingTicker := time.NewTicker(25 * time.Second)
		defer func() {
			pingTicker.Stop()
			h.remove(client)
		}()
		for {
			select {
			case msg, ok := <-client.send:
				_ = conn.SetWriteDeadline(time.Now().Add(8 * time.Second))
				if !ok {
					_ = conn.WriteMessage(websocket.CloseMessage, []byte{})
					return
				}
				if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
					return
				}
			case <-pingTicker.C:
				_ = conn.SetWriteDeadline(time.Now().Add(8 * time.Second))
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			}
		}
	}()

	// Reader goroutine (keeps pong alive and detects close)
	conn.SetReadLimit(2048)
	_ = conn.SetReadDeadline(time.Now().Add(65 * time.Second))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(65 * time.Second))
		return nil
	})
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			h.remove(client)
			return
		}
	}
}

func (h *WSHub) remove(c *wsClient) {
	h.mu.Lock()
	if _, exists := h.clients[c]; exists {
		delete(h.clients, c)
		close(c.send)
		_ = c.conn.Close()
	}
	h.mu.Unlock()
}

func (h *WSHub) DisconnectUnauthenticated() {
	h.mu.Lock()
	var toClose []*wsClient
	for c := range h.clients {
		if !c.authenticated {
			toClose = append(toClose, c)
		}
	}
	for _, c := range toClose {
		delete(h.clients, c)
		close(c.send)
		_ = c.conn.Close()
	}
	h.mu.Unlock()
}

func (h *WSHub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

func logQuiet(format string, args ...any) {
	log.Printf(format, args...)
}
