import {
  businessUnitNames,
  formatDateTime,
  groupByBusinessUnit,
  managerCompanyCopy,
  type BusinessUnitRef,
} from '@transport/shared';
import { Fragment, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
import { spacing, useTheme } from '../theme';
import { MultiChoiceCell } from './choice-cell';
import { InvitationLinkIssuer } from './invitation-link';
import { ConfirmSheet, type ConfirmSheetHandle } from './sheet';
import {
  Button,
  Cell,
  FieldCell,
  Footnote,
  Group,
  GroupLabel,
  Notice,
  SectionHeader,
  TextCell,
} from './ui';

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
  const notice = message ? (
    <Notice tone={message.tone === 'info' ? 'highlight' : 'danger'}>{message.text}</Notice>
  ) : null;
  return { busy, run, notice };
}

/** Asks in a sheet before a destructive write (archive, remove); the sheet goes in the section. */
function useConfirm() {
  const sheet = useRef<ConfirmSheetHandle>(null);
  function confirm(title: string, body: string, action: string, onConfirm: () => Promise<void>) {
    sheet.current?.ask({
      title,
      body,
      confirmLabel: action,
      cancelLabel: copy.businessUnits.cancel,
      destructive: true,
      onConfirm,
    });
  }
  return { confirm, sheet: <ConfirmSheet ref={sheet} /> };
}

/** The text actions of a row, side by side under it. */
function RowActions({ children, inCell = false }: { children: ReactNode; inCell?: boolean }) {
  return <View style={[styles.actions, inCell ? styles.inCell : null]}>{children}</View>;
}

