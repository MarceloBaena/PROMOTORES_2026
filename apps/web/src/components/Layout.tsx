import {
  BarChart3,
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

const navItems = [
  { to: "/", label: "Dashboard", icon: BarChart3 },
  { to: "/promotores", label: "Promotores", icon: Users },
  { to: "/supervisores", label: "Supervisores", icon: ShieldCheck },
  { to: "/clientes", label: "Clientes", icon: Store },
  { to: "/importacao", label: "Importacao", icon: FileSpreadsheet },
  { to: "/roteirizacao", label: "Roteirizacao", icon: Route },
  { to: "/visitas", label: "Visitas", icon: Map },
  { to: "/auditoria", label: "Auditoria", icon: Flag },
  { to: "/relatorios", label: "Relatorios", icon: ClipboardList }
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-field text-ink">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-line bg-white lg:flex lg:flex-col">
        <div className="border-b border-line px-6 py-5">
          <div className="text-lg font-bold">Sales Promoters</div>
          <div className="mt-1 text-sm text-stone-500">{user?.role}</div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition ${
                    isActive ? "bg-moss text-white" : "text-stone-700 hover:bg-field"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <button
          type="button"
          title="Sair"
          onClick={() => void logout()}
          className="focus-ring mx-3 mb-4 flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold text-stone-700 hover:bg-field"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div>
              <div className="text-sm font-semibold text-stone-500">{user?.email}</div>
              <div className="text-base font-bold">{user?.name}</div>
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
                      `grid h-10 w-10 flex-none place-items-center rounded-md ${
                        isActive ? "bg-moss text-white" : "text-stone-600 hover:bg-field"
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
