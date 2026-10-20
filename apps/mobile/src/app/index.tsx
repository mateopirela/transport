import { mobileAuthCopy } from '@transport/shared';

import { Loading, Screen } from '../components/ui';

/** Entry point: the root layout immediately redirects to the user's area. */
export default function Index() {
  return (
    <Screen>
      <Loading label={mobileAuthCopy.loading} />
    </Screen>
  );
}
