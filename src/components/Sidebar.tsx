import { useEffect } from "react";
import {
  Activity,
  Box,
  CreditCard,
  LayoutDashboard,
  Lock,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  X,
} from "lucide-react";
import type { NodeDto } from "../../shared/types";
import { daysUntil } from "../lib/format";

export type TabId = "overview" | "probes" | "containers" | "billing";

interface SidebarProps {
  siteTitle: string;
  siteDomain: string;
  tab: TabId;
  onChangeTab: (tab: TabId) => void;
  nodes: NodeDto[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  probeCount: number;
  fleetDotColor: string;
  authenticated: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenSettings: () => void;
  onOpenLogin: () => void;
  onLogout: () => void;
  onAddNode: () => void;
}

const NAV_DEFS: ReadonlyArray<{
  id: TabId;
  label: string;
  shortcut: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "overview", label: "主机总览", shortcut: "1", icon: LayoutDashboard },
  { id: "probes", label: "网络拨测", shortcut: "2", icon: Activity },
  { id: "containers", label: "容器进程", shortcut: "3", icon: Box },
  { id: "billing", label: "资产账单", shortcut: "4", icon: CreditCard },
];

export function Sidebar({
  siteTitle,
  siteDomain,
  tab,
  onChangeTab,
  nodes,
  selectedNodeId,
  onSelectNode,
  probeCount,
  fleetDotColor,
  authenticated,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  onOpenSettings,
  onOpenLogin,
  onLogout,
  onAddNode,
}: SidebarProps) {
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseMobile();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onCloseMobile]);

  const onlineCount = nodes.filter((n) => n.online).length;
  const runningContainers = nodes.reduce(
    (sum, n) => sum + n.containers.filter((c) => c.state === "running").length,
    0,
  );
  const urgentRenewals = nodes.filter((n) => {
    const d = daysUntil(n.expireDate);
    return d !== null && d <= 10;
  }).length;

  const badgeFor = (id: TabId): { text: string; tone?: "warn" } | null => {
    if (id === "overview") return { text: `${onlineCount}/${nodes.length}` };
    if (id === "probes") return probeCount > 0 ? { text: String(probeCount) } : null;
    if (id === "containers") return runningContainers > 0 ? { text: String(runningContainers) } : null;
    if (id === "billing" && urgentRenewals > 0) return { text: `${urgentRenewals} 临期`, tone: "warn" };
    return null;
  };

  const activeIndex = Math.max(
    0,
    NAV_DEFS.findIndex((item) => item.id === tab),
  );

  const renderInner = (isCompact: boolean, isMobileDrawer: boolean) => (
    <div className="flex h-full flex-col">
      {/* Brand Row (h-14 aligns flush with right topbar) */}
      <div
        className={`flex h-14 shrink-0 items-center border-b border-[#1d1d1f]/[0.08] ${
          isCompact ? "justify-center px-2" : "justify-between gap-2 px-4"
        }`}
      >
        {!isCompact && (
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: fleetDotColor,
                boxShadow: `0 0 0 3px ${fleetDotColor}26`,
              }}
            />
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[14.5px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
                {siteTitle}
              </div>
              <div className="truncate font-mono-num text-[11px] text-[#555a66]">{siteDomain}</div>
            </div>
          </div>
        )}

        {isMobileDrawer ? (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="关闭侧边栏"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#4c515c] transition hover:bg-white/70 hover:text-[#1d1d1f]"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isCompact ? "展开侧边栏" : "折叠侧边栏"}
            title={isCompact ? "展开侧边栏" : "折叠侧边栏"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#4c515c] transition hover:bg-white/75 hover:text-[#1d1d1f]"
          >
            {isCompact ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Scrollable Navigation + Live Fleet List */}
      <div className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
        {/* Primary Navigation with spring-sliding active pill */}
        <nav aria-label="主导航">
          {!isCompact && (
            <div className="mb-1.5 px-2.5 text-[11.5px] font-medium text-[#555a66]">控制台</div>
          )}
          <div className="relative flex flex-col gap-1">
            <span
              aria-hidden="true"
              className="liquid-segment-thumb um-leaf-thumb pointer-events-none absolute right-0 left-0 h-[40px] rounded-[12px]"
              style={{ transform: `translateY(${activeIndex * 44}px)` }}
            />
            {NAV_DEFS.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              const badge = badgeFor(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  title={isCompact ? `${item.label} (快捷键 ${item.shortcut})` : undefined}
                  onClick={() => {
                    onChangeTab(item.id);
                    if (isMobileDrawer) onCloseMobile();
                  }}
                  className={`relative z-10 flex h-[40px] w-full items-center rounded-[12px] text-[13px] transition-colors ${
                    isCompact ? "justify-center px-0" : "justify-between gap-2.5 px-2.5"
                  } ${
                    active
                      ? "font-semibold text-[#1d1d1f]"
                      : "font-medium text-[#4c515c] hover:text-[#1d1d1f]"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon
                      className={`h-[17px] w-[17px] shrink-0 transition-colors ${
                        active ? "text-[#0058c4]" : "text-[#555a66]"
                      }`}
                      aria-hidden="true"
                    />
                    {!isCompact && <span className="truncate">{item.label}</span>}
                  </span>
                  {!isCompact && badge && (
                    <span
                      className={`apple-nums shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        badge.tone === "warn"
                          ? "bg-[#FF9500]/15 font-semibold text-[#9a4500]"
                          : active
                            ? "bg-[#007AFF]/[0.10] text-[#0058c4]"
                            : "bg-[#1d1d1f]/[0.06] text-[#555a66]"
                      }`}
                    >
                      {badge.text}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Quick-Jump Fleet List */}
        <div>
          {!isCompact ? (
            <div className="mb-1.5 flex items-center justify-between px-2.5">
              <span className="text-[11.5px] font-medium text-[#555a66]">在线主机</span>
              {authenticated && (
                <button
                  type="button"
                  onClick={() => {
                    onAddNode();
                    if (isMobileDrawer) onCloseMobile();
                  }}
                  aria-label="添加新主机"
                  title="添加新主机"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-[#4c515c] transition hover:bg-white/75 hover:text-[#0058c4]"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div className="mx-auto my-2 h-[0.5px] w-7 bg-[#1d1d1f]/[0.10]" aria-hidden="true" />
          )}

          <div className="space-y-1">
            {nodes.length === 0 ? (
              !isCompact && (
                <div className="px-2.5 py-2 text-[12px] text-[#555a66]">暂无接入节点</div>
              )
            ) : (
              nodes.map((node) => {
                const selected = selectedNodeId === node.id;
                const dotColor = !node.online
                  ? "#FF3B30"
                  : node.cpuUsage >= 85
                    ? "#FF9500"
                    : "#34C759";
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => {
                      onSelectNode(node.id);
                      if (isMobileDrawer) onCloseMobile();
                    }}
                    title={
                      isCompact
                        ? `${node.name} · ${node.online ? `CPU ${node.cpuUsage.toFixed(0)}%` : "离线"}`
                        : undefined
                    }
                    className={`flex min-h-[36px] w-full items-center rounded-[11px] text-left text-[12.5px] transition ${
                      isCompact ? "justify-center px-0" : "justify-between gap-2 px-2.5 py-1.5"
                    } ${
                      selected
                        ? "bg-white/90 font-semibold text-[#1d1d1f] shadow-[0_1px_4px_rgba(15,23,42,0.08)]"
                        : "text-[#4c515c] hover:bg-white/55 hover:text-[#1d1d1f]"
                    }`}
                  >
                    {isCompact ? (
                      <span className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-white/65 text-[13px]">
                        <span aria-hidden="true">{node.flag || "🌐"}</span>
                        <span
                          aria-hidden="true"
                          className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full ring-2 ring-white"
                          style={{ backgroundColor: dotColor }}
                        />
                      </span>
                    ) : (
                      <>
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: dotColor }}
                          />
                          <span className="truncate font-medium text-[#1d1d1f]">{node.name}</span>
                        </span>
                        <span
                          className={`font-mono-num shrink-0 text-[11px] ${
                            !node.online
                              ? "font-medium text-[#c41e14]"
                              : node.cpuUsage >= 85
                                ? "font-semibold text-[#9a4500]"
                                : "text-[#555a66]"
                          }`}
                        >
                          {node.online ? `${node.cpuUsage.toFixed(0)}%` : "离线"}
                        </span>
                      </>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Bottom Utility Footer */}
      <div className="shrink-0 space-y-1 border-t border-[#1d1d1f]/[0.08] p-2.5">
        <button
          type="button"
          onClick={() => {
            onOpenSettings();
            if (isMobileDrawer) onCloseMobile();
          }}
          title={isCompact ? "偏好设置与外观" : undefined}
          className={`flex h-9 w-full items-center rounded-[11px] text-[12.5px] font-medium text-[#4c515c] transition hover:bg-white/65 hover:text-[#1d1d1f] ${
            isCompact ? "justify-center px-0" : "gap-2.5 px-2.5"
          }`}
        >
          <Settings className="h-4 w-4 shrink-0 text-[#555a66]" aria-hidden="true" />
          {!isCompact && <span>偏好设置</span>}
        </button>

        {authenticated ? (
          <button
            type="button"
            onClick={() => {
              onLogout();
              if (isMobileDrawer) onCloseMobile();
            }}
            title={isCompact ? "退出管理员登录" : undefined}
            className={`flex h-9 w-full items-center rounded-[11px] text-[12.5px] font-medium text-[#4c515c] transition hover:bg-white/65 hover:text-[#1d1d1f] ${
              isCompact ? "justify-center px-0" : "justify-between gap-2 px-2.5"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <LogOut className="h-4 w-4 shrink-0 text-[#555a66]" aria-hidden="true" />
              {!isCompact && <span>退出登录</span>}
            </span>
            {!isCompact && (
              <span className="rounded-full bg-[#34C759]/14 px-2 py-0.5 text-[10.5px] font-semibold text-[#156230]">
                管理员
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              onOpenLogin();
              if (isMobileDrawer) onCloseMobile();
            }}
            title={isCompact ? "管理员登录" : undefined}
            className={`flex h-9 w-full items-center rounded-[11px] text-[12.5px] font-semibold text-[#0058c4] transition hover:bg-[#007AFF]/[0.08] ${
              isCompact ? "justify-center px-0" : "gap-2.5 px-2.5"
            }`}
          >
            <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!isCompact && <span>管理员登录</span>}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Collapsible Sidebar */}
      <aside
        aria-label="后台导航侧边栏"
        className={`liquid-sidebar sticky top-0 z-30 hidden h-screen shrink-0 flex-col transition-[width] duration-200 ease-out lg:flex ${
          collapsed ? "w-[72px]" : "w-[248px]"
        }`}
      >
        {renderInner(collapsed, false)}
      </aside>

      {/* Mobile & Tablet Slide-over Drawer Sidebar */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 flex bg-[#0f172a]/24 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="移动端导航侧边栏"
            onClick={(e) => e.stopPropagation()}
            className="liquid-sidebar flex h-full w-[268px] max-w-[82vw] flex-col shadow-2xl"
          >
            {renderInner(false, true)}
          </aside>
        </div>
      )}
    </>
  );
}
