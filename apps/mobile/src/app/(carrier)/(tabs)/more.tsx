import { fleetCopy, managerCompanyCopy } from '@transport/shared';
import { useRouter, type Href } from 'expo-router';

import { AccountScreen } from '../../../components/account-screen';
import type { IconName } from '../../../components/icons';
import { Cell, Group, groupInset } from '../../../components/ui';
import { useCarrier } from '../../../lib/use-carrier';

const LINKS: [string, Href, IconName][] = [
  [fleetCopy.onboarding.companyDocuments, '/company-documents', 'documents'],
  [fleetCopy.onboarding.operators, '/operators', 'people'],
  [fleetCopy.onboarding.routes, '/routes', 'route'],
];

/**
 * "Más": "Mi empresa" for the Gerente (G4), company documents, operators and
 * usual routes (B18) as one group of rows, then the account.
 */
export default function MoreTab() {
  const router = useRouter();
  const carrier = useCarrier();
  const links: [string, Href, IconName][] = carrier?.isManager
    ? [[managerCompanyCopy.title, '/my-company', 'company'], ...LINKS]
    : LINKS;
  return (
    <AccountScreen>
      <Group inset={groupInset.icon}>
        {links.map(([title, href, icon]) => (
          <Cell
            key={title}
            icon={icon}
            role="link"
            title={title}
            onPress={() => router.push(href)}
          />
        ))}
      </Group>
    </AccountScreen>
  );
}
