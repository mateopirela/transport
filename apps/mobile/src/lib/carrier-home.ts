/**
 * The carrier's home as a dashboard (V8, docs/plan-fulmis.md §1.5), its pure
 * part: which negotiations wait for the carrier's answer and what goes into
 * "Requiere tu atención", one row per thing to do with the screen it opens.
 * The same rows as the web's home (V4) and the same words
 * (carrierWebCopy.dashboard). No React Native here, so it is tested on its own.
 */
import {
  carrierAppCopy,
  carrierNegotiationState,
  carrierWebCopy,
  firstOf,
  formatDate,
  formatMoney,
  sortOffers,
  vehicleReleaseCopy,
  type ExpiringDocument,
  type StateTone,
} from '@transport/shared';

import type { CarrierNegotiationSummary } from './loads-api';
import type { PendingRelease } from './release-api';

const d = carrierWebCopy.dashboard.attention;

/** Rows of each kind "Requiere tu atención" shows before saying how many are left. */
export const ATTENTION_PER_KIND = 3;

/** A counteroffer of the client that waits for the carrier's answer. */
export interface NegotiationToAnswer {
  negotiationId: string;
  loadId: string;
  route: string;
  amountCents: number;
}

/**
 * The negotiations whose turn is the carrier's ("respond": the client's
 * pending counteroffer on a load still open), with the amount the client
 * proposes. A load another carrier won is hidden and never waits.
 */
export function negotiationsToAnswer(
  negotiations: readonly CarrierNegotiationSummary[],
): NegotiationToAnswer[] {
  return negotiations.flatMap(({ negotiationId, load, offers }) => {
    if (!load || carrierNegotiationState(offers, load.status) !== 'respond') return [];
    const latest = sortOffers(offers).at(-1);
    if (!latest) return [];
    return [
      {
        negotiationId,
        loadId: load.id,
        route: `${load.origin_city} → ${load.destination_city}`,
        amountCents: latest.amount_cents,
      },
    ];
  });
}

/** A trip waiting for its unit and operator, as the trips list reads it. */
export interface TripToAssign {
  id: string;
  pickupAt: string;
  load: { origin_city: string; destination_city: string };
}

/** Where a row of "Requiere tu atención" leads. */
export type AttentionTarget =
  | { screen: 'vehicle'; id: string }
  | { screen: 'operator'; id: string }
  | { screen: 'load'; id: string }
  | { screen: 'trip'; id: string };

export interface AttentionItem {
  key: string;
  /** What it is, on its pill: "Por liberar", "Contraoferta"… */
  tag: string;
  tone: StateTone;
  title: string;
  detail: string;
  target: AttentionTarget;
}

export interface Attention {
  items: AttentionItem[];
  /** Every thing to do, shown or not. */
  total: number;
  /** What was left out, by kind: the screen says it under the rows. */
  more: { respond: number; assign: number; expiring: number };
}

/**
 * "Requiere tu atención", most urgent first: the units to release (they
 * cannot work), the client's counteroffers, the trips to assign and the
 * documents about to expire. At most `perKind` rows of each kind but the
 * releases, which are few and block a unit. The counteroffers and the trips
 * left out are a tap away in Cargas and Viajes; the documents have no list of
 * their own in the app, so `allExpiring` shows every one of them here.
 */
export function attentionItems(
  {
    releases,
    toAnswer,
    toAssign,
    expiring,
  }: {
    releases: readonly PendingRelease[];
    toAnswer: readonly NegotiationToAnswer[];
    toAssign: readonly TripToAssign[];
    expiring: readonly ExpiringDocument[];
  },
  {
    perKind = ATTENTION_PER_KIND,
    allExpiring = false,
  }: { perKind?: number; allExpiring?: boolean } = {},
): Attention {
  const answer = firstOf(toAnswer, perKind);
  const assign = firstOf(toAssign, perKind);
  const documents = firstOf(expiring, allExpiring ? expiring.length : perKind);
  const items: AttentionItem[] = [
    ...releases.map((p) => ({
      key: `release-${p.taskId}`,
      tag: d.tags.release,
      tone: 'problem' as const,
      title: vehicleReleaseCopy.home.item(p.unit, p.route),
      detail: vehicleReleaseCopy.home.help,
      target: { screen: 'vehicle' as const, id: p.vehicleId },
    })),
    ...answer.shown.map((n) => ({
      key: `respond-${n.negotiationId}`,
      tag: d.tags.respond,
      tone: 'attention' as const,
      title: n.route,
      detail: d.respondDetail(formatMoney(n.amountCents)),
      target: { screen: 'load' as const, id: n.loadId },
    })),
    ...assign.shown.map((trip) => ({
      key: `assign-${trip.id}`,
      tag: d.tags.assign,
      tone: 'pending' as const,
      title: `${trip.load.origin_city} → ${trip.load.destination_city}`,
      detail: d.assignDetail(formatDate(trip.pickupAt)),
      target: { screen: 'trip' as const, id: trip.id },
    })),
    ...documents.shown.map((doc) => ({
      key: `expiring-${doc.documentId}`,
      tag: d.tags.expiring,
      tone: 'pending' as const,
      title: carrierAppCopy.home.expiringItem(doc.requirementName, doc.owner.label),
      detail: d.expiringDetail(doc.daysLeft),
      target: { screen: doc.owner.type, id: doc.owner.id },
    })),
  ];
  return {
    items,
    total: releases.length + toAnswer.length + toAssign.length + expiring.length,
    more: { respond: answer.more, assign: assign.more, expiring: documents.more },
  };
}
