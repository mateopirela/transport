import { fleetCopy, mobileNavCopy, progressSummary } from '@transport/shared';
import { useRouter, type Href } from 'expo-router';

import { CompanyStatus } from '../../../components/company-status';
import { Card, Loaded, SectionTitle } from '../../../components/fleet-ui';
import { Body, Screen, Title } from '../../../components/ui';
import {
  listOperators,
  listRoutes,
  listVehicles,
  loadCompanyContext,
  ownerProgress,
} from '../../../lib/fleet-api';
import { useCarrierData, type CarrierContext } from '../../../lib/use-carrier';
import { useSession } from '../../../providers/session';

const copy = fleetCopy.onboarding;

/** Onboarding progress of the carrier's company and fleet (B18). */
async function loadOnboarding({ client, companyId }: CarrierContext) {
  const context = await loadCompanyContext(client, companyId);
  const [vehicles, operators, routes] = await Promise.all([
    listVehicles(client, context),
    listOperators(client, companyId),
    listRoutes(client, companyId),
  ]);
  return {
    documents: progressSummary(ownerProgress(context, { type: 'company', id: companyId })),
    vehicles: vehicles.length,
    operators: operators.length,
    routes: routes.length,
  };
}

/** Carrier home: verification status and onboarding steps; recommended loads arrive in B19. */
export default function HomeTab() {
  const { profile } = useSession();
  const router = useRouter();
  const { state, reload } = useCarrierData(loadOnboarding);

  return (
    <Screen>
      <Title>{profile?.companyName ?? mobileNavCopy.home}</Title>
      {profile ? <CompanyStatus profile={profile} /> : null}
      <SectionTitle>{copy.title}</SectionTitle>
      <Body>{copy.subtitle}</Body>
      <Loaded state={state} onRetry={() => void reload()}>
        {(data) => {
          const steps: [string, string, Href][] = [
            [
              copy.companyDocuments,
              copy.documentsProgress(data.documents.approved, data.documents.required),
              '/company-documents',
            ],
            [copy.units, data.vehicles ? copy.count(data.vehicles) : copy.pending, '/units'],
            [
              copy.operators,
              data.operators ? copy.operatorsCount(data.operators) : copy.pending,
              '/operators',
            ],
            [copy.routes, data.routes ? copy.count(data.routes) : copy.pending, '/routes'],
          ];
          return steps.map(([title, subtitle, href]) => (
            <Card key={title} title={title} subtitle={subtitle} onPress={() => router.push(href)} />
          ));
        }}
      </Loaded>
    </Screen>
  );
}
