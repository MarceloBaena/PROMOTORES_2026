import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex min-h-16 flex-col justify-center gap-4 rounded-2xl border border-white/70 bg-white/70 px-5 py-4 shadow-sm shadow-stone-900/5 ring-1 ring-line/60 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-moss">Retaguarda operacional</p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm font-semibold text-stone-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}
