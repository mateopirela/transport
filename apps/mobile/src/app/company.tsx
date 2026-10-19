import {
  companyRegistrationSchema,
  mobileAuthCopy,
  mobileCompanyCopy as copy,
  mobileErrorCopy,
  PERSON_TYPES,
  type CarrierSignUpKind,
  type MxState,
  type PersonType,
} from '@transport/shared';
import { useState } from 'react';

import { OptionGroup } from '../components/option-group';
import { SectionTitle } from '../components/fleet-ui';
import { StatePicker } from '../components/state-picker';
import { Button, Field, Notice, Screen, Title } from '../components/ui';
import { validateForm, type FieldErrors } from '../lib/forms';
import { useSession } from '../providers/session';

const KINDS: { value: CarrierSignUpKind; label: string }[] = [
  { value: 'carrier', label: copy.kindCarrier },
  { value: 'owner_operator', label: copy.kindOwnerOperator },
];

const PERSON_OPTIONS: { value: PersonType; label: string }[] = PERSON_TYPES.map((type) => ({
  value: type,
  label: type === 'moral' ? copy.personTypeMoral : copy.personTypeFisica,
}));

/**
 * Carrier company registration after sign-up (register_company, G2): the
 * kind (company or hombre-camión, D13), the fiscal data (D16) and the
 * contact. The company starts "en revisión"; documents and fleet come in
 * B18. The kind chosen at sign-up only preselects the form.
 */
export default function CompanySetup() {
  const { session, profile, actions, refreshProfile } = useSession();
  const initialKind = session?.user.user_metadata.pending_company_kind as unknown;
  const [values, setValues] = useState({
    kind: (initialKind === 'owner_operator' ? 'owner_operator' : 'carrier') as CarrierSignUpKind,
    personType: (initialKind === 'owner_operator' ? 'fisica' : 'moral') as PersonType,
    legalName: '',
    rfc: '',
    fiscalStreet: '',
    fiscalExteriorNumber: '',
    fiscalInteriorNumber: '',
    fiscalNeighborhood: '',
    fiscalPostalCode: '',
    fiscalMunicipality: '',
    fiscalState: '' as MxState | '',
    legalRepresentativeName: '',
    contactName: profile?.fullName ?? '',
    contactEmail: session?.user.email ?? '',
    contactPhone: profile?.phone ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  type TextField = Exclude<keyof typeof values, 'kind' | 'personType' | 'fiscalState'>;
  const set = (field: TextField) => (text: string) =>
    setValues((current) => ({ ...current, [field]: text }));

  async function submit() {
    setFormError(null);
    const parsed = validateForm(companyRegistrationSchema, values);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;
    setSubmitting(true);
    const result = await actions.registerCompany(parsed.data);
    if (result.ok) await refreshProfile();
    else setFormError(mobileErrorCopy[result.error]);
    setSubmitting(false);
  }

  return (
    <Screen>
      <Title subtitle={copy.subtitle}>{copy.title}</Title>
      {formError ? <Notice tone="danger">{formError}</Notice> : null}
      <OptionGroup
        label={copy.kindLabel}
        options={KINDS}
        value={values.kind}
        onChange={(kind) => setValues((current) => ({ ...current, kind }))}
        hint={values.kind === 'owner_operator' ? copy.kindOwnerOperatorHint : undefined}
        error={errors.kind}
      />
      <OptionGroup
        label={copy.personTypeLabel}
        options={PERSON_OPTIONS}
        value={values.personType}
        onChange={(personType) => setValues((current) => ({ ...current, personType }))}
        error={errors.personType}
      />
      <Field
        label={copy.legalNameLabel}
        value={values.legalName}
        onChangeText={set('legalName')}
        error={errors.legalName}
        autoComplete="organization"
      />
      <Field
        label={copy.rfcLabel}
        value={values.rfc}
        onChangeText={set('rfc')}
        error={errors.rfc}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Field
        label={copy.legalRepresentativeLabel}
        value={values.legalRepresentativeName}
        onChangeText={set('legalRepresentativeName')}
        error={errors.legalRepresentativeName}
        placeholder={copy.legalRepresentativeHint}
        autoComplete="name"
      />
      <SectionTitle>{copy.fiscalAddressTitle}</SectionTitle>
      <Field
        label={copy.streetLabel}
        value={values.fiscalStreet}
        onChangeText={set('fiscalStreet')}
        error={errors.fiscalStreet}
        autoComplete="street-address"
      />
      <Field
        label={copy.exteriorNumberLabel}
        value={values.fiscalExteriorNumber}
        onChangeText={set('fiscalExteriorNumber')}
        error={errors.fiscalExteriorNumber}
      />
      <Field
        label={copy.interiorNumberLabel}
        value={values.fiscalInteriorNumber}
        onChangeText={set('fiscalInteriorNumber')}
        error={errors.fiscalInteriorNumber}
      />
      <Field
        label={copy.neighborhoodLabel}
        value={values.fiscalNeighborhood}
        onChangeText={set('fiscalNeighborhood')}
        error={errors.fiscalNeighborhood}
      />
      <Field
        label={copy.postalCodeLabel}
        value={values.fiscalPostalCode}
        onChangeText={set('fiscalPostalCode')}
        error={errors.fiscalPostalCode}
        keyboardType="number-pad"
        autoComplete="postal-code"
        maxLength={5}
      />
      <Field
        label={copy.municipalityLabel}
        value={values.fiscalMunicipality}
        onChangeText={set('fiscalMunicipality')}
        error={errors.fiscalMunicipality}
      />
      <StatePicker
        value={values.fiscalState}
        onChange={(fiscalState) => setValues((current) => ({ ...current, fiscalState }))}
        error={errors.fiscalState}
      />
      <SectionTitle>{copy.contactTitle}</SectionTitle>
      <Field
        label={mobileAuthCopy.fullNameLabel}
        value={values.contactName}
        onChangeText={set('contactName')}
        error={errors.contactName}
        autoComplete="name"
      />
      <Field
        label={mobileAuthCopy.emailLabel}
        value={values.contactEmail}
        onChangeText={set('contactEmail')}
        error={errors.contactEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Field
        label={mobileAuthCopy.phoneLabel}
        value={values.contactPhone}
        onChangeText={set('contactPhone')}
        error={errors.contactPhone}
        keyboardType="phone-pad"
      />
      <Button label={copy.saveAction} onPress={submit} loading={submitting} />
      <Button
        label={mobileAuthCopy.signOut}
        variant="link"
        onPress={() => void actions.signOut()}
      />
    </Screen>
  );
}
