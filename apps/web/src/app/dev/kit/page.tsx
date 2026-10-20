import {
  adminCopy,
  authCopy,
  carrierWebCopy,
  clientTripsCopy,
  errorBoundaryCopy,
  loadsCopy,
  loadStatusLabels,
  offersCopy,
  shellCopy,
  tripStatusLabels,
  uiCopy,
  verificationStatusLabels,
} from '@transport/shared';
import { FileText, Truck, UserRound } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Cell, ValueRow } from '@/components/ui/cell';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Empty } from '@/components/ui/empty';
import { Field } from '@/components/ui/field';
import { Group } from '@/components/ui/group';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Pill } from '@/components/ui/pill';
import { Search } from '@/components/ui/search';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { Table } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tag } from '@/components/ui/tag';
import { Textarea } from '@/components/ui/textarea';
import { paths } from '@/lib/routing';
import { requireAccess } from '@/lib/session';

export const metadata: Metadata = { title: 'Kit' };

const f = authCopy.fields;
const lf = loadsCopy.form;

/**
 * Every component of the web kit (U6, docs/plan-rediseno.md §1.6) in the
 * shell, for the screenshots of the PR in both themes. Development only: in
 * production it is a 404. The texts are the product's own copy.
 */
export default async function KitPage({ searchParams }: PageProps<'/dev/kit'>) {
  if (process.env.NODE_ENV === 'production') notFound();
  const viewer = await requireAccess('/dev/kit');
  const { v } = await searchParams;
  const view = v === 'trips' ? 'trips' : 'loads';
  const nav = [
    { href: '/dev/kit', label: loadsCopy.nav.home },
    { href: paths.shipperLoads, label: loadsCopy.nav.loads },
    { href: paths.shipperTrips, label: clientTripsCopy.nav },
  ];

  return (
    <AppShell area={shellCopy.shipperArea} nav={nav} viewer={viewer}>
      <PageHeader
        title={loadsCopy.list.title}
        description={loadsCopy.list.description}
        action={<Button>{loadsCopy.list.newLoad}</Button>}
      />

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-8">
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label={loadsCopy.list.title}
              value={view}
              items={[
                { value: 'loads', label: loadsCopy.nav.loads, href: '/dev/kit' },
                { value: 'trips', label: clientTripsCopy.nav, href: '/dev/kit?v=trips' },
              ]}
            />
            <Search aria-label={lf.placeSearch} placeholder={lf.placeSearch} className="flex-1" />
          </div>

          <Group label={loadsCopy.home.seeLoads} footer={lf.timeZoneHint}>
            <Cell
              href="/dev/kit"
              icon={Truck}
              title="Monterrey → Guadalajara"
              subtitle={lf.sections.cargo}
              trailing={<Pill tone="accent">{loadStatusLabels.negotiating}</Pill>}
            />
            <Cell
              href="/dev/kit"
              icon={Truck}
              title="Guadalajara → Monterrey"
              subtitle={tripStatusLabels.in_transit}
              trailing={<Pill tone="ok">{tripStatusLabels.delivered}</Pill>}
            />
            <Cell
              icon={FileText}
              title={adminCopy.nav.queue}
              subtitle={verificationStatusLabels.pending_review}
              trailing={<Pill tone="amber">{verificationStatusLabels.pending_review}</Pill>}
            />
            <Cell
              icon={UserRound}
              title={shellCopy.managerArea}
              value="$38,000"
              trailing={<Tag>{shellCopy.coordinatorArea}</Tag>}
            />
          </Group>

          <Group label={lf.sections.price}>
            <ValueRow label={lf.weightKg}>15,000</ValueRow>
            <ValueRow label={lf.cargoType}>{loadStatusLabels.published}</ValueRow>
            <Cell
              title={verificationStatusLabels.rejected}
              trailing={<Pill tone="red">{verificationStatusLabels.rejected}</Pill>}
            />
          </Group>

          <div className="flex flex-wrap gap-2">
            <Pill>{loadStatusLabels.draft}</Pill>
            <Pill tone="accent">{loadStatusLabels.published}</Pill>
            <Pill tone="ok">{loadStatusLabels.completed}</Pill>
            <Pill tone="amber">{loadStatusLabels.expired}</Pill>
            <Pill tone="red">{loadStatusLabels.cancelled}</Pill>
          </div>

          <Empty title={loadsCopy.list.empty} description={loadsCopy.home.description} />
          <SkeletonRows rows={2} />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>

        <div className="space-y-8">
          <Group label={lf.sections.route}>
            <div className="space-y-4 p-4">
              <Field label={f.email} htmlFor="kit-email" hint={f.passwordHint}>
                <Input id="kit-email" type="email" placeholder={f.email} />
              </Field>
              <Field label={lf.city} htmlFor="kit-city" error={lf.placeIncomplete}>
                <Select id="kit-city" defaultValue="" aria-invalid>
                  <option value="">{lf.cityPlaceholder}</option>
                  <option>Monterrey, Nuevo León</option>
                </Select>
              </Field>
              <Field label={lf.description} htmlFor="kit-description">
                <Textarea id="kit-description" />
              </Field>
            </div>
          </Group>

          <Notice tone="info">{authCopy.tagline}</Notice>
          <Notice tone="success">{offersCopy.actions.accepted}</Notice>
          <Notice tone="error">{errorBoundaryCopy.body}</Notice>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary">{carrierWebCopy.nav.loads}</Button>
            <Button variant="plain">{uiCopy.close}</Button>
            <Button variant="destructive">{shellCopy.signOut}</Button>
            <Button variant="secondary" loading>
              {authCopy.signIn.pending}
            </Button>
            <Button variant="secondary" size="sm">
              {loadsCopy.list.open}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">{offersCopy.actions.accept}</Button>
              </DialogTrigger>
              <DialogContent
                title={offersCopy.actions.accept}
                description={loadsCopy.home.description}
              >
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="secondary">{uiCopy.close}</Button>
                  </DialogClose>
                  <Button>{offersCopy.actions.acceptConfirm}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="secondary">{adminCopy.nav.queue}</Button>
              </SheetTrigger>
              <SheetContent title={adminCopy.nav.queue}>
                <Empty title={loadsCopy.list.empty} />
              </SheetContent>
            </Sheet>
          </div>

          <Tabs defaultValue="loads">
            <TabsList>
              <TabsTrigger value="loads">{loadsCopy.nav.loads}</TabsTrigger>
              <TabsTrigger value="trips">{clientTripsCopy.nav}</TabsTrigger>
            </TabsList>
            <TabsContent value="loads">
              <Table headers={Object.values(loadsCopy.list.columns)}>
                <tr>
                  <td>Monterrey → Guadalajara</td>
                  <td className="tabular-nums">20/10/2026</td>
                  <td>{lf.sections.unit}</td>
                  <td className="tabular-nums">$38,000</td>
                  <td>
                    <Pill tone="accent">{loadStatusLabels.published}</Pill>
                  </td>
                </tr>
              </Table>
            </TabsContent>
            <TabsContent value="trips">
              <Empty title={loadsCopy.list.empty} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppShell>
  );
}
