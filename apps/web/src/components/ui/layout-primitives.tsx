'use client';

import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ElementType,
  ReactNode,
} from 'react';

const joinClassNames = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(' ');

type PrimitiveProps<T extends ElementType> = {
  as?: T;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className' | 'style'>;

/**
 * Frontend layout guardrails
 *
 * Use these primitives for new screens and refactors:
 * - `PageContainer`: root wrapper for each page or operational workspace.
 * - `ContentContainer`: vertical stack for related sections.
 * - `SectionContainer`: safe wrapper for internal section content.
 * - `ResponsiveGrid`: card/list grid with guarded breakpoints.
 * - `ResponsiveFormGrid`: default form layout that collapses safely.
 *
 * Rules for future screens:
 * - Avoid manual fixed widths or large `min-width` values in page content.
 * - Put long operational text in paragraphs/hints, not inside chips or badges.
 * - Use `DataTable` for tabular content and `ActionBar` / `HeaderActionBar` / `FooterActionBar` for actions.
 * - Keep page root, section content and forms inside these wrappers to inherit overflow protection.
 */

export const PageContainer = <T extends ElementType = 'div'>({
  as,
  children,
  className,
  ...props
}: PrimitiveProps<T>) => {
  const Component = (as ?? 'div') as ElementType;

  return (
    <Component className={joinClassNames('page-grid page-container', className)} {...props}>
      {children}
    </Component>
  );
};

export const ContentContainer = <T extends ElementType = 'div'>({
  as,
  children,
  className,
  ...props
}: PrimitiveProps<T>) => {
  const Component = (as ?? 'div') as ElementType;

  return (
    <Component className={joinClassNames('content-container', className)} {...props}>
      {children}
    </Component>
  );
};

export const SectionContainer = <T extends ElementType = 'div'>({
  as,
  children,
  className,
  ...props
}: PrimitiveProps<T>) => {
  const Component = (as ?? 'div') as ElementType;

  return (
    <Component className={joinClassNames('section-container', className)} {...props}>
      {children}
    </Component>
  );
};

export const ResponsiveGrid = <T extends ElementType = 'div'>({
  as,
  children,
  className,
  style,
  ...props
}: PrimitiveProps<T> & {
  minItemWidth?: string;
}) => {
  const Component = (as ?? 'div') as ElementType;
  const { minItemWidth = '18rem', ...rest } = props as PrimitiveProps<T> & {
    minItemWidth?: string;
  };

  return (
    <Component
      className={joinClassNames('responsive-grid', className)}
      style={
        {
          '--responsive-grid-min': minItemWidth,
          ...style,
        } as CSSProperties
      }
      {...rest}
    >
      {children}
    </Component>
  );
};

export const ResponsiveFormGrid = <T extends ElementType = 'div'>({
  as,
  children,
  className,
  style,
  ...props
}: PrimitiveProps<T>) => {
  const Component = (as ?? 'div') as ElementType;

  return (
    <Component
      className={joinClassNames('form-grid responsive-form-grid', className)}
      style={style}
      {...props}
    >
      {children}
    </Component>
  );
};
