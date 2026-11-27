import { useEffect, useRef } from "react";

interface InkSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

/**
 * Adapted from guanmo-ai/ui-moments (Ink Switch, MIT).
 * Circular clip-path ink reveal with squashing spring knob and droplet splash.
 */
export function InkSwitch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: InkSwitchProps) {
  const fillRef = useRef<HTMLSpanElement | null>(null);
  const knobRef = useRef<HTMLSpanElement | null>(null);
  const splashRef = useRef<HTMLSpanElement | null>(null);
  const motionsRef = useRef<Animation[]>([]);

  useEffect(() => {
    return () => {
      motionsRef.current.forEach((m) => m.cancel());
      motionsRef.current = [];
    };
  }, []);

  const toggle = () => {
    if (disabled) return;
    const next = !checked;
    onChange(next);

    motionsRef.current.forEach((m) => m.cancel());
    motionsRef.current = [];

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const knob = knobRef.current;
    const fill = fillRef.current;
    const splash = splashRef.current;

    if (knob) {
      motionsRef.current.push(
        knob.animate(
          [
            { scale: "1 1" },
            { scale: "1.24 0.86", offset: 0.32 },
            { scale: "0.95 1.05", offset: 0.68 },
            { scale: "1 1" },
          ],
          { duration: 420, easing: "cubic-bezier(.3, .7, .4, 1)" },
        ),
      );
    }

    if (fill) {
      if (next) {
        motionsRef.current.push(
          fill.animate(
            [
              { clipPath: "circle(0px at 14px 50%)" },
              { clipPath: "circle(10px at 14px 50%)", offset: 0.18 },
              { clipPath: "circle(52px at 14px 50%)" },
            ],
            { duration: 460, easing: "cubic-bezier(.2, .75, .25, 1)" },
          ),
        );
      } else {
        motionsRef.current.push(
          fill.animate(
            [
              { clipPath: "circle(52px at 34px 50%)" },
              { clipPath: "circle(12px at 34px 50%)", offset: 0.7 },
              { clipPath: "circle(0px at 34px 50%)" },
            ],
            { duration: 360, easing: "cubic-bezier(.5, 0, .3, 1)" },
          ),
        );
      }
    }

    if (next && splash) {
      const drops = Array.from(splash.children);
      drops.forEach((drop, idx) => {
        const angle = ((-55 + idx * 55) * Math.PI) / 180;
        const x = Math.cos(angle) * (15 + idx * 3);
        const y = Math.sin(angle) * 10;
        motionsRef.current.push(
          drop.animate(
            [
              { opacity: 1, transform: "translate(0, 0) scale(1)" },
              { opacity: 1, transform: `translate(${x}px, ${y}px) scale(0.85)`, offset: 0.55 },
              { opacity: 0, transform: `translate(${x * 1.25}px, ${y * 1.25}px) scale(0)` },
            ],
            { duration: 380, delay: 30 + idx * 24, easing: "cubic-bezier(.2, .8, .3, 1)" },
          ),
        );
      });
    }
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium text-[#1d1d1f]">{label}</div>
        {description && <div className="mt-0.5 text-[11.5px] text-[#555a66]">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={toggle}
        className="um-ink shrink-0 disabled:opacity-50"
      >
        <span ref={fillRef} className="um-ink-fill" aria-hidden="true" />
        <span ref={splashRef} className="um-ink-splash" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span ref={knobRef} className="um-ink-knob" aria-hidden="true" />
      </button>
    </div>
  );
}
