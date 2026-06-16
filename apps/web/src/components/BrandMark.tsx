import { Check, MapPin, Workflow } from "lucide-react";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand to-blue-700 text-white shadow-lg shadow-brand/25">
        <Workflow className="absolute left-[-0.45rem] top-2 h-4 w-4 text-brand" />
        <MapPin className="h-6 w-6" />
        <span className="absolute bottom-1.5 right-1.5 grid h-4 w-4 place-items-center rounded-full bg-execution text-white ring-2 ring-white">
          <Check className="h-3 w-3" />
        </span>
      </div>
      {!compact ? (
        <div className="min-w-0">
          <div className="truncate font-display text-lg font-black tracking-tight text-white">
            Promotor<span className="text-blue-300">Pro</span>
          </div>
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white/48">Gestao • Execucao • Resultados</div>
        </div>
      ) : null}
    </div>
  );
}
