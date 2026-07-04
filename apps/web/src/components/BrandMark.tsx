export function BrandMark({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  if (compact) {
    return (
      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/70 bg-white shadow-lg shadow-slate-900/10 ring-1 ring-line">
        <img src="/promotorpro-icon.svg" alt="PromotorPro" className="h-[88%] w-[88%] object-contain" />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center">
      <img
        src={dark ? "/promotorpro-logo.svg" : "/promotorpro-logo-light.svg"}
        alt="PromotorPro - Gestao, Execucao, Resultados"
        className="block h-auto w-[15.75rem] max-w-full object-contain"
      />
    </div>
  );
}
