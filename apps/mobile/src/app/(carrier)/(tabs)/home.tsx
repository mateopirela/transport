import {
  buildCarrierFeed,
  carrierAppCopy,
  carrierLoadsCopy,
  carrierWebCopy,
  collectionsTotals,
  EXPIRY_WINDOW_DAYS,
  expiringDocuments,
  fleetCopy,
  formatMoney,
  groupCarrierTrips,
  INTERNAL_CHAT_PARAM,
  internalChatCopy,
  internalMessagePreview,
  mobileNavCopy,
  progressSummary,
  toMexicoCityDate,
} from '@transport/shared';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BillingBanner } from '../../../components/billing-banner';
import { CarrierTripRow } from '../../../components/carrier-trip-row';
import { CompanyStatus } from '../../../components/company-status';
import type { IconName } from '../../../components/icons';
import { RecommendationCell } from '../../../components/load-card';
import { StatusRow } from '../../../components/status-row';
import {
  Button,
  Cell,
  Empty,
  Footnote,
  Group,
  groupInset,
  KpiGrid,
  KpiTile,
  LoadError,
  Screen,
  SectionHeader,
  Skeleton,
  TextCell,
} from '../../../components/ui';
import { listCarrierTrips } from '../../../lib/carrier-trips-api';
import {
  attentionItems,
  negotiationsToAnswer,
  type AttentionItem,
  type AttentionTarget,
} from '../../../lib/carrier-home';
import {
  listOperators,
  listRoutes,
  listVehicles,
  loadCompanyContext,
  ownerProgress,
} from '../../../lib/fleet-api';
import { loadCollections } from '../../../lib/freight-api';
import {
  listCarrierUnits,
  listNegotiations,
  returnTripCities,
  unitLabel,
  unitRecommendations,
} from '../../../lib/loads-api';
import { loadInternalInbox, UNREAD_REFRESH_MS } from '../../../lib/internal-chat-api';
import { listPendingReleases } from '../../../lib/release-api';
import { track } from '../../../lib/track';
import { useCarrierData, type CarrierContext } from '../../../lib/use-carrier';
import { useSession } from '../../../providers/session';
import { spacing } from '../../../theme';

const copy = fleetCopy.onboarding;
const feedCopy = carrierLoadsCopy.home;
const d = carrierWebCopy.dashboard;

/** Active trips the home lists under "Viajes en curso"; the rest are a tap away in Viajes. */
const ACTIVE_ON_HOME = 3;

/**
 * Everything the dashboard reads, at once: the onboarding counts (B18), the
 * documents about to expire, the client's counteroffers, the trips, the units
 * to release (G5) and Cobranza's totals (I3). Only what RLS already shows the
 * carrier staff, through the same reads as their screens; Cobranza never takes
 * the home down.
 */
async function loadDashboard({ client, companyId }: CarrierContext) {
  const [context, operators, routes, negotiations, trips, releases, ledger] = await Promise.all([
    loadCompanyContext(client, companyId),
    listOperators(client, companyId),
    listRoutes(client, companyId),
    listNegotiations(client, companyId),
    listCarrierTrips(client, companyId),
    listPendingReleases(client, companyId),
    loadCollections(client).catch(() => null),
  ]);
  const vehicles = await listVehicles(client, context);
  const groups = groupCarrierTrips(trips.trips);
  return {
    onboarding: {
      documents: progressSummary(ownerProgress(context, { type: 'company', id: companyId })),
      vehicles: vehicles.length,
      operators: operators.length,
      routes: routes.length,
    },
    expiring: expiringDocuments(context, [
      ...vehicles.map((v) => ({ type: 'vehicle' as const, id: v.id, label: unitLabel(v) })),
      ...operators.map((o) => ({ type: 'operator' as const, id: o.id, label: o.full_name })),
    ]),
    toAnswer: negotiationsToAnswer(negotiations),
    active: groups.active,
    toAssign: groups.to_assign,
    releases,
    totals: ledger
      ? collectionsTotals(
          ledger.map((row) => ({
            status: row.status,
            pendingCents: row.pending_cents,
            payments: row.payments,
          })),
          toMexicoCityDate(new Date().toISOString()),
        )
      : null,
  };
}

