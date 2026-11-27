import type {
  BootstrapResponse,
  EdgeProbeRecord,
  HistoryPoint,
  NodeDto,
  ProbeTargetDto,
  SparkPoint,
} from "../../shared/types";

function dateDaysFromNow(daysOffset: number): string {
  const d = new Date(Date.now() + daysOffset * 86400_000);
  return d.toISOString().slice(0, 10);
}

function makeSparkline(baseCpu: number, baseRx: number, baseTx: number, now: number): SparkPoint[] {
  const pts: SparkPoint[] = [];
  for (let i = 23; i >= 0; i--) {
    const wave = Math.sin(i * 0.55) * 0.18 + Math.cos(i * 0.9) * 0.1;
    const cpu = Math.max(2, Math.min(99, Number((baseCpu * (1 + wave)).toFixed(1))));
    const rx = Math.max(12_000, Math.round(baseRx * (1 + wave * 1.4)));
    const tx = Math.max(18_000, Math.round(baseTx * (1 - wave * 1.2)));
    pts.push([now - i * 15_000, cpu, rx, tx]);
  }
  return pts;
}

function makeEdgeBars(baseMs: number, failIndices: number[], slowIndices: number[], now: number): EdgeProbeRecord[] {
  const out: EdgeProbeRecord[] = [];
  for (let i = 44; i >= 0; i--) {
    const idx = 44 - i;
    const isFail = failIndices.includes(idx);
    const isSlow = slowIndices.includes(idx);
    const jitter = Math.round(Math.sin(idx * 0.8) * (baseMs * 0.25));
    const latency = isFail ? 0 : isSlow ? baseMs * 4 + 280 : Math.max(8, baseMs + jitter);
    out.push({
      ts: now - i * 120_000,
      ok: !isFail,
      statusCode: isFail ? 522 : 200,
      latencyMs: latency,
      error: isFail ? "Connection timeout" : undefined,
    });
  }
  return out;
}

