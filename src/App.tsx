import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LayoutGrid,
  List,
  Lock,
  Menu,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import type {
  AlertConfig,
  BootstrapResponse,
  CurrencyCode,
  NodeDto,
  NodeUpsertPayload,
  ProbeTargetDto,
  ProbeType,
  SettingsDto,
} from "../shared/types";
import * as api from "./lib/api";
import {
  convertCurrency,
  daysUntil,
  formatBytes,
  formatCurrency,
  formatRelativeTime,
  formatSpeed,
  formatUptime,
  gbToBytes,
  normalizeMonthlyAmount,
} from "./lib/format";
import { ConfirmDialog, type ConfirmDialogState } from "./components/AccessibleModal";
import { AmbientShader, type ShaderPreset } from "./components/AmbientShader";
import { BillingView } from "./components/BillingView";
import { ContainersView } from "./components/ContainersView";
import { GlassSelect } from "./components/GlassSelect";
import {
  InstallCommandModal,
  LoginModal,
  NodeFormModal,
  ProbeModal,
} from "./components/Modals";
import { NodeCard } from "./components/NodeCard";
import { NodeDetailPage } from "./components/NodeDetailPage";
import { ProbesView } from "./components/ProbesView";
import { SettingsPage } from "./components/SettingsPage";
import { Sidebar, type TabId } from "./components/Sidebar";
import { LeafSegmentedControl } from "./components/ui-moments/LeafSegmentedControl";
import { RollingNumber } from "./components/ui-moments/RollingNumber";

type StatusFilter = "all" | "online" | "warn" | "offline";

const VALID_SHADERS: ShaderPreset[] = ["silk-mesh", "soft-dunes", "lagoon-mist"];
const CURRENCY_CYCLE: Record<CurrencyCode, CurrencyCode> = {
  CNY: "USD",
  USD: "EUR",
  EUR: "CNY",
};

const TAB_TITLES: Record<TabId, string> = {
  overview: "主机总览",
  probes: "网络与拨测",
  containers: "容器进程",
  billing: "资产与账单",
  settings: "偏好设置",
};

const STATUS_OPTIONS: ReadonlyArray<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "online", label: "在线" },
  { id: "warn", label: "预警" },
  { id: "offline", label: "离线" },
];

const VALID_TABS: ReadonlySet<TabId> = new Set(["overview", "probes", "containers", "billing", "settings"]);

