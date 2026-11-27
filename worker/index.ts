import { Hono } from "hono";
import type {
  AgentReportPayload,
  BillingCycle,
  BootstrapResponse,
  ContainerInfo,
  CurrencyCode,
  EdgeProbeRecord,
  HistoryPoint,
  NodeDto,
  NodeProbeResult,
  NodeUpsertPayload,
  ProbeTargetDto,
  PublicAccessMode,
  SettingsDto,
  SparkPoint,
  TrafficMode,
  TrafficUnitBase,
} from "../shared/types";
import {
  extractBearerToken,
  generateId,
  generateRawToken,
  hashToken,
  signAdminToken,
  verifyAdminPassword,
  verifyAdminToken,
} from "./auth";
import { renderInstallScript } from "./install-script";
import { pruneOldHistory, runEdgeProbes } from "./probes";
import type { Env, NodeRow, ProbeTargetRow } from "./types";

const app = new Hono<{ Bindings: Env }>();

const ONLINE_WINDOW_MS = 45_000;
const HISTORY_INTERVAL_MS = 60_000;

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function maskIp(ip: string): string {
  if (!ip) return "";
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return `${parts.slice(0, 2).join(":")}:*:*`;
  }
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  return "***.***.***";
}

function daysInMonthUtc(year: number, month1Based: number): number {
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}

