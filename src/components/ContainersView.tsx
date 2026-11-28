import { useMemo, useState } from "react";
import { ArrowUpDown, Search } from "lucide-react";
import type { NodeDto } from "../../shared/types";
import { formatBytes } from "../lib/format";
import { GlassSelect } from "./GlassSelect";
import { LeafSegmentedControl } from "./ui-moments/LeafSegmentedControl";

interface ContainersViewProps {
  nodes: NodeDto[];
  onSelectNode: (nodeId: string) => void;
}

type SortKey = "cpu" | "mem" | "state" | "host";

export function ContainersView({ nodes, onSelectNode }: ContainersViewProps) {
  const [nodeFilter, setNodeFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState<"all" | "running" | "exited">("all");
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("cpu");
  const [sortDesc, setSortDesc] = useState(true);

  const rows = useMemo(() => {
    const out: Array<{ node: NodeDto; container: NodeDto["containers"][number] }> = [];
    for (const node of nodes) {
      for (const container of node.containers) {
        out.push({ node, container });
      }
    }
    return out;
  }, [nodes]);

  const filtered = useMemo(() => {
    const list = rows.filter(({ node, container }) => {
      if (nodeFilter !== "all" && node.id !== nodeFilter) return false;
      if (stateFilter === "running" && container.state !== "running") return false;
      if (stateFilter === "exited" && container.state === "running") return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        if (
          !container.name.toLowerCase().includes(q) &&
          !container.image.toLowerCase().includes(q) &&
          !node.name.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "cpu") cmp = a.container.cpuPct - b.container.cpuPct;
      else if (sortKey === "mem") cmp = a.container.memUsed - b.container.memUsed;
      else if (sortKey === "state") cmp = a.container.state.localeCompare(b.container.state);
      else cmp = a.node.name.localeCompare(b.node.name);
      return sortDesc ? -cmp : cmp;
    });
  }, [rows, nodeFilter, stateFilter, query, sortKey, sortDesc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(key === "cpu" || key === "mem");
    }
  };

  const resetFilters = () => {
    setNodeFilter("all");
    setStateFilter("all");
    setQuery("");
  };

  const runningCount = rows.filter((r) => r.container.state === "running").length;
  const stoppedCount = rows.length - runningCount;
  const totalRam = rows.reduce((acc, r) => acc + (r.container.memUsed || 0), 0);
  const hasFilters = nodeFilter !== "all" || stateFilter !== "all" || query.trim() !== "";

  return (
    <div className="space-y-5">
      {/* Clean Activity Monitor Summary Bar (decorative dot matrix removed) */}
      <section className="liquid-glass grid grid-cols-2 divide-y divide-[#1d1d1f]/[0.07] rounded-[16px] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <div className="px-5 py-4">
          <div className="text-[12px] font-medium text-[#4c515c]">容器总数</div>
          <div className="apple-nums mt-1 text-[24px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            {rows.length}
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="text-[12px] font-medium text-[#4c515c]">运行中</div>
          <div className="apple-nums mt-1 flex items-center gap-2 text-[24px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-[#34C759]" />
            {runningCount}
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="text-[12px] font-medium text-[#4c515c]">已停止 / 异常</div>
          <div className="apple-nums mt-1 flex items-center gap-2 text-[24px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: stoppedCount > 0 ? "#FF3B30" : "#B8BCC4" }}
            />
            {stoppedCount}
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="text-[12px] font-medium text-[#4c515c]">容器内存总计</div>
          <div className="apple-nums mt-1 text-[24px] font-semibold tracking-[-0.02em] text-[#1d1d1f]">
            {formatBytes(totalRam)}
          </div>
        </div>
      </section>

      {/* Container List directly inside Glass Surface (no redundant nested box) */}
      <section className="liquid-glass rounded-[26px] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#555a66]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="筛选容器或镜像"
                placeholder="筛选容器或镜像"
                className="liquid-input min-h-[40px] w-52 rounded-full py-1.5 pr-3.5 pl-8 text-[14px] sm:min-h-[34px] sm:text-[12.5px]"
              />
            </div>

            <GlassSelect
              value={nodeFilter}
              onChange={setNodeFilter}
              ariaLabel="按主机筛选容器"
              options={[
                { value: "all", label: "全部主机" },
                ...nodes.map((n) => ({ value: n.id, label: `${n.flag} ${n.name}` })),
              ]}
            />
          </div>

          <LeafSegmentedControl
            ariaLabel="按容器状态筛选"
            value={stateFilter}
            onChange={setStateFilter}
            options={[
              { id: "all", label: `全部 ${rows.length}` },
              { id: "running", label: `运行中 ${runningCount}` },
              { id: "exited", label: `已停止 ${stoppedCount}` },
            ]}
          />
        </div>

        <div className="overflow-x-auto border-t border-[#1d1d1f]/[0.08]">
          <table className="w-full text-left text-[12.5px]">
            <thead className="border-b border-[#1d1d1f]/[0.08] text-[12px] text-[#4c515c]">
              <tr>
                <th className="px-3 py-3 font-medium">
                  <button type="button" onClick={() => toggleSort("host")} className="inline-flex items-center gap-1 hover:text-[#1d1d1f]">
                    主机 <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 font-medium">容器名称</th>
                <th className="px-3 py-3 font-medium">镜像</th>
                <th className="px-3 py-3 font-medium">
                  <button type="button" onClick={() => toggleSort("state")} className="inline-flex items-center gap-1 hover:text-[#1d1d1f]">
                    状态 <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 text-right font-medium">
                  <button type="button" onClick={() => toggleSort("cpu")} className="inline-flex items-center gap-1 hover:text-[#1d1d1f]">
                    CPU 负载 <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-3 py-3 text-right font-medium">
                  <button type="button" onClick={() => toggleSort("mem")} className="inline-flex items-center gap-1 hover:text-[#1d1d1f]">
                    内存 <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1d1d1f]/[0.06]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-[#555a66]">
                    <div>暂无匹配的 Docker 容器</div>
                    {hasFilters && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="liquid-btn mt-3 min-h-[36px] rounded-full px-4 text-[12px] font-medium"
                      >
                        重置筛选
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map(({ node, container }) => {
                  const memPct =
                    container.memLimit > 0 ? Math.min(100, (container.memUsed / container.memLimit) * 100) : 0;
                  const cpuBar = Math.min(100, Math.max(2, container.cpuPct));
                  const running = container.state === "running";
                  return (
                    <tr key={`${node.id}-${container.id}`} className="transition hover:bg-white/45">
                      <td className="whitespace-nowrap px-3 py-3 text-[#4c515c]">
                        <button
                          type="button"
                          onClick={() => onSelectNode(node.id)}
                          className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg text-left transition-colors hover:text-[#0058c4]"
                        >
                          <span aria-hidden="true">{node.flag}</span>
                          <span>{node.name}</span>
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-semibold text-[#1d1d1f]">
                        {container.name}
                      </td>
                      <td
                        className="max-w-[240px] truncate px-3 py-3 font-mono-num text-[12px] text-[#555a66]"
                        title={container.image}
                      >
                        {container.image}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-[12px] ${running ? "text-[#1d1d1f]" : "font-medium text-[#c41e14]"}`}>
                          <span
                            aria-hidden="true"
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: running ? "#34C759" : "#FF3B30" }}
                          />
                          {container.status || container.state}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-mono-num text-[#1d1d1f]">
                        <div>{container.cpuPct.toFixed(1)}%</div>
                        <div className="liquid-track mt-1 ml-auto h-[4px] w-16 overflow-hidden rounded-full">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${cpuBar}%`,
                              backgroundColor: container.cpuPct >= 50 ? "#FF9500" : "#5856D6",
                            }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono-num text-[#1d1d1f]">
                        <div>{formatBytes(container.memUsed)}</div>
                        {container.memLimit > 0 && (
                          <div className="liquid-track mt-1 ml-auto h-[4px] w-20 overflow-hidden rounded-full">
                            <div
                              className="h-full rounded-full bg-[#007AFF]"
                              style={{ width: `${memPct}%` }}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
