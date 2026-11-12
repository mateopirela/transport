import {
  cargoTypeLabels,
  formatDateTime,
  operatorNextStepCopy as stepCopy,
  operatorTripCopy as copy,
  specialRequirementLabels,
  type IncidentFormValues,
  type StateTone,
} from '@transport/shared';
import { useImperativeHandle, useRef, type ReactNode, type Ref } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import type { NextStep, TripStop } from '../lib/next-step';
import type { OperatorTrip, TripLoad } from '../lib/trip-api';
import { lookOf, spacing, useTheme, type Look } from '../theme';
import { Sheet, type SheetHandle } from './sheet';
import { IncidentForm } from './trip-forms';
import {
  BrandBlock,
  Button,
  Caps,
  Cell,
  Group,
  Pill,
  SectionHeader,
  Steps,
  TextCell,
  ValueRow,
} from './ui';

/*
 * The pieces of the operator's trip (V7, docs/plan-fulmis.md §1.5): its
 * heading, the Night block "Tu siguiente paso" with the screen's one primary
 * and the two ways out that are always at hand ("Cómo llegar", "Reportar
 * incidencia"), the four steps of the trip, the card of the load and the
 * sheet to report an incident. "Mi viaje" of the hombre-camión is the same
 * screen, so it gets them too.
 */

const weightFormat = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

function useStyles() {
  return STYLES[useTheme().theme];
}

/** A stop of the trip: its point, its place and its window. */
function stopOf(load: TripLoad, stop: TripStop) {
  return stop === 'origin'
    ? {
        lat: load.origin_lat,
        lng: load.origin_lng,
        city: load.origin_city,
        place: stepCopy.place(load.origin_city, load.origin_state, load.origin_address),
        window: copy.pickupWindow(
          formatDateTime(load.pickup_window_start),
          formatDateTime(load.pickup_window_end),
        ),
      }
    : {
        lat: load.destination_lat,
        lng: load.destination_lng,
        city: load.destination_city,
        place: stepCopy.place(
          load.destination_city,
          load.destination_state,
          load.destination_address,
        ),
        window: copy.deliveryWindow(
          formatDateTime(load.delivery_window_start),
          formatDateTime(load.delivery_window_end),
        ),
      };
}

/** Opens Google Maps (app or web) or the system's handler on the way to a point: no API key needed. */
function openDirections(lat: number, lng: number) {
  void Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
}

/**
 * The heading of a trip's screen: a short label and the trip's state on one
 * line, the title under them, and room above for a way back (`right`).
 */
export function TripHeading({
  eyebrow,
  title,
  pill,
  right,
}: {
  eyebrow: string;
  title: string;
  pill?: { label: string; tone: StateTone } | undefined;
  right?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.heading}>
      {right ? <View style={styles.headingRight}>{right}</View> : null}
      <View style={styles.eyebrowRow}>
        <Caps style={[styles.label, styles.grow]} numberOfLines={1}>
          {eyebrow}
        </Caps>
        {pill ? <Pill label={pill.label} tone={pill.tone} /> : null}
      </View>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
    </View>
  );
}

/** A line inside the Night block, read in the Night look whatever the theme. */
function BlockLine({ children, strong = false }: { children: string; strong?: boolean }) {
  const { type } = useTheme();
  return <Text style={strong ? type.subhead : type.footnote}>{children}</Text>;
}

/**
 * "Tu siguiente paso": the step to take, where and when it happens, its button
 * (the screen's one primary, 56 high) and, always in reach, "Cómo llegar" and
 * "Reportar incidencia". `note` says why the button waits (the photos still
 * missing); `lines` are what the block says besides (who received the load).
 * Without a step (delivered) `fallback` takes the button's place.
 */
export function NextStepBlock({
  load,
  step,
  busy,
  disabled,
  note,
  lines = [],
  body,
  onStep,
  fallback,
  onReport,
}: {
  load: TripLoad;
  step: NextStep;
  busy: boolean;
  disabled: boolean;
  note?: string | undefined;
  lines?: readonly string[];
  /** In place of where the step happens (delivered: what comes next). */
  body?: string | undefined;
  onStep: () => void;
  fallback: { label: string; onPress: () => void };
  onReport: () => void;
}) {
  const styles = useStyles();
  const place = step.place ? stopOf(load, step.place) : null;
  const directions = step.directions ? stopOf(load, step.directions) : null;
  return (
    <BrandBlock
      label={stepCopy.label}
      title={step.title}
      body={body ?? place?.place}
      meta={body === undefined ? place?.window : undefined}
    >
      {lines.map((line) => (
        <BlockLine key={line} strong>
          {line}
        </BlockLine>
      ))}
      {step.action ? (
        <Button
          label={step.action}
          size="large"
          onPress={onStep}
          loading={busy}
          disabled={disabled}
        />
      ) : (
        <Button label={fallback.label} size="large" onPress={fallback.onPress} disabled={busy} />
      )}
      {note ? <BlockLine>{note}</BlockLine> : null}
      {/* One under the other: side by side, "Reportar incidencia" breaks in two lines on a
          phone. The report goes first, so it stays on the first screen of a short phone too. */}
      <View style={styles.ways}>
        <Button label={stepCopy.report} variant="secondary" icon="warning" onPress={onReport} />
        {directions ? (
          <Button
            label={stepCopy.directions}
            accessibilityLabel={copy.directionsTo(directions.city)}
            variant="secondary"
            icon="navigate"
            onPress={() => openDirections(directions.lat, directions.lng)}
          />
        ) : null}
      </View>
    </BrandBlock>
  );
}

