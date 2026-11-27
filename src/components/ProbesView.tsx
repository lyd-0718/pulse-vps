import { useState } from "react";
import { Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { EdgeProbeRecord, NodeDto, ProbeTargetDto } from "../../shared/types";
import { formatShortTime } from "../lib/format";

interface ProbesViewProps {
  nodes: NodeDto[];
  probeTargets: ProbeTargetDto[];
  edgeHistory: Record<string, EdgeProbeRecord[]>;
  authenticated: boolean;
  demoMode: boolean;
  runningProbes: boolean;
  onRunNow: () => void;
  onAddProbe: () => void;
  onRequestDeleteProbe: (target: ProbeTargetDto) => void;
  onSelectNode: (nodeId: string) => void;
}

/**
 * Interactive 45-slot Dock-wave uptime bar strip supporting mouse hover,
 * touch tap/scrub, and keyboard inspection.
 */
function WaveUptimeBars({ bars, targetName }: { bars: EdgeProbeRecord[]; targetName: string }) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const total = 45;
  const offset = total - bars.length;
  const activeRec = activeIdx !== null && activeIdx >= offset ? bars[activeIdx - offset] : null;

  const updateFromClientX = (clientX: number, rect: DOMRect) => {
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    setActiveIdx(Math.min(total - 1, Math.floor(ratio * total)));
  };

  return (
    <div className="relative mt-3.5 pt-1">
      {activeIdx !== null && activeRec && (
        <div
          className="pointer-events-none absolute -top-6 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/96 px-2.5 py-0.5 font-mono-num text-[11px] font-medium text-[#1d1d1f] shadow-[0_4px_14px_-3px_rgba(15,23,42,0.18),0_0_0_0.5px_rgba(15,23,42,0.12)]"
          style={{ left: `${Math.min(82, Math.max(18, ((activeIdx + 0.5) / total) * 100))}%` }}
        >
          {formatShortTime(activeRec.ts)} ·{" "}
          {activeRec.ok ? `HTTP ${activeRec.statusCode} · ${activeRec.latencyMs} ms` : activeRec.error || "超时"}
        </div>
      )}

      <div
        role="img"
        aria-label={`${targetName} 近 90 分钟可用性记录`}
        tabIndex={0}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" || e.buttons > 0) {
            updateFromClientX(e.clientX, e.currentTarget.getBoundingClientRect());
          }
        }}
        onPointerDown={(e) => updateFromClientX(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setActiveIdx(null)}
        onFocus={() => setActiveIdx(bars.length > 0 ? total - 1 : null)}
        onBlur={() => setActiveIdx(null)}
        className="flex h-7 cursor-crosshair items-end gap-[3px] rounded-sm"
      >
        {Array.from({ length: total }).map((_, idx) => {
          const rec = idx >= offset ? bars[idx - offset] : undefined;
          const wave = activeIdx === null ? 0 : Math.exp(-Math.pow((idx - activeIdx) / 2.4, 2));
          if (!rec) {
            return (
              <div
                key={idx}
                className="flex-1 rounded-full bg-[#1d1d1f]/[0.08] transition-all duration-150"
                style={{ height: `${(13 + wave * 6).toFixed(1)}px` }}
              />
            );
          }
          const color = !rec.ok ? "#FF3B30" : rec.latencyMs > 350 ? "#FF9500" : "#34C759";
          const hPx = 18 + wave * 9;
          return (
            <div
              key={idx}
              className="flex-1 rounded-full transition-all duration-150"
              style={{
                height: `${hPx.toFixed(1)}px`,
                backgroundColor: color,
                opacity: activeIdx === null ? 0.86 : 0.55 + wave * 0.45,
                boxShadow: wave > 0.75 ? `0 0 8px ${color}55` : undefined,
              }}
            />
          );
        })}
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-[#555a66]">
        <span>90 分钟前</span>
        <span>现在</span>
      </div>
    </div>
  );
}

