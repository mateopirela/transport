import {
  billingCopy,
  fleetCopy,
  managerCompanyCopy,
  ownerOperatorDocumentsCopy,
} from '@transport/shared';
import { useRouter, type Href } from 'expo-router';

import { AccountScreen } from '../../../components/account-screen';
import type { IconName } from '../../../components/icons';
import { Cell, Group, groupInset } from '../../../components/ui';
import { useCarrier } from '../../../lib/use-carrier';
import { useSession } from '../../../providers/session';

const COMPANY_DOCUMENTS: [string, Href, IconName] = [
  fleetCopy.onboarding.companyDocuments,
  '/company-documents',
  'documents',
];
// A hombre-camión sees all their documents in one screen (I2, D16-E2).
const MY_DOCUMENTS: [string, Href, IconName] = [
  ownerOperatorDocumentsCopy.title,
  '/my-documents',
  'documents',
];
const LINKS: [string, Href, IconName][] = [
  [fleetCopy.onboarding.operators, '/operators', 'people'],
  [fleetCopy.onboarding.routes, '/routes', 'route'],
];

/**
 * "Más": "Mi empresa" and "Suscripción" (H3, information only) for the Gerente
 * (G4), company documents ("Mis documentos" for a hombre-camión, I2),
 * operators and usual routes (B18) as one group of rows, then "Ayuda" and
 * the account.
 */
export default function MoreTab() {
  const router = useRouter();
  const carrier = useCarrier();
  const ownerOperator = useSession().profile?.isOwnerOperator === true;
  const documents = ownerOperator ? MY_DOCUMENTS : COMPANY_DOCUMENTS;
  const links: [string, Href, IconName][] = carrier?.isManager
    ? [
        [managerCompanyCopy.title, '/my-company', 'company'],
        [billingCopy.title, '/subscription', 'money'],
        documents,
        ...LINKS,
      ]
    : [documents, ...LINKS];
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
