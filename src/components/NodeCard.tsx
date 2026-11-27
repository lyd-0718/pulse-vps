import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Cpu,
  HardDrive,
  MemoryStick,
  RefreshCw,
  Tag,
} from "lucide-react";
import type { NodeDto, NodeProbeResult } from "../../shared/types";
import {
  computeRemainingValue,
  cycleLabel,
  daysUntil,
  formatBytes,
  formatCurrency,
  formatRelativeTime,
  formatSpeed,
  formatSpeedBits,
  gbToBytes,
} from "../lib/format";
import { classifyProbe, type ProbeCarrier } from "../lib/probes";

interface NodeCardProps {
  node: NodeDto;
  onSelect: (node: NodeDto) => void;
}

const THREE_CARRIERS: ReadonlyArray<{
  id: Exclude<ProbeCarrier, "global">;
  label: string;
  dot: string;
}> = [
  { id: "cu", label: "联通", dot: "#e11d48" },
  { id: "ct", label: "电信", dot: "#007AFF" },
  { id: "cm", label: "移动", dot: "#16a34a" },
];

function shortUptimeDays(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "在线 <1 天";
  const days = Math.floor(seconds / 86400);
  if (days >= 1) return `在线 ${days} 天`;
  const hours = Math.floor(seconds / 3600);
  if (hours >= 1) return `在线 ${hours} 小时`;
  return `在线 ${Math.max(1, Math.floor(seconds / 60))} 分钟`;
}

function osShortLabel(os: string): string {
  const s = (os || "").toLowerCase();
  if (s.includes("debian")) return "Debian";
  if (s.includes("ubuntu")) return "Ubuntu";
  if (s.includes("alpine")) return "Alpine";
  if (s.includes("centos") || s.includes("rocky") || s.includes("alma")) return "RHEL";
  if (s.includes("arch")) return "Arch";
  return "Linux";
}

function latencySegColor(p: NodeProbeResult): string {
  if (!p.ok) return "#ef4444";
  if (p.latencyMs <= 60) return "#22c55e";
  if (p.latencyMs <= 165) return "#eab308";
  return "#f43f5e";
}

function lossSegColor(p: NodeProbeResult): string {
  if (!p.ok || p.lossPct >= 20) return "#ef4444";
  if (p.lossPct > 0) return "#f59e0b";
  return "#22c55e";
}

