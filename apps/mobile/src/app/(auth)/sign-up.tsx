import {
  firstSignUpStepWithError,
  fiscalFieldsFor,
  mobileAuthCopy as copy,
  mobileCompanyCopy,
  mobileErrorCopy,
  PERSON_TYPES,
  PLATFORM_NAME,
  registrationAccountStepSchema,
  registrationSignUpSchema,
  SIGN_UP_STEPS,
  type CarrierSignUpKind,
  type PersonType,
  type SignUpFormStep,
} from '@transport/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CarrierKindChoice } from '../../components/carrier-kind-choice';
import { CheckEmail } from '../../components/check-email';
import { useFieldScroll } from '../../components/field-scroll';
import { InvitationEntry } from '../../components/invitation-entry';
import { KeyboardBottomBar } from '../../components/keyboard-bar';
import { TermsCheckbox } from '../../components/legal-links';
import { StatePicker } from '../../components/state-picker';
import {
  Button,
  ControlCell,
  FieldCell,
  Group,
  Notice,
  Screen,
  SectionHeader,
  Segmented,
  Steps,
} from '../../components/ui';
import { validateForm, type FieldErrors } from '../../lib/forms';
import {
  EMPTY_SIGN_UP,
  firstFieldWithError,
  personTypeForKind,
  signUpErrorField,
  signUpInput,
  signUpStepIndex,
  type SignUpFormValues,
} from '../../lib/sign-up';
import { useSession } from '../../providers/session';
import { spacing } from '../../theme';

const STEPS = SIGN_UP_STEPS.map((step) => ({ label: copy.signUpSteps[step] }));

const PERSON_OPTIONS: { value: PersonType; label: string }[] = PERSON_TYPES.map((type) => ({
  value: type,
  label: type === 'moral' ? mobileCompanyCopy.personTypeMoral : mobileCompanyCopy.personTypeFisica,
}));

type TextField = {
  [K in keyof SignUpFormValues]: SignUpFormValues[K] extends string ? K : never;
}[keyof SignUpFormValues];

/**
 * Carrier sign-up in the two first steps of D42 (R2): (1) what is
 * registered and the account, (2) the company's fiscal data, its address and
 * the terms. Documents, the profile's own data and the verification come
 * once the account exists (R3). Everything lives in this component's state,
 * passwords included, and nothing is stored: step 1 stays mounted while
 * step 2 shows, so "Regresar" finds it as it was and the phone's password
 * manager sees the username and the new password when the account is
 * created. The company travels in the sign-up's metadata and is registered
 * once the email is confirmed (company.tsx). Each error goes on its field,
 * and the form goes back to the step that has it and scrolls to it.
 */
