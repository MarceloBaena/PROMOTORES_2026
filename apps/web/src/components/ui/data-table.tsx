'use client';

import type { ReactNode } from 'react';
import { EmptyState } from './empty-state';
import { MobileListCard } from './mobile-list-card';

interface DataColumn<TItem> {
  header: ReactNode;
  key: string;
  render: (item: TItem) => ReactNode;
}

interface DataTableProps<TItem> {
  columns: DataColumn<TItem>[];
  emptyDescription?: string;
  emptyTitle: string;
  getRowKey: (item: TItem) => string;
  items: TItem[];
  summary?: ReactNode;
  toolbar?: ReactNode;
  mobileActions?: (item: TItem) => ReactNode;
  mobileBody?: (item: TItem) => ReactNode;
  mobileMeta?: (item: TItem) => ReactNode;
  mobileSubtitle?: (item: TItem) => ReactNode;
  mobileTitle: (item: TItem) => ReactNode;
}

export const DataTable = <TItem,>({
  columns,
  emptyDescription,
  emptyTitle,
  getRowKey,
  items,
  summary,
  toolbar,
  mobileActions,
  mobileBody,
  mobileMeta,
  mobileSubtitle,
  mobileTitle,
}: DataTableProps<TItem>) => {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="data-table-shell responsive-table">
      {summary || toolbar ? (
        <div className="data-table-toolbar">
          <div className="data-table-summary">{summary}</div>
          {toolbar ? <div className="row-actions">{toolbar}</div> : null}
        </div>
      ) : null}

      <div className="table-wrap data-table-desktop responsive-table-wrap">
        <table className="table responsive-table-element">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={getRowKey(item)}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(item)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="data-table-mobile">
        {items.map((item) => (
          <MobileListCard
            key={getRowKey(item)}
            title={mobileTitle(item)}
            subtitle={mobileSubtitle?.(item)}
            meta={mobileMeta?.(item)}
            actions={mobileActions?.(item)}
          >
            {mobileBody?.(item)}
          </MobileListCard>
        ))}
      </div>
    </div>
  );
};
