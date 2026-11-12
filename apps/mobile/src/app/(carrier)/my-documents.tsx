import {
  fiscalAddressLine,
  fleetCopy,
  ownerOperatorDocumentsCopy as copy,
  unitLabel,
} from '@transport/shared';
import { Stack } from 'expo-router';
import { Fragment, useCallback } from 'react';
import { Text } from 'react-native';

import { DocumentList } from '../../components/document-list';
import {
  Caps,
  Cell,
  Footnote,
  Group,
  LoadError,
  Notice,
  Screen,
  SectionHeader,
  Skeleton,
} from '../../components/ui';
import { loadOwnerDocuments } from '../../lib/owner-documents-api';
import { useCarrierData, type CarrierContext } from '../../lib/use-carrier';
import { useSession } from '../../providers/session';
import { useTheme } from '../../theme';

/**
 * "Mis documentos" of a hombre-camión (I2, D16-E2): in one screen, the
 * company's (its fiscal data and documents), the personal ones (official id
 * and license, as the operator row linked to the Gerente) and each truck's.
 * The uploads are the fleet's own (DocumentList).
 */
export default function MyDocuments() {
  const { session } = useSession();
  const { type } = useTheme();
  const userId = session?.user.id ?? null;
  const load = useCallback(
    ({ client, companyId }: CarrierContext) =>
      userId ? loadOwnerDocuments(client, companyId, userId) : new Promise<never>(() => undefined),
    [userId],
  );
  const { carrier, state, reload } = useCarrierData(load);

  return (
    <Screen belowHeader>
      <Stack.Screen options={{ title: copy.title }} />
      <Footnote>{copy.subtitle}</Footnote>
      {state.status === 'loading' ? (
        <Skeleton />
      ) : state.status === 'error' ? (
        <LoadError onRetry={() => void reload()} />
      ) : carrier ? (
        <>
          <SectionHeader title={copy.groups.company} />
          <Group>
            {(
              [
                [copy.fiscal.legalName, state.data.fiscal.legal_name],
                [copy.fiscal.rfc, state.data.fiscal.rfc],
                [copy.fiscal.address, fiscalAddressLine(state.data.fiscal) || '—'],
              ] as const
            ).map(([label, value]) => (
              <Cell key={label}>
                <Caps style={type.label}>{label}</Caps>
                <Text style={type.body}>{value}</Text>
              </Cell>
            ))}
          </Group>
          <DocumentList
            client={carrier.client}
            context={state.data.context}
            owner={{ type: 'company', id: carrier.companyId }}
            onChanged={reload}
            readOnly={!carrier.isManager}
          />

          <SectionHeader title={copy.groups.personal} />
          {state.data.operatorId ? (
            <DocumentList
              client={carrier.client}
              context={state.data.context}
              owner={{ type: 'operator', id: state.data.operatorId }}
              onChanged={reload}
              readOnly={!carrier.isManager}
            />
          ) : (
            <Notice tone="warning">{copy.noOperator}</Notice>
          )}

          {state.data.vehicles.length === 0 ? (
            <>
              <SectionHeader title={fleetCopy.units.title} />
              <Footnote>{copy.noVehicles}</Footnote>
            </>
          ) : (
            state.data.vehicles.map((vehicle) => (
              <Fragment key={vehicle.id}>
                <SectionHeader title={copy.groups.vehicle(unitLabel(vehicle))} />
                <DocumentList
                  client={carrier.client}
                  context={state.data.context}
                  owner={{ type: 'vehicle', id: vehicle.id }}
                  onChanged={reload}
                  readOnly={!carrier.isManager}
                />
              </Fragment>
            ))
          )}
          <Footnote>{fleetCopy.documents.subtitle}</Footnote>
        </>
      ) : null}
    </Screen>
  );
}
