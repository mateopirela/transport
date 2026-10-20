import type * as React from 'react';

/**
 * A table for admin (§1.6): inside a group, rows of 48 px or more, no
 * stripes, the header in `label`. Scrolls sideways on a narrow screen.
 */
export function Table({
  headers,
  children,
}: {
  headers: readonly string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border bg-cell">
      <table className="w-full text-left text-subhead">
        <thead className="border-b text-label text-text-dim">
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col" className="px-4 py-3 whitespace-nowrap">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-separator [&_td]:h-12 [&_td]:px-4 [&_td]:py-3 [&_td]:align-middle [&_tr]:transition-colors [&_tr:hover]:bg-surface-high/40">
          {children}
        </tbody>
      </table>
    </div>
  );
}
