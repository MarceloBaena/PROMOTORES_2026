import {
  BarChart3,
  Building2,
  ClipboardList,
  FileSpreadsheet,
  Flag,
  LogOut,
  Map,
  Route,
  ShieldCheck,
  Store,
  Users
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

  return (
    <div className="app-page">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-white lg:flex lg:flex-col">
        <div className="border-b border-line px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-ink text-white">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-bold">Sales Promoters</div>
              <div className="text-xs font-bold uppercase text-stone-500">Console operacional</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-5 px-3 py-4">
          {navSections.map((section) => (
            <div key={section.label}>
              <div className="px-3 pb-2 text-[11px] font-bold uppercase text-stone-400">{section.label}</div>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-bold transition ${
                          isActive
                            ? "bg-muted text-ink before:absolute before:left-0 before:top-2 before:h-6 before:w-1 before:rounded-r before:bg-moss"
                            : "text-stone-600 hover:bg-field hover:text-ink"
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
        <div className="border-t border-line p-3">
          <div className="mb-3 rounded-md bg-field px-3 py-2">
            <div className="truncate text-sm font-bold">{user?.name}</div>
            <div className="truncate text-xs font-medium text-stone-500">{user?.email}</div>
          </div>
          <button
            type="button"
            title="Sair"
            onClick={() => void logout()}
            className="secondary-button w-full justify-start"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-line bg-white/90 backdrop-blur">
          <div className="flex min-h-14 items-center justify-between gap-4 px-4 sm:px-5 lg:px-6">
            <div className="hidden min-w-0 sm:block">
              <div className="text-xs font-bold uppercase text-stone-500">Ambiente</div>
              <div className="truncate text-sm font-bold">Painel operacional</div>
            </div>
            <nav className="flex gap-1 overflow-x-auto lg:hidden">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    title={item.label}
                    className={({ isActive }) =>
                      `grid h-10 w-10 flex-none place-items-center rounded-md border ${
                        isActive ? "border-moss bg-moss text-white" : "border-line bg-white text-stone-600 hover:bg-field"
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                  </NavLink>
                );
              })}
            </nav>
            <div className="hidden items-center gap-2 lg:flex">
              <span className="rounded-md border border-line bg-field px-2.5 py-1 text-xs font-bold uppercase text-stone-600">
                {user?.role}
              </span>
            </div>
          </div>
        </header>
        <main className="page-shell">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
