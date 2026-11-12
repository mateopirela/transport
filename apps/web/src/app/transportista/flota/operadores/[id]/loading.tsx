import { SkeletonPage } from '@/components/ui/skeleton';

/** While the page loads (docs/plan-fulmis.md §1.5): its shape, pulsing. */
export default function Loading() {
  return <SkeletonPage shape="detail" />;
}
