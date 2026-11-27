interface TactileGlassSwitchProps {
  demoMode: boolean;
  liveCount?: number;
  onChange: (demoMode: boolean) => void;
}

/**
 * Equal-column ceramic-glass cavity switch for Live vs Demo modes.
 * Uses grid-cols-2 so the 50% sliding thumb aligns precisely with both labels.
 */
export function TactileGlassSwitch({ demoMode, liveCount, onChange }: TactileGlassSwitchProps) {
  return (
    <div
      role="group"
      aria-label="数据源模式切换"
      className="tactile-switch-well relative grid h-10 grid-cols-2 items-center rounded-full p-[3px] select-none lg:h-8"
    >
      {/* Sliding Ceramic-Glass Thumb */}
      <div
        aria-hidden="true"
        className={`tactile-switch-thumb pointer-events-none absolute top-[3px] bottom-[3px] left-[3px] w-[calc(50%-3px)] rounded-full transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          !demoMode ? "translate-x-0" : "translate-x-full"
        }`}
      />
      <button
        type="button"
        aria-pressed={!demoMode}
        onClick={() => onChange(false)}
        className={`relative z-10 inline-flex h-full min-w-[66px] items-center justify-center gap-1 rounded-full px-2.5 text-[12px] font-medium transition-colors lg:min-w-[62px] ${
          !demoMode ? "font-semibold text-[#1d1d1f]" : "text-[#4c515c] hover:text-[#1d1d1f]"
        }`}
      >
        <span>实时</span>
        {typeof liveCount === "number" && (
          <span className="apple-nums text-[11px] text-[#555a66]">{liveCount}</span>
        )}
      </button>
      <button
        type="button"
        aria-pressed={demoMode}
        onClick={() => onChange(true)}
        className={`relative z-10 inline-flex h-full min-w-[66px] items-center justify-center rounded-full px-2.5 text-center text-[12px] font-medium transition-colors lg:min-w-[62px] ${
          demoMode ? "font-semibold text-[#1d1d1f]" : "text-[#4c515c] hover:text-[#1d1d1f]"
        }`}
      >
        演示
      </button>
    </div>
  );
}