export function ProbesView({
  nodes,
  probeTargets,
  edgeHistory,
  authenticated,
  demoMode,
  runningProbes,
  onRunNow,
  onAddProbe,
  onRequestDeleteProbe,
  onSelectNode,
}: ProbesViewProps) {
  const [hoveredCell, setHoveredCell] = useState<{ nodeId: string; targetId: string } | null>(null);
  const edgeTargets = probeTargets.filter((t) => t.type === "http_edge");
  const nodeTargets = probeTargets.filter((t) => t.type === "tcp_node" || t.type === "http_node");

  return (
    <div className="space-y-6">
      {/* External Site Availability */}
      <section className="liquid-glass rounded-[26px] p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
              外部站点可用性
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[#4c515c]">
              Cloudflare 边缘每 2 分钟独立探测一次，保留近 90 分钟采样
            </p>
          </div>

          {authenticated && !demoMode && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={runningProbes}
                onClick={onRunNow}
                className="liquid-btn inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium disabled:opacity-60 sm:min-h-[34px]"
              >
                {runningProbes ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#0058c4]" />
                ) : (
                  <Play className="h-3.5 w-3.5 text-[#156230]" />
                )}
                {runningProbes ? "拨测中..." : "立即拨测"}
              </button>
              <button
                type="button"
                onClick={onAddProbe}
                className="liquid-btn-primary inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium sm:min-h-[34px]"
              >
                <Plus className="h-3.5 w-3.5" /> 新增目标
              </button>
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-5 border-t border-[#1d1d1f]/[0.08] pt-5 md:grid-cols-2">
          {edgeTargets.length === 0 ? (
            <div className="col-span-full py-6 text-center text-[12.5px] text-[#555a66]">
              暂无外部站点拨测目标
            </div>
          ) : (
            edgeTargets.map((target) => {
              const bars = edgeHistory[target.id] ?? [];
              const latest = bars[bars.length - 1];
              const okBars = bars.filter((b) => b.ok);
              const uptimePct = bars.length > 0 ? ((okBars.length / bars.length) * 100).toFixed(1) : "100.0";
              const avgMs =
                okBars.length > 0
                  ? Math.round(okBars.reduce((acc, b) => acc + b.latencyMs, 0) / okBars.length)
                  : 0;
              const isHealthy = !latest || latest.ok;

              return (
                <div
                  key={target.id}
                  className="border-b border-[#1d1d1f]/[0.07] pb-4 last:border-b-0 md:[&:nth-last-child(-n+2)]:border-b-0"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor: isHealthy ? "#34C759" : "#FF3B30",
                            boxShadow: `0 0 0 2.5px ${isHealthy ? "#34C75924" : "#FF3B3024"}`,
                          }}
                        />
                        <span className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">
                          {target.name}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate font-mono-num text-[12px] text-[#555a66]">
                        {target.target}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="apple-nums text-[13.5px] font-semibold text-[#1d1d1f]">
                          {uptimePct}%
                        </div>
                        <div className="font-mono-num text-[12px] text-[#555a66]">
                          {avgMs > 0 ? `${avgMs} ms` : "待采样"}
                        </div>
                      </div>
                      {authenticated && !demoMode && (
                        <button
                          type="button"
                          onClick={() => onRequestDeleteProbe(target)}
                          aria-label={`删除外部拨测 ${target.name}`}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-[#555a66] transition hover:bg-[#FF3B30]/10 hover:text-[#c41e14]"
                          title="删除目标"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <WaveUptimeBars bars={bars} targetName={target.name} />
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Multi-VPS Latency Matrix (direct inside glass panel — no redundant nested card box) */}
      <section className="liquid-glass rounded-[26px] p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
              多节点线路延迟矩阵
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[#4c515c]">
              各台 VPS 上的 Go Agent 定时执行 TCPing 三次握手测速，点击主机名可展开详情
            </p>
          </div>
          {authenticated && !demoMode && (
            <button
              type="button"
              onClick={onAddProbe}
              className="liquid-btn inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium sm:min-h-[34px]"
            >
              <Plus className="h-3.5 w-3.5 text-[#0058c4]" /> 添加节点目标
            </button>
          )}
        </div>

        <div
          className="mt-4 overflow-x-auto border-t border-[#1d1d1f]/[0.08]"
          onMouseLeave={() => setHoveredCell(null)}
        >
          <table className="w-full text-left text-[12.5px]">
            <thead className="border-b border-[#1d1d1f]/[0.08] text-[12px] text-[#4c515c]">
              <tr>
                <th className="px-3 py-3 font-medium">VPS 主机</th>
                {nodeTargets.map((t) => {
                  const colActive = hoveredCell?.targetId === t.id;
                  return (
                    <th
                      key={t.id}
                      className={`px-3 py-3 font-medium transition-colors ${
                        colActive ? "bg-white/60 text-[#0058c4]" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className={colActive ? "text-[#0058c4]" : "text-[#1d1d1f]"}>{t.name}</div>
                          <div className="font-mono-num text-[11.5px] font-normal text-[#555a66]">{t.target}</div>
                        </div>
                        {authenticated && !demoMode && (
                          <button
                            type="button"
                            onClick={() => onRequestDeleteProbe(t)}
                            aria-label={`删除节点拨测 ${t.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-[#555a66] hover:bg-[#FF3B30]/10 hover:text-[#c41e14]"
                            title="删除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1d1d1f]/[0.06]">
              {nodes.length === 0 ? (
                <tr>
                  <td colSpan={Math.max(2, nodeTargets.length + 1)} className="p-8 text-center text-[#555a66]">
                    暂无在线节点数据
                  </td>
                </tr>
              ) : (
                nodes.map((node) => {
                  const rowActive = hoveredCell?.nodeId === node.id;
                  return (
                    <tr
                      key={node.id}
                      className={`transition-colors ${rowActive ? "bg-white/45" : ""}`}
                    >
                      <td className="whitespace-nowrap px-3 py-3.5 font-medium text-[#1d1d1f]">
                        <button
                          type="button"
                          onClick={() => onSelectNode(node.id)}
                          className="inline-flex min-h-[32px] items-center gap-2 rounded-lg text-left transition-colors hover:text-[#0058c4]"
                        >
                          <span aria-hidden="true">{node.flag}</span>
                          <span>{node.name}</span>
                        </button>
                      </td>
                      {nodeTargets.map((target) => {
                        const res = node.nodeProbes.find((p) => p.targetId === target.id);
                        const isCrosshair =
                          hoveredCell?.nodeId === node.id || hoveredCell?.targetId === target.id;
                        const isExact =
                          hoveredCell?.nodeId === node.id && hoveredCell?.targetId === target.id;

                        if (!res) {
                          return (
                            <td
                              key={target.id}
                              onMouseEnter={() => setHoveredCell({ nodeId: node.id, targetId: target.id })}
                              className="px-3 py-3.5 font-mono-num text-[#555a66]"
                            >
                              —
                            </td>
                          );
                        }
                        const dotColor = !res.ok
                          ? "#FF3B30"
                          : res.latencyMs <= 60
                            ? "#34C759"
                            : res.latencyMs <= 145
                              ? "#007AFF"
                              : "#FF9500";
                        const barWidth = res.ok ? Math.min(100, Math.max(8, (res.latencyMs / 200) * 100)) : 100;

                        return (
                          <td
                            key={target.id}
                            onMouseEnter={() => setHoveredCell({ nodeId: node.id, targetId: target.id })}
                            className={`whitespace-nowrap px-3 py-3 font-mono-num transition-colors ${
                              isExact ? "bg-white/80" : isCrosshair ? "bg-white/35" : ""
                            }`}
                          >
                            <div className="flex items-center gap-2 text-[#1d1d1f]">
                              <span
                                aria-hidden="true"
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: dotColor }}
                              />
                              <span className={`font-medium ${!res.ok ? "text-[#c41e14]" : ""}`}>
                                {res.ok ? `${res.latencyMs.toFixed(1)} ms` : "超时"}
                              </span>
                              {res.lossPct > 0 && (
                                <span className="text-[11.5px] font-semibold text-[#9a4500]">
                                  {res.lossPct}% 丢包
                                </span>
                              )}
                            </div>
                            <div className="liquid-track mt-1.5 h-[3px] w-20 overflow-hidden rounded-full">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{ width: `${barWidth}%`, backgroundColor: dotColor }}
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
