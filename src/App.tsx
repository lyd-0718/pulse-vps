import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  LayoutGrid,
  List,
  Lock,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings,
} from "lucide-react";
import type {
  BootstrapResponse,
  CurrencyCode,
  NodeDto,
  ProbeTargetDto,
  ProbeType,
  SettingsDto,
} from "../shared/types";
import * as api from "./lib/api";
import { createDemoBootstrap, tickDemoBootstrap } from "./lib/demo-data";
import {
  convertCurrency,
  daysUntil,
  formatBytes,
  formatCurrency,
  formatRelativeTime,
  formatSpeed,
  formatUptime,
  normalizeMonthlyAmount,
} from "./lib/format";
import { ConfirmDialog, type ConfirmDialogState } from "./components/AccessibleModal";
import { AmbientShader, type ShaderPreset } from "./components/AmbientShader";
import { BillingView } from "./components/BillingView";
import { ContainersView } from "./components/ContainersView";
import { GlassSelect } from "./components/GlassSelect";
import { GlassTabs } from "./components/GlassTabs";
import {
  InstallCommandModal,
  LoginModal,
  NodeFormModal,
  ProbeModal,
  SettingsModal,
} from "./components/Modals";
import { NodeCard } from "./components/NodeCard";
import { NodeDetailDrawer } from "./components/NodeDetailDrawer";
import { ProbesView } from "./components/ProbesView";
import { TactileGlassSwitch } from "./components/TactileGlassSwitch";

type TabId = "overview" | "probes" | "containers" | "billing";
type StatusFilter = "all" | "online" | "warn" | "offline";

const VALID_SHADERS: ShaderPreset[] = ["silk-mesh", "soft-dunes", "lagoon-mist"];
const CURRENCY_CYCLE: Record<CurrencyCode, CurrencyCode> = {
  CNY: "USD",
  USD: "EUR",
  EUR: "CNY",
};

const NAV_ITEMS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: "overview", label: "总览" },
  { id: "probes", label: "网络" },
  { id: "containers", label: "容器" },
  { id: "billing", label: "账单" },
];

const TAB_TITLES: Record<TabId, string> = {
  overview: "我的主机",
  probes: "网络与拨测",
  containers: "容器进程",
  billing: "资产与账单",
};

function resolveInitialDemoMode(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "1") return true;
    if (params.get("demo") === "0") return false;
    const saved = localStorage.getItem("pulsevps_mode");
    if (saved === "demo") return true;
    if (saved === "live") return false;
  } catch {
    // ignore
  }
  // Live-first default: never hide real outages behind fake green demo servers
  return false;
}

