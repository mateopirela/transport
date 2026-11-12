import { SkeletonPage } from '@/components/ui/skeleton';

/** The client's start while it loads: the indicators and a table (§1.5). */
export default function Loading() {
  return <SkeletonPage shape="dashboard" />;
}
