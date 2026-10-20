import { mobileCompanyCopy as copy } from '@transport/shared';
import { Text } from 'react-native';

import type { ProfileDetails } from '../lib/profile';
import { useTheme } from '../theme';
import { Notice } from './ui';

const TITLES = {
  rejected: copy.rejectedTitle,
  suspended: copy.suspendedTitle,
  expired: copy.expiredTitle,
} as const;

/** Verification state of the carrier's company (product §2: "en revisión"). */
export function CompanyStatus({ profile }: { profile: ProfileDetails }) {
  const { type } = useTheme();
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
          {profile.companyStatusReason ? (
            <Text style={type.subhead}>{profile.companyStatusReason}</Text>
          ) : null}
          <Text style={type.subhead}>{copy.contactSupport}</Text>
        </Notice>
      );
    default:
      return null;
  }
}
