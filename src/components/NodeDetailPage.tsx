import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Pencil, Terminal, Trash2 } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HistoryPoint, NodeDto } from "../../shared/types";
import { fetchNodeHistory } from "../lib/api";
import {
  cycleLabel,
  daysUntil,
  formatBytes,
  formatCurrency,
  formatRelativeTime,
  formatShortDateTime,
  formatShortTime,
  formatSpeed,
  formatUptime,
  gbToBytes,
} from "../lib/format";
import { CARRIER_FILTERS, carrierBadgeClasses, classifyProbe, type ProbeCarrier } from "../lib/probes";
import { PrecisionTunerBar } from "./PrecisionTunerBar";
import { RingGauge } from "./RingGauge";
import { CopyMorphButton } from "./ui-moments/CopyMorphButton";
import { LeafSegmentedControl } from "./ui-moments/LeafSegmentedControl";
import { SignalReturnLoader } from "./ui-moments/SignalReturnLoader";

interface NodeDetailPageProps {
  node: NodeDto;
  authenticated: boolean;
  onEdit: (node: NodeDto) => void;
  onInstallCmd: (node: NodeDto) => void;
  onDelete: (node: NodeDto) => void;
}

const APPLE_TOOLTIP_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.94)",
  backdropFilter: "blur(20px)",
  border: "0.5px solid rgba(15, 23, 42, 0.14)",
  borderRadius: "12px",
  boxShadow: "0 12px 28px -8px rgba(15, 23, 42, 0.16)",
  fontSize: "12px",
  color: "#1d1d1f",
};

