import type { BillingCycle, CurrencyCode, TrafficUnitBase } from "../../shared/types";

export function formatBytes(bytes: number, decimals = 1, base: TrafficUnitBase = 1024): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const k = base === 1000 ? 1000 : 1024;
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

export function gbToBytes(gb: number, base: TrafficUnitBase = 1024): number {
  const k = base === 1000 ? 1000 : 1024;
  return gb * k ** 3;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "0 B/s";
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  const k = 1024;
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytesPerSec) / Math.log(k)));
  const val = bytesPerSec / Math.pow(k, i);
  return `${val.toFixed(i === 0 ? 0 : val >= 100 ? 0 : 1)} ${units[i]}`;
}

export function formatSpeedBits(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "0 bps";
  const bitsPerSec = bytesPerSec * 8;
  const units = ["bps", "Kbps", "Mbps", "Gbps"];
  const k = 1000;
  const i = Math.min(units.length - 1, Math.floor(Math.log(bitsPerSec) / Math.log(k)));
  const val = bitsPerSec / Math.pow(k, i);
  return `${val.toFixed(i === 0 ? 0 : val >= 100 ? 0 : 1)} ${units[i]}`;
}

export function computeRemainingValue(
  price: number,
  cycle: BillingCycle,
  expireDate: string,
): number | null {
  if (!Number.isFinite(price) || price <= 0) return null;
  const remain = daysUntil(expireDate);
  if (remain === null) return null;
  if (remain <= 0) return 0;
  const cycleDays =
    cycle === "annual" ? 365 : cycle === "semiannual" ? 182.5 : cycle === "quarterly" ? 91.25 : 30.4375;
  const ratio = Math.min(1, remain / cycleDays);
  return price * ratio;
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0m";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function formatRelativeTime(ts: number, now = Date.now()): string {
  if (!Number.isFinite(ts) || ts <= 0) return "从未上报";
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSec < 10) return "刚刚";
  if (diffSec < 60) return `${diffSec} 秒前`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小时前`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} 天前`;
}

export function formatShortTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatShortDateTime(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${m}-${day} ${hh}:${mm}`;
}

export function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const parsed = Date.parse(dateStr + "T23:59:59");
  if (Number.isNaN(parsed)) return null;
  return Math.ceil((parsed - Date.now()) / 86400_000);
}

const FX_TO_USD: Record<CurrencyCode, number> = {
  USD: 1,
  CNY: 1 / 7.25,
  EUR: 1.08,
};

export function convertCurrency(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return amount;
  const usd = amount * (FX_TO_USD[from] ?? 1);
  return usd / (FX_TO_USD[to] ?? 1);
}

export function normalizeMonthlyAmount(price: number, cycle: BillingCycle): number {
  if (!price) return 0;
  switch (cycle) {
    case "quarterly":
      return price / 3;
    case "semiannual":
      return price / 6;
    case "annual":
      return price / 12;
    case "monthly":
    default:
      return price;
  }
}

export function formatCurrency(amount: number, currency: CurrencyCode): string {
  const symbol = currency === "CNY" ? "¥" : currency === "EUR" ? "€" : "$";
  return `${symbol}${amount.toFixed(2)}`;
}

export function cycleLabel(cycle: BillingCycle): string {
  switch (cycle) {
    case "quarterly":
      return "季付";
    case "semiannual":
      return "半年付";
    case "annual":
      return "年付";
    default:
      return "月付";
  }
}
