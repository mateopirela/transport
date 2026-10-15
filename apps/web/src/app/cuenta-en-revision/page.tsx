import { shellCopy, verificationStatusLabels } from '@transport/shared';
import type { Metadata } from 'next';

import { AppShell, PageHeading } from '@/components/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

const c = shellCopy.review;

export const metadata: Metadata = { title: c.pending_review.title };

/** Shown to a shipper while their company is not approved (pending, rejected, ...). */
export default async function AccountInReviewPage() {
  const viewer = await requireAccess(paths.review);
  const company = viewer.company;
  // requireAccess only lets shippers with a non-approved company through.
  const status = company && company.status !== 'approved' ? company.status : 'pending_review';
  const text = c[status];
  return (
    <AppShell viewer={viewer}>
      <div className="mx-auto max-w-2xl">
        <PageHeading title={text.title} description={text.description} />
        {company && (
          <Card>
            <CardContent>
              <dl className="grid gap-4 text-sm sm:grid-cols-[max-content_1fr] sm:gap-x-8">
                <dt className="text-muted-foreground">{c.companyLabel}</dt>
                <dd className="font-medium">
                  {company.legalName}
                  <span className="ml-3 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                    {verificationStatusLabels[company.status]}
                  </span>
                </dd>
                {company.statusReason && (
                  <>
                    <dt className="text-muted-foreground">{c.reasonLabel}</dt>
                    <dd>{company.statusReason}</dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
