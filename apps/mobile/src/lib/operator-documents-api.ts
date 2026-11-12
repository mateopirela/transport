import { loadCompanyContext, type CompanyContext } from './fleet-api';
import type { Supabase } from './supabase';

// "Mis documentos" of the operator (R3): the catalog, their own documents and
// their operator row. RLS lets an operator read only the documents of their
// own active row (documents_select_own_operator) and their company's name
// and type, so the fleet's loader gives just theirs.

export interface OperatorDocuments {
  context: CompanyContext;
  /** The operator's active row, or null when it was archived or is missing. */
  operatorId: string | null;
}

export async function loadOperatorDocuments(
  client: Supabase,
  companyId: string,
  userId: string,
): Promise<OperatorDocuments> {
  const [context, operator] = await Promise.all([
    loadCompanyContext(client, companyId),
    client
      .from('operators')
      .select('id')
      .eq('company_id', companyId)
      .eq('profile_id', userId)
      .is('archived_at', null)
      .maybeSingle(),
  ]);
  if (operator.error) throw operator.error;
  return { context, operatorId: operator.data?.id ?? null };
}
