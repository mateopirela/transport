import { authErrors } from '@transport/shared';

import { Notice } from '@/components/ui/notice';
import { supabaseEnv } from '@/lib/env';
import { cn } from '@/lib/utils';

/**
 * The frame of each auth screen: the title and its line on the page, the
 * form in a white group, and the links under it. `wide` for the long forms
 * (registration). Warns when Supabase is not configured.
 */
export function AuthCard({
  title,
  description,
  footer,
  wide = false,
  children,
}: {
  title: string;
  description: string;
  footer?: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('mx-auto w-full', wide ? 'max-w-xl' : 'max-w-md')}>
      <div className="mb-6 space-y-1.5 px-1 text-center">
        <h1 className="text-title1 text-text">{title}</h1>
        <p className="text-callout text-text-dim">{description}</p>
      </div>
      <div className="space-y-5 rounded-2xl border bg-cell p-5 sm:p-6">
        {!supabaseEnv() && <Notice tone="info">{authErrors.notConfigured}</Notice>}
        {children}
      </div>
      {footer && (
        <div className="mt-6 space-y-2 px-1 text-center text-subhead text-text-dim">{footer}</div>
      )}
    </div>
  );
}
