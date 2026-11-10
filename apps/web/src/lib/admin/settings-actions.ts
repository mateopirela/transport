'use server';

import {
  adminSettingsCopy,
  authErrors,
  FULMIS_SETTING_KEYS,
  freightInvoicesCopy,
  normalizeFulmisSetting,
  type FulmisSettingField,
  isValidSupportHours,
  normalizeSupportWhatsapp,
  SUPPORT_SETTING_KEYS,
} from '@transport/shared';
import { revalidatePath } from 'next/cache';

import type { FormState } from '../forms';
import { createClient } from '../supabase/server';

// Server actions of /admin/ajustes (I2): the support number and hours; and
// (I5) Fulmis' fiscal data. admin_set_platform_setting checks the admin and
// validates each value again (…_pilot_support.sql, …_freight_invoices.sql);
// every change is audited.

const c = adminSettingsCopy;

async function setSetting(key: string, value: string | null, invalid: string): Promise<FormState> {
  const supabase = await createClient();
  if (!supabase) return { error: authErrors.notConfigured };
  const { error } = await supabase.rpc('admin_set_platform_setting', {
    p_key: key,
    p_value: value as never,
  });
  if (error) {
    if (error.code === '42501') return { error: c.errors.notAdmin };
    if (error.code === '22023') return { error: invalid };
    return { error: c.errors.generic };
  }
  // "Ayuda" is in the account menu of every signed-in screen.
  revalidatePath('/', 'layout');
  return { message: c.saved };
}

/**
 * A failed save gives back what the admin typed, so the form shows it again
 * instead of the saved value (React resets the fields after an action).
 */
function keepTyped(state: FormState, name: string, typed: string): FormState {
  return state.error ? { ...state, values: { [name]: typed } } : state;
}

/** The support WhatsApp: a phone (normalized to E.164) or, with "Quitar", none. */
export async function setSupportWhatsappAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (formData.get('clear') === 'on') {
    return setSetting(SUPPORT_SETTING_KEYS.whatsapp, null, c.errors.invalidPhone);
  }
  const typed = String(formData.get('whatsapp') ?? '');
  const phone = normalizeSupportWhatsapp(typed);
  const state = phone
    ? await setSetting(SUPPORT_SETTING_KEYS.whatsapp, phone, c.errors.invalidPhone)
    : { error: c.errors.invalidPhone };
  return keepTyped(state, 'whatsapp', typed);
}

/** The support hours (1 to 200 characters) or, with "Quitar", none. */
export async function setSupportHoursAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (formData.get('clear') === 'on') {
    return setSetting(SUPPORT_SETTING_KEYS.hours, null, c.errors.invalidHours);
  }
  const hours = String(formData.get('hours') ?? '');
  const state = isValidSupportHours(hours)
    ? await setSetting(SUPPORT_SETTING_KEYS.hours, hours.trim(), c.errors.invalidHours)
    : { error: c.errors.invalidHours };
  return keepTyped(state, 'hours', hours);
}

/** One of Fulmis' fiscal data (I5), normalized as Postgres saves it, or with "Quitar", none. */
async function setFulmisSetting(field: FulmisSettingField, formData: FormData): Promise<FormState> {
  const invalid = freightInvoicesCopy.settings.invalid[field];
  if (formData.get('clear') === 'on') return setSetting(FULMIS_SETTING_KEYS[field], null, invalid);
  const typed = String(formData.get(field) ?? '');
  const value = normalizeFulmisSetting(field, typed);
  const state = value
    ? await setSetting(FULMIS_SETTING_KEYS[field], value, invalid)
    : { error: invalid };
  return keepTyped(state, field, typed);
}

export async function setFulmisRfcAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return setFulmisSetting('rfc', formData);
}

export async function setFulmisLegalNameAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return setFulmisSetting('legalName', formData);
}

export async function setFulmisTaxRegimeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return setFulmisSetting('taxRegime', formData);
}

export async function setFulmisZipAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return setFulmisSetting('zip', formData);
}
