import { loadsCopy } from '@transport/shared';
import type { Metadata } from 'next';

import { LoadForm } from '@/components/loads/load-form';
import { PageHeader } from '@/components/ui/page-header';
import { serverRoadFactor, shipperContext } from '@/lib/loads/queries';
import { paths } from '@/lib/routing';

const c = loadsCopy.form;

export const metadata: Metadata = { title: c.newTitle };

export default async function NewLoadPage() {
  await shipperContext(paths.newLoad);
  return (
    <>
      <PageHeader title={c.newTitle} description={c.newDescription} />
      <LoadForm roadFactor={serverRoadFactor()} />
    </>
  );
}
