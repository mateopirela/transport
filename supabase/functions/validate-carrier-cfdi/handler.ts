// Edge Function `validate-carrier-cfdi` (I5, D37): the carrier's Gerente, or a
// Coordinador of the trip's business unit, uploads the CFDI the carrier
// issued to Fulmis for a trip (the XML and, optionally, its PDF) from
// Cobranza.
//
//   POST multipart/form-data { tripId, xml, pdf? } with the user's JWT
//
// The issuer must be the carrier company's RFC, the receiver Fulmis' RFC
// (fulmis.rfc; without it the invoice is saved "Sin validar"), the total the
// carrier's net (± 1 cent), MXN, and the UUID unique in the platform. The
// steps are those of ../_shared/cfdi-upload.ts; the rules live in Postgres
// (…_freight_invoices.sql).
import { CORS_HEADERS, handleCfdiUpload, type UploadDependencies } from '../_shared/cfdi-upload.ts';

export { CORS_HEADERS };

export function handleValidateCarrierCfdi(
  request: Request,
  deps: UploadDependencies,
): Promise<Response> {
  return handleCfdiUpload(request, deps, {
    direction: 'carrier_to_fulmis',
    provider: 'manual',
    pdfRequired: false,
  });
}
