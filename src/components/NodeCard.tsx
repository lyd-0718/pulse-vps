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
  { id: "ct", label: "电信", dot: "#2563eb" },
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
  if (!p.ok) return "#dc2626";
  if (p.latencyMs <= 65) return "#16a34a";
  if (p.latencyMs <= 165) return "#d97706";
  return "#e11d48";
}

function lossSegColor(p: NodeProbeResult): string {
  if (!p.ok || p.lossPct >= 20) return "#dc2626";
  if (p.lossPct > 0) return "#d97706";
  return "#16a34a";
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
  const statusColor = !node.online ? "#dc2626" : isWarning ? "#d97706" : "#16a34a";

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
      className="liquid-glass liquid-glass-interactive flex cursor-pointer flex-col gap-3 rounded-[16px] p-4 text-left"
    >
      {/* Row 1: Crisp Hardware Identity Header */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(node);
            }}
            className="group flex min-w-0 items-center gap-2 rounded-md text-left focus-visible:outline-2"
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: statusColor,
                boxShadow: `0 0 0 3px ${statusColor}22, inset 0 1px 0 rgba(255,255,255,0.45)`,
              }}
            />
            <h2 className="truncate text-[15.5px] font-semibold tracking-[-0.02em] text-[#111827] transition-colors group-hover:text-[#0058c4]">
              {node.name}
            </h2>
          </button>

          <div className="flex shrink-0 items-center gap-1.5">
            <span className="rounded-[6px] border border-[#0f172a]/[0.09] bg-[#0f172a]/[0.03] px-1.5 py-0.5 font-mono-num text-[10.5px] font-medium text-[#475569]">
              {osShortLabel(node.os)}
            </span>
            <span className="text-[15.5px] leading-none" aria-hidden="true">
              {node.flag || "🌐"}
            </span>
          </div>
        </div>

        {/* Clean inline telemetry metadata row (no puffy nested pills) */}
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11.5px]">
          <div className="flex min-w-0 items-center gap-1.5 truncate">
            <span
              className={`apple-nums font-medium ${
                !node.online ? "text-[#c41e14]" : "text-[#4c5565]"
              }`}
            >
              {node.online ? shortUptimeDays(node.uptime) : `离线 · ${formatRelativeTime(node.lastSeenAt)}`}
            </span>
            {priceTag && (
              <>
                <span aria-hidden="true" className="text-[#94a3b8]">·</span>
                <span className="apple-nums font-medium text-[#4c5565]">{priceTag}</span>
              </>
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
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-[7px] border border-[#0f172a]/[0.08] bg-white/75 px-2 font-mono-num text-[10.5px] font-medium text-[#475569] shadow-[0_1px_1px_rgba(15,23,42,0.04)] transition hover:border-[#0058c4]/30 hover:bg-white hover:text-[#0058c4]"
          >
            <span>{speedUnit === "bits" ? "Mbps" : "MB/s"}</span>
            <RefreshCw className="h-2.5 w-2.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Row 2: 2x2 Precision Resource Meters (restrained graphite icons, luminous bars) */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-[#0f172a]/[0.07] pt-3">
        {/* CPU */}
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-1 text-[12px]">
            <span className="inline-flex items-center gap-1.5 font-medium text-[#4c5565]">
              <Cpu className="h-3.5 w-3.5 text-[#64748b]" aria-hidden="true" />
              CPU
            </span>
            <span className="font-mono-num font-semibold text-[#111827]">
              {node.online ? `${node.cpuUsage.toFixed(1)}%` : "—"}
            </span>
          </div>
          <div className="liquid-track mt-1.5 h-[6px] w-full overflow-hidden rounded-full">
            <div
              className="meter-fill h-full rounded-full transition-all duration-300"
              style={{
                width: `${node.online ? Math.max(2, Math.min(100, node.cpuUsage)) : 0}%`,
                backgroundColor: node.cpuUsage >= 85 ? "#d97706" : "#2563eb",
              }}
            />
          </div>
          <div className="font-mono-num mt-1 truncate text-[11px] text-[#556070]">
            {node.online
              ? `${node.load1.toFixed(2)}, ${node.load5.toFixed(2)}, ${node.load15.toFixed(2)}`
              : "未连接"}
          </div>
        </div>

        {/* Memory */}
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-1 text-[12px]">
            <span className="inline-flex items-center gap-1.5 font-medium text-[#4c5565]">
              <MemoryStick className="h-3.5 w-3.5 text-[#64748b]" aria-hidden="true" />
              内存
            </span>
            <span className="font-mono-num font-semibold text-[#111827]">
              {node.online ? `${memPct.toFixed(1)}%` : "—"}
            </span>
          </div>
          <div className="liquid-track mt-1.5 h-[6px] w-full overflow-hidden rounded-full">
            <div
              className="meter-fill h-full rounded-full transition-all duration-300"
              style={{
                width: `${node.online ? Math.max(2, memPct) : 0}%`,
                backgroundColor: memPct >= 90 ? "#d97706" : "#10b981",
              }}
            />
          </div>
          <div className="font-mono-num mt-1 truncate text-[11px] text-[#556070]">
            {node.online && node.memTotal > 0
              ? `${formatBytes(node.memUsed, 1)} / ${formatBytes(node.memTotal, 1)}`
              : "—"}
          </div>
        </div>

        {/* Disk */}
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-1 text-[12px]">
            <span className="inline-flex items-center gap-1.5 font-medium text-[#4c5565]">
              <HardDrive className="h-3.5 w-3.5 text-[#64748b]" aria-hidden="true" />
              硬盘
            </span>
            <span className="font-mono-num font-semibold text-[#111827]">
              {node.online && node.diskTotal > 0 ? `${diskPct.toFixed(1)}%` : "—"}
            </span>
          </div>
          <div className="liquid-track mt-1.5 h-[6px] w-full overflow-hidden rounded-full">
            <div
              className="meter-fill h-full rounded-full transition-all duration-300"
              style={{
                width: `${node.online && node.diskTotal > 0 ? Math.max(2, diskPct) : 0}%`,
                backgroundColor: diskPct >= 90 ? "#dc2626" : "#d97706",
              }}
            />
          </div>
          <div className="font-mono-num mt-1 truncate text-[11px] text-[#556070]">
            {node.online && node.diskTotal > 0
              ? `${formatBytes(node.diskUsed, 1)} / ${formatBytes(node.diskTotal, 1)}`
              : "—"}
          </div>
        </div>

        {/* Monthly Traffic */}
        <div className="min-w-0" title={`每月 ${node.trafficResetDay} 日重置 · ${unitBase} 进制`}>
          <div className="flex items-center justify-between gap-1 text-[12px]">
            <span className="inline-flex items-center gap-1.5 font-medium text-[#4c5565]">
              <ArrowUpDown className="h-3.5 w-3.5 text-[#64748b]" aria-hidden="true" />
              流量
            </span>
            <span
              className={`font-mono-num font-semibold ${
                trafficPct >= 85 ? "text-[#9a4500]" : "text-[#111827]"
              }`}
            >
              {trafficPct.toFixed(1)}%
            </span>
          </div>
          <div className="liquid-track mt-1.5 h-[6px] w-full overflow-hidden rounded-full">
            <div
              className="meter-fill h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.max(2, trafficPct)}%`,
                backgroundColor: trafficPct >= 85 ? "#d97706" : "#4f46e5",
              }}
            />
          </div>
          <div className="font-mono-num mt-1 truncate text-[11px] text-[#556070]">
            {formatBytes(node.trafficUsedBytes, 1, unitBase)} / {node.trafficLimitGb} GB
          </div>
        </div>
      </div>

      {/* Row 3: Machined 3-Column Recessed Instrument Strip */}
      <div className="liquid-inset grid grid-cols-3 divide-x divide-[#0f172a]/[0.07] rounded-[11px] py-2 text-[11.5px]">
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
          <div className="font-mono-num flex items-center gap-1 truncate font-medium text-[#111827]" title="本月已用出站">
            <ArrowUp className="h-3 w-3 shrink-0 text-[#64748b]" aria-hidden="true" />
            <span className="truncate">{formatBytes(node.trafficTxCycle, 1, unitBase)}</span>
          </div>
          <div className="font-mono-num flex items-center gap-1 truncate text-[#4c5565]" title="本月已用入站">
            <ArrowDown className="h-3 w-3 shrink-0 text-[#64748b]" aria-hidden="true" />
            <span className="truncate">{formatBytes(node.trafficRxCycle, 1, unitBase)}</span>
          </div>
        </div>

        <div className="min-w-0 space-y-0.5 px-2.5">
          <div
            className={`apple-nums flex items-center gap-1 truncate ${
              expireDays !== null && expireDays <= 10
                ? "font-semibold text-[#9a4500]"
                : "font-medium text-[#111827]"
            }`}
            title={node.expireDate ? `到期日 ${node.expireDate}` : "未配置到期日"}
          >
            <CalendarDays className="h-3 w-3 shrink-0 text-[#64748b]" aria-hidden="true" />
            <span className="truncate">
              {expireDays === null ? "长期" : expireDays <= 0 ? "已到期" : `剩余 ${expireDays} 天`}
            </span>
          </div>
          <div
            className="font-mono-num flex items-center gap-1 truncate text-[#4c5565]"
            title="按剩余天数折算的当前周期剩余价值"
          >
            <Tag className="h-3 w-3 shrink-0 text-[#64748b]" aria-hidden="true" />
            <span className="truncate">
              {remainingValue !== null
                ? formatCurrency(remainingValue, node.currency)
                : `每月 ${node.trafficResetDay} 日重置`}
            </span>
          </div>
        </div>
      </div>

      {/* Row 4: Dual-Column 三网 Optical LED Matrices in Recessed Wells */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Latency Box */}
        <div className="liquid-inset rounded-[11px] px-2.5 py-2">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[#556070]">
            <span>延迟</span>
            <span>三网</span>
          </div>
          <div className="space-y-1.5">
            {carrierRows.map((row) => (
              <div key={`lat-${row.id}`}>
                <div className="flex items-center justify-between gap-1 text-[11.5px]">
                  <span className="inline-flex items-center gap-1.5 text-[#4c5565]">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: row.dot }}
                    />
                    {row.label}
                  </span>
                  <span className="font-mono-num font-semibold text-[#111827]">
                    {row.avgMs !== null ? `${row.avgMs} ms` : "—"}
                  </span>
                </div>
                <div className="mt-1 flex h-[6px] items-center gap-[2.5px]">
                  {row.probes.length > 0
                    ? row.probes.map((p) => (
                        <span
                          key={p.targetId}
                          title={`${p.name}: ${p.ok ? `${p.latencyMs.toFixed(1)} ms` : "超时"}`}
                          className="led-seg h-full flex-1 rounded-[2.5px]"
                          style={{ backgroundColor: latencySegColor(p) }}
                        />
                      ))
                    : Array.from({ length: 7 }).map((_, i) => (
                        <span key={i} className="h-full flex-1 rounded-[2.5px] bg-[#0f172a]/[0.09]" />
                      ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Packet Loss Box */}
        <div className="liquid-inset rounded-[11px] px-2.5 py-2">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-[#556070]">
            <span>丢包</span>
            <span>三网</span>
          </div>
          <div className="space-y-1.5">
            {carrierRows.map((row) => (
              <div key={`loss-${row.id}`}>
                <div className="flex items-center justify-between gap-1 text-[11.5px]">
                  <span className="inline-flex items-center gap-1.5 text-[#4c5565]">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: row.dot }}
                    />
                    {row.label}
                  </span>
                  <span
                    className={`font-mono-num font-semibold ${
                      row.avgLoss !== null && row.avgLoss > 0 ? "text-[#9a4500]" : "text-[#111827]"
                    }`}
                  >
                    {row.avgLoss !== null ? `${row.avgLoss.toFixed(1)}%` : "—"}
                  </span>
                </div>
                <div className="mt-1 flex h-[6px] items-center gap-[2.5px]">
                  {row.probes.length > 0
                    ? row.probes.map((p) => (
                        <span
                          key={p.targetId}
                          title={`${p.name}: 丢包 ${p.lossPct.toFixed(1)}%`}
                          className="led-seg h-full flex-1 rounded-[2.5px]"
                          style={{ backgroundColor: lossSegColor(p) }}
                        />
                      ))
                    : Array.from({ length: 7 }).map((_, i) => (
                        <span key={i} className="h-full flex-1 rounded-[2.5px] bg-[#0f172a]/[0.09]" />
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