type Dashboard = Awaited<ReturnType<typeof loadDashboard>>;

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

/** The internal chats of the trips (H1), for "Mensajes de operadores". */
async function loadOperatorMessages({ client }: CarrierContext) {
  return loadInternalInbox(client);
}

/** The screen a row of "Requiere tu atención" opens. */
function hrefOf(target: AttentionTarget): Href {
  switch (target.screen) {
    case 'vehicle':
      return { pathname: '/vehicle/[id]', params: { id: target.id } };
    case 'operator':
      return { pathname: '/operator/[id]', params: { id: target.id } };
    case 'load':
      return { pathname: '/load/[id]', params: { id: target.id } };
    case 'trip':
      return { pathname: '/trip/[id]', params: { id: target.id } };
  }
}

/**
 * Carrier home as a dashboard (docs/plan-fulmis.md §1.5, V8): four
 * indicators (counteroffers to answer, trips on the road, what Fulmis owes
 * and documents about to expire), "Requiere tu atención" with one row per
 * thing to do (units to release, G5; counteroffers; trips to assign;
 * documents), the operators' unread messages (H1), the trips on the road, the
 * recommended loads and return trips (B19) and, last, the onboarding steps
 * (B18). The same as the web's home (V4), on a phone.
 */
export default function HomeTab() {
  const { profile } = useSession();
  const approved = profile?.companyStatus === 'approved';
  const { state, reload } = useCarrierData(loadDashboard);

  return (
    <Screen
      title={profile?.companyName ?? mobileNavCopy.home}
      subtitle={approved ? d.description : undefined}
    >
      {profile ? <CompanyStatus profile={profile} /> : null}
      <BillingBanner />
      {state.status === 'loading' ? (
        <Skeleton rows={4} />
      ) : state.status === 'error' ? (
        <LoadError onRetry={() => void reload()} />
      ) : approved ? (
        <DashboardSections
          data={state.data}
          // Only unread messages of others: never for a hombre-camión working alone (D13-E1).
          messages={<OperatorMessages />}
        />
      ) : null}
      {approved ? (
        <Feed />
      ) : (
        <Group>
          <TextCell tone="dim">{feedCopy.notApproved}</TextCell>
        </Group>
      )}
      {state.status === 'ready' ? (
        <Onboarding
          title={approved ? feedCopy.onboarding : copy.title}
          data={state.data.onboarding}
        />
      ) : null}
    </Screen>
  );
}

/**
 * The indicators, "Requiere tu atención", the operators' unread messages
 * (`messages`, also something to answer) and the trips on the road.
 */
