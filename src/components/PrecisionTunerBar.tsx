import { useState } from "react";
import type { TrafficUnitBase } from "../../shared/types";
import { formatBytes } from "../lib/format";

interface PrecisionTunerBarProps {
  percent: number;
  rxPercent: number;
  rxBytes: number;
  txBytes: number;
  limitGb: number;
  unitBase?: TrafficUnitBase;
  warning?: boolean;
}

/**
 * Precision 42-tick traffic ruler with Gaussian hover/touch scrub wave
 * plus always-visible compact Rx / Tx readout for touch & keyboard accessibility.
 */
export function PrecisionTunerBar({
  percent,
  rxPercent,
  rxBytes,
  txBytes,
  limitGb,
  unitBase = 1024,
  warning = false,
}: PrecisionTunerBarProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const ticks = 42;
  const clamped = Math.max(0, Math.min(100, percent));
  const activeCount = Math.round((clamped / 100) * ticks);
  const rxCount = Math.round((Math.min(100, rxPercent) / 100) * ticks);

  const inspectedGb = activeIdx !== null ? Math.round(((activeIdx + 1) / ticks) * limitGb) : null;

  const updateFromClientX = (clientX: number, rect: DOMRect) => {
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    setActiveIdx(Math.min(ticks - 1, Math.floor(ratio * ticks)));
  };

  return (
    <div className="relative pt-1.5">
      {/* Floating readout pill while hovering or tapping ticks */}
      {activeIdx !== null && (
        <div
          className="pointer-events-none absolute -top-6 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/96 px-2.5 py-0.5 font-mono-num text-[11px] font-medium text-[#1d1d1f] shadow-[0_4px_14px_-3px_rgba(15,23,42,0.18),0_0_0_0.5px_rgba(15,23,42,0.12)]"
          style={{ left: `${Math.min(82, Math.max(18, ((activeIdx + 0.5) / ticks) * 100))}%` }}
        >
          {activeIdx < activeCount
            ? `入站 ${formatBytes(rxBytes, 1, unitBase)} · 出站 ${formatBytes(txBytes, 1, unitBase)}`
            : `刻度 ${inspectedGb} GB / ${limitGb} GB`}
        </div>
      )}

      <div
        role="meter"
        aria-label="本月流量进度标尺"
        aria-valuemin={0}
        aria-valuemax={limitGb}
        aria-valuenow={Math.round((clamped / 100) * limitGb)}
        tabIndex={0}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" || e.buttons > 0) {
            updateFromClientX(e.clientX, e.currentTarget.getBoundingClientRect());
          }
        }}
        onPointerDown={(e) => {
          updateFromClientX(e.clientX, e.currentTarget.getBoundingClientRect());
        }}
        onPointerLeave={() => setActiveIdx(null)}
        onFocus={() => setActiveIdx(Math.max(0, activeCount - 1))}
        onBlur={() => setActiveIdx(null)}
        className="relative flex h-6 w-full cursor-crosshair items-end justify-between rounded-sm"
      >
        {Array.from({ length: ticks }).map((_, idx) => {
          const isMajor = idx % 7 === 0 || idx === ticks - 1;
          const isActive = idx < activeCount;
          const isNeedle = idx === Math.max(0, activeCount - 1) && clamped > 0;
          const wave = activeIdx === null ? 0 : Math.exp(-Math.pow((idx - activeIdx) / 2.6, 2));

          let color = "rgba(29, 29, 31, 0.16)";
          if (isActive) {
            if (warning || clamped >= 85) {
              color = isNeedle ? "#FF3B30" : "#FF9500";
            } else {
              color = idx < rxCount ? "#007AFF" : "#38BDF8";
            }
          } else if (wave > 0.45) {
            color = "rgba(29, 29, 31, 0.38)";
          }

          const basePx = isNeedle ? 16 : isMajor ? 11 : 7;
          const heightPx = Math.min(20, basePx + wave * 8);

          return (
            <div key={idx} className="flex h-6 flex-1 items-end justify-center">
              <span
                className="rounded-full transition-all duration-150"
                style={{
                  width: isNeedle || wave > 0.7 ? "2.5px" : "1.5px",
                  height: `${heightPx.toFixed(1)}px`,
                  backgroundColor: color,
                  boxShadow: isNeedle
                    ? `0 0 8px ${warning ? "rgba(255,59,48,0.45)" : "rgba(0,122,255,0.45)"}`
                    : undefined,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Always-visible compact Rx / Tx summary so touch & keyboard users never miss the split */}
      <div className="mt-1 flex items-center justify-between font-mono-num text-[11.5px] text-[#555a66]">
        <span>入站 {formatBytes(rxBytes, 1, unitBase)}</span>
        <span>出站 {formatBytes(txBytes, 1, unitBase)}</span>
      </div>
    </div>
  );
}
