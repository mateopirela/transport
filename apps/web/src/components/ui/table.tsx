import type * as React from 'react';

/** Bordered, horizontally scrollable table with a header row. */
export function Table({
  headers,
  children,
}: {
  headers: readonly string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col" className="px-4 py-2.5 font-medium whitespace-nowrap">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y [&_td]:px-4 [&_td]:py-3 [&_td]:align-top">{children}</tbody>
      </table>
    </div>
  );
}