function DashboardSections({ data, messages }: { data: Dashboard; messages: ReactNode }) {
  const router = useRouter();
  const [allExpiring, setAllExpiring] = useState(false);
  const attention = attentionItems(data, { allExpiring });
  const { totals } = data;
  return (
    <>
      <KpiGrid>
        <KpiTile
          label={d.kpis.respond}
          value={String(data.toAnswer.length)}
          hint={d.kpis.respondHint(data.toAnswer.length)}
          onPress={() => router.push('/loads')}
        />
        <KpiTile
          label={d.kpis.active}
          value={String(data.active.length)}
          hint={d.kpis.activeHint(data.toAssign.length)}
          onPress={() => router.push('/trips')}
        />
        <KpiTile
          label={d.kpis.receivable}
          value={totals ? formatMoney(totals.receivableCents) : carrierAppCopy.home.noFigure}
          hint={d.kpis.receivableHint(
            totals && totals.onHoldCents > 0 ? formatMoney(totals.onHoldCents) : null,
          )}
          onPress={() => router.push('/collections')}
        />
        <KpiTile
          label={d.kpis.expiring}
          value={String(data.expiring.length)}
          hint={d.kpis.expiringHint(EXPIRY_WINDOW_DAYS)}
        />
      </KpiGrid>

      <SectionHeader title={d.attention.title} />
      {attention.items.length === 0 ? (
        <Empty title={d.attention.empty} body={d.attention.emptyHelp} />
      ) : (
        <>
          <Group>
            {attention.items.map((item) => (
              <AttentionRow key={item.key} item={item} />
            ))}
          </Group>
          {/* What was left out: the counteroffers wait in Cargas and the trips in Viajes;
              the documents unfold here, the only place the app lists them all. */}
          {attention.more.respond > 0 ? (
            <MoreButton
              label={d.attention.moreRespond(attention.more.respond)}
              onPress={() => router.push('/loads')}
            />
          ) : null}
          {attention.more.assign > 0 ? (
            <MoreButton
              label={d.attention.moreAssign(attention.more.assign)}
              onPress={() => router.push('/trips')}
            />
          ) : null}
          {attention.more.expiring > 0 ? (
            <MoreButton
              label={carrierAppCopy.home.moreExpiring(attention.more.expiring)}
              onPress={() => setAllExpiring(true)}
            />
          ) : null}
        </>
      )}

      {messages}

      <SectionHeader
        title={d.activeTrips.title}
        action={
          data.active.length > 0
            ? { label: d.activeTrips.all, onPress: () => router.push('/trips') }
            : undefined
        }
      />
      {data.active.length === 0 ? (
        <Group>
          <TextCell tone="dim">{d.activeTrips.empty}</TextCell>
        </Group>
      ) : (
        <Group>
          {data.active.slice(0, ACTIVE_ON_HOME).map((trip) => (
            <CarrierTripRow
              key={trip.id}
              trip={trip}
              onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })}
            />
          ))}
        </Group>
      )}
    </>
  );
}

/** A link under "Requiere tu atención" to what it left out. */
function MoreButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View style={styles.more}>
      <Button label={label} variant="plain" size="small" onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({ more: { alignItems: 'flex-start', marginTop: -spacing.sm } });

/** One thing to do: what it is and its detail, its kind on a pill, and the screen where it is done. */
function AttentionRow({ item }: { item: AttentionItem }) {
  const router = useRouter();
  return (
    <StatusRow
      strong
      title={item.title}
      lines={[item.detail]}
      pill={{ label: item.tag, tone: item.tone }}
      onPress={() => router.push(hrefOf(item.target))}
    />
  );
}

function Feed() {
  const router = useRouter();
  const { state, reload } = useCarrierData(loadFeed);
  const search = { label: feedCopy.searchAll, onPress: () => router.push('/loads') };
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
      <SectionHeader title={feedCopy.recommended} action={search} />
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
            pill={{ label: internalChatCopy.unreadLabel(row.unread), tone: 'attention' }}
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

/** The onboarding steps (B18): each opens its screen and says how far it is. */
function Onboarding({ title, data }: { title: string; data: Dashboard['onboarding'] }) {
  const router = useRouter();
  const steps: [IconName, string, string, Href][] = [
    [
      'document',
      copy.companyDocuments,
      copy.documentsProgress(data.documents.approved, data.documents.required),
      '/company-documents',
    ],
    ['units', copy.units, data.vehicles ? copy.count(data.vehicles) : copy.pending, '/units'],
    [
      'people',
      copy.operators,
      data.operators ? copy.operatorsCount(data.operators) : copy.pending,
      '/operators',
    ],
    ['route', copy.routes, data.routes ? copy.count(data.routes) : copy.pending, '/routes'],
  ];
  return (
    <>
      <SectionHeader title={title} />
      <Group inset={groupInset.icon}>
        {steps.map(([icon, stepTitle, value, href]) => (
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
      <Footnote>{copy.subtitle}</Footnote>
    </>
  );
}
