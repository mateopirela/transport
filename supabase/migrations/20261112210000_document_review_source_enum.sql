-- R4 · Where a document's review came from (D10-E1). On its own, before the
-- migration that uses it (G.0.1: an enum is created in its own migration).
--   * 'manual': an admin reviewed it in /admin/verificacion (review_document).
--     Every document reviewed so far, and the default.
--   * 'automatic': reserved for a future automatic reviewer (OCR, SAT). No
--     RPC writes it yet.
create type public.document_review_source as enum ('manual', 'automatic');
