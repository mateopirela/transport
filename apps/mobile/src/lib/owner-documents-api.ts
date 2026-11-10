import type { FiscalAddress, Tables } from '@transport/shared';

import { loadCompanyContext, type CompanyContext } from './fleet-api';
import type { Supabase } from './supabase';

// "Mis documentos" of a hombre-camión (I2, D16-E2): the company's documents,
// the personal ones of the operator row linked to the Gerente (D13) and each
// truck's, in one screen. The catalog and the uploads are the fleet's own
// (B18, G3); this only gathers the three owners. RLS limits every query to
// the caller's company.

export interface OwnerDocuments {
  context: CompanyContext;
  fiscal: FiscalAddress & Pick<Tables<'companies'>, 'legal_name' | 'rfc'>;
  /** The operator row of the Gerente, or null if it is missing (support fixes it). */
  operatorId: string | null;
  vehicles: Pick<Tables<'vehicles'>, 'id' | 'plate' | 'fleet_number'>[];
}

function check<T>({ data, error }: { data: T; error: unknown }): NonNullable<T> {
  if (error) throw error;
  if (data === null || data === undefined) throw new Error('empty response');
  return data;
}

export async function loadOwnerDocuments(
  client: Supabase,
  companyId: string,
  userId: string,
): Promise<OwnerDocuments> {
  const [context, fiscal, operator, vehicles] = await Promise.all([
    loadCompanyContext(client, companyId),
    client
      .from('companies')
      .select(
        'legal_name, rfc, fiscal_street, fiscal_exterior_number, fiscal_interior_number, fiscal_neighborhood, fiscal_postal_code, fiscal_municipality, fiscal_state',
      )
      .eq('id', companyId)
      .single(),
    client
      .from('operators')
      .select('id')
      .eq('company_id', companyId)
      .eq('profile_id', userId)
      .is('archived_at', null)
      .maybeSingle(),
    client
      .from('vehicles')
      .select('id, plate, fleet_number')
      .eq('company_id', companyId)
      .is('archived_at', null)
      .order('created_at'),
  ]);
  if (operator.error) throw operator.error;
  return {
    context,
    fiscal: check(fiscal),
    operatorId: operator.data?.id ?? null,
    vehicles: check(vehicles),
  };
}
