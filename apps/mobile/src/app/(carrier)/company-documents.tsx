import { fleetCopy } from '@transport/shared';
import { Stack } from 'expo-router';

import { DocumentList } from '../../components/document-list';
import { Footnote, LoadError, Screen, Skeleton } from '../../components/ui';
import { loadCompanyContext } from '../../lib/fleet-api';
import { useCarrierData, type CarrierContext } from '../../lib/use-carrier';

const loadContext = ({ client, companyId }: CarrierContext) =>
  loadCompanyContext(client, companyId);

/** Company documents of the carrier (B18 onboarding wizard). */
export default function CompanyDocuments() {
  const { carrier, state, reload } = useCarrierData(loadContext);
  return (
    <Screen belowHeader>
      <Stack.Screen options={{ title: fleetCopy.documents.companyTitle }} />
      {state.status === 'loading' ? (
        <Skeleton />
      ) : state.status === 'error' ? (
        <LoadError onRetry={() => void reload()} />
      ) : carrier ? (
        <DocumentList
          client={carrier.client}
          context={state.data}
          owner={{ type: 'company', id: carrier.companyId }}
          onChanged={reload}
          readOnly={!carrier.isManager}
        />
      ) : null}
      <Footnote>
        {carrier && !carrier.isManager
          ? fleetCopy.documents.readOnlySubtitle
          : fleetCopy.documents.subtitle}
      </Footnote>
    </Screen>
  );
}
