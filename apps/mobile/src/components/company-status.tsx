import { mobileCompanyCopy as copy } from '@transport/shared';

import type { ProfileDetails } from '../lib/profile';
import { Body, Notice } from './ui';

const TITLES = {
  rejected: copy.rejectedTitle,
  suspended: copy.suspendedTitle,
  expired: copy.expiredTitle,
} as const;

/** Verification state of the carrier's company (product §2: "en revisión"). */
export function CompanyStatus({ profile }: { profile: ProfileDetails }) {
  switch (profile.companyStatus) {
    case 'pending_review':
      return (
        <Notice tone="info" title={copy.inReviewTitle}>
          {copy.inReviewBody}
        </Notice>
      );
    case 'rejected':
    case 'suspended':
    case 'expired':
      return (
        <Notice tone="danger" title={TITLES[profile.companyStatus]}>
          {profile.companyStatusReason ? <Body>{profile.companyStatusReason}</Body> : null}
          <Body>{copy.contactSupport}</Body>
        </Notice>
      );
    default:
      return null;
  }
}