/** "Avance del viaje": the four steps, the one in course in the accent, each with its time. */
export function TripSteps({
  progress,
  details,
}: {
  progress: number;
  details: readonly (string | undefined)[];
}) {
  return (
    <Group>
      <Steps
        title={copy.progress}
        current={progress}
        steps={stepCopy.steps.map((label, i) => ({ label, detail: details[i] }))}
      />
    </Group>
  );
}

/** One stop of the route: what it is, the place, the address and its window. */
function StopRow({
  label,
  title,
  address,
  window,
}: {
  label: string;
  title: string;
  address: string;
  window: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.stop}>
      <Caps style={styles.label}>{label}</Caps>
      <Text style={styles.headline}>{title}</Text>
      <Text style={styles.dim}>{address}</Text>
      <Text style={styles.window}>{window}</Text>
    </View>
  );
}

/** The load: what is carried and the shipper's instructions, then the route with its windows. */
export function LoadSection({ trip }: { trip: OperatorTrip }) {
  const styles = useStyles();
  const { load } = trip;
  const requirements = load.special_requirements.map((r) => specialRequirementLabels[r]);
  const origin = stopOf(load, 'origin');
  const destination = stopOf(load, 'destination');
  return (
    <>
      <View style={styles.section}>
        <SectionHeader title={copy.instructions} />
        <Group>
          <Cell
            strong
            title={cargoTypeLabels[load.cargo_type]}
            subtitle={load.description}
            subtitleLines={0}
          />
          <ValueRow
            label={stepCopy.weightLabel}
            value={stepCopy.kilograms(weightFormat.format(load.weight_kg))}
          />
          {trip.vehiclePlate ? (
            <ValueRow label={stepCopy.unitLabel} value={trip.vehiclePlate} />
          ) : null}
          {/* A list that can be long: the label over it and every line of it (a value row would clip it). */}
          {requirements.length > 0 ? (
            <Cell
              title={stepCopy.requirementsLabel}
              subtitle={requirements.join(', ')}
              subtitleLines={0}
            />
          ) : null}
          {load.notes ? <TextCell tone="dim">{copy.notes(load.notes)}</TextCell> : null}
        </Group>
      </View>
      <View style={styles.section}>
        <SectionHeader title={stepCopy.route} />
        <Group>
          <StopRow
            label={copy.origin}
            title={`${load.origin_city}, ${load.origin_state}`}
            address={load.origin_address}
            window={origin.window}
          />
          <StopRow
            label={copy.destination}
            title={`${load.destination_city}, ${load.destination_state}`}
            address={load.destination_address}
            window={destination.window}
          />
        </Group>
      </View>
    </>
  );
}

export interface IncidentSheetHandle {
  open: () => void;
}

/**
 * "Reportar incidencia" in a sheet, one tap from the top of the trip: the
 * kind and what happened. `onSubmit` queues it (F7); the sheet closes once it
 * is saved on the phone, and `onSent` takes the person to the list.
 */
export function IncidentSheet({
  ref,
  busy,
  onSubmit,
  onSent,
}: {
  ref: Ref<IncidentSheetHandle>;
  busy: boolean;
  onSubmit: (values: IncidentFormValues) => Promise<boolean>;
  onSent: () => void;
}) {
  const sheet = useRef<SheetHandle>(null);
  useImperativeHandle(ref, () => ({ open: () => sheet.current?.open() }), []);
  return (
    <Sheet ref={sheet} title={copy.reportIncident}>
      <IncidentForm
        inSheet
        busy={busy}
        onSubmit={async (values) => {
          const saved = await onSubmit(values);
          if (saved) {
            sheet.current?.close();
            onSent();
          }
          return saved;
        }}
      />
    </Sheet>
  );
}

function makeStyles({ colors, type }: Look) {
  return StyleSheet.create({
    grow: { flex: 1 },
    section: { gap: spacing.sm + spacing.xs },
    heading: { gap: spacing.xs, marginBottom: spacing.xs },
    headingRight: { flexDirection: 'row', justifyContent: 'flex-start' },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    label: type.label,
    title: type.title1,
    headline: type.headline,
    dim: { ...type.subhead, color: colors.textDim },
    window: { ...type.footnote, ...type.num },
    ways: { gap: spacing.sm },
    stop: {
      gap: spacing.xs / 2,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + spacing.xs,
    },
  });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