export function NodeCard({ node, onSelect }: NodeCardProps) {
  const [speedUnit, setSpeedUnit] = useState<"bytes" | "bits">("bytes");

  const unitBase = node.trafficUnitBase === 1000 ? 1000 : 1024;
  const memPct = node.memTotal > 0 ? Math.min(100, (node.memUsed / node.memTotal) * 100) : 0;
  const diskPct = node.diskTotal > 0 ? Math.min(100, (node.diskUsed / node.diskTotal) * 100) : 0;
  const trafficLimitBytes = gbToBytes(node.trafficLimitGb, unitBase);
  const trafficPct =
    trafficLimitBytes > 0 ? Math.min(100, (node.trafficUsedBytes / trafficLimitBytes) * 100) : 0;

  const expireDays = daysUntil(node.expireDate);
  const remainingValue = computeRemainingValue(node.price, node.billingCycle, node.expireDate);
  const isWarning = node.online && (node.cpuUsage >= 85 || memPct >= 90 || trafficPct >= 85);
  const statusColor = !node.online ? "#FF3B30" : isWarning ? "#FF9500" : "#22c55e";

  const carrierRows = useMemo(() => {
    return THREE_CARRIERS.map((c) => {
      const probes = node.nodeProbes
        .map((probe) => ({ probe, meta: classifyProbe(probe.name, probe.target) }))
        .filter((item) => item.meta.carrier === c.id)
        .sort((a, b) => a.meta.regionOrder - b.meta.regionOrder)
        .map((item) => item.probe);

      const okList = probes.filter((p) => p.ok);
      const avgMs =
        okList.length > 0
          ? Math.round(okList.reduce((acc, p) => acc + p.latencyMs, 0) / okList.length)
          : null;
      const avgLoss =
        probes.length > 0
          ? probes.reduce((acc, p) => acc + p.lossPct, 0) / probes.length
          : null;

      return { ...c, probes, avgMs, avgLoss };
    });
  }, [node.nodeProbes]);

  const fmtSpeed = speedUnit === "bits" ? formatSpeedBits : formatSpeed;
  const priceTag =
    node.price > 0
      ? `${formatCurrency(node.price, node.currency)} / ${cycleLabel(node.billingCycle).replace("付", "")}`
      : null;

  return (
    <article
      onClick={() => onSelect(node)}
      className="liquid-glass liquid-glass-interactive flex cursor-pointer flex-col gap-3 rounded-[22px] p-4 text-left"
    >
      {/* Row 1: Identity, Status Dot, OS Pill, Flag + Sub-meta Pills */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(node);
            }}
            className="group flex min-w-0 items-center gap-2 rounded-lg text-left focus-visible:outline-2"
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: statusColor,
                boxShadow: `0 0 0 3px ${statusColor}24`,
              }}
            />
            <h2 className="truncate text-[15.5px] font-semibold tracking-[-0.02em] text-[#1d1d1f] transition-colors group-hover:text-[#0058c4]">
              {node.name}
            </h2>
          </button>

          <div className="flex shrink-0 items-center gap-1.5">
            <span className="rounded-md bg-[#1d1d1f]/[0.055] px-1.5 py-0.5 font-mono-num text-[10.5px] font-medium text-[#4c515c]">
              {osShortLabel(node.os)}
            </span>
            <span className="text-[16px] leading-none" aria-hidden="true">
              {node.flag || "🌐"}
            </span>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
            <span
              className={`apple-nums inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
                !node.online
                  ? "bg-[#FF3B30]/12 text-[#c41e14]"
                  : "bg-[#1d1d1f]/[0.055] text-[#4c515c]"
              }`}
            >
              {node.online ? shortUptimeDays(node.uptime) : `离线 · ${formatRelativeTime(node.lastSeenAt)}`}
            </span>
            {priceTag && (
              <span className="apple-nums inline-flex items-center rounded-full bg-[#1d1d1f]/[0.055] px-2 py-0.5 font-medium text-[#4c515c]">
                {priceTag}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSpeedUnit((u) => (u === "bytes" ? "bits" : "bytes"));
            }}
            aria-label={`切换速率单位，当前 ${speedUnit === "bits" ? "Mbps" : "B/s"}`}
            title="点击切换 B/s 与 bps 速率单位"
            className="inline-flex min-h-[24px] items-center gap-1 rounded-full px-2 font-mono-num text-[11px] font-medium text-[#555a66] transition hover:bg-white/80 hover:text-[#0058c4]"
          >
            <span>{speedUnit === "bits" ? "Mbps" : "MB/s"}</span>
            <RefreshCw className="h-2.5 w-2.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Row 2: 2x2 High-Density Resource Grid with Crisp Progress Bars */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-[#1d1d1f]/[0.07] pt-3">
        {/* CPU */}
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-1 text-[12px]">
            <span className="inline-flex items-center gap-1 font-medium text-[#4c515c]">
              <Cpu className="h-3.5 w-3.5 text-[#007AFF]" aria-hidden="true" />
              CPU
            </span>
            <span className="font-mono-num font-semibold text-[#1d1d1f]">
              {node.online ? `${node.cpuUsage.toFixed(1)}%` : "—"}
            </span>
          </div>
          <div className="liquid-track mt-1.5 h-[5px] w-full overflow-hidden rounded-full">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${node.online ? Math.max(2, Math.min(100, node.cpuUsage)) : 0}%`,
                backgroundColor: node.cpuUsage >= 85 ? "#FF9500" : "#007AFF",
              }}
            />
          </div>
          <div className="font-mono-num mt-1 truncate text-[11px] text-[#555a66]">
            {node.online
              ? `${node.load1.toFixed(2)}, ${node.load5.toFixed(2)}, ${node.load15.toFixed(2)}`
              : "未连接"}
          </div>
        </div>

        {/* Memory */}
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-1 text-[12px]">
            <span className="inline-flex items-center gap-1 font-medium text-[#4c515c]">
              <MemoryStick className="h-3.5 w-3.5 text-[#16a34a]" aria-hidden="true" />
              内存
            </span>
            <span className="font-mono-num font-semibold text-[#1d1d1f]">
              {node.online ? `${memPct.toFixed(1)}%` : "—"}
            </span>
          </div>
          <div className="liquid-track mt-1.5 h-[5px] w-full overflow-hidden rounded-full">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${node.online ? Math.max(2, memPct) : 0}%`,
                backgroundColor: memPct >= 90 ? "#FF9500" : "#22c55e",
              }}
            />
          </div>
          <div className="font-mono-num mt-1 truncate text-[11px] text-[#555a66]">
            {node.online && node.memTotal > 0
              ? `${formatBytes(node.memUsed, 1)} / ${formatBytes(node.memTotal, 1)}`
              : "—"}
          </div>
        </div>

        {/* Disk */}
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-1 text-[12px]">
            <span className="inline-flex items-center gap-1 font-medium text-[#4c515c]">
              <HardDrive className="h-3.5 w-3.5 text-[#ea580c]" aria-hidden="true" />
              硬盘
            </span>
            <span className="font-mono-num font-semibold text-[#1d1d1f]">
              {node.online && node.diskTotal > 0 ? `${diskPct.toFixed(1)}%` : "—"}
            </span>
          </div>
          <div className="liquid-track mt-1.5 h-[5px] w-full overflow-hidden rounded-full">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${node.online && node.diskTotal > 0 ? Math.max(2, diskPct) : 0}%`,
                backgroundColor: diskPct >= 90 ? "#ef4444" : "#f97316",
              }}
            />
          </div>
          <div className="font-mono-num mt-1 truncate text-[11px] text-[#555a66]">
            {node.online && node.diskTotal > 0
              ? `${formatBytes(node.diskUsed, 1)} / ${formatBytes(node.diskTotal, 1)}`
              : "—"}
          </div>
        </div>

        {/* Monthly Traffic */}
        <div className="min-w-0" title={`每月 ${node.trafficResetDay} 日重置 · ${unitBase} 进制`}>
          <div className="flex items-center justify-between gap-1 text-[12px]">
            <span className="inline-flex items-center gap-1 font-medium text-[#4c515c]">
              <ArrowUpDown className="h-3.5 w-3.5 text-[#5856D6]" aria-hidden="true" />
              流量
            </span>
            <span
              className={`font-mono-num font-semibold ${
                trafficPct >= 85 ? "text-[#9a4500]" : "text-[#1d1d1f]"
              }`}
            >
              {trafficPct.toFixed(1)}%
            </span>
          </div>
          <div className="liquid-track mt-1.5 h-[5px] w-full overflow-hidden rounded-full">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.max(2, trafficPct)}%`,
                backgroundColor: trafficPct >= 85 ? "#FF9500" : "#6366f1",
              }}
            />
          </div>
          <div className="font-mono-num mt-1 truncate text-[11px] text-[#555a66]">
            {formatBytes(node.trafficUsedBytes, 1, unitBase)} / {node.trafficLimitGb} GB
          </div>
        </div>
      </div>

      {/* Row 3: 3-Column Recessed Strip — Live Speed | Cycle Tx/Rx | Expiry & Remaining Value */}
      <div className="liquid-inset grid grid-cols-3 divide-x divide-[#1d1d1f]/[0.07] rounded-[14px] py-2 text-[11.5px]">
        <div className="min-w-0 space-y-0.5 px-2.5">
          <div className="font-mono-num flex items-center gap-1 truncate font-medium text-[#156230]">
            <ArrowUp className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{fmtSpeed(node.netTxSpeed)}</span>
          </div>
          <div className="font-mono-num flex items-center gap-1 truncate font-medium text-[#0058c4]">
            <ArrowDown className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{fmtSpeed(node.netRxSpeed)}</span>
          </div>
        </div>

        <div className="min-w-0 space-y-0.5 px-2.5">
          <div className="font-mono-num flex items-center gap-1 truncate text-[#1d1d1f]" title="本月已用出站">
            <ArrowUp className="h-3 w-3 shrink-0 text-[#555a66]" aria-hidden="true" />
            <span className="truncate">{formatBytes(node.trafficTxCycle, 1, unitBase)}</span>
          </div>
          <div className="font-mono-num flex items-center gap-1 truncate text-[#4c515c]" title="本月已用入站">
            <ArrowDown className="h-3 w-3 shrink-0 text-[#555a66]" aria-hidden="true" />
            <span className="truncate">{formatBytes(node.trafficRxCycle, 1, unitBase)}</span>
          </div>
        </div>

        <div className="min-w-0 space-y-0.5 px-2.5">
          <div
            className={`apple-nums flex items-center gap-1 truncate ${
              expireDays !== null && expireDays <= 10
                ? "font-semibold text-[#9a4500]"
                : "text-[#1d1d1f]"
            }`}
            title={node.expireDate ? `到期日 ${node.expireDate}` : "未配置到期日"}
          >
            <CalendarDays className="h-3 w-3 shrink-0 text-[#555a66]" aria-hidden="true" />
            <span className="truncate">
              {expireDays === null ? "长期" : expireDays <= 0 ? "已到期" : `剩余 ${expireDays} 天`}
            </span>
          </div>
          <div
            className="font-mono-num flex items-center gap-1 truncate text-[#4c515c]"
            title="按剩余天数折算的当前周期剩余价值"
          >
            <Tag className="h-3 w-3 shrink-0 text-[#555a66]" aria-hidden="true" />
            <span className="truncate">
              {remainingValue !== null
                ? formatCurrency(remainingValue, node.currency)
                : `每月 ${node.trafficResetDay} 日重置`}
            </span>
          </div>
        </div>
      </div>

      {/* Row 4: Dual-Column 三网 延迟 & 丢包 Segmented LED Bars (7 real China regions per carrier) */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Latency Box */}
        <div className="liquid-inset rounded-[14px] px-2.5 py-2">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[#555a66]">
            <span>延迟</span>
            <span>三网</span>
          </div>
          <div className="space-y-1.5">
            {carrierRows.map((row) => (
              <div key={`lat-${row.id}`}>
                <div className="flex items-center justify-between gap-1 text-[11.5px]">
                  <span className="inline-flex items-center gap-1.5 text-[#4c515c]">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: row.dot }}
                    />
                    {row.label}
                  </span>
                  <span className="font-mono-num font-semibold text-[#1d1d1f]">
                    {row.avgMs !== null ? `${row.avgMs} ms` : "—"}
                  </span>
                </div>
                <div className="mt-1 flex h-[5px] items-center gap-[2.5px]">
                  {row.probes.length > 0
                    ? row.probes.map((p) => (
                        <span
                          key={p.targetId}
                          title={`${p.name}: ${p.ok ? `${p.latencyMs.toFixed(1)} ms` : "超时"}`}
                          className="h-full flex-1 rounded-[2px]"
                          style={{ backgroundColor: latencySegColor(p) }}
                        />
                      ))
                    : Array.from({ length: 7 }).map((_, i) => (
                        <span key={i} className="h-full flex-1 rounded-[2px] bg-[#1d1d1f]/[0.08]" />
                      ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Packet Loss Box */}
        <div className="liquid-inset rounded-[14px] px-2.5 py-2">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[#555a66]">
            <span>丢包</span>
            <span>三网</span>
          </div>
          <div className="space-y-1.5">
            {carrierRows.map((row) => (
              <div key={`loss-${row.id}`}>
                <div className="flex items-center justify-between gap-1 text-[11.5px]">
                  <span className="inline-flex items-center gap-1.5 text-[#4c515c]">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: row.dot }}
                    />
                    {row.label}
                  </span>
                  <span
                    className={`font-mono-num font-semibold ${
                      row.avgLoss !== null && row.avgLoss > 0 ? "text-[#9a4500]" : "text-[#1d1d1f]"
                    }`}
                  >
                    {row.avgLoss !== null ? `${row.avgLoss.toFixed(1)}%` : "—"}
                  </span>
                </div>
                <div className="mt-1 flex h-[5px] items-center gap-[2.5px]">
                  {row.probes.length > 0
                    ? row.probes.map((p) => (
                        <span
                          key={p.targetId}
                          title={`${p.name}: 丢包 ${p.lossPct.toFixed(1)}%`}
                          className="h-full flex-1 rounded-[2px]"
                          style={{ backgroundColor: lossSegColor(p) }}
                        />
                      ))
                    : Array.from({ length: 7 }).map((_, i) => (
                        <span key={i} className="h-full flex-1 rounded-[2px] bg-[#1d1d1f]/[0.08]" />
                      ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
