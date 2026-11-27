export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_PASSWORD?: string;
  JWT_SECRET?: string;
  AGENT_DOWNLOAD_BASE?: string;
}

export interface NodeRow {
  id: string;
  name: string;
  token_hash: string;
  token_hint: string;
  region: string;
  flag: string;
  provider: string;
  tags_json: string;
  sort_order: number;
  ip: string;
  ipv6: string;
  os: string;
  arch: string;
  kernel: string;
  cpu_model: string;
  cpu_cores: number;
  mem_total: number;
  swap_total: number;
  disk_total: number;
  last_seen_at: number;
  uptime: number;
  cpu_usage: number;
  load1: number;
  load5: number;
  load15: number;
  mem_used: number;
  swap_used: number;
  disk_used: number;
  net_rx_speed: number;
  net_tx_speed: number;
  net_rx_total: number;
  net_tx_total: number;
  tcp_conns: number;
  proc_count: number;
  containers_json: string;
  node_probes_json: string;
  sparkline_json: string;
  traffic_limit_gb: number;
  traffic_mode: string;
  traffic_unit_base: number;
  traffic_reset_day: number;
  traffic_cycle_key: string;
  traffic_rx_cycle: number;
  traffic_tx_cycle: number;
  last_raw_rx: number;
  last_raw_tx: number;
  price: number;
  currency: string;
  billing_cycle: string;
  purchase_date: string;
  expire_date: string;
  auto_renew: number;
  notes: string;
  last_history_at: number;
  created_at: number;
}

export interface ProbeTargetRow {
  id: string;
  name: string;
  type: string;
  target: string;
  expected_status: number;
  enabled: number;
  created_at: number;
}
