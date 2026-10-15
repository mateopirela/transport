import { describe, expect, it } from 'vitest';

import { TRIP_STATUSES } from './enums';
import {
  canTransition,
  isTerminalStatus,
  nextStatuses,
  statusesOf,
  type Actor,
  type Entity,
  type StatusOf,
} from './state-machines';

const ACTORS: readonly Actor[] = ['shipper', 'carrier', 'operator', 'admin', 'system'];
const ENTITIES: readonly Entity[] = ['load', 'offer', 'trip', 'document', 'company'];

describe('load state machine', () => {
  it('follows the happy path', () => {
    expect(canTransition('load', 'draft', 'published', 'shipper')).toBe(true);
    expect(canTransition('load', 'published', 'negotiating', 'system')).toBe(true);
    expect(canTransition('load', 'negotiating', 'contracted', 'system')).toBe(true);
    expect(canTransition('load', 'contracted', 'in_progress', 'system')).toBe(true);
    expect(canTransition('load', 'in_progress', 'completed', 'system')).toBe(true);
  });

  it('returns to published when negotiations end without agreement', () => {
    expect(canTransition('load', 'negotiating', 'published', 'system')).toBe(true);
    expect(canTransition('load', 'negotiating', 'published', 'shipper')).toBe(false);
  });

  it('lets the shipper cancel only before contracting', () => {
    for (const from of ['draft', 'published', 'negotiating'] as const) {
      expect(canTransition('load', from, 'cancelled', 'shipper')).toBe(true);
    }
    expect(canTransition('load', 'contracted', 'cancelled', 'shipper')).toBe(false);
    expect(canTransition('load', 'contracted', 'cancelled', 'admin')).toBe(true);
    expect(canTransition('load', 'in_progress', 'cancelled', 'system')).toBe(true);
    expect(canTransition('load', 'completed', 'cancelled', 'admin')).toBe(false);
  });

  it('expires only from open states and only by the system', () => {
    expect(canTransition('load', 'published', 'expired', 'system')).toBe(true);
    expect(canTransition('load', 'negotiating', 'expired', 'system')).toBe(true);
    expect(canTransition('load', 'draft', 'expired', 'system')).toBe(false);
    expect(canTransition('load', 'published', 'expired', 'shipper')).toBe(false);
  });

  it('does not let carriers or operators drive a load', () => {
    expect(nextStatuses('load', 'draft', 'carrier')).toEqual([]);
    expect(nextStatuses('load', 'published', 'operator')).toEqual([]);
  });

  it('cannot skip states', () => {
    expect(canTransition('load', 'draft', 'contracted', 'system')).toBe(false);
    expect(canTransition('load', 'published', 'completed', 'system')).toBe(false);
  });
});

describe('offer state machine', () => {
  it('resolves a pending offer', () => {
    expect(nextStatuses('offer', 'pending', 'carrier')).toEqual([
      'accepted',
      'rejected',
      'countered',
      'withdrawn',
    ]);
    expect(nextStatuses('offer', 'pending', 'system')).toEqual(['rejected', 'expired']);
    expect(nextStatuses('offer', 'pending', 'operator')).toEqual([]);
  });

  it('treats every non-pending status as final', () => {
    for (const status of statusesOf('offer').filter((s) => s !== 'pending')) {
      expect(isTerminalStatus('offer', status)).toBe(true);
    }
    expect(canTransition('offer', 'accepted', 'rejected', 'system')).toBe(false);
  });
});

