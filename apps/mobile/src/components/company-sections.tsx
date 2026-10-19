import {
  businessUnitNames,
  formatDateTime,
  groupByBusinessUnit,
  managerCompanyCopy,
  type BusinessUnitRef,
} from '@transport/shared';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import {
  archiveBusinessUnit,
  createBusinessUnit,
  issueInvitation,
  removeCoordinator,
  renameBusinessUnit,
  setCoordinatorUnits,
  type CompanyCoordinator,
  type ManagerCompany,
} from '../lib/company-api';
import { revokeInvitation } from '../lib/fleet-api';
import { companyErrorMessage } from '../lib/fleet-errors';
import type { CarrierContext } from '../lib/use-carrier';
import { spacing } from '../theme';
import { Badge, Card, MultiChips, SectionTitle } from './fleet-ui';
import { InvitationLinkIssuer } from './invitation-link';
import { Body, Button, Field, Notice } from './ui';

const copy = managerCompanyCopy;

interface SectionProps {
  carrier: CarrierContext;
  company: ManagerCompany;
  onChanged: () => Promise<void>;
}

/** Runs a write and refreshes; keeps its Spanish error (or success) message. */
function useWrite(onChanged: () => Promise<void>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  async function run(key: string, action: () => Promise<void>, success: string) {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      setMessage({ tone: 'info', text: success });
      await onChanged();
    } catch (error) {
      setMessage({ tone: 'danger', text: companyErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }
  const notice = message ? <Notice tone={message.tone}>{message.text}</Notice> : null;
  return { busy, run, notice };
}

/** Asks before a destructive write (archive, remove). */
function confirm(title: string, body: string, action: string, onConfirm: () => void) {
  Alert.alert(title, body, [
    { text: copy.businessUnits.cancel, style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}

const toggle = (list: readonly string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

// ---------------------------------------------------------------------------
// Business units
// ---------------------------------------------------------------------------

export function BusinessUnitsSection({ carrier, company, onChanged }: SectionProps) {
  const { busy, run, notice } = useWrite(onChanged);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const c = copy.businessUnits;

  const count = (unitId: string) =>
    c.counts(
      company.vehicles.filter((v) => v.business_unit_id === unitId).length,
      company.operators.filter((o) => o.business_unit_id === unitId).length,
      company.coordinators.filter((p) => p.unitIds.includes(unitId)).length,
    );

  return (
    <View style={{ gap: spacing.md }}>
      <SectionTitle>{copy.sections.businessUnits}</SectionTitle>
      <Body>{c.description}</Body>
      {notice}
      {company.units.map((unit) =>
        renaming?.id === unit.id ? (
          <Card key={unit.id} title={unit.name}>
            <Field
              label={c.nameLabel}
              value={renaming.name}
              onChangeText={(text) => setRenaming({ id: unit.id, name: text })}
            />
            <Button
              label={c.save}
              loading={busy === `rename-${unit.id}`}
              onPress={() =>
                void run(
                  `rename-${unit.id}`,
                  async () => {
                    await renameBusinessUnit(carrier.client, unit.id, renaming.name);
                    setRenaming(null);
                  },
                  c.renamed,
                )
              }
            />
            <Button label={c.cancel} variant="link" onPress={() => setRenaming(null)} />
          </Card>
        ) : (
          <Card key={unit.id} title={unit.name} subtitle={count(unit.id)}>
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <Button
                label={c.rename}
                variant="link"
                onPress={() => setRenaming({ id: unit.id, name: unit.name })}
              />
              {company.units.length > 1 ? (
                <Button
                  label={c.archive}
                  variant="link"
                  loading={busy === `archive-${unit.id}`}
                  onPress={() =>
                    confirm(c.archiveConfirmTitle, c.archiveConfirmBody, c.archive, () => {
                      void run(
                        `archive-${unit.id}`,
                        () => archiveBusinessUnit(carrier.client, unit.id),
                        c.archived,
                      );
                    })
                  }
                />
              ) : null}
            </View>
          </Card>
        ),
      )}
      <Field label={c.nameLabel} value={name} onChangeText={setName} testID="new-business-unit" />
      <Button
        label={c.create}
        variant="secondary"
        disabled={name.trim() === ''}
        loading={busy === 'create'}
        onPress={() =>
          void run(
            'create',
            async () => {
              await createBusinessUnit(carrier.client, name);
              setName('');
            },
            c.created,
          )
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Coordinators
// ---------------------------------------------------------------------------

function CoordinatorCard({
  coordinator,
  units,
  carrier,
  onChanged,
}: {
  coordinator: CompanyCoordinator;
  units: readonly BusinessUnitRef[];
  carrier: CarrierContext;
  onChanged: () => Promise<void>;
}) {
  const { busy, run, notice } = useWrite(onChanged);
  const [editing, setEditing] = useState<string[] | null>(null);
  const c = copy.coordinators;
  const names = businessUnitNames(coordinator.unitIds, units);
  return (
    <Card
      title={coordinator.fullName ?? copy.invitations.invitee(null)}
      subtitle={names.length > 0 ? names.join(' · ') : c.noUnits}
    >
      {notice}
      {editing ? (
        <>
          <MultiChips
            label={c.unitsLabel}
            options={units.map((u) => ({ value: u.id, label: u.name }))}
            values={editing}
            onToggle={(id) => setEditing(toggle(editing, id))}
          />
          <Button
            label={c.saveUnits}
            loading={busy === 'units'}
            onPress={() =>
              void run(
                'units',
                async () => {
                  await setCoordinatorUnits(carrier.client, coordinator.id, editing);
                  setEditing(null);
                },
                c.unitsSaved,
              )
            }
          />
          <Button
            label={copy.businessUnits.cancel}
            variant="link"
            onPress={() => setEditing(null)}
          />
        </>
      ) : (
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button
            label={c.editUnits}
            variant="link"
            onPress={() => setEditing(coordinator.unitIds)}
          />
          <Button
            label={c.remove}
            variant="link"
            loading={busy === 'remove'}
            onPress={() =>
              confirm(c.removeConfirmTitle, c.removeConfirmBody, c.remove, () => {
                void run(
                  'remove',
                  () => removeCoordinator(carrier.client, coordinator.id),
                  c.removed,
                );
              })
            }
          />
        </View>
      )}
    </Card>
  );
}

export function CoordinatorsSection({ carrier, company, onChanged }: SectionProps) {
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const c = copy.coordinators;
  return (
    <View style={{ gap: spacing.md }}>
      <SectionTitle>{copy.sections.coordinators}</SectionTitle>
      <Body>{c.description}</Body>
      {company.coordinators.length === 0 ? <Body>{c.empty}</Body> : null}
      {company.coordinators.map((coordinator) => (
        <CoordinatorCard
          key={coordinator.id}
          coordinator={coordinator}
          units={company.units}
          carrier={carrier}
          onChanged={onChanged}
        />
      ))}
      <Card title={c.invite}>
        <MultiChips
          label={c.inviteUnitsLabel}
          options={company.units.map((u) => ({ value: u.id, label: u.name }))}
          values={unitIds}
          onToggle={(id) => setUnitIds(toggle(unitIds, id))}
        />
        <Field label={c.inviteeLabel} value={name} onChangeText={setName} autoComplete="name" />
        <InvitationLinkIssuer
          label={c.invite}
          disabled={unitIds.length === 0}
          issue={() =>
            issueInvitation(carrier.client, { kind: 'coordinator', unitIds, inviteeName: name })
          }
          onIssued={() => void onChanged()}
          shareMessage={(link) =>
            copy.invitationLink.coordinatorShareMessage(carrier.companyName, link)
          }
        />
      </Card>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Units and operators, by business unit
// ---------------------------------------------------------------------------

/** Units or operators by business unit; each opens its screen, where the Gerente moves or archives it. */
export function FleetByUnitSection({
  company,
  kind,
  onOpen,
}: {
  company: ManagerCompany;
  kind: 'vehicles' | 'operators';
  onOpen: (id: string) => void;
}) {
  const rows =
    kind === 'vehicles'
      ? company.vehicles.map((v) => ({
          id: v.id,
          title: v.fleet_number ? `${v.plate} · ${v.fleet_number}` : v.plate,
          subtitle: null as string | null,
          unitId: v.business_unit_id,
        }))
      : company.operators.map((o) => ({
          id: o.id,
          title: o.full_name,
          subtitle: o.phone,
          unitId: o.business_unit_id,
        }));
  const groups = groupByBusinessUnit(company.units, rows, (row) => row.unitId);
  return (
    <View style={{ gap: spacing.md }}>
      <SectionTitle>
        {kind === 'vehicles' ? copy.sections.units : copy.sections.operators}
      </SectionTitle>
      {groups.map((group) => (
        <View key={group.unit?.id ?? 'none'} style={{ gap: spacing.sm }}>
          <Badge label={group.unit?.name ?? copy.fleet.noBusinessUnit} tone="neutral" />
          {group.items.length === 0 ? (
            <Body>{kind === 'vehicles' ? copy.fleet.unitsEmpty : copy.fleet.operatorsEmpty}</Body>
          ) : null}
          {group.items.map((row) => (
            <Card
              key={row.id}
              title={row.title}
              subtitle={row.subtitle}
              onPress={() => onOpen(row.id)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pending invitations
// ---------------------------------------------------------------------------

export function InvitationsSection({ carrier, company, onChanged }: SectionProps) {
  const { busy, run, notice } = useWrite(onChanged);
  const c = copy.invitations;
  return (
    <View style={{ gap: spacing.md }}>
      <SectionTitle>{copy.sections.invitations}</SectionTitle>
      <Body>{c.description}</Body>
      {notice}
      {company.invitations.length === 0 ? <Body>{c.empty}</Body> : null}
      {company.invitations.map((invitation) => (
        <Card
          key={invitation.id}
          title={`${c.kind[invitation.kind]} · ${c.invitee(invitation.invitee_name)}`}
          subtitle={[
            businessUnitNames(invitation.business_unit_ids, company.units).join(' · '),
            copy.invitationLink.validUntil(formatDateTime(invitation.expires_at)),
          ]
            .filter(Boolean)
            .join(' · ')}
        >
          <Button
            label={c.revoke}
            variant="link"
            loading={busy === invitation.id}
            onPress={() =>
              void run(
                invitation.id,
                () => revokeInvitation(carrier.client, invitation.id),
                c.revoked,
              )
            }
          />
        </Card>
      ))}
    </View>
  );
}
