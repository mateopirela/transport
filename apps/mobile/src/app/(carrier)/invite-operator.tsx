import { managerCompanyCopy } from '@transport/shared';
import { Stack } from 'expo-router';
import { useState } from 'react';

import { ChoiceChips, Loaded } from '../../components/fleet-ui';
import { InvitationLinkIssuer } from '../../components/invitation-link';
import { Body, Field, Notice, Screen } from '../../components/ui';
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
  return (
    <Screen belowHeader>
      <Stack.Screen options={{ title: copy.inviteTitle }} />
      <Body>{copy.inviteDescription}</Body>
      <Loaded state={state} onRetry={() => void reload()}>
        {(units) => {
          const chosen = units.length === 1 ? units[0]?.id : unitId;
          if (!carrier) return null;
          if (units.length === 0) {
            return <Notice tone="info">{managerCompanyCopy.coordinators.noUnits}</Notice>;
          }
          return (
            <>
              {units.length > 1 ? (
                <ChoiceChips
                  label={copy.unitLabel}
                  options={units.map((u) => ({ value: u.id, label: u.name }))}
                  value={unitId}
                  onChange={setUnitId}
                />
              ) : null}
              <Field
                label={copy.inviteeLabel}
                value={name}
                onChangeText={setName}
                autoComplete="name"
              />
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
        }}
      </Loaded>
    </Screen>
  );
}
