import { fleetCopy } from '@transport/shared';
import { useRouter, type Href } from 'expo-router';

import { AccountScreen } from '../../../components/account-screen';
import { Card } from '../../../components/fleet-ui';

const LINKS: [string, Href][] = [
  [fleetCopy.onboarding.companyDocuments, '/company-documents'],
  [fleetCopy.onboarding.operators, '/operators'],
  [fleetCopy.onboarding.routes, '/routes'],
];

/** "Más": company documents, operators and usual routes (B18), then the account. */
export default function MoreTab() {
  const router = useRouter();
  return (
    <AccountScreen>
      {LINKS.map(([title, href]) => (
        <Card key={title} title={title} onPress={() => router.push(href)} />
      ))}
    </AccountScreen>
  );
}
