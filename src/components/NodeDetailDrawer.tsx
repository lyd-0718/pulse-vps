import { useCallback, useEffect, useId, useState } from "react";
import { AlertCircle, Pencil, Power, RefreshCw, Terminal, Trash2, X } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HistoryPoint, NodeDto } from "../../shared/types";
import { fetchNodeHistory } from "../lib/api";
import { generateDemoHistory } from "../lib/demo-data";
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
} from "../lib/format";
import { AccessibleModal } from "./AccessibleModal";
import { RingGauge } from "./RingGauge";

interface NodeDetailDrawerProps {
  node: NodeDto | null;
  demoMode: boolean;
  authenticated: boolean;
  onClose: () => void;
  onEdit: (node: NodeDto) => void;
  onInstallCmd: (node: NodeDto) => void;
  onDelete: (node: NodeDto) => void;
  onToggleDemoOffline?: (nodeId: string) => void;
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

export function NodeDetailDrawer({
  node,
  demoMode,
  authenticated,
  onClose,
  onEdit,
  onInstallCmd,
  onDelete,
  onToggleDemoOffline,
}: NodeDetailDrawerProps) {
  const titleId = useId();
  const [range, setRange] = useState<"1h" | "6h" | "24h" | "7d">("1h");
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [retrySeq, setRetrySeq] = useState(0);

  const loadHistory = useCallback(() => {
    setRetrySeq((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!node) return;
    let active = true;
    setHistoryError("");
    if (demoMode) {
      setHistory(generateDemoHistory(node, range));
      setLoadingHistory(false);
      return;
    }
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
  }, [node?.id, range, demoMode, retrySeq]);

  if (!node) return null;

  const memPct = node.memTotal > 0 ? (node.memUsed / node.memTotal) * 100 : 0;
  const diskPct = node.diskTotal > 0 ? (node.diskUsed / node.diskTotal) * 100 : 0;
  const expireDays = daysUntil(node.expireDate);

  // Unified MB/s unit matching the top throughput readout
  const chartData = history.map((h) => ({
    label: range === "7d" ? formatShortDateTime(h.ts) : formatShortTime(h.ts),
    cpu: h.cpu,
    memPct: h.memPct,
    rxMBs: Number((h.rxSpeed / (1024 * 1024)).toFixed(2)),
    txMBs: Number((h.txSpeed / (1024 * 1024)).toFixed(2)),
    load1: h.load1,
  }));

  return (
    <AccessibleModal open={!!node} onClose={onClose} titleId={titleId} variant="drawer">
      <div className="liquid-sheet flex h-full w-full flex-col overflow-y-auto rounded-[24px] p-5 sm:rounded-[28px] sm:p-6">
        {/* Sheet Header */}
        <div className="apple-divider flex flex-wrap items-start justify-between gap-3 border-b pb-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl leading-none" aria-hidden="true">{node.flag}</span>
              <h2 id={titleId} className="text-[20px] font-semibold tracking-[-0.025em] text-[#1d1d1f]">
                {node.name}
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-2.5 py-0.5 text-[12px] font-medium text-[#1d1d1f] shadow-[0_0_0_0.5px_rgba(15,23,42,0.10)]">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: node.online ? "#34C759" : "#FF3B30" }}
                />
                {node.online
                  ? `在线 · ${formatUptime(node.uptime)}`
                  : `已离线 · ${formatRelativeTime(node.lastSeenAt)}失联`}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-[#4c515c]">
              {node.provider || node.region} · <span className="font-mono-num">{node.ip || "未上报 IP"}</span> · {node.os || "Linux"} ({node.arch || "amd64"})
              {!demoMode && node.online && ` · 更新于 ${formatRelativeTime(node.lastSeenAt)}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {demoMode && onToggleDemoOffline && (
              <button
                type="button"
                onClick={() => onToggleDemoOffline(node.id)}
                className="liquid-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-[12px] font-medium"
              >
                <Power className="h-3.5 w-3.5 text-[#4c515c]" />
                {node.online ? "模拟断线" : "恢复上线"}
              </button>
            )}
            {authenticated && !demoMode && (
              <>
                <button
                  type="button"
                  onClick={() => onInstallCmd(node)}
                  className="liquid-btn-primary inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium"
                >
                  <Terminal className="h-3.5 w-3.5" /> 部署命令
                </button>
                <button
                  type="button"
                  onClick={() => onEdit(node)}
                  className="liquid-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-[12px] font-medium"
                >
                  <Pencil className="h-3.5 w-3.5 text-[#4c515c]" /> 编辑
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(node)}
                  className="liquid-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-[#c41e14]"
                >
                  <Trash2 className="h-3.5 w-3.5" /> 删除
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="liquid-btn flex h-9 w-9 items-center justify-center rounded-full text-[#4c515c] hover:text-[#1d1d1f]"
              aria-label="关闭主机详情"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Core Gauges + Live Throughput */}
        <div className="liquid-inset mt-5 grid grid-cols-2 gap-4 rounded-[20px] p-4 sm:grid-cols-4">
          <RingGauge
            value={node.cpuUsage}
            label="CPU"
            detail={node.online ? `Load ${node.load1.toFixed(2)}` : "未连接"}
            offline={!node.online}
            size={54}
            accent="blue"
          />
          <RingGauge
            value={memPct}
            label="物理内存"
            detail={node.online ? `${formatBytes(node.memUsed, 1)} / ${formatBytes(node.memTotal, 0)}` : "—"}
            offline={!node.online}
            size={54}
            accent="indigo"
          />
          <RingGauge
            value={diskPct}
            label="根分区磁盘"
            detail={node.online && node.diskTotal > 0 ? `${formatBytes(node.diskUsed, 0)} / ${formatBytes(node.diskTotal, 0)}` : "—"}
            offline={!node.online || node.diskTotal === 0}
            size={54}
            accent="teal"
          />
          <div className="flex flex-col items-center justify-center text-center sm:items-start sm:border-l sm:border-[#1d1d1f]/[0.08] sm:pl-4 sm:text-left">
            <div className="text-[12px] font-medium text-[#555a66]">实时网络吞吐</div>
            <div className="font-mono-num mt-1 text-[13.5px] font-semibold text-[#1d1d1f]">
              ↓ {formatSpeed(node.netRxSpeed)}
            </div>
            <div className="font-mono-num text-[13px] font-medium text-[#4c515c]">
              ↑ {formatSpeed(node.netTxSpeed)}
            </div>
          </div>
        </div>

        {/* History Charts */}
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-semibold tracking-[-0.015em] text-[#1d1d1f]">性能趋势</h3>
            <div className="liquid-segment-track inline-flex items-center rounded-full p-0.5">
              {(["1h", "6h", "24h", "7d"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={range === r}
                  onClick={() => setRange(r)}
                  className={`min-h-[32px] rounded-full px-3 font-mono-num text-[12px] font-medium transition sm:min-h-[28px] ${
                    range === r ? "liquid-segment-thumb font-semibold text-[#1d1d1f]" : "text-[#4c515c] hover:text-[#1d1d1f]"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {loadingHistory ? (
            <div className="liquid-inset mt-3 flex h-48 items-center justify-center gap-2 rounded-[20px] text-[12.5px] text-[#4c515c]">
              <RefreshCw className="h-4 w-4 animate-spin text-[#0058c4]" />
              正在加载历史采样...
            </div>
          ) : historyError ? (
            <div className="liquid-inset mt-3 flex h-44 flex-col items-center justify-center gap-2.5 rounded-[20px] px-4 text-center">
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
            <div className="liquid-inset mt-3 flex h-44 items-center justify-center rounded-[20px] px-4 text-center text-[12.5px] text-[#555a66]">
              暂无该时间段历史采样（Agent 每 1 分钟落盘一次历史曲线）
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3.5 md:grid-cols-2">
              <div className="liquid-inset rounded-[20px] p-4">
                <div className="mb-3 flex items-center justify-between text-[12px]">
                  <span className="font-medium text-[#1d1d1f]">CPU 与内存 (%)</span>
                  <div className="flex items-center gap-3 text-[11.5px] text-[#4c515c]">
                    <span className="flex items-center gap-1.5">
                      <i className="h-1.5 w-1.5 rounded-full bg-[#007AFF]" /> CPU
                    </span>
                    <span className="flex items-center gap-1.5">
                      <i className="h-1.5 w-1.5 rounded-full bg-[#5856D6]" /> 内存
                    </span>
                  </div>
                </div>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="appleCpuGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#007AFF" stopOpacity={0.22} />
                          <stop offset="100%" stopColor="#007AFF" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="rgba(29,29,31,0.07)" />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10.5, fill: "#555a66" }} minTickGap={26} />
                      <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 10.5, fill: "#555a66" }} width={28} />
                      <Tooltip contentStyle={APPLE_TOOLTIP_STYLE} />
                      <Area type="monotone" dataKey="cpu" name="CPU %" stroke="#007AFF" fill="url(#appleCpuGrad)" strokeWidth={1.8} isAnimationActive={false} />
                      <Area type="monotone" dataKey="memPct" name="内存 %" stroke="#5856D6" fill="none" strokeWidth={1.6} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="liquid-inset rounded-[20px] p-4">
                <div className="mb-3 flex items-center justify-between text-[12px]">
                  <span className="font-medium text-[#1d1d1f]">网络带宽 (MB/s)</span>
                  <div className="flex items-center gap-3 text-[11.5px] text-[#4c515c]">
                    <span className="flex items-center gap-1.5">
                      <i className="h-1.5 w-1.5 rounded-full bg-[#007AFF]" /> 下行
                    </span>
                    <span className="flex items-center gap-1.5">
                      <i className="h-1.5 w-1.5 rounded-full bg-[#30B0C7]" /> 上行
                    </span>
                  </div>
                </div>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="appleNetGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#30B0C7" stopOpacity={0.20} />
                          <stop offset="100%" stopColor="#30B0C7" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="rgba(29,29,31,0.07)" />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10.5, fill: "#555a66" }} minTickGap={26} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10.5, fill: "#555a66" }} width={34} />
                      <Tooltip contentStyle={APPLE_TOOLTIP_STYLE} />
                      <Area type="monotone" dataKey="rxMBs" name="下行 MB/s" stroke="#007AFF" fill="none" strokeWidth={1.8} isAnimationActive={false} />
                      <Area type="monotone" dataKey="txMBs" name="上行 MB/s" stroke="#30B0C7" fill="url(#appleNetGrad)" strokeWidth={1.8} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* System Spec Sheet */}
        <div className="mt-6">
          <h3 className="mb-2.5 text-[14px] font-semibold tracking-[-0.015em] text-[#1d1d1f]">主机规格与资产</h3>
          <div className="liquid-inset divide-y divide-[#1d1d1f]/[0.07] rounded-[18px] px-4 text-[12.5px]">
            <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-[#4c515c]">处理器</span>
              <span className="font-medium text-[#1d1d1f]">
                {node.cpuModel || "Unknown"} ({node.cpuCores} vCPU)
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-[#4c515c]">系统内核与连接</span>
              <span className="font-mono-num text-[#1d1d1f]">
                {node.kernel || "—"} · {node.tcpConns} TCP
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-[#4c515c]">账单与到期</span>
              <span className="apple-nums text-[#1d1d1f]">
                {node.price > 0
                  ? `${formatCurrency(node.price, node.currency)} / ${cycleLabel(node.billingCycle)}`
                  : "未登记"}
                {expireDays !== null && (
                  <span className={`ml-2 ${expireDays <= 10 ? "font-semibold text-[#9a4500]" : "text-[#4c515c]"}`}>
                    ({node.expireDate} · {expireDays <= 0 ? "已到期" : `余 ${expireDays} 天`})
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Node Probe Latencies */}
        {node.nodeProbes.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2.5 text-[14px] font-semibold tracking-[-0.015em] text-[#1d1d1f]">线路拨测</h3>
            <div className="liquid-inset divide-y divide-[#1d1d1f]/[0.07] rounded-[18px] px-4">
              {node.nodeProbes.map((p) => (
                <div key={p.targetId} className="flex items-center justify-between py-2.5 text-[12.5px]">
                  <div className="min-w-0">
                    <span className="font-medium text-[#1d1d1f]">{p.name}</span>
                    <span className="font-mono-num ml-2 text-[11.5px] text-[#555a66]">{p.target}</span>
                  </div>
                  <div className="apple-nums flex shrink-0 items-center gap-3">
                    {p.lossPct > 0 && (
                      <span className="text-[11.5px] font-semibold text-[#9a4500]">{p.lossPct.toFixed(0)}% 丢包</span>
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
          </div>
        )}

        {/* Docker Containers */}
        <div className="mt-6">
          <h3 className="mb-2.5 text-[14px] font-semibold tracking-[-0.015em] text-[#1d1d1f]">
            Docker 容器 <span className="font-normal text-[#555a66]">({node.containers.length})</span>
          </h3>
          {node.containers.length === 0 ? (
            <div className="liquid-inset rounded-[18px] p-5 text-center text-[12.5px] text-[#555a66]">
              未检测到运行中的 Docker Socket 或无容器
            </div>
          ) : (
            <div className="liquid-inset overflow-x-auto rounded-[18px]">
              <table className="w-full text-left text-[12px]">
                <thead className="border-b border-[#1d1d1f]/[0.08] text-[11.5px] text-[#4c515c]">
                  <tr>
                    <th className="px-3.5 py-2.5 font-medium">容器</th>
                    <th className="px-3.5 py-2.5 font-medium">镜像</th>
                    <th className="px-3.5 py-2.5 font-medium">状态</th>
                    <th className="px-3.5 py-2.5 text-right font-medium">CPU</th>
                    <th className="px-3.5 py-2.5 text-right font-medium">内存</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1d1d1f]/[0.06]">
                  {node.containers.map((c) => (
                    <tr key={c.id} className="transition hover:bg-white/45">
                      <td className="whitespace-nowrap px-3.5 py-2.5 font-medium text-[#1d1d1f]">{c.name}</td>
                      <td className="max-w-[180px] truncate px-3.5 py-2.5 font-mono-num text-[11.5px] text-[#555a66]">
                        {c.image}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-[12px] text-[#1d1d1f]">
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: c.state === "running" ? "#34C759" : "#FF3B30" }}
                          />
                          {c.state === "running" ? "运行中" : c.state}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-right font-mono-num text-[#1d1d1f]">{c.cpuPct.toFixed(1)}%</td>
                      <td className="px-3.5 py-2.5 text-right font-mono-num text-[#4c515c]">{formatBytes(c.memUsed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AccessibleModal>
  );
}
