package main

import (
	"context"
	"embed"
	"encoding/json"
	"flag"
	"io/fs"
	"log"
	"math"
	"net/http"
	"os"
	"os/signal"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

//go:embed all:webdist
var embeddedWebFS embed.FS

type Server struct {
	store             *Store
	auth              *AuthManager
	hub               *WSHub
	alerts            *AlertEngine
	agentDownloadBase string
	webFS             fs.FS
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func readJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 2<<20))
	return dec.Decode(dst)
}

func (srv *Server) isAdmin(r *http.Request) bool {
	return srv.auth.VerifyToken(ExtractBearerToken(r))
}

func (srv *Server) routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]any{
			"ok":   true,
			"time": time.Now().UnixMilli(),
			"mode": "selfhost",
		}
		if srv.isAdmin(r) {
			resp["wsClients"] = srv.hub.ClientCount()
		}
		writeJSON(w, http.StatusOK, resp)
	})

	mux.HandleFunc("GET /api/ws", srv.hub.ServeWS)

	mux.HandleFunc("POST /api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		ip := ClientIPFromRequest(r)
		if srv.auth.IsRateLimited(ip) {
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "密码错误次数过多，请 5 分钟后再试"})
			return
		}
		var body struct {
			Password string `json:"password"`
		}
		_ = readJSON(r, &body)
		if !srv.auth.VerifyPassword(body.Password) {
			srv.auth.RecordLoginFailure(ip)
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "管理密码错误"})
			return
		}
		srv.auth.ClearLoginFailures(ip)
		token, exp := srv.auth.SignToken(7 * 24 * time.Hour)
		writeJSON(w, http.StatusOK, map[string]any{"token": token, "expiresAt": exp})
	})

	mux.HandleFunc("GET /api/auth/me", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]bool{"authenticated": srv.isAdmin(r)})
	})

	mux.HandleFunc("GET /api/bootstrap", func(w http.ResponseWriter, r *http.Request) {
		data, err := srv.store.BuildBootstrap(srv.isAdmin(r))
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, data)
	})

	mux.HandleFunc("GET /api/nodes/{id}/history", func(w http.ResponseWriter, r *http.Request) {
		settings, err := srv.store.ReadSettings(false)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if settings.PublicAccess == "private" && !srv.isAdmin(r) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
			return
		}
		nodeID := r.PathValue("id")
		rangeKey := r.URL.Query().Get("range")
		if rangeKey == "" {
			rangeKey = "1h"
		}
		pts, err := srv.store.GetNodeHistory(nodeID, rangeKey)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"nodeId": nodeID,
			"range":  rangeKey,
			"points": pts,
		})
	})

	mux.HandleFunc("POST /api/nodes", func(w http.ResponseWriter, r *http.Request) {
		if !srv.isAdmin(r) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "需要管理员权限"})
			return
		}
		var body NodeUpsertPayload
		if err := readJSON(r, &body); err != nil || body.Name == nil || strings.TrimSpace(*body.Name) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "节点名称不能为空"})
			return
		}

		id := GenerateID("node")
		rawToken := GenerateRawToken(24)
		tokenHash := HashToken(rawToken)
		tokenHint := rawToken[:6]
		now := time.Now().UnixMilli()

		region := "HK"
		if body.Region != nil && *body.Region != "" {
			region = *body.Region
		}
		flagEmoji := "🇭🇰"
		if body.Flag != nil && *body.Flag != "" {
			flagEmoji = *body.Flag
		}
		provider := ""
		if body.Provider != nil {
			provider = *body.Provider
		}
		tags := []string{}
		if body.Tags != nil {
			tags = *body.Tags
		}
		tagsJSON, _ := json.Marshal(tags)
		sortOrder := 0
		if body.SortOrder != nil {
			sortOrder = *body.SortOrder
		}
		limitGb := 1000.0
		if body.TrafficLimitGb != nil {
			limitGb = *body.TrafficLimitGb
		}
		trafficMode := "both"
		if body.TrafficMode != nil && *body.TrafficMode != "" {
			trafficMode = *body.TrafficMode
		}
		unitBase := 1024
		if body.TrafficUnitBase != nil {
			unitBase = normalizeUnitBase(*body.TrafficUnitBase, 1024)
		}
		resetDay := 1
		if body.TrafficResetDay != nil {
			resetDay = clampInt(*body.TrafficResetDay, 1, 31)
		}
		cycleKey := computeCycleKey(now, resetDay)
		price := 0.0
		if body.Price != nil {
			price = *body.Price
		}
		currency := "USD"
		if body.Currency != nil && *body.Currency != "" {
			currency = *body.Currency
		}
		billingCycle := "monthly"
		if body.BillingCycle != nil && *body.BillingCycle != "" {
			billingCycle = *body.BillingCycle
		}
		purchaseDate := ""
		if body.PurchaseDate != nil {
			purchaseDate = *body.PurchaseDate
		}
		expireDate := ""
		if body.ExpireDate != nil {
			expireDate = *body.ExpireDate
		}
		autoRenew := 0
		if body.AutoRenew != nil && *body.AutoRenew {
			autoRenew = 1
		}
		notes := ""
		if body.Notes != nil {
			notes = *body.Notes
		}

		_, err := srv.store.db.Exec(
			`INSERT INTO nodes (
				id, name, token_hash, token_hint, region, flag, provider, tags_json, sort_order,
				traffic_limit_gb, traffic_mode, traffic_unit_base, traffic_reset_day, traffic_cycle_key,
				price, currency, billing_cycle, purchase_date, expire_date, auto_renew, notes, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			id, strings.TrimSpace(*body.Name), tokenHash, tokenHint, region, flagEmoji, provider, string(tagsJSON), sortOrder,
			limitGb, trafficMode, unitBase, resetDay, cycleKey,
			price, currency, billingCycle, purchaseDate, expireDate, autoRenew, notes, now,
		)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		row, _ := srv.store.GetNodeByID(id)
		var dto *NodeDto
		if row != nil {
			d := mapNodeRow(*row, now, false)
			dto = &d
		}
		srv.hub.TriggerBroadcast()
		writeJSON(w, http.StatusOK, map[string]any{"node": dto, "rawToken": rawToken})
	})

	mux.HandleFunc("PUT /api/nodes/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !srv.isAdmin(r) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "需要管理员权限"})
			return
		}
		id := r.PathValue("id")
		existing, err := srv.store.GetNodeByID(id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if existing == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "节点不存在"})
			return
		}
		var body NodeUpsertPayload
		_ = readJSON(r, &body)

		resetDay := existing.trafficResetDay
		if body.TrafficResetDay != nil {
			resetDay = clampInt(*body.TrafficResetDay, 1, 31)
		}
		unitBase := normalizeUnitBase(existing.trafficUnitBase, 1024)
		if body.TrafficUnitBase != nil {
			unitBase = normalizeUnitBase(*body.TrafficUnitBase, unitBase)
		}

		now := time.Now().UnixMilli()
		alignedCycleKey := existing.trafficCycleKey
		if resetDay != existing.trafficResetDay || body.CalibrateRxGb != nil || body.CalibrateTxGb != nil {
			alignedCycleKey = computeCycleKey(now, resetDay)
		}
		nextRx := existing.trafficRxCycle
		nextTx := existing.trafficTxCycle
		gbBytes := math.Pow(float64(unitBase), 3)
		if body.CalibrateRxGb != nil {
			v := *body.CalibrateRxGb
			if math.IsNaN(v) || math.IsInf(v, 0) || v < 0 || v > 1_000_000 {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "校准入站流量需为 0 ~ 1,000,000 GB 之间的有效数字"})
				return
			}
			nextRx = int64(math.Round(v * gbBytes))
		}
		if body.CalibrateTxGb != nil {
			v := *body.CalibrateTxGb
			if math.IsNaN(v) || math.IsInf(v, 0) || v < 0 || v > 1_000_000 {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "校准出站流量需为 0 ~ 1,000,000 GB 之间的有效数字"})
				return
			}
			nextTx = int64(math.Round(v * gbBytes))
		}

		name := existing.name
		if body.Name != nil && strings.TrimSpace(*body.Name) != "" {
			name = strings.TrimSpace(*body.Name)
		}
		region := existing.region
		if body.Region != nil {
			region = *body.Region
		}
		flagEmoji := existing.flag
		if body.Flag != nil {
			flagEmoji = *body.Flag
		}
		provider := existing.provider
		if body.Provider != nil {
			provider = *body.Provider
		}
		tagsJSON := existing.tagsJSON
		if body.Tags != nil {
			b, _ := json.Marshal(*body.Tags)
			tagsJSON = string(b)
		}
		sortOrder := existing.sortOrder
		if body.SortOrder != nil {
			sortOrder = *body.SortOrder
		}
		limitGb := existing.trafficLimitGb
		if body.TrafficLimitGb != nil {
			limitGb = *body.TrafficLimitGb
		}
		trafficMode := existing.trafficMode
		if body.TrafficMode != nil {
			trafficMode = *body.TrafficMode
		}
		price := existing.price
		if body.Price != nil {
			price = *body.Price
		}
		currency := existing.currency
		if body.Currency != nil {
			currency = *body.Currency
		}
		billingCycle := existing.billingCycle
		if body.BillingCycle != nil {
			billingCycle = *body.BillingCycle
		}
		purchaseDate := existing.purchaseDate
		if body.PurchaseDate != nil {
			purchaseDate = *body.PurchaseDate
		}
		expireDate := existing.expireDate
		if body.ExpireDate != nil {
			expireDate = *body.ExpireDate
		}
		autoRenew := existing.autoRenew
		if body.AutoRenew != nil {
			if *body.AutoRenew {
				autoRenew = 1
			} else {
				autoRenew = 0
			}
		}
		notes := existing.notes
		if body.Notes != nil {
			notes = *body.Notes
		}

		_, err = srv.store.db.Exec(
			`UPDATE nodes SET
				name=?, region=?, flag=?, provider=?, tags_json=?, sort_order=?,
				traffic_limit_gb=?, traffic_mode=?, traffic_unit_base=?, traffic_reset_day=?,
				traffic_cycle_key=?, traffic_rx_cycle=?, traffic_tx_cycle=?,
				price=?, currency=?, billing_cycle=?, purchase_date=?, expire_date=?, auto_renew=?, notes=?
			WHERE id = ?`,
			name, region, flagEmoji, provider, tagsJSON, sortOrder,
			limitGb, trafficMode, unitBase, resetDay,
			alignedCycleKey, nextRx, nextTx,
			price, currency, billingCycle, purchaseDate, expireDate, autoRenew, notes,
			id,
		)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		updated, _ := srv.store.GetNodeByID(id)
		var dto *NodeDto
		if updated != nil {
			d := mapNodeRow(*updated, now, false)
			dto = &d
		}
		srv.hub.TriggerBroadcast()
		writeJSON(w, http.StatusOK, map[string]any{"node": dto})
	})

	mux.HandleFunc("POST /api/nodes/{id}/rotate-token", func(w http.ResponseWriter, r *http.Request) {
		if !srv.isAdmin(r) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "需要管理员权限"})
			return
		}
		id := r.PathValue("id")
		existing, _ := srv.store.GetNodeByID(id)
		if existing == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "节点不存在"})
			return
		}
		rawToken := GenerateRawToken(24)
		tokenHash := HashToken(rawToken)
		tokenHint := rawToken[:6]
		_, err := srv.store.db.Exec("UPDATE nodes SET token_hash = ?, token_hint = ? WHERE id = ?", tokenHash, tokenHint, id)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"rawToken": rawToken, "tokenHint": tokenHint})
	})

	mux.HandleFunc("DELETE /api/nodes/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !srv.isAdmin(r) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "需要管理员权限"})
			return
		}
		id := r.PathValue("id")
		_, _ = srv.store.db.Exec("DELETE FROM metrics_history WHERE node_id = ?", id)
		_, _ = srv.store.db.Exec("DELETE FROM nodes WHERE id = ?", id)
		_, _ = srv.store.db.Exec("DELETE FROM alert_state WHERE key LIKE ?", "%:"+id)
		srv.hub.TriggerBroadcast()
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})

	mux.HandleFunc("POST /api/probes", func(w http.ResponseWriter, r *http.Request) {
		if !srv.isAdmin(r) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "需要管理员权限"})
			return
		}
		var body struct {
			Name           string `json:"name"`
			Type           string `json:"type"`
			Target         string `json:"target"`
			ExpectedStatus int    `json:"expectedStatus"`
			Enabled        *bool  `json:"enabled"`
		}
		_ = readJSON(r, &body)
		if strings.TrimSpace(body.Name) == "" || strings.TrimSpace(body.Target) == "" || body.Type == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "请填写完整拨测目标信息"})
			return
		}
		if body.ExpectedStatus == 0 {
			body.ExpectedStatus = 200
		}
		enabled := 1
		if body.Enabled != nil && !*body.Enabled {
			enabled = 0
		}
		id := GenerateID("probe")
		_, err := srv.store.db.Exec(
			"INSERT INTO probe_targets (id, name, type, target, expected_status, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
			id, strings.TrimSpace(body.Name), body.Type, strings.TrimSpace(body.Target), body.ExpectedStatus, enabled, time.Now().UnixMilli(),
		)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		srv.hub.TriggerBroadcast()
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "id": id})
	})

	mux.HandleFunc("DELETE /api/probes/{id}", func(w http.ResponseWriter, r *http.Request) {
		if !srv.isAdmin(r) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "需要管理员权限"})
			return
		}
		id := r.PathValue("id")
		_, _ = srv.store.db.Exec("DELETE FROM edge_probe_history WHERE target_id = ?", id)
		_, _ = srv.store.db.Exec("DELETE FROM probe_targets WHERE id = ?", id)
		_, _ = srv.store.db.Exec("DELETE FROM alert_state WHERE key = ?", "edge:"+id)
		srv.hub.TriggerBroadcast()
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})

	mux.HandleFunc("POST /api/probes/run", func(w http.ResponseWriter, r *http.Request) {
		if !srv.isAdmin(r) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "需要管理员权限"})
			return
		}
		checked, err := RunEdgeProbes(r.Context(), srv.store, srv.alerts)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		srv.hub.TriggerBroadcast()
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "checked": checked})
	})

	mux.HandleFunc("PUT /api/settings", func(w http.ResponseWriter, r *http.Request) {
		if !srv.isAdmin(r) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "需要管理员权限"})
			return
		}
		var body struct {
			SiteTitle       *string      `json:"siteTitle"`
			SiteDomain      *string      `json:"siteDomain"`
			PublicAccess    *string      `json:"publicAccess"`
			DisplayCurrency *string      `json:"displayCurrency"`
			Alerts          *AlertConfig `json:"alerts"`
		}
		_ = readJSON(r, &body)
		updates := map[string]string{}
		if body.SiteTitle != nil {
			v := strings.TrimSpace(*body.SiteTitle)
			if v == "" {
				v = "PulseVPS"
			}
			updates["site_title"] = v
		}
		if body.SiteDomain != nil {
			v := strings.TrimSpace(*body.SiteDomain)
			if v == "" {
				v = "vps.ydiws.xyz"
			}
			updates["site_domain"] = v
		}
		if body.PublicAccess != nil {
			updates["public_access"] = *body.PublicAccess
		}
		if body.DisplayCurrency != nil {
			updates["display_currency"] = *body.DisplayCurrency
		}
		if body.Alerts != nil {
			a := body.Alerts
			updates["alert_enabled"] = boolToBit(a.Enabled)
			if a.Channel != "" {
				updates["alert_channel"] = a.Channel
			}
			updates["alert_webhook_url"] = strings.TrimSpace(a.WebhookURL)
			updates["alert_tg_token"] = strings.TrimSpace(a.TelegramToken)
			updates["alert_tg_chat_id"] = strings.TrimSpace(a.TelegramChatID)
			updates["alert_traffic_pct"] = strconv.Itoa(clampInt(a.TrafficWarnPct, 0, 100))
			updates["alert_expire_days"] = strconv.Itoa(clampInt(a.ExpireWarnDays, 0, 90))
			updates["alert_notify_offline"] = boolToBit(a.NotifyOffline)
			updates["alert_notify_edge"] = boolToBit(a.NotifyEdgeDown)
		}
		if err := srv.store.UpdateSettings(updates); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		settings, _ := srv.store.ReadSettings(true)
		if settings.PublicAccess == "private" {
			srv.hub.DisconnectUnauthenticated()
		}
		srv.hub.TriggerBroadcast()
		writeJSON(w, http.StatusOK, map[string]any{"settings": settings})
	})

	mux.HandleFunc("POST /api/alerts/test", func(w http.ResponseWriter, r *http.Request) {
		if !srv.isAdmin(r) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "需要管理员权限"})
			return
		}
		var body struct {
			Alerts *AlertConfig `json:"alerts"`
		}
		_ = readJSON(r, &body)
		cfg := body.Alerts
		if cfg == nil {
			s, _ := srv.store.ReadSettings(true)
			cfg = s.Alerts
		}
		if err := srv.alerts.Send(r.Context(), cfg, "测试通知", "这是一条来自 PulseVPS 自托管主控的测试告警，说明通知通道已配置成功。"); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
	})

	mux.HandleFunc("POST /api/agent/report", func(w http.ResponseWriter, r *http.Request) {
		rawToken := ExtractBearerToken(r)
		if rawToken == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Missing Bearer token"})
			return
		}
		node, err := srv.store.GetNodeByTokenHash(HashToken(rawToken))
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		if node == nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid node token"})
			return
		}
		var payload AgentReportPayload
		if err := readJSON(r, &payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid JSON payload"})
			return
		}
		if err := srv.store.HandleAgentReport(node, payload, ClientIPFromRequest(r)); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		srv.hub.TriggerBroadcast()
		targets, _ := srv.store.ListEnabledNodeProbes()
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":           true,
			"intervalSec":  2,
			"probeTargets": targets,
		})
	})

	mux.HandleFunc("GET /install.sh", func(w http.ResponseWriter, r *http.Request) {
		scheme := "https"
		if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
			scheme = proto
		} else if r.TLS == nil && (strings.HasPrefix(r.Host, "127.0.0.1") || strings.HasPrefix(r.Host, "localhost")) {
			scheme = "http"
		}
		serverURL := scheme + "://" + r.Host
		w.Header().Set("Content-Type", "text/x-shellscript; charset=utf-8")
		_, _ = w.Write([]byte(renderInstallScript(serverURL, srv.agentDownloadBase)))
	})

	// Fallback: static assets + SPA index.html
	fileServer := http.FileServer(http.FS(srv.webFS))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not found"})
			return
		}
		cleanPath := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if cleanPath == "" || cleanPath == "." {
			cleanPath = "index.html"
		}
		if _, err := fs.Stat(srv.webFS, cleanPath); err == nil {
			if strings.HasPrefix(cleanPath, "assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			fileServer.ServeHTTP(w, r)
			return
		}
		// SPA fallback to index.html
		indexBytes, err := fs.ReadFile(srv.webFS, "index.html")
		if err != nil {
			http.Error(w, "Frontend assets missing", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(indexBytes)
	})

	return mux
}

func boolToBit(v bool) string {
	if v {
		return "1"
	}
	return "0"
}

func clampInt(v, minV, maxV int) int {
	if v < minV {
		return minV
	}
	if v > maxV {
		return maxV
	}
	return v
}

func main() {
	addr := flag.String("addr", envOr("LISTEN_ADDR", "127.0.0.1:8080"), "HTTP listen address")
	dbPath := flag.String("db", envOr("DB_PATH", "/var/lib/pulse-vps/pulse-vps.db"), "SQLite database path")
	webDir := flag.String("web-dir", envOr("WEB_DIR", ""), "Optional external frontend dist directory (uses embedded assets if empty)")
	downloadBase := flag.String("agent-download-base", envOr("AGENT_DOWNLOAD_BASE", "https://github.com/lyd-0718/pulse-vps/releases/latest/download"), "Agent binary release download base URL")
	flag.Parse()

	store, err := OpenStore(*dbPath)
	if err != nil {
		log.Fatalf("open sqlite failed: %v", err)
	}
	defer store.Close()

	auth := NewAuthManager(os.Getenv("ADMIN_PASSWORD"), os.Getenv("JWT_SECRET"))
	hub := NewWSHub(store, auth)
	alerts := NewAlertEngine(store)

	var webFS fs.FS
	if *webDir != "" {
		abs, err := filepath.Abs(*webDir)
		if err != nil {
			log.Fatalf("invalid web-dir: %v", err)
		}
		webFS = os.DirFS(abs)
	} else {
		sub, err := fs.Sub(embeddedWebFS, "webdist")
		if err != nil {
			log.Fatalf("embedded webdist error: %v", err)
		}
		webFS = sub
	}

	srv := &Server{
		store:             store,
		auth:              auth,
		hub:               hub,
		alerts:            alerts,
		agentDownloadBase: *downloadBase,
		webFS:             webFS,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Background loop 1: Edge HTTP prober (every 2 min)
	go func() {
		time.Sleep(3 * time.Second)
		if n, err := RunEdgeProbes(ctx, store, alerts); err == nil && n > 0 {
			hub.TriggerBroadcast()
		}
		ticker := time.NewTicker(2 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if n, err := RunEdgeProbes(ctx, store, alerts); err == nil && n > 0 {
					hub.TriggerBroadcast()
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	// Background loop 2: Alert evaluator (every 30s)
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				alerts.Evaluate(ctx)
			case <-ctx.Done():
				return
			}
		}
	}()

	// Background loop 3: History pruner (every 1h)
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if err := store.PruneOldHistory(); err != nil {
					log.Printf("prune error: %v", err)
				}
			case <-ctx.Done():
				return
			}
		}
	}()

	httpServer := &http.Server{
		Addr:              *addr,
		Handler:           srv.routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = httpServer.Shutdown(shutCtx)
	}()

	log.Printf("pulse-vps-server listening on %s (db=%s)", *addr, *dbPath)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
