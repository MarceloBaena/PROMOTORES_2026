const styles: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  INACTIVE: "bg-stone-100 text-stone-700 ring-stone-200",
  BLOCKED: "bg-rose-50 text-rose-800 ring-rose-200",
  SUSPENDED: "bg-amber-50 text-amber-800 ring-amber-200",
  ARCHIVED: "bg-stone-100 text-stone-600 ring-stone-200",
  DRAFT: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  PUBLISHED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  CANCELLED: "bg-rose-50 text-rose-800 ring-rose-200",
  COMPLETED: "bg-moss/10 text-moss ring-moss/20",
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  in_progress: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  completed: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  not_completed: "bg-rose-50 text-rose-800 ring-rose-200"
};

export function StatusPill({ value }: { value?: string | null }) {
  if (!value) {
    return <span className="text-sm text-stone-500">-</span>;
  }

  return (
    <span className={`inline-flex h-7 items-center rounded-full px-3 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${styles[value] ?? styles.INACTIVE}`}>
      {value}
    </span>
  );
}
