package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

const (
	onlineWindowMs    = 45_000
	historyIntervalMs = 60_000
)

type Store struct {
	db *sql.DB
}

func OpenStore(dbPath string) (*Store, error) {
	if dir := filepath.Dir(dbPath); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, err
		}
	}
	dsn := fmt.Sprintf("file:%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)", dbPath)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // SQLite single-writer safety
	db.SetMaxIdleConns(1)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`,
		`INSERT OR IGNORE INTO settings (key, value) VALUES
			('site_title', 'PulseVPS'),
			('site_domain', 'vps.ydiws.xyz'),
			('public_access', 'masked'),
			('display_currency', 'CNY'),
			('alert_enabled', '0'),
			('alert_channel', 'telegram'),
			('alert_webhook_url', ''),
			('alert_tg_token', ''),
			('alert_tg_chat_id', ''),
			('alert_traffic_pct', '85'),
			('alert_expire_days', '7'),
			('alert_notify_offline', '1'),
			('alert_notify_edge', '1')`,
		`CREATE TABLE IF NOT EXISTS nodes (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			token_hash TEXT NOT NULL UNIQUE,
			token_hint TEXT DEFAULT '',
			region TEXT DEFAULT 'HK',
			flag TEXT DEFAULT '🇭🇰',
			provider TEXT DEFAULT '',
			tags_json TEXT DEFAULT '[]',
			sort_order INTEGER DEFAULT 0,
			ip TEXT DEFAULT '',
			ipv6 TEXT DEFAULT '',
			os TEXT DEFAULT '',
			arch TEXT DEFAULT '',
			kernel TEXT DEFAULT '',
			cpu_model TEXT DEFAULT '',
			cpu_cores INTEGER DEFAULT 0,
			mem_total INTEGER DEFAULT 0,
			swap_total INTEGER DEFAULT 0,
			disk_total INTEGER DEFAULT 0,
			last_seen_at INTEGER DEFAULT 0,
			uptime INTEGER DEFAULT 0,
			cpu_usage REAL DEFAULT 0,
			load1 REAL DEFAULT 0,
			load5 REAL DEFAULT 0,
			load15 REAL DEFAULT 0,
			mem_used INTEGER DEFAULT 0,
			swap_used INTEGER DEFAULT 0,
			disk_used INTEGER DEFAULT 0,
			net_rx_speed REAL DEFAULT 0,
			net_tx_speed REAL DEFAULT 0,
			net_rx_total INTEGER DEFAULT 0,
			net_tx_total INTEGER DEFAULT 0,
			tcp_conns INTEGER DEFAULT 0,
			proc_count INTEGER DEFAULT 0,
			containers_json TEXT DEFAULT '[]',
			node_probes_json TEXT DEFAULT '[]',
			sparkline_json TEXT DEFAULT '[]',
			traffic_limit_gb REAL DEFAULT 1000,
			traffic_mode TEXT DEFAULT 'both',
			traffic_unit_base INTEGER NOT NULL DEFAULT 1024,
			traffic_reset_day INTEGER DEFAULT 1,
			traffic_cycle_key TEXT DEFAULT '',
			traffic_rx_cycle INTEGER DEFAULT 0,
			traffic_tx_cycle INTEGER DEFAULT 0,
			last_raw_rx INTEGER DEFAULT 0,
			last_raw_tx INTEGER DEFAULT 0,
			price REAL DEFAULT 0,
			currency TEXT DEFAULT 'USD',
			billing_cycle TEXT DEFAULT 'monthly',
			purchase_date TEXT DEFAULT '',
			expire_date TEXT DEFAULT '',
			auto_renew INTEGER DEFAULT 0,
			notes TEXT DEFAULT '',
			last_history_at INTEGER DEFAULT 0,
			created_at INTEGER NOT NULL,
			agent_version TEXT DEFAULT '',
			net_iface TEXT DEFAULT ''
		)`,
		`CREATE TABLE IF NOT EXISTS metrics_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			node_id TEXT NOT NULL,
			ts INTEGER NOT NULL,
			cpu REAL DEFAULT 0,
			mem_pct REAL DEFAULT 0,
			swap_pct REAL DEFAULT 0,
			disk_pct REAL DEFAULT 0,
			load1 REAL DEFAULT 0,
			rx_speed REAL DEFAULT 0,
			tx_speed REAL DEFAULT 0,
			probes_json TEXT DEFAULT '{}'
		)`,
		`CREATE INDEX IF NOT EXISTS idx_metrics_node_ts ON metrics_history(node_id, ts)`,
		`CREATE TABLE IF NOT EXISTS probe_targets (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			type TEXT NOT NULL,
			target TEXT NOT NULL,
			expected_status INTEGER DEFAULT 200,
			enabled INTEGER DEFAULT 1,
			created_at INTEGER NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS edge_probe_history (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			target_id TEXT NOT NULL,
			ts INTEGER NOT NULL,
			ok INTEGER NOT NULL,
			status_code INTEGER DEFAULT 0,
			latency_ms INTEGER DEFAULT 0,
			error TEXT DEFAULT ''
		)`,
		`CREATE INDEX IF NOT EXISTS idx_edge_probe_target_ts ON edge_probe_history(target_id, ts)`,
		`CREATE TABLE IF NOT EXISTS alert_state (
			key TEXT PRIMARY KEY,
			active INTEGER NOT NULL DEFAULT 0,
			last_notified_at INTEGER NOT NULL DEFAULT 0,
			last_value TEXT DEFAULT ''
		)`,
	}
	for _, stmt := range stmts {
		if _, err := s.db.Exec(stmt); err != nil {
			return fmt.Errorf("migrate failed: %w", err)
		}
	}

	// Idempotent column additions for databases imported from D1
	alterCols := []string{
		"ALTER TABLE nodes ADD COLUMN traffic_unit_base INTEGER NOT NULL DEFAULT 1024",
		"ALTER TABLE nodes ADD COLUMN agent_version TEXT DEFAULT ''",
		"ALTER TABLE nodes ADD COLUMN net_iface TEXT DEFAULT ''",
		"ALTER TABLE metrics_history ADD COLUMN probes_json TEXT DEFAULT '{}'",
	}
	for _, q := range alterCols {
		_, _ = s.db.Exec(q)
	}
	return nil
}

func maskIP(ip string) string {
	if ip == "" {
		return ""
	}
	if strings.Contains(ip, ":") {
		parts := strings.Split(ip, ":")
		if len(parts) >= 2 {
			return parts[0] + ":" + parts[1] + ":*:*"
		}
		return "*:*"
	}
	parts := strings.Split(ip, ".")
	if len(parts) == 4 {
		return parts[0] + "." + parts[1] + ".*.*"
	}
	return "***.***.***"
}

func daysInMonthUTC(year int, month time.Month) int {
	return time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

func computeCycleKey(nowMs int64, resetDay int) string {
	safeDay := resetDay
	if safeDay < 1 {
		safeDay = 1
	} else if safeDay > 31 {
		safeDay = 31
	}
	t := time.UnixMilli(nowMs).UTC().Add(8 * time.Hour)
	year := t.Year()
	month := t.Month()
	day := t.Day()
	effReset := safeDay
	if dim := daysInMonthUTC(year, month); effReset > dim {
		effReset = dim
	}
	if day < effReset {
		month--
		if month < time.January {
			month = time.December
			year--
		}
	}
	return fmt.Sprintf("%04d-%02d", year, int(month))
}

func normalizeUnitBase(val int, fallback int) int {
	if val == 1000 {
		return 1000
	}
	if val == 1024 {
		return 1024
	}
	return fallback
}

func computeTrafficUsed(rx, tx int64, mode string) int64 {
	switch mode {
	case "tx":
		return tx
	case "max":
		if rx > tx {
			return rx
		}
		return tx
	default:
		return rx + tx
	}
}

func parseIntDefault(s string, def int) int {
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return def
	}
	return n
}

func (s *Store) ReadSettings(includeSecrets bool) (SettingsDto, error) {
	rows, err := s.db.Query("SELECT key, value FROM settings")
	if err != nil {
		return SettingsDto{}, err
	}
	defer rows.Close()
	m := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err == nil {
			m[k] = v
		}
	}
	get := func(k, def string) string {
		if v, ok := m[k]; ok && v != "" {
			return v
		}
		return def
	}
	dto := SettingsDto{
		SiteTitle:       get("site_title", "PulseVPS"),
		SiteDomain:      get("site_domain", "vps.ydiws.xyz"),
		PublicAccess:    get("public_access", "private"),
		DisplayCurrency: get("display_currency", "CNY"),
	}
	if includeSecrets {
		dto.Alerts = &AlertConfig{
			Enabled:        m["alert_enabled"] == "1",
			Channel:        get("alert_channel", "telegram"),
			WebhookURL:     m["alert_webhook_url"],
			TelegramToken:  m["alert_tg_token"],
			TelegramChatID: m["alert_tg_chat_id"],
			TrafficWarnPct: parseIntDefault(m["alert_traffic_pct"], 85),
			ExpireWarnDays: parseIntDefault(m["alert_expire_days"], 7),
			NotifyOffline:  m["alert_notify_offline"] != "0",
			NotifyEdgeDown: m["alert_notify_edge"] != "0",
		}
	}
	return dto, nil
}

func (s *Store) GetSetting(key string) string {
	var val string
	if err := s.db.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&val); err != nil {
		return ""
	}
	return val
}

func (s *Store) UpdateSettings(updates map[string]string) error {
	if len(updates) == 0 {
		return nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	defer stmt.Close()
	for k, v := range updates {
		if _, err := stmt.Exec(k, v); err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

type nodeRow struct {
	id, name, tokenHash, tokenHint, region, flag, provider, tagsJSON string
	sortOrder                                                        int
	ip, ipv6, osName, arch, kernel, agentVersion, netIface, cpuModel string
	cpuCores                                                         int
	memTotal, swapTotal, diskTotal                                   int64
	lastSeenAt, uptime                                               int64
	cpuUsage, load1, load5, load15                                   float64
	memUsed, swapUsed, diskUsed                                      int64
	netRxSpeed, netTxSpeed                                           float64
	netRxTotal, netTxTotal                                           int64
	tcpConns, procCount                                              int
	containersJSON, nodeProbesJSON, sparklineJSON                    string
	trafficLimitGb                                                   float64
	trafficMode                                                      string
	trafficUnitBase, trafficResetDay                                 int
	trafficCycleKey                                                  string
	trafficRxCycle, trafficTxCycle, lastRawRx, lastRawTx             int64
	price                                                            float64
	currency, billingCycle, purchaseDate, expireDate                 string
	autoRenew                                                        int
	notes                                                            string
	lastHistoryAt, createdAt                                         int64
}

const nodeSelectCols = `
	id, name, token_hash, COALESCE(token_hint,''), COALESCE(region,'HK'), COALESCE(flag,'🇭🇰'),
	COALESCE(provider,''), COALESCE(tags_json,'[]'), COALESCE(sort_order,0),
	COALESCE(ip,''), COALESCE(ipv6,''), COALESCE(os,''), COALESCE(arch,''), COALESCE(kernel,''),
	COALESCE(agent_version,''), COALESCE(net_iface,''), COALESCE(cpu_model,''), COALESCE(cpu_cores,0),
	COALESCE(mem_total,0), COALESCE(swap_total,0), COALESCE(disk_total,0),
	COALESCE(last_seen_at,0), COALESCE(uptime,0), COALESCE(cpu_usage,0),
	COALESCE(load1,0), COALESCE(load5,0), COALESCE(load15,0),
	COALESCE(mem_used,0), COALESCE(swap_used,0), COALESCE(disk_used,0),
	COALESCE(net_rx_speed,0), COALESCE(net_tx_speed,0), COALESCE(net_rx_total,0), COALESCE(net_tx_total,0),
	COALESCE(tcp_conns,0), COALESCE(proc_count,0),
	COALESCE(containers_json,'[]'), COALESCE(node_probes_json,'[]'), COALESCE(sparkline_json,'[]'),
	COALESCE(traffic_limit_gb,1000), COALESCE(traffic_mode,'both'), COALESCE(traffic_unit_base,1024),
	COALESCE(traffic_reset_day,1), COALESCE(traffic_cycle_key,''),
	COALESCE(traffic_rx_cycle,0), COALESCE(traffic_tx_cycle,0),
	COALESCE(last_raw_rx,0), COALESCE(last_raw_tx,0),
	COALESCE(price,0), COALESCE(currency,'USD'), COALESCE(billing_cycle,'monthly'),
	COALESCE(purchase_date,''), COALESCE(expire_date,''), COALESCE(auto_renew,0), COALESCE(notes,''),
	COALESCE(last_history_at,0), created_at`

func scanNodeRow(scanner interface{ Scan(dest ...any) error }) (nodeRow, error) {
	var r nodeRow
	err := scanner.Scan(
		&r.id, &r.name, &r.tokenHash, &r.tokenHint, &r.region, &r.flag,
		&r.provider, &r.tagsJSON, &r.sortOrder,
		&r.ip, &r.ipv6, &r.osName, &r.arch, &r.kernel,
		&r.agentVersion, &r.netIface, &r.cpuModel, &r.cpuCores,
		&r.memTotal, &r.swapTotal, &r.diskTotal,
		&r.lastSeenAt, &r.uptime, &r.cpuUsage,
		&r.load1, &r.load5, &r.load15,
		&r.memUsed, &r.swapUsed, &r.diskUsed,
		&r.netRxSpeed, &r.netTxSpeed, &r.netRxTotal, &r.netTxTotal,
		&r.tcpConns, &r.procCount,
		&r.containersJSON, &r.nodeProbesJSON, &r.sparklineJSON,
		&r.trafficLimitGb, &r.trafficMode, &r.trafficUnitBase,
		&r.trafficResetDay, &r.trafficCycleKey,
		&r.trafficRxCycle, &r.trafficTxCycle,
		&r.lastRawRx, &r.lastRawTx,
		&r.price, &r.currency, &r.billingCycle,
		&r.purchaseDate, &r.expireDate, &r.autoRenew, &r.notes,
		&r.lastHistoryAt, &r.createdAt,
	)
	return r, err
}

func mapNodeRow(r nodeRow, serverTime int64, maskPrivate bool) NodeDto {
	online := r.lastSeenAt > 0 && serverTime-r.lastSeenAt <= onlineWindowMs
	tags := []string{}
	_ = json.Unmarshal([]byte(r.tagsJSON), &tags)
	containers := []ContainerInfo{}
	_ = json.Unmarshal([]byte(r.containersJSON), &containers)
	nodeProbes := []NodeProbeResult{}
	_ = json.Unmarshal([]byte(r.nodeProbesJSON), &nodeProbes)
	sparkline := []SparkPoint{}
	_ = json.Unmarshal([]byte(r.sparklineJSON), &sparkline)

	ip := r.ip
	ipv6 := r.ipv6
	notes := r.notes
	if maskPrivate {
		ip = maskIP(ip)
		ipv6 = maskIP(ipv6)
		notes = ""
	}
	rxSpeed := 0.0
	txSpeed := 0.0
	if online {
		rxSpeed = r.netRxSpeed
		txSpeed = r.netTxSpeed
	}
	return NodeDto{
		ID:              r.id,
		Name:            r.name,
		TokenHint:       r.tokenHint,
		Region:          r.region,
		Flag:            r.flag,
		Provider:        r.provider,
		Tags:            tags,
		SortOrder:       r.sortOrder,
		Online:          online,
		LastSeenAt:      r.lastSeenAt,
		Uptime:          r.uptime,
		IP:              ip,
		IPv6:            ipv6,
		OS:              r.osName,
		Arch:            r.arch,
		Kernel:          r.kernel,
		AgentVersion:    r.agentVersion,
		NetIface:        r.netIface,
		CPUModel:        r.cpuModel,
		CPUCores:        r.cpuCores,
		MemTotal:        r.memTotal,
		SwapTotal:       r.swapTotal,
		DiskTotal:       r.diskTotal,
		CPUUsage:        r.cpuUsage,
		Load1:           r.load1,
		Load5:           r.load5,
		Load15:          r.load15,
		MemUsed:         r.memUsed,
		SwapUsed:        r.swapUsed,
		DiskUsed:        r.diskUsed,
		NetRxSpeed:      rxSpeed,
		NetTxSpeed:      txSpeed,
		NetRxTotal:      r.netRxTotal,
		NetTxTotal:      r.netTxTotal,
		TCPConns:        r.tcpConns,
		ProcCount:       r.procCount,
		Containers:      containers,
		NodeProbes:      nodeProbes,
		Sparkline:       sparkline,
		TrafficLimitGb:  r.trafficLimitGb,
		TrafficMode:     r.trafficMode,
		TrafficUnitBase: normalizeUnitBase(r.trafficUnitBase, 1024),
		TrafficResetDay: r.trafficResetDay,
		TrafficCycleKey: r.trafficCycleKey,
		TrafficRxCycle:  r.trafficRxCycle,
		TrafficTxCycle:  r.trafficTxCycle,
		TrafficUsedByte: computeTrafficUsed(r.trafficRxCycle, r.trafficTxCycle, r.trafficMode),
		Price:           r.price,
		Currency:        r.currency,
		BillingCycle:    r.billingCycle,
		PurchaseDate:    r.purchaseDate,
		ExpireDate:      r.expireDate,
		AutoRenew:       r.autoRenew == 1,
		Notes:           notes,
	}
}

func (s *Store) ListNodesRaw() ([]nodeRow, error) {
	rows, err := s.db.Query("SELECT " + nodeSelectCols + " FROM nodes ORDER BY sort_order ASC, created_at ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []nodeRow
	for rows.Next() {
		r, err := scanNodeRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, nil
}

func (s *Store) GetNodeByID(id string) (*nodeRow, error) {
	row := s.db.QueryRow("SELECT "+nodeSelectCols+" FROM nodes WHERE id = ?", id)
	r, err := scanNodeRow(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (s *Store) GetNodeByTokenHash(hash string) (*nodeRow, error) {
	row := s.db.QueryRow("SELECT "+nodeSelectCols+" FROM nodes WHERE token_hash = ?", hash)
	r, err := scanNodeRow(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func (s *Store) ListProbeTargets() ([]ProbeTargetDto, error) {
	rows, err := s.db.Query("SELECT id, name, type, target, expected_status, enabled FROM probe_targets ORDER BY created_at ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ProbeTargetDto{}
	for rows.Next() {
		var t ProbeTargetDto
		var enabled int
		if err := rows.Scan(&t.ID, &t.Name, &t.Type, &t.Target, &t.ExpectedStatus, &enabled); err != nil {
			return nil, err
		}
		t.Enabled = enabled == 1
		out = append(out, t)
	}
	return out, nil
}

func (s *Store) ListEnabledNodeProbes() ([]ProbeTargetDto, error) {
	rows, err := s.db.Query("SELECT id, name, type, target, expected_status FROM probe_targets WHERE enabled = 1 AND type IN ('tcp_node', 'http_node') ORDER BY created_at ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []ProbeTargetDto{}
	for rows.Next() {
		var t ProbeTargetDto
		t.Enabled = true
		if err := rows.Scan(&t.ID, &t.Name, &t.Type, &t.Target, &t.ExpectedStatus); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, nil
}

func (s *Store) BuildBootstrap(authenticated bool) (BootstrapResponse, error) {
	now := time.Now().UnixMilli()
	settings, err := s.ReadSettings(authenticated)
	if err != nil {
		return BootstrapResponse{}, err
	}
	if settings.PublicAccess == "private" && !authenticated {
		return BootstrapResponse{
			Settings:         settings,
			Authenticated:    false,
			RequiresAuth:     true,
			ServerTime:       now,
			ServerMode:       "selfhost",
			Nodes:            []NodeDto{},
			ProbeTargets:     []ProbeTargetDto{},
			EdgeProbeHistory: map[string][]EdgeProbeRecord{},
		}, nil
	}

	rawNodes, err := s.ListNodesRaw()
	if err != nil {
		return BootstrapResponse{}, err
	}
	maskPrivate := !authenticated && settings.PublicAccess == "masked"
	nodes := make([]NodeDto, 0, len(rawNodes))
	for _, r := range rawNodes {
		nodes = append(nodes, mapNodeRow(r, now, maskPrivate))
	}

	targets, err := s.ListProbeTargets()
	if err != nil {
		return BootstrapResponse{}, err
	}

	edgeHistory := map[string][]EdgeProbeRecord{}
	rows, err := s.db.Query(
		"SELECT target_id, ts, ok, status_code, latency_ms, COALESCE(error,'') FROM edge_probe_history WHERE ts >= ? ORDER BY ts ASC",
		now-24*3600_000,
	)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var tid, errStr string
			var ts, lat int64
			var okInt, code int
			if err := rows.Scan(&tid, &ts, &okInt, &code, &lat, &errStr); err == nil {
				edgeHistory[tid] = append(edgeHistory[tid], EdgeProbeRecord{
					Ts:         ts,
					OK:         okInt == 1,
					StatusCode: code,
					LatencyMs:  lat,
					Error:      errStr,
				})
			}
		}
	}
	for k, arr := range edgeHistory {
		if len(arr) > 48 {
			edgeHistory[k] = arr[len(arr)-48:]
		}
	}

	return BootstrapResponse{
		Settings:         settings,
		Authenticated:    authenticated,
		ServerTime:       now,
		ServerMode:       "selfhost",
		Nodes:            nodes,
		ProbeTargets:     targets,
		EdgeProbeHistory: edgeHistory,
	}, nil
}

func summarizeProbes(probes []NodeProbeResult) *ProbeSummary {
	if len(probes) == 0 {
		return nil
	}
	type agg struct {
		sumMs   float64
		okCnt   int
		sumLoss float64
		total   int
	}
	ct, cu, cm := &agg{}, &agg{}, &agg{}
	for _, p := range probes {
		comb := strings.ToLower(p.Name + " " + p.Target)
		var bucket *agg
		switch {
		case strings.Contains(comb, "电信") || strings.Contains(comb, "-ct-"):
			bucket = ct
		case strings.Contains(comb, "联通") || strings.Contains(comb, "-cu-"):
			bucket = cu
		case strings.Contains(comb, "移动") || strings.Contains(comb, "-cm-"):
			bucket = cm
		default:
			continue
		}
		bucket.total++
		bucket.sumLoss += p.LossPct
		if p.OK {
			bucket.okCnt++
			bucket.sumMs += p.LatencyMs
		}
	}
	round1 := func(v float64) *float64 {
		r := math.Round(v*10) / 10
		return &r
	}
	out := &ProbeSummary{}
	hasAny := false
	if ct.total > 0 {
		hasAny = true
		out.CTLoss = round1(ct.sumLoss / float64(ct.total))
		if ct.okCnt > 0 {
			out.CTMs = round1(ct.sumMs / float64(ct.okCnt))
		}
	}
	if cu.total > 0 {
		hasAny = true
		out.CULoss = round1(cu.sumLoss / float64(cu.total))
		if cu.okCnt > 0 {
			out.CUMs = round1(cu.sumMs / float64(cu.okCnt))
		}
	}
	if cm.total > 0 {
		hasAny = true
		out.CMLoss = round1(cm.sumLoss / float64(cm.total))
		if cm.okCnt > 0 {
			out.CMMs = round1(cm.sumMs / float64(cm.okCnt))
		}
	}
	if !hasAny {
		return nil
	}
	return out
}

func (s *Store) GetNodeHistory(nodeID, rangeKey string) ([]HistoryPoint, error) {
	windowMs := int64(3600_000)
	switch rangeKey {
	case "6h":
		windowMs = 6 * 3600_000
	case "24h":
		windowMs = 24 * 3600_000
	case "7d":
		windowMs = 7 * 24 * 3600_000
	case "30d":
		windowMs = 30 * 24 * 3600_000
	}
	cutoff := time.Now().UnixMilli() - windowMs
	rows, err := s.db.Query(
		`SELECT ts, cpu, mem_pct, swap_pct, disk_pct, load1, rx_speed, tx_speed, COALESCE(probes_json,'{}')
		 FROM metrics_history WHERE node_id = ? AND ts >= ? ORDER BY ts ASC`,
		nodeID, cutoff,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var all []HistoryPoint
	for rows.Next() {
		var p HistoryPoint
		var probesRaw string
		if err := rows.Scan(&p.Ts, &p.CPU, &p.MemPct, &p.SwapPct, &p.DiskPct, &p.Load1, &p.RxSpeed, &p.TxSpeed, &probesRaw); err != nil {
			return nil, err
		}
		if probesRaw != "" && probesRaw != "{}" {
			var ps ProbeSummary
			if err := json.Unmarshal([]byte(probesRaw), &ps); err == nil {
				if ps.CTMs != nil || ps.CUMs != nil || ps.CMMs != nil || ps.CTLoss != nil || ps.CULoss != nil || ps.CMLoss != nil {
					p.Probes = &ps
				}
			}
		}
		all = append(all, p)
	}

	const maxPoints = 200
	if len(all) <= maxPoints {
		if all == nil {
			return []HistoryPoint{}, nil
		}
		return all, nil
	}
	sampled := make([]HistoryPoint, 0, maxPoints)
	step := float64(len(all)-1) / float64(maxPoints-1)
	for i := 0; i < maxPoints; i++ {
		idx := int(math.Round(float64(i) * step))
		if idx >= len(all) {
			idx = len(all) - 1
		}
		sampled = append(sampled, all[idx])
	}
	return sampled, nil
}

func (s *Store) HandleAgentReport(node *nodeRow, payload AgentReportPayload, remoteIP string) error {
	now := time.Now().UnixMilli()
	cycleKey := computeCycleKey(now, node.trafficResetDay)
	rawRx := payload.NetRxTotal
	if rawRx < 0 {
		rawRx = 0
	}
	rawTx := payload.NetTxTotal
	if rawTx < 0 {
		rawTx = 0
	}

	rxCycle := node.trafficRxCycle
	txCycle := node.trafficTxCycle
	if node.trafficCycleKey != cycleKey {
		rxCycle = 0
		txCycle = 0
	} else if node.lastSeenAt > 0 {
		var deltaRx, deltaTx int64
		if rawRx >= node.lastRawRx {
			deltaRx = rawRx - node.lastRawRx
		} else {
			deltaRx = rawRx
		}
		if rawTx >= node.lastRawTx {
			deltaTx = rawTx - node.lastRawTx
		} else {
			deltaTx = rawTx
		}
		rxCycle += deltaRx
		txCycle += deltaTx
	}

	spark := []SparkPoint{}
	_ = json.Unmarshal([]byte(node.sparklineJSON), &spark)
	cpuVal := math.Round(payload.CPUUsage*10) / 10
	rxSpeed := math.Max(0, payload.NetRxSpeed)
	txSpeed := math.Max(0, payload.NetTxSpeed)
	// Append to sparkline at most once every 10s so 2s heartbeats still span ~4 minutes
	shouldPushSpark := len(spark) == 0
	if !shouldPushSpark {
		if lastTs, ok := spark[len(spark)-1][0].(float64); !ok || now-int64(lastTs) >= 10_000 {
			shouldPushSpark = true
		}
	}
	if shouldPushSpark {
		spark = append(spark, SparkPoint{now, cpuVal, math.Round(rxSpeed), math.Round(txSpeed)})
		if len(spark) > 24 {
			spark = spark[len(spark)-24:]
		}
	}

	memTotal := payload.MemTotal
	if memTotal == 0 {
		memTotal = node.memTotal
	}
	swapTotal := payload.SwapTotal
	if swapTotal == 0 {
		swapTotal = node.swapTotal
	}
	diskTotal := payload.DiskTotal
	if diskTotal == 0 {
		diskTotal = node.diskTotal
	}
	clientIP := payload.IP
	if clientIP == "" {
		clientIP = remoteIP
	}
	if clientIP == "" {
		clientIP = node.ip
	}
	osName := payload.OS
	if osName == "" {
		osName = node.osName
	}
	arch := payload.Arch
	if arch == "" {
		arch = node.arch
	}
	kernel := payload.Kernel
	if kernel == "" {
		kernel = node.kernel
	}
	agentVer := payload.AgentVersion
	if agentVer == "" {
		agentVer = node.agentVersion
	}
	netIface := payload.NetIface
	if netIface == "" {
		netIface = node.netIface
	}
	cpuModel := payload.CPUModel
	if cpuModel == "" {
		cpuModel = node.cpuModel
	}
	cpuCores := payload.CPUCores
	if cpuCores == 0 {
		cpuCores = node.cpuCores
	}
	ipv6 := payload.IPv6
	if ipv6 == "" {
		ipv6 = node.ipv6
	}

	containersJSON, _ := json.Marshal(payload.Containers)
	if payload.Containers == nil {
		containersJSON = []byte("[]")
	}
	// Preserve previous probes if the fast 2s tick didn't include a probe list yet
	probesForSave := payload.Probes
	var probesJSON []byte
	if len(probesForSave) > 0 {
		probesJSON, _ = json.Marshal(probesForSave)
	} else {
		probesJSON = []byte(node.nodeProbesJSON)
		if len(probesJSON) == 0 {
			probesJSON = []byte("[]")
		}
		_ = json.Unmarshal(probesJSON, &probesForSave)
	}
	sparkJSON, _ := json.Marshal(spark)

	shouldInsertHistory := now-node.lastHistoryAt >= historyIntervalMs
	newLastHistoryAt := node.lastHistoryAt
	if shouldInsertHistory {
		newLastHistoryAt = now
	}

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	_, err = tx.Exec(
		`UPDATE nodes SET
			ip=?, ipv6=?, os=?, arch=?, kernel=?, agent_version=?, net_iface=?, cpu_model=?, cpu_cores=?,
			mem_total=?, swap_total=?, disk_total=?,
			last_seen_at=?, uptime=?, cpu_usage=?, load1=?, load5=?, load15=?,
			mem_used=?, swap_used=?, disk_used=?,
			net_rx_speed=?, net_tx_speed=?, net_rx_total=?, net_tx_total=?,
			tcp_conns=?, proc_count=?,
			containers_json=?, node_probes_json=?, sparkline_json=?,
			traffic_cycle_key=?, traffic_rx_cycle=?, traffic_tx_cycle=?,
			last_raw_rx=?, last_raw_tx=?, last_history_at=?
		WHERE id = ?`,
		clientIP, ipv6, osName, arch, kernel, agentVer, netIface, cpuModel, cpuCores,
		memTotal, swapTotal, diskTotal,
		now, payload.Uptime, cpuVal,
		math.Round(payload.Load1*100)/100, math.Round(payload.Load5*100)/100, math.Round(payload.Load15*100)/100,
		payload.MemUsed, payload.SwapUsed, payload.DiskUsed,
		rxSpeed, txSpeed, rawRx, rawTx,
		payload.TCPConns, payload.ProcCount,
		string(containersJSON), string(probesJSON), string(sparkJSON),
		cycleKey, rxCycle, txCycle,
		rawRx, rawTx, newLastHistoryAt,
		node.id,
	)
	if err != nil {
		_ = tx.Rollback()
		return err
	}

	if shouldInsertHistory {
		memPct := 0.0
		if memTotal > 0 {
			memPct = math.Round((float64(payload.MemUsed)/float64(memTotal))*1000) / 10
		}
		swapPct := 0.0
		if swapTotal > 0 {
			swapPct = math.Round((float64(payload.SwapUsed)/float64(swapTotal))*1000) / 10
		}
		diskPct := 0.0
		if diskTotal > 0 {
			diskPct = math.Round((float64(payload.DiskUsed)/float64(diskTotal))*1000) / 10
		}
		summaryBytes := []byte("{}")
		if summary := summarizeProbes(probesForSave); summary != nil {
			summaryBytes, _ = json.Marshal(summary)
		}
		_, err = tx.Exec(
			`INSERT INTO metrics_history (node_id, ts, cpu, mem_pct, swap_pct, disk_pct, load1, rx_speed, tx_speed, probes_json)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			node.id, now, cpuVal, memPct, swapPct, diskPct,
			math.Round(payload.Load1*100)/100, rxSpeed, txSpeed, string(summaryBytes),
		)
		if err != nil {
			_ = tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) PruneOldHistory() error {
	now := time.Now().UnixMilli()
	metricsCutoff := now - 30*24*3600_000
	edgeCutoff := now - 14*24*3600_000
	if _, err := s.db.Exec("DELETE FROM metrics_history WHERE ts < ?", metricsCutoff); err != nil {
		return err
	}
	if _, err := s.db.Exec("DELETE FROM edge_probe_history WHERE ts < ?", edgeCutoff); err != nil {
		return err
	}
	_, _ = s.db.Exec("PRAGMA wal_checkpoint(TRUNCATE)")
	return nil
}
