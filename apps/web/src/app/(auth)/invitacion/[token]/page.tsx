import { authCopy, formatDateTime, invitationTokenField } from '@transport/shared';
import type { Metadata } from 'next';

import { SignOutButton } from '@/components/app-shell';
import { AuthCard } from '@/components/auth-card';
import { CoordinatorSignUpForm, JoinCompanyForm } from '@/components/auth-forms';
import { RedeemForm } from '@/components/invitation-forms';
import { Notice } from '@/components/ui/notice';
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

  // The facts of the invitation, as rows of a group (label left, value right).
  const row = 'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-3';
  const details = (
    <dl className="divide-y divide-separator rounded-2xl bg-bg text-subhead">
      <div className={row}>
        <dt className="text-text-dim">
          {preview.kind === 'coordinator' ? c.coordinator.units : c.operator.unit}
        </dt>
        <dd className="text-text">{preview.business_unit_names.join(', ')}</dd>
      </div>
      {preview.inviter_name && (
        <div className={row}>
          <dt className="text-text-dim">{c.inviterLabel}</dt>
          <dd className="text-text">{preview.inviter_name}</dd>
        </div>
      )}
      <div className={row}>
        <dt className="text-text-dim">{c.expiresLabel}</dt>
        <dd className="text-text tabular-nums">{formatDateTime(preview.expires_at)}</dd>
      </div>
    </dl>
  );

  if (preview.kind === 'coordinator') {
    const viewer = await getViewer();
    const canJoin = viewer?.role === 'coordinator' && !viewer.company;
    return (
      <AuthCard
        title={c.title}
        wide={!viewer}
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
      wide={kind === 'operator'}
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
