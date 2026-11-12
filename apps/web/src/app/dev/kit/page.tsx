import {
  adminCopy,
  authCopy,
  carrierWebCopy,
  clientTripsCopy,
  devKitCopy as k,
  loadsCopy,
  loadStatusLabels,
  navCopy,
  offersCopy,
  shellCopy,
  STATE_TONES,
  tripStatusLabels,
  uiCopy,
  verificationStatusLabels,
  type LoadStatus,
} from '@transport/shared';
import { FileText, House, Package, Plus, Route, Truck, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AppShell, type ShellNavGroup, type ShellNavItem } from '@/components/app-shell';
import { textLink } from '@/components/page-section';
import { Button } from '@/components/ui/button';
import { Cell, ValueRow } from '@/components/ui/cell';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DetailLayout, DetailRail, RailActions, RailSection } from '@/components/ui/detail-layout';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Disclosure } from '@/components/ui/disclosure';
import { Empty } from '@/components/ui/empty';
import { Field } from '@/components/ui/field';
import { Group, GroupLabel } from '@/components/ui/group';
import { Input } from '@/components/ui/input';
import { KpiGrid, KpiTile } from '@/components/ui/kpi-tile';
import { Money } from '@/components/ui/money';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { Search } from '@/components/ui/search';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { SkeletonKpis, SkeletonRows, SkeletonTable } from '@/components/ui/skeleton';
import { Steps, type Step } from '@/components/ui/steps';
import { Table, TableCell, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tag } from '@/components/ui/tag';
import { Textarea } from '@/components/ui/textarea';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';
import { loadStatusTone } from '@/lib/status-tones';

export const metadata: Metadata = { title: k.title };

const KIT = '/dev/kit';
const f = authCopy.fields;
const lf = loadsCopy.form;
const columns = loadsCopy.list.columns;

/** The sidebar of the sample: an action, a section alone and a group with its label. */
const CTA: ShellNavItem = {
  href: paths.newLoad,
  label: loadsCopy.nav.newLoad,
  icon: <Plus aria-hidden />,
};
const GROUPS: readonly ShellNavGroup[] = [
  { items: [{ href: KIT, label: loadsCopy.nav.home, icon: <House aria-hidden /> }] },
  {
    label: navCopy.groups.operation,
    items: [
      { href: paths.shipperLoads, label: loadsCopy.nav.loads, icon: <Package aria-hidden /> },
      { href: paths.shipperTrips, label: clientTripsCopy.nav, icon: <Route aria-hidden /> },
    ],
  },
];

/** The rows of the sample table: one load in each status that reads differently. */
const ROWS: readonly { route: string; cents: number; status: LoadStatus }[] = [
  { route: k.route, cents: k.priceCents, status: 'negotiating' },
  { route: k.returnRoute, cents: k.feeCents, status: 'in_progress' },
  { route: k.route, cents: k.priceCents, status: 'completed' },
  { route: k.returnRoute, cents: k.feeCents, status: 'draft' },
];

const STEPS: readonly Step[] = [
  { label: tripStatusLabels.assigned, meta: k.date, state: 'done' },
  { label: tripStatusLabels.in_transit, meta: k.date, state: 'done' },
  { label: tripStatusLabels.at_delivery, description: k.city, state: 'current' },
  { label: tripStatusLabels.delivered, state: 'upcoming' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <GroupLabel>{title}</GroupLabel>
      {children}
    </section>
  );
}

function SampleTable({ cards = false }: { cards?: boolean }) {
  return (
    <Table
      cards={cards}
      headers={[
        columns.route,
        columns.pickup,
        columns.unit,
        { label: columns.price, align: 'right' },
        columns.status,
        { label: uiCopy.actions, srOnly: true },
      ]}
    >
      {ROWS.map((row, index) => (
        <TableRow key={index}>
          <TableCell primary>{row.route}</TableCell>
          <TableCell label={columns.pickup} className="tabular-nums">
            {k.date}
          </TableCell>
          <TableCell label={columns.unit}>{lf.sections.unit}</TableCell>
          <TableCell label={columns.price} numeric>
            <Money cents={row.cents} />
          </TableCell>
          <TableCell label={columns.status}>
            <Pill tone={loadStatusTone(row.status)}>{loadStatusLabels[row.status]}</Pill>
          </TableCell>
          <TableCell action>
            <Link href={KIT} className={textLink}>
              {loadsCopy.list.open}
            </Link>
          </TableCell>
        </TableRow>
      ))}
    </Table>
  );
}

/**
 * Every piece of the web kit of "Fulmis" (docs/plan-fulmis.md §1) and every
 * tone, inside the shell, for the screenshots of the PR in both themes.
 * Development only: in production it is a 404. The texts are the product's
 * own copy and the sample data of `devKitCopy`.
 */
