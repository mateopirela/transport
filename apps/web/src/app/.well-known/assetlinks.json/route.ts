import { androidAssetLinks } from '@transport/shared';

/**
 * App Links of Android (H2, D29): the app opens https://<sitio>/viaje/*
 * directly (its intent filter only covers that path). Only with
 * ANDROID_CERT_SHA256 (comma separated for several certificates); without it
 * it is a 404 and the page /viaje/<token> offers the deep link.
 */
export function GET() {
  const body = androidAssetLinks(
    process.env.ANDROID_CERT_SHA256,
    process.env.APP_BUNDLE_ID || 'mx.transport.app',
  );
  if (!body) return new Response(null, { status: 404 });
  return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
