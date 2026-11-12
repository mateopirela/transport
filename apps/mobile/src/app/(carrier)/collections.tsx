import {
  collectionsTotals,
  formatBasisPoints,
  formatCalendarDate,
  formatInvoiceIssuedDate,
  formatMoney,
  freightCarrierStatusLabels,
  freightCarrierTone,
  freightCopy,
  freightInvoiceFailureLabels,
  freightInvoicesCopy,
  freightInvoiceValidationLabels,
  quickPayBlockerLabels,
  quickPayCopy,
  quickPaySplit,
  quickPayState,
  shortCfdiUuid,
  toMexicoCityDate,
  type FulmisFiscalData,
} from '@transport/shared';
import * as DocumentPicker from 'expo-document-picker';
import { Stack } from 'expo-router';
import { useRef, useState, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConfirmSheet, type ConfirmSheetHandle } from '../../components/sheet';
import {
  Cell,
  ErrorText,
  Footnote,
  Group,
  LoadError,
  Money,
  Screen,
  SectionHeader,
  Skeleton,
  TextCell,
  ValueRow,
} from '../../components/ui';
import {
  classifyCfdiFiles,
  loadCarrierInvoices,
  loadCollections,
  loadFulmisData,
  loadQuickPayFee,
  requestQuickPay,
  uploadCarrierCfdi,
  type CarrierInvoice,
  type CollectionRow,
} from '../../lib/freight-api';
import type { Supabase } from '../../lib/supabase';
import { useCarrierData, type CarrierContext } from '../../lib/use-carrier';
import { spacing } from '../../theme';

const c = freightCopy.collections;
const f = freightInvoicesCopy;
const q = quickPayCopy.carrier;

interface CollectionsData {
  rows: CollectionRow[];
  invoices: Map<string, CarrierInvoice>;
  fulmis: FulmisFiscalData;
  /** The current quick pay fee (I4); null: no request is offered. */
  quickPayFeeBps: number | null;
}

const load = async ({ client }: CarrierContext): Promise<CollectionsData> => {
  const [rows, invoices, fulmis, quickPayFeeBps] = await Promise.all([
    loadCollections(client),
    loadCarrierInvoices(client),
    loadFulmisData(client),
    loadQuickPayFee(client),
  ]);
  return { rows, invoices, fulmis, quickPayFeeBps };
};

function dueLabel(row: CollectionRow): string {
  if (row.due_on) return formatCalendarDate(row.due_on);
  return row.delivered_at ? freightCopy.termsToBeDefined : freightCopy.dueOnAfterDelivery;
}

/**
 * The carrier's CFDI to Fulmis of a trip (I5): its folio and whether it was
 * validated, or "Subir CFDI": the XML and, optionally, the PDF picked at once
 * and sent to the Edge Function validate-carrier-cfdi, which says every rule
 * that failed.
 */