function computeCycleKey(nowMs: number, resetDay: number): string {
  const safeDay = Math.min(31, Math.max(1, Math.round(resetDay || 1)));
  // Align cycle boundary to UTC+8 midnight; clamp 29-31 to the month's last day in shorter months
  const d = new Date(nowMs + 8 * 3600_000);
  let year = d.getUTCFullYear();
  let month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const effectiveResetDay = Math.min(safeDay, daysInMonthUtc(year, month));
  if (day < effectiveResetDay) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

function normalizeUnitBase(val: unknown, fallback: TrafficUnitBase = 1024): TrafficUnitBase {
  const num = Number(val);
  if (num === 1000) return 1000;
  if (num === 1024) return 1024;
  return fallback;
}

function computeTrafficUsed(rx: number, tx: number, mode: string): number {
  if (mode === "tx") return tx;
  if (mode === "max") return Math.max(rx, tx);
  return rx + tx;
}

function mapNodeRow(row: NodeRow, serverTime: number, maskPrivate: boolean): NodeDto {
  const online = row.last_seen_at > 0 && serverTime - row.last_seen_at <= ONLINE_WINDOW_MS;
  const containers = safeJson<ContainerInfo[]>(row.containers_json, []);
  const nodeProbes = safeJson<NodeProbeResult[]>(row.node_probes_json, []);
  const sparkline = safeJson<SparkPoint[]>(row.sparkline_json, []);
  const tags = safeJson<string[]>(row.tags_json, []);

  return {
    id: row.id,
    name: row.name,
    tokenHint: row.token_hint,
    region: row.region,
    flag: row.flag,
    provider: row.provider,
    tags,
    sortOrder: row.sort_order,
    online,
    lastSeenAt: row.last_seen_at,
    uptime: row.uptime,
    ip: maskPrivate ? maskIp(row.ip) : row.ip,
    ipv6: maskPrivate ? maskIp(row.ipv6) : row.ipv6,
    os: row.os,
    arch: row.arch,
    kernel: row.kernel,
    cpuModel: row.cpu_model,
    cpuCores: row.cpu_cores,
    memTotal: row.mem_total,
    swapTotal: row.swap_total,
    diskTotal: row.disk_total,
    cpuUsage: row.cpu_usage,
    load1: row.load1,
    load5: row.load5,
    load15: row.load15,
    memUsed: row.mem_used,
    swapUsed: row.swap_used,
    diskUsed: row.disk_used,
    netRxSpeed: online ? row.net_rx_speed : 0,
    netTxSpeed: online ? row.net_tx_speed : 0,
    netRxTotal: row.net_rx_total,
    netTxTotal: row.net_tx_total,
    tcpConns: row.tcp_conns,
    procCount: row.proc_count,
    containers,
    nodeProbes,
    sparkline,
    trafficLimitGb: row.traffic_limit_gb,
    trafficMode: (row.traffic_mode || "both") as TrafficMode,
    trafficUnitBase: normalizeUnitBase(row.traffic_unit_base, 1024),
    trafficResetDay: row.traffic_reset_day,
    trafficCycleKey: row.traffic_cycle_key,
    trafficRxCycle: row.traffic_rx_cycle,
    trafficTxCycle: row.traffic_tx_cycle,
    trafficUsedBytes: computeTrafficUsed(row.traffic_rx_cycle, row.traffic_tx_cycle, row.traffic_mode),
    price: row.price,
    currency: (row.currency || "USD") as CurrencyCode,
    billingCycle: (row.billing_cycle || "monthly") as BillingCycle,
    purchaseDate: row.purchase_date,
    expireDate: row.expire_date,
    autoRenew: row.auto_renew === 1,
    notes: maskPrivate ? "" : row.notes,
  };
}

async function readSettings(db: D1Database): Promise<SettingsDto> {
  const res = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const map = new Map<string, string>();
  for (const row of res.results ?? []) {
    map.set(row.key, row.value);
  }
  return {
    siteTitle: map.get("site_title") || "PulseVPS",
    siteDomain: map.get("site_domain") || "vps.ydiws.xyz",
    publicAccess: (map.get("public_access") as PublicAccessMode) || "masked",
    displayCurrency: (map.get("display_currency") as CurrencyCode) || "CNY",
  };
}

async function isAdminRequest(authHeader: string | undefined, env: Env): Promise<boolean> {
  const bearer = extractBearerToken(authHeader);
  return verifyAdminToken(bearer, env);
}

app.get("/api/health", (c) => c.json({ ok: true, time: Date.now() }));

app.post("/api/auth/login", async (c) => {
  const body = await c.req.json<{ password?: string }>().catch(() => ({ password: "" }));
  const ok = await verifyAdminPassword(body.password || "", c.env);
  if (!ok) {
    return c.json({ error: "管理密码错误" }, 401);
  }
  const signed = await signAdminToken(c.env);
  return c.json(signed);
});

app.get("/api/auth/me", async (c) => {
  const authenticated = await isAdminRequest(c.req.header("Authorization"), c.env);
  return c.json({ authenticated });
});

app.get("/api/bootstrap", async (c) => {
  const serverTime = Date.now();
  const [settings, authenticated] = await Promise.all([
    readSettings(c.env.DB),
    isAdminRequest(c.req.header("Authorization"), c.env),
  ]);

  if (settings.publicAccess === "private" && !authenticated) {
    const payload: BootstrapResponse = {
      settings,
      authenticated: false,
      requiresAuth: true,
      serverTime,
      nodes: [],
      probeTargets: [],
      edgeProbeHistory: {},
    };
    return c.json(payload);
  }

  const [nodesRes, targetsRes, edgeHistoryRes] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM nodes ORDER BY sort_order ASC, created_at ASC").all<NodeRow>(),
    c.env.DB.prepare("SELECT * FROM probe_targets ORDER BY created_at ASC").all<ProbeTargetRow>(),
    c.env.DB.prepare(
      "SELECT target_id, ts, ok, status_code, latency_ms, error FROM edge_probe_history WHERE ts >= ? ORDER BY ts ASC",
    )
      .bind(serverTime - 24 * 3600_000)
      .all<{
        target_id: string;
        ts: number;
        ok: number;
        status_code: number;
        latency_ms: number;
        error: string;
      }>(),
  ]);

  const maskPrivate = !authenticated && settings.publicAccess === "masked";
  const nodes = (nodesRes.results ?? []).map((row) => mapNodeRow(row, serverTime, maskPrivate));
  const probeTargets: ProbeTargetDto[] = (targetsRes.results ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type as ProbeTargetDto["type"],
    target: t.target,
    expectedStatus: t.expected_status,
    enabled: t.enabled === 1,
  }));

  const edgeProbeHistory: Record<string, EdgeProbeRecord[]> = {};
  for (const row of edgeHistoryRes.results ?? []) {
    if (!edgeProbeHistory[row.target_id]) edgeProbeHistory[row.target_id] = [];
    edgeProbeHistory[row.target_id].push({
      ts: row.ts,
      ok: row.ok === 1,
      statusCode: row.status_code,
      latencyMs: row.latency_ms,
      error: row.error || undefined,
    });
  }
  for (const key of Object.keys(edgeProbeHistory)) {
    const arr = edgeProbeHistory[key];
    if (arr.length > 48) {
      edgeProbeHistory[key] = arr.slice(-48);
    }
  }

  const payload: BootstrapResponse = {
    settings,
    authenticated,
    serverTime,
    nodes,
    probeTargets,
    edgeProbeHistory,
  };
  return c.json(payload);
});

