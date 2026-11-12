import {
  companyRegistrationSchema,
  fiscalFieldsFor,
  mobileAuthCopy,
  mobileCompanyCopy as copy,
  mobileErrorCopy,
  pendingCompanyOf,
  PERSON_TYPES,
  PLATFORM_NAME,
  SIGN_UP_STEPS,
  type CarrierSignUpKind,
  type CompanyRegistrationValues,
  type MobileErrorKey,
  type PersonType,
} from '@transport/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { CarrierKindChoice } from '../components/carrier-kind-choice';
import { useFieldScroll } from '../components/field-scroll';
import { KeyboardBottomBar } from '../components/keyboard-bar';
import { StatePicker } from '../components/state-picker';
import {
  Button,
  ControlCell,
  FieldCell,
  Group,
  Loading,
  Notice,
  Screen,
  SectionHeader,
  Segmented,
  Steps,
} from '../components/ui';
import { validateForm, type FieldErrors } from '../lib/forms';
import {
  companyErrorField,
  companyFormValues,
  firstFieldWithError,
  isCarrierKind,
  personTypeForKind,
  signUpStepIndex,
  type CompanyFormValues,
} from '../lib/sign-up';
import { useSession } from '../providers/session';

const STEPS = SIGN_UP_STEPS.map((step) => ({ label: mobileAuthCopy.signUpSteps[step] }));

const PERSON_OPTIONS: { value: PersonType; label: string }[] = PERSON_TYPES.map((type) => ({
  value: type,
  label: type === 'moral' ? copy.personTypeMoral : copy.personTypeFisica,
}));

/** The fields of this form in the order they are on the screen. */
const FIELD_ORDER: readonly (keyof CompanyFormValues)[] = [
  'kind',
  'personType',
  'legalName',
  'rfc',
  'legalRepresentativeName',
  'fiscalStreet',
  'fiscalExteriorNumber',
  'fiscalInteriorNumber',
  'fiscalNeighborhood',
  'fiscalPostalCode',
  'fiscalMunicipality',
  'fiscalState',
  'contactName',
  'contactEmail',
  'contactPhone',
];

/** The company saved at sign-up (D42, R2), if it is a carrier's and still valid. */
function carrierPendingCompany(metadata: unknown): CompanyRegistrationValues | null {
  const pending = pendingCompanyOf(metadata);
  return pending && isCarrierKind(pending.kind) ? pending : null;
}

/**
 * Step 2 of D42 for a Gerente's account without a company (register_company,
 * G2). The sign-up (R2) saves the company in the user metadata, so once the
 * email is confirmed this screen registers it by itself and the person goes
 * on to their area. The form is for what is left: an account from before the
 * steps, or a saved company the RPC refused (e.g. a taken RFC), shown again
 * with the error on its field. The company starts "en revisión". A persona
 * física has a "Nombre fiscal" and no legal representative (D42). One group
 * per part of the form, "Guardar y continuar" the only primary, fixed at the
 * bottom.
 */
