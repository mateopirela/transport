import { mobileAuthCopy } from '@transport/shared';

import { Loading } from '../components/ui';

/** Entry point: the root layout immediately redirects to the user's area. */
export default function Index() {
  return <Loading label={mobileAuthCopy.loading} />;
}
