import { authErrors } from '@transport/shared';

import { Notice } from '@/components/auth-forms';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabaseEnv } from '@/lib/env';

/** Card that frames each auth screen; warns when Supabase is not configured. */
export function AuthCard({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!supabaseEnv() && <Notice tone="info">{authErrors.notConfigured}</Notice>}
        {children}
        {footer && <div className="space-y-2 text-center text-sm">{footer}</div>}
      </CardContent>
    </Card>
  );
}
