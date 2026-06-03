'use client';

import type { ReactNode } from 'react';

const joinClassNames = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(' ');

interface ActionBarProps {
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
  placement?: 'default' | 'header' | 'footer';
  stickyOnMobile?: boolean;
}

export const ActionBar = ({
  children,
  align = 'end',
  className,
  placement = 'default',
  stickyOnMobile = false,
}: ActionBarProps) => (
  <div
    className={joinClassNames(
      'action-bar page-actions',
      align === 'start' ? 'page-actions-start' : 'page-actions-end',
      placement === 'header' && 'page-actions-header',
      placement === 'footer' && 'page-actions-footer',
      stickyOnMobile && 'page-actions-sticky-mobile',
      className,
    )}
  >
    {children}
  </div>
);

export const HeaderActionBar = (props: Omit<ActionBarProps, 'placement' | 'align'>) => (
  <ActionBar {...props} placement="header" align="start" />
);

export const FooterActionBar = (props: Omit<ActionBarProps, 'placement'>) => (
  <ActionBar {...props} placement="footer" />
);
