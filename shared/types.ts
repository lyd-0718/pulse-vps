export type PublicAccessMode = "masked" | "private";
export type TrafficMode = "both" | "tx" | "max";
export type BillingCycle = "monthly" | "quarterly" | "semiannual" | "annual";
export type CurrencyCode = "CNY" | "USD" | "EUR";
export type ProbeType = "http_edge" | "tcp_node" | "http_node";

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  cpuPct: number;
  memUsed: number;
  memLimit: number;
}

export interface NodeProbeResult {
  targetId: string;
  name: string;
  type: ProbeType;
  target: string;
  ok: boolean;
  latencyMs: number;
  lossPct: number;
  statusCode?: number;
  ts: number;
}

/** [tsMs, cpuPct, rxBytesPerSec, txBytesPerSec] */
export type SparkPoint = [number, number, number, number];

export interface NodeDto {
  id: string;
  name: string;
  tokenHint: string;
  region: string;
  flag: string;
  provider: string;
  tags: string[];
  sortOrder: number;

  online: boolean;
  lastSeenAt: number;
  uptime: number;

  ip: string;
  ipv6: string;
  os: string;
  arch: string;
  kernel: string;
  cpuModel: string;
  cpuCores: number;
  memTotal: number;
  swapTotal: number;
  diskTotal: number;

  cpuUsage: number;
  load1: number;
  load5: number;
  load15: number;
  memUsed: number;
  swapUsed: number;
  diskUsed: number;
  netRxSpeed: number;
  netTxSpeed: number;
  netRxTotal: number;
  netTxTotal: number;
  tcpConns: number;
  procCount: number;

  containers: ContainerInfo[];
  nodeProbes: NodeProbeResult[];
  sparkline: SparkPoint[];

  trafficLimitGb: number;
  trafficMode: TrafficMode;
  trafficResetDay: number;
  trafficCycleKey: string;
  trafficRxCycle: number;
  trafficTxCycle: number;
  trafficUsedBytes: number;

  price: number;
  currency: CurrencyCode;
  billingCycle: BillingCycle;
  purchaseDate: string;
  expireDate: string;
  autoRenew: boolean;
  notes: string;
}

export interface HistoryPoint {
  ts: number;
  cpu: number;
  memPct: number;
  swapPct: number;
  diskPct: number;
  load1: number;
  rxSpeed: number;
  txSpeed: number;
}

export interface ProbeTargetDto {
  id: string;
  name: string;
  type: ProbeType;
  target: string;
  expectedStatus: number;
  enabled: boolean;
}

export interface EdgeProbeRecord {
  ts: number;
  ok: boolean;
  statusCode: number;
  latencyMs: number;
  error?: string;
}

export interface SettingsDto {
  siteTitle: string;
  siteDomain: string;
  publicAccess: PublicAccessMode;
  displayCurrency: CurrencyCode;
}

export interface BootstrapResponse {
  settings: SettingsDto;
  authenticated: boolean;
  requiresAuth?: boolean;
  serverTime: number;
  nodes: NodeDto[];
  probeTargets: ProbeTargetDto[];
  edgeProbeHistory: Record<string, EdgeProbeRecord[]>;
}

export interface AgentReportPayload {
  ip?: string;
  ipv6?: string;
  os?: string;
  arch?: string;
  kernel?: string;
  cpuModel?: string;
  cpuCores?: number;
  memTotal?: number;
  swapTotal?: number;
  diskTotal?: number;
  uptime?: number;
  cpuUsage?: number;
  load1?: number;
  load5?: number;
  load15?: number;
  memUsed?: number;
  swapUsed?: number;
  diskUsed?: number;
  netRxSpeed?: number;
  netTxSpeed?: number;
  netRxTotal?: number;
  netTxTotal?: number;
  tcpConns?: number;
  procCount?: number;
  containers?: ContainerInfo[];
  probes?: NodeProbeResult[];
}
