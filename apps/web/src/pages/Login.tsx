import { FormEvent, useState } from "react";
import { Building2, LockKeyhole, LogIn } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export function Login() {
  const { login, apiMessage } = useAuth();
  const [email, setEmail] = useState("admin@salespromoters.local");
  const [password, setPassword] = useState("Admin@123");
  const [error, setError] = useState<string | null>(apiMessage);
  const [loading, setLoading] = useState(false);

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
    <main className="grid min-h-screen bg-field px-4 py-8 text-ink">
      <div className="mx-auto flex w-full max-w-[980px] items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-md border border-line bg-white shadow-[0_18px_45px_rgba(24,33,29,0.08)] lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="hidden border-r border-line bg-ink p-6 text-white lg:block">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-white/10">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-bold">Sales Promoters</div>
                <div className="text-xs font-bold uppercase text-white/55">Console</div>
              </div>
            </div>
            <div className="mt-10 space-y-3 text-sm">
              <div className="flex items-center justify-between border-b border-white/10 py-2">
                <span className="text-white/55">Ambiente</span>
                <span className="font-bold">Producao</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 py-2">
                <span className="text-white/55">Acesso</span>
                <span className="font-bold">Restrito</span>
              </div>
              <div className="flex items-center justify-between border-b border-white/10 py-2">
                <span className="text-white/55">Modulo</span>
                <span className="font-bold">Backoffice</span>
              </div>
            </div>
          </aside>

          <form onSubmit={onSubmit} className="p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-ink text-white">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Sales Promoters</h1>
                <p className="text-xs font-bold uppercase text-stone-500">Console</p>
              </div>
            </div>

            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-md border border-line bg-field text-graphite">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Acesso ao sistema</h2>
                <p className="text-sm font-medium text-stone-500">Credenciais operacionais</p>
              </div>
            </div>

            <label className="mb-4 block">
              <span className="field-label">E-mail</span>
              <input
                className="input-control"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                autoComplete="email"
              />
            </label>

            <label className="mb-4 block">
              <span className="field-label">Senha</span>
              <input
                className="input-control"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
              />
            </label>

            {error ? <div className="notice notice-error">{error}</div> : null}

            <button className="primary-button w-full" type="submit" disabled={loading} title="Entrar">
              <LogIn className="h-4 w-4" />
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
