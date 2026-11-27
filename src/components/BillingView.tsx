import { useMemo, useState } from "react";
import { ArrowUpDown, Pencil } from "lucide-react";
import type { CurrencyCode, NodeDto } from "../../shared/types";
import {
  convertCurrency,
  cycleLabel,
  daysUntil,
  formatBytes,
  formatCurrency,
  normalizeMonthlyAmount,
} from "../lib/format";
import { CopyMorphButton } from "./ui-moments/CopyMorphButton";
import { LeafSegmentedControl } from "./ui-moments/LeafSegmentedControl";
import { RollingNumber } from "./ui-moments/RollingNumber";

interface BillingViewProps {
  nodes: NodeDto[];
  displayCurrency: CurrencyCode;
  authenticated: boolean;
  onChangeCurrency: (currency: CurrencyCode) => void;
  onEditNode: (node: NodeDto) => void;
  onSelectNode: (nodeId: string) => void;
}

const WALLET_PALETTE = ["#007AFF", "#5856D6", "#30B0C7", "#34C759", "#FF9500", "#AF52DE"];

export function BillingView({
  nodes,
  displayCurrency,
  authenticated,
  onChangeCurrency,
  onEditNode,
  onSelectNode,
}: BillingViewProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"expiry" | "cost">("expiry");

  const shares = useMemo(
    () =>
      nodes.map((n, idx) => ({
        node: n,
        monthly: convertCurrency(normalizeMonthlyAmount(n.price, n.billingCycle), n.currency, displayCurrency),
        days: daysUntil(n.expireDate),
        color: WALLET_PALETTE[idx % WALLET_PALETTE.length],
      })),
    [nodes, displayCurrency],
  );

  const monthlyTotal = shares.reduce((s, item) => s + item.monthly, 0);
  const annualTotal = monthlyTotal * 12;
  const currencySymbol = displayCurrency === "CNY" ? "¥" : displayCurrency === "EUR" ? "€" : "$";
  const [intPart, decPart] = monthlyTotal.toFixed(2).split(".");

  const renewalQueue = useMemo(() => {
    return [...shares]
      .filter((x) => x.days !== null)
      .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));
  }, [shares]);

  const sortedLedger = useMemo(() => {
    return [...shares].sort((a, b) => {
      if (sortBy === "cost") return b.monthly - a.monthly;
      return (a.days ?? 9999) - (b.days ?? 9999);
    });
  }, [shares, sortBy]);

  const cycleMonth = new Date().toISOString().slice(0, 7);

  const statementText = useMemo(
    () =>
      [
        `PulseVPS 月度账单 (${cycleMonth} · ${displayCurrency} · 按参考汇率折算)`,
        "--------------------------------",
        ...shares.map(
          (s) =>
            `${s.node.name}  ${formatCurrency(s.monthly, displayCurrency)}/月  ${
              s.node.expireDate ? `到期 ${s.node.expireDate}` : "未设到期日"
            }`,
        ),
        "--------------------------------",
        `月度合计: ${formatCurrency(monthlyTotal, displayCurrency)}`,
        `预估年费: ${formatCurrency(annualTotal, displayCurrency)}`,
      ].join("\n"),
    [cycleMonth, displayCurrency, shares, monthlyTotal, annualTotal],
  );

  return (
    <div className="space-y-6">
      {/* Top Bento: Apple Wallet Breakdown <-> Actionable Renewal & Expiry Queue */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left 7 Cols: Spend Breakdown */}
        <section className="liquid-glass flex flex-col justify-between rounded-[26px] p-5 sm:p-6 lg:col-span-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[13px] font-medium text-[#4c515c]">月度持有成本</h2>
              <div className="apple-nums mt-1.5 flex items-baseline tracking-[-0.03em]">
                <span className="text-[22px] font-semibold text-[#4c515c]">{currencySymbol}</span>
                <RollingNumber value={intPart} className="text-[40px] font-semibold text-[#1d1d1f]" />
                <RollingNumber value={`.${decPart}`} className="text-[24px] font-medium text-[#555a66]" />
                <span className="ml-2 text-[13px] text-[#555a66]">/ 月</span>
              </div>
              <div className="apple-nums mt-1.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-[#4c515c]">
                <span>预估年度支出 {formatCurrency(annualTotal, displayCurrency)}</span>
                <span className="text-[#9ca3af]">·</span>
                <span className="text-[12px] text-[#555a66]">按固定参考汇率折算</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <LeafSegmentedControl
                size="sm"
                ariaLabel="切换结算货币"
                value={displayCurrency}
                onChange={onChangeCurrency}
                options={[
                  { id: "CNY", label: "CNY" },
                  { id: "USD", label: "USD" },
                  { id: "EUR", label: "EUR" },
                ]}
              />
              <CopyMorphButton
                text={statementText}
                label="复制账单"
                copiedLabel="已复制"
              />
            </div>
          </div>

          {monthlyTotal > 0 && (
            <div className="mt-6" onMouseLeave={() => setHoveredNodeId(null)}>
              <div className="liquid-track flex h-3 w-full gap-[2px] overflow-hidden rounded-full p-[1.5px]">
                {shares
                  .filter((s) => s.monthly > 0)
                  .map((s) => {
                    const active = hoveredNodeId === null || hoveredNodeId === s.node.id;
                    return (
                      <div
                        key={s.node.id}
                        onMouseEnter={() => setHoveredNodeId(s.node.id)}
                        className="h-full cursor-pointer transition-opacity duration-200 first:rounded-l-full last:rounded-r-full"
                        style={{
                          width: `${(s.monthly / monthlyTotal) * 100}%`,
                          backgroundColor: s.color,
                          opacity: active ? 1 : 0.3,
                        }}
                        title={`${s.node.name}: ${formatCurrency(s.monthly, displayCurrency)} / 月`}
                      />
                    );
                  })}
              </div>
              <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-[#4c515c]">
                {shares
                  .filter((s) => s.monthly > 0)
                  .map((s) => {
                    const highlighted = hoveredNodeId === s.node.id;
                    return (
                      <button
                        key={s.node.id}
                        type="button"
                        onMouseEnter={() => setHoveredNodeId(s.node.id)}
                        onClick={() => onSelectNode(s.node.id)}
                        className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-2.5 transition sm:min-h-[26px] ${
                          highlighted ? "bg-white/90 shadow-2xs" : "hover:bg-white/55"
                        }`}
                      >
                        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="font-medium text-[#1d1d1f]">{s.node.name}</span>
                        <span className="apple-nums text-[#555a66]">
                          {Math.round((s.monthly / monthlyTotal) * 100)}%
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </section>

        {/* Right 5 Cols: Calm, Actionable Renewal & Expiry Reminder Panel */}
        <aside className="liquid-glass flex flex-col justify-between rounded-[26px] p-5 sm:p-6 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-[#1d1d1f]">
                续费与到期提醒
              </h2>
              <span className="font-mono-num text-[12px] text-[#555a66]">{cycleMonth}</span>
            </div>

            {renewalQueue.length === 0 ? (
              <div className="py-8 text-center text-[12.5px] text-[#555a66]">暂无已登记到期日的主机</div>
            ) : (
              <div className="mt-3.5 divide-y divide-[#1d1d1f]/[0.07]" onMouseLeave={() => setHoveredNodeId(null)}>
                {renewalQueue.map((item) => {
                  const urgent = item.days !== null && item.days <= 10;
                  const highlighted = hoveredNodeId === item.node.id;
                  return (
                    <button
                      key={item.node.id}
                      type="button"
                      onMouseEnter={() => setHoveredNodeId(item.node.id)}
                      onClick={() => onSelectNode(item.node.id)}
                      className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left transition ${
                        highlighted ? "bg-white/70" : "hover:bg-white/45"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#1d1d1f]">
                          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="truncate">{item.node.name}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-[#555a66]">
                          <span className="font-mono-num">{item.node.expireDate}</span>
                          <span
                            className={
                              item.node.autoRenew
                                ? "font-medium text-[#156230]"
                                : urgent
                                  ? "font-semibold text-[#9a4500]"
                                  : "text-[#555a66]"
                            }
                          >
                            {item.node.autoRenew ? "自动续费" : "需手动续费"}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`apple-nums shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                          urgent
                            ? "bg-[#FF9500]/16 text-[#9a4500]"
                            : "bg-white/75 text-[#4c515c]"
                        }`}
                      >
                        {item.days !== null && item.days <= 0 ? "已到期" : `余 ${item.days} 天`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Asset & Renewal Ledger directly inside Glass Surface */}
      <section className="liquid-glass rounded-[26px] p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
              资产与续费台账
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[#4c515c]">
              所有 VPS 规格、原价周期、月度流量与到期状态汇总
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSortBy(sortBy === "expiry" ? "cost" : "expiry")}
              className="liquid-btn inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-[12px] font-medium sm:min-h-[30px]"
            >
              <ArrowUpDown className="h-3.5 w-3.5 text-[#555a66]" />
              {sortBy === "expiry" ? "按到期时间" : "按折合月费"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border-t border-[#1d1d1f]/[0.08]" onMouseLeave={() => setHoveredNodeId(null)}>
          <table className="w-full text-left text-[12.5px]">
            <thead className="border-b border-[#1d1d1f]/[0.08] text-[12px] text-[#4c515c]">
              <tr>
                <th className="px-3 py-3 font-medium">主机 / 服务商</th>
                <th className="px-3 py-3 font-medium">规格</th>
                <th className="px-3 py-3 font-medium">周期原价</th>
                <th className="px-3 py-3 font-medium">折合月费</th>
                <th className="px-3 py-3 font-medium">月流量</th>
                <th className="px-3 py-3 font-medium">到期时间</th>
                <th className="px-3 py-3 font-medium">续费与备注</th>
                {authenticated && <th className="px-3 py-3 text-right font-medium">操作</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1d1d1f]/[0.06]">
              {sortedLedger.map(({ node, monthly, days }) => {
                const highlighted = hoveredNodeId === node.id;
                return (
                  <tr
                    key={node.id}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    className={`transition ${highlighted ? "bg-white/65" : "hover:bg-white/40"}`}
                  >
                    <td className="whitespace-nowrap px-3 py-3.5">
                      <button
                        type="button"
                        onClick={() => onSelectNode(node.id)}
                        className="text-left transition-colors hover:text-[#0058c4]"
                      >
                        <div className="font-semibold text-[#1d1d1f] hover:text-[#0058c4]">
                          {node.flag} {node.name}
                        </div>
                        <div className="text-[12px] text-[#555a66]">
                          {node.provider || node.region} {node.ip && `· ${node.ip}`}
                        </div>
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 font-mono-num text-[12px] text-[#4c515c]">
                      {node.cpuCores || "—"}C / {formatBytes(node.memTotal, 0)} / {formatBytes(node.diskTotal, 0)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 apple-nums text-[#4c515c]">
                      {node.price > 0 ? (
                        <>
                          {formatCurrency(node.price, node.currency)}
                          <span className="ml-1 text-[11.5px] text-[#555a66]">/ {cycleLabel(node.billingCycle)}</span>
                        </>
                      ) : (
                        <span className="text-[#555a66]">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 font-mono-num font-semibold text-[#1d1d1f]">
                      {formatCurrency(monthly, displayCurrency)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 apple-nums text-[#4c515c]">
                      {formatBytes(node.trafficUsedBytes, 1, node.trafficUnitBase === 1000 ? 1000 : 1024)} / {node.trafficLimitGb} GB
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 apple-nums">
                      {node.expireDate ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono-num text-[#1d1d1f]">{node.expireDate}</span>
                          {days !== null && (
                            <span
                              className={`whitespace-nowrap text-[12px] font-semibold ${
                                days <= 10 ? "text-[#9a4500]" : "text-[#555a66]"
                              }`}
                            >
                              {days <= 0 ? "已到期" : `余 ${days} 天`}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#555a66]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {node.autoRenew && (
                          <span className="shrink-0 whitespace-nowrap rounded-full bg-[#34C759]/15 px-2 py-0.5 text-[11.5px] font-semibold text-[#156230]">
                            自动续费
                          </span>
                        )}
                        {node.notes && (
                          <span className="max-w-[180px] text-[12px] leading-snug text-[#4c515c]" title={node.notes}>
                            {node.notes}
                          </span>
                        )}
                      </div>
                    </td>
                    {authenticated && (
                      <td className="px-3 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => onEditNode(node)}
                          className="liquid-btn inline-flex min-h-[34px] items-center gap-1 rounded-full px-3 text-[12px] font-medium"
                        >
                          <Pencil className="h-3.5 w-3.5 text-[#4c515c]" /> 编辑
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
