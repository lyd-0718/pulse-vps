interface RingGaugeProps {
  value: number;
  label: string;
  detail: string;
  offline?: boolean;
  size?: number;
  strokeWidth?: number;
  accent?: "auto" | "blue" | "teal" | "indigo";
}

function strokeFor(value: number, accent: RingGaugeProps["accent"]): string {
  if (value >= 88) return "#FF3B30";
  if (value >= 72) return "#FF9500";
  if (accent === "teal") return "#30B0C7";
  if (accent === "indigo") return "#5856D6";
  return "#007AFF";
}

export function RingGauge({
  value,
  label,
  detail,
  offline = false,
  size = 54,
  strokeWidth = 4.5,
  accent = "auto",
}: RingGaugeProps) {
  const clamped = offline ? 0 : Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const color = offline ? "#B8BCC4" : strokeFor(clamped, accent);

  return (
    <div className="flex flex-col items-center gap-1.5 text-center sm:flex-row sm:items-center sm:gap-2.5 sm:text-left">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(29, 29, 31, 0.085)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 400ms cubic-bezier(0.22, 1, 0.36, 1), stroke 250ms ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="apple-nums text-[12px] font-semibold tracking-tight text-[#1d1d1f]">
            {offline ? "—" : `${Math.round(clamped)}`}
            {!offline && <span className="text-[10px] font-medium text-[#555a66]">%</span>}
          </span>
        </div>
      </div>

      <div className="min-w-0 max-w-full">
        <div className="text-[12px] font-medium text-[#1d1d1f]">{label}</div>
        <div className="apple-nums text-[11.5px] leading-tight text-[#4c515c] sm:truncate">{detail}</div>
      </div>
    </div>
  );
}
