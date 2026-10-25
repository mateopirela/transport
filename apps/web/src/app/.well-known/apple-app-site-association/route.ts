import { appleAppSiteAssociation } from '@transport/shared';

/**
 * Universal links of iOS (H2, D29): the app opens https://<sitio>/viaje/*
 * directly. Only with APPLE_TEAM_ID (and APP_BUNDLE_ID, default the app's);
 * without them it is a 404 and the page /viaje/<token> offers the deep link.
 */
export function GET() {
  const body = appleAppSiteAssociation(
    process.env.APPLE_TEAM_ID,
    process.env.APP_BUNDLE_ID || 'mx.transport.app',
  );
  if (!body) return new Response(null, { status: 404 });
  return Response.json(body, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
