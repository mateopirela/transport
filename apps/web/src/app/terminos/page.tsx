import { termsOfService } from '@transport/shared';
import type { Metadata } from 'next';

import { LegalDocument } from '@/components/legal-document';

export const metadata: Metadata = { title: termsOfService.title };

/** Terms of use, public. */
export default function TermsPage() {
  return <LegalDocument text={termsOfService} />;
}
