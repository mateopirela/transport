import { mobileNavCopy } from '@transport/shared';

import { CompanyStatus } from '../../components/company-status';
import { PlaceholderScreen } from '../../components/placeholder-screen';
import { useSession } from '../../providers/session';

/** Carrier home: verification status now; recommended loads arrive in B19. */
export default function HomeTab() {
  const { profile } = useSession();
  return (
    <PlaceholderScreen title={profile?.companyName ?? mobileNavCopy.home}>
      {profile ? <CompanyStatus profile={profile} /> : null}
    </PlaceholderScreen>
  );
}
