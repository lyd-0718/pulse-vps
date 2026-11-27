import { useId, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import type {
  BillingCycle,
  CurrencyCode,
  NodeDto,
  NodeUpsertPayload,
  ProbeType,
  TrafficMode,
  TrafficUnitBase,
} from "../../shared/types";
import { AccessibleModal } from "./AccessibleModal";
import { ChipInput } from "./ui-moments/ChipInput";
import { CopyMorphButton } from "./ui-moments/CopyMorphButton";
import { InkSwitch } from "./ui-moments/InkSwitch";
import { LeafSegmentedControl } from "./ui-moments/LeafSegmentedControl";

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const shakeInput = () => {
    const el = inputRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-7px)" },
        { transform: "translateX(7px)" },
        { transform: "translateX(-4px)" },
        { transform: "translateX(4px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 320, easing: "ease-out" },
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("请输入管理员密码");
      shakeInput();
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
      shakeInput();
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
          ref={inputRef}
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

  if (!node) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : `https://${domain}`;
  const hasRealToken = Boolean(rawToken);
  const tokenDisplay = rawToken || "<NODE_TOKEN>";
  const cmdSystemd = `curl -fsSL ${origin}/install.sh | sudo bash -s -- --server ${origin} --token ${tokenDisplay}`;
  const cmdBinary = `./vps-agent-linux-${arch} --server ${origin} --token ${tokenDisplay}`;

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
              <CopyMorphButton
                text={cmdSystemd}
                variant="inline"
                label={hasRealToken ? "复制命令" : "复制模板"}
                copiedLabel="已复制"
              />
            </div>
            <pre className="liquid-inset overflow-x-auto rounded-[16px] p-3.5 font-mono-num text-[12px] text-[#1d1d1f]">
              {cmdSystemd}
            </pre>
          </div>

          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-[#4c515c]">
              <div className="flex items-center gap-2">
                <span>直接运行静态二进制</span>
                <LeafSegmentedControl
                  size="sm"
                  ariaLabel="选择 CPU 架构"
                  value={arch}
                  onChange={setArch}
                  options={[
                    { id: "amd64", label: "amd64" },
                    { id: "arm64", label: "arm64" },
                  ]}
                />
              </div>
              <CopyMorphButton
                text={cmdBinary}
                variant="inline"
                label={hasRealToken ? "复制命令" : "复制模板"}
                copiedLabel="已复制"
              />
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
  const [tags, setTags] = useState<string[]>(editing?.tags ?? []);
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
          tags,
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
              <div className="col-span-2 block">
                <span className="text-[#4c515c]">标签（回车或逗号添加）</span>
                <ChipInput
                  values={tags}
                  onChange={setTags}
                  placeholder="例如 CN2 GIA / BGP / 家宽"
                />
              </div>
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
                <div className="col-span-2 border-t border-[#1d1d1f]/[0.07] pt-3">
                  <InkSwitch
                    checked={enableCalibrate}
                    onChange={setEnableCalibrate}
                    label="校准本月已用流量（可选）"
                    description="开启后可手动输入商家面板上的入站/出站 GB 进行一次对齐"
                  />
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
              <div className="self-end pb-1">
                <InkSwitch
                  checked={autoRenew}
                  onChange={setAutoRenew}
                  label="自动续费"
                />
              </div>
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
