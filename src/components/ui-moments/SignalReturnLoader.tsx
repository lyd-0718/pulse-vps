/**
 * Adapted from guanmo-ai/ui-moments (Signal Return loader, MIT).
 * Depicts an outbound + return network packet traveling along dual telemetry rails.
 */
export function SignalReturnLoader({
  size = 44,
  label = "正在采样...",
}: {
  size?: number;
  label?: string;
}) {
  return (
    <div className="inline-flex items-center gap-2.5" role="status" aria-live="polite">
      <span
        aria-hidden="true"
        className="um-signal-return shrink-0"
        style={{
          ["--size" as string]: `${size}px`,
          ["--color" as string]: "#0058c4",
          ["--period" as string]: "2.1s",
        }}
      >
        <span className="route route-out" />
        <span className="route route-back" />
        <span className="terminal terminal-start" />
        <span className="terminal terminal-end" />
        <span className="signal" />
      </span>
      {label && <span className="text-[12.5px] font-medium text-[#4c515c]">{label}</span>}
    </div>
  );
}
