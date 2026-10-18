import { managerCompanyCopy } from '@transport/shared';
import { Stack, useRouter } from 'expo-router';

import {
  BusinessUnitsSection,
  CoordinatorsSection,
  FleetByUnitSection,
  InvitationsSection,
} from '../../components/company-sections';
import { Loaded } from '../../components/fleet-ui';
import { Body, Notice, Screen } from '../../components/ui';
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
  return (
    <Screen belowHeader>
      <Stack.Screen options={{ title: managerCompanyCopy.title }} />
      {carrier && !carrier.isManager ? (
        <Notice tone="info">{managerCompanyCopy.managerOnly}</Notice>
      ) : (
        <>
          <Body>{managerCompanyCopy.description}</Body>
          <Loaded state={state} onRetry={() => void reload()}>
            {(company) =>
              carrier ? (
                <>
                  <BusinessUnitsSection carrier={carrier} company={company} onChanged={reload} />
                  <CoordinatorsSection carrier={carrier} company={company} onChanged={reload} />
                  <FleetByUnitSection
                    kind="vehicles"
                    carrier={carrier}
                    company={company}
                    onChanged={reload}
                    onOpen={(id) => router.push({ pathname: '/vehicle/[id]', params: { id } })}
                  />
                  <FleetByUnitSection
                    kind="operators"
                    carrier={carrier}
                    company={company}
                    onChanged={reload}
                    onOpen={(id) => router.push({ pathname: '/operator/[id]', params: { id } })}
                  />
                  <InvitationsSection carrier={carrier} company={company} onChanged={reload} />
                </>
              ) : null
            }
          </Loaded>
        </>
      )}
    </Screen>
  );
}