app.get("/api/nodes/:id/history", async (c) => {
  const settings = await readSettings(c.env.DB);
  const authenticated = await isAdminRequest(c.req.header("Authorization"), c.env);
  if (settings.publicAccess === "private" && !authenticated) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const nodeId = c.req.param("id");
  const range = c.req.query("range") || "1h";
  const rangeMsMap: Record<string, number> = {
    "1h": 3600_000,
    "6h": 6 * 3600_000,
    "24h": 24 * 3600_000,
    "7d": 7 * 24 * 3600_000,
  };
  const windowMs = rangeMsMap[range] ?? 3600_000;
  const cutoff = Date.now() - windowMs;

  const res = await c.env.DB.prepare(
    "SELECT ts, cpu, mem_pct, swap_pct, disk_pct, load1, rx_speed, tx_speed FROM metrics_history WHERE node_id = ? AND ts >= ? ORDER BY ts ASC",
  )
    .bind(nodeId, cutoff)
    .all<{
      ts: number;
      cpu: number;
      mem_pct: number;
      swap_pct: number;
      disk_pct: number;
      load1: number;
      rx_speed: number;
      tx_speed: number;
    }>();

  const rawRows = res.results ?? [];
  const maxPoints = 180;
  let sampled = rawRows;
  if (rawRows.length > maxPoints) {
    const step = (rawRows.length - 1) / (maxPoints - 1);
    sampled = [];
    for (let i = 0; i < maxPoints; i++) {
      sampled.push(rawRows[Math.round(i * step)]);
    }
  }

  const points: HistoryPoint[] = sampled.map((r) => ({
    ts: r.ts,
    cpu: r.cpu,
    memPct: r.mem_pct,
    swapPct: r.swap_pct,
    diskPct: r.disk_pct,
    load1: r.load1,
    rxSpeed: r.rx_speed,
    txSpeed: r.tx_speed,
  }));
  return c.json({ nodeId, range, points });
});

