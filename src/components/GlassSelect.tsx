import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface GlassSelectOption {
  value: string;
  label: string;
}

interface GlassSelectProps {
  value: string;
  options: ReadonlyArray<GlassSelectOption>;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}

/**
 * Apple Liquid Glass custom dropdown menu:
 * - Balanced pill trigger with rotating ChevronDown (no cramped native OS arrow)
 * - Floating frosted glass popover with checkmark & keyboard navigation
 */
export function GlassSelect({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
}: GlassSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(() =>
    Math.max(0, options.findIndex((o) => o.value === value)),
  );

  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    setActiveIdx(Math.max(0, options.findIndex((o) => o.value === value)));

    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, options, value]);

  const commit = (nextVal: string) => {
    onChange(nextVal);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIdx((prev) =>
        e.key === "ArrowDown"
          ? (prev + 1) % options.length
          : (prev - 1 + options.length) % options.length,
      );
    } else if (e.key === "Home" && open) {
      e.preventDefault();
      setActiveIdx(0);
    } else if (e.key === "End" && open) {
      e.preventDefault();
      setActiveIdx(options.length - 1);
    } else if ((e.key === "Enter" || e.key === " ") && open) {
      e.preventDefault();
      const item = options[activeIdx];
      if (item) commit(item.value);
    }
  };

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleTriggerKeyDown}
        className={`liquid-btn inline-flex min-h-[42px] items-center justify-between gap-2 rounded-full pl-3.5 pr-3 text-[13.5px] font-medium text-[#1d1d1f] transition sm:min-h-[36px] sm:text-[12.5px] ${
          open ? "bg-white/95 shadow-[0_0_0_1px_rgba(0,88,196,0.35),0_6px_18px_-6px_rgba(15,23,42,0.16)]" : ""
        }`}
      >
        <span className="truncate">{selected?.label ?? ""}</span>
        <ChevronDown
          aria-hidden="true"
          className={`h-3.5 w-3.5 shrink-0 text-[#4c515c] transition-transform duration-200 ${
            open ? "rotate-180 text-[#0058c4]" : ""
          }`}
        />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className="liquid-popover absolute top-[calc(100%+6px)] left-0 z-40 min-w-[148px] rounded-[18px] p-1.5"
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isActive = idx === activeIdx;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => commit(opt.value)}
                className={`flex min-h-[36px] w-full items-center justify-between gap-3 rounded-[12px] px-3 py-1.5 text-left text-[13px] transition-colors sm:min-h-[32px] sm:text-[12.5px] ${
                  isSelected
                    ? "bg-[#0058c4]/10 font-semibold text-[#0058c4]"
                    : isActive
                      ? "bg-[#1d1d1f]/[0.06] text-[#1d1d1f]"
                      : "text-[#1d1d1f] hover:bg-[#1d1d1f]/[0.05]"
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[#0058c4]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
