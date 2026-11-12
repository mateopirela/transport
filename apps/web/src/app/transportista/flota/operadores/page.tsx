import {
  carrierWebCopy,
  fleetCopy,
  formatCalendarDate,
  formatDate,
  managerCompanyCopy,
} from '@transport/shared';
import { Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { FleetNav } from '@/components/carrier/fleet-nav';
import { textLink } from '@/components/page-section';
import { buttonVariants } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { carrierContext } from '@/lib/carrier/context';
import { listCarrierOperators, type OperatorSummary } from '@/lib/carrier/fleet';
import { parseFleetFlash } from '@/lib/carrier/fleet-forms';
import { carrierOperatorPath, paths } from '@/lib/routing';

const c = carrierWebCopy.fleet;

export const metadata: Metadata = { title: c.operators.title };

/** Whether the operator already uses the app, was invited or is not invited yet (D15), as a pill. */
function AccountPill({ operator }: { operator: OperatorSummary }) {
  if (operator.profile_id) return <Pill tone="done">{fleetCopy.operators.linked}</Pill>;
  if (operator.invitation) {
    return (
      <Pill tone="pending">
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <FleetNav current="operators" />
        {!isManager && <p className="text-footnote text-text-dim">{c.managerOnly}</p>}
      </div>
      {flash === 'baja' && (
        <Notice tone="success" className="mb-6">
          {c.operators.archived}
        </Notice>
      )}
      {operators.length === 0 ? (
        <Empty icon={Users} title={c.operators.empty} />
      ) : (
        <Table
          cards
          headers={[
            c.operators.columns.name,
            c.operators.columns.contact,
            c.operators.columns.license,
            c.operators.columns.businessUnit,
            c.operators.columns.account,
            { label: c.operators.open, srOnly: true },
          ]}
        >
          {operators.map((operator) => (
            <TableRow key={operator.id}>
              <TableCell primary>{operator.full_name}</TableCell>
              <TableCell label={c.operators.columns.contact}>
                <span className="block text-meta">{operator.phone}</span>
                {operator.email && (
                  <span className="block text-footnote text-text-dim">{operator.email}</span>
                )}
              </TableCell>
              <TableCell label={c.operators.columns.license} className="text-text-dim">
                {operator.license_type
                  ? c.operators.license(
                      operator.license_type,
                      operator.license_expires_on
                        ? formatCalendarDate(operator.license_expires_on)
                        : null,
                    )
                  : c.operators.noLicense}
              </TableCell>
              <TableCell label={c.operators.columns.businessUnit} className="text-text-dim">
                {operator.businessUnitName ?? ''}
              </TableCell>
              <TableCell label={c.operators.columns.account}>
                <AccountPill operator={operator} />
              </TableCell>
              <TableCell action>
                <Link href={carrierOperatorPath(operator.id)} className={textLink}>
                  {c.operators.open}
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </Table>
      )}
    </>
  );
}
