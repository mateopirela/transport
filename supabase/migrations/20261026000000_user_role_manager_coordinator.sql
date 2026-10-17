-- G1a.1 · Roles: Gerente (manager) and Coordinador (coordinator), D19.
--   The carrier role becomes manager, and coordinator is added. On its own
--   migration because Postgres cannot use a value added to an enum in the same
--   transaction (§G.0, rule 1).
--   Existing rows (profiles.role, messages.sender_role, trip_events.actor_role)
--   and every policy, default and check keep working: they store the enum
--   value, not its label. Function bodies are text, so the next migration
--   recreates the ones that name the role.
--   company_type and offer_side keep their 'carrier' value: they are the
--   company and the side of a negotiation, not the role.

alter type public.user_role rename value 'carrier' to 'manager';
alter type public.user_role add value 'coordinator' after 'manager';
