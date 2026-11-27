import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import type { CurrencyCode, PublicAccessMode, SettingsDto } from "../../shared/types";
import type { ShaderPreset } from "./AmbientShader";
import { PlanPicker } from "./ui-moments/PlanPicker";

const SHADER_OPTIONS: ReadonlyArray<{ id: ShaderPreset; label: string; desc: string; swatch: string }> = [
  { id: "silk-mesh", label: "Silk Mesh", desc: "珠光天蓝丝绸", swatch: "linear-gradient(135deg,#c7d2fe,#fde6d2)" },
  { id: "soft-dunes", label: "Soft Dunes", desc: "暖白香槟光晕", swatch: "linear-gradient(135deg,#f5d0c5,#f7efe5)" },
  { id: "lagoon-mist", label: "Lagoon Mist", desc: "冰川湖蓝薄雾", swatch: "linear-gradient(135deg,#bae6fd,#ccebe3)" },
];

interface SettingsPageProps {
  settings: SettingsDto;
  liveNodeCount: number;
  shaderPreset: ShaderPreset;
  authenticated: boolean;
  onChangeShader: (preset: ShaderPreset) => void;
  onSave: (payload: Partial<SettingsDto>) => Promise<void>;
  onOpenLogin: () => void;
}

export function SettingsPage({
  settings,
  liveNodeCount,
  shaderPreset,
  authenticated,
  onChangeShader,
  onSave,
  onOpenLogin,
}: SettingsPageProps) {
  const [siteTitle, setSiteTitle] = useState(settings.siteTitle);
  const [siteDomain, setSiteDomain] = useState(settings.siteDomain);
  const [publicAccess, setPublicAccess] = useState<PublicAccessMode>(settings.publicAccess);
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>(settings.displayCurrency);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSiteTitle(settings.siteTitle);
    setSiteDomain(settings.siteDomain);
    setPublicAccess(settings.publicAccess);
    setDisplayCurrency(settings.displayCurrency);
  }, [settings]);

  const estNodes = Math.max(1, liveNodeCount || 3);
  const estRequestsDay = estNodes * 5760 + 720 + 200;
  const estD1WritesDay = estNodes * (5760 + 1440) + 1440;
  const reqPct = Math.min(100, (estRequestsDay / 100000) * 100);
  const d1Pct = Math.min(100, (estD1WritesDay / 100000) * 100);

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
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存偏好设置失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      {/* Left 7 Cols: Appearance & Server Settings */}
      <div className="space-y-5 xl:col-span-7">
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

          <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-[12.5px]">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
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

            {error && (
              <div role="alert" className="rounded-[12px] bg-[#FF3B30]/10 px-3 py-2 text-[12.5px] font-medium text-[#c41e14]">
                {error}
              </div>
            )}

            {authenticated && (
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={busy}
                  className="liquid-btn-primary min-h-[38px] rounded-full px-5 text-[13px] font-medium disabled:opacity-60"
                >
                  {busy ? "保存中..." : "保存站点设置"}
                </button>
              </div>
            )}
          </form>
        </section>
      </div>

      {/* Right 5 Cols: Cloudflare Free Tier Telemetry Budget */}
      <aside className="space-y-5 xl:col-span-5">
        <section className="liquid-glass rounded-[24px] p-5 sm:p-6">
          <h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            Cloudflare 免费额度预估
          </h2>
          <p className="mt-0.5 text-[12.5px] text-[#4c515c]">
            按当前 {estNodes} 台在线主机 · 15 秒心跳周期与 1 分钟历史落盘估算
          </p>

          <div className="mt-4 space-y-4">
            <div className="liquid-inset rounded-[16px] p-4">
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="font-medium text-[#1d1d1f]">Workers 日请求量</span>
                <span className="font-mono-num text-[#4c515c]">
                  ~{estRequestsDay.toLocaleString()} / 100,000 ({reqPct.toFixed(1)}%)
                </span>
              </div>
              <div className="liquid-track mt-2.5 h-2 w-full overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-[#007AFF]"
                  style={{ width: `${Math.max(4, reqPct)}%` }}
                />
              </div>
            </div>

            <div className="liquid-inset rounded-[16px] p-4">
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="font-medium text-[#1d1d1f]">D1 数据库日写入行数</span>
                <span className="font-mono-num text-[#4c515c]">
                  ~{estD1WritesDay.toLocaleString()} / 100,000 ({d1Pct.toFixed(1)}%)
                </span>
              </div>
              <div className="liquid-track mt-2.5 h-2 w-full overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-[#34C759]"
                  style={{ width: `${Math.max(4, d1Pct)}%` }}
                />
              </div>
            </div>

            <div className="liquid-inset divide-y divide-[#1d1d1f]/[0.07] rounded-[16px] px-4 text-[12px] text-[#4c515c]">
              <div className="flex items-center justify-between py-2.5">
                <span>控制面部署位置</span>
                <span className="font-mono-num text-[#1d1d1f]">Cloudflare Workers + D1</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span>边缘定时拨测</span>
                <span className="font-mono-num text-[#1d1d1f]">每 2 分钟 (Cron)</span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span>历史数据保留</span>
                <span className="text-[#1d1d1f]">性能 7 天 · 边缘 3 天</span>
              </div>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
