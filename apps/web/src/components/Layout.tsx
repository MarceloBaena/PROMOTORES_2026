import {
  Activity,
  BarChart3,
  Building2,
  ClipboardList,
  FileSpreadsheet,
  Flag,
  LogOut,
  Map,
  MapPinned,
  Route,
  ShieldCheck,
  Store,
  Users,
  Wifi
} from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const navSections = [
  {
    label: "Operacao",
    items: [
      { to: "/", label: "Dashboard", icon: BarChart3 },
      { to: "/roteirizacao", label: "Roteirizacao", icon: Route },
      { to: "/visitas", label: "Visitas", icon: Map },
      { to: "/mapa", label: "Mapa ao vivo", icon: MapPinned },
      { to: "/auditoria", label: "Auditoria", icon: Flag },
      { to: "/relatorios", label: "Relatorios", icon: ClipboardList }
    ]
  },
  {
    label: "Cadastros",
    items: [
      { to: "/clientes", label: "Clientes", icon: Store },
      { to: "/promotores", label: "Promotores", icon: Users },
      { to: "/supervisores", label: "Supervisores", icon: ShieldCheck },
      { to: "/importacao", label: "Importacao", icon: FileSpreadsheet }
    ]
  }
];

const navItems = navSections.flatMap((section) => section.items);

export function Layout() {
  const { user, logout } = useAuth();
  const today = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "short"
  }).format(new Date());

  return (
    <div className="app-page">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-white/10 bg-forest text-white shadow-[18px_0_50px_rgba(17,25,23,0.16)] lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.14),transparent_18rem),linear-gradient(180deg,rgba(255,255,255,0.06),transparent_36%)]" />
        <div className="relative border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-forest shadow-lg shadow-black/15">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-display text-lg font-bold tracking-tight">Sales Promoters</div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">Console operacional</div>
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-3 shadow-inner shadow-black/10">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">Hoje</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-bold text-emerald-100 ring-1 ring-emerald-300/20">
                <Wifi className="h-3.5 w-3.5" />
                Online
              </span>
            </div>
            <div className="mt-2 font-display text-sm font-bold capitalize text-white">{today}</div>
          </div>
        </div>
        <nav className="relative flex-1 space-y-6 overflow-y-auto px-4 py-5">
          {navSections.map((section) => (
            <div key={section.label}>
              <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/38">{section.label}</div>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold transition ${
                          isActive
                            ? "bg-white text-forest shadow-lg shadow-black/10 before:absolute before:left-0 before:top-2.5 before:h-6 before:w-1 before:rounded-r before:bg-moss"
                            : "text-white/68 hover:bg-white/10 hover:text-white"
                        }`
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="relative border-t border-white/10 p-4">
          <div className="mb-3 rounded-2xl border border-white/10 bg-white/10 px-3 py-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15">
                <Activity className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{user?.name}</div>
                <div className="truncate text-xs font-medium text-white/55">{user?.email}</div>
              </div>
            </div>
          </div>
          <button
            type="button"
            title="Sair"
            onClick={() => void logout()}
            className="focus-ring inline-flex h-11 w-full items-center justify-start gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/15"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-white/70 bg-white/78 shadow-sm shadow-stone-900/5 backdrop-blur-xl">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-5 lg:px-7">
            <div className="hidden min-w-0 sm:block">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500">Ambiente de producao</div>
              <div className="truncate font-display text-base font-bold text-ink">Painel de operacao de campo</div>
            </div>
            <div className="flex min-w-0 items-center gap-3 sm:hidden">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-forest text-white">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-display text-base font-bold">Promotores</div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">Operacao</div>
              </div>
            </div>
            <nav className="hidden gap-1 overflow-x-auto sm:flex lg:hidden">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={item.label}
                    className={({ isActive }) =>
                      `grid h-11 w-11 flex-none place-items-center rounded-xl border transition ${
                        isActive ? "border-moss bg-moss text-white shadow-lg shadow-moss/20" : "border-line bg-white text-stone-600 hover:bg-field"
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                  </NavLink>
                );
              })}
            </nav>
            <div className="hidden items-center gap-2 lg:flex">
              <span className="rounded-full border border-line bg-field px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-stone-600">
                {user?.role}
              </span>
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto px-4 pb-3 sm:hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `inline-flex h-10 flex-none items-center gap-2 rounded-full border px-3 text-xs font-bold transition ${
                      isActive ? "border-moss bg-moss text-white" : "border-line bg-white text-stone-600"
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </header>
        <main className="page-shell">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