app.post("/api/nodes", async (c) => {
  if (!(await isAdminRequest(c.req.header("Authorization"), c.env))) {
    return c.json({ error: "需要管理员权限" }, 401);
  }
  const body = await c.req.json<NodeUpsertPayload>().catch(() => ({} as NodeUpsertPayload));
  if (!body.name?.trim()) {
    return c.json({ error: "节点名称不能为空" }, 400);
  }

  const id = generateId("node");
  const rawToken = generateRawToken(24);
  const tokenHash = await hashToken(rawToken);
  const tokenHint = rawToken.slice(0, 6);
  const now = Date.now();
  const resetDay = Math.min(31, Math.max(1, Math.round(Number(body.trafficResetDay || 1))));
  const unitBase = normalizeUnitBase(body.trafficUnitBase, 1024);
  const cycleKey = computeCycleKey(now, resetDay);

  await c.env.DB.prepare(
    `INSERT INTO nodes (
      id, name, token_hash, token_hint, region, flag, provider, tags_json, sort_order,
      traffic_limit_gb, traffic_mode, traffic_unit_base, traffic_reset_day, traffic_cycle_key,
      price, currency, billing_cycle, purchase_date, expire_date, auto_renew, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      body.name.trim(),
      tokenHash,
      tokenHint,
      body.region || "HK",
      body.flag || "🇭🇰",
      body.provider || "",
      JSON.stringify(body.tags || []),
      Number(body.sortOrder || 0),
      Number(body.trafficLimitGb ?? 1000),
      body.trafficMode || "both",
      unitBase,
      resetDay,
      cycleKey,
      Number(body.price ?? 0),
      body.currency || "USD",
      body.billingCycle || "monthly",
      body.purchaseDate || "",
      body.expireDate || "",
      body.autoRenew ? 1 : 0,
      body.notes || "",
      now,
    )
    .run();

  const row = await c.env.DB.prepare("SELECT * FROM nodes WHERE id = ?").bind(id).first<NodeRow>();
  return c.json({
    node: row ? mapNodeRow(row, now, false) : null,
    rawToken,
  });
});

app.put("/api/nodes/:id", async (c) => {
  if (!(await isAdminRequest(c.req.header("Authorization"), c.env))) {
    return c.json({ error: "需要管理员权限" }, 401);
  }
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT * FROM nodes WHERE id = ?").bind(id).first<NodeRow>();
  if (!existing) return c.json({ error: "节点不存在" }, 404);

  const body = await c.req.json<NodeUpsertPayload>().catch(() => ({} as NodeUpsertPayload));
  const resetDay = Math.min(31, Math.max(1, Math.round(Number(body.trafficResetDay ?? existing.traffic_reset_day))));
  const unitBase = normalizeUnitBase(body.trafficUnitBase, normalizeUnitBase(existing.traffic_unit_base, 1024));

  const now = Date.now();
  const alignedCycleKey =
    resetDay !== existing.traffic_reset_day ||
    body.calibrateRxGb !== undefined ||
    body.calibrateTxGb !== undefined
      ? computeCycleKey(now, resetDay)
      : existing.traffic_cycle_key;

  let nextRxCycle = existing.traffic_rx_cycle;
  let nextTxCycle = existing.traffic_tx_cycle;
  const gbBytes = unitBase ** 3;

  if (body.calibrateRxGb !== undefined) {
    const rxGb = Number(body.calibrateRxGb);
    if (!Number.isFinite(rxGb) || rxGb < 0 || rxGb > 1_000_000) {
      return c.json({ error: "校准入站流量需为 0 ~ 1,000,000 GB 之间的有效数字" }, 400);
    }
    nextRxCycle = Math.round(rxGb * gbBytes);
  }
  if (body.calibrateTxGb !== undefined) {
    const txGb = Number(body.calibrateTxGb);
    if (!Number.isFinite(txGb) || txGb < 0 || txGb > 1_000_000) {
      return c.json({ error: "校准出站流量需为 0 ~ 1,000,000 GB 之间的有效数字" }, 400);
    }
    nextTxCycle = Math.round(txGb * gbBytes);
  }

  await c.env.DB.prepare(
    `UPDATE nodes SET
      name = ?, region = ?, flag = ?, provider = ?, tags_json = ?, sort_order = ?,
      traffic_limit_gb = ?, traffic_mode = ?, traffic_unit_base = ?, traffic_reset_day = ?,
      traffic_cycle_key = ?, traffic_rx_cycle = ?, traffic_tx_cycle = ?,
      price = ?, currency = ?, billing_cycle = ?, purchase_date = ?, expire_date = ?, auto_renew = ?, notes = ?
    WHERE id = ?`,
  )
    .bind(
      body.name?.trim() || existing.name,
      body.region ?? existing.region,
      body.flag ?? existing.flag,
      body.provider ?? existing.provider,
      body.tags ? JSON.stringify(body.tags) : existing.tags_json,
      body.sortOrder ?? existing.sort_order,
      body.trafficLimitGb ?? existing.traffic_limit_gb,
      body.trafficMode ?? existing.traffic_mode,
      unitBase,
      resetDay,
      alignedCycleKey,
      nextRxCycle,
      nextTxCycle,
      body.price ?? existing.price,
      body.currency ?? existing.currency,
      body.billingCycle ?? existing.billing_cycle,
      body.purchaseDate ?? existing.purchase_date,
      body.expireDate ?? existing.expire_date,
      body.autoRenew === undefined ? existing.auto_renew : body.autoRenew ? 1 : 0,
      body.notes ?? existing.notes,
      id,
    )
    .run();

  const updated = await c.env.DB.prepare("SELECT * FROM nodes WHERE id = ?").bind(id).first<NodeRow>();
  return c.json({ node: updated ? mapNodeRow(updated, now, false) : null });
});

app.post("/api/nodes/:id/rotate-token", async (c) => {
  if (!(await isAdminRequest(c.req.header("Authorization"), c.env))) {
    return c.json({ error: "需要管理员权限" }, 401);
  }
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT id FROM nodes WHERE id = ?").bind(id).first<{ id: string }>();
  if (!existing) return c.json({ error: "节点不存在" }, 404);

  const rawToken = generateRawToken(24);
  const tokenHash = await hashToken(rawToken);
  const tokenHint = rawToken.slice(0, 6);
  await c.env.DB.prepare("UPDATE nodes SET token_hash = ?, token_hint = ? WHERE id = ?")
    .bind(tokenHash, tokenHint, id)
    .run();
  return c.json({ rawToken, tokenHint });
});

app.delete("/api/nodes/:id", async (c) => {
  if (!(await isAdminRequest(c.req.header("Authorization"), c.env))) {
    return c.json({ error: "需要管理员权限" }, 401);
  }
  const id = c.req.param("id");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM metrics_history WHERE node_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM nodes WHERE id = ?").bind(id),
  ]);
  return c.json({ ok: true });
});

app.post("/api/probes", async (c) => {
  if (!(await isAdminRequest(c.req.header("Authorization"), c.env))) {
    return c.json({ error: "需要管理员权限" }, 401);
  }
  const body = await c.req.json<Partial<ProbeTargetDto>>().catch(() => ({} as Partial<ProbeTargetDto>));
  if (!body.name?.trim() || !body.target?.trim() || !body.type) {
    return c.json({ error: "请填写完整拨测目标信息" }, 400);
  }
  const id = generateId("probe");
  await c.env.DB.prepare(
    "INSERT INTO probe_targets (id, name, type, target, expected_status, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(
      id,
      body.name.trim(),
      body.type,
      body.target.trim(),
      Number(body.expectedStatus || 200),
      body.enabled === false ? 0 : 1,
      Date.now(),
    )
    .run();
  return c.json({ ok: true, id });
});

app.put("/api/probes/:id", async (c) => {
  if (!(await isAdminRequest(c.req.header("Authorization"), c.env))) {
    return c.json({ error: "需要管理员权限" }, 401);
  }
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare("SELECT * FROM probe_targets WHERE id = ?")
    .bind(id)
    .first<ProbeTargetRow>();
  if (!existing) return c.json({ error: "拨测目标不存在" }, 404);

  const body = await c.req.json<Partial<ProbeTargetDto>>().catch(() => ({} as Partial<ProbeTargetDto>));
  await c.env.DB.prepare(
    "UPDATE probe_targets SET name = ?, type = ?, target = ?, expected_status = ?, enabled = ? WHERE id = ?",
  )
    .bind(
      body.name?.trim() || existing.name,
      body.type || existing.type,
      body.target?.trim() || existing.target,
      body.expectedStatus ?? existing.expected_status,
      body.enabled === undefined ? existing.enabled : body.enabled ? 1 : 0,
      id,
    )
    .run();
  return c.json({ ok: true });
});

app.delete("/api/probes/:id", async (c) => {
  if (!(await isAdminRequest(c.req.header("Authorization"), c.env))) {
    return c.json({ error: "需要管理员权限" }, 401);
  }
  const id = c.req.param("id");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM edge_probe_history WHERE target_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM probe_targets WHERE id = ?").bind(id),
  ]);
  return c.json({ ok: true });
});

app.post("/api/probes/run", async (c) => {
  if (!(await isAdminRequest(c.req.header("Authorization"), c.env))) {
    return c.json({ error: "需要管理员权限" }, 401);
  }
  const count = await runEdgeProbes(c.env.DB);
  return c.json({ ok: true, checked: count });
});

app.put("/api/settings", async (c) => {
  if (!(await isAdminRequest(c.req.header("Authorization"), c.env))) {
    return c.json({ error: "需要管理员权限" }, 401);
  }
  const body = await c.req.json<Partial<SettingsDto>>().catch(() => ({} as Partial<SettingsDto>));
  const updates: Array<[string, string]> = [];
  if (body.siteTitle !== undefined) updates.push(["site_title", body.siteTitle.trim() || "PulseVPS"]);
  if (body.siteDomain !== undefined) updates.push(["site_domain", body.siteDomain.trim() || "vps.ydiws.xyz"]);
  if (body.publicAccess !== undefined) updates.push(["public_access", body.publicAccess]);
  if (body.displayCurrency !== undefined) updates.push(["display_currency", body.displayCurrency]);

  if (updates.length > 0) {
    await c.env.DB.batch(
      updates.map(([k, v]) => c.env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(k, v)),
    );
  }
  return c.json({ settings: await readSettings(c.env.DB) });
});

app.post("/api/agent/report", async (c) => {
  const rawToken = extractBearerToken(c.req.header("Authorization"));
  if (!rawToken) return c.json({ error: "Missing Bearer token" }, 401);

  const tokenHash = await hashToken(rawToken);
  const node = await c.env.DB.prepare("SELECT * FROM nodes WHERE token_hash = ?").bind(tokenHash).first<NodeRow>();
  if (!node) return c.json({ error: "Invalid node token" }, 401);

  const payload = await c.req.json<AgentReportPayload>().catch(() => null);
  if (!payload) return c.json({ error: "Invalid JSON payload" }, 400);

  const now = Date.now();
  const cycleKey = computeCycleKey(now, node.traffic_reset_day);
  const rawRx = Math.max(0, Math.round(Number(payload.netRxTotal || 0)));
  const rawTx = Math.max(0, Math.round(Number(payload.netTxTotal || 0)));

  let rxCycle = node.traffic_rx_cycle;
  let txCycle = node.traffic_tx_cycle;
  if (node.traffic_cycle_key !== cycleKey) {
    rxCycle = 0;
    txCycle = 0;
  } else if (node.last_seen_at > 0) {
    const deltaRx = rawRx >= node.last_raw_rx ? rawRx - node.last_raw_rx : rawRx;
    const deltaTx = rawTx >= node.last_raw_tx ? rawTx - node.last_raw_tx : rawTx;
    rxCycle += deltaRx;
    txCycle += deltaTx;
  }

  const spark = safeJson<SparkPoint[]>(node.sparkline_json, []);
  const cpuVal = Number((payload.cpuUsage ?? 0).toFixed(1));
  const rxSpeed = Math.max(0, Number(payload.netRxSpeed ?? 0));
  const txSpeed = Math.max(0, Number(payload.netTxSpeed ?? 0));
  spark.push([now, cpuVal, Math.round(rxSpeed), Math.round(txSpeed)]);
  const trimmedSpark = spark.slice(-24);

  const memTotal = Math.max(0, Math.round(Number(payload.memTotal ?? node.mem_total)));
  const memUsed = Math.max(0, Math.round(Number(payload.memUsed ?? 0)));
  const swapTotal = Math.max(0, Math.round(Number(payload.swapTotal ?? node.swap_total)));
  const swapUsed = Math.max(0, Math.round(Number(payload.swapUsed ?? 0)));
  const diskTotal = Math.max(0, Math.round(Number(payload.diskTotal ?? node.disk_total)));
  const diskUsed = Math.max(0, Math.round(Number(payload.diskUsed ?? 0)));

  const shouldInsertHistory = now - node.last_history_at >= HISTORY_INTERVAL_MS;
  const newLastHistoryAt = shouldInsertHistory ? now : node.last_history_at;

  const clientIp = payload.ip || c.req.header("CF-Connecting-IP") || node.ip;

  const updateStmt = c.env.DB.prepare(
    `UPDATE nodes SET
      ip = ?, ipv6 = ?, os = ?, arch = ?, kernel = ?, cpu_model = ?, cpu_cores = ?,
      mem_total = ?, swap_total = ?, disk_total = ?,
      last_seen_at = ?, uptime = ?, cpu_usage = ?, load1 = ?, load5 = ?, load15 = ?,
      mem_used = ?, swap_used = ?, disk_used = ?,
      net_rx_speed = ?, net_tx_speed = ?, net_rx_total = ?, net_tx_total = ?,
      tcp_conns = ?, proc_count = ?,
      containers_json = ?, node_probes_json = ?, sparkline_json = ?,
      traffic_cycle_key = ?, traffic_rx_cycle = ?, traffic_tx_cycle = ?,
      last_raw_rx = ?, last_raw_tx = ?, last_history_at = ?
    WHERE id = ?`,
  ).bind(
    clientIp,
    payload.ipv6 ?? node.ipv6,
    payload.os ?? node.os,
    payload.arch ?? node.arch,
    payload.kernel ?? node.kernel,
    payload.cpuModel ?? node.cpu_model,
    Math.round(Number(payload.cpuCores ?? node.cpu_cores)),
    memTotal,
    swapTotal,
    diskTotal,
    now,
    Math.round(Number(payload.uptime ?? 0)),
    cpuVal,
    Number((payload.load1 ?? 0).toFixed(2)),
    Number((payload.load5 ?? 0).toFixed(2)),
    Number((payload.load15 ?? 0).toFixed(2)),
    memUsed,
    swapUsed,
    diskUsed,
    rxSpeed,
    txSpeed,
    rawRx,
    rawTx,
    Math.round(Number(payload.tcpConns ?? 0)),
    Math.round(Number(payload.procCount ?? 0)),
    JSON.stringify(payload.containers ?? []),
    JSON.stringify(payload.probes ?? []),
    JSON.stringify(trimmedSpark),
    cycleKey,
    rxCycle,
    txCycle,
    rawRx,
    rawTx,
    newLastHistoryAt,
    node.id,
  );

  if (shouldInsertHistory) {
    const memPct = memTotal > 0 ? Number(((memUsed / memTotal) * 100).toFixed(1)) : 0;
    const swapPct = swapTotal > 0 ? Number(((swapUsed / swapTotal) * 100).toFixed(1)) : 0;
    const diskPct = diskTotal > 0 ? Number(((diskUsed / diskTotal) * 100).toFixed(1)) : 0;
    const insertHistoryStmt = c.env.DB.prepare(
      `INSERT INTO metrics_history (node_id, ts, cpu, mem_pct, swap_pct, disk_pct, load1, rx_speed, tx_speed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(node.id, now, cpuVal, memPct, swapPct, diskPct, Number((payload.load1 ?? 0).toFixed(2)), rxSpeed, txSpeed);
    await c.env.DB.batch([updateStmt, insertHistoryStmt]);
  } else {
    await updateStmt.run();
  }

  const targetsRes = await c.env.DB.prepare(
    "SELECT id, name, type, target, expected_status FROM probe_targets WHERE enabled = 1 AND type IN ('tcp_node', 'http_node')",
  ).all<{ id: string; name: string; type: string; target: string; expected_status: number }>();

  return c.json({
    ok: true,
    intervalSec: 15,
    probeTargets: (targetsRes.results ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      type: t.type,
      target: t.target,
      expectedStatus: t.expected_status,
    })),
  });
});

app.get("/install.sh", (c) => {
  const url = new URL(c.req.url);
  const serverUrl = `${url.protocol}//${url.host}`;
  const script = renderInstallScript(serverUrl, c.env.AGENT_DOWNLOAD_BASE || "");
  return c.text(script, 200, { "Content-Type": "text/x-shellscript; charset=utf-8" });
});

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

app.get("*", async (c) => {
  if (!c.env.ASSETS) {
    return c.text("Static assets binding is not configured.", 500);
  }
  const resp = await c.env.ASSETS.fetch(c.req.raw);
  if (resp.status === 404) {
    const pathname = new URL(c.req.url).pathname;
    if (!pathname.includes(".")) {
      const indexUrl = new URL("/index.html", c.req.url);
      return c.env.ASSETS.fetch(new Request(indexUrl, c.req.raw));
    }
  }
  return resp;
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        await runEdgeProbes(env.DB);
        if (new Date().getMinutes() < 2) {
          await pruneOldHistory(env.DB);
        }
      })(),
    );
  },
};