function parseHashRoute(): { tab: TabId; nodeId: string | null } {
  try {
    const raw = window.location.hash.replace(/^#\/?/, "");
    if (!raw) return { tab: "overview", nodeId: null };
    if (raw.startsWith("host/")) {
      const id = decodeURIComponent(raw.slice(5));
      if (id) return { tab: "overview", nodeId: id };
    }
    if (VALID_TABS.has(raw as TabId)) {
      return { tab: raw as TabId, nodeId: null };
    }
  } catch {
    // ignore malformed hash
  }
  return { tab: "overview", nodeId: null };
}

export function App() {
  const initialRoute = useMemo(() => parseHashRoute(), []);
  const [shaderPreset, setShaderPreset] = useState<ShaderPreset>(() => {
    try {
      const saved = localStorage.getItem("pulsevps_shader_v2") as ShaderPreset | null;
      return saved && VALID_SHADERS.includes(saved) ? saved : "silk-mesh";
    } catch {
      return "silk-mesh";
    }
  });
  const [tab, setTab] = useState<TabId>(initialRoute.tab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("pulsevps_sidebar_collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [regionFilter, setRegionFilter] = useState("all");

  const [liveData, setLiveData] = useState<BootstrapResponse | null>(null);
  const [liveError, setLiveError] = useState<string>("");
  const [refreshingLive, setRefreshingLive] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsReconnectSeq, setWsReconnectSeq] = useState(0);
  const [currencyOverride, setCurrencyOverride] = useState<CurrencyCode | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialRoute.nodeId);
  const [loginOpen, setLoginOpen] = useState(false);
  const [gatePassword, setGatePassword] = useState("");
  const [gateShowPwd, setGateShowPwd] = useState(false);
  const [gateBusy, setGateBusy] = useState(false);
  const [gateError, setGateError] = useState("");
  const [nodeFormOpen, setNodeFormOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<NodeDto | null>(null);
  const [installModal, setInstallModal] = useState<{ node: NodeDto; rawToken: string | null } | null>(null);
  const [probeModalOpen, setProbeModalOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);
  const [runningProbes, setRunningProbes] = useState(false);
  const [rotatingToken, setRotatingToken] = useState(false);

  const [toast, setToast] = useState<{ text: string; tone: "normal" | "error" } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);

  const navigateTab = useCallback((nextTab: TabId) => {
    setSelectedNodeId(null);
    setTab(nextTab);
    const nextHash = nextTab === "overview" ? "#/" : `#/${nextTab}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
    mainScrollRef.current?.scrollTo({ top: 0 });
  }, []);

  const openNodePage = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    const nextHash = `#/host/${encodeURIComponent(nodeId)}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
    mainScrollRef.current?.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const parsed = parseHashRoute();
      if (parsed.nodeId) {
        setSelectedNodeId(parsed.nodeId);
      } else {
        setSelectedNodeId(null);
        setTab(parsed.tab);
      }
      mainScrollRef.current?.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

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

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("pulsevps_sidebar_collapsed", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

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

  const canStreamLive = liveData !== null && !liveData.requiresAuth;

  // WebSocket real-time streaming with automatic reconnect (falls back to HTTP polling if unavailable)
  useEffect(() => {
    if (!canStreamLive) {
      setWsConnected(false);
      return;
    }
    let closed = false;
    let ws: WebSocket | null = null;
    let retryTimer: number | null = null;
    let attempt = 0;

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(api.buildWebSocketUrl());
      } catch {
        setWsConnected(false);
        return;
      }
      ws.onopen = () => {
        attempt = 0;
        setWsConnected(true);
        setLiveError("");
      };
      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data) as { type?: string; data?: BootstrapResponse };
          if (parsed.type === "bootstrap" && parsed.data) {
            setLiveData(parsed.data);
            setLiveError("");
          }
        } catch {
          // ignore malformed frames
        }
      };
      ws.onerror = () => {
        ws?.close();
      };
      ws.onclose = () => {
        setWsConnected(false);
        if (closed) return;
        const delay = Math.min(15_000, 1500 * Math.pow(1.6, attempt++));
        retryTimer = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      closed = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      ws?.close();
    };
  }, [canStreamLive, wsReconnectSeq]);

  // Fallback HTTP polling ONLY when WebSocket is disconnected and authorized
  useEffect(() => {
    if (wsConnected || !canStreamLive) return;
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
  }, [wsConnected, canStreamLive, loadLive]);

  // Global keyboard shortcuts (1-4 switch views, / focus search, r refresh)
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
        !!installModal ||
        !!confirmState
      ) {
        return;
      }
      if (e.key === "Escape" && selectedNodeId) {
        setSelectedNodeId(null);
      } else if (e.key === "1") navigateTab("overview");
      else if (e.key === "2") navigateTab("probes");
      else if (e.key === "3") navigateTab("containers");
      else if (e.key === "4") navigateTab("billing");
      else if (e.key === "/" && tab === "overview" && !selectedNodeId) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "r") {
        loadLive(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loginOpen, nodeFormOpen, probeModalOpen, installModal, confirmState, selectedNodeId, tab, navigateTab, loadLive]);

  const activeData: BootstrapResponse = liveData ?? {
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
      const trafficLimitBytes = gbToBytes(n.trafficLimitGb, n.trafficUnitBase);
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
    setWsReconnectSeq((n) => n + 1);
    showToast("已登录管理员后台");
  };

  const handleLogout = () => {
    api.setStoredToken(null);
    loadLive();
    setWsReconnectSeq((n) => n + 1);
    showToast("已退出登录");
  };

  const handleSaveNode = async (payload: NodeUpsertPayload, id?: string) => {
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
      description: "将从数据库永久清除该主机的配置、月流量账本与历史采样曲线。VPS 上仍在运行的 Agent 需手动停止或卸载。",
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

  const handleTestAlert = async (alerts: AlertConfig) => {
    try {
      await api.sendTestAlert(alerts);
      showToast("测试告警已发送，请查收消息");
    } catch (err) {
      handleAdminError(err, "测试告警发送失败");
      throw err;
    }
  };

  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    try {
      await api.changeAdminPassword(currentPassword, newPassword);
      setWsReconnectSeq((n) => n + 1);
      showToast("管理员密码已更新，其他设备会话已失效");
    } catch (err) {
      handleAdminError(err, "修改管理员密码失败");
      throw err;
    }
  };

  const allOnline = totalNodes > 0 && onlineNodes === totalNodes;
  const fleetDotColor = totalNodes === 0 ? "#8e8e93" : allOnline ? "#34C759" : onlineNodes === 0 ? "#FF3B30" : "#FF9500";
  const isAuthenticatedLive = Boolean(liveData?.authenticated);

  const handleGateLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gatePassword.trim()) return;
    setGateBusy(true);
    setGateError("");
    try {
      await handleLogin(gatePassword);
      setGatePassword("");
    } catch (err) {
      setGateError(err instanceof Error ? err.message : "管理密码错误");
    } finally {
      setGateBusy(false);
    }
  };

  if (liveData === null && !liveError) {
    return (
      <div className="relative flex h-dvh w-full items-center justify-center overflow-hidden text-[#1d1d1f]">
        <AmbientShader preset={shaderPreset} />
        <div className="liquid-glass relative z-10 flex items-center gap-3 rounded-full px-5 py-3 text-[13px] font-medium text-[#4c515c]">
          <RefreshCw className="h-4 w-4 animate-spin text-[#0058c4]" aria-hidden="true" />
          <span>正在连接控制台…</span>
        </div>
      </div>
    );
  }

  if (liveData?.requiresAuth && !liveData.authenticated) {
    return (
      <div className="relative flex h-dvh w-full items-center justify-center overflow-hidden px-4 text-[#111827]">
        <AmbientShader preset={shaderPreset} />
        <main className="liquid-glass relative z-10 w-full max-w-[388px] rounded-[20px] p-7 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-[#0f172a]/[0.09] bg-white text-[#0058c4] shadow-[0_2px_6px_rgba(15,23,42,0.08),inset_0_1px_0_#ffffff]">
              <Lock className="h-5 w-5" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-[20px] font-semibold tracking-[-0.025em] text-[#111827]">
              {activeData.settings.siteTitle || "PulseVPS"}
            </h1>
            <p className="mt-1 text-[13px] text-[#4c5565]">
              私密监控控制台 · 请输入管理员密码继续
            </p>
          </div>

          <form onSubmit={handleGateLogin} className="mt-6 space-y-3.5">
            <label className="relative block">
              <span className="sr-only">管理员密码</span>
              <input
                type={gateShowPwd ? "text" : "password"}
                autoFocus
                autoComplete="current-password"
                value={gatePassword}
                onChange={(e) => setGatePassword(e.target.value)}
                placeholder="输入管理员密码"
                className="liquid-input min-h-[44px] w-full rounded-[12px] py-2.5 pr-11 pl-4 text-[15px] sm:text-[14px]"
              />
              <button
                type="button"
                onClick={() => setGateShowPwd((v) => !v)}
                aria-label={gateShowPwd ? "隐藏密码" : "显示密码"}
                className="absolute top-1/2 right-2.5 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#556070] transition hover:bg-[#0f172a]/[0.05] hover:text-[#111827]"
              >
                {gateShowPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </label>

            {gateError && (
              <div role="alert" className="rounded-[10px] bg-[#dc2626]/10 px-3.5 py-2 text-[12.5px] font-medium text-[#b91c1c]">
                {gateError}
              </div>
            )}

            <button
              type="submit"
              disabled={gateBusy || !gatePassword.trim()}
              className="liquid-btn-primary inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full px-5 text-[14px] font-medium disabled:opacity-50"
            >
              {gateBusy ? "正在验证…" : "解锁控制台"}
            </button>
          </form>

          <p className="mt-5 text-center text-[11.5px] text-[#556070]">
            独立自托管 · 会话令牌加密保护
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="relative flex h-dvh w-full overflow-hidden text-[#1d1d1f]">
      {/* Serene Stripe-Free WebGL Fluid Shader Backdrop */}
      <AmbientShader preset={shaderPreset} />

      {/* Left Persistent Admin Console Sidebar (locked full height, never scrolls with main workspace) */}
      <Sidebar
        siteTitle={activeData.settings.siteTitle}
        siteDomain={activeData.settings.siteDomain}
        tab={tab}
        onChangeTab={navigateTab}
        nodes={activeData.nodes}
        selectedNodeId={selectedNodeId}
        onSelectNode={openNodePage}
        probeCount={activeData.probeTargets.length}
        fleetDotColor={fleetDotColor}
        authenticated={isAuthenticatedLive}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        onOpenLogin={() => setLoginOpen(true)}
        onLogout={handleLogout}
        onAddNode={() => {
          setEditingNode(null);
          setNodeFormOpen(true);
        }}
      />

      {/* Right Full-Width Locked Workspace Column */}
      <div className="relative z-10 flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        {/* Pinned Console Topbar (h-14 aligns flush with sidebar brand header, never drifts on scroll) */}
        <header className="liquid-topbar z-20 flex h-14 shrink-0 items-center justify-between gap-3 px-4 sm:px-6 lg:px-7">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="打开导航菜单"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#4c515c] transition hover:bg-white/75 hover:text-[#1d1d1f] lg:hidden"
            >
              <Menu className="h-4.5 w-4.5" />
            </button>

            {selectedNode ? (
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigateTab(tab)}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium text-[#4c515c] transition hover:bg-white/75 hover:text-[#1d1d1f]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{TAB_TITLES[tab]}</span>
                </button>
                <span aria-hidden="true" className="text-[#9ca3af]">/</span>
                <span aria-hidden="true" className="text-[16px] leading-none">{selectedNode.flag || "🌐"}</span>
                <h1 className="truncate text-[16px] font-semibold tracking-[-0.02em] text-[#1d1d1f] sm:text-[17px]">
                  {selectedNode.name}
                </h1>
              </div>
            ) : (
              <>
                <h1 className="truncate text-[17px] font-semibold tracking-[-0.02em] text-[#1d1d1f] sm:text-[18px]">
                  {TAB_TITLES[tab]}
                </h1>
                <div className="hidden items-center gap-2 text-[12px] text-[#4c515c] md:flex">
                  <span className="h-3.5 w-[0.5px] bg-[#1d1d1f]/15" aria-hidden="true" />
                  <span className="apple-nums">
                    {onlineNodes} / {totalNodes} 在线
                  </span>
                  <span aria-hidden="true" className="text-[#9ca3af]">·</span>
                  <span className="apple-nums">本月 {formatBytes(totalMonthTraffic, 1)}</span>
                  <span aria-hidden="true" className="text-[#9ca3af]">·</span>
                  {wsConnected ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-[#156230]">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
                      实时推送
                    </span>
                  ) : (
                    activeData.serverTime > 0 && (
                      <span className="apple-nums text-[#555a66]">
                        同步于 {formatRelativeTime(activeData.serverTime)}
                      </span>
                    )
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => loadLive(true)}
              disabled={refreshingLive}
              aria-label="手动刷新实时数据"
              title="手动刷新实时数据 (快捷键 R)"
              className="liquid-btn inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-[#4c515c] disabled:opacity-50 sm:h-8"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshingLive ? "animate-spin text-[#0058c4]" : ""}`} />
              <span className="hidden sm:inline">刷新</span>
            </button>

            {isAuthenticatedLive ? (
              <button
                type="button"
                onClick={() => {
                  setEditingNode(null);
                  setNodeFormOpen(true);
                }}
                className="liquid-btn-primary inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium sm:h-8"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>添加主机</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="liquid-btn inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold text-[#0058c4] sm:h-8"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>登录</span>
              </button>
            )}
          </div>
        </header>

        {/* The ONLY Scrollable Pane (sidebar & topbar remain 100% locked!) */}
        <main
          ref={mainScrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-5 px-4 py-5 sm:px-6 lg:space-y-6 lg:px-7 lg:py-6"
        >
        {liveError && (
          <div
            role="alert"
            className="liquid-glass flex flex-wrap items-center justify-between gap-3 rounded-[18px] px-4 py-3 text-[13px] text-[#c41e14]"
          >
            <span>无法连接监控后端（{liveError}）</span>
            <button
              type="button"
              onClick={() => loadLive(true)}
              className="liquid-btn min-h-[36px] rounded-full px-3.5 text-[12px] font-medium"
            >
              重试连接
            </button>
          </div>
        )}

        {activeData.requiresAuth ? (
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
        ) : selectedNode ? (
          <NodeDetailPage
            node={selectedNode}
            authenticated={activeData.authenticated}
            onEdit={(n) => {
              setEditingNode(n);
              setNodeFormOpen(true);
            }}
            onInstallCmd={(n) => setInstallModal({ node: n, rawToken: null })}
            onDelete={requestDeleteNode}
          />
        ) : (
          <>
            {tab === "overview" && (
              <>
                {/* Full-Width Precision Telemetry Ribbon with ui-moments RollingNumber */}
                <section className="liquid-glass grid grid-cols-2 divide-y divide-[#0f172a]/[0.07] rounded-[16px] xl:grid-cols-4 xl:divide-x xl:divide-y-0">
                  <div className="px-4 py-4 sm:px-5">
                    <div className="whitespace-nowrap text-[12px] font-medium text-[#556070]">节点状态</div>
                    <div className="apple-nums mt-1.5 flex items-baseline gap-1.5 whitespace-nowrap">
                      <RollingNumber
                        value={String(onlineNodes)}
                        className="text-[26px] font-semibold tracking-[-0.03em] text-[#111827] sm:text-[28px]"
                      />
                      <span className="text-[13.5px] font-medium text-[#556070]">/ {totalNodes} 在线</span>
                    </div>
                    <div className={`mt-1 text-[12px] ${!allOnline && totalNodes > 0 ? "font-medium text-[#c41e14]" : "text-[#556070]"}`}>
                      {totalNodes === 0 ? "暂无节点" : allOnline ? "全部心跳正常" : `${totalNodes - onlineNodes} 台离线`}
                    </div>
                  </div>

                  <div className="border-l border-[#0f172a]/[0.07] px-4 py-4 sm:px-5 xl:border-l-0">
                    <div className="whitespace-nowrap text-[12px] font-medium text-[#556070]">实时聚合带宽</div>
                    <div className="font-mono-num mt-2 text-[15px] font-semibold tracking-[-0.015em] text-[#111827]">
                      ↓ {formatSpeed(totalRxSpeed)}
                    </div>
                    <div className="font-mono-num mt-1 text-[13px] font-medium text-[#4c5565]">
                      ↑ {formatSpeed(totalTxSpeed)}
                    </div>
                  </div>

                  <div className="px-4 py-4 sm:px-5">
                    <div className="flex items-center justify-between gap-2 text-[12px] font-medium text-[#556070]">
                      <span className="whitespace-nowrap">边缘可用率</span>
                      <span
                        title={edgeStatusLabel}
                        aria-label={edgeStatusLabel}
                        className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          backgroundColor: edgeStatusColor,
                          boxShadow: `0 0 0 3px ${edgeStatusColor}24, inset 0 1px 0 rgba(255,255,255,0.45)`,
                        }}
                      />
                    </div>
                    <div className="apple-nums mt-1.5 flex flex-wrap items-baseline gap-x-2">
                      <RollingNumber
                        value={`${edgeOkPct}%`}
                        className="text-[26px] font-semibold tracking-[-0.03em] text-[#111827] sm:text-[28px]"
                      />
                      {avgNodeLatency !== null && (
                        <span className="text-[12px] font-medium text-[#4c5565]">
                          均延 <RollingNumber value={`${avgNodeLatency}`} /> ms
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[12px] text-[#556070]">
                      {edgeTargets.length} 站点 · {activeData.probeTargets.length - edgeTargets.length} 节点拨测
                    </div>
                  </div>

                  <div className="border-l border-[#0f172a]/[0.07] px-4 py-4 sm:px-5 xl:border-l-0">
                    <div className="flex items-center justify-between gap-2 text-[12px] font-medium text-[#556070]">
                      <span className="whitespace-nowrap">月度账单</span>
                      <button
                        type="button"
                        onClick={() => setCurrencyOverride(CURRENCY_CYCLE[displayCurrency])}
                        aria-label={`切换结算货币，当前 ${displayCurrency}`}
                        className="liquid-btn inline-flex min-h-[26px] items-center rounded-[8px] px-2.5 font-mono-num text-[11px] font-semibold text-[#111827]"
                        title="点击切换 CNY / USD / EUR"
                      >
                        {displayCurrency}
                      </button>
                    </div>
                    <div className="apple-nums mt-1.5 flex items-baseline gap-1">
                      <RollingNumber
                        value={formatCurrency(monthlyCost, displayCurrency)}
                        className="text-[26px] font-semibold tracking-[-0.03em] text-[#111827] sm:text-[28px]"
                      />
                    </div>
                    <div className="mt-1 truncate text-[12px] text-[#556070]">
                      {soonestExpiry
                        ? `最近到期 ${soonestExpiry.name} (${soonestExpiry.days <= 0 ? "已到期" : `${soonestExpiry.days}天`})`
                        : "暂未配置到期日"}
                    </div>
                  </div>
                </section>

                {/* Quiet Toolbar with LeafSegmentedControl */}
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-auto">
                      <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#555a66]" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="搜索主机、地区或 IP"
                        placeholder="搜索主机、地区或 IP"
                        className="liquid-input min-h-[40px] w-full rounded-full py-1.5 pr-4 pl-9 text-[15px] sm:min-h-[34px] sm:w-64 sm:text-[13px]"
                      />
                    </div>

                    <LeafSegmentedControl
                      options={STATUS_OPTIONS}
                      value={statusFilter}
                      onChange={setStatusFilter}
                      ariaLabel="状态筛选"
                    />

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
                  <div className="liquid-glass rounded-[16px] p-10 text-center">
                    <h2 className="text-[16px] font-semibold text-[#1d1d1f]">
                      {activeData.nodes.length === 0 ? "暂无已接入主机" : "没有匹配的主机"}
                    </h2>
                    <p className="mt-1.5 text-[13px] text-[#4c515c]">
                      {activeData.nodes.length === 0
                        ? "登录后添加第一台 VPS 并部署 Go Agent，即可开始实时监控。"
                        : "当前搜索词或状态筛选下没有结果。"}
                    </p>
                    <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                      {activeData.nodes.length === 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            activeData.authenticated ? (setEditingNode(null), setNodeFormOpen(true)) : setLoginOpen(true)
                          }
                          className="liquid-btn-primary min-h-[42px] rounded-full px-5 text-[13px] font-medium"
                        >
                          {activeData.authenticated ? "添加主机" : "登录并添加主机"}
                        </button>
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
                  <div
                    className={`grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 ${
                      filteredNodes.length >= 4 ? "2xl:grid-cols-4" : ""
                    }`}
                  >
                    {filteredNodes.map((node) => (
                      <NodeCard
                        key={node.id}
                        node={node}
                        onSelect={(n) => openNodePage(n.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="liquid-glass overflow-x-auto rounded-[16px] p-2">
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
                          const unitBase = n.trafficUnitBase === 1000 ? 1000 : 1024;
                          const limitBytes = gbToBytes(n.trafficLimitGb, unitBase);
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
                              onClick={() => openNodePage(n.id)}
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
                                {formatBytes(n.trafficUsedBytes, 1, unitBase)} / {n.trafficLimitGb} GB
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
                runningProbes={runningProbes}
                onRunNow={handleRunProbes}
                onAddProbe={() => setProbeModalOpen(true)}
                onRequestDeleteProbe={requestDeleteProbe}
                onSelectNode={openNodePage}
              />
            )}

            {tab === "containers" && (
              <ContainersView
                nodes={activeData.nodes}
                onSelectNode={openNodePage}
              />
            )}

            {tab === "billing" && (
              <BillingView
                nodes={activeData.nodes}
                displayCurrency={displayCurrency}
                authenticated={activeData.authenticated}
                onChangeCurrency={(c) => setCurrencyOverride(c)}
                onEditNode={(n) => {
                  setEditingNode(n);
                  setNodeFormOpen(true);
                }}
                onSelectNode={openNodePage}
              />
            )}

            {tab === "settings" && (
              <SettingsPage
                settings={activeData.settings}
                liveNodeCount={liveData?.nodes.length ?? 0}
                shaderPreset={shaderPreset}
                authenticated={isAuthenticatedLive}
                wsConnected={wsConnected}
                onChangeShader={setShaderPreset}
                onSave={handleSaveSettings}
                onTestAlert={handleTestAlert}
                onChangePassword={handleChangePassword}
                onOpenLogin={() => setLoginOpen(true)}
              />
            )}
          </>
        )}
        </main>
      </div>

      {/* Accessible Frosted Dialogs (for brief forms & destructive confirmations only) */}
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
