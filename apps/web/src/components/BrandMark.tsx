export function BrandMark({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  if (compact) {
    return (
      <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white shadow-lg shadow-slate-900/10 ring-1 ring-line">
        <img src="/promotorpro-icon.svg" alt="PromotorPro" className="h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center">
      <img
        src={dark ? "/promotorpro-logo.svg" : "/promotorpro-logo-light.svg"}
        alt="PromotorPro - Gestao, Execucao, Resultados"
        className="h-auto w-[15.5rem] max-w-full"
      />
    </div>
  );
}
