// Who issues Fulmis' CFDI to the client (I5, D37). The platform talks to a
// CFDI provider (a PAC) through this interface. Until Mateo chooses a PAC and
// Fulmis has its seal certificate (CSD), the only provider is `manual`: the
// platform issues nothing and the admin uploads the CFDI issued elsewhere,
// which the Edge Function validates like any other.
//
// Variables (Edge Function secrets, never in the repo): CFDI_PROVIDER (the
// PAC's adapter name) and CFDI_API_KEY. Without both, or with a name that has
// no adapter here, the provider is `manual` and nothing fails.
import type { Logger } from '../../../packages/shared/src/observability/logger.ts';

export interface CfdiIssueRequest {
  tripId: string;
}

export type CfdiIssueResult =
  { status: 'manual' } | { status: 'issued'; uuid: string; xml: Uint8Array; pdf: Uint8Array };

export type CfdiCancelResult = { status: 'manual' } | { status: 'cancelled' };

export interface CfdiProvider {
  /** Stored with each invoice it issues (`manual` for an uploaded one). */
  readonly name: string;
  /** Whether the admin uploads the CFDI issued elsewhere instead. */
  readonly acceptsUploads: boolean;
  issue(request: CfdiIssueRequest): Promise<CfdiIssueResult>;
  cancel(uuid: string, reason: string): Promise<CfdiCancelResult>;
  getPdf(uuid: string): Promise<Uint8Array | null>;
  getXml(uuid: string): Promise<Uint8Array | null>;
}

/** Issuing is off: the admin uploads the XML and the PDF. */
export const manualProvider: CfdiProvider = {
  name: 'manual',
  acceptsUploads: true,
  issue: () => Promise.resolve({ status: 'manual' }),
  cancel: () => Promise.resolve({ status: 'manual' }),
  // The uploaded files are in the `invoices` bucket, not at a provider.
  getPdf: () => Promise.resolve(null),
  getXml: () => Promise.resolve(null),
};

/**
 * Real adapters, by CFDI_PROVIDER. Empty until a PAC is chosen (plan-v1.md
 * §I.2): its adapter goes here, built from CFDI_API_KEY.
 */
const ADAPTERS: Record<string, (apiKey: string) => CfdiProvider> = {};

/** The provider the environment configures, `manual` unless a PAC is fully set. */
export function cfdiProviderFromEnv(
  env: (name: string) => string | undefined,
  log: Logger,
): CfdiProvider {
  const name = env('CFDI_PROVIDER')?.trim().toLowerCase();
  if (!name || name === 'manual') return manualProvider;
  const adapter = Object.hasOwn(ADAPTERS, name) ? ADAPTERS[name] : undefined;
  const apiKey = env('CFDI_API_KEY');
  if (!adapter || !apiKey) {
    log.warn('CFDI provider not available, using manual', {
      reason: adapter ? 'missing_api_key' : 'unknown_provider',
    });
    return manualProvider;
  }
  return adapter(apiKey);
}
