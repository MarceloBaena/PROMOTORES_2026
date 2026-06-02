import { FormEvent, useState } from "react";
import { LockKeyhole, LogIn } from "lucide-react";
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
    <main className="grid min-h-screen place-items-center bg-field px-4 py-10 text-ink">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-lg border border-line bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-md bg-moss text-white">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Sales Promoters</h1>
            <p className="text-sm text-stone-500">Painel operacional</p>
          </div>
        </div>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-semibold">E-mail</span>
          <input
            className="focus-ring h-11 w-full rounded-md border border-line bg-white px-3"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="email"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-semibold">Senha</span>
          <input
            className="focus-ring h-11 w-full rounded-md border border-line bg-white px-3"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
          />
        </label>

        {error ? (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">
            {error}
          </div>
        ) : null}

        <button
          className="focus-ring flex h-11 w-full items-center justify-center gap-2 rounded-md bg-moss px-4 font-semibold text-white disabled:opacity-60"
          type="submit"
          disabled={loading}
          title="Entrar"
        >
          <LogIn className="h-4 w-4" />
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