export function NodeDetailPage({
  node,
  authenticated,
  onEdit,
  onInstallCmd,
  onDelete,
}: NodeDetailPageProps) {
  const [range, setRange] = useState<"1h" | "6h" | "24h" | "7d" | "30d">("1h");
  const [probeCarrier, setProbeCarrier] = useState<"all" | ProbeCarrier>("all");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [retrySeq, setRetrySeq] = useState(0);

  const loadHistory = useCallback(() => {
    setRetrySeq((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setHistoryError("");
    setLoadingHistory(true);
    fetchNodeHistory(node.id, range)
      .then((res) => {
        if (active) setHistory(res.points);
      })
      .catch((err) => {
        if (active) {
          setHistory([]);
          setHistoryError(err instanceof Error ? err.message : "历史趋势加载失败");
        }
      })
      .finally(() => {
        if (active) setLoadingHistory(false);
      });
    return () => {
      active = false;
    };
  }, [node.id, range, retrySeq]);

  const unitBase = node.trafficUnitBase === 1000 ? 1000 : 1024;
  const memPct = node.memTotal > 0 ? (node.memUsed / node.memTotal) * 100 : 0;
  const swapPct = node.swapTotal > 0 ? (node.swapUsed / node.swapTotal) * 100 : 0;
  const diskPct = node.diskTotal > 0 ? (node.diskUsed / node.diskTotal) * 100 : 0;
  const trafficLimitBytes = gbToBytes(node.trafficLimitGb, unitBase);
  const trafficPct =
    trafficLimitBytes > 0 ? Math.min(100, (node.trafficUsedBytes / trafficLimitBytes) * 100) : 0;
  const rxShare =
    trafficLimitBytes > 0 ? Math.min(100, (node.trafficRxCycle / trafficLimitBytes) * 100) : 0;
  const expireDays = daysUntil(node.expireDate);

  const chartData = history.map((h) => ({
    label: range === "7d" || range === "30d" ? formatShortDateTime(h.ts) : formatShortTime(h.ts),
    cpu: h.cpu,
    memPct: h.memPct,
    rxMBs: Number((h.rxSpeed / (1024 * 1024)).toFixed(2)),
    txMBs: Number((h.txSpeed / (1024 * 1024)).toFixed(2)),
    load1: h.load1,
    ctMs: h.probes?.ctMs ?? null,
    cuMs: h.probes?.cuMs ?? null,
    cmMs: h.probes?.cmMs ?? null,
  }));
  const hasProbeHistory = chartData.some((d) => d.ctMs !== null || d.cuMs !== null || d.cmMs !== null);

  const carrierRank: Record<ProbeCarrier, number> = { ct: 1, cu: 2, cm: 3, global: 4 };
  const sortedProbes = [...node.nodeProbes]
    .map((probe) => ({ probe, meta: classifyProbe(probe.name, probe.target) }))
    .sort(
      (a, b) =>
        a.meta.regionOrder - b.meta.regionOrder ||
        carrierRank[a.meta.carrier] - carrierRank[b.meta.carrier] ||
        a.probe.name.localeCompare(b.probe.name, "zh-CN"),
    );
  const visibleProbes =
    probeCarrier === "all"
      ? sortedProbes
      : sortedProbes.filter((item) => item.meta.carrier === probeCarrier);
  const okProbes = visibleProbes.filter((item) => item.probe.ok);
  const avgProbeMs =
    okProbes.length > 0
      ? okProbes.reduce((sum, item) => sum + item.probe.latencyMs, 0) / okProbes.length
      : null;

  const trafficModeLabel =
    node.trafficMode === "tx" ? "仅出站 (Tx)" : node.trafficMode === "max" ? "取最大值" : "双向累加 (Rx+Tx)";

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* Section 1: Host Identity + Full-Width Live Telemetry & Monthly Traffic Quota */}
      <section className="liquid-glass rounded-[16px] p-5 sm:p-6">
        <div className="apple-divider flex flex-wrap items-start justify-between gap-4 border-b pb-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[22px] leading-none" aria-hidden="true">
                {node.flag || "🌐"}
              </span>
              <h2 className="text-[22px] font-semibold tracking-[-0.025em] text-[#1d1d1f]">
                {node.name}
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-0.5 text-[12px] font-medium text-[#1d1d1f] shadow-[0_0_0_0.5px_rgba(15,23,42,0.10)]">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: node.online ? "#34C759" : "#FF3B30" }}
                />
                {node.online
                  ? `在线 · 运行 ${formatUptime(node.uptime)}`
                  : `已离线 · ${formatRelativeTime(node.lastSeenAt)}失联`}
              </span>
              {node.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-[#007AFF]/[0.09] px-2.5 py-0.5 text-[11.5px] font-medium text-[#0058c4]"
                >
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[#4c515c]">
              <span>{node.provider || node.region}</span>
              <span aria-hidden="true" className="text-[#9ca3af]">·</span>
              <span className="font-mono-num text-[#1d1d1f]">{node.ip || "未上报 IP"}</span>
              {node.ip && !node.ip.includes("*") && (
                <CopyMorphButton
                  text={node.ip}
                  variant="inline"
                  label="复制 IP"
                  copiedLabel="已复制"
                  className="!min-h-[24px] !px-2 text-[11px]"
                />
              )}
              <span aria-hidden="true" className="text-[#9ca3af]">·</span>
              <span>
                {node.os || "Linux"} ({node.arch || "amd64"})
              </span>
              {node.online && (
                <>
                  <span aria-hidden="true" className="text-[#9ca3af]">·</span>
                  <span className="apple-nums text-[#555a66]">
                    更新于 {formatRelativeTime(node.lastSeenAt)}
                  </span>
                </>
              )}
            </div>
          </div>

          {authenticated && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onInstallCmd(node)}
                className="liquid-btn-primary inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium"
              >
                <Terminal className="h-3.5 w-3.5" /> 部署命令
              </button>
              <button
                type="button"
                onClick={() => onEdit(node)}
                className="liquid-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium"
              >
                <Pencil className="h-3.5 w-3.5 text-[#4c515c]" /> 编辑配置
              </button>
              <button
                type="button"
                onClick={() => onDelete(node)}
                className="liquid-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium text-[#c41e14]"
              >
                <Trash2 className="h-3.5 w-3.5" /> 删除主机
              </button>
            </div>
          )}
        </div>

        {/* Full-Width Gauges + Live Throughput + Monthly Traffic Quota */}
        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
          <div className="liquid-inset grid grid-cols-2 gap-4 rounded-[12px] p-4 sm:grid-cols-4 xl:col-span-7">
            <RingGauge
              value={node.cpuUsage}
              label="CPU"
              detail={node.online ? `Load ${node.load1.toFixed(2)}` : "未连接"}
              offline={!node.online}
              size={58}
              accent="blue"
            />
            <RingGauge
              value={memPct}
              label="物理内存"
              detail={node.online ? `${formatBytes(node.memUsed, 1)} / ${formatBytes(node.memTotal, 0)}` : "—"}
              offline={!node.online}
              size={58}
              accent="indigo"
            />
            <RingGauge
              value={diskPct}
              label="根分区磁盘"
              detail={
                node.online && node.diskTotal > 0
                  ? `${Math.round(node.diskUsed / 1024 ** 3)}/${Math.round(node.diskTotal / 1024 ** 3)} GB`
                  : "—"
              }
              offline={!node.online || node.diskTotal === 0}
              size={58}
              accent="teal"
            />
            <div className="flex flex-col items-center justify-center text-center sm:items-start sm:border-l sm:border-[#1d1d1f]/[0.08] sm:pl-4 sm:text-left">
              <div className="text-[12px] font-medium text-[#555a66]">实时吞吐</div>
              <div className="font-mono-num mt-1 text-[14px] font-semibold text-[#1d1d1f]">
                ↓ {formatSpeed(node.netRxSpeed)}
              </div>
              <div className="font-mono-num text-[13px] font-medium text-[#4c515c]">
                ↑ {formatSpeed(node.netTxSpeed)}
              </div>
              <div className="font-mono-num mt-1 text-[11px] text-[#555a66]">
                {node.tcpConns} TCP · {node.procCount} 进程
              </div>
            </div>
          </div>

          <div className="liquid-inset flex flex-col justify-center rounded-[12px] p-4 xl:col-span-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]">
              <span className="font-medium text-[#1d1d1f]">
                本月流量配额
                <span className="ml-1.5 text-[11.5px] font-normal text-[#555a66]">
                  (每月 {node.trafficResetDay} 日重置 · {unitBase} 进制)
                </span>
              </span>
              <span className="apple-nums font-semibold text-[#1d1d1f]">
                {formatBytes(node.trafficUsedBytes, 2, unitBase)}
                <span className="font-normal text-[#555a66]"> / {node.trafficLimitGb} GB</span>
                <span className={`ml-1.5 ${trafficPct >= 85 ? "text-[#9a4500]" : "text-[#4c515c]"}`}>
                  ({trafficPct.toFixed(1)}%)
                </span>
              </span>
            </div>
            <PrecisionTunerBar
              percent={trafficPct}
              rxPercent={rxShare}
              rxBytes={node.trafficRxCycle}
              txBytes={node.trafficTxCycle}
              limitGb={node.trafficLimitGb}
              unitBase={unitBase}
              warning={trafficPct >= 85}
            />
          </div>
        </div>
      </section>

      {/* Section 2: Full-Width Performance History Charts */}
      <section className="liquid-glass rounded-[16px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[16px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">性能与三网历史趋势</h3>
            <p className="mt-0.5 text-[12px] text-[#555a66]">
              每分钟自动落盘 CPU、带宽与三网均值延迟，本地 SQLite 保留近 30 天历史
            </p>
          </div>
          <LeafSegmentedControl
            size="sm"
            ariaLabel="选择历史时间范围"
            value={range}
            onChange={setRange}
            options={[
              { id: "1h", label: "1h" },
              { id: "6h", label: "6h" },
              { id: "24h", label: "24h" },
              { id: "7d", label: "7d" },
              { id: "30d", label: "30d" },
            ]}
          />
        </div>

        {loadingHistory ? (
          <div className="liquid-inset mt-4 flex h-56 items-center justify-center rounded-[12px]">
            <SignalReturnLoader size={44} label="正在加载历史采样..." />
          </div>
        ) : historyError ? (
          <div className="liquid-inset mt-4 flex h-48 flex-col items-center justify-center gap-2.5 rounded-[12px] px-4 text-center">
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#c41e14]">
              <AlertCircle className="h-4 w-4" />
              历史曲线加载失败：{historyError}
            </div>
            <button
              type="button"
              onClick={loadHistory}
              className="liquid-btn min-h-[36px] rounded-full px-4 text-[12px] font-medium"
            >
              重新加载
            </button>
          </div>
        ) : chartData.length === 0 ? (
          <div className="liquid-inset mt-4 flex h-48 items-center justify-center rounded-[12px] px-4 text-center text-[12.5px] text-[#555a66]">
            暂无该时间段历史采样（Agent 每 1 分钟落盘一次历史曲线）
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="liquid-inset rounded-[12px] p-4">
              <div className="mb-3 flex items-center justify-between text-[12.5px]">
                <span className="font-medium text-[#1d1d1f]">CPU 与内存占用 (%)</span>
                <div className="flex items-center gap-3 text-[11.5px] text-[#4c515c]">
                  <span className="flex items-center gap-1.5">
                    <i className="h-1.5 w-1.5 rounded-full bg-[#007AFF]" /> CPU
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="h-1.5 w-1.5 rounded-full bg-[#5856D6]" /> 内存
                  </span>
                </div>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="pageCpuGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#007AFF" stopOpacity={0.22} />
                        <stop offset="100%" stopColor="#007AFF" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="rgba(29,29,31,0.07)" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10.5, fill: "#555a66" }} minTickGap={28} />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10.5, fill: "#555a66" }} width={30} />
                    <Tooltip contentStyle={APPLE_TOOLTIP_STYLE} />
                    <Area type="monotone" dataKey="cpu" name="CPU %" stroke="#007AFF" fill="url(#pageCpuGrad)" strokeWidth={1.8} isAnimationActive={false} />
                    <Area type="monotone" dataKey="memPct" name="内存 %" stroke="#5856D6" fill="none" strokeWidth={1.6} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="liquid-inset rounded-[12px] p-4">
              <div className="mb-3 flex items-center justify-between text-[12.5px]">
                <span className="font-medium text-[#1d1d1f]">网络吞吐带宽 (MB/s)</span>
                <div className="flex items-center gap-3 text-[11.5px] text-[#4c515c]">
                  <span className="flex items-center gap-1.5">
                    <i className="h-1.5 w-1.5 rounded-full bg-[#007AFF]" /> 下行
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="h-1.5 w-1.5 rounded-full bg-[#30B0C7]" /> 上行
                  </span>
                </div>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="pageNetGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#30B0C7" stopOpacity={0.20} />
                        <stop offset="100%" stopColor="#30B0C7" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="rgba(29,29,31,0.07)" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10.5, fill: "#555a66" }} minTickGap={28} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10.5, fill: "#555a66" }} width={36} />
                    <Tooltip contentStyle={APPLE_TOOLTIP_STYLE} />
                    <Area type="monotone" dataKey="rxMBs" name="下行 MB/s" stroke="#007AFF" fill="none" strokeWidth={1.8} isAnimationActive={false} />
                    <Area type="monotone" dataKey="txMBs" name="上行 MB/s" stroke="#30B0C7" fill="url(#pageNetGrad)" strokeWidth={1.8} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {hasProbeHistory && (
              <div className="liquid-inset rounded-[12px] p-4 xl:col-span-2">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                  <span className="font-medium text-[#1d1d1f]">全国三网平均延迟趋势 (ms)</span>
                  <div className="flex items-center gap-3 text-[11.5px] text-[#4c515c]">
                    <span className="flex items-center gap-1.5">
                      <i className="h-1.5 w-1.5 rounded-full bg-[#007AFF]" /> 电信
                    </span>
                    <span className="flex items-center gap-1.5">
                      <i className="h-1.5 w-1.5 rounded-full bg-[#e11d48]" /> 联通
                    </span>
                    <span className="flex items-center gap-1.5">
                      <i className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" /> 移动
                    </span>
                  </div>
                </div>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid vertical={false} stroke="rgba(29,29,31,0.07)" />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10.5, fill: "#555a66" }} minTickGap={28} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10.5, fill: "#555a66" }} width={38} unit="ms" />
                      <Tooltip contentStyle={APPLE_TOOLTIP_STYLE} />
                      <Line type="monotone" dataKey="ctMs" name="电信 ms" stroke="#007AFF" strokeWidth={1.8} dot={false} connectNulls isAnimationActive={false} />
                      <Line type="monotone" dataKey="cuMs" name="联通 ms" stroke="#e11d48" strokeWidth={1.8} dot={false} connectNulls isAnimationActive={false} />
                      <Line type="monotone" dataKey="cmMs" name="移动 ms" stroke="#16a34a" strokeWidth={1.8} dot={false} connectNulls isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Section 3: 2-Column Bento — Nationwide Probes (7 cols) + Hardware & Billing Specs (5 cols) */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <section className="liquid-glass rounded-[16px] p-5 sm:p-6 xl:col-span-7">
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-baseline gap-2.5">
              <h3 className="text-[16px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">线路拨测延迟</h3>
              {avgProbeMs !== null && (
                <span className="font-mono-num text-[12px] text-[#555a66]">
                  均值 {avgProbeMs.toFixed(1)} ms ({okProbes.length}/{visibleProbes.length})
                </span>
              )}
            </div>
            <LeafSegmentedControl
              size="sm"
              ariaLabel="筛选节点线路运营商"
              value={probeCarrier}
              onChange={setProbeCarrier}
              options={CARRIER_FILTERS}
            />
          </div>

          {visibleProbes.length === 0 ? (
            <div className="liquid-inset rounded-[18px] py-10 text-center text-[12.5px] text-[#555a66]">
              当前筛选条件下暂无线路拨测数据
            </div>
          ) : (
            <div className="liquid-inset grid grid-cols-1 gap-x-6 divide-y divide-[#1d1d1f]/[0.07] rounded-[18px] px-4 sm:grid-cols-2 sm:divide-y-0">
              {visibleProbes.map(({ probe: p, meta }) => (
                <div
                  key={p.targetId}
                  className="flex items-center justify-between gap-2 py-2.5 text-[12.5px] sm:border-b sm:border-[#1d1d1f]/[0.07] sm:[&:nth-last-child(-n+2)]:border-b-0"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium text-[#1d1d1f]">{p.name}</span>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${carrierBadgeClasses(meta.carrier)}`}
                    >
                      {meta.carrierLabel}
                    </span>
                  </div>
                  <div className="apple-nums flex shrink-0 items-center gap-2">
                    {p.lossPct > 0 && (
                      <span className="text-[11px] font-semibold text-[#9a4500]">{p.lossPct.toFixed(0)}% 丢包</span>
                    )}
                    <span
                      className={`font-mono-num font-semibold ${
                        !p.ok ? "text-[#c41e14]" : p.latencyMs > 150 ? "text-[#9a4500]" : "text-[#1d1d1f]"
                      }`}
                    >
                      {p.ok ? `${p.latencyMs.toFixed(1)} ms` : "超时"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="liquid-glass rounded-[16px] p-5 sm:p-6 xl:col-span-5">
          <h3 className="mb-3.5 text-[16px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            主机规格与资产台账
          </h3>
          <div className="liquid-inset divide-y divide-[#1d1d1f]/[0.07] rounded-[18px] px-4 text-[12.5px]">
            <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-[#4c515c]">处理器</span>
              <span className="text-right font-medium text-[#1d1d1f]">
                {node.cpuModel || "Unknown"} ({node.cpuCores} vCPU)
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-[#4c515c]">系统与内核</span>
              <span className="font-mono-num text-right text-[#1d1d1f]">
                {node.kernel || "—"}
              </span>
            </div>
            {(node.agentVersion || node.netIface) && (
              <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="text-[#4c515c]">Agent 与网卡</span>
                <span className="font-mono-num text-right text-[#1d1d1f]">
                  {node.agentVersion ? `v${node.agentVersion}` : "v1.0"} · {node.netIface || "auto"}
                </span>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-[#4c515c]">负载 (1/5/15m)</span>
              <span className="font-mono-num text-[#1d1d1f]">
                {node.load1.toFixed(2)} / {node.load5.toFixed(2)} / {node.load15.toFixed(2)}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-[#4c515c]">Swap 交换空间</span>
              <span className="font-mono-num text-[#1d1d1f]">
                {node.swapTotal > 0
                  ? `${formatBytes(node.swapUsed, 1)} / ${formatBytes(node.swapTotal, 0)} (${swapPct.toFixed(0)}%)`
                  : "未启用"}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-[#4c515c]">流量口径</span>
              <span className="text-[#1d1d1f]">
                {trafficModeLabel} · {unitBase} 进制
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-[#4c515c]">账单周期</span>
              <span className="apple-nums font-medium text-[#1d1d1f]">
                {node.price > 0
                  ? `${formatCurrency(node.price, node.currency)} / ${cycleLabel(node.billingCycle)}`
                  : "未登记"}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-[#4c515c]">到期与续费</span>
              <span className="apple-nums text-right text-[#1d1d1f]">
                {node.expireDate ? (
                  <>
                    <span className="font-mono-num">{node.expireDate}</span>
                    {expireDays !== null && (
                      <span className={`ml-1.5 ${expireDays <= 10 ? "font-semibold text-[#9a4500]" : "text-[#4c515c]"}`}>
                        ({expireDays <= 0 ? "已到期" : `余 ${expireDays} 天`})
                      </span>
                    )}
                    <span className={`ml-1.5 text-[11.5px] ${node.autoRenew ? "text-[#156230]" : "text-[#555a66]"}`}>
                      · {node.autoRenew ? "自动续费" : "手动续费"}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </span>
            </div>
            {node.notes && (
              <div className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <span className="text-[#4c515c]">备注</span>
                <span className="max-w-[260px] text-right text-[#1d1d1f]">{node.notes}</span>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Section 4: Docker Containers on this host */}
      <section className="liquid-glass rounded-[16px] p-5 sm:p-6">
        <div className="mb-3.5 flex items-center justify-between">
          <h3 className="text-[16px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            Docker 容器 <span className="font-normal text-[#555a66]">({node.containers.length})</span>
          </h3>
        </div>
        {node.containers.length === 0 ? (
          <div className="liquid-inset rounded-[18px] p-6 text-center text-[12.5px] text-[#555a66]">
            未检测到运行中的 Docker Socket 或当前主机无容器
          </div>
        ) : (
          <div className="liquid-inset overflow-x-auto rounded-[18px]">
            <table className="w-full text-left text-[12.5px]">
              <thead className="border-b border-[#1d1d1f]/[0.08] text-[12px] text-[#4c515c]">
                <tr>
                  <th className="px-4 py-3 font-medium">容器名称</th>
                  <th className="px-4 py-3 font-medium">镜像</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 text-right font-medium">CPU</th>
                  <th className="px-4 py-3 text-right font-medium">内存</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1d1d1f]/[0.06]">
                {node.containers.map((c) => (
                  <tr key={c.id} className="transition hover:bg-white/45">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-[#1d1d1f]">{c.name}</td>
                    <td className="max-w-[260px] truncate px-4 py-3 font-mono-num text-[12px] text-[#555a66]">
                      {c.image}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-[#1d1d1f]">
                        <span
                          aria-hidden="true"
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: c.state === "running" ? "#34C759" : "#FF3B30" }}
                        />
                        {c.status || (c.state === "running" ? "运行中" : c.state)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono-num text-[#1d1d1f]">{c.cpuPct.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right font-mono-num text-[#4c515c]">{formatBytes(c.memUsed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
