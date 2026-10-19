import { carrierWebCopy, fleetCopy, formatCalendarDate, formatDate } from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeading } from '@/components/app-shell';
import { Notice } from '@/components/auth-forms';
import { FleetNav } from '@/components/carrier/fleet-nav';
import { buttonVariants } from '@/components/ui/button';
import { Table } from '@/components/ui/table';
import { carrierContext } from '@/lib/carrier/context';
import { listCarrierOperators, type OperatorSummary } from '@/lib/carrier/fleet';
import { parseFleetFlash } from '@/lib/carrier/fleet-forms';
import { carrierOperatorPath, paths } from '@/lib/routing';

const c = carrierWebCopy.fleet;

export const metadata: Metadata = { title: c.operators.title };

/** Whether the operator already uses the app, was invited or is not invited yet (D15). */
function accountLabel(operator: OperatorSummary): string {
  if (operator.profile_id) return fleetCopy.operators.linked;
  if (operator.invitation) {
    return fleetCopy.operators.invited(formatDate(operator.invitation.expires_at));
  }
  return fleetCopy.operators.notInvited;
}

/** The operators of the selected business units with their license and account (G10b; B18 on the app). */
export default async function CarrierOperatorsPage({
  searchParams,
}: PageProps<'/transportista/flota/operadores'>) {
  const { supabase, companyId, isManager, units } = await carrierContext(paths.carrierOperators);
  const flash = parseFleetFlash((await searchParams).aviso);
  const operators = await listCarrierOperators(supabase, companyId, units.ids);

  return (
    <>
      <PageHeading title={c.title} description={c.operators.description} />
      <FleetNav current="operators" />
      {flash === 'baja' && (
        <div className="mb-4">
          <Notice tone="success">{c.operators.archived}</Notice>
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl">{c.operators.title}</h2>
        {isManager ? (
          <Link href={paths.newCarrierOperator} className={buttonVariants({ variant: 'accent' })}>
            {c.operators.add}
          </Link>
        ) : (
          <p className="text-xs text-muted-foreground">{c.managerOnly}</p>
        )}
      </div>
      {operators.length === 0 ? (
        <p className="text-sm text-muted-foreground">{c.operators.empty}</p>
      ) : (
        <Table
          headers={[
            c.operators.columns.name,
            c.operators.columns.contact,
            c.operators.columns.license,
            c.operators.columns.businessUnit,
            c.operators.columns.account,
            c.operators.columns.actions,
          ]}
        >
          {operators.map((operator) => (
            <tr key={operator.id}>
              <td className="font-medium">{operator.full_name}</td>
              <td className="text-sm">
                {operator.email}
                {operator.phone && (
                  <p className="text-xs text-muted-foreground">{operator.phone}</p>
                )}
              </td>
              <td className="text-sm whitespace-nowrap">
                {operator.license_type
                  ? c.operators.license(
                      operator.license_type,
                      operator.license_expires_on
                        ? formatCalendarDate(operator.license_expires_on)
                        : null,
                    )
                  : c.operators.noLicense}
              </td>
              <td>{operator.businessUnitName ?? ''}</td>
              <td className="text-sm">{accountLabel(operator)}</td>
              <td>
                <Link
                  href={carrierOperatorPath(operator.id)}
                  className="text-accent hover:underline"
                >
                  {c.operators.open}
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
