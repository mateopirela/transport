import {
  collectionsTotals,
  formatBasisPoints,
  formatCalendarDate,
  formatMxn,
  freightCarrierStatusLabels,
  freightCarrierStatusTone,
  freightCopy,
  toMexicoCityDate,
} from '@transport/shared';
import { Stack } from 'expo-router';

import {
  Cell,
  Footnote,
  Group,
  LoadError,
  Screen,
  SectionHeader,
  Skeleton,
  TextCell,
  ValueRow,
} from '../../components/ui';
import { loadCollections, type CollectionRow } from '../../lib/freight-api';
import { useCarrierData, type CarrierContext } from '../../lib/use-carrier';

const c = freightCopy.collections;

const load = ({ client }: CarrierContext) => loadCollections(client);

function dueLabel(row: CollectionRow): string {
  if (row.due_on) return formatCalendarDate(row.due_on);
  return row.delivered_at ? freightCopy.termsToBeDefined : freightCopy.dueOnAfterDelivery;
}

/** One trip: its route and status, then the freight, the commission, the net, the date and what was paid. */
function TripGroup({ row }: { row: CollectionRow }) {
  return (
    <Group>
      <Cell
        title={freightCopy.route(row.origin_city, row.destination_city)}
        strong
        pill={{
          label: freightCarrierStatusLabels[row.status],
          tone: freightCarrierStatusTone(row.status),
        }}
      />
      <ValueRow label={c.freight} value={formatMxn(row.freight_cents)} />
      <ValueRow
        label={c.commission(formatBasisPoints(row.commission_bps))}
        value={formatMxn(row.commission_cents)}
      />
      <ValueRow label={c.net} value={formatMxn(row.net_cents)} strong />
      <ValueRow label={c.dueOn} value={dueLabel(row)} />
      <ValueRow label={c.paid} value={formatMxn(row.paid_cents)} />
      {row.payments.map((payment) => (
        <TextCell key={payment.speiReference} tone="dim">
          {c.paymentLine(
            formatMxn(payment.amountCents),
            formatCalendarDate(payment.paidOn),
            payment.speiReference,
          )}
        </TextCell>
      ))}
    </Group>
  );
}

/**
 * "Más → Cobranza" (I3, D34-E1): what Fulmis pays the carrier for each trip,
 * for the Gerente (the whole company) and the Coordinador (their business
 * units). The totals first ("Por cobrar", "Retenido", "Pagado este mes"),
 * then each trip. Information only: payments are recorded by the admin.
 */
export default function Collections() {
  const { state, reload } = useCarrierData(load);

  let content;
  if (state.status === 'loading') {
    content = <Skeleton rows={4} />;
  } else if (state.status === 'error') {
    content = <LoadError onRetry={() => void reload()} />;
  } else {
    const rows = state.data;
    const totals = collectionsTotals(
      rows.map((row) => ({
        status: row.status,
        pendingCents: row.pending_cents,
        payments: row.payments,
      })),
      toMexicoCityDate(new Date().toISOString()),
    );
    content = (
      <>
        <Group>
          <ValueRow label={c.receivable} value={formatMxn(totals.receivableCents)} strong />
          <ValueRow label={c.onHold} value={formatMxn(totals.onHoldCents)} />
          <ValueRow label={c.paidThisMonth} value={formatMxn(totals.paidThisMonthCents)} />
        </Group>
        {totals.onHoldCents > 0 ? <Footnote>{c.onHoldHelp}</Footnote> : null}
        <Footnote>{c.description}</Footnote>
        {rows.length === 0 ? (
          <Group>
            <TextCell tone="dim">{c.empty}</TextCell>
          </Group>
        ) : (
          <>
            <SectionHeader title={c.trip} />
            {rows.map((row) => (
              <TripGroup key={row.ledger_id} row={row} />
            ))}
          </>
        )}
      </>
    );
  }

  return (
    <Screen belowHeader onRefresh={() => void reload()}>
      <Stack.Screen options={{ title: c.title }} />
      {content}
    </Screen>
  );
}
