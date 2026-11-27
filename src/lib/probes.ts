export type ProbeCarrier = "ct" | "cu" | "cm" | "global";

export interface ProbeMeta {
  carrier: ProbeCarrier;
  carrierLabel: string;
  regionGroup: string;
  regionOrder: number;
}

export const CARRIER_FILTERS: Array<{ id: "all" | ProbeCarrier; label: string }> = [
  { id: "all", label: "全部" },
  { id: "ct", label: "电信" },
  { id: "cu", label: "联通" },
  { id: "cm", label: "移动" },
  { id: "global", label: "海外" },
];

const REGION_RULES: Array<{ test: RegExp; group: string; order: number }> = [
  { test: /(北京|天津|河北|山西|内蒙|华北|^bj-)/i, group: "华北 · 北京", order: 1 },
  { test: /(上海|江苏|浙江|安徽|福建|山东|华东|^sh-|^zj-|^js-)/i, group: "华东 · 上海", order: 2 },
  { test: /(广东|广州|深圳|广西|海南|华南|^gd-)/i, group: "华南 · 广东", order: 3 },
  { test: /(湖北|武汉|湖南|河南|江西|华中|^hb-)/i, group: "华中 · 湖北", order: 4 },
  { test: /(四川|成都|重庆|云南|贵州|西南|^sc-)/i, group: "西南 · 四川", order: 5 },
  { test: /(辽宁|沈阳|吉林|黑龙江|东北|^ln-)/i, group: "东北 · 辽宁", order: 6 },
  { test: /(陕西|西安|甘肃|青海|宁夏|新疆|西北|^sn-)/i, group: "西北 · 陕西", order: 7 },
  { test: /(google|cloudflare|anycast|香港|日本|新加坡|美国|海外|8\.8\.8\.8|1\.1\.1\.1)/i, group: "海外基准", order: 8 },
];

export function classifyProbe(name: string, target: string): ProbeMeta {
  const combined = `${name} ${target}`;

  let carrier: ProbeCarrier = "global";
  let carrierLabel = "海外";
  if (/电信|-ct-|\bct\b/i.test(combined)) {
    carrier = "ct";
    carrierLabel = "电信";
  } else if (/联通|-cu-|\bcu\b/i.test(combined)) {
    carrier = "cu";
    carrierLabel = "联通";
  } else if (/移动|-cm-|\bcm\b/i.test(combined)) {
    carrier = "cm";
    carrierLabel = "移动";
  }

  let regionGroup = carrier === "global" ? "海外基准" : "自定义线路";
  let regionOrder = carrier === "global" ? 8 : 9;

  for (const rule of REGION_RULES) {
    if (rule.test.test(name) || rule.test.test(target)) {
      regionGroup = rule.group;
      regionOrder = rule.order;
      break;
    }
  }

  return { carrier, carrierLabel, regionGroup, regionOrder };
}

export function carrierBadgeClasses(carrier: ProbeCarrier): string {
  switch (carrier) {
    case "ct":
      return "bg-[#007AFF]/[0.10] text-[#0058c4]";
    case "cu":
      return "bg-[#FF9500]/[0.12] text-[#9a4500]";
    case "cm":
      return "bg-[#34C759]/[0.12] text-[#156230]";
    default:
      return "bg-[#1d1d1f]/[0.07] text-[#4c515c]";
  }
}
