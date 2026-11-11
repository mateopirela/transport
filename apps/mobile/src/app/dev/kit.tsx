import {
  appearanceCopy,
  fleetCopy,
  legalCopy,
  mobileAuthCopy,
  mobileCompanyCopy,
  mobileErrorCopy,
  mobileKitCopy,
  mobileNavCopy,
  mobilePhoneCopy,
  mobileSystemCopy,
  MX_STATES,
  PLATFORM_NAME,
  STATE_TONES,
  THEME_CHOICES,
  vehicleKindLabels,
  verificationStatusLabels,
  type ThemeChoice,
} from '@transport/shared';
import { Redirect } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ConfirmSheet,
  OptionSheet,
  PickerSheet,
  type ConfirmSheetHandle,
  type SheetHandle,
} from '../../components/sheet';
import {
  BottomBar,
  BrandBlock,
  Button,
  ButtonRow,
  Cell,
  Checkbox,
  Chip,
  ChipTabs,
  ControlCell,
  Empty,
  ErrorText,
  Field,
  FieldCell,
  Footnote,
  Group,
  groupInset,
  KpiGrid,
  KpiTile,
  LoadError,
  Money,
  Notice,
  Pill,
  Screen,
  SearchBox,
  SectionHeader,
  Segmented,
  Skeleton,
  Steps,
  SwitchCell,
  TextCell,
  ValueRow,
} from '../../components/ui';
import { spacing, useTheme } from '../../theme';

const THEMES = THEME_CHOICES.map((value) => ({ value, label: appearanceCopy[value] }));
const sample = mobileKitCopy.sample;
const STEPS = sample.steps.map((label, i) => ({ label, detail: sample.stepDetails[i] }));

/**
 * Every piece of the kit of "Fulmis" (docs/plan-fulmis.md §1) on one screen,
 * in the theme chosen at its top, for the screenshots of a PR. Only in a
 * development build: transport://dev/kit. The figures are a sample
 * (`mobileKitCopy.sample`), never data.
 */
export default function KitScreen() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Kit />;
}