export function createDemoBootstrap(): BootstrapResponse {
  const now = Date.now();
  const cycleKey = new Date(now + 8 * 3600_000).toISOString().slice(0, 7);

  const probeTargets: ProbeTargetDto[] = [
    { id: "edge-sub", name: "订阅聚合站 (sub.ydiws.xyz)", type: "http_edge", target: "https://sub.ydiws.xyz", expectedStatus: 200, enabled: true },
    { id: "edge-vps", name: "监控主控面板 (vps.ydiws.xyz)", type: "http_edge", target: "https://vps.ydiws.xyz", expectedStatus: 200, enabled: true },
    { id: "edge-api", name: "个人 API 网关 (api.ydiws.xyz)", type: "http_edge", target: "https://api.ydiws.xyz/health", expectedStatus: 200, enabled: true },
    { id: "edge-gh", name: "GitHub Release 节点源", type: "http_edge", target: "https://github.com", expectedStatus: 200, enabled: true },
    { id: "tcp-ct", name: "广东电信 DNS", type: "tcp_node", target: "202.96.128.86:53", expectedStatus: 200, enabled: true },
    { id: "tcp-cu", name: "上海联通骨干", type: "tcp_node", target: "210.22.97.1:53", expectedStatus: 200, enabled: true },
    { id: "tcp-cm", name: "香港移动出口", type: "tcp_node", target: "223.120.2.1:53", expectedStatus: 200, enabled: true },
    { id: "tcp-gg", name: "Google Anycast", type: "tcp_node", target: "8.8.8.8:53", expectedStatus: 200, enabled: true },
  ];

  const nodes: NodeDto[] = [
    {
      id: "demo-hk-dmit",
      name: "HK-DMIT-Pro",
      tokenHint: "demo01",
      region: "香港",
      flag: "🇭🇰",
      provider: "DMIT",
      tags: ["BGP主力", "亚太枢纽"],
      sortOrder: 1,
      online: true,
      lastSeenAt: now - 3000,
      uptime: 46 * 86400 + 14 * 3600,
      ip: "154.17.*.*",
      ipv6: "2404:c1c0:*:*",
      os: "Debian 12.8",
      arch: "amd64",
      kernel: "6.1.0-26-amd64",
      cpuModel: "AMD EPYC 7402P",
      cpuCores: 2,
      memTotal: 2 * 1024 ** 3,
      swapTotal: 1024 ** 3,
      diskTotal: 40 * 1024 ** 3,
      cpuUsage: 22.4,
      load1: 0.42,
      load5: 0.38,
      load15: 0.35,
      memUsed: Math.round(1.16 * 1024 ** 3),
      swapUsed: Math.round(112 * 1024 ** 2),
      diskUsed: Math.round(17.6 * 1024 ** 3),
      netRxSpeed: 2_840_000,
      netTxSpeed: 4_620_000,
      netRxTotal: 196 * 1024 ** 3,
      netTxTotal: 232 * 1024 ** 3,
      tcpConns: 184,
      procCount: 112,
      containers: [
        { id: "9f31a21b8c10", name: "xray-core", image: "ghcr.io/xtls/xray-core:latest", state: "running", status: "Up 46 days", cpuPct: 8.4, memUsed: 146 * 1024 ** 2, memLimit: 512 * 1024 ** 2 },
        { id: "4a18d771c922", name: "caddy-edge", image: "caddy:2.8-alpine", state: "running", status: "Up 46 days", cpuPct: 2.1, memUsed: 64 * 1024 ** 2, memLimit: 256 * 1024 ** 2 },
        { id: "8b77e013d401", name: "sub-converter", image: "tindy2013/subconverter:latest", state: "running", status: "Up 18 days", cpuPct: 1.8, memUsed: 98 * 1024 ** 2, memLimit: 256 * 1024 ** 2 },
        { id: "7c2204a5b119", name: "vaultwarden", image: "vaultwarden/server:1.32", state: "running", status: "Up 46 days", cpuPct: 0.6, memUsed: 78 * 1024 ** 2, memLimit: 512 * 1024 ** 2 },
        { id: "3e112c9f08a1", name: "watchtower", image: "containrrr/watchtower:latest", state: "running", status: "Up 46 days", cpuPct: 0.2, memUsed: 32 * 1024 ** 2, memLimit: 128 * 1024 ** 2 },
      ],
      nodeProbes: [
        { targetId: "tcp-ct", name: "广东电信 DNS", type: "tcp_node", target: "202.96.128.86:53", ok: true, latencyMs: 14.2, lossPct: 0, ts: now },
        { targetId: "tcp-cu", name: "上海联通骨干", type: "tcp_node", target: "210.22.97.1:53", ok: true, latencyMs: 28.6, lossPct: 0, ts: now },
        { targetId: "tcp-cm", name: "香港移动出口", type: "tcp_node", target: "223.120.2.1:53", ok: true, latencyMs: 3.4, lossPct: 0, ts: now },
        { targetId: "tcp-gg", name: "Google Anycast", type: "tcp_node", target: "8.8.8.8:53", ok: true, latencyMs: 2.1, lossPct: 0, ts: now },
      ],
      sparkline: makeSparkline(22.4, 2_840_000, 4_620_000, now),
      trafficLimitGb: 1000,
      trafficMode: "both",
      trafficResetDay: 1,
      trafficCycleKey: cycleKey,
      trafficRxCycle: 196 * 1024 ** 3,
      trafficTxCycle: 232 * 1024 ** 3,
      trafficUsedBytes: 428 * 1024 ** 3,
      price: 14.9,
      currency: "USD",
      billingCycle: "monthly",
      purchaseDate: dateDaysFromNow(-180),
      expireDate: dateDaysFromNow(21),
      autoRenew: true,
      notes: "主力香港三网优化节点",
    },
    {
      id: "demo-sg-claw",
      name: "SG-Claw-Media",
      tokenHint: "demo02",
      region: "新加坡",
      flag: "🇸🇬",
      provider: "ClawCloud",
      tags: ["流媒体解锁", "GPT"],
      sortOrder: 2,
      online: true,
      lastSeenAt: now - 4000,
      uptime: 19 * 86400 + 6 * 3600,
      ip: "47.236.*.*",
      ipv6: "",
      os: "Ubuntu 24.04 LTS",
      arch: "amd64",
      kernel: "6.8.0-45-generic",
      cpuModel: "Intel Xeon Platinum 8369B",
      cpuCores: 2,
      memTotal: 4 * 1024 ** 3,
      swapTotal: 2 * 1024 ** 3,
      diskTotal: 60 * 1024 ** 3,
      cpuUsage: 44.8,
      load1: 1.18,
      load5: 1.05,
      load15: 0.92,
      memUsed: Math.round(2.68 * 1024 ** 3),
      swapUsed: Math.round(240 * 1024 ** 2),
      diskUsed: Math.round(31.8 * 1024 ** 3),
      netRxSpeed: 5_120_000,
      netTxSpeed: 7_950_000,
      netRxTotal: 410 * 1024 ** 3,
      netTxTotal: 454 * 1024 ** 3,
      tcpConns: 312,
      procCount: 138,
      containers: [
        { id: "a12bc908ef11", name: "sing-box", image: "ghcr.io/sagernet/sing-box:v1.10", state: "running", status: "Up 19 days", cpuPct: 19.2, memUsed: 380 * 1024 ** 2, memLimit: 1024 * 1024 ** 2 },
        { id: "b9012f34ca77", name: "snell-v4", image: "local/snell-server:4.1", state: "running", status: "Up 19 days", cpuPct: 4.4, memUsed: 48 * 1024 ** 2, memLimit: 256 * 1024 ** 2 },
        { id: "c3321e11a845", name: "nginx-proxy", image: "nginx:1.27-alpine", state: "running", status: "Up 19 days", cpuPct: 3.1, memUsed: 92 * 1024 ** 2, memLimit: 512 * 1024 ** 2 },
        { id: "d5540900b223", name: "redis-cache", image: "redis:7-alpine", state: "running", status: "Up 19 days", cpuPct: 1.1, memUsed: 124 * 1024 ** 2, memLimit: 512 * 1024 ** 2 },
      ],
      nodeProbes: [
        { targetId: "tcp-ct", name: "广东电信 DNS", type: "tcp_node", target: "202.96.128.86:53", ok: true, latencyMs: 56.4, lossPct: 0, ts: now },
        { targetId: "tcp-cu", name: "上海联通骨干", type: "tcp_node", target: "210.22.97.1:53", ok: true, latencyMs: 63.1, lossPct: 0, ts: now },
        { targetId: "tcp-cm", name: "香港移动出口", type: "tcp_node", target: "223.120.2.1:53", ok: true, latencyMs: 36.8, lossPct: 0, ts: now },
        { targetId: "tcp-gg", name: "Google Anycast", type: "tcp_node", target: "8.8.8.8:53", ok: true, latencyMs: 3.9, lossPct: 0, ts: now },
      ],
      sparkline: makeSparkline(44.8, 5_120_000, 7_950_000, now),
      trafficLimitGb: 1000,
      trafficMode: "both",
      trafficResetDay: 5,
      trafficCycleKey: cycleKey,
      trafficRxCycle: 410 * 1024 ** 3,
      trafficTxCycle: 454 * 1024 ** 3,
      trafficUsedBytes: 864 * 1024 ** 3,
      price: 4.0,
      currency: "USD",
      billingCycle: "monthly",
      purchaseDate: dateDaysFromNow(-95),
      expireDate: dateDaysFromNow(16),
      autoRenew: true,
      notes: "本月流量已超 85%，留意超额限速",
    },
    {
      id: "demo-us-bwh",
      name: "US-LAX-CN2GIA",
      tokenHint: "demo03",
      region: "美国 · 洛杉矶",
      flag: "🇺🇸",
      provider: "BandwagonHost",
      tags: ["CN2 GIA", "业务后端"],
      sortOrder: 3,
      online: true,
      lastSeenAt: now - 2000,
      uptime: 112 * 86400 + 3 * 3600,
      ip: "173.242.*.*",
      ipv6: "2607:8700:*:*",
      os: "Debian 12.7",
      arch: "amd64",
      kernel: "6.1.0-25-amd64",
      cpuModel: "AMD EPYC 9654",
      cpuCores: 2,
      memTotal: 2 * 1024 ** 3,
      swapTotal: 2 * 1024 ** 3,
      diskTotal: 40 * 1024 ** 3,
      cpuUsage: 14.2,
      load1: 0.24,
      load5: 0.29,
      load15: 0.31,
      memUsed: Math.round(0.84 * 1024 ** 3),
      swapUsed: Math.round(64 * 1024 ** 2),
      diskUsed: Math.round(24.8 * 1024 ** 3),
      netRxSpeed: 820_000,
      netTxSpeed: 1_190_000,
      netRxTotal: 145 * 1024 ** 3,
      netTxTotal: 170 * 1024 ** 3,
      tcpConns: 96,
      procCount: 124,
      containers: [
        { id: "f1200894ac11", name: "sub2api", image: "ghcr.io/user/sub2api:v2.4", state: "running", status: "Up 38 days", cpuPct: 4.5, memUsed: 210 * 1024 ** 2, memLimit: 512 * 1024 ** 2 },
        { id: "e9182736ba12", name: "postgres-16", image: "postgres:16-alpine", state: "running", status: "Up 112 days", cpuPct: 2.3, memUsed: 268 * 1024 ** 2, memLimit: 768 * 1024 ** 2 },
        { id: "d1092837cc14", name: "redis-session", image: "redis:7-alpine", state: "running", status: "Up 112 days", cpuPct: 0.7, memUsed: 46 * 1024 ** 2, memLimit: 256 * 1024 ** 2 },
        { id: "c8374655dd15", name: "cloudflared", image: "cloudflare/cloudflared:latest", state: "running", status: "Up 22 days", cpuPct: 1.4, memUsed: 52 * 1024 ** 2, memLimit: 256 * 1024 ** 2 },
        { id: "b6543211ee16", name: "uptime-worker", image: "louislam/uptime-kuma:1", state: "running", status: "Up 112 days", cpuPct: 0.8, memUsed: 118 * 1024 ** 2, memLimit: 256 * 1024 ** 2 },
        { id: "a5432100ff17", name: "pg-backup-cron", image: "prodrigestivill/postgres-backup-local", state: "running", status: "Up 112 days", cpuPct: 0.1, memUsed: 18 * 1024 ** 2, memLimit: 128 * 1024 ** 2 },
      ],
      nodeProbes: [
        { targetId: "tcp-ct", name: "广东电信 DNS", type: "tcp_node", target: "202.96.128.86:53", ok: true, latencyMs: 138.4, lossPct: 0, ts: now },
        { targetId: "tcp-cu", name: "上海联通骨干", type: "tcp_node", target: "210.22.97.1:53", ok: true, latencyMs: 146.9, lossPct: 0, ts: now },
        { targetId: "tcp-cm", name: "香港移动出口", type: "tcp_node", target: "223.120.2.1:53", ok: true, latencyMs: 152.3, lossPct: 0, ts: now },
        { targetId: "tcp-gg", name: "Google Anycast", type: "tcp_node", target: "8.8.8.8:53", ok: true, latencyMs: 1.8, lossPct: 0, ts: now },
      ],
      sparkline: makeSparkline(14.2, 820_000, 1_190_000, now),
      trafficLimitGb: 2000,
      trafficMode: "both",
      trafficResetDay: 12,
      trafficCycleKey: cycleKey,
      trafficRxCycle: 145 * 1024 ** 3,
      trafficTxCycle: 170 * 1024 ** 3,
      trafficUsedBytes: 315 * 1024 ** 3,
      price: 49.99,
      currency: "USD",
      billingCycle: "quarterly",
      purchaseDate: dateDaysFromNow(-450),
      expireDate: dateDaysFromNow(8),
      autoRenew: false,
      notes: "搬瓦工 CN2 GIA-E，8 天后需手动续费",
    },
    {
      id: "demo-jp-iij",
      name: "JP-TYO-IIJ",
      tokenHint: "demo04",
      region: "日本 · 东京",
      flag: "🇯🇵",
      provider: "MoeCloud",
      tags: ["备用出口", "高负载演示"],
      sortOrder: 4,
      online: true,
      lastSeenAt: now - 5000,
      uptime: 7 * 86400 + 18 * 3600,
      ip: "103.88.*.*",
      ipv6: "",
      os: "Ubuntu 22.04 LTS",
      arch: "arm64",
      kernel: "5.15.0-119-generic",
      cpuModel: "Ampere Altra Neoverse-N1",
      cpuCores: 1,
      memTotal: 1024 ** 3,
      swapTotal: 1024 ** 3,
      diskTotal: 20 * 1024 ** 3,
      cpuUsage: 91.4,
      load1: 2.34,
      load5: 1.98,
      load15: 1.61,
      memUsed: Math.round(860 * 1024 ** 2),
      swapUsed: Math.round(410 * 1024 ** 2),
      diskUsed: Math.round(14.2 * 1024 ** 3),
      netRxSpeed: 1_450_000,
      netTxSpeed: 2_380_000,
      netRxTotal: 78 * 1024 ** 3,
      netTxTotal: 104 * 1024 ** 3,
      tcpConns: 248,
      procCount: 94,
      containers: [
        { id: "77aabb110099", name: "hysteria2", image: "tobyxdd/hysteria:v2", state: "running", status: "Up 7 days", cpuPct: 68.2, memUsed: 312 * 1024 ** 2, memLimit: 512 * 1024 ** 2 },
        { id: "66bbcc220088", name: "caddy-tls", image: "caddy:2.8-alpine", state: "running", status: "Up 7 days", cpuPct: 4.8, memUsed: 68 * 1024 ** 2, memLimit: 256 * 1024 ** 2 },
        { id: "55ccdd330077", name: "fail2ban", image: "crazymax/fail2ban:latest", state: "exited", status: "Exited (1) 2 hours ago", cpuPct: 0, memUsed: 0, memLimit: 128 * 1024 ** 2 },
      ],
      nodeProbes: [
        { targetId: "tcp-ct", name: "广东电信 DNS", type: "tcp_node", target: "202.96.128.86:53", ok: true, latencyMs: 74.5, lossPct: 3.3, ts: now },
        { targetId: "tcp-cu", name: "上海联通骨干", type: "tcp_node", target: "210.22.97.1:53", ok: true, latencyMs: 49.2, lossPct: 0, ts: now },
        { targetId: "tcp-cm", name: "香港移动出口", type: "tcp_node", target: "223.120.2.1:53", ok: true, latencyMs: 62.1, lossPct: 0, ts: now },
        { targetId: "tcp-gg", name: "Google Anycast", type: "tcp_node", target: "8.8.8.8:53", ok: true, latencyMs: 4.5, lossPct: 0, ts: now },
      ],
      sparkline: makeSparkline(88.5, 1_450_000, 2_380_000, now),
      trafficLimitGb: 500,
      trafficMode: "both",
      trafficResetDay: 1,
      trafficCycleKey: cycleKey,
      trafficRxCycle: 78 * 1024 ** 3,
      trafficTxCycle: 104 * 1024 ** 3,
      trafficUsedBytes: 182 * 1024 ** 3,
      price: 29.0,
      currency: "CNY",
      billingCycle: "monthly",
      purchaseDate: dateDaysFromNow(-60),
      expireDate: dateDaysFromNow(28),
      autoRenew: true,
      notes: "1C1G ARM 节点，晚高峰 CPU 偏高",
    },
  ];

  const edgeProbeHistory: Record<string, EdgeProbeRecord[]> = {
    "edge-sub": makeEdgeBars(42, [], [18], now),
    "edge-vps": makeEdgeBars(19, [], [], now),
    "edge-api": makeEdgeBars(118, [27], [28, 39], now),
    "edge-gh": makeEdgeBars(94, [], [12], now),
  };

  return {
    settings: {
      siteTitle: "PulseVPS",
      siteDomain: "vps.ydiws.xyz",
      publicAccess: "masked",
      displayCurrency: "CNY",
    },
    authenticated: true,
    serverTime: now,
    nodes,
    probeTargets,
    edgeProbeHistory,
  };
}