export default function CompanySetup() {
  const { session, profile, actions, refreshProfile } = useSession();
  const metadata: Record<string, unknown> = session?.user.user_metadata ?? {};
  const [pending] = useState(() => carrierPendingCompany(metadata));
  const [registering, setRegistering] = useState(pending !== null);
  const started = useRef(false);
  const initialKind = metadata.pending_company_kind;
  const kind: CarrierSignUpKind = initialKind === 'owner_operator' ? 'owner_operator' : 'carrier';
  const [values, setValues] = useState<CompanyFormValues>(() =>
    pending
      ? companyFormValues(pending)
      : {
          kind,
          personType: personTypeForKind(kind),
          legalName: '',
          rfc: '',
          fiscalStreet: '',
          fiscalExteriorNumber: '',
          fiscalInteriorNumber: '',
          fiscalNeighborhood: '',
          fiscalPostalCode: '',
          fiscalMunicipality: '',
          fiscalState: '',
          legalRepresentativeName: '',
          contactName: profile?.fullName ?? '',
          contactEmail: session?.user.email ?? '',
          contactPhone: profile?.phone ?? '',
        },
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [barHeight, setBarHeight] = useState(0);
  const { scrollRef, register, scrollTo } = useFieldScroll();

  type TextField = Exclude<keyof CompanyFormValues, 'kind' | 'personType' | 'fiscalState'>;
  const set = (field: TextField) => (text: string) =>
    setValues((current) => ({ ...current, [field]: text }));

  /** A refused registration: the error on its field when it has one, else on the form. */
  const showFailure = useCallback(
    (error: MobileErrorKey) => {
      const field = companyErrorField(error);
      if (field) {
        setErrors({ [field]: mobileErrorCopy[error] });
        scrollTo(field);
      } else {
        setFormError(mobileErrorCopy[error]);
      }
    },
    [scrollTo],
  );

  // The company of the sign-up, registered once (the screen leaves on success).
  useEffect(() => {
    if (!pending || started.current) return;
    started.current = true;
    void actions.registerPendingCompany(pending).then(async (result) => {
      if (result.ok) {
        await refreshProfile();
        return;
      }
      showFailure(result.error);
      setRegistering(false);
    });
  }, [pending, actions, refreshProfile, showFailure]);

  async function submit() {
    if (submitting) return;
    setFormError(null);
    // A persona física sends no legal representative (D42).
    const input =
      values.personType === 'fisica' ? { ...values, legalRepresentativeName: '' } : values;
    const parsed = validateForm(companyRegistrationSchema, input);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) {
      scrollTo(firstFieldWithError(parsed.errors, FIELD_ORDER));
      return;
    }
    setSubmitting(true);
    const result = await actions.registerPendingCompany(parsed.data);
    if (result.ok) await refreshProfile();
    else showFailure(result.error);
    setSubmitting(false);
  }

  if (registering) {
    return (
      <Screen title={copy.title} eyebrow={PLATFORM_NAME}>
        <Steps
          steps={STEPS}
          current={signUpStepIndex('fiscal')}
          title={mobileAuthCopy.signUpSteps.fiscal}
          labels={false}
        />
        <Loading label={copy.registering} />
      </Screen>
    );
  }

  const { legalNameLabel, withLegalRepresentative } = fiscalFieldsFor(values.personType);
  return (
    <>
      <Screen
        title={copy.title}
        eyebrow={PLATFORM_NAME}
        subtitle={copy.subtitle}
        bottom={barHeight}
        scrollRef={scrollRef}
      >
        <Steps
          steps={STEPS}
          current={signUpStepIndex('fiscal')}
          title={mobileAuthCopy.signUpSteps.fiscal}
          labels={false}
        />
        {formError ? <Notice tone="danger">{formError}</Notice> : null}
        <View ref={register('kind')}>
          <CarrierKindChoice
            label={copy.kindLabel}
            value={values.kind}
            onChange={(next) => setValues((current) => ({ ...current, kind: next }))}
            error={errors.kind}
          />
        </View>
        <Group>
          <ControlCell label={copy.personTypeLabel} error={errors.personType}>
            <Segmented
              label={copy.personTypeLabel}
              options={PERSON_OPTIONS}
              value={values.personType}
              onChange={(personType) => setValues((current) => ({ ...current, personType }))}
            />
          </ControlCell>
          <FieldCell
            label={legalNameLabel}
            value={values.legalName}
            onChangeText={set('legalName')}
            error={errors.legalName}
            inputRef={register('legalName')}
            autoComplete={values.personType === 'moral' ? 'organization' : 'name'}
          />
          <FieldCell
            label={copy.rfcLabel}
            value={values.rfc}
            onChangeText={set('rfc')}
            error={errors.rfc}
            inputRef={register('rfc')}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {withLegalRepresentative ? (
            <FieldCell
              label={copy.legalRepresentativeLabel}
              value={values.legalRepresentativeName}
              onChangeText={set('legalRepresentativeName')}
              error={errors.legalRepresentativeName}
              inputRef={register('legalRepresentativeName')}
              autoComplete="name"
            />
          ) : null}
        </Group>
        <SectionHeader title={copy.fiscalAddressTitle} />
        <Group>
          <FieldCell
            label={copy.streetLabel}
            value={values.fiscalStreet}
            onChangeText={set('fiscalStreet')}
            error={errors.fiscalStreet}
            inputRef={register('fiscalStreet')}
            autoComplete="street-address"
          />
          <FieldCell
            label={copy.exteriorNumberLabel}
            value={values.fiscalExteriorNumber}
            onChangeText={set('fiscalExteriorNumber')}
            error={errors.fiscalExteriorNumber}
            inputRef={register('fiscalExteriorNumber')}
          />
          <FieldCell
            label={copy.interiorNumberLabel}
            value={values.fiscalInteriorNumber}
            onChangeText={set('fiscalInteriorNumber')}
            error={errors.fiscalInteriorNumber}
            inputRef={register('fiscalInteriorNumber')}
          />
          <FieldCell
            label={copy.neighborhoodLabel}
            value={values.fiscalNeighborhood}
            onChangeText={set('fiscalNeighborhood')}
            error={errors.fiscalNeighborhood}
            inputRef={register('fiscalNeighborhood')}
          />
          <FieldCell
            label={copy.postalCodeLabel}
            value={values.fiscalPostalCode}
            onChangeText={set('fiscalPostalCode')}
            error={errors.fiscalPostalCode}
            inputRef={register('fiscalPostalCode')}
            keyboardType="number-pad"
            autoComplete="postal-code"
            maxLength={5}
          />
          <FieldCell
            label={copy.municipalityLabel}
            value={values.fiscalMunicipality}
            onChangeText={set('fiscalMunicipality')}
            error={errors.fiscalMunicipality}
            inputRef={register('fiscalMunicipality')}
          />
          <View ref={register('fiscalState')}>
            <StatePicker
              value={values.fiscalState}
              onChange={(fiscalState) => setValues((current) => ({ ...current, fiscalState }))}
              error={errors.fiscalState}
            />
          </View>
        </Group>
        <SectionHeader title={copy.contactTitle} />
        <Group>
          <FieldCell
            label={mobileAuthCopy.fullNameLabel}
            value={values.contactName}
            onChangeText={set('contactName')}
            error={errors.contactName}
            inputRef={register('contactName')}
            autoComplete="name"
          />
          <FieldCell
            label={mobileAuthCopy.emailLabel}
            value={values.contactEmail}
            onChangeText={set('contactEmail')}
            error={errors.contactEmail}
            inputRef={register('contactEmail')}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <FieldCell
            label={mobileAuthCopy.phoneLabel}
            value={values.contactPhone}
            onChangeText={set('contactPhone')}
            error={errors.contactPhone}
            inputRef={register('contactPhone')}
            keyboardType="phone-pad"
          />
        </Group>
        <Button
          label={mobileAuthCopy.signOut}
          variant="plain"
          onPress={() => void actions.signOut()}
        />
      </Screen>
      <KeyboardBottomBar
        action={{
          label: copy.saveAction,
          onPress: () => void submit(),
          loading: submitting,
          size: 'large',
        }}
        onHeight={setBarHeight}
      />
    </>
  );
}
