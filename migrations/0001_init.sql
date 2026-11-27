-- PulseVPS D1 Schema (Cloudflare Free Tier Optimized)

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('site_title', 'PulseVPS'),
  ('site_domain', 'vps.ydiws.xyz'),
  ('public_access', 'masked'),
  ('display_currency', 'CNY');

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT DEFAULT '',
  region TEXT DEFAULT 'HK',
  flag TEXT DEFAULT '🇭🇰',
  provider TEXT DEFAULT '',
  tags_json TEXT DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,

  -- Static / Hardware specs
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

  -- Live snapshot updated on heartbeat
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

  -- Monthly traffic quota & cycle accounting
  traffic_limit_gb REAL DEFAULT 1000,
  traffic_mode TEXT DEFAULT 'both',
  traffic_reset_day INTEGER DEFAULT 1,
  traffic_cycle_key TEXT DEFAULT '',
  traffic_rx_cycle INTEGER DEFAULT 0,
  traffic_tx_cycle INTEGER DEFAULT 0,
  last_raw_rx INTEGER DEFAULT 0,
  last_raw_tx INTEGER DEFAULT 0,

  -- Asset & Billing
  price REAL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  billing_cycle TEXT DEFAULT 'monthly',
  purchase_date TEXT DEFAULT '',
  expire_date TEXT DEFAULT '',
  auto_renew INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',

  last_history_at INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS metrics_history (
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
);

CREATE INDEX IF NOT EXISTS idx_metrics_node_ts ON metrics_history(node_id, ts);

CREATE TABLE IF NOT EXISTS probe_targets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  target TEXT NOT NULL,
  expected_status INTEGER DEFAULT 200,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO probe_targets (id, name, type, target, expected_status, enabled, created_at) VALUES
  ('edge-cf', 'Cloudflare Edge DNS', 'http_edge', 'https://1.1.1.1/cdn-cgi/trace', 200, 1, 1764100000000),
  ('edge-sub', '订阅聚合站 (sub.ydiws.xyz)', 'http_edge', 'https://sub.ydiws.xyz', 200, 1, 1764100000050),
  ('tcp-ct', '广东电信', 'tcp_node', 'gd-ct-v4.ip.zstaticcdn.com:80', 200, 1, 1764100000100),
  ('tcp-cu', '广东联通', 'tcp_node', 'gd-cu-v4.ip.zstaticcdn.com:80', 200, 1, 1764100000200),
  ('tcp-cm', '广东移动', 'tcp_node', 'gd-cm-v4.ip.zstaticcdn.com:80', 200, 1, 1764100000300),
  ('tcp-google', 'Google Anycast DNS (8.8.8.8)', 'tcp_node', '8.8.8.8:53', 200, 1, 1764100000400);

CREATE TABLE IF NOT EXISTS edge_probe_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  status_code INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  error TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_edge_probe_target_ts ON edge_probe_history(target_id, ts);
