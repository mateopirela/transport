import { managerCompanyCopy } from '@transport/shared';
import { Stack, useRouter } from 'expo-router';

import {
  BusinessUnitsSection,
  CoordinatorsSection,
  FleetByUnitSection,
  InvitationsSection,
} from '../../components/company-sections';
import { Footnote, LoadError, Notice, Screen, Skeleton } from '../../components/ui';
import { loadManagerCompany } from '../../lib/company-api';
import { useCarrierData, type CarrierContext } from '../../lib/use-carrier';

const loadCompany = ({ client, companyId }: CarrierContext) =>
  loadManagerCompany(client, companyId);

/**
 * "Más → Mi empresa" (G4, D19): the Gerente organizes business units,
 * coordinators, units and operators, and sees the pending invitations. Every
 * change is a manager RPC that checks it again; a Coordinador who opens it
 * only gets the notice.
 */
export default function MyCompany() {
  const router = useRouter();
  const { carrier, state, reload } = useCarrierData(loadCompany);

  let content;
  if (carrier && !carrier.isManager) {
    content = <Notice tone="info">{managerCompanyCopy.managerOnly}</Notice>;
  } else if (state.status === 'loading') {
    content = <Skeleton rows={4} />;
  } else if (state.status === 'error') {
    content = <LoadError onRetry={() => void reload()} />;
  } else if (carrier) {
    const company = state.data;
    content = (
      <>
        <Footnote>{managerCompanyCopy.description}</Footnote>
        <BusinessUnitsSection carrier={carrier} company={company} onChanged={reload} />
        <CoordinatorsSection carrier={carrier} company={company} onChanged={reload} />
        <FleetByUnitSection
          kind="vehicles"
          company={company}
          onOpen={(id) => router.push({ pathname: '/vehicle/[id]', params: { id } })}
        />
        <FleetByUnitSection
          kind="operators"
          company={company}
          onOpen={(id) => router.push({ pathname: '/operator/[id]', params: { id } })}
        />
        <InvitationsSection carrier={carrier} company={company} onChanged={reload} />
      </>
    );
  }

  return (
    <Screen belowHeader>
      <Stack.Screen options={{ title: managerCompanyCopy.title }} />
      {content}
    </Screen>
  );
}