export function App() {
  const [shaderPreset, setShaderPreset] = useState<ShaderPreset>(() => {
    try {
      const saved = localStorage.getItem("pulsevps_shader_v2") as ShaderPreset | null;
      return saved && VALID_SHADERS.includes(saved) ? saved : "silk-mesh";
    } catch {
      return "silk-mesh";
    }
  });
  const [tab, setTab] = useState<TabId>("overview");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [regionFilter, setRegionFilter] = useState("all");

  const [demoMode, setDemoMode] = useState<boolean>(resolveInitialDemoMode);
  const [demoData, setDemoData] = useState<BootstrapResponse>(() => createDemoBootstrap());
  const [liveData, setLiveData] = useState<BootstrapResponse | null>(null);
  const [liveError, setLiveError] = useState<string>("");
  const [refreshingLive, setRefreshingLive] = useState(false);
  const [currencyOverride, setCurrencyOverride] = useState<CurrencyCode | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [nodeFormOpen, setNodeFormOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<NodeDto | null>(null);
  const [installModal, setInstallModal] = useState<{ node: NodeDto; rawToken: string | null } | null>(null);
  const [probeModalOpen, setProbeModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);
  const [runningProbes, setRunningProbes] = useState(false);
  const [rotatingToken, setRotatingToken] = useState(false);

  const [toast, setToast] = useState<{ text: string; tone: "normal" | "error" } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((text: string, tone: "normal" | "error" = "normal") => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ text, tone });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    try {
      localStorage.setItem("pulsevps_shader_v2", shaderPreset);
    } catch {
      // ignore
    }
  }, [shaderPreset]);

  const loadLive = useCallback(async (manual = false) => {
    if (manual) setRefreshingLive(true);
    try {
      const res = await api.fetchBootstrap();
      setLiveData(res);
      setLiveError("");
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : "连接后端失败");
    } finally {
      if (manual) setRefreshingLive(false);
    }
  }, []);

  // Fetch once on boot so live count is always known
  useEffect(() => {
    loadLive();
  }, [loadLive]);

  // Poll every 10s ONLY in Live mode while the tab is visible (preserves Cloudflare Free quota)
  useEffect(() => {
    if (demoMode) return;
    const onVisibility = () => {
      if (!document.hidden) loadLive();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const id = window.setInterval(() => {
      if (!document.hidden) loadLive();
    }, 10_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(id);
    };
  }, [demoMode, loadLive]);

  // Tick demo data every 3s ONLY while in Demo mode and visible
  useEffect(() => {
    if (!demoMode) return;
    const id = window.setInterval(() => {
      if (!document.hidden) {
        setDemoData((prev) => tickDemoBootstrap(prev));
      }
    }, 3000);
    return () => window.clearInterval(id);
  }, [demoMode]);

  const switchMode = useCallback((toDemo: boolean) => {
    setDemoMode(toDemo);
    setSelectedNodeId(null);
    try {
      localStorage.setItem("pulsevps_mode", toDemo ? "demo" : "live");
    } catch {
      // ignore
    }
  }, []);

  // Global keyboard shortcuts (1-4 switch views, / focus search, r refresh Live)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (
        loginOpen ||
        nodeFormOpen ||
        probeModalOpen ||
        settingsOpen ||
        !!installModal ||
        !!confirmState ||
        !!selectedNodeId
      ) {
        return;
      }
      if (e.key === "1") setTab("overview");
      else if (e.key === "2") setTab("probes");
      else if (e.key === "3") setTab("containers");
      else if (e.key === "4") setTab("billing");
      else if (e.key === "/" && tab === "overview") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "r" && !demoMode) {
        loadLive(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loginOpen, nodeFormOpen, probeModalOpen, settingsOpen, installModal, confirmState, selectedNodeId, tab, demoMode, loadLive]);

  const activeData: BootstrapResponse = demoMode
    ? demoData
    : liveData ?? {
        settings: {
          siteTitle: "PulseVPS",
          siteDomain: "vps.ydiws.xyz",
          publicAccess: "masked",
          displayCurrency: "CNY",
        },
        authenticated: false,
        serverTime: Date.now(),
        nodes: [],
        probeTargets: [],
        edgeProbeHistory: {},
      };

  const displayCurrency = currencyOverride ?? activeData.settings.displayCurrency;
  const selectedNode = activeData.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const regions = useMemo(() => {
    return Array.from(new Set(activeData.nodes.map((n) => n.region).filter(Boolean)));
  }, [activeData.nodes]);

  const filteredNodes = useMemo(() => {
    return activeData.nodes.filter((n) => {
      const memPct = n.memTotal > 0 ? (n.memUsed / n.memTotal) * 100 : 0;
      const trafficLimitBytes = n.trafficLimitGb * 1024 ** 3;
      const trafficPct = trafficLimitBytes > 0 ? (n.trafficUsedBytes / trafficLimitBytes) * 100 : 0;
      const isWarn = n.online && (n.cpuUsage >= 85 || memPct >= 90 || trafficPct >= 85);

      if (statusFilter === "online" && !n.online) return false;
      if (statusFilter === "offline" && n.online) return false;
      if (statusFilter === "warn" && !isWarn) return false;
      if (regionFilter !== "all" && n.region !== regionFilter) return false;

      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${n.name} ${n.provider} ${n.region} ${n.ip} ${n.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activeData.nodes, statusFilter, regionFilter, search]);

  const hasOverviewFilters = search.trim() !== "" || statusFilter !== "all" || regionFilter !== "all";
  const resetOverviewFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setRegionFilter("all");
  };

  const totalNodes = activeData.nodes.length;
  const onlineNodes = activeData.nodes.filter((n) => n.online).length;
  const totalRxSpeed = activeData.nodes.reduce((s, n) => s + n.netRxSpeed, 0);
  const totalTxSpeed = activeData.nodes.reduce((s, n) => s + n.netTxSpeed, 0);
  const totalMonthTraffic = activeData.nodes.reduce((s, n) => s + n.trafficUsedBytes, 0);

  const edgeTargets = activeData.probeTargets.filter((t) => t.type === "http_edge");
  const allEdgeRecords = edgeTargets.flatMap((t) => activeData.edgeProbeHistory[t.id] ?? []);
  const edgeOkNum =
    allEdgeRecords.length > 0
      ? (allEdgeRecords.filter((r) => r.ok).length / allEdgeRecords.length) * 100
      : 100;
  const edgeOkPct = edgeOkNum.toFixed(1);
  const anyLatestEdgeDown = edgeTargets.some((t) => {
    const list = activeData.edgeProbeHistory[t.id] ?? [];
    return list.length > 0 && !list[list.length - 1].ok;
  });
  const edgeStatusColor =
    anyLatestEdgeDown || edgeOkNum < 95 ? "#FF3B30" : edgeOkNum < 99.5 ? "#FF9500" : "#34C759";
  const edgeStatusLabel =
    anyLatestEdgeDown || edgeOkNum < 95 ? "边缘探测异常" : edgeOkNum < 99.5 ? "边缘存在波动" : "边缘探测正常";

  const nodeLatencySamples = activeData.nodes.flatMap((n) => n.nodeProbes.filter((p) => p.ok).map((p) => p.latencyMs));
  const avgNodeLatency =
    nodeLatencySamples.length > 0
      ? Math.round(nodeLatencySamples.reduce((a, b) => a + b, 0) / nodeLatencySamples.length)
      : null;

  const monthlyCost = activeData.nodes.reduce((s, n) => {
    return s + convertCurrency(normalizeMonthlyAmount(n.price, n.billingCycle), n.currency, displayCurrency);
  }, 0);
  const soonestExpiry = activeData.nodes
    .map((n) => ({ name: n.name, days: daysUntil(n.expireDate) }))
    .filter((x): x is { name: string; days: number } => x.days !== null)
    .sort((a, b) => a.days - b.days)[0];

  /* Admin Action Handlers with unified 401 & error recovery */
  const handleAdminError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof api.ApiError && err.status === 401) {
        api.setStoredToken(null);
        loadLive();
        setLoginOpen(true);
        showToast("管理员登录已失效，请重新登录", "error");
        return;
      }
      const msg = err instanceof Error ? err.message : fallback;
      showToast(msg, "error");
    },
    [loadLive, showToast],
  );

  const handleLogin = async (password: string) => {
    await api.loginAdmin(password);
    await loadLive();
    switchMode(false);
    showToast("已登录管理员后台");
  };

  const handleLogout = () => {
    api.setStoredToken(null);
    loadLive();
    showToast("已退出登录");
  };

  const handleSaveNode = async (payload: Partial<NodeDto>, id?: string) => {
    try {
      if (id) {
        await api.updateNode(id, payload);
        await loadLive();
        showToast("节点已更新");
      } else {
        const created = await api.createNode(payload);
        await loadLive();
        setInstallModal({ node: created.node, rawToken: created.rawToken });
        showToast("节点已创建");
      }
    } catch (err) {
      handleAdminError(err, "保存节点失败");
      throw err;
    }
  };

  const requestDeleteNode = (node: NodeDto) => {
    setConfirmState({
      title: `删除主机「${node.name}」？`,
      description: "将从 D1 数据库永久清除该主机的配置、月流量账本与历史采样曲线。VPS 上仍在运行的 Agent 需手动停止或卸载。",
      confirmLabel: "确认删除",
      tone: "danger",
      onConfirm: async () => {
        try {
          await api.deleteNode(node.id);
          setSelectedNodeId(null);
          await loadLive();
          showToast(`已删除主机 ${node.name}`);
        } catch (err) {
          handleAdminError(err, "删除主机失败");
          throw err;
        }
      },
    });
  };

  const requestRotateToken = (node: NodeDto) => {
    setConfirmState({
      title: `重置「${node.name}」的 Agent Token？`,
      description: "重置后旧 Token 会立即失效，该主机当前正在运行的 Agent 将立刻断开上报，直到你用新命令重新部署。",
      confirmLabel: "确认重置 Token",
      tone: "danger",
      onConfirm: async () => {
        setRotatingToken(true);
        try {
          const res = await api.rotateNodeToken(node.id);
          setInstallModal({ node, rawToken: res.rawToken });
          showToast("已生成新 Token，请尽快更新 VPS 上的 Agent");
        } catch (err) {
          handleAdminError(err, "重置 Token 失败");
          throw err;
        } finally {
          setRotatingToken(false);
        }
      },
    });
  };

  const handleRunProbes = async () => {
    setRunningProbes(true);
    try {
      const res = await api.runProbesNow();
      await loadLive();
      showToast(`已完成 ${res.checked} 项边缘拨测`);
    } catch (err) {
      handleAdminError(err, "触发拨测失败");
    } finally {
      setRunningProbes(false);
    }
  };

  const handleCreateProbe = async (payload: {
    name: string;
    type: ProbeType;
    target: string;
    expectedStatus: number;
  }) => {
    try {
      await api.createProbe(payload);
      await loadLive();
      showToast("已添加拨测目标");
    } catch (err) {
      handleAdminError(err, "添加拨测目标失败");
      throw err;
    }
  };

  const requestDeleteProbe = (target: ProbeTargetDto) => {
    setConfirmState({
      title: `删除拨测目标「${target.name}」？`,
      description: `删除后将停止探测 ${target.target} 并移除其可用性记录，操作不可恢复。`,
      confirmLabel: "确认删除",
      tone: "danger",
      onConfirm: async () => {
        try {
          await api.deleteProbe(target.id);
          await loadLive();
          showToast(`已删除拨测目标 ${target.name}`);
        } catch (err) {
          handleAdminError(err, "删除拨测目标失败");
          throw err;
        }
      },
    });
  };

  const handleSaveSettings = async (payload: Partial<SettingsDto>) => {
    try {
      await api.updateSettings(payload);
      await loadLive();
      showToast("偏好设置已存储");
    } catch (err) {
      handleAdminError(err, "保存设置失败");
      throw err;
    }
  };

  const handleToggleDemoOffline = (nodeId: string) => {
    setDemoData((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              online: !n.online,
              lastSeenAt: !n.online ? Date.now() : Date.now() - 18 * 60_000,
              netRxSpeed: !n.online ? 1_200_000 : 0,
              netTxSpeed: !n.online ? 1_900_000 : 0,
            }
          : n,
      ),
    }));
  };

  const allOnline = totalNodes > 0 && onlineNodes === totalNodes;
  const fleetDotColor = totalNodes === 0 ? "#8e8e93" : allOnline ? "#34C759" : onlineNodes === 0 ? "#FF3B30" : "#FF9500";
  const isAuthenticatedLive = Boolean(liveData?.authenticated);

  return (
    <div className="relative min-h-screen text-[#1d1d1f]">
      {/* Serene Stripe-Free WebGL Fluid Shader Backdrop */}
      <AmbientShader preset={shaderPreset} />

      {/* Mobile & Tablet (< lg): Clean Single-Row Sticky Frosted Top Bar (zero title collision, zero scroll bleed) */}
      <header className="liquid-mobile-bar sticky top-0 z-30 lg:hidden">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: fleetDotColor,
                boxShadow: `0 0 0 3px ${fleetDotColor}24`,
              }}
            />
            <span className="truncate text-[15px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
              {activeData.settings.siteTitle}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <TactileGlassSwitch
              demoMode={demoMode}
              liveCount={liveData?.nodes.length}
              onChange={switchMode}
            />

            {!demoMode && isAuthenticatedLive ? (
              <button
                type="button"
                onClick={() => {
                  setEditingNode(null);
                  setNodeFormOpen(true);
                }}
                aria-label="添加新主机"
                className="liquid-btn-primary flex h-10 w-10 items-center justify-center rounded-full"
              >
                <Plus className="h-4 w-4" />
              </button>
            ) : !isAuthenticatedLive ? (
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="liquid-btn inline-flex h-10 items-center gap-1 rounded-full px-3 text-[12.5px] font-medium text-[#0058c4]"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>登录</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="偏好设置与外观"
              className="liquid-btn flex h-10 w-10 items-center justify-center rounded-full text-[#4c515c]"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Desktop (lg+): VisionOS Floating 3-Capsule Header (Shader switcher moved into Settings) */}
      <header className="pointer-events-none fixed top-0 right-0 left-0 z-30 hidden lg:block">
        <div className="pointer-events-auto mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 pt-4 pb-2">
          {/* Brand Capsule */}
          <div className="liquid-capsule inline-flex h-11 items-center gap-2.5 rounded-full px-4">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: fleetDotColor,
                boxShadow: `0 0 0 3px ${fleetDotColor}24`,
              }}
            />
            <span className="text-[14px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
              {activeData.settings.siteTitle}
            </span>
            <span className="text-[12px] text-[#4c515c]">
              {activeData.settings.siteDomain}
            </span>
          </div>

          {/* Center Draggable Thick Liquid Glass Lens Tabs */}
          <GlassTabs items={NAV_ITEMS} value={tab} onChange={setTab} />

          {/* Right Controls Capsule */}
          <div className="liquid-capsule flex h-11 items-center gap-1.5 rounded-full p-1.5">
            <TactileGlassSwitch
              demoMode={demoMode}
              liveCount={liveData?.nodes.length}
              onChange={switchMode}
            />

            {!demoMode && (
              <button
                type="button"
                onClick={() => loadLive(true)}
                disabled={refreshingLive}
                aria-label="手动刷新实时数据"
                title="手动刷新实时数据 (快捷键 R)"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#4c515c] transition hover:bg-white/70 hover:text-[#1d1d1f] disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshingLive ? "animate-spin text-[#0058c4]" : ""}`} />
              </button>
            )}

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="偏好设置与外观"
              title="偏好设置与背景光场"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[#4c515c] transition hover:bg-white/70 hover:text-[#1d1d1f]"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>

            {isAuthenticatedLive ? (
              <>
                {!demoMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingNode(null);
                      setNodeFormOpen(true);
                    }}
                    className="liquid-btn-primary inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12px] font-medium"
                  >
                    <Plus className="h-3.5 w-3.5" /> 添加
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="退出管理员登录"
                  title="退出登录"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[#4c515c] transition hover:bg-white/70 hover:text-[#1d1d1f]"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[12px] font-medium text-[#0058c4] transition hover:bg-white/70"
              >
                <Lock className="h-3.5 w-3.5" /> 登录
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile & Tablet (< lg): Floating Thumb-Zone Liquid Glass Bottom Navigation */}
      <nav
        aria-label="底部主导航"
        className="mobile-bottom-dock pointer-events-none fixed right-0 bottom-0 left-0 z-30 px-4 lg:hidden"
      >
        <div className="pointer-events-auto mx-auto max-w-md">
          <GlassTabs items={NAV_ITEMS} value={tab} onChange={setTab} ariaLabel="底部主导航" />
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-6xl space-y-5 px-4 pt-5 pb-28 sm:px-6 lg:space-y-6 lg:pt-24 lg:pb-14">
        {/* Explicit Demo Mode Banner so simulated green servers are never mistaken for live status */}
        {demoMode && (
          <div className="liquid-glass flex flex-wrap items-center justify-between gap-2.5 rounded-[18px] border border-[#9a4500]/20 bg-[#fff7ed]/75 px-4 py-2.5 text-[12.5px] text-[#9a4500]">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>当前为演示数据模式（显示 4 台模拟主机，非线上真实状态）</span>
            </div>
            <button
              type="button"
              onClick={() => switchMode(false)}
              className="liquid-btn inline-flex min-h-[34px] items-center rounded-full px-3.5 text-[12px] font-semibold text-[#0058c4]"
            >
              切换至实时 ({liveData?.nodes.length ?? 0})
            </button>
          </div>
        )}

        {/* Editorial Display Header */}
        <div className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#1d1d1f] sm:text-[34px]">
              {TAB_TITLES[tab]}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-[#4c515c]">
              <span className="apple-nums">
                {onlineNodes} / {totalNodes} 台主机在线
              </span>
              <span aria-hidden="true" className="text-[#9ca3af]">·</span>
              <span className="apple-nums">本月累计 {formatBytes(totalMonthTraffic, 1)}</span>
              {!demoMode && activeData.serverTime > 0 && (
                <>
                  <span aria-hidden="true" className="text-[#9ca3af]">·</span>
                  <span className="apple-nums text-[#555a66]">
                    同步于 {formatRelativeTime(activeData.serverTime)}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {!demoMode && liveError && (
          <div
            role="alert"
            className="liquid-glass flex flex-wrap items-center justify-between gap-3 rounded-[18px] px-4 py-3 text-[13px] text-[#c41e14]"
          >
            <span>无法连接监控后端（{liveError}）</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadLive(true)}
                className="liquid-btn min-h-[36px] rounded-full px-3.5 text-[12px] font-medium"
              >
                重试连接
              </button>
              <button
                type="button"
                onClick={() => switchMode(true)}
                className="liquid-btn min-h-[36px] rounded-full px-3.5 text-[12px] font-medium text-[#0058c4]"
              >
                查看演示数据
              </button>
            </div>
          </div>
        )}

        {!demoMode && activeData.requiresAuth ? (
          <div className="liquid-glass mx-auto my-12 max-w-md rounded-[28px] p-8 text-center">
            <Lock className="mx-auto h-7 w-7 text-[#0058c4]" />
            <h2 className="mt-3 text-[17px] font-semibold text-[#1d1d1f]">已开启私密访问</h2>
            <p className="mt-1 text-[13px] text-[#4c515c]">请登录管理员账号查看主机监控与账单信息。</p>
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="liquid-btn-primary mt-5 min-h-[44px] rounded-full px-6 text-[13.5px] font-medium"
            >
              立即登录
            </button>
          </div>
        ) : (
          <>
            {tab === "overview" && (
              <>
                {/* Unified Glass Telemetry Ribbon (no fabricated dot matrices, no mid-word mobile breaks) */}
                <section className="liquid-glass grid grid-cols-2 divide-y divide-[#1d1d1f]/[0.07] rounded-[24px] lg:grid-cols-4 lg:divide-x lg:divide-y-0">
                  <div className="px-4 py-4 sm:px-5">
                    <div className="whitespace-nowrap text-[12px] font-medium text-[#4c515c]">节点状态</div>
                    <div className="apple-nums mt-1.5 flex items-baseline gap-1.5 whitespace-nowrap">
                      <span className="text-[24px] font-semibold tracking-[-0.025em] text-[#1d1d1f] sm:text-[26px]">
                        {onlineNodes}
                      </span>
                      <span className="text-[13.5px] text-[#555a66]">/ {totalNodes} 在线</span>
                    </div>
                    <div className={`mt-0.5 text-[12px] ${!allOnline && totalNodes > 0 ? "font-medium text-[#c41e14]" : "text-[#555a66]"}`}>
                      {totalNodes === 0 ? "暂无节点" : allOnline ? "全部心跳正常" : `${totalNodes - onlineNodes} 台离线`}
                    </div>
                  </div>

                  <div className="border-l border-[#1d1d1f]/[0.07] px-4 py-4 sm:px-5 lg:border-l-0">
                    <div className="whitespace-nowrap text-[12px] font-medium text-[#4c515c]">实时聚合带宽</div>
                    <div className="font-mono-num mt-2 text-[14px] font-semibold text-[#1d1d1f]">
                      ↓ {formatSpeed(totalRxSpeed)}
                    </div>
                    <div className="font-mono-num mt-0.5 text-[13px] font-medium text-[#4c515c]">
                      ↑ {formatSpeed(totalTxSpeed)}
                    </div>
                  </div>

                  <div className="px-4 py-4 sm:px-5">
                    <div className="flex items-center justify-between gap-2 text-[12px] font-medium text-[#4c515c]">
                      <span className="whitespace-nowrap">边缘可用率</span>
                      <span
                        title={edgeStatusLabel}
                        aria-label={edgeStatusLabel}
                        className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: edgeStatusColor,
                          boxShadow: `0 0 0 3px ${edgeStatusColor}26`,
                        }}
                      />
                    </div>
                    <div className="apple-nums mt-1.5 flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[24px] font-semibold tracking-[-0.025em] text-[#1d1d1f] sm:text-[26px]">
                        {edgeOkPct}%
                      </span>
                      {avgNodeLatency !== null && (
                        <span className="text-[12px] text-[#4c515c]">均延 {avgNodeLatency} ms</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[12px] text-[#555a66]">
                      {edgeTargets.length} 站点 · {activeData.probeTargets.length - edgeTargets.length} 节点拨测
                    </div>
                  </div>

                  <div className="border-l border-[#1d1d1f]/[0.07] px-4 py-4 sm:px-5 lg:border-l-0">
                    <div className="flex items-center justify-between gap-2 text-[12px] font-medium text-[#4c515c]">
                      <span className="whitespace-nowrap">月度账单</span>
                      <button
                        type="button"
                        onClick={() => setCurrencyOverride(CURRENCY_CYCLE[displayCurrency])}
                        aria-label={`切换结算货币，当前 ${displayCurrency}`}
                        className="inline-flex min-h-[28px] items-center rounded-full bg-white/85 px-2.5 font-mono-num text-[11.5px] font-semibold text-[#1d1d1f] shadow-[0_0_0_0.5px_rgba(15,23,42,0.12)] transition hover:bg-white"
                        title="点击切换 CNY / USD / EUR"
                      >
                        {displayCurrency}
                      </button>
                    </div>
                    <div className="apple-nums mt-1.5 flex items-baseline gap-1">
                      <span className="text-[24px] font-semibold tracking-[-0.025em] text-[#1d1d1f] sm:text-[26px]">
                        {formatCurrency(monthlyCost, displayCurrency)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-[#555a66]">
                      {soonestExpiry
                        ? `最近到期 ${soonestExpiry.name} (${soonestExpiry.days <= 0 ? "已到期" : `${soonestExpiry.days}天`})`
                        : "暂未配置到期日"}
                    </div>
                  </div>
                </section>

                {/* Quiet Toolbar with accessible mobile touch targets */}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <div className="relative flex-1 sm:flex-initial">
                      <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#555a66]" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="搜索主机、地区或 IP"
                        placeholder="搜索主机、地区或 IP"
                        className="liquid-input min-h-[42px] w-full rounded-full py-1.5 pr-4 pl-9 text-[15px] sm:min-h-[36px] sm:w-56 sm:text-[13px]"
                      />
                    </div>

                    <div role="group" aria-label="状态筛选" className="liquid-segment-track inline-flex items-center rounded-full p-0.5">
                      {(
                        [
                          ["all", "全部"],
                          ["online", "在线"],
                          ["warn", "预警"],
                          ["offline", "离线"],
                        ] as const
                      ).map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          aria-pressed={statusFilter === k}
                          onClick={() => setStatusFilter(k)}
                          className={`min-h-[38px] rounded-full px-3.5 text-[12.5px] font-medium transition sm:min-h-[32px] sm:text-[12px] ${
                            statusFilter === k
                              ? "liquid-segment-thumb font-semibold text-[#1d1d1f]"
                              : "text-[#4c515c] hover:text-[#1d1d1f]"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {regions.length > 1 && (
                      <GlassSelect
                        value={regionFilter}
                        onChange={setRegionFilter}
                        ariaLabel="按地区筛选主机"
                        options={[
                          { value: "all", label: "全部地区" },
                          ...regions.map((r) => ({ value: r, label: r })),
                        ]}
                      />
                    )}
                  </div>

                  <div role="group" aria-label="视图切换" className="liquid-segment-track inline-flex items-center rounded-full p-0.5">
                    <button
                      type="button"
                      aria-label="卡片视图"
                      aria-pressed={viewMode === "grid"}
                      onClick={() => setViewMode("grid")}
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition sm:h-8 sm:w-8 ${
                        viewMode === "grid" ? "liquid-segment-thumb text-[#1d1d1f]" : "text-[#4c515c] hover:text-[#1d1d1f]"
                      }`}
                      title="卡片视图"
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="列表视图"
                      aria-pressed={viewMode === "table"}
                      onClick={() => setViewMode("table")}
                      className={`flex h-9 w-9 items-center justify-center rounded-full transition sm:h-8 sm:w-8 ${
                        viewMode === "table" ? "liquid-segment-thumb text-[#1d1d1f]" : "text-[#4c515c] hover:text-[#1d1d1f]"
                      }`}
                      title="列表视图"
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {filteredNodes.length === 0 ? (
                  <div className="liquid-glass rounded-[26px] p-10 text-center">
                    <h2 className="text-[16px] font-semibold text-[#1d1d1f]">
                      {!demoMode && activeData.nodes.length === 0
                        ? "实时数据库暂无主机"
                        : "没有匹配的主机"}
                    </h2>
                    <p className="mt-1.5 text-[13px] text-[#4c515c]">
                      {!demoMode && activeData.nodes.length === 0
                        ? "登录后添加第一台 VPS 并部署 Go Agent，或先切换到演示模式浏览效果。"
                        : "当前搜索词或状态筛选下没有结果。"}
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                      {!demoMode && activeData.nodes.length === 0 ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              activeData.authenticated ? (setEditingNode(null), setNodeFormOpen(true)) : setLoginOpen(true)
                            }
                            className="liquid-btn-primary min-h-[42px] rounded-full px-5 text-[13px] font-medium"
                          >
                            {activeData.authenticated ? "添加真实主机" : "登录并添加主机"}
                          </button>
                          <button
                            type="button"
                            onClick={() => switchMode(true)}
                            className="liquid-btn min-h-[42px] rounded-full px-5 text-[13px] font-medium"
                          >
                            查看演示数据
                          </button>
                        </>
                      ) : hasOverviewFilters ? (
                        <button
                          type="button"
                          onClick={resetOverviewFilters}
                          className="liquid-btn min-h-[42px] rounded-full px-5 text-[13px] font-medium"
                        >
                          重置筛选
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : viewMode === "grid" ? (
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    {filteredNodes.map((node) => (
                      <NodeCard
                        key={node.id}
                        node={node}
                        demoMode={demoMode}
                        onSelect={(n) => setSelectedNodeId(n.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="liquid-glass overflow-x-auto rounded-[24px] p-2">
                    <table className="w-full text-left text-[12.5px]">
                      <thead className="border-b border-[#1d1d1f]/[0.08] text-[12px] text-[#4c515c]">
                        <tr>
                          <th className="px-4 py-3 font-medium">主机</th>
                          <th className="px-4 py-3 font-medium">状态</th>
                          <th className="px-4 py-3 text-right font-medium">CPU</th>
                          <th className="px-4 py-3 text-right font-medium">内存</th>
                          <th className="px-4 py-3 text-right font-medium">磁盘</th>
                          <th className="px-4 py-3 text-right font-medium">下行 / 上行</th>
                          <th className="px-4 py-3 text-right font-medium">月流量</th>
                          <th className="px-4 py-3 text-right font-medium">运行</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1d1d1f]/[0.06]">
                        {filteredNodes.map((n) => {
                          const memPct = n.memTotal > 0 ? (n.memUsed / n.memTotal) * 100 : 0;
                          const diskPct = n.diskTotal > 0 ? (n.diskUsed / n.diskTotal) * 100 : 0;
                          const limitBytes = n.trafficLimitGb * 1024 ** 3;
                          const tPct = limitBytes > 0 ? (n.trafficUsedBytes / limitBytes) * 100 : 0;
                          const warn = n.online && (n.cpuUsage >= 85 || memPct >= 90 || tPct >= 85);
                          const dotColor = !n.online ? "#FF3B30" : warn ? "#FF9500" : "#34C759";
                          const stateLabel = !n.online
                            ? `离线 (${formatRelativeTime(n.lastSeenAt)})`
                            : warn
                              ? n.cpuUsage >= 85
                                ? "高负载"
                                : "配额预警"
                              : "在线";
                          return (
                            <tr
                              key={n.id}
                              onClick={() => setSelectedNodeId(n.id)}
                              className="cursor-pointer transition hover:bg-white/50"
                            >
                              <td className="whitespace-nowrap px-4 py-3.5 font-semibold text-[#1d1d1f]">
                                <span aria-hidden="true">{n.flag} </span>
                                {n.name}
                                {n.ip && (
                                  <span className="ml-2 font-mono-num text-[11.5px] font-normal text-[#555a66]">{n.ip}</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5">
                                <span
                                  className={`inline-flex items-center gap-1.5 text-[12px] ${
                                    !n.online ? "font-medium text-[#c41e14]" : warn ? "font-semibold text-[#9a4500]" : "text-[#1d1d1f]"
                                  }`}
                                >
                                  <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
                                  {stateLabel}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-right font-mono-num">
                                {n.online ? `${n.cpuUsage.toFixed(1)}%` : "—"}
                              </td>
                              <td className="px-4 py-3.5 text-right font-mono-num">
                                {n.online ? `${memPct.toFixed(0)}%` : "—"}
                              </td>
                              <td className="px-4 py-3.5 text-right font-mono-num">
                                {n.online && n.diskTotal > 0 ? `${diskPct.toFixed(0)}%` : "—"}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono-num text-[#4c515c]">
                                ↓ {formatSpeed(n.netRxSpeed)} · ↑ {formatSpeed(n.netTxSpeed)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-right apple-nums text-[#4c515c]">
                                {formatBytes(n.trafficUsedBytes, 0)} / {n.trafficLimitGb} GB
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono-num text-[#4c515c]">
                                {n.online ? formatUptime(n.uptime) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {tab === "probes" && (
              <ProbesView
                nodes={activeData.nodes}
                probeTargets={activeData.probeTargets}
                edgeHistory={activeData.edgeProbeHistory}
                authenticated={activeData.authenticated}
                demoMode={demoMode}
                runningProbes={runningProbes}
                onRunNow={handleRunProbes}
                onAddProbe={() => setProbeModalOpen(true)}
                onRequestDeleteProbe={requestDeleteProbe}
                onSelectNode={(id) => setSelectedNodeId(id)}
              />
            )}

            {tab === "containers" && (
              <ContainersView
                nodes={activeData.nodes}
                onSelectNode={(id) => setSelectedNodeId(id)}
              />
            )}

            {tab === "billing" && (
              <BillingView
                nodes={activeData.nodes}
                displayCurrency={displayCurrency}
                authenticated={activeData.authenticated}
                demoMode={demoMode}
                onChangeCurrency={(c) => setCurrencyOverride(c)}
                onEditNode={(n) => {
                  setEditingNode(n);
                  setNodeFormOpen(true);
                }}
                onSelectNode={(id) => setSelectedNodeId(id)}
              />
            )}
          </>
        )}
      </main>

      {/* Accessible Inspector Glass Sheet */}
      <NodeDetailDrawer
        node={selectedNode}
        demoMode={demoMode}
        authenticated={activeData.authenticated}
        onClose={() => setSelectedNodeId(null)}
        onEdit={(n) => {
          setEditingNode(n);
          setNodeFormOpen(true);
        }}
        onInstallCmd={(n) => setInstallModal({ node: n, rawToken: null })}
        onDelete={requestDeleteNode}
        onToggleDemoOffline={handleToggleDemoOffline}
      />

      {/* Accessible Frosted Dialogs */}
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onLogin={handleLogin} />
      <NodeFormModal
        key={editingNode?.id ?? "new"}
        open={nodeFormOpen}
        editing={editingNode}
        onClose={() => setNodeFormOpen(false)}
        onSave={handleSaveNode}
      />
      <InstallCommandModal
        node={installModal?.node ?? null}
        rawToken={installModal?.rawToken ?? null}
        domain={activeData.settings.siteDomain}
        rotatingToken={rotatingToken}
        onClose={() => setInstallModal(null)}
        onRequestRotateToken={requestRotateToken}
      />
      <ProbeModal
        open={probeModalOpen}
        onClose={() => setProbeModalOpen(false)}
        onSave={handleCreateProbe}
      />
      <SettingsModal
        key={`${settingsOpen}-${activeData.settings.siteTitle}-${activeData.settings.publicAccess}`}
        open={settingsOpen}
        settings={activeData.settings}
        liveNodeCount={liveData?.nodes.length ?? 0}
        shaderPreset={shaderPreset}
        canEditServerSettings={!demoMode && isAuthenticatedLive}
        onChangeShader={setShaderPreset}
        onClose={() => setSettingsOpen(false)}
        onSave={handleSaveSettings}
      />
      <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`liquid-capsule fixed right-5 bottom-20 z-50 rounded-full px-4 py-2 text-[12.5px] font-medium lg:bottom-5 ${
            toast.tone === "error" ? "text-[#c41e14]" : "text-[#1d1d1f]"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

export default App;
