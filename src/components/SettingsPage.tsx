import { useEffect, useState } from "react";
import { Bell, Lock, Send } from "lucide-react";
import type { AlertChannel, AlertConfig, CurrencyCode, PublicAccessMode, SettingsDto } from "../../shared/types";
import type { ShaderPreset } from "./AmbientShader";
import { InkSwitch } from "./ui-moments/InkSwitch";
import { LeafSegmentedControl } from "./ui-moments/LeafSegmentedControl";
import { PlanPicker } from "./ui-moments/PlanPicker";

const SHADER_OPTIONS: ReadonlyArray<{ id: ShaderPreset; label: string; desc: string; swatch: string }> = [
  { id: "silk-mesh", label: "Silk Mesh", desc: "珠光天蓝丝绸", swatch: "linear-gradient(135deg,#c7d2fe,#fde6d2)" },
  { id: "soft-dunes", label: "Soft Dunes", desc: "暖白香槟光晕", swatch: "linear-gradient(135deg,#f5d0c5,#f7efe5)" },
  { id: "lagoon-mist", label: "Lagoon Mist", desc: "冰川湖蓝薄雾", swatch: "linear-gradient(135deg,#bae6fd,#ccebe3)" },
];

const DEFAULT_ALERTS: AlertConfig = {
  enabled: false,
  channel: "telegram",
  webhookUrl: "",
  telegramToken: "",
  telegramChatId: "",
  trafficWarnPct: 85,
  expireWarnDays: 7,
  notifyOffline: true,
  notifyEdgeDown: true,
};

interface SettingsPageProps {
  settings: SettingsDto;
  liveNodeCount: number;
  shaderPreset: ShaderPreset;
  authenticated: boolean;
  wsConnected: boolean;
  onChangeShader: (preset: ShaderPreset) => void;
  onSave: (payload: Partial<SettingsDto>) => Promise<void>;
  onTestAlert: (alerts: AlertConfig) => Promise<void>;
  onOpenLogin: () => void;
}

