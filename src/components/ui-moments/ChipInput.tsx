import { useRef, useState } from "react";
import { X } from "lucide-react";

interface ChipInputProps {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  maxChips?: number;
  ariaLabel?: string;
}

/**
 * Adapted from guanmo-ai/ui-moments (Chip Input, MIT).
 * Tactile tag pill input with Enter/comma commit, Backspace pop, and duplicate-shake feedback.
 */
export function ChipInput({
  values,
  onChange,
  placeholder = "输入标签后按回车",
  maxChips = 6,
  ariaLabel = "主机标签",
}: ChipInputProps) {
  const [draft, setDraft] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const shake = () => {
    const el = containerRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-4px)" },
        { transform: "translateX(4px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 220, easing: "ease-out" },
    );
  };

  const commit = (raw: string) => {
    const clean = raw.trim();
    if (!clean) return;
    if (values.includes(clean)) {
      shake();
      setDraft("");
      return;
    }
    const next = values.length >= maxChips ? [...values.slice(1), clean] : [...values, clean];
    onChange(next);
    setDraft("");
  };

  const removeAt = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
    inputRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={ariaLabel}
      onPointerDown={(e) => {
        if (e.target === containerRef.current) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }}
      className="liquid-input mt-1 flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-[12px] px-2.5 py-1.5 cursor-text"
    >
      {values.map((tag, idx) => (
        <span
          key={tag}
          className="um-chip-in inline-flex h-[26px] items-center gap-1 rounded-[8px] bg-[#007AFF]/[0.10] pr-1 pl-2.5 text-[12px] font-medium text-[#0058c4]"
        >
          <span>{tag}</span>
          <button
            type="button"
            onClick={() => removeAt(idx)}
            aria-label={`移除标签 ${tag}`}
            className="flex h-4.5 w-4.5 items-center justify-center rounded-[5px] text-[#0058c4]/75 transition hover:bg-[#007AFF]/[0.14] hover:text-[#0058c4]"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim()) commit(draft);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter" || e.key === "," || e.key === "，") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && !draft && values.length > 0) {
            removeAt(values.length - 1);
          }
        }}
        placeholder={values.length === 0 ? placeholder : "添加..."}
        aria-label={ariaLabel}
        enterKeyHint="done"
        maxLength={18}
        className="min-w-[84px] flex-1 bg-transparent px-1 py-0.5 text-[14px] text-[#1d1d1f] outline-none placeholder:text-[#555a66] sm:text-[13px]"
      />
    </div>
  );
}
