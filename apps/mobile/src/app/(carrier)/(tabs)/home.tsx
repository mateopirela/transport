import {
  buildCarrierFeed,
  carrierLoadsCopy,
  fleetCopy,
  mobileNavCopy,
  progressSummary,
} from '@transport/shared';
import { useRouter, type Href } from 'expo-router';

import { CompanyStatus } from '../../../components/company-status';
import { Card, Loaded, SectionTitle } from '../../../components/fleet-ui';
import { RecommendationCard } from '../../../components/load-card';
import { Body, Button, Screen, Title } from '../../../components/ui';
import {
  listOperators,
  listRoutes,
  listVehicles,
  loadCompanyContext,
  ownerProgress,
} from '../../../lib/fleet-api';
import {
  listCarrierUnits,
  returnTripCities,
  unitLabel,
  unitRecommendations,
} from '../../../lib/loads-api';
import { track } from '../../../lib/track';
import { useCarrierData, type CarrierContext } from '../../../lib/use-carrier';
import { useSession } from '../../../providers/session';

const copy = fleetCopy.onboarding;
const feedCopy = carrierLoadsCopy.home;

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

/**
 * Recommendations of every unit (B08), as the home feed: return trips first.
 * Units that are not ready (documents, availability) simply get none.
 */
async function loadFeed({ client, companyId }: CarrierContext) {
  const [units, cities] = await Promise.all([
    listCarrierUnits(client, companyId),
    returnTripCities(client),
  ]);
  const perUnit = await Promise.all(units.map((u) => unitRecommendations(client, u.id)));
  const feed = buildCarrierFeed(perUnit, cities);
  const returnTrips = feed.returnTrips.reduce((n, g) => n + g.recommendations.length, 0);
  track({
    name: 'recommendations_viewed',
    properties: {
      recommendations: returnTrips + feed.recommended.length,
      return_trips: returnTrips,
      units: units.length,
    },
  });
  return {
    units: new Map(units.map((u) => [u.id, unitLabel(u)])),
    feed,
    hasUnits: units.length > 0,
  };
}

/** Carrier home: recommended loads and return trips (B19), then the onboarding steps (B18). */
export default function HomeTab() {
  const { profile } = useSession();
  const router = useRouter();
  const approved = profile?.companyStatus === 'approved';
  const onboarding = useCarrierData(loadOnboarding);

  return (
    <Screen>
      <Title>{profile?.companyName ?? mobileNavCopy.home}</Title>
      {profile ? <CompanyStatus profile={profile} /> : null}
      {approved ? <Feed /> : <Body>{feedCopy.notApproved}</Body>}
      <SectionTitle>{approved ? feedCopy.onboarding : copy.title}</SectionTitle>
      <Body>{copy.subtitle}</Body>
      <Loaded state={onboarding.state} onRetry={() => void onboarding.reload()}>
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

function Feed() {
  const router = useRouter();
  const { state, reload } = useCarrierData(loadFeed);
  return (
    <Loaded state={state} onRetry={() => void reload()}>
      {({ units, feed, hasUnits }) => (
        <>
          {feed.returnTrips.length > 0 ? (
            <>
              <SectionTitle>{feedCopy.returnTrips}</SectionTitle>
              <Body>{feedCopy.returnTripsHelp}</Body>
              {feed.returnTrips.map((group) => (
                <Card
                  key={group.vehicleId}
                  title={feedCopy.returnTripFor(units.get(group.vehicleId) ?? '', group.startCity)}
                >
                  {group.recommendations.map((r, i) => (
                    <RecommendationCard key={r.loadId} recommendation={r} rank={i + 1} />
                  ))}
                </Card>
              ))}
            </>
          ) : null}
          <SectionTitle>{feedCopy.recommended}</SectionTitle>
          <Body>{feedCopy.recommendedHelp}</Body>
          {feed.recommended.length === 0 ? (
            <Body>{hasUnits ? feedCopy.empty : feedCopy.noUnits}</Body>
          ) : (
            feed.recommended.map((r, i) => (
              <RecommendationCard
                key={r.loadId}
                recommendation={r}
                rank={i + 1}
                unitLabel={units.get(r.vehicleId)}
              />
            ))
          )}
          <Button
            label={feedCopy.searchAll}
            variant="secondary"
            onPress={() => router.push('/loads')}
          />
        </>
      )}
    </Loaded>
  );
}
