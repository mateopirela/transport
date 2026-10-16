import { privacyNotice } from '@transport/shared';
import type { Metadata } from 'next';

import { LegalDocument } from '@/components/legal-document';

export const metadata: Metadata = { title: privacyNotice.title };

/** Privacy notice (LFPDPPP), public: the stores and the mobile app link here. */
export default function PrivacyNoticePage() {
  return <LegalDocument text={privacyNotice} />;
}
