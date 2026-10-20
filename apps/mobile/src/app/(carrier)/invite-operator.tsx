import { managerCompanyCopy } from '@transport/shared';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { ChoiceCell } from '../../components/choice-cell';
import { InvitationLinkIssuer } from '../../components/invitation-link';
import {
  FieldCell,
  Footnote,
  Group,
  LoadError,
  Notice,
  Screen,
  Skeleton,
} from '../../components/ui';
import { issueInvitation, listOperableBusinessUnits } from '../../lib/company-api';
import { useCarrierData, type CarrierContext } from '../../lib/use-carrier';

const copy = managerCompanyCopy.operators;

const loadUnits = ({ client, companyId }: CarrierContext) =>
  listOperableBusinessUnits(client, companyId);

/**
 * "Invitar operador" (G4): the Gerente or a Coordinador issues a link for a
 * new operator of one of the business units they operate (only those are
 * offered; create_invitation checks it again). The operator brings their
 * own name, phone and password (G2).
 */
export default function InviteOperator() {
  const { carrier, state, reload } = useCarrierData(loadUnits);
  const [unitId, setUnitId] = useState<string | undefined>();
  const [name, setName] = useState('');

  let content = null;
  if (state.status === 'loading') content = <Skeleton rows={2} />;
  else if (state.status === 'error') content = <LoadError onRetry={() => void reload()} />;
  else if (carrier) {
    const units = state.data;
    const chosen = units.length === 1 ? units[0]?.id : unitId;
    content =
      units.length === 0 ? (
        <Notice tone="info">{managerCompanyCopy.coordinators.noUnits}</Notice>
      ) : (
        <>
          <Group>
            {units.length > 1 ? (
              <ChoiceCell
                label={copy.unitLabel}
                options={units.map((u) => ({ value: u.id, label: u.name }))}
                value={unitId}
                onChange={(next) => {
                  if (next) setUnitId(next);
                }}
              />
            ) : null}
            <FieldCell
              label={copy.inviteeLabel}
              value={name}
              onChangeText={setName}
              autoComplete="name"
            />
          </Group>
          <Footnote>{copy.inviteDescription}</Footnote>
          <InvitationLinkIssuer
            label={copy.invite}
            disabled={!chosen}
            issue={() =>
              issueInvitation(carrier.client, {
                kind: 'operator',
                unitId: chosen ?? '',
                inviteeName: name,
              })
            }
            shareMessage={(link) =>
              managerCompanyCopy.invitationLink.operatorShareMessage(carrier.companyName, link)
            }
          />
        </>
      );
  }

  return (
    <Screen belowHeader>
      <Stack.Screen options={{ title: copy.inviteTitle }} />
      {content}
    </Screen>
  );
}
