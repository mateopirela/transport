import {
  billingCopy,
  carrierAppCopy,
  fleetCopy,
  freightCopy,
  managerCompanyCopy,
  ownerOperatorDocumentsCopy,
} from '@transport/shared';
import { useRouter, type Href } from 'expo-router';

import { AccountScreen } from '../../../components/account-screen';
import type { IconName } from '../../../components/icons';
import { Cell, Group, GroupLabel, groupInset } from '../../../components/ui';
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
// What Fulmis pays the carrier for each trip (I3, D34-E1).
const COLLECTIONS: [string, Href, IconName] = [
  freightCopy.collections.title,
  '/collections',
  'wallet',
];
const FLEET: [string, Href, IconName][] = [
  [fleetCopy.onboarding.operators, '/operators', 'people'],
  [fleetCopy.onboarding.routes, '/routes', 'route'],
];
const MY_COMPANY: [string, Href, IconName] = [managerCompanyCopy.title, '/my-company', 'company'];
const SUBSCRIPTION: [string, Href, IconName] = [billingCopy.title, '/subscription', 'money'];

/** One group of "Más": its short label over its rows, each opening its screen. */
function LinkGroup({ label, links }: { label: string; links: [string, Href, IconName][] }) {
  const router = useRouter();
  return (
    <>
      <GroupLabel>{label}</GroupLabel>
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
    </>
  );
}

/**
 * "Más", in groups (V8): "Empresa" ("Mi empresa" for the Gerente, G4; the
 * company documents, or "Mis documentos" for a hombre-camión, I2; operators
 * and usual routes, B18) and "Dinero" ("Cobranza", I3, for the Gerente and the
 * Coordinador; "Suscripción", H3, information only, for the Gerente), then
 * "Ayuda" and the account.
 */
export default function MoreTab() {
  const carrier = useCarrier();
  const ownerOperator = useSession().profile?.isOwnerOperator === true;
  const documents = ownerOperator ? MY_DOCUMENTS : COMPANY_DOCUMENTS;
  const manager = carrier?.isManager === true;
  const groups = carrierAppCopy.more.groups;
  return (
    <AccountScreen>
      <LinkGroup
        label={groups.company}
        links={manager ? [MY_COMPANY, documents, ...FLEET] : [documents, ...FLEET]}
      />
      <LinkGroup
        label={groups.money}
        links={manager ? [COLLECTIONS, SUBSCRIPTION] : [COLLECTIONS]}
      />
    </AccountScreen>
  );
}