export function SettingsPage({
  settings,
  liveNodeCount,
  shaderPreset,
  authenticated,
  wsConnected,
  onChangeShader,
  onSave,
  onTestAlert,
  onOpenLogin,
}: SettingsPageProps) {
  const [siteTitle, setSiteTitle] = useState(settings.siteTitle);
  const [siteDomain, setSiteDomain] = useState(settings.siteDomain);
  const [publicAccess, setPublicAccess] = useState<PublicAccessMode>(settings.publicAccess);
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>(settings.displayCurrency);
  const [alerts, setAlerts] = useState<AlertConfig>(settings.alerts ?? DEFAULT_ALERTS);
  const [busy, setBusy] = useState(false);
  const [testingAlert, setTestingAlert] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSiteTitle(settings.siteTitle);
    setSiteDomain(settings.siteDomain);
    setPublicAccess(settings.publicAccess);
    setDisplayCurrency(settings.displayCurrency);
    if (settings.alerts) setAlerts(settings.alerts);
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authenticated) return;
    setError("");
    setBusy(true);
    try {
      await onSave({
        siteTitle: siteTitle.trim() || "PulseVPS",
        siteDomain: siteDomain.trim(),
        publicAccess,
        displayCurrency,
        alerts,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存偏好设置失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setError("");
    setTestingAlert(true);
    try {
      await onTestAlert(alerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "测试告警发送失败");
    } finally {
      setTestingAlert(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      {/* Left 7 Cols: Appearance, Site Settings & Alert Rules */}
      <form onSubmit={handleSubmit} className="space-y-5 xl:col-span-7">
        <section className="liquid-glass rounded-[24px] p-5 sm:p-6">
          <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            浅色玻璃环境光场
          </h2>
          <p className="mt-0.5 text-[12.5px] text-[#4c515c]">
            即时切换本机浏览器背景光场色彩，无需登录，自动保存在本地
          </p>
          <div className="mt-4">
            <PlanPicker
              options={SHADER_OPTIONS}
              value={shaderPreset}
              onChange={onChangeShader}
              legend="选择浅色玻璃环境光场"
            />
          </div>
        </section>

        <section className="liquid-glass rounded-[24px] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
                控制台与访客权限
              </h2>
              <p className="mt-0.5 text-[12.5px] text-[#4c515c]">
                配置站点标题、绑定域名、访客可见性与默认结算货币
              </p>
            </div>
            {!authenticated && (
              <button
                type="button"
                onClick={onOpenLogin}
                className="liquid-btn inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold text-[#0058c4]"
              >
                <Lock className="h-3.5 w-3.5" /> 登录以修改
              </button>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3.5 text-[12.5px] sm:grid-cols-2">
            <label className="block">
              <span className="text-[#4c515c]">站点名称</span>
              <input
                disabled={!authenticated}
                value={siteTitle}
                onChange={(e) => setSiteTitle(e.target.value)}
                className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 text-[15px] disabled:opacity-60 sm:text-[13px]"
              />
            </label>
            <label className="block">
              <span className="text-[#4c515c]">绑定域名</span>
              <input
                disabled={!authenticated}
                value={siteDomain}
                onChange={(e) => setSiteDomain(e.target.value)}
                className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 font-mono-num text-[15px] disabled:opacity-60 sm:text-[13px]"
              />
            </label>
            <label className="block">
              <span className="text-[#4c515c]">访客权限</span>
              <select
                disabled={!authenticated}
                value={publicAccess}
                onChange={(e) => setPublicAccess(e.target.value as PublicAccessMode)}
                className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 text-[15px] disabled:opacity-60 sm:text-[13px]"
              >
                <option value="masked">公开脱敏总览（隐藏真实 IP 与备注）</option>
                <option value="private">全站私密（需管理员登录）</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[#4c515c]">默认结算货币</span>
              <select
                disabled={!authenticated}
                value={displayCurrency}
                onChange={(e) => setDisplayCurrency(e.target.value as CurrencyCode)}
                className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 text-[15px] disabled:opacity-60 sm:text-[13px]"
              >
                <option value="CNY">CNY (¥)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </label>
          </div>
        </section>

        {/* Active Alert Push Settings */}
        <section className="liquid-glass rounded-[24px] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="h-4.5 w-4.5 text-[#0058c4]" aria-hidden="true" />
              <div>
                <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
                  主动告警推送
                </h2>
                <p className="mt-0.5 text-[12px] text-[#4c515c]">
                  后台每 30 秒巡检一次：主机失联/恢复、流量超限、手动续费到期与外部站点异常
                </p>
              </div>
            </div>
          </div>

          {!authenticated ? (
            <div className="liquid-inset mt-4 rounded-[16px] p-4 text-[12.5px] text-[#555a66]">
              登录管理员账号后可配置 Telegram Bot、飞书机器人或自定义 Webhook 告警通知。
            </div>
          ) : (
            <div className="mt-4 space-y-4 text-[12.5px]">
              <div className="liquid-inset rounded-[16px] p-3.5">
                <InkSwitch
                  checked={alerts.enabled}
                  onChange={(v) => setAlerts((a) => ({ ...a, enabled: v }))}
                  label="启用主动告警通知"
                  description="带状态去重：同一异常只提醒一次，恢复在线时自动补发恢复通知"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-[#4c515c]">通知渠道</span>
                <LeafSegmentedControl
                  size="sm"
                  ariaLabel="选择通知渠道"
                  value={alerts.channel}
                  onChange={(ch: AlertChannel) => setAlerts((a) => ({ ...a, channel: ch }))}
                  options={[
                    { id: "telegram", label: "Telegram" },
                    { id: "feishu", label: "飞书机器人" },
                    { id: "webhook", label: "Webhook" },
                  ]}
                />
              </div>

              {alerts.channel === "telegram" ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[#4c515c]">Bot Token</span>
                    <input
                      type="password"
                      value={alerts.telegramToken}
                      onChange={(e) => setAlerts((a) => ({ ...a, telegramToken: e.target.value }))}
                      placeholder="123456:ABC-DEF..."
                      className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 font-mono-num text-[13px]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[#4c515c]">Chat ID</span>
                    <input
                      value={alerts.telegramChatId}
                      onChange={(e) => setAlerts((a) => ({ ...a, telegramChatId: e.target.value }))}
                      placeholder="例如 123456789"
                      className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 font-mono-num text-[13px]"
                    />
                  </label>
                </div>
              ) : (
                <label className="block">
                  <span className="text-[#4c515c]">
                    {alerts.channel === "feishu" ? "飞书自定义机器人 Webhook URL" : "Webhook URL (JSON POST)"}
                  </span>
                  <input
                    value={alerts.webhookUrl}
                    onChange={(e) => setAlerts((a) => ({ ...a, webhookUrl: e.target.value }))}
                    placeholder={
                      alerts.channel === "feishu"
                        ? "https://open.feishu.cn/open-apis/bot/v2/hook/..."
                        : "https://example.com/webhook"
                    }
                    className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 font-mono-num text-[13px]"
                  />
                </label>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[#4c515c]">月流量预警阈值 (%)</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={alerts.trafficWarnPct}
                    onChange={(e) => setAlerts((a) => ({ ...a, trafficWarnPct: Number(e.target.value) || 0 }))}
                    className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 font-mono-num text-[13px]"
                  />
                </label>
                <label className="block">
                  <span className="text-[#4c515c]">手动续费提前提醒 (天)</span>
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={alerts.expireWarnDays}
                    onChange={(e) => setAlerts((a) => ({ ...a, expireWarnDays: Number(e.target.value) || 0 }))}
                    className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 font-mono-num text-[13px]"
                  />
                </label>
              </div>

              <div className="liquid-inset space-y-2.5 rounded-[16px] p-3.5">
                <InkSwitch
                  checked={alerts.notifyOffline}
                  onChange={(v) => setAlerts((a) => ({ ...a, notifyOffline: v }))}
                  label="主机离线 / 恢复上线通知"
                />
                <div className="border-t border-[#1d1d1f]/[0.07] pt-2.5">
                  <InkSwitch
                    checked={alerts.notifyEdgeDown}
                    onChange={(v) => setAlerts((a) => ({ ...a, notifyEdgeDown: v }))}
                    label="外部站点不可用通知"
                  />
                </div>
              </div>

              {error && (
                <div role="alert" className="rounded-[12px] bg-[#FF3B30]/10 px-3 py-2 text-[12.5px] font-medium text-[#c41e14]">
                  {error}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={testingAlert}
                  onClick={handleTest}
                  className="liquid-btn inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-[12.5px] font-medium text-[#0058c4] disabled:opacity-60"
                >
                  <Send className="h-3.5 w-3.5" />
                  {testingAlert ? "发送中..." : "发送测试通知"}
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="liquid-btn-primary min-h-[38px] rounded-full px-5 text-[13px] font-medium disabled:opacity-60"
                >
                  {busy ? "保存中..." : "保存全部设置"}
                </button>
              </div>
            </div>
          )}
        </section>
      </form>

      {/* Right 5 Cols: Self-Hosted Engine Status */}
      <aside className="space-y-5 xl:col-span-5">
        <section className="liquid-glass rounded-[24px] p-5 sm:p-6">
          <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            自托管主控运行概览
          </h2>
          <p className="mt-0.5 text-[12.5px] text-[#4c515c]">
            独立 VPS 单二进制运行，零云端额度限制，与受监控主机完全物理隔离
          </p>

          <div className="mt-4 liquid-inset divide-y divide-[#1d1d1f]/[0.07] rounded-[18px] px-4 text-[12.5px] text-[#4c515c]">
            <div className="flex items-center justify-between py-2.5">
              <span>实时传输通道</span>
              <span className="inline-flex items-center gap-1.5 font-medium text-[#1d1d1f]">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: wsConnected ? "#22c55e" : "#f59e0b" }}
                />
                {wsConnected ? "WebSocket 已连接" : "HTTP 轮询兜底"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span>接入节点数</span>
              <span className="font-mono-num font-semibold text-[#1d1d1f]">{liveNodeCount} 台</span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span>控制面引擎</span>
              <span className="font-mono-num text-[#1d1d1f]">Go + SQLite (WAL)</span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span>采集节拍</span>
              <span className="text-[#1d1d1f]">指标 2s · 三网异步 20s</span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span>历史数据保留</span>
              <span className="text-[#1d1d1f]">性能与三网 30 天 · 站点 14 天</span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span>外部站点巡检</span>
              <span className="text-[#1d1d1f]">每 2 分钟自动探测</span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span>告警巡检频率</span>
              <span className="text-[#1d1d1f]">每 30 秒判定一次</span>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
