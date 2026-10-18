import { authCopy, formatDateTime, invitationTokenField } from '@transport/shared';
import type { Metadata } from 'next';

import { SignOutButton } from '@/components/app-shell';
import { AuthCard } from '@/components/auth-card';
import { CoordinatorSignUpForm, JoinCompanyForm, Notice } from '@/components/auth-forms';
import { RedeemForm } from '@/components/invitation-forms';
import { getViewer } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';

const c = authCopy.invitation;

export const metadata: Metadata = { title: c.title };

/**
 * /invitacion/[token] (G1b, G2): what an invitation link opens on the web.
 * The preview (invitation_preview, public by design: the token is the
 * credential) tells the kind. A Coordinador creates their account here and,
 * back from the confirmation email, joins the company; an operator link
 * creates the phone account through the Edge Function; an access reset
 * replaces the password. Unknown, used and expired links all look the same.
 */
export default async function InvitationPage({ params }: PageProps<'/invitacion/[token]'>) {
  const { token } = await params;
  const parsed = invitationTokenField.safeParse(token);
  const supabase = await createClient();
  const preview =
    supabase && parsed.success
      ? ((await supabase.rpc('invitation_preview', { p_token: parsed.data })).data?.[0] ?? null)
      : null;

  if (!preview || !parsed.success) {
    return (
      <AuthCard title={c.invalidTitle} description={c.invalidDescription}>
        <Notice tone="error">{c.errors.invalid}</Notice>
      </AuthCard>
    );
  }

  const details = (
    <dl className="grid gap-1 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-4">
      <dt className="text-muted-foreground">
        {preview.kind === 'coordinator' ? c.coordinator.units : c.operator.unit}
      </dt>
      <dd>{preview.business_unit_names.join(', ')}</dd>
      {preview.inviter_name && (
        <>
          <dt className="text-muted-foreground">{c.inviterLabel}</dt>
          <dd>{preview.inviter_name}</dd>
        </>
      )}
      <dt className="text-muted-foreground">{c.expiresLabel}</dt>
      <dd>{formatDateTime(preview.expires_at)}</dd>
    </dl>
  );

  if (preview.kind === 'coordinator') {
    const viewer = await getViewer();
    const canJoin = viewer?.role === 'coordinator' && !viewer.company;
    return (
      <AuthCard
        title={c.title}
        description={
          canJoin
            ? c.coordinator.joinDescription(preview.company_legal_name)
            : c.coordinator.description(preview.company_legal_name)
        }
        footer={viewer ? <SignOutButton variant="link" className="mx-auto" /> : undefined}
      >
        {details}
        {canJoin ? (
          <JoinCompanyForm token={parsed.data} />
        ) : viewer ? (
          <Notice tone="info">{c.coordinator.wrongAccount}</Notice>
        ) : (
          <CoordinatorSignUpForm token={parsed.data} name={preview.invitee_name} />
        )}
      </AuthCard>
    );
  }

  const kind = preview.kind;
  return (
    <AuthCard
      title={c.title}
      description={
        kind === 'operator'
          ? c.operator.description(preview.company_legal_name)
          : c.reset.description(preview.company_legal_name)
      }
    >
      {details}
      <RedeemForm token={parsed.data} kind={kind} />
    </AuthCard>
  );
}
