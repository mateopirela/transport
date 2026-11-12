import { mobileAuthCopy as copy, type CarrierSignUpKind } from '@transport/shared';

import { OptionGroup } from './option-group';

const KINDS: { value: CarrierSignUpKind; label: string; subtitle: string }[] = [
  { value: 'carrier', label: copy.signUpKindCarrier, subtitle: copy.signUpKindCarrierHint },
  {
    value: 'owner_operator',
    label: copy.signUpKindOwnerOperator,
    subtitle: copy.signUpKindOwnerOperatorHint,
  },
];

/**
 * What a carrier registers in the app (D13, texts of D42): a company, run by
 * its Gerente, or a hombre-camión. Under it, who runs the company's account
 * or what the hombre-camión gets. The sign-up and the company form share it.
 */
export function CarrierKindChoice({
  label = copy.signUpKindLabel,
  value,
  onChange,
  error,
}: {
  label?: string;
  value: CarrierSignUpKind;
  onChange: (kind: CarrierSignUpKind) => void;
  error?: string | undefined;
}) {
  return (
    <OptionGroup
      label={label}
      options={KINDS}
      value={value}
      onChange={onChange}
      hint={value === 'carrier' ? copy.signUpManagerNote : copy.signUpOwnerOperatorNote}
      error={error}
    />
  );
}
