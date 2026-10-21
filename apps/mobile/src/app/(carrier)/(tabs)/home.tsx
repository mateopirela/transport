import {
  buildCarrierFeed,
  carrierLoadsCopy,
  fleetCopy,
  INTERNAL_CHAT_PARAM,
  internalChatCopy,
  internalMessagePreview,
  mobileNavCopy,
  progressSummary,
  vehicleReleaseCopy,
} from '@transport/shared';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';

import { BillingBanner } from '../../../components/billing-banner';
import { CompanyStatus } from '../../../components/company-status';
import type { IconName } from '../../../components/icons';
import { RecommendationCell } from '../../../components/load-card';
import { StatusRow } from '../../../components/status-row';
import {
  Button,
  Cell,
  Footnote,
  Group,
  groupInset,
  LoadError,
  Screen,
  SectionHeader,
  Skeleton,
  TextCell,
} from '../../../components/ui';
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
import { loadInternalInbox, UNREAD_REFRESH_MS } from '../../../lib/internal-chat-api';
import { listPendingReleases } from '../../../lib/release-api';
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

/** Units waiting for their release (G5, D20), for the group on top of the home. */
async function loadPendingReleases({ client, companyId }: CarrierContext) {
  return listPendingReleases(client, companyId);
}

/** The internal chats of the trips (H1), for "Mensajes de operadores". */
async function loadOperatorMessages({ client }: CarrierContext) {
  return loadInternalInbox(client);
}

/**
 * Carrier home: the operators' unread messages (H1), the units to release
 * (G5), recommended loads and return trips (B19), then the onboarding steps
 * (B18).
 */
export default function HomeTab() {
  const { profile } = useSession();
  const approved = profile?.companyStatus === 'approved';

  return (
    <Screen title={profile?.companyName ?? mobileNavCopy.home}>
      {profile ? <CompanyStatus profile={profile} /> : null}
      <BillingBanner />
      {/* Only unread messages of others: never for a hombre-camión working alone (D13-E1). */}
      {approved ? <OperatorMessages /> : null}
      {approved ? <PendingReleases /> : null}
      {approved ? (
        <Feed />
      ) : (
        <Group>
          <TextCell tone="dim">{feedCopy.notApproved}</TextCell>
        </Group>
      )}
      <Onboarding title={approved ? feedCopy.onboarding : copy.title} />
    </Screen>
  );
}

function Feed() {
  const router = useRouter();
  const { state, reload } = useCarrierData(loadFeed);
  if (state.status === 'loading') return <Skeleton />;
  if (state.status === 'error') return <LoadError onRetry={() => void reload()} />;
  const { units, feed, hasUnits } = state.data;
  return (
    <>
      {feed.returnTrips.length > 0 ? (
        <>
          <SectionHeader title={feedCopy.returnTrips} />
          {feed.returnTrips.map((group) => (
            <Group key={group.vehicleId}>
              <Cell
                icon="units"
                strong
                title={feedCopy.returnTripFor(units.get(group.vehicleId) ?? '', group.startCity)}
              />
              {group.recommendations.map((r, i) => (
                <RecommendationCell key={r.loadId} recommendation={r} rank={i + 1} />
              ))}
            </Group>
          ))}
          <Footnote>{feedCopy.returnTripsHelp}</Footnote>
        </>
      ) : null}
      <SectionHeader title={feedCopy.recommended} />
      {feed.recommended.length === 0 ? (
        <Group>
          <TextCell tone="dim">{hasUnits ? feedCopy.empty : feedCopy.noUnits}</TextCell>
        </Group>
      ) : (
        <>
          <Group>
            {feed.recommended.map((r, i) => (
              <RecommendationCell
                key={r.loadId}
                recommendation={r}
                rank={i + 1}
                unitLabel={units.get(r.vehicleId)}
              />
            ))}
          </Group>
          <Footnote>{feedCopy.recommendedHelp}</Footnote>
        </>
      )}
      <Button
        label={feedCopy.searchAll}
        variant="secondary"
        icon="search"
        onPress={() => router.push('/loads')}
      />
    </>
  );
}

