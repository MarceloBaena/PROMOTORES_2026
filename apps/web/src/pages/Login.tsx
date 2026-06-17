import { FormEvent, useState } from "react";
import { CheckCircle2, LockKeyhole, LogIn, MapPinned, ShieldCheck, Smartphone } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const loginFeatures = [
  { icon: MapPinned, label: "Roteiro publicado e monitorado" },
  { icon: Smartphone, label: "Aplicativo de campo conectado ao fluxo real" },
  { icon: ShieldCheck, label: "Auditoria com evidências e situação" }
] as const;

function PromotorProLogo({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`grid shrink-0 place-items-center overflow-hidden bg-white shadow-xl ring-1 ring-white/70 ${
          compact ? "h-12 w-12 rounded-2xl" : "h-16 w-16 rounded-[1.4rem]"
        } ${dark ? "shadow-slate-900/10" : "shadow-black/20"}`}
      >
        <img src="/promotorpro-icon.svg" alt="PromotorPro" className="h-full w-full object-cover" />
      </div>
      <div>
        <div className={`${compact ? "text-lg" : "text-2xl"} font-display font-black tracking-tight ${dark ? "text-ink" : "text-white"}`}>
          PromotorPro
        </div>
        <div className={`text-[11px] font-black uppercase tracking-[0.22em] ${dark ? "text-slateText" : "text-white/60"}`}>
          Gestão de campo
        </div>
      </div>
    </div>
  );
}

export function Login() {
  const { login, apiMessage } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(apiMessage);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(email, password);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative grid min-h-screen overflow-hidden px-4 py-8 text-ink">
      <div className="pointer-events-none absolute left-[-12rem] top-[-16rem] h-[34rem] w-[34rem] rounded-full bg-brand/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-18rem] right-[-10rem] h-[38rem] w-[38rem] rounded-full bg-execution/15 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-[1120px] items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-white/75 bg-white/90 shadow-[0_28px_90px_rgba(15,23,42,0.16)] ring-1 ring-line/70 backdrop-blur lg:grid-cols-[440px_minmax(0,1fr)]">
          <aside className="relative hidden overflow-hidden bg-navy p-8 text-white lg:block">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(37,99,235,0.35),transparent_18rem),radial-gradient(circle_at_88%_82%,rgba(16,185,129,0.24),transparent_20rem),linear-gradient(145deg,rgba(255,255,255,0.10),transparent_42%)]" />
            <div className="relative">
              <PromotorProLogo />

              <div className="mt-14">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-100/70">Sistema operacional</p>
                <h1 className="mt-3 font-display text-4xl font-black leading-tight tracking-tight">
                  Controle de promotores, rotas e visitas em tempo real.
                </h1>
                <p className="mt-4 max-w-sm text-sm font-semibold leading-6 text-white/68">
                  Painel interno para supervisão de campo, auditoria, roteirização e acompanhamento das evidências de visita.
                </p>
              </div>

              <div className="mt-10 grid gap-3">
                {loginFeatures.map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/12">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-bold text-white/85">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <form onSubmit={onSubmit} className="p-6 sm:p-9 lg:p-12">
            <div className="mb-6 lg:hidden">
              <PromotorProLogo compact dark />
            </div>

            <div className="mb-8">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-field px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-stone-600">
                <CheckCircle2 className="h-4 w-4 text-execution" />
                Ambiente seguro
              </div>

              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-field text-graphite">
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-3xl font-black tracking-tight">Acesso ao sistema</h2>
                  <p className="mt-1 text-sm font-semibold text-stone-500">Use suas credenciais operacionais</p>
                </div>
              </div>
            </div>

            <label className="mb-5 block">
              <span className="field-label">E-mail</span>
              <input
                className="input-control"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
                placeholder="seu.email@empresa.com"
                required
              />
            </label>

            <label className="mb-5 block">
              <span className="field-label">Senha</span>
              <input
                className="input-control"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="Digite sua senha"
                required
              />
            </label>

            {error ? <div className="notice notice-error">{error}</div> : null}

            <button className="primary-button mt-2 w-full" type="submit" disabled={loading} title="Entrar">
              <LogIn className="h-4 w-4" />
              {loading ? "Entrando..." : "Entrar"}
            </button>

            <p className="mt-5 text-center text-xs font-semibold text-stone-500">
              Acesso restrito ao time autorizado da operação.
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
