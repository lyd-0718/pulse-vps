import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { NodeDto } from "../../shared/types";
import {
  daysUntil,
  formatBytes,
  formatRelativeTime,
  formatSpeed,
  formatUptime,
} from "../lib/format";
import { PrecisionTunerBar } from "./PrecisionTunerBar";
import { RingGauge } from "./RingGauge";
import { Sparkline } from "./Sparkline";

interface NodeCardProps {
  node: NodeDto;
  demoMode: boolean;
  onSelect: (node: NodeDto) => void;
}

type CardPanelMode = "metrics" | "containers" | "probes";

export function NodeCard({ node, demoMode, onSelect }: NodeCardProps) {
  const [panelMode, setPanelMode] = useState<CardPanelMode>("metrics");

  const memPct = node.memTotal > 0 ? (node.memUsed / node.memTotal) * 100 : 0;
  const diskPct = node.diskTotal > 0 ? (node.diskUsed / node.diskTotal) * 100 : 0;
  const trafficLimitBytes = node.trafficLimitGb * 1024 ** 3;
  const trafficPct = trafficLimitBytes > 0 ? Math.min(100, (node.trafficUsedBytes / trafficLimitBytes) * 100) : 0;
  const rxShare =
    trafficLimitBytes > 0 ? Math.min(100, (node.trafficRxCycle / trafficLimitBytes) * 100) : 0;

  const runningContainers = node.containers.filter((c) => c.state === "running").length;
  const okProbes = node.nodeProbes.filter((p) => p.ok);
  const avgLatency =
    okProbes.length > 0
      ? Math.round(okProbes.reduce((acc, p) => acc + p.latencyMs, 0) / okProbes.length)
      : null;

  const expireDays = daysUntil(node.expireDate);
  const isWarning = node.online && (node.cpuUsage >= 85 || memPct >= 90 || trafficPct >= 85);

  const statusColor = !node.online ? "#FF3B30" : isWarning ? "#FF9500" : "#34C759";
  const statusText = !node.online
    ? `离线 · ${formatRelativeTime(node.lastSeenAt)}失联`
    : isWarning
      ? node.cpuUsage >= 85
        ? "高负载"
        : "配额预警"
      : `运行 ${formatUptime(node.uptime)}`;

  return (
    <article className="liquid-glass liquid-glass-interactive flex flex-col gap-4 rounded-[26px] p-5 text-left">
      {/* Header: Semantic H2 trigger + honest status pill (no nested buttons, no decorative dot clutter) */}
      <div className="flex flex-wrap items-start justify-between gap-2 sm:flex-nowrap sm:gap-3">
        <button
          type="button"
          onClick={() => onSelect(node)}
          className="group min-w-0 flex-1 rounded-xl text-left focus-visible:outline-2"
        >
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[17px] leading-none" aria-hidden="true">
              {node.flag || "🌐"}
            </span>
            <h2 className="truncate text-[17px] font-semibold tracking-[-0.02em] text-[#1d1d1f] transition-colors group-hover:text-[#0058c4]">
              {node.name}
            </h2>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12px] text-[#4c515c]">
            <span>{node.provider || node.region}</span>
            {node.cpuCores > 0 && (
              <>
                <span aria-hidden="true" className="text-[#9ca3af]">·</span>
                <span className="apple-nums">
                  {node.cpuCores}C / {formatBytes(node.memTotal, 0)}
                </span>
              </>
            )}
            {node.ip && (
              <>
                <span aria-hidden="true" className="text-[#9ca3af]">·</span>
                <span className="font-mono-num text-[12px] text-[#555a66]">{node.ip}</span>
              </>
            )}
          </div>
        </button>

        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-1 text-[12px] font-medium text-[#1d1d1f] shadow-[0_0_0_0.5px_rgba(15,23,42,0.10)]">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{
              backgroundColor: statusColor,
              boxShadow: `0 0 0 2.5px ${statusColor}24`,
            }}
          />
          <span className="apple-nums">{statusText}</span>
        </span>
      </div>

      {/* Borderless Subtle Surface Band (avoids card-inside-card chrome) for Quick Mode Switching */}
      <div className="liquid-band -mx-5 px-5 py-3.5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div role="tablist" aria-label={`${node.name} 视图切换`} className="liquid-segment-track inline-flex items-center rounded-full p-[2px]">
            {(
              [
                ["metrics", "实时指标"],
                ["containers", `容器 ${runningContainers}/${node.containers.length}`],
                ["probes", avgLatency !== null ? `线路 ${avgLatency} ms` : "线路"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={panelMode === mode}
                onClick={() => setPanelMode(mode)}
                className={`min-h-[34px] rounded-full px-3 text-[12px] font-medium transition-colors duration-100 sm:min-h-[28px] sm:px-2.5 sm:text-[11.5px] ${
                  panelMode === mode
                    ? "liquid-segment-thumb font-semibold text-[#1d1d1f]"
                    : "text-[#4c515c] hover:text-[#1d1d1f]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onSelect(node)}
            className="inline-flex min-h-[34px] items-center gap-0.5 rounded-full px-2 text-[12px] font-medium text-[#0058c4] hover:underline sm:min-h-[28px]"
          >
            详情 <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {panelMode === "metrics" && (
          <div className="grid grid-cols-3 gap-2 pt-0.5">
            <RingGauge
              value={node.cpuUsage}
              label="CPU"
              detail={node.online ? `Load ${node.load1.toFixed(2)}` : "未连接"}
              offline={!node.online}
              accent="blue"
            />
            <RingGauge
              value={memPct}
              label="内存"
              detail={node.online && node.memTotal > 0 ? formatBytes(node.memUsed, 1) : "—"}
              offline={!node.online}
              accent="indigo"
            />
            <RingGauge
              value={diskPct}
              label="磁盘"
              detail={node.online && node.diskTotal > 0 ? `${formatBytes(node.diskUsed, 0)} / ${formatBytes(node.diskTotal, 0)}` : "—"}
              offline={!node.online || node.diskTotal === 0}
              accent="teal"
            />
          </div>
        )}

        {panelMode === "containers" && (
          <div className="divide-y divide-[#1d1d1f]/[0.06]">
            {node.containers.length === 0 ? (
              <div className="py-3 text-center text-[12px] text-[#555a66]">暂无 Docker 容器</div>
            ) : (
              node.containers.slice(0, 3).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between py-1.5 text-[12px]"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: c.state === "running" ? "#34C759" : "#FF3B30" }}
                    />
                    <span className="truncate font-medium text-[#1d1d1f]">{c.name}</span>
                  </div>
                  <div className="font-mono-num flex shrink-0 items-center gap-3 text-[12px] text-[#4c515c]">
                    <span>{c.cpuPct.toFixed(1)}%</span>
                    <span>{formatBytes(c.memUsed, 0)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {panelMode === "probes" && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {node.nodeProbes.length === 0 ? (
              <div className="col-span-2 py-3 text-center text-[12px] text-[#555a66]">暂无节点拨测数据</div>
            ) : (
              node.nodeProbes.slice(0, 4).map((p) => {
                const ratio = Math.min(100, (p.latencyMs / 200) * 100);
                const barColor = !p.ok ? "#FF3B30" : p.latencyMs <= 60 ? "#34C759" : p.latencyMs <= 145 ? "#007AFF" : "#FF9500";
                return (
                  <div key={p.targetId} className="py-1">
                    <div className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="truncate text-[#4c515c]">{p.name.replace(/\s*\(.*/, "")}</span>
                      <span className={`font-mono-num shrink-0 font-semibold ${!p.ok ? "text-[#c41e14]" : "text-[#1d1d1f]"}`}>
                        {p.ok ? `${p.latencyMs.toFixed(0)} ms` : "超时"}
                      </span>
                    </div>
                    <div className="liquid-track mt-1 h-[3px] w-full overflow-hidden rounded-full">
                      <div className="h-full rounded-full" style={{ width: `${ratio}%`, backgroundColor: barColor }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Throughput Wave + Precision Traffic Ruler */}
      <div className="space-y-3.5 px-0.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[12px] text-[#555a66]">下行速率</div>
              <div className="font-mono-num mt-0.5 text-[13.5px] font-semibold text-[#1d1d1f]">
                {formatSpeed(node.netRxSpeed)}
              </div>
            </div>
            <div className="h-6 w-[0.5px] bg-[#1d1d1f]/12" aria-hidden="true" />
            <div>
              <div className="text-[12px] text-[#555a66]">上行速率</div>
              <div className="font-mono-num mt-0.5 text-[13.5px] font-semibold text-[#1d1d1f]">
                {formatSpeed(node.netTxSpeed)}
              </div>
            </div>
          </div>
          <div className="w-36 shrink-0 sm:w-40">
            <Sparkline points={node.sparkline} height={36} offline={!node.online} />
            <div className="mt-0.5 text-right text-[11px] text-[#555a66]">近 6 分钟</div>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-[12px]">
            <span className="text-[#4c515c]">
              本月流量
              <span className="ml-1.5 text-[11.5px] text-[#555a66]">(每月 {node.trafficResetDay} 日重置)</span>
            </span>
            <span className="apple-nums font-medium text-[#1d1d1f]">
              {formatBytes(node.trafficUsedBytes, 0)}
              <span className="text-[#555a66]"> / {node.trafficLimitGb} GB</span>
              <span
                className={`ml-1.5 ${
                  trafficPct >= 85 ? "font-semibold text-[#9a4500]" : "text-[#4c515c]"
                }`}
              >
                {trafficPct.toFixed(0)}%
              </span>
            </span>
          </div>
          <PrecisionTunerBar
            percent={trafficPct}
            rxPercent={rxShare}
            rxBytes={node.trafficRxCycle}
            txBytes={node.trafficTxCycle}
            limitGb={node.trafficLimitGb}
            warning={trafficPct >= 85}
          />
        </div>
      </div>

      {/* Clean Non-Duplicate Footer: Expiry + Last Heartbeat */}
      <div className="apple-divider flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-[12px] text-[#4c515c]">
        <div className="apple-nums flex flex-wrap items-center gap-x-2 gap-y-1">
          {expireDays !== null ? (
            <span className={expireDays <= 10 ? "font-semibold text-[#9a4500]" : ""}>
              {expireDays <= 0 ? "已到期" : `${expireDays} 天后到期`}
              {!node.autoRenew && expireDays <= 15 && " · 手动续费"}
            </span>
          ) : (
            <span>未配置到期日</span>
          )}
        </div>
        <span className="apple-nums text-[11.5px] text-[#555a66]">
          {demoMode ? "模拟心跳" : `心跳 ${formatRelativeTime(node.lastSeenAt)}`}
        </span>
      </div>
    </article>
  );
}
