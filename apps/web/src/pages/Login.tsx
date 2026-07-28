import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, LockKeyhole, LogIn } from "lucide-react";
import { BrandMark } from "../components/BrandMark";
import { useAuth } from "../context/AuthContext";
import { APP_RELEASE_LABEL } from "../lib/app-version";

export function Login() {
  const { login, apiMessage } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(apiMessage);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setError(apiMessage);
  }, [apiMessage]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(email, password);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Nao foi possivel entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative grid min-h-screen overflow-hidden bg-slate-50 px-3 py-4 text-ink sm:px-4 sm:py-8">
      <div className="pointer-events-none absolute left-[-12rem] top-[-16rem] h-[30rem] w-[30rem] rounded-full bg-brand/15 blur-3xl sm:h-[34rem] sm:w-[34rem]" />
      <div className="pointer-events-none absolute bottom-[-18rem] right-[-10rem] h-[32rem] w-[32rem] rounded-full bg-execution/15 blur-3xl sm:h-[38rem] sm:w-[38rem]" />

      <div className="relative mx-auto flex w-full max-w-[1120px] items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[1.75rem] border border-white/75 bg-white/90 shadow-[0_28px_90px_rgba(15,23,42,0.16)] ring-1 ring-line/70 backdrop-blur lg:grid-cols-[420px_minmax(0,1fr)] xl:grid-cols-[460px_minmax(0,1fr)]">
          <aside className="relative hidden overflow-hidden bg-navy p-7 text-white lg:block xl:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(37,99,235,0.35),transparent_18rem),radial-gradient(circle_at_88%_82%,rgba(16,185,129,0.24),transparent_20rem),linear-gradient(145deg,rgba(255,255,255,0.10),transparent_42%)]" />
            <div className="relative">
              <BrandMark />
              <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
                {APP_RELEASE_LABEL}
              </div>

              <div className="mt-10 xl:mt-14">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-100/70">Sistema operacional</p>
                <h1 className="mt-3 font-display text-3xl font-black leading-tight tracking-tight xl:text-4xl">
                  Controle de equipe de campo, rotas e visitas em tempo real.
                </h1>
                <p className="mt-4 max-w-sm text-sm font-semibold leading-6 text-white/68">
                  Painel para supervisao de campo, auditoria, roteirizacao e acompanhamento das evidencias de visita.
                </p>
                <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-white/[0.08] px-4 py-4 text-sm font-semibold leading-6 text-white/72">
                  Acesso restrito ao ambiente operacional da equipe de campo.
                </div>
              </div>
            </div>
          </aside>

          <form onSubmit={onSubmit} className="p-5 sm:p-7 lg:p-10 xl:p-12">
            <div className="mb-6 flex lg:hidden">
              <div className="min-w-0">
                <BrandMark dark />
                <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slateText">
                  {APP_RELEASE_LABEL}
                </div>
              </div>
            </div>

            <div className="mb-8">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-field px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-stone-600">
                <CheckCircle2 className="h-4 w-4 text-execution" />
                Ambiente seguro
              </div>

              <div className="flex items-start gap-3 sm:items-center">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-line bg-field text-graphite">
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-2xl font-black tracking-tight sm:text-3xl">Acesso ao sistema</h2>
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
              Acesso restrito ao time autorizado da operacao.
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
