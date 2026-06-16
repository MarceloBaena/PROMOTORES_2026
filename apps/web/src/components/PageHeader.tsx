import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-[1.6rem] border border-white/80 bg-white/90 px-5 py-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)] ring-1 ring-line/60 backdrop-blur-xl sm:px-6">
      <div className="pointer-events-none absolute right-[-5rem] top-[-6rem] h-56 w-56 rounded-full bg-brand/10 blur-2xl" />
      <div className="pointer-events-none absolute bottom-[-7rem] left-[24%] h-48 w-48 rounded-full bg-execution/10 blur-2xl" />
      <div className="relative flex min-h-16 flex-col justify-center gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="brand-chip mb-3">PromotorPro enterprise</p>
        <h1 className="font-display text-2xl font-black tracking-tight text-ink sm:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slateText">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
