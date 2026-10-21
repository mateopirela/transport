'use client';

import { billingCopy } from '@transport/shared';
import { useActionState } from 'react';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { openPortalAction, startCheckoutAction } from '@/lib/billing/actions';

const c = billingCopy;

/** "Suscribirme": opens Stripe Checkout for one plan (only the Gerente sees it). */
export function CheckoutForm({ planCode }: { planCode: string }) {
  const [state, action, pending] = useActionState(startCheckoutAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="planCode" value={planCode} />
      <Button type="submit" variant="primary" size="sm" loading={pending}>
        {c.subscribe}
      </Button>
      {state.error && <Notice tone="error">{state.error}</Notice>}
    </form>
  );
}

/** "Administrar pago": opens the Stripe Customer Portal. */
export function PortalForm() {
  const [state, action, pending] = useActionState(openPortalAction, {});
  return (
    <form action={action} className="space-y-2">
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        {c.managePayment}
      </Button>
      {state.error && <Notice tone="error">{state.error}</Notice>}
    </form>
  );
}