export function tickDemoBootstrap(prev: BootstrapResponse): BootstrapResponse {
  const now = Date.now();
  const nextNodes = prev.nodes.map((node, idx) => {
    if (!node.online) return node;
    const jitter = (Math.random() - 0.48) * 5.2;
    const baseCpu = idx === 3 ? 88 : idx === 1 ? 45 : idx === 0 ? 22 : 14;
    const cpuUsage = Number(Math.max(3, Math.min(98.5, node.cpuUsage * 0.65 + (baseCpu + jitter) * 0.35)).toFixed(1));
    const rxFactor = 0.82 + Math.random() * 0.38;
    const txFactor = 0.8 + Math.random() * 0.42;
    const baseRx = idx === 1 ? 5_100_000 : idx === 0 ? 2_800_000 : idx === 3 ? 1_450_000 : 820_000;
    const baseTx = idx === 1 ? 7_900_000 : idx === 0 ? 4_600_000 : idx === 3 ? 2_380_000 : 1_190_000;
    const netRxSpeed = Math.round(baseRx * rxFactor);
    const netTxSpeed = Math.round(baseTx * txFactor);
    const memDrift = Math.round((Math.random() - 0.5) * 18 * 1024 ** 2);
    const memUsed = Math.max(Math.round(node.memTotal * 0.2), Math.min(Math.round(node.memTotal * 0.94), node.memUsed + memDrift));
    const sparkline: SparkPoint[] = [...node.sparkline.slice(-23), [now, cpuUsage, netRxSpeed, netTxSpeed]];
    const deltaRx = netRxSpeed * 3;
    const deltaTx = netTxSpeed * 3;

    return {
      ...node,
      lastSeenAt: now - 2000,
      uptime: node.uptime + 3,
      cpuUsage,
      load1: Number(Math.max(0.08, node.load1 + (Math.random() - 0.5) * 0.08).toFixed(2)),
      memUsed,
      netRxSpeed,
      netTxSpeed,
      trafficRxCycle: node.trafficRxCycle + deltaRx,
      trafficTxCycle: node.trafficTxCycle + deltaTx,
      trafficUsedBytes: node.trafficUsedBytes + deltaRx + deltaTx,
      sparkline,
      nodeProbes: node.nodeProbes.map((p) => ({
        ...p,
        latencyMs: Number(Math.max(1.2, p.latencyMs + (Math.random() - 0.5) * 2.4).toFixed(1)),
        ts: now,
      })),
    };
  });

  return {
    ...prev,
    serverTime: now,
    nodes: nextNodes,
  };
}

