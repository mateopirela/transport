import { fleetCopy } from '@transport/shared';
import { Stack } from 'expo-router';

import { DocumentList } from '../../components/document-list';
import { Loaded } from '../../components/fleet-ui';
import { Body, Screen } from '../../components/ui';
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
      <Body>{fleetCopy.documents.subtitle}</Body>
      <Loaded state={state} onRetry={() => void reload()}>
        {(context) =>
          carrier ? (
            <DocumentList
              client={carrier.client}
              context={context}
              owner={{ type: 'company', id: carrier.companyId }}
              onChanged={reload}
            />
          ) : null
        }
      </Loaded>
    </Screen>
  );
}