function Kit() {
  const { choice, setChoice } = useTheme();
  const [tab, setTab] = useState<'loads' | 'trips' | 'units' | 'home'>('loads');
  const [notify, setNotify] = useState(true);
  const [accepted, setAccepted] = useState(true);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<string | null>(null);
  const [kind, setKind] = useState<string>('tractor');
  const [step, setStep] = useState(2);
  const [barHeight, setBarHeight] = useState(0);
  const confirm = useRef<ConfirmSheetHandle>(null);
  const options = useRef<SheetHandle>(null);
  const picker = useRef<SheetHandle>(null);

  return (
    <>
      <Screen title={sample.title} eyebrow={PLATFORM_NAME} bottom={barHeight}>
        <Segmented
          label={appearanceCopy.title}
          value={choice}
          options={THEMES}
          onChange={setChoice}
        />

        <BrandBlock
          label={sample.nextStepLabel}
          title={sample.nextStepTitle}
          body={sample.nextStepBody}
        >
          <Button
            label={sample.nextStepAction}
            size="large"
            onPress={() => setStep((current) => (current + 1) % (STEPS.length + 1))}
          />
          <ButtonRow>
            <Button
              label={sample.nextStepDirections}
              variant="secondary"
              icon="navigate"
              onPress={() => undefined}
            />
            <Button
              label={sample.nextStepReport}
              variant="secondary"
              icon="alert"
              onPress={() => undefined}
            />
          </ButtonRow>
        </BrandBlock>
        <Group>
          <Steps title={sample.stepsTitle} steps={STEPS} current={step} />
        </Group>

        <SectionHeader title={sample.piecesTitle} />
        <KpiGrid>
          {sample.kpis.map((kpi, i) => (
            <KpiTile
              key={kpi.label}
              label={kpi.label}
              value={kpi.value}
              onPress={i === 0 ? () => undefined : undefined}
            />
          ))}
        </KpiGrid>
        <Group>
          <ControlCell>
            <Money cents={sample.balanceCents} label={sample.balanceLabel} />
          </ControlCell>
          <ControlCell>
            <View style={styles.between}>
              <Money cents={sample.freightCents} size="title" label={sample.freightLabel} />
              <Pill label={sample.tones.progress} tone="progress" />
            </View>
          </ControlCell>
        </Group>

        <SectionHeader title={sample.tonesTitle} />
        <Group>
          <ControlCell>
            <View style={styles.row}>
              {STATE_TONES.map((tone) => (
                <Pill key={tone} label={sample.tones[tone]} tone={tone} />
              ))}
            </View>
          </ControlCell>
          <ControlCell label={fleetCopy.units.kindLabel}>
            <View style={styles.row}>
              <Chip label={vehicleKindLabels.tractor} selected onPress={() => undefined} />
              <Chip label={vehicleKindLabels.rigid} onPress={() => undefined} />
              <Chip label={vehicleKindLabels.trailer} onPress={() => undefined} />
            </View>
          </ControlCell>
        </Group>

        <SectionHeader title={sample.noticesTitle} />
        <Notice tone="attention" title={sample.attentionTitle}>
          {sample.attentionBody}
        </Notice>
        <Notice tone="info" title={mobileCompanyCopy.inReviewTitle}>
          {mobileCompanyCopy.inReviewBody}
        </Notice>
        <Notice tone="warning" title={mobileCompanyCopy.expiredTitle}>
          {mobileCompanyCopy.contactSupport}
        </Notice>
        <Notice tone="danger" title={mobileCompanyCopy.rejectedTitle}>
          {mobileCompanyCopy.contactSupport}
        </Notice>
        <Notice title={fleetCopy.units.saved} />
        <ErrorText>{mobileErrorCopy.network}</ErrorText>

        <SectionHeader title={sample.buttonsTitle} />
        <Button label={sample.secondary} variant="secondary" onPress={() => undefined} />
        <Button label={sample.plain} variant="plain" onPress={() => undefined} />
        <Button
          label={fleetCopy.units.archive}
          variant="destructive"
          onPress={() =>
            confirm.current?.ask({
              title: fleetCopy.units.archiveConfirmTitle,
              body: fleetCopy.units.archiveConfirmBody,
              confirmLabel: fleetCopy.units.archive,
              cancelLabel: fleetCopy.units.cancel,
              destructive: true,
              onConfirm: () => undefined,
            })
          }
        />
        <ButtonRow>
          <Button label={sample.small} variant="secondary" size="small" onPress={() => undefined} />
          <Button
            label={fleetCopy.documents.uploading}
            variant="secondary"
            size="small"
            loading
            onPress={() => undefined}
          />
        </ButtonRow>

        <SectionHeader title={sample.fieldsTitle} />
        <Group>
          <FieldCell
            label={mobileCompanyCopy.legalNameLabel}
            placeholder={mobileCompanyCopy.legalNameLabel}
          />
          <FieldCell
            label={mobilePhoneCopy.label}
            keyboardType="phone-pad"
            error={mobileErrorCopy.phoneInvalid}
          />
          <ControlCell label={mobileCompanyCopy.personTypeLabel}>
            <Segmented
              label={mobileCompanyCopy.personTypeLabel}
              value={kind}
              onChange={setKind}
              options={[
                { value: 'tractor', label: mobileCompanyCopy.personTypeMoral },
                { value: 'straight', label: mobileCompanyCopy.personTypeFisica },
              ]}
            />
          </ControlCell>
          <TextCell icon="info" tone="dim">
            {mobileCompanyCopy.legalRepresentativeHint}
          </TextCell>
        </Group>
        <Field
          label={mobileAuthCopy.emailLabel}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Checkbox checked={accepted} onChange={setAccepted}>
          {legalCopy.termsLink}
        </Checkbox>
        <ChipTabs
          label={mobileNavCopy.more}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'loads', label: mobileNavCopy.loads, count: 4 },
            { value: 'trips', label: mobileNavCopy.trips, count: 2 },
            { value: 'units', label: mobileNavCopy.units },
            { value: 'home', label: mobileNavCopy.home },
          ]}
        />
        <SearchBox label={mobileCompanyCopy.stateLabel} value={query} onChangeText={setQuery} />

        <SectionHeader
          title={sample.listsTitle}
          action={{ label: fleetCopy.units.add, onPress: () => undefined }}
        />
        <Group inset={groupInset.icon}>
          <Cell
            icon="units"
            title="TRN-01"
            subtitle={vehicleKindLabels.tractor}
            pill={{ label: verificationStatusLabels.approved, tone: 'done' }}
            role="link"
            onPress={() => undefined}
          />
          <Cell
            icon="units"
            title="CS53-01"
            subtitle={vehicleKindLabels.trailer}
            pill={{ label: verificationStatusLabels.pending_review, tone: 'pending' }}
            role="link"
            onPress={() => undefined}
          />
          <Cell
            icon="units"
            title="RF53-01"
            subtitle={fleetCopy.units.documentsTitle}
            pill={{ label: verificationStatusLabels.expired, tone: 'problem' }}
            role="link"
            onPress={() => undefined}
          />
        </Group>
        <Footnote>{fleetCopy.availability.subtitle}</Footnote>
        <Group>
          <Cell
            title={mobileCompanyCopy.stateLabel}
            value={state ?? mobileCompanyCopy.statePlaceholder}
            role="link"
            onPress={() => picker.current?.open()}
          />
          <Cell
            title={appearanceCopy.title}
            value={appearanceCopy[choice]}
            role="link"
            onPress={() => options.current?.open()}
          />
          <SwitchCell
            title={mobileSystemCopy.notificationChannel}
            value={notify}
            onChange={setNotify}
          />
          <ValueRow label={fleetCopy.onboarding.units} value={fleetCopy.onboarding.count(3)} />
          <ValueRow
            label={fleetCopy.onboarding.operators}
            value={fleetCopy.onboarding.operatorsCount(2)}
            strong
          />
        </Group>

        <SectionHeader title={sample.statesTitle} />
        <Empty title={mobileNavCopy.noAssignedTrip} body={mobileNavCopy.comingSoon} />
        <Skeleton rows={2} />
        <LoadError onRetry={() => undefined} />
      </Screen>

      <BottomBar
        action={{ label: sample.large, onPress: () => undefined, size: 'large' }}
        figure={{ label: sample.freightLabel, value: sample.kpis[3]?.value ?? '' }}
        onHeight={setBarHeight}
      />
      <ConfirmSheet ref={confirm} />
      <OptionSheet<ThemeChoice>
        ref={options}
        title={appearanceCopy.title}
        options={THEMES}
        value={choice}
        onChange={setChoice}
      />
      <PickerSheet
        ref={picker}
        title={mobileCompanyCopy.stateLabel}
        searchLabel={mobileCompanyCopy.statePlaceholder}
        none={fleetCopy.loadFailed}
        items={MX_STATES}
        keyOf={(name) => name}
        labelOf={(name) => name}
        selected={state}
        onChoose={setState}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  between: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
});
