import {
  carrierWebCopy,
  fleetCopy,
  formatCalendarDate,
  formatDate,
  managerCompanyCopy,
} from '@transport/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FleetNav } from '@/components/carrier/fleet-nav';
import { textLink } from '@/components/page-section';
import { buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { Table } from '@/components/ui/table';
import { carrierContext } from '@/lib/carrier/context';
import { listCarrierOperators, type OperatorSummary } from '@/lib/carrier/fleet';
import { parseFleetFlash } from '@/lib/carrier/fleet-forms';
import { carrierOperatorPath, paths } from '@/lib/routing';

const c = carrierWebCopy.fleet;

export const metadata: Metadata = { title: c.operators.title };

/** Whether the operator already uses the app, was invited or is not invited yet (D15), as a pill. */
function AccountPill({ operator }: { operator: OperatorSummary }) {
  if (operator.profile_id) return <Pill tone="ok">{fleetCopy.operators.linked}</Pill>;
  if (operator.invitation) {
    return (
      <Pill tone="accent">
        {fleetCopy.operators.invited(formatDate(operator.invitation.expires_at))}
      </Pill>
    );
  }
  return <Pill>{fleetCopy.operators.notInvited}</Pill>;
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
      <PageHeader
        title={c.title}
        description={c.operators.description}
        action={
          <>
            {isManager && (
              <Link
                href={paths.newCarrierOperator}
                className={buttonVariants({ variant: 'secondary' })}
              >
                {c.operators.add}
              </Link>
            )}
            {/* G4: the Gerente and the Coordinador invite operators by link. */}
            {units.operable.length > 0 && (
              <Link
                href={paths.inviteCarrierOperator}
                className={buttonVariants({ variant: 'primary' })}
              >
                {managerCompanyCopy.operators.invite}
              </Link>
            )}
          </>
        }
      />
      <FleetNav current="operators" />
      {flash === 'baja' && (
        <Notice tone="success" className="mb-6">
          {c.operators.archived}
        </Notice>
      )}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-title2 text-text">{c.operators.title}</h2>
        {!isManager && <p className="text-footnote text-text-dim">{c.managerOnly}</p>}
      </div>
      {operators.length === 0 ? (
        <Empty title={c.operators.empty} />
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
              <td className="font-semibold">{operator.full_name}</td>
              <td>
                <p className="tabular-nums">{operator.phone}</p>
                {operator.email && <p className="text-footnote text-text-dim">{operator.email}</p>}
              </td>
              <td className="whitespace-nowrap text-text-dim">
                {operator.license_type
                  ? c.operators.license(
                      operator.license_type,
                      operator.license_expires_on
                        ? formatCalendarDate(operator.license_expires_on)
                        : null,
                    )
                  : c.operators.noLicense}
              </td>
              <td className="text-text-dim">{operator.businessUnitName ?? ''}</td>
              <td>
                <AccountPill operator={operator} />
              </td>
              <td>
                <Link href={carrierOperatorPath(operator.id)} className={textLink}>
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
