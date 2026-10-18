import { fleetCopy, managerCompanyCopy } from '@transport/shared';
import { useRouter, type Href } from 'expo-router';

import { AccountScreen } from '../../../components/account-screen';
import { Card } from '../../../components/fleet-ui';
import { useCarrier } from '../../../lib/use-carrier';

const LINKS: [string, Href][] = [
  [fleetCopy.onboarding.companyDocuments, '/company-documents'],
  [fleetCopy.onboarding.operators, '/operators'],
  [fleetCopy.onboarding.routes, '/routes'],
];

/**
 * "Más": "Mi empresa" for the Gerente (G4), company documents, operators and
 * usual routes (B18), then the account.
 */
export default function MoreTab() {
  const router = useRouter();
  const carrier = useCarrier();
  const links: [string, Href][] = carrier?.isManager
    ? [[managerCompanyCopy.title, '/my-company'], ...LINKS]
    : LINKS;
  return (
    <AccountScreen>
      {links.map(([title, href]) => (
        <Card key={title} title={title} onPress={() => router.push(href)} />
      ))}
    </AccountScreen>
  );
}
