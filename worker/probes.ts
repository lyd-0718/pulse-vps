import type { EdgeProbeRecord } from "../shared/types";
import type { ProbeTargetRow } from "./types";

export async function runEdgeProbes(db: D1Database): Promise<number> {
  const res = await db
    .prepare("SELECT * FROM probe_targets WHERE type = 'http_edge' AND enabled = 1")
    .all<ProbeTargetRow>();
  const targets = res.results ?? [];
  if (targets.length === 0) return 0;

  const now = Date.now();
  const records: Array<{ targetId: string; rec: EdgeProbeRecord }> = await Promise.all(
    targets.map(async (target) => {
      const started = Date.now();
      try {
        const resp = await fetch(target.target, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(8000),
          headers: { "User-Agent": "PulseVPS-EdgeProbe/1.0" },
        });
        const latencyMs = Math.max(1, Date.now() - started);
        const ok = target.expected_status
          ? resp.status === target.expected_status || (resp.status >= 200 && resp.status < 400)
          : resp.ok;
        await resp.body?.cancel();
        return {
          targetId: target.id,
          rec: {
            ts: now,
            ok,
            statusCode: resp.status,
            latencyMs,
            error: ok ? "" : `HTTP ${resp.status}`,
          },
        };
      } catch (err) {
        return {
          targetId: target.id,
          rec: {
            ts: now,
            ok: false,
            statusCode: 0,
            latencyMs: Math.max(1, Date.now() - started),
            error: err instanceof Error ? err.message.slice(0, 120) : "Request failed",
          },
        };
      }
    }),
  );

  const stmts = records.map((item) =>
    db
      .prepare(
        "INSERT INTO edge_probe_history (target_id, ts, ok, status_code, latency_ms, error) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        item.targetId,
        item.rec.ts,
        item.rec.ok ? 1 : 0,
        item.rec.statusCode,
        item.rec.latencyMs,
        item.rec.error ?? "",
      ),
  );
  await db.batch(stmts);
  return records.length;
}

export async function pruneOldHistory(db: D1Database, nowMs = Date.now()): Promise<void> {
  const metricsCutoff = nowMs - 7 * 24 * 3600_000;
  const edgeCutoff = nowMs - 3 * 24 * 3600_000;
  await db.batch([
    db.prepare("DELETE FROM metrics_history WHERE ts < ?").bind(metricsCutoff),
    db.prepare("DELETE FROM edge_probe_history WHERE ts < ?").bind(edgeCutoff),
  ]);
}