export default function SignUp() {
  const { actions } = useSession();
  const router = useRouter();
  const [step, setStep] = useState<SignUpFormStep>('account');
  const [values, setValues] = useState<SignUpFormValues>(EMPTY_SIGN_UP);
  const [personTypeChosen, setPersonTypeChosen] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [barHeight, setBarHeight] = useState(0);
  const { scrollRef, register, scrollTo } = useFieldScroll();

  const set = (field: TextField) => (text: string) =>
    setValues((current) => ({ ...current, [field]: text }));

  function chooseKind(kind: CarrierSignUpKind) {
    setValues((current) => ({
      ...current,
      kind,
      // Until the person picks one, the person type follows the kind.
      personType: personTypeChosen ? current.personType : personTypeForKind(kind),
    }));
  }

  /** Shows the step that has the first error, on its field. */
  function showErrors(next: FieldErrors) {
    setErrors(next);
    const target = firstSignUpStepWithError(next as Record<string, string>);
    if (target) setStep(target);
    scrollTo(firstFieldWithError(next));
  }

  function next() {
    setFormError(null);
    const parsed = validateForm(registrationAccountStepSchema, values);
    if (!parsed.ok) {
      showErrors(parsed.errors);
      return;
    }
    setErrors({});
    setStep('fiscal');
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function back() {
    setFormError(null);
    setStep('account');
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  async function submit() {
    if (submitting) return;
    setFormError(null);
    const parsed = validateForm(registrationSignUpSchema, signUpInput(values));
    if (!parsed.ok) {
      showErrors(parsed.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const result = await actions.signUpCarrier({ ...parsed.data, kind: values.kind });
    setSubmitting(false);
    if (result.ok) {
      if (result.value === 'check_email') setSentTo(parsed.data.email);
      // Signed in already (no email confirmation): the root layout goes on.
      return;
    }
    const field = signUpErrorField(result.error);
    if (field) {
      // Back to the step of the field (step 1 for a taken email), on the field.
      showErrors({ [field]: mobileErrorCopy[result.error] });
    } else {
      setFormError(mobileErrorCopy[result.error]);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }

  if (sentTo) return <CheckEmail email={sentTo} />;

  const onAccount = step === 'account';
  const { legalNameLabel, withLegalRepresentative } = fiscalFieldsFor(values.personType);
  return (
    <>
      <Screen
        title={copy.signUpTitle}
        eyebrow={PLATFORM_NAME}
        subtitle={copy.signUpSubtitle}
        bottom={barHeight}
        scrollRef={scrollRef}
      >
        <Steps steps={STEPS} current={signUpStepIndex(step)} title={copy.signUpStepsLabel} />
        {formError ? <Notice tone="danger">{formError}</Notice> : null}
        {/* Step 1 stays mounted under step 2 (see above). */}
        <View style={onAccount ? styles.step : styles.hidden}>
          <View ref={register('kind')}>
            <CarrierKindChoice value={values.kind} onChange={chooseKind} error={errors.kind} />
          </View>
          <InvitationEntry />
          <Group>
            <FieldCell
              label={copy.fullNameLabel}
              value={values.fullName}
              onChangeText={set('fullName')}
              error={errors.fullName}
              inputRef={register('fullName')}
              autoComplete="name"
              textContentType="name"
            />
            <FieldCell
              label={copy.phoneLabel}
              value={values.phone}
              onChangeText={set('phone')}
              error={errors.phone}
              inputRef={register('phone')}
              autoComplete="tel"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
            />
            <FieldCell
              label={copy.emailLabel}
              value={values.email}
              onChangeText={set('email')}
              error={errors.email}
              inputRef={register('email')}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              keyboardType="email-address"
              textContentType="username"
            />
          </Group>
          <Group>
            <FieldCell
              label={copy.passwordLabel}
              value={values.password}
              onChangeText={set('password')}
              error={errors.password}
              inputRef={register('password')}
              secureTextEntry
              revealable
              autoComplete="new-password"
              textContentType="newPassword"
            />
            <FieldCell
              label={copy.passwordConfirmLabel}
              value={values.passwordConfirmation}
              onChangeText={set('passwordConfirmation')}
              error={errors.passwordConfirmation}
              inputRef={register('passwordConfirmation')}
              secureTextEntry
              revealable
              autoComplete="new-password"
              textContentType="newPassword"
            />
          </Group>
          <Button
            label={copy.goToSignIn}
            variant="plain"
            onPress={() => router.replace('/sign-in')}
          />
        </View>
        {onAccount ? null : (
          <View style={styles.step}>
            <SectionHeader title={copy.signUpSteps.fiscal} />
            <Group>
              <ControlCell label={mobileCompanyCopy.personTypeLabel} error={errors.personType}>
                <Segmented
                  label={mobileCompanyCopy.personTypeLabel}
                  options={PERSON_OPTIONS}
                  value={values.personType}
                  onChange={(personType) => {
                    setPersonTypeChosen(true);
                    setValues((current) => ({ ...current, personType }));
                  }}
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
                label={mobileCompanyCopy.rfcLabel}
                value={values.rfc}
                onChangeText={set('rfc')}
                error={errors.rfc}
                inputRef={register('rfc')}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              {withLegalRepresentative ? (
                <FieldCell
                  label={mobileCompanyCopy.legalRepresentativeLabel}
                  value={values.legalRepresentativeName}
                  onChangeText={set('legalRepresentativeName')}
                  error={errors.legalRepresentativeName}
                  inputRef={register('legalRepresentativeName')}
                  autoComplete="name"
                />
              ) : null}
            </Group>
            <SectionHeader title={mobileCompanyCopy.fiscalAddressTitle} />
            <Group>
              <FieldCell
                label={mobileCompanyCopy.streetLabel}
                value={values.fiscalStreet}
                onChangeText={set('fiscalStreet')}
                error={errors.fiscalStreet}
                inputRef={register('fiscalStreet')}
                autoComplete="street-address"
              />
              <FieldCell
                label={mobileCompanyCopy.exteriorNumberLabel}
                value={values.fiscalExteriorNumber}
                onChangeText={set('fiscalExteriorNumber')}
                error={errors.fiscalExteriorNumber}
                inputRef={register('fiscalExteriorNumber')}
              />
              <FieldCell
                label={mobileCompanyCopy.interiorNumberLabel}
                value={values.fiscalInteriorNumber}
                onChangeText={set('fiscalInteriorNumber')}
                error={errors.fiscalInteriorNumber}
                inputRef={register('fiscalInteriorNumber')}
              />
              <FieldCell
                label={mobileCompanyCopy.neighborhoodLabel}
                value={values.fiscalNeighborhood}
                onChangeText={set('fiscalNeighborhood')}
                error={errors.fiscalNeighborhood}
                inputRef={register('fiscalNeighborhood')}
              />
              <FieldCell
                label={mobileCompanyCopy.postalCodeLabel}
                value={values.fiscalPostalCode}
                onChangeText={set('fiscalPostalCode')}
                error={errors.fiscalPostalCode}
                inputRef={register('fiscalPostalCode')}
                keyboardType="number-pad"
                autoComplete="postal-code"
                maxLength={5}
              />
              <FieldCell
                label={mobileCompanyCopy.municipalityLabel}
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
            <View ref={register('acceptTerms')}>
              <TermsCheckbox
                checked={values.acceptTerms}
                onChange={(acceptTerms) => setValues((current) => ({ ...current, acceptTerms }))}
                error={errors.acceptTerms}
              />
            </View>
          </View>
        )}
      </Screen>
      <KeyboardBottomBar
        action={
          onAccount
            ? { label: copy.signUpNext, onPress: next, size: 'large' }
            : {
                label: copy.signUpAction,
                onPress: () => void submit(),
                loading: submitting,
                size: 'large',
              }
        }
        secondary={onAccount ? undefined : { label: copy.signUpBack, onPress: back }}
        onHeight={setBarHeight}
      />
    </>
  );
}

// The Screen spaces its children; a step keeps the same spacing inside it.
const styles = StyleSheet.create({
  step: { gap: spacing.md },
  hidden: { display: 'none' },
});
