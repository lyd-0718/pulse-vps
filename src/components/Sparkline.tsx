import { useId, useState } from "react";
import type { SparkPoint } from "../../shared/types";
import { formatShortTime, formatSpeed } from "../lib/format";

interface SparklineProps {
  points: SparkPoint[];
  height?: number;
  offline?: boolean;
}

/**
 * Smooth throughput wave supporting mouse hover, touch scrub, and keyboard inspection.
 */
export function Sparkline({ points, height = 38, offline = false }: SparklineProps) {
  const gradId = useId();
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const width = 180;

  if (offline || !points || points.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label="暂无实时吞吐波形"
      >
        <line
          x1={2}
          y1={height / 2}
          x2={width - 2}
          y2={height / 2}
          stroke="rgba(29,29,31,0.16)"
          strokeWidth={1.2}
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const values = points.map((p) => p[2] + p[3]);
  const minVal = Math.min(...values);
  const maxVal = Math.max(minVal + 1024, ...values);

  const coords = values.map((v, idx) => {
    const x = 3 + (idx / (values.length - 1)) * (width - 9);
    const norm = (v - minVal) / (maxVal - minVal);
    const y = height - 5 - norm * (height - 11);
    return { x, y };
  });

  let linePath = `M${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const midX = ((prev.x + curr.x) / 2).toFixed(1);
    const midY = ((prev.y + curr.y) / 2).toFixed(1);
    linePath += ` Q${prev.x.toFixed(1)},${prev.y.toFixed(1)} ${midX},${midY}`;
  }
  const last = coords[coords.length - 1];
  linePath += ` L${last.x.toFixed(1)},${last.y.toFixed(1)}`;

  const areaPath = `${linePath} L${last.x.toFixed(1)},${height} L${coords[0].x.toFixed(1)},${height} Z`;

  const activePoint = activeIdx !== null ? points[activeIdx] : null;
  const activeCoord = activeIdx !== null ? coords[activeIdx] : last;

  const updateIndex = (clientX: number, rect: DOMRect) => {
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    setActiveIdx(Math.round(ratio * (points.length - 1)));
  };

  return (
    <div className="relative w-full">
      {activePoint && (
        <div className="pointer-events-none absolute -top-6 right-0 z-20 whitespace-nowrap rounded-full bg-white/96 px-2.5 py-0.5 font-mono-num text-[11px] font-medium text-[#1d1d1f] shadow-[0_4px_12px_-3px_rgba(15,23,42,0.18),0_0_0_0.5px_rgba(15,23,42,0.12)]">
          {formatShortTime(activePoint[0])} · {formatSpeed(activePoint[2] + activePoint[3])}
        </div>
      )}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`近 6 分钟吞吐曲线，当前 ${formatSpeed(values[values.length - 1])}`}
        tabIndex={0}
        className="w-full cursor-crosshair overflow-visible"
        style={{ height }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" || e.buttons > 0) {
            updateIndex(e.clientX, e.currentTarget.getBoundingClientRect());
          }
        }}
        onPointerDown={(e) => updateIndex(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setActiveIdx(null)}
        onFocus={() => setActiveIdx(points.length - 1)}
        onBlur={() => setActiveIdx(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#007AFF" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#007AFF" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke="#007AFF" strokeWidth="1.65" strokeLinecap="round" />

        {activeIdx !== null && (
          <line
            x1={activeCoord.x}
            y1={2}
            x2={activeCoord.x}
            y2={height}
            stroke="#007AFF"
            strokeWidth="0.9"
            strokeDasharray="2 2"
            opacity="0.55"
          />
        )}
        <circle cx={activeCoord.x} cy={activeCoord.y} r="4.5" fill="#007AFF" opacity="0.20" />
        <circle cx={activeCoord.x} cy={activeCoord.y} r="2.3" fill="#007AFF" stroke="#ffffff" strokeWidth="1" />
      </svg>
    </div>
  );
}
