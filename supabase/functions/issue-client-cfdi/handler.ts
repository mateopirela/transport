// Edge Function `issue-client-cfdi` (I5, D37): Fulmis' CFDI to the client, for
// 100 % of the freight. Only admins (record_freight_invoice_service checks
// it, by the JWT's user).
//
//   POST application/json { tripId }
//     → asks the provider to issue it. With the `manual` provider (no PAC,
//       the default) issuing is off: 409 { error: 'manual_provider' }.
//   POST multipart/form-data { tripId, xml, pdf } (only with `manual`)
//     → the admin uploads the CFDI issued elsewhere. Validated as the
//       carrier's (../_shared/cfdi-upload.ts): issuer Fulmis (when fulmis.rfc
//       is set), receiver the shipper company's RFC, total the client amount,
//       MXN, unique UUID. Registering it moves the client's side from
//       `pending` to `invoiced`; any other status keeps it.
import { createLogger } from '../../../packages/shared/src/observability/logger.ts';
import {
  CORS_HEADERS,
  handleCfdiUpload,
  json,
  type UploadDependencies,
} from '../_shared/cfdi-upload.ts';
import { cfdiProviderFromEnv } from './provider.ts';

export { CORS_HEADERS };

export async function handleIssueClientCfdi(
  request: Request,
  deps: UploadDependencies,
): Promise<Response> {
  const log = deps.log ?? createLogger({ service: 'issue-client-cfdi' });
  const provider = cfdiProviderFromEnv(deps.env, log);
  const contentType = (request.headers.get('Content-Type') ?? '').toLowerCase();

  if (request.method === 'POST' && contentType.startsWith('application/json')) {
    if (!request.headers.get('Authorization')?.startsWith('Bearer ')) {
      return json({ error: 'unauthorized' }, 401);
    }
    // Only `manual` exists until a PAC is chosen: issuing is off and the
    // admin uploads the CFDI. A real adapter is wired here, behind the same
    // service RPCs (uploader and rules), when it arrives.
    if (provider.acceptsUploads) return json({ error: 'manual_provider' }, 409);
    return json({ error: 'not_implemented' }, 501);
  }
  if (request.method === 'POST' && !provider.acceptsUploads) {
    return json({ error: 'uploads_disabled' }, 409);
  }
  return handleCfdiUpload(request, deps, {
    direction: 'fulmis_to_client',
    provider: provider.name,
    pdfRequired: true,
  });
}