describe('trip state machine', () => {
  const operatorPath = TRIP_STATUSES.slice(1, 9);

  it('lets only the operator advance the trip step by step', () => {
    for (let i = 0; i < operatorPath.length - 1; i++) {
      const from = operatorPath[i] as StatusOf<'trip'>;
      const to = operatorPath[i + 1] as StatusOf<'trip'>;
      expect(canTransition('trip', from, to, 'operator')).toBe(true);
      expect(canTransition('trip', from, to, 'carrier')).toBe(false);
      expect(canTransition('trip', from, to, 'shipper')).toBe(false);
    }
    expect(canTransition('trip', 'assigned', 'loading', 'operator')).toBe(false);
  });

  it('assigns by carrier or admin and closes on confirmed delivery', () => {
    expect(canTransition('trip', 'pending_assignment', 'assigned', 'carrier')).toBe(true);
    expect(canTransition('trip', 'pending_assignment', 'assigned', 'admin')).toBe(true);
    expect(canTransition('trip', 'pending_assignment', 'assigned', 'operator')).toBe(false);
    expect(canTransition('trip', 'delivered', 'closed', 'shipper')).toBe(true);
    expect(canTransition('trip', 'delivered', 'closed', 'operator')).toBe(false);
  });

  it('allows cancelling before loading, and only the admin after', () => {
    expect(canTransition('trip', 'at_pickup', 'cancelled', 'carrier')).toBe(true);
    expect(canTransition('trip', 'loading', 'cancelled', 'carrier')).toBe(false);
    expect(canTransition('trip', 'in_transit', 'cancelled', 'admin')).toBe(true);
    expect(canTransition('trip', 'delivered', 'cancelled', 'admin')).toBe(false);
    expect(canTransition('trip', 'assigned', 'cancelled', 'operator')).toBe(false);
  });

  it('ends in closed or cancelled', () => {
    expect(isTerminalStatus('trip', 'closed')).toBe(true);
    expect(isTerminalStatus('trip', 'cancelled')).toBe(true);
    expect(isTerminalStatus('trip', 'unloading')).toBe(false);
  });
});

describe('verification state machines (documents and companies)', () => {
  it('only the admin reviews', () => {
    for (const entity of ['document', 'company'] as const) {
      expect(nextStatuses(entity, 'pending_review', 'admin')).toEqual(['approved', 'rejected']);
      for (const actor of ACTORS.filter((a) => a !== 'admin')) {
        expect(nextStatuses(entity, 'pending_review', actor)).toEqual([]);
      }
    }
  });

  it('expires by the system, suspends and reactivates by the admin', () => {
    expect(canTransition('document', 'approved', 'expired', 'system')).toBe(true);
    expect(canTransition('company', 'approved', 'suspended', 'admin')).toBe(true);
    expect(canTransition('company', 'suspended', 'approved', 'admin')).toBe(true);
    expect(canTransition('company', 'suspended', 'approved', 'shipper')).toBe(false);
  });

  it('lets owners resubmit after rejection or expiry', () => {
    expect(canTransition('company', 'rejected', 'pending_review', 'carrier')).toBe(true);
    expect(canTransition('company', 'expired', 'pending_review', 'shipper')).toBe(true);
    expect(canTransition('company', 'rejected', 'pending_review', 'operator')).toBe(false);
    expect(canTransition('document', 'rejected', 'pending_review', 'operator')).toBe(true);
    expect(canTransition('document', 'suspended', 'pending_review', 'carrier')).toBe(false);
  });

  it('has no terminal state', () => {
    for (const status of statusesOf('company')) {
      expect(isTerminalStatus('company', status)).toBe(false);
    }
  });
});

describe('invariants', () => {
  it('never allows self-transitions', () => {
    for (const entity of ENTITIES) {
      for (const status of statusesOf(entity)) {
        for (const actor of ACTORS) {
          expect(canTransition(entity, status, status, actor)).toBe(false);
        }
      }
    }
  });

  it('only reaches known statuses', () => {
    for (const entity of ENTITIES) {
      const known = statusesOf(entity);
      for (const from of known) {
        for (const actor of ACTORS) {
          for (const to of nextStatuses(entity, from, actor)) {
            expect(known).toContain(to);
          }
        }
      }
    }
  });

  it('rejects unknown entities, statuses and actors from untyped input', () => {
    const anyEntity = 'invoice' as Entity;
    expect(canTransition(anyEntity, 'draft' as never, 'published' as never, 'shipper')).toBe(false);
    expect(nextStatuses(anyEntity, 'draft' as never, 'shipper')).toEqual([]);
    expect(statusesOf(anyEntity)).toEqual([]);
    expect(isTerminalStatus(anyEntity, 'draft' as never)).toBe(true);
    expect(canTransition('load', 'archived' as never, 'published', 'shipper')).toBe(false);
    expect(canTransition('load', 'draft', 'published', 'guest' as Actor)).toBe(false);
    expect(canTransition('constructor' as Entity, 'a' as never, 'b' as never, 'admin')).toBe(false);
  });
});
