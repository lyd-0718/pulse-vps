import { useId } from "react";

export interface PlanOption<T extends string> {
  id: T;
  label: string;
  desc: string;
  swatch: string;
}

interface PlanPickerProps<T extends string> {
  options: ReadonlyArray<PlanOption<T>>;
  value: T;
  onChange: (next: T) => void;
  legend: string;
}

/**
 * Adapted from guanmo-ai/ui-moments (Plan Picker, MIT).
 * Spring-animated sliding selection ring with check badge over native radio inputs.
 */
export function PlanPicker<T extends string>({
  options,
  value,
  onChange,
  legend,
}: PlanPickerProps<T>) {
  const groupName = useId();
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.id === value),
  );

  return (
    <fieldset
      className="um-plans relative grid gap-2 border-0 p-0"
      style={{
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        ["--plan-count" as string]: options.length,
        ["--plan-index" as string]: activeIndex,
      }}
    >
      <legend className="sr-only">{legend}</legend>
      <span className="um-plan-ring" aria-hidden="true" />
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <label
            key={opt.id}
            className={`relative flex cursor-pointer flex-col items-center gap-1.5 rounded-[16px] px-2 py-2.5 text-center transition-transform duration-200 ${
              active ? "bg-white/95" : "liquid-inset hover:-translate-y-0.5 hover:bg-white/75"
            }`}
          >
            <input
              type="radio"
              name={groupName}
              value={opt.id}
              checked={active}
              onChange={() => onChange(opt.id)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className="h-5 w-5 rounded-full shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.16)]"
              style={{ background: opt.swatch }}
            />
            <span className="text-[12px] font-semibold text-[#1d1d1f]">{opt.label}</span>
            <span className="text-[11px] text-[#555a66]">{opt.desc}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