function CfdiCell({
  client,
  tripId,
  invoice,
  onUploaded,
}: {
  client: Supabase;
  tripId: string;
  invoice: CarrierInvoice | undefined;
  onUploaded: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);

  if (invoice) {
    return (
      <Cell
        icon="document"
        title={f.carrier.column}
        subtitle={f.invoiceLine(
          shortCfdiUuid(invoice.cfdiUuid),
          formatInvoiceIssuedDate(invoice.issuedAt),
        )}
        pill={{
          label: freightInvoiceValidationLabels[invoice.validation],
          tone: invoice.validation === 'validated' ? 'done' : 'pending',
        }}
      />
    );
  }

  async function upload() {
    setErrors([]);
    setDone(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/xml', 'text/xml', 'application/pdf'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;
    const files = classifyCfdiFiles(picked.assets);
    if (files.status === 'invalid') {
      setErrors([freightInvoiceFailureLabels[files.failure]]);
      return;
    }
    setPending(true);
    try {
      const result = await uploadCarrierCfdi(client, tripId, files);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      setDone(result.validation === 'validated' ? f.carrier.done : f.carrier.doneUnvalidated);
      onUploaded();
    } catch {
      setErrors([f.errors.generic]);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Cell
        icon="document"
        title={pending ? f.carrier.submitting : f.carrier.upload}
        subtitle={f.carrier.missing}
        disabled={pending}
        onPress={() => void upload()}
      />
      {errors.map((line) => (
        <TextCell key={line}>
          <ErrorText>{line}</ErrorText>
        </TextCell>
      ))}
      {done ? <TextCell tone="dim">{done}</TextCell> : null}
    </>
  );
}

/**
 * The quick pay of a trip (I4, D38): where its request stands and, while it
 * can be asked for, "Pedir pago rápido" with what the carrier gets, confirmed
 * in a sheet that shows the fee. The fee goes with the request: a fee changed
 * in between is refused instead of charged.
 */
function QuickPayCells({
  row,
  client,
  feeBps,
  confirmSheet,
  onRequested,
}: {
  row: CollectionRow;
  client: Supabase;
  feeBps: number | null;
  confirmSheet: RefObject<ConfirmSheetHandle | null>;
  /** Reloads Cobranza: after a request, or to get a fee that changed. */
  onRequested: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = quickPayState(row);
  const quickNet = row.quick_pay_net_cents === null ? null : formatMoney(row.quick_pay_net_cents);
  let status: string | null = null;
  if (state.kind === 'requested' && quickNet) status = q.requested(quickNet);
  else if (state.kind === 'approved' && quickNet) status = q.approved(quickNet);
  else if (state.kind === 'rejected') status = q.rejected(state.reason);
  const hint = row.quick_pay_blocker ? quickPayBlockerLabels[row.quick_pay_blocker] : null;

  function ask(fee: number) {
    const split = quickPaySplit(row.net_cents, fee);
    confirmSheet.current?.ask({
      title: q.confirmTitle,
      body: q.confirmBody(
        formatMoney(split.netCents),
        formatMoney(split.feeCents),
        formatMoney(split.quickNetCents),
      ),
      confirmLabel: q.confirm,
      cancelLabel: q.cancel,
      onConfirm: async () => {
        setBusy(true);
        setError(null);
        try {
          const result = await requestQuickPay(client, row.trip_id, fee);
          if (result.ok) {
            onRequested();
          } else {
            setError(result.error);
            // A new fee: reload it, so the next confirmation shows it.
            if (result.feeChanged) onRequested();
          }
        } catch {
          setError(quickPayCopy.errors.generic);
        } finally {
          setBusy(false);
        }
      },
    });
  }

  return (
    <>
      {status ? (
        <TextCell tone={state.kind === 'rejected' ? 'body' : 'dim'}>{status}</TextCell>
      ) : null}
      {hint ? <TextCell tone="dim">{hint}</TextCell> : null}
      {row.quick_pay_blocker === null && feeBps !== null ? (
        <Cell
          icon="wallet"
          title={busy ? q.submitting : q.request}
          subtitle={`${q.receive}: ${formatMoney(quickPaySplit(row.net_cents, feeBps).quickNetCents)} · ${q.fee(formatBasisPoints(feeBps))}`}
          disabled={busy}
          onPress={() => ask(feeBps)}
        />
      ) : null}
      {error ? (
        <TextCell>
          <ErrorText>{error}</ErrorText>
        </TextCell>
      ) : null}
    </>
  );
}

/**
 * One trip: its route and status, then the freight, the commission, the net,
 * the date, what was paid, its CFDI and its quick pay.
 */
function TripGroup({
  row,
  client,
  invoice,
  quickPayFeeBps,
  confirmSheet,
  onChanged,
}: {
  row: CollectionRow;
  client: Supabase;
  invoice: CarrierInvoice | undefined;
  quickPayFeeBps: number | null;
  confirmSheet: RefObject<ConfirmSheetHandle | null>;
  onChanged: () => void;
}) {
  return (
    <Group>
      <Cell
        title={freightCopy.route(row.origin_city, row.destination_city)}
        strong
        pill={{
          label: freightCarrierStatusLabels[row.status],
          tone: freightCarrierTone(row.status),
        }}
      />
      <ValueRow label={c.freight} value={formatMoney(row.freight_cents)} />
      <ValueRow
        label={c.commission(formatBasisPoints(row.commission_bps))}
        value={formatMoney(row.commission_cents)}
      />
      <ValueRow label={c.net} value={formatMoney(row.net_cents)} strong />
      <ValueRow label={c.dueOn} value={dueLabel(row)} />
      <ValueRow label={c.paid} value={formatMoney(row.paid_cents)} />
      {row.payments.map((payment) => (
        <TextCell key={payment.speiReference} tone="dim">
          {c.paymentLine(
            formatMoney(payment.amountCents),
            formatCalendarDate(payment.paidOn),
            payment.speiReference,
          )}
        </TextCell>
      ))}
      <CfdiCell client={client} tripId={row.trip_id} invoice={invoice} onUploaded={onChanged} />
      <QuickPayCells
        row={row}
        client={client}
        feeBps={quickPayFeeBps}
        confirmSheet={confirmSheet}
        onRequested={onChanged}
      />
    </Group>
  );
}

/** Who the carrier invoices (I5): Fulmis' fiscal data, or that it is in process. */
function FulmisGroup({ fulmis }: { fulmis: FulmisFiscalData }) {
  const facts = (
    [
      [f.fulmis.legalName, fulmis.legalName],
      [f.fulmis.rfc, fulmis.rfc],
      [f.fulmis.taxRegime, fulmis.taxRegime],
      [f.fulmis.zip, fulmis.zip],
    ] as const
  ).flatMap(([label, value]) => (value === null ? [] : [{ label, value }]));
  return (
    <>
      <SectionHeader title={f.fulmis.title} />
      {facts.length > 0 ? (
        <Group>
          {facts.map((fact) => (
            <ValueRow key={fact.label} label={fact.label} value={fact.value} />
          ))}
        </Group>
      ) : null}
      <Footnote>{fulmis.rfc === null ? f.fulmis.inProcess : f.fulmis.help}</Footnote>
    </>
  );
}

/**
 * "Más → Cobranza" (I3, D34-E1): what Fulmis pays the carrier for each trip,
 * for the Gerente (the whole company) and the Coordinador (their business
 * units). "Por cobrar" first as the screen's figure, then what is held and
 * what was paid this month,
 * then each trip with its CFDI to Fulmis (I5: "Subir CFDI" when it is
 * missing) and its quick pay (I4: "Pedir pago rápido"). Payments are recorded
 * by the admin.
 */
export default function Collections() {
  const { carrier, state, reload } = useCarrierData(load);
  const confirmSheet = useRef<ConfirmSheetHandle>(null);

  let content;
  if (state.status === 'loading' || !carrier) {
    content = <Skeleton rows={4} />;
  } else if (state.status === 'error') {
    content = <LoadError onRetry={() => void reload()} />;
  } else {
    const { rows, invoices, fulmis, quickPayFeeBps } = state.data;
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
        <View style={styles.figure}>
          <Money cents={totals.receivableCents} size="numeral" label={c.receivable} />
        </View>
        <Group>
          <ValueRow label={c.onHold} value={formatMoney(totals.onHoldCents)} />
          <ValueRow label={c.paidThisMonth} value={formatMoney(totals.paidThisMonthCents)} />
        </Group>
        {totals.onHoldCents > 0 ? <Footnote>{c.onHoldHelp}</Footnote> : null}
        <Footnote>{c.description}</Footnote>
        <FulmisGroup fulmis={fulmis} />
        {rows.length === 0 ? (
          <Group>
            <TextCell tone="dim">{c.empty}</TextCell>
          </Group>
        ) : (
          <>
            <SectionHeader title={c.trip} />
            {rows.map((row) => (
              <TripGroup
                key={row.ledger_id}
                row={row}
                client={carrier.client}
                invoice={invoices.get(row.trip_id)}
                quickPayFeeBps={quickPayFeeBps}
                confirmSheet={confirmSheet}
                onChanged={() => void reload()}
              />
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
      <ConfirmSheet ref={confirmSheet} />
    </Screen>
  );
}

const styles = StyleSheet.create({ figure: { paddingTop: spacing.xs } });
