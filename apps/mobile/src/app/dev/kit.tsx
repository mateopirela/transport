import {
  appearanceCopy,
  fleetCopy,
  legalCopy,
  mobileAuthCopy,
  mobileCompanyCopy,
  mobileErrorCopy,
  mobileNavCopy,
  mobilePhoneCopy,
  mobileSystemCopy,
  MX_STATES,
  THEME_CHOICES,
  tripStatusLabels,
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
  Button,
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
  GroupLabel,
  LoadError,
  Notice,
  Pill,
  Screen,
  SearchBox,
  SectionHeader,
  Segmented,
  Skeleton,
  SwitchCell,
  TextCell,
  ValueRow,
} from '../../components/ui';
import { spacing, useTheme } from '../../theme';

const THEMES = THEME_CHOICES.map((value) => ({ value, label: appearanceCopy[value] }));

/**
 * Every piece of the kit on one screen, in the theme chosen at its top, for
 * the screenshots of the redesign (docs/plan-rediseno.md §2, U2). Only in a
 * development build: transport://dev/kit. The texts are the app's own copy.
 */
export default function KitScreen() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Kit />;
}

function Kit() {
  const { choice, setChoice } = useTheme();
  const [tab, setTab] = useState<'loads' | 'trips' | 'units' | 'home'>('loads');
  const [notify, setNotify] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<string | null>(null);
  const [kind, setKind] = useState<string>('tractor');
  const [barHeight, setBarHeight] = useState(0);
  const confirm = useRef<ConfirmSheetHandle>(null);
  const options = useRef<SheetHandle>(null);
  const picker = useRef<SheetHandle>(null);

  return (
    <>
      <Screen
        title={fleetCopy.onboarding.title}
        subtitle={fleetCopy.onboarding.subtitle}
        bottom={barHeight}
      >
        <Segmented
          label={appearanceCopy.title}
          value={choice}
          options={THEMES}
          onChange={setChoice}
        />

        <SectionHeader
          title={fleetCopy.units.title}
          action={{ label: fleetCopy.units.add, onPress: () => undefined }}
        />
        <Group inset={groupInset.icon}>
          <Cell
            icon="units"
            title="TRN-01"
            subtitle={vehicleKindLabels.tractor}
            pill={{ label: verificationStatusLabels.approved, tone: 'ok' }}
            role="link"
            onPress={() => undefined}
          />
          <Cell
            icon="units"
            title="CS53-01"
            subtitle={tripStatusLabels.in_transit}
            pill={{ label: verificationStatusLabels.pending_review, tone: 'amber' }}
            role="link"
            onPress={() => undefined}
          />
          <Cell
            icon="units"
            title="RF53-01"
            subtitle={fleetCopy.units.documentsTitle}
            pill={{ label: verificationStatusLabels.expired, tone: 'red' }}
            role="link"
            onPress={() => undefined}
          />
        </Group>
        <Footnote>{fleetCopy.availability.subtitle}</Footnote>

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

        <GroupLabel>{fleetCopy.onboarding.companyDocuments}</GroupLabel>
        <Group>
          <Cell
            title={fleetCopy.onboarding.companyDocuments}
            value={fleetCopy.onboarding.documentsProgress(3, 5)}
            role="link"
            onPress={() => undefined}
          />
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

        <Group>
          <FieldCell
            label={mobileCompanyCopy.legalNameLabel}
            placeholder={mobileCompanyCopy.legalNameLabel}
          />
          <FieldCell label={mobileCompanyCopy.rfcLabel} autoCapitalize="characters" />
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
        <Field
          label={mobilePhoneCopy.label}
          keyboardType="phone-pad"
          error={mobileErrorCopy.phoneInvalid}
        />
        <Checkbox checked={accepted} onChange={setAccepted}>
          {legalCopy.termsLink}
        </Checkbox>

        <SectionHeader title={mobileNavCopy.loads} />
        <Group>
          <ControlCell>
            <View style={styles.row}>
              <Pill label={tripStatusLabels.assigned} tone="accent" />
              <Pill label={tripStatusLabels.delivered} tone="ok" />
              <Pill label={tripStatusLabels.loading} tone="amber" />
              <Pill label={tripStatusLabels.cancelled} tone="red" />
              <Pill label={tripStatusLabels.closed} />
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

        <Button label={mobileAuthCopy.goToInvite} variant="secondary" onPress={() => undefined} />
        <Button label={mobileAuthCopy.goToSignUp} variant="plain" onPress={() => undefined} />
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
        <Button
          label={fleetCopy.documents.uploading}
          variant="secondary"
          size="small"
          loading
          onPress={() => undefined}
        />

        <Notice title={fleetCopy.units.saved} />
        <Notice tone="info" title={mobileCompanyCopy.inReviewTitle}>
          {mobileCompanyCopy.inReviewBody}
        </Notice>
        <Notice tone="warning" title={mobileCompanyCopy.expiredTitle}>
          {mobileCompanyCopy.contactSupport}
        </Notice>
        <Notice tone="danger" title={mobileCompanyCopy.rejectedTitle}>
          {mobileCompanyCopy.contactSupport}
        </Notice>
        <ErrorText>{mobileErrorCopy.network}</ErrorText>

        <Empty title={mobileNavCopy.noAssignedTrip} body={mobileNavCopy.comingSoon} />
        <Skeleton rows={2} />
        <LoadError onRetry={() => undefined} />
      </Screen>

      <BottomBar
        action={{ label: mobileAuthCopy.signInAction, onPress: () => undefined }}
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
});
