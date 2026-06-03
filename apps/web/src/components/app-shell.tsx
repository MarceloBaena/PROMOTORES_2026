'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getBrowserApiBasePath, logout } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { Sidebar } from './layout/sidebar';
import { Topbar } from './layout/topbar';
import {
  getCurrentSectionDescription,
  getCurrentSectionLabel,
  getVisibleDashboardNavigation,
} from './layout/navigation';

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell = ({ children }: AppShellProps) => {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const apiBaseUrl = getBrowserApiBasePath();
  const currentSection = getCurrentSectionLabel(pathname);
  const currentSectionDescription = getCurrentSectionDescription(pathname);
  const visibleNavigation = getVisibleDashboardNavigation(user?.role ?? null);

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <div className={navigationOpen ? 'app-shell app-shell-nav-open' : 'app-shell'}>
      <aside className="sidebar">
        <Sidebar
          apiBaseUrl={apiBaseUrl}
          currentPath={pathname}
          navigation={visibleNavigation}
          onClose={() => setNavigationOpen(false)}
          onLogout={() => void handleLogout()}
          user={user}
        />
      </aside>

      {navigationOpen ? (
        <button
          aria-label="Fechar navegacao"
          className="shell-overlay"
          type="button"
          onClick={() => setNavigationOpen(false)}
        />
      ) : null}

      <div className="content-shell">
        <Topbar
          apiBaseUrl={apiBaseUrl}
          currentSection={currentSection}
          description={currentSectionDescription}
          onOpenNavigation={() => setNavigationOpen((current) => !current)}
          userRole={user?.role}
        />

        <main>{children}</main>
      </div>
    </div>
  );
};
