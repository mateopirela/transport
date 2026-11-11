import { authErrors } from '@transport/shared';

import { Notice } from '@/components/ui/notice';
import { supabaseEnv } from '@/lib/env';
import { cn } from '@/lib/utils';

/**
 * The form side of each access screen (§1.5): the title and its line, the
 * form straight on the page (its fields are the cells) and, under a hairline,
 * the links. `wide` for the long forms (registration). It centres itself in
 * the column while it fits and starts at the top when it does not. Warns
 * when Supabase is not configured.
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
    <div className={cn('m-auto w-full', wide ? 'max-w-xl' : 'max-w-md')}>
      <div className="mb-8 space-y-2">
        <h1 className="text-title1 text-text">{title}</h1>
        <p className="text-callout text-text-dim">{description}</p>
      </div>
      <div className="space-y-5">
        {!supabaseEnv() && <Notice tone="info">{authErrors.notConfigured}</Notice>}
        {children}
      </div>
      {footer && (
        <div className="mt-8 space-y-2 border-t pt-6 text-subhead text-text-dim">{footer}</div>
      )}
    </div>
  );
}
