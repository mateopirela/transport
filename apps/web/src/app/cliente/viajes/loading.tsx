import { SkeletonPage } from '@/components/ui/skeleton';

/** The trips while they load: the header and a table. */
export default function Loading() {
  return <SkeletonPage shape="list" />;
}
