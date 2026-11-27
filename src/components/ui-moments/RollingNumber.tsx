import { useEffect, useRef, useState } from "react";

/**
 * Adapted from guanmo-ai/ui-moments (Odometer Stepper, MIT).
 * Renders digits on vertical 0–9 reels; skips transition on initial hydration so first paint is crisp
 * (Operate mode: zero page-load choreography) and rolls smoothly on subsequent live telemetry / currency updates.
 */
interface RollingNumberProps {
  value: string;
  className?: string;
}

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function RollingNumber({ value, className = "" }: RollingNumberProps) {
  const [readyToAnimate, setReadyToAnimate] = useState(false);
  const sawNonZeroRef = useRef(false);

  useEffect(() => {
    const hasNonZero = /[1-9]/.test(value);
    if (hasNonZero && !sawNonZeroRef.current) {
      sawNonZeroRef.current = true;
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setReadyToAnimate(true));
      });
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [value]);

  return (
    <span className={`apple-nums inline-flex items-baseline ${className}`} aria-label={value}>
      <span aria-hidden="true" className="inline-flex items-baseline">
        {value.split("").map((ch, idx) => {
          const digit = ch >= "0" && ch <= "9" ? Number(ch) : -1;
          if (digit < 0) {
            return (
              <span key={`sep-${idx}-${ch}`} className="inline-block">
                {ch}
              </span>
            );
          }
          return (
            <span key={`pos-${idx}`} className="um-reel">
              <span
                className={readyToAnimate ? "um-reel-strip" : "um-reel-strip um-reel-static"}
                style={{ transform: `translateY(${-digit * 10}%)` }}
              >
                {DIGITS.map((d) => (
                  <span key={d} className="um-reel-digit">
                    {d}
                  </span>
                ))}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
