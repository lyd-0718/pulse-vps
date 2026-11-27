import { useId, useState } from "react";
import { Check, Copy, RefreshCw, X } from "lucide-react";
import type {
  BillingCycle,
  CurrencyCode,
  NodeDto,
  NodeUpsertPayload,
  ProbeType,
  PublicAccessMode,
  SettingsDto,
  TrafficMode,
  TrafficUnitBase,
} from "../../shared/types";
import type { ShaderPreset } from "./AmbientShader";
import { AccessibleModal } from "./AccessibleModal";

const SHADER_OPTIONS: ReadonlyArray<{ id: ShaderPreset; label: string; desc: string; swatch: string }> = [
  { id: "silk-mesh", label: "Silk Mesh", desc: "珠光天蓝丝绸", swatch: "linear-gradient(135deg,#c7d2fe,#fde6d2)" },
  { id: "soft-dunes", label: "Soft Dunes", desc: "暖白香槟光晕", swatch: "linear-gradient(135deg,#f5d0c5,#f7efe5)" },
  { id: "lagoon-mist", label: "Lagoon Mist", desc: "冰川湖蓝薄雾", swatch: "linear-gradient(135deg,#bae6fd,#ccebe3)" },
];

/* ---------- Login Modal ---------- */
export function LoginModal({
  open,
  onClose,
  onLogin,
}: {
  open: boolean;
  onClose: () => void;
  onLogin: (password: string) => Promise<void>;
}) {
  const titleId = useId();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("请输入管理员密码");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onLogin(password);
      setPassword("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请检查密码");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccessibleModal open={open} onClose={onClose} titleId={titleId}>
      <form onSubmit={submit} className="liquid-sheet w-full max-w-sm rounded-[26px] p-6">
        <div className="flex items-center justify-between">
          <h3 id={titleId} className="text-[17px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            管理员登录
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭登录窗口"
            className="liquid-btn flex h-9 w-9 items-center justify-center rounded-full text-[#4c515c]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[#4c515c]">
          登录后可管理 VPS 节点、获取 Agent 安装命令与配置拨测规则。
          {import.meta.env.DEV && (
            <>
              {" "}本地开发默认密码：<code className="font-mono-num font-semibold text-[#1d1d1f]">admin123</code>
            </>
          )}
        </p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="管理员密码"
          placeholder="输入管理密码"
          className="liquid-input mt-4 w-full rounded-[14px] px-3.5 py-2.5 text-[16px] sm:text-[13px]"
        />
        {error && (
          <p role="alert" className="mt-2 text-[12.5px] font-medium text-[#c41e14]">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="liquid-btn min-h-[40px] rounded-full px-4 text-[13px] font-medium">
            取消
          </button>
          <button
            type="submit"
            disabled={busy}
            className="liquid-btn-primary min-h-[40px] rounded-full px-5 text-[13px] font-medium disabled:opacity-60"
          >
            {busy ? "验证中..." : "登录"}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}

/* ---------- Install Command Modal ---------- */
export function InstallCommandModal({
  node,
  rawToken,
  domain,
  rotatingToken,
  onClose,
  onRequestRotateToken,
}: {
  node: NodeDto | null;
  rawToken: string | null;
  domain: string;
  rotatingToken?: boolean;
  onClose: () => void;
  onRequestRotateToken?: (node: NodeDto) => void;
}) {
  const titleId = useId();
  const [arch, setArch] = useState<"amd64" | "arm64">(
    node?.arch?.includes("arm") || node?.arch?.includes("aarch64") ? "arm64" : "amd64",
  );
  const [copiedKey, setCopiedKey] = useState<"systemd" | "binary" | null>(null);

  if (!node) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : `https://${domain}`;
  const hasRealToken = Boolean(rawToken);
  const tokenDisplay = rawToken || "<NODE_TOKEN>";
  const cmdSystemd = `curl -fsSL ${origin}/install.sh | sudo bash -s -- --server ${origin} --token ${tokenDisplay}`;
  const cmdBinary = `./vps-agent-linux-${arch} --server ${origin} --token ${tokenDisplay}`;

  const copyText = async (txt: string, key: "systemd" | "binary") => {
    try {
      await navigator.clipboard.writeText(txt);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <AccessibleModal open={!!node} onClose={onClose} titleId={titleId}>
      <div className="liquid-sheet max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[26px] p-6">
        <div className="flex items-center justify-between gap-2">
          <h3 id={titleId} className="text-[17px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            部署 Agent · {node.flag} {node.name}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭部署命令窗口"
            className="liquid-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#4c515c]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!hasRealToken && (
          <div className="liquid-inset mt-3.5 flex flex-wrap items-center justify-between gap-3 rounded-[16px] p-3.5 text-[12.5px] text-[#4c515c]">
            <span className="flex-1">
              历史 Token 仅在创建或重置时明文显示。下方命令目前含 <code className="font-mono-num text-[#9a4500]">&lt;NODE_TOKEN&gt;</code> 占位符，请替换或先重置生成新 Token。
            </span>
            {onRequestRotateToken && (
              <button
                type="button"
                disabled={rotatingToken}
                onClick={() => onRequestRotateToken(node)}
                className="liquid-btn inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-medium text-[#9a4500] disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${rotatingToken ? "animate-spin" : ""}`} />
                {rotatingToken ? "重置中..." : "重置 Token"}
              </button>
            )}
          </div>
        )}

        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[12.5px] text-[#4c515c]">
              <span>Linux 一键安装为 systemd 服务</span>
              <button
                type="button"
                onClick={() => copyText(cmdSystemd, "systemd")}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-full px-2 font-medium text-[#0058c4] hover:underline"
              >
                {copiedKey === "systemd" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedKey === "systemd" ? "已复制" : hasRealToken ? "复制命令" : "复制模板"}
              </button>
            </div>
            <pre className="liquid-inset overflow-x-auto rounded-[16px] p-3.5 font-mono-num text-[12px] text-[#1d1d1f]">
              {cmdSystemd}
            </pre>
          </div>

          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-[#4c515c]">
              <div className="flex items-center gap-2">
                <span>直接运行静态二进制</span>
                <div className="liquid-segment-track inline-flex rounded-full p-[2px]">
                  {(["amd64", "arm64"] as const).map((a) => (
                    <button
                      key={a}
                      type="button"
                      aria-pressed={arch === a}
                      onClick={() => setArch(a)}
                      className={`rounded-full px-2.5 py-0.5 font-mono-num text-[11.5px] font-medium ${
                        arch === a ? "liquid-segment-thumb font-semibold text-[#1d1d1f]" : "text-[#4c515c]"
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyText(cmdBinary, "binary")}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-full px-2 font-medium text-[#0058c4] hover:underline"
              >
                {copiedKey === "binary" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedKey === "binary" ? "已复制" : hasRealToken ? "复制命令" : "复制模板"}
              </button>
            </div>
            <pre className="liquid-inset overflow-x-auto rounded-[16px] p-3.5 font-mono-num text-[12px] text-[#1d1d1f]">
              {cmdBinary}
            </pre>
          </div>
        </div>
      </div>
    </AccessibleModal>
  );
}

/* ---------- Create / Edit Node Modal ---------- */
export function NodeFormModal({
  open,
  editing,
  onClose,
  onSave,
}: {
  open: boolean;
  editing: NodeDto | null;
  onClose: () => void;
  onSave: (payload: NodeUpsertPayload, id?: string) => Promise<void>;
}) {
  const titleId = useId();
  const initBase: TrafficUnitBase = editing?.trafficUnitBase === 1000 ? 1000 : 1024;
  const initGbDiv = initBase ** 3;
  const [name, setName] = useState(editing?.name ?? "");
  const [flag, setFlag] = useState(editing?.flag ?? "🇭🇰");
  const [region, setRegion] = useState(editing?.region ?? "香港");
  const [provider, setProvider] = useState(editing?.provider ?? "");
  const [tagsRaw, setTagsRaw] = useState((editing?.tags ?? []).join(", "));
  const [trafficLimitGb, setTrafficLimitGb] = useState(String(editing?.trafficLimitGb ?? 1000));
  const [trafficMode, setTrafficMode] = useState<TrafficMode>(editing?.trafficMode ?? "both");
  const [trafficUnitBase, setTrafficUnitBase] = useState<TrafficUnitBase>(initBase);
  const [trafficResetDay, setTrafficResetDay] = useState(String(editing?.trafficResetDay ?? 1));
  const [enableCalibrate, setEnableCalibrate] = useState(false);
  const [calibrateRxGb, setCalibrateRxGb] = useState(
    editing ? (editing.trafficRxCycle / initGbDiv).toFixed(2) : "0",
  );
  const [calibrateTxGb, setCalibrateTxGb] = useState(
    editing ? (editing.trafficTxCycle / initGbDiv).toFixed(2) : "0",
  );
  const [price, setPrice] = useState(String(editing?.price ?? 0));
  const [currency, setCurrency] = useState<CurrencyCode>(editing?.currency ?? "USD");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(editing?.billingCycle ?? "monthly");
  const [expireDate, setExpireDate] = useState(editing?.expireDate ?? "");
  const [autoRenew, setAutoRenew] = useState(editing?.autoRenew ?? false);
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const limitNum = Number(trafficLimitGb);
    const resetNum = Number(trafficResetDay);
    const priceNum = Number(price);

    if (!name.trim()) {
      setError("请填写主机名称");
      return;
    }
    if (!Number.isFinite(limitNum) || limitNum <= 0) {
      setError("月流量配额必须大于 0 GB");
      return;
    }
    if (!Number.isInteger(resetNum) || resetNum < 1 || resetNum > 31) {
      setError("每月重置日需在 1–31 之间");
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError("续费价格不能为负数");
      return;
    }

    let calRx: number | undefined;
    let calTx: number | undefined;
    if (editing && enableCalibrate) {
      calRx = Number(calibrateRxGb);
      calTx = Number(calibrateTxGb);
      if (!Number.isFinite(calRx) || calRx < 0 || !Number.isFinite(calTx) || calTx < 0) {
        setError("校准流量必须为大于或等于 0 的有效数字");
        return;
      }
    }

    setBusy(true);
    try {
      await onSave(
        {
          name: name.trim(),
          flag,
          region: region.trim(),
          provider: provider.trim(),
          tags: tagsRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          trafficLimitGb: limitNum,
          trafficMode,
          trafficUnitBase,
          trafficResetDay: resetNum,
          ...(calRx !== undefined ? { calibrateRxGb: calRx } : {}),
          ...(calTx !== undefined ? { calibrateTxGb: calTx } : {}),
          price: priceNum,
          currency,
          billingCycle,
          expireDate,
          autoRenew,
          notes: notes.trim(),
        },
        editing?.id,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存主机失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccessibleModal open={open} onClose={onClose} titleId={titleId}>
      <form
        onSubmit={handleSubmit}
        className="liquid-sheet max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[26px] p-6"
      >
        <div className="flex items-center justify-between pb-4">
          <h3 id={titleId} className="text-[17px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            {editing ? `编辑主机 · ${editing.name}` : "添加新主机"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭主机表单"
            className="liquid-btn flex h-9 w-9 items-center justify-center rounded-full text-[#4c515c]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 text-[12.5px]">
          {/* Section 1: Identity */}
          <fieldset className="liquid-inset space-y-3 rounded-[18px] p-3.5">
            <legend className="px-1 text-[12px] font-semibold text-[#1d1d1f]">基础信息</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 block">
                <span className="text-[#4c515c]">主机名称</span>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如 HK-DMIT-Pro"
                  className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 text-[16px] sm:text-[13px]"
                />
              </label>
              <label className="block">
                <span className="text-[#4c515c]">国旗 Emoji</span>
                <input value={flag} onChange={(e) => setFlag(e.target.value)} className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 text-[16px] sm:text-[13px]" />
              </label>
              <label className="block">
                <span className="text-[#4c515c]">地区</span>
                <input value={region} onChange={(e) => setRegion(e.target.value)} className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 text-[16px] sm:text-[13px]" />
              </label>
              <label className="block">
                <span className="text-[#4c515c]">服务商</span>
                <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="DMIT / Claw / 搬瓦工" className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 text-[16px] sm:text-[13px]" />
              </label>
              <label className="block">
                <span className="text-[#4c515c]">标签 (逗号分隔)</span>
                <input value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} placeholder="CN2 GIA, 流媒体" className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 text-[16px] sm:text-[13px]" />
              </label>
            </div>
          </fieldset>

          {/* Section 2: Traffic */}
          <fieldset className="liquid-inset space-y-3 rounded-[18px] p-3.5">
            <legend className="px-1 text-[12px] font-semibold text-[#1d1d1f]">流量配额</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[#4c515c]">月流量配额 (GB)</span>
                <input type="number" min={1} value={trafficLimitGb} onChange={(e) => setTrafficLimitGb(e.target.value)} className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 font-mono-num text-[16px] sm:text-[13px]" />
              </label>
              <label className="block">
                <span className="text-[#4c515c]">每月重置日 (1-31)</span>
                <input type="number" min={1} max={31} value={trafficResetDay} onChange={(e) => setTrafficResetDay(e.target.value)} className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 font-mono-num text-[16px] sm:text-[13px]" />
              </label>
              <label className="block">
                <span className="text-[#4c515c]">计费口径</span>
                <select value={trafficMode} onChange={(e) => setTrafficMode(e.target.value as TrafficMode)} className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 text-[16px] sm:text-[13px]">
                  <option value="both">双向累加 (Rx + Tx)</option>
                  <option value="tx">仅出站 (Tx)</option>
                  <option value="max">取最大值 max(Rx, Tx)</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[#4c515c]">流量进制</span>
                <select
                  value={trafficUnitBase}
                  onChange={(e) => setTrafficUnitBase(Number(e.target.value) === 1000 ? 1000 : 1024)}
                  className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 text-[16px] sm:text-[13px]"
                >
                  <option value={1024}>1024 二进制 (GiB)</option>
                  <option value={1000}>1000 十进制 (GB)</option>
                </select>
              </label>

              {editing && (
                <div className="col-span-2 border-t border-[#1d1d1f]/[0.07] pt-2.5">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={enableCalibrate}
                      onChange={(e) => setEnableCalibrate(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span className="font-medium text-[#1d1d1f]">校准本月已用流量（可选，对齐商家面板）</span>
                  </label>
                  {enableCalibrate && (
                    <div className="mt-2.5 grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="text-[#4c515c]">已用入站 (GB)</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={calibrateRxGb}
                          onChange={(e) => setCalibrateRxGb(e.target.value)}
                          className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 font-mono-num text-[16px] sm:text-[13px]"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[#4c515c]">已用出站 (GB)</span>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={calibrateTxGb}
                          onChange={(e) => setCalibrateTxGb(e.target.value)}
                          className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 font-mono-num text-[16px] sm:text-[13px]"
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
          </fieldset>

          {/* Section 3: Billing & Expiry */}
          <fieldset className="liquid-inset space-y-3 rounded-[18px] p-3.5">
            <legend className="px-1 text-[12px] font-semibold text-[#1d1d1f]">账单与到期</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[#4c515c]">续费价格</span>
                <div className="mt-1 flex gap-1.5">
                  <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="liquid-input w-full rounded-[12px] px-3 py-2 font-mono-num text-[16px] sm:text-[13px]" />
                  <select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)} aria-label="货币单位" className="liquid-input rounded-[12px] px-2 py-2 text-[14px] sm:text-[13px]">
                    <option value="USD">USD</option>
                    <option value="CNY">CNY</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </label>
              <label className="block">
                <span className="text-[#4c515c]">账单周期</span>
                <select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as BillingCycle)} className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 text-[16px] sm:text-[13px]">
                  <option value="monthly">月付</option>
                  <option value="quarterly">季付</option>
                  <option value="semiannual">半年付</option>
                  <option value="annual">年付</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[#4c515c]">到期日期</span>
                <input type="date" value={expireDate} onChange={(e) => setExpireDate(e.target.value)} className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 font-mono-num text-[16px] sm:text-[13px]" />
              </label>
              <label className="flex items-center gap-2 self-end pb-2">
                <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} className="h-4 w-4" />
                <span className="text-[#1d1d1f]">已开启自动续费</span>
              </label>
              <label className="col-span-2 block">
                <span className="text-[#4c515c]">备注</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 text-[16px] sm:text-[13px]" />
              </label>
            </div>
          </fieldset>
        </div>

        {error && (
          <div role="alert" className="mt-3 rounded-[12px] bg-[#FF3B30]/10 px-3 py-2 text-[12.5px] font-medium text-[#c41e14]">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="liquid-btn min-h-[40px] rounded-full px-4 text-[13px] font-medium">
            取消
          </button>
          <button
            type="submit"
            disabled={busy}
            className="liquid-btn-primary min-h-[40px] rounded-full px-5 text-[13px] font-medium disabled:opacity-60"
          >
            {busy ? "保存中..." : editing ? "保存修改" : "创建并获取安装命令"}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}

/* ---------- Probe Modal ---------- */
export function ProbeModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (payload: { name: string; type: ProbeType; target: string; expectedStatus: number }) => Promise<void>;
}) {
  const titleId = useId();
  const [name, setName] = useState("");
  const [type, setType] = useState<ProbeType>("http_edge");
  const [target, setTarget] = useState("");
  const [expectedStatus, setExpectedStatus] = useState("200");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmedTarget = target.trim();
    const statusNum = Number(expectedStatus) || 200;

    if (!name.trim()) {
      setError("请填写目标名称");
      return;
    }
    if (type === "tcp_node") {
      if (!/^[^:\s]+:\d{1,5}$/.test(trimmedTarget)) {
        setError("TCPing 地址格式需为 host:port（例如 202.96.128.86:53）");
        return;
      }
    } else {
      if (!/^https?:\/\/.+/.test(trimmedTarget)) {
        setError("HTTP 拨测地址需以 http:// 或 https:// 开头");
        return;
      }
      if (statusNum < 100 || statusNum > 599) {
        setError("期望状态码需在 100–599 之间");
        return;
      }
    }

    setBusy(true);
    try {
      await onSave({ name: name.trim(), type, target: trimmedTarget, expectedStatus: statusNum });
      setName("");
      setTarget("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "添加拨测目标失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccessibleModal open={open} onClose={onClose} titleId={titleId}>
      <form onSubmit={submit} className="liquid-sheet w-full max-w-md rounded-[26px] p-6">
        <div className="flex items-center justify-between pb-4">
          <h3 id={titleId} className="text-[17px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            新增拨测目标
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭拨测弹窗"
            className="liquid-btn flex h-9 w-9 items-center justify-center rounded-full text-[#4c515c]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 text-[12.5px]">
          <label className="block">
            <span className="text-[#4c515c]">名称</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 订阅聚合站 / 上海电信" className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 text-[16px] sm:text-[13px]" />
          </label>
          <label className="block">
            <span className="text-[#4c515c]">类型</span>
            <select value={type} onChange={(e) => setType(e.target.value as ProbeType)} className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 text-[16px] sm:text-[13px]">
              <option value="http_edge">Cloudflare 边缘 HTTP 拨测</option>
              <option value="tcp_node">VPS 节点 TCPing (host:port)</option>
              <option value="http_node">VPS 节点 HTTP 测速</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[#4c515c]">目标地址 ({type === "tcp_node" ? "host:port" : "https://..."})</span>
            <input required value={target} onChange={(e) => setTarget(e.target.value)} placeholder={type === "tcp_node" ? "gd-ct-v4.ip.zstaticcdn.com:80" : "https://sub.ydiws.xyz"} className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 font-mono-num text-[16px] sm:text-[13px]" />
          </label>
          {type !== "tcp_node" && (
            <label className="block">
              <span className="text-[#4c515c]">期望状态码</span>
              <input type="number" min={100} max={599} value={expectedStatus} onChange={(e) => setExpectedStatus(e.target.value)} className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 font-mono-num text-[16px] sm:text-[13px]" />
            </label>
          )}
        </div>

        {error && (
          <div role="alert" className="mt-3 rounded-[12px] bg-[#FF3B30]/10 px-3 py-2 text-[12.5px] font-medium text-[#c41e14]">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="liquid-btn min-h-[40px] rounded-full px-4 text-[13px] font-medium">
            取消
          </button>
          <button type="submit" disabled={busy} className="liquid-btn-primary min-h-[40px] rounded-full px-5 text-[13px] font-medium disabled:opacity-60">
            {busy ? "保存中..." : "添加"}
          </button>
        </div>
      </form>
    </AccessibleModal>
  );
}

/* ---------- Settings Modal (now also hosts serene Shader Backdrop selector) ---------- */
export function SettingsModal({
  open,
  settings,
  liveNodeCount,
  shaderPreset,
  canEditServerSettings,
  onChangeShader,
  onClose,
  onSave,
}: {
  open: boolean;
  settings: SettingsDto;
  liveNodeCount: number;
  shaderPreset: ShaderPreset;
  canEditServerSettings: boolean;
  onChangeShader: (preset: ShaderPreset) => void;
  onClose: () => void;
  onSave: (payload: Partial<SettingsDto>) => Promise<void>;
}) {
  const titleId = useId();
  const [siteTitle, setSiteTitle] = useState(settings.siteTitle);
  const [siteDomain, setSiteDomain] = useState(settings.siteDomain);
  const [publicAccess, setPublicAccess] = useState<PublicAccessMode>(settings.publicAccess);
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>(settings.displayCurrency);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const estNodes = Math.max(1, liveNodeCount || 4);
  const estRequestsDay = estNodes * 5760 + 720 + 200;
  const estD1WritesDay = estNodes * (5760 + 1440) + 1440;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditServerSettings) {
      onClose();
      return;
    }
    setError("");
    setBusy(true);
    try {
      await onSave({ siteTitle: siteTitle.trim() || "PulseVPS", siteDomain: siteDomain.trim(), publicAccess, displayCurrency });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存偏好设置失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccessibleModal open={open} onClose={onClose} titleId={titleId}>
      <form onSubmit={submit} className="liquid-sheet max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[26px] p-6">
        <div className="flex items-center justify-between pb-4">
          <h3 id={titleId} className="text-[17px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            偏好设置
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭设置窗口"
            className="liquid-btn flex h-9 w-9 items-center justify-center rounded-full text-[#4c515c]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 text-[12.5px]">
          {/* Local Appearance Setting (Shader Backdrop) */}
          <div>
            <div className="mb-2 text-[12px] font-semibold text-[#1d1d1f]">浅色玻璃环境光场（本机生效）</div>
            <div className="grid grid-cols-3 gap-2">
              {SHADER_OPTIONS.map((opt) => {
                const active = shaderPreset === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onChangeShader(opt.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-[16px] px-2 py-2.5 text-center transition ${
                      active
                        ? "bg-white/95 shadow-[0_0_0_1.5px_#0058c4,0_6px_14px_-6px_rgba(0,88,196,0.28)]"
                        : "liquid-inset hover:bg-white/75"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-5 w-5 rounded-full shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.16)]"
                      style={{ background: opt.swatch }}
                    />
                    <span className="text-[12px] font-medium text-[#1d1d1f]">{opt.label}</span>
                    <span className="text-[11px] text-[#555a66]">{opt.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {canEditServerSettings && (
            <div className="space-y-3 border-t border-[#1d1d1f]/[0.08] pt-4">
              <label className="block">
                <span className="text-[#4c515c]">站点名称</span>
                <input value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 text-[16px] sm:text-[13px]" />
              </label>
              <label className="block">
                <span className="text-[#4c515c]">绑定域名</span>
                <input value={siteDomain} onChange={(e) => setSiteDomain(e.target.value)} className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 font-mono-num text-[16px] sm:text-[13px]" />
              </label>
              <label className="block">
                <span className="text-[#4c515c]">访客权限</span>
                <select value={publicAccess} onChange={(e) => setPublicAccess(e.target.value as PublicAccessMode)} className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 text-[16px] sm:text-[13px]">
                  <option value="masked">公开脱敏总览（隐藏真实 IP 与备注）</option>
                  <option value="private">全站私密（需管理员登录）</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[#4c515c]">默认货币</span>
                <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value as CurrencyCode)} className="liquid-input mt-1 w-full rounded-[12px] px-3 py-2 text-[16px] sm:text-[13px]">
                  <option value="CNY">CNY (¥)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </label>
            </div>
          )}

          <div className="liquid-inset rounded-[16px] p-3.5">
            <div className="font-medium text-[#1d1d1f]">
              Cloudflare 免费额度预估 ({estNodes} 台主机 · 15s 心跳)
            </div>
            <div className="mt-1.5 space-y-1 font-mono-num text-[11.5px] text-[#4c515c]">
              <div className="flex justify-between">
                <span>Workers 请求</span>
                <span>~{estRequestsDay.toLocaleString()} / 100,000 ({((estRequestsDay / 100000) * 100).toFixed(1)}%)</span>
              </div>
              <div className="flex justify-between">
                <span>D1 行写入</span>
                <span>~{estD1WritesDay.toLocaleString()} / 100,000 ({((estD1WritesDay / 100000) * 100).toFixed(1)}%)</span>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" className="mt-3 rounded-[12px] bg-[#FF3B30]/10 px-3 py-2 text-[12.5px] font-medium text-[#c41e14]">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="liquid-btn min-h-[40px] rounded-full px-4 text-[13px] font-medium">
            {canEditServerSettings ? "取消" : "完成"}
          </button>
          {canEditServerSettings && (
            <button type="submit" disabled={busy} className="liquid-btn-primary min-h-[40px] rounded-full px-5 text-[13px] font-medium disabled:opacity-60">
              {busy ? "保存中..." : "存储"}
            </button>
          )}
        </div>
      </form>
    </AccessibleModal>
  );
}
