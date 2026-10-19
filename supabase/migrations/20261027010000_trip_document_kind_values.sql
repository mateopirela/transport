-- G3 · Trip documents (D22): the service order and the invoice join the Carta
-- Porte as kinds of trip document. Enum values go in their own migration
-- (plan §G.0): Postgres refuses to use a value added in the same transaction.
alter type public.trip_document_kind add value 'service_order' before 'carta_porte';
alter type public.trip_document_kind add value 'invoice' before 'other';
