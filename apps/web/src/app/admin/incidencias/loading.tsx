import { SkeletonPage } from '@/components/ui/skeleton';

/** A list of the admin while it loads (docs/plan-fulmis.md §1.5): its shape, pulsing. */
export default function Loading() {
  return <SkeletonPage shape="list" />;
}