export default async function KitPage({ searchParams }: PageProps<'/dev/kit'>) {
  if (process.env.NODE_ENV === 'production') notFound();
  const viewer = await requireAccess(KIT);
  const { v } = await searchParams;
  const view = v === 'trips' ? 'trips' : 'loads';

  return (
    <AppShell area={shellCopy.shipperArea} groups={GROUPS} cta={CTA} viewer={viewer}>
      <PageHeader
        eyebrow={k.folio}
        title={k.title}
        description={k.description}
        status={<Pill tone="progress">{k.tones.progress}</Pill>}
        action={
          <>
            <Button variant="secondary">{carrierWebCopy.nav.loads}</Button>
            <Button>
              <Plus aria-hidden />
              {loadsCopy.list.newLoad}
            </Button>
          </>
        }
      />

      <div className="space-y-12">
        <Section title={k.sections.tones}>
          <div className="flex flex-wrap gap-2">
            {STATE_TONES.map((tone) => (
              <Pill key={tone} tone={tone}>
                {k.tones[tone]}
              </Pill>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {STATE_TONES.map((tone) => (
              <Tag key={tone} tone={tone}>
                {k.tones[tone]}
              </Tag>
            ))}
          </div>
        </Section>

        <Section title={k.sections.kpis}>
          <KpiGrid>
            <KpiTile
              attention
              href={KIT}
              label={k.kpis.toReview.label}
              value={3}
              hint={k.kpis.toReview.hint}
            />
            <KpiTile
              href={KIT}
              label={k.kpis.inTransit.label}
              value={2}
              hint={k.kpis.inTransit.hint}
            />
            <KpiTile label={k.kpis.toPay.label} cents={k.feeCents} hint={k.kpis.toPay.hint} />
            <KpiTile label={k.kpis.delivered.label} value={14} hint={k.kpis.delivered.hint} />
          </KpiGrid>
        </Section>

        <Section title={k.sections.table}>
          <SampleTable />
        </Section>

        <Section title={k.sections.tableCards}>
          <SampleTable cards />
        </Section>

        <Section title={k.sections.detail}>
          <DetailLayout
            rail={
              <DetailRail>
                <RailSection label={k.rail.status}>
                  <Pill tone="attention">{loadStatusLabels.negotiating}</Pill>
                </RailSection>
                <RailSection label={k.rail.amount}>
                  <Money cents={k.priceCents} size="numeral" />
                </RailSection>
                <RailSection label={k.rail.actions}>
                  <RailActions>
                    <Button variant="secondary">{offersCopy.actions.accept}</Button>
                    <ConfirmDialog
                      destructive
                      trigger={<Button variant="destructive">{k.confirm.trigger}</Button>}
                      title={k.confirm.title}
                      description={k.confirm.description}
                      confirmLabel={k.confirm.confirm}
                    />
                  </RailActions>
                </RailSection>
              </DetailRail>
            }
          >
            <Group label={lf.sections.cargo}>
              <ValueRow label={columns.route}>{k.route}</ValueRow>
              <ValueRow label={lf.weightKg}>{k.weight}</ValueRow>
              <ValueRow label={columns.price}>
                <Money cents={k.priceCents} />
              </ValueRow>
            </Group>
            <div className="border bg-cell p-5">
              <Steps label={k.sections.steps} steps={STEPS} />
            </div>
          </DetailLayout>
        </Section>

        <Section title={k.sections.steps}>
          <div className="overflow-x-auto border bg-cell p-5">
            <Steps label={k.sections.steps} orientation="horizontal" steps={STEPS} />
          </div>
        </Section>

        <Section title={k.sections.money}>
          <div className="flex flex-wrap items-baseline gap-x-10 gap-y-4 border bg-cell p-5">
            <Money cents={k.priceCents} size="numeral" />
            <Money cents={k.feeCents} size="title" />
            <p className="text-subhead text-text-dim">
              {columns.price}: <Money cents={k.feeCents} className="text-text" />
            </p>
          </div>
        </Section>

        <div className="grid gap-12 lg:grid-cols-2">
          <Section title={k.sections.fields}>
            <div className="space-y-4 border bg-cell p-5">
              <Field label={f.email} htmlFor="kit-email" hint={f.passwordHint}>
                <Input id="kit-email" type="email" placeholder={f.email} />
              </Field>
              <Field label={lf.city} htmlFor="kit-city" error={lf.placeIncomplete}>
                <Select id="kit-city" defaultValue="" aria-invalid>
                  <option value="">{lf.cityPlaceholder}</option>
                  <option>{k.city}</option>
                </Select>
              </Field>
              <Field label={lf.description} htmlFor="kit-description">
                <Textarea id="kit-description" />
              </Field>
              <Search aria-label={lf.placeSearch} placeholder={lf.placeSearch} />
            </div>
          </Section>

          <Section title={k.sections.notices}>
            <div className="space-y-3">
              <Notice tone="info">{k.notices.info}</Notice>
              <Notice tone="attention">{k.notices.attention}</Notice>
              <Notice tone="pending">{k.notices.pending}</Notice>
              <Notice tone="success">{k.notices.success}</Notice>
              <Notice tone="error">{k.notices.error}</Notice>
            </div>
          </Section>
        </div>

        <div className="grid gap-12 lg:grid-cols-2">
          <Section title={k.sections.buttons}>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary">{carrierWebCopy.nav.loads}</Button>
              <Button variant="plain">{uiCopy.close}</Button>
              <Button variant="destructive">{shellCopy.signOut}</Button>
              <Button variant="danger">{k.confirm.confirm}</Button>
              <Button variant="link">{loadsCopy.list.open}</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm">
                {loadsCopy.list.open}
              </Button>
              <Button variant="secondary">{loadsCopy.list.open}</Button>
              <Button variant="secondary" size="lg">
                {loadsCopy.list.open}
              </Button>
              <Button variant="secondary" loading>
                {authCopy.signIn.pending}
              </Button>
              <Button variant="secondary" disabled>
                {uiCopy.cancel}
              </Button>
            </div>
          </Section>

          <Section title={k.sections.dialogs}>
            <div className="flex flex-wrap gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="secondary">{offersCopy.actions.accept}</Button>
                </DialogTrigger>
                <DialogContent title={offersCopy.actions.accept} description={k.notices.info}>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="secondary">{uiCopy.close}</Button>
                    </DialogClose>
                    <Button>{offersCopy.actions.acceptConfirm}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <ConfirmDialog
                trigger={<Button variant="secondary">{offersCopy.actions.acceptConfirm}</Button>}
                title={offersCopy.actions.accept}
                description={k.notices.attention}
                confirmLabel={offersCopy.actions.acceptConfirm}
              />
              <ConfirmDialog
                destructive
                trigger={<Button variant="destructive">{k.confirm.trigger}</Button>}
                title={k.confirm.title}
                description={k.confirm.description}
                confirmLabel={k.confirm.confirm}
              />
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="secondary">{adminCopy.nav.queue}</Button>
                </SheetTrigger>
                <SheetContent title={adminCopy.nav.queue}>
                  <Empty variant="plain" title={k.empty.title} description={k.empty.description} />
                </SheetContent>
              </Sheet>
            </div>
          </Section>
        </div>

        <div className="grid gap-12 lg:grid-cols-2">
          <Section title={k.sections.lists}>
            <Group footer={lf.timeZoneHint}>
              <Cell
                href={KIT}
                icon={Truck}
                title={k.route}
                subtitle={lf.sections.cargo}
                trailing={<Pill tone="attention">{loadStatusLabels.negotiating}</Pill>}
              />
              <Cell
                href={KIT}
                icon={Truck}
                title={k.returnRoute}
                subtitle={tripStatusLabels.in_transit}
                trailing={<Pill tone="done">{tripStatusLabels.delivered}</Pill>}
              />
              <Cell
                icon={FileText}
                title={adminCopy.nav.queue}
                trailing={<Pill tone="pending">{verificationStatusLabels.pending_review}</Pill>}
              />
              <Cell
                icon={UserRound}
                title={shellCopy.managerArea}
                trailing={<Tag>{shellCopy.coordinatorArea}</Tag>}
              />
            </Group>
            <Disclosure look="cell" summary={offersCopy.actions.accept} tone="accent">
              <p className="text-subhead text-text-dim">{k.notices.attention}</p>
            </Disclosure>
            <Disclosure look="cell" summary={k.confirm.trigger} tone="red">
              <p className="text-subhead text-text-dim">{k.confirm.description}</p>
            </Disclosure>
          </Section>

          <Section title={k.sections.tabs}>
            <Segmented
              label={k.sections.tabs}
              value={view}
              items={[
                { value: 'loads', label: loadsCopy.nav.loads, href: KIT },
                { value: 'trips', label: clientTripsCopy.nav, href: `${KIT}?v=trips` },
              ]}
            />
            <Tabs defaultValue="loads">
              <TabsList>
                <TabsTrigger value="loads">{loadsCopy.nav.loads}</TabsTrigger>
                <TabsTrigger value="trips">{clientTripsCopy.nav}</TabsTrigger>
              </TabsList>
              <TabsContent value="loads">
                <Group>
                  <ValueRow label={columns.route}>{k.route}</ValueRow>
                  <ValueRow label={columns.pickup}>{k.date}</ValueRow>
                </Group>
              </TabsContent>
              <TabsContent value="trips">
                <Empty variant="plain" title={k.empty.title} />
              </TabsContent>
            </Tabs>
          </Section>
        </div>

        <Section title={k.sections.empties}>
          <div className="grid gap-6 lg:grid-cols-2">
            <Empty
              icon={Package}
              title={k.empty.title}
              description={k.empty.description}
              action={<Button variant="secondary">{loadsCopy.list.newLoad}</Button>}
            />
            <Empty variant="plain" title={k.empty.title} description={k.empty.description} />
          </div>
        </Section>

        <Section title={k.sections.skeletons}>
          <SkeletonKpis count={4} />
          <SkeletonTable rows={3} columns={5} />
          <SkeletonRows rows={2} />
        </Section>
      </div>
    </AppShell>
  );
}
