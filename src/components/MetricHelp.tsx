"use client";

interface MetricHelpProps {
  text: string;
  className?: string;
}

/** 指标名后的「?」，悬停显示说明 */
export function MetricHelp({ text, className }: MetricHelpProps) {
  return (
    <span className={`group/metric-help relative ml-1 inline-flex shrink-0 align-middle ${className ?? ""}`}>
      <button
        type="button"
        tabIndex={0}
        aria-label="查看指标说明"
        className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-zinc-600 text-[10px] leading-none text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-500"
        onClick={(event) => event.stopPropagation()}
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-[200] hidden w-max max-w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-left text-[11px] font-normal normal-case leading-relaxed text-zinc-300 shadow-xl group-hover/metric-help:block group-focus-within/metric-help:block"
      >
        {text}
        <span className="absolute left-1/2 top-full -mt-px -translate-x-1/2 border-4 border-transparent border-t-zinc-700" />
      </span>
    </span>
  );
}

interface LabelWithHelpProps {
  label: string;
  help?: string;
  className?: string;
}

export function LabelWithHelp({ label, help, className }: LabelWithHelpProps) {
  return (
    <span className={`inline-flex items-center ${className ?? ""}`}>
      <span>{label}</span>
      {help ? <MetricHelp text={help} /> : null}
    </span>
  );
}
