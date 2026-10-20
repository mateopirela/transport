import { loadsCopy } from '@transport/shared';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { LoadForm } from '@/components/loads/load-form';
import { PageHeader } from '@/components/ui/page-header';
import { loadToFormValues } from '@/lib/loads/form';
import { getCompanyLoad, serverRoadFactor, shipperContext } from '@/lib/loads/queries';
import { shipperLoadActions } from '@/lib/loads/status';
import { editLoadPath, loadPath } from '@/lib/routing';

const c = loadsCopy.form;

export const metadata: Metadata = { title: c.editTitle };

export default async function EditLoadPage({ params }: PageProps<'/cliente/cargas/[id]/editar'>) {
  const { id } = await params;
  const { supabase, companyId } = await shipperContext(editLoadPath(id));
  const load = await getCompanyLoad(supabase, companyId, id);
  if (!load) notFound();
  // Contracted or closed loads are read-only (update_load refuses them too).
  if (!shipperLoadActions(load.status).edit) redirect(loadPath(load.id));
  return (
    <>
      <PageHeader title={c.editTitle} description={c.editDescription} />
      <LoadForm
        loadId={load.id}
        initialValues={loadToFormValues(load)}
        roadFactor={serverRoadFactor()}
      />
    </>
  );
}
