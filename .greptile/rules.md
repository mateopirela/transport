# Review guidelines

These complement the structured rules in `config.json`. The source of truth is
`docs/plan-v1.md` (definition of done in §0.3, conventions in §0.4).

## Security model

- All authorization lives in Postgres: RLS on every table plus `security definer`
  RPCs with explicit validation. Web and mobile apps only use the anon key and
  the user's JWT. The service role exists only in Edge Functions and CI.
- Users must never be able to change their own `role`, `status` or `company_id`.
- One company must never read or write another company's data (loads,
  negotiations, documents, trips, locations, messages). Flag any query or policy
  that could leak rows across companies.
- Messages, trip events and the audit log are immutable: no update/delete
  policies for clients.
- The shipper may see a trip's location only while the trip is active.

## Scope

- One PR = one block of the plan. Flag changes that belong to another block;
  they should be listed under "Seguimiento" in the PR description instead.
- Target size is under ~800 changed lines (excluding generated files and lockfiles).

## External services

- API keys (Google Maps, Expo/EAS, Sentry, email provider, Supabase cloud) are
  read from environment variables documented in `.env.example`, and the code
  must degrade gracefully when they are missing (map placeholder, haversine
  distance fallback, mocked providers in tests, optional Sentry DSN).
- Google Routes calls must go through `route_distance_cache` and be bounded.

## Do not flag

- Spanish text in documentation and UI copy (it is required).
- English identifiers, SQL names and commit messages (they are required).