const toggle = (list: readonly string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

// ---------------------------------------------------------------------------
// Business units
// ---------------------------------------------------------------------------

export function BusinessUnitsSection({ carrier, company, onChanged }: SectionProps) {
  const { type } = useTheme();
  const { busy, run, notice } = useWrite(onChanged);
  const { confirm, sheet } = useConfirm();
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
    <>
      <SectionHeader title={copy.sections.businessUnits} />
      {notice}
      <Group>
        {company.units.map((unit) =>
          renaming?.id === unit.id ? (
            <Fragment key={unit.id}>
              <FieldCell
                label={c.nameLabel}
                value={renaming.name}
                onChangeText={(text) => setRenaming({ id: unit.id, name: text })}
              />
              <RowActions>
                <Button
                  label={c.save}
                  variant="secondary"
                  size="small"
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
                <Button
                  label={c.cancel}
                  variant="plain"
                  size="small"
                  onPress={() => setRenaming(null)}
                />
              </RowActions>
            </Fragment>
          ) : (
            <Cell key={unit.id}>
              <Text style={type.headline}>{unit.name}</Text>
              <Text style={type.footnote}>{count(unit.id)}</Text>
              <RowActions inCell>
                <Button
                  label={c.rename}
                  variant="plain"
                  size="small"
                  onPress={() => setRenaming({ id: unit.id, name: unit.name })}
                />
                {company.units.length > 1 ? (
                  <Button
                    label={c.archive}
                    variant="plain"
                    size="small"
                    loading={busy === `archive-${unit.id}`}
                    onPress={() =>
                      confirm(c.archiveConfirmTitle, c.archiveConfirmBody, c.archive, () =>
                        run(
                          `archive-${unit.id}`,
                          () => archiveBusinessUnit(carrier.client, unit.id),
                          c.archived,
                        ),
                      )
                    }
                  />
                ) : null}
              </RowActions>
            </Cell>
          ),
        )}
      </Group>
      <Footnote>{c.description}</Footnote>
      <Group>
        <FieldCell
          label={c.nameLabel}
          value={name}
          onChangeText={setName}
          testID="new-business-unit"
        />
      </Group>
      <Button
        label={c.create}
        variant="secondary"
        icon="add"
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
      {sheet}
    </>
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
  const { type } = useTheme();
  const { busy, run, notice } = useWrite(onChanged);
  const { confirm, sheet } = useConfirm();
  const [editing, setEditing] = useState<string[] | null>(null);
  const c = copy.coordinators;
  const names = businessUnitNames(coordinator.unitIds, units);
  return (
    <>
      {notice}
      <Group>
        <Cell>
          <Text style={type.headline}>
            {coordinator.fullName ?? copy.invitations.invitee(null)}
          </Text>
          <Text style={type.footnote}>{names.length > 0 ? names.join(' · ') : c.noUnits}</Text>
          {editing ? null : (
            <RowActions inCell>
              <Button
                label={c.editUnits}
                variant="plain"
                size="small"
                onPress={() => setEditing(coordinator.unitIds)}
              />
              <Button
                label={c.remove}
                variant="plain"
                size="small"
                loading={busy === 'remove'}
                onPress={() =>
                  confirm(c.removeConfirmTitle, c.removeConfirmBody, c.remove, () =>
                    run(
                      'remove',
                      () => removeCoordinator(carrier.client, coordinator.id),
                      c.removed,
                    ),
                  )
                }
              />
            </RowActions>
          )}
        </Cell>
        {editing ? (
          <>
            <MultiChoiceCell
              label={c.unitsLabel}
              options={units.map((u) => ({ value: u.id, label: u.name }))}
              values={editing}
              onToggle={(id) => setEditing(toggle(editing, id))}
            />
            <RowActions>
              <Button
                label={c.saveUnits}
                variant="secondary"
                size="small"
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
                variant="plain"
                size="small"
                onPress={() => setEditing(null)}
              />
            </RowActions>
          </>
        ) : null}
      </Group>
      {sheet}
    </>
  );
}

export function CoordinatorsSection({ carrier, company, onChanged }: SectionProps) {
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const c = copy.coordinators;
  return (
    <>
      <SectionHeader title={copy.sections.coordinators} />
      {company.coordinators.length === 0 ? (
        <Group>
          <TextCell tone="dim">{c.empty}</TextCell>
        </Group>
      ) : null}
      {company.coordinators.map((coordinator) => (
        <CoordinatorCard
          key={coordinator.id}
          coordinator={coordinator}
          units={company.units}
          carrier={carrier}
          onChanged={onChanged}
        />
      ))}
      <Footnote>{c.description}</Footnote>
      <GroupLabel>{c.invite}</GroupLabel>
      <Group>
        <MultiChoiceCell
          label={c.inviteUnitsLabel}
          options={company.units.map((u) => ({ value: u.id, label: u.name }))}
          values={unitIds}
          onToggle={(id) => setUnitIds(toggle(unitIds, id))}
        />
        <FieldCell label={c.inviteeLabel} value={name} onChangeText={setName} autoComplete="name" />
      </Group>
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
    </>
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
    <>
      <SectionHeader title={kind === 'vehicles' ? copy.sections.units : copy.sections.operators} />
      {groups.map((group) => (
        <Fragment key={group.unit?.id ?? 'none'}>
          <GroupLabel>{group.unit?.name ?? copy.fleet.noBusinessUnit}</GroupLabel>
          <Group>
            {group.items.length === 0 ? (
              <TextCell tone="dim">
                {kind === 'vehicles' ? copy.fleet.unitsEmpty : copy.fleet.operatorsEmpty}
              </TextCell>
            ) : null}
            {group.items.map((row) => (
              <Cell
                key={row.id}
                role="link"
                icon={kind === 'vehicles' ? 'units' : 'person'}
                title={row.title}
                subtitle={row.subtitle}
                onPress={() => onOpen(row.id)}
              />
            ))}
          </Group>
        </Fragment>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Pending invitations
// ---------------------------------------------------------------------------

export function InvitationsSection({ carrier, company, onChanged }: SectionProps) {
  const { busy, run, notice } = useWrite(onChanged);
  const c = copy.invitations;
  return (
    <>
      <SectionHeader title={copy.sections.invitations} />
      {notice}
      <Group>
        {company.invitations.length === 0 ? <TextCell tone="dim">{c.empty}</TextCell> : null}
        {company.invitations.map((invitation) => (
          <Cell
            key={invitation.id}
            title={`${c.kind[invitation.kind]} · ${c.invitee(invitation.invitee_name)}`}
            lines={2}
            subtitle={[
              businessUnitNames(invitation.business_unit_ids, company.units).join(' · '),
              copy.invitationLink.validUntil(formatDateTime(invitation.expires_at)),
            ]
              .filter(Boolean)
              .join('\n')}
            trailing={
              <Button
                label={c.revoke}
                variant="plain"
                size="small"
                loading={busy === invitation.id}
                onPress={() =>
                  void run(
                    invitation.id,
                    () => revokeInvitation(carrier.client, invitation.id),
                    c.revoked,
                  )
                }
              />
            }
          />
        ))}
      </Group>
      <Footnote>{c.description}</Footnote>
    </>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  inCell: { paddingHorizontal: 0, paddingVertical: 0, marginLeft: -spacing.sm },
});
