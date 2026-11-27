import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface LeafSegmentOption<T extends string> {
  id: T;
  label: string;
}

interface LeafSegmentedControlProps<T extends string> {
  options: ReadonlyArray<LeafSegmentOption<T>>;
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Adapted from guanmo-ai/ui-moments (Leaf Tabs, MIT).
 * Spring-animated active thumb measured dynamically so arbitrary Chinese/monospace labels align cleanly.
 */
export function LeafSegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  className = "",
}: LeafSegmentedControlProps<T>) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [thumb, setThumb] = useState<{ x: number; w: number; ready: boolean }>({
    x: 0,
    w: 0,
    ready: false,
  });

  const measure = useCallback(() => {
    const track = trackRef.current;
    const activeIdx = options.findIndex((o) => o.id === value);
    const btn = activeIdx >= 0 ? btnRefs.current[activeIdx] : null;
    if (!track || !btn) return;
    const tRect = track.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    setThumb({
      x: bRect.left - tRect.left,
      w: bRect.width,
      ready: true,
    });
  }, [options, value]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(track);
    return () => ro.disconnect();
  }, [measure]);

  const padBtn =
    size === "sm"
      ? "min-h-[28px] px-2.5 text-[11.5px]"
      : "min-h-[34px] px-3 text-[12px] sm:min-h-[30px]";

  return (
    <div
      ref={trackRef}
      role="group"
      aria-label={ariaLabel}
      className={`liquid-segment-track relative inline-flex items-center rounded-full p-[2px] ${className}`}
    >
      {thumb.ready && (
        <span
          aria-hidden="true"
          className="liquid-segment-thumb um-leaf-thumb pointer-events-none absolute top-[2px] bottom-[2px] left-0 rounded-full"
          style={{
            width: `${thumb.w}px`,
            transform: `translateX(${thumb.x}px)`,
          }}
        />
      )}
      {options.map((opt, idx) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            ref={(el) => {
              btnRefs.current[idx] = el;
            }}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.id)}
            className={`relative z-10 whitespace-nowrap rounded-full font-medium transition-colors duration-150 ${padBtn} ${
              active ? "font-semibold text-[#1d1d1f]" : "text-[#4c515c] hover:text-[#1d1d1f]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