/**
 * "Mensajes de operadores (n)": the trips whose internal chat has messages the
 * viewer has not read; each opens the trip on its "Interno" tab. Nothing while
 * there are none.
 */
function OperatorMessages() {
  const router = useRouter();
  const { state, reload } = useCarrierData(loadOperatorMessages);
  // While in focus, so new messages show up without leaving the screen.
  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(() => void reload(), UNREAD_REFRESH_MS);
      return () => clearInterval(timer);
    }, [reload]),
  );
  if (state.status !== 'ready') return null;
  const unread = state.data.filter((row) => row.unread > 0);
  if (unread.length === 0) return null;
  return (
    <>
      <SectionHeader title={internalChatCopy.inbox.title(unread.length)} />
      <Group>
        {unread.slice(0, 5).map((row) => (
          <StatusRow
            key={row.conversationId}
            strong
            title={
              row.originCity && row.destinationCity
                ? internalChatCopy.inbox.route(row.originCity, row.destinationCity)
                : (row.operatorName ?? internalChatCopy.inbox.noOperator)
            }
            lines={[
              row.operatorName,
              internalMessagePreview(row.lastMessageBody, row.lastMessageAttachments),
            ]}
            pill={{ label: internalChatCopy.unreadLabel(row.unread), tone: 'accent' }}
            onPress={() =>
              router.push({
                pathname: '/trip/[id]',
                params: { id: row.tripId, chat: INTERNAL_CHAT_PARAM },
              })
            }
          />
        ))}
      </Group>
    </>
  );
}

/** "Unidades por liberar (n)": nothing while there are none. */
function PendingReleases() {
  const router = useRouter();
  const { state } = useCarrierData(loadPendingReleases);
  if (state.status !== 'ready' || state.data.length === 0) return null;
  const pending = state.data;
  return (
    <>
      <SectionHeader title={vehicleReleaseCopy.home.title(pending.length)} />
      <Group>
        {pending.map((p) => (
          <StatusRow
            key={p.taskId}
            title={vehicleReleaseCopy.home.item(p.unit, p.route)}
            pill={{ label: vehicleReleaseCopy.badge, tone: 'amber' }}
            onPress={() => router.push({ pathname: '/vehicle/[id]', params: { id: p.vehicleId } })}
          />
        ))}
      </Group>
      <Footnote>{vehicleReleaseCopy.home.help}</Footnote>
    </>
  );
}

/** The onboarding steps (B18): each opens its screen and says how far it is. */
function Onboarding({ title }: { title: string }) {
  const router = useRouter();
  const onboarding = useCarrierData(loadOnboarding);
  const state = onboarding.state;
  return (
    <>
      <SectionHeader title={title} />
      {state.status === 'loading' ? (
        <Skeleton rows={4} />
      ) : state.status === 'error' ? (
        <LoadError onRetry={() => void onboarding.reload()} />
      ) : (
        <Group inset={groupInset.icon}>
          {(
            [
              [
                'document',
                copy.companyDocuments,
                copy.documentsProgress(
                  state.data.documents.approved,
                  state.data.documents.required,
                ),
                '/company-documents',
              ],
              [
                'units',
                copy.units,
                state.data.vehicles ? copy.count(state.data.vehicles) : copy.pending,
                '/units',
              ],
              [
                'people',
                copy.operators,
                state.data.operators ? copy.operatorsCount(state.data.operators) : copy.pending,
                '/operators',
              ],
              [
                'route',
                copy.routes,
                state.data.routes ? copy.count(state.data.routes) : copy.pending,
                '/routes',
              ],
            ] satisfies [IconName, string, string, Href][]
          ).map(([icon, stepTitle, value, href]) => (
            <Cell
              key={stepTitle}
              role="link"
              icon={icon}
              title={stepTitle}
              subtitle={value}
              onPress={() => router.push(href)}
            />
          ))}
        </Group>
      )}
      <Footnote>{copy.subtitle}</Footnote>
    </>
  );
}