export function generateDemoHistory(node: NodeDto, range: "1h" | "6h" | "24h" | "7d"): HistoryPoint[] {
  const now = Date.now();
  const count = range === "1h" ? 60 : range === "6h" ? 72 : range === "24h" ? 96 : 112;
  const spanMs =
    range === "1h" ? 3600_000 : range === "6h" ? 6 * 3600_000 : range === "24h" ? 24 * 3600_000 : 7 * 86400_000;
  const stepMs = spanMs / count;
  const baseMem = node.memTotal > 0 ? (node.memUsed / node.memTotal) * 100 : 50;
  const baseDisk = node.diskTotal > 0 ? (node.diskUsed / node.diskTotal) * 100 : 45;
  const baseSwap = node.swapTotal > 0 ? (node.swapUsed / node.swapTotal) * 100 : 12;

  const pts: HistoryPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const t = now - i * stepMs;
    const wave = Math.sin(i * 0.35 + node.sortOrder) * 0.25 + Math.cos(i * 0.72) * 0.14;
    const cpu = Number(Math.max(3, Math.min(98, node.cpuUsage * (1 + wave * 0.6))).toFixed(1));
    const memPct = Number(Math.max(10, Math.min(96, baseMem + wave * 6)).toFixed(1));
    const rxSpeed = Math.max(50_000, Math.round(node.netRxSpeed * (1 + wave * 0.9)));
    const txSpeed = Math.max(60_000, Math.round(node.netTxSpeed * (1 - wave * 0.7)));
    pts.push({
      ts: t,
      cpu,
      memPct,
      swapPct: Number(baseSwap.toFixed(1)),
      diskPct: Number(baseDisk.toFixed(1)),
      load1: Number(Math.max(0.05, node.load1 * (1 + wave * 0.4)).toFixed(2)),
      rxSpeed,
      txSpeed,
    });
  }
  return pts;
}
