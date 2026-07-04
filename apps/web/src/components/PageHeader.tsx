import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="relative mb-6 overflow-hidden rounded-[1.8rem] border border-white/80 bg-white/92 px-5 py-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] ring-1 ring-line/60 backdrop-blur-xl sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute right-[-5rem] top-[-5rem] h-52 w-52 rounded-full bg-brand/12 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-8rem] left-[18%] h-56 w-56 rounded-full bg-execution/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-y-0 right-[22%] w-px bg-gradient-to-b from-transparent via-brand/10 to-transparent" />
      <div className="relative flex min-h-16 flex-col justify-center gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="brand-chip mb-3">PromotorPro enterprise</p>
          <h1 className="font-display text-2xl font-black tracking-tight text-ink sm:text-4xl">{title}</h1>
          {subtitle ? <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slateText">{subtitle}</p> : null}
        </div>
        {action ? <div className="flex flex-wrap items-center gap-2 xl:justify-end">{action}</div> : null}
      </div>
    </div>
  );
}
