-- Verification and documents (B03): requirement catalog, documents RLS,
-- Storage policies of the `documents` bucket, the submit/review RPCs, company
-- approval rules and the admin audit log. Covers access from another company.
begin;
create extension if not exists pgtap with schema extensions;

select plan(71);

-- ---------------------------------------------------------------------------
-- Test helpers (rolled back with the transaction)
-- ---------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.new_user(p_id uuid, p_meta jsonb)
returns void
language sql
as $$
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (p_id, 'authenticated', 'authenticated', p_id || '@test.local', p_meta, now(), now());
$$;

create function tests.login(p_id uuid)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_id, 'role', 'authenticated')::text,
    true
  );
$$;

-- Object name for a company document: {company}/company/{company}/{file}.pdf
create function tests.path(p_company uuid, p_file uuid)
returns text
language sql
immutable
as $$
  select p_company || '/company/' || p_company || '/' || p_file || '.pdf';
$$;

-- Uploads as the current role, so the Storage RLS policies apply.
create function tests.upload(p_name text)
returns void
language sql
as $$
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('documents', p_name, (select auth.uid())::text,
          '{"mimetype":"application/pdf","size":1234}'::jsonb);
$$;

create function tests.requirement(p_code text)
returns uuid
language sql
stable
as $$
  select id from public.document_requirements where code = p_code;
$$;

-- Uploads and submits a company document of the caller's company.
create function tests.submit(p_code text, p_file uuid, p_expires_at timestamptz default null)
returns uuid
language plpgsql
as $$
declare
  v_company uuid := public.auth_company_id();
begin
  perform tests.upload(tests.path(v_company, p_file));
  return public.submit_document(
    tests.requirement(p_code), 'company', v_company, tests.path(v_company, p_file),
    'archivo.pdf', p_expires_at
  );
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- Users:
--   ...01 shipper A (owner)   ...02 shipper A (teammate)
--   ...03 carrier B (owner)   ...04 operator of carrier B
--   ...05 admin               ...06 shipper C (persona física)
-- Companies: c...0a = A (shipper, moral), c...0b = B (carrier, moral),
--            c...0c = C (shipper, física).
select tests.new_user('a0000000-0000-4000-8000-000000000001', '{"role":"shipper"}');
select tests.new_user('a0000000-0000-4000-8000-000000000002', '{"role":"shipper"}');
select tests.new_user('a0000000-0000-4000-8000-000000000003', '{"role":"carrier"}');
select tests.new_user('a0000000-0000-4000-8000-000000000004', '{"role":"operator"}');
select tests.new_user('a0000000-0000-4000-8000-000000000005', '{"role":"shipper"}');
select tests.new_user('a0000000-0000-4000-8000-000000000006', '{"role":"shipper"}');

insert into public.companies (id, type, legal_name, rfc) values
  ('c0000000-0000-4000-8000-00000000000a', 'shipper', 'Acme Envíos SA de CV', 'ACE010101AB1'),
  ('c0000000-0000-4000-8000-00000000000b', 'carrier', 'Transportes Beta SA de CV', 'TBE020202CD2'),
  ('c0000000-0000-4000-8000-00000000000c', 'shipper', 'María Gómez', 'GOMA800101AB1');

update public.profiles set company_id = 'c0000000-0000-4000-8000-00000000000a'
where id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002');
update public.profiles set company_id = 'c0000000-0000-4000-8000-00000000000b'
where id in ('a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004');
update public.profiles set company_id = 'c0000000-0000-4000-8000-00000000000c'
where id = 'a0000000-0000-4000-8000-000000000006';
update public.profiles set role = 'admin' where id = 'a0000000-0000-4000-8000-000000000005';

-- ---------------------------------------------------------------------------
-- Schema, catalog and bucket
-- ---------------------------------------------------------------------------
select has_table('public', 'document_requirements', 'document_requirements exists');
select has_table('public', 'documents', 'documents exists');
select has_table('public', 'audit_log', 'audit_log exists');
select ok(
  not has_table_privilege('anon', 'public.documents', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.document_requirements', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.audit_log', 'select,insert,update,delete'),
  'anon has no privileges on the verification tables'
);
select results_eq(
  $$ select public, file_size_limit from storage.buckets where id = 'documents' $$,
  $$ values (false, 10485760::bigint) $$,
  'documents bucket exists, is private and limits file size'
);
select is(
  (select count(*)::int from public.document_requirements),
  9,
  'provisional requirement list is seeded (D16)'
);

-- ---------------------------------------------------------------------------
-- Shipper A
-- ---------------------------------------------------------------------------
select tests.login('a0000000-0000-4000-8000-000000000001');
set local role authenticated;

select is(
  (select count(*)::int from public.document_requirements),
  9,
  'members read the requirement catalog'
);
select throws_ok(
  $$ insert into public.document_requirements (code, owner_type, name) values ('hack', 'company', 'X') $$,
  '42501', null,
  'non-admins cannot add requirements'
);
select lives_ok(
  $$ update public.document_requirements set is_required = false $$,
  'non-admin requirement updates run but match no rows'
);
select is(
  (select count(*)::int from public.document_requirements where not is_required),
  0,
  'non-admins cannot edit requirements'
);

-- Storage policies
select lives_ok(
  $$ select tests.upload(tests.path('c0000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-000000000001')) $$,
  'shipper uploads under its own company folder'
);
select throws_ok(
  $$ select tests.upload(tests.path('c0000000-0000-4000-8000-00000000000b', 'f0000000-0000-4000-8000-000000000002')) $$,
  '42501', null,
  'shipper cannot upload into another company folder'
);
select throws_ok(
  $$ select tests.upload('c0000000-0000-4000-8000-00000000000a/company/c0000000-0000-4000-8000-00000000000b/f0000000-0000-4000-8000-000000000003.pdf') $$,
  '42501', null,
  'shipper cannot upload a company document for another company id'
);
select throws_ok(
  $$ select tests.upload('c0000000-0000-4000-8000-00000000000a/acta.pdf') $$,
  '42501', null,
  'uploads must follow the {company}/{owner_type}/{owner_id}/{uuid} layout'
);
select lives_ok(
  $$ update storage.objects set name = name || '.bak' where bucket_id = 'documents' $$,
  'renaming uploaded files runs but matches no rows'
);
select is(
  (select count(*)::int from storage.objects where name like '%.bak'),
  0,
  'clients cannot rename uploaded files'
);

-- submit_document
select lives_ok(
  $$ select public.submit_document(
       tests.requirement('tax_status_certificate'), 'company', 'c0000000-0000-4000-8000-00000000000a',
       tests.path('c0000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-000000000001'),
       'csf.pdf') $$,
  'shipper submits an uploaded company document'
);
select results_eq(
  $$ select status::text, mime_type, size_bytes, submitted_by from public.documents $$,
  $$ values ('pending_review', 'application/pdf', 1234::bigint, 'a0000000-0000-4000-8000-000000000001'::uuid) $$,
  'the document starts in review with metadata taken from Storage'
);
select throws_ok(
  $$ select public.submit_document(
       tests.requirement('proof_of_address'), 'company', 'c0000000-0000-4000-8000-00000000000a',
       tests.path('c0000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-0000000000ff')) $$,
  '22023', 'file was not uploaded',
  'a document needs an uploaded file'
);
select throws_ok(
  $$ select public.submit_document(
       tests.requirement('proof_of_address'), 'company', 'c0000000-0000-4000-8000-00000000000a',
       tests.path('c0000000-0000-4000-8000-00000000000a', 'f0000000-0000-4000-8000-000000000001')) $$,
  '23505', null,
  'a file cannot back two documents'
);
select throws_ok(
  $$ select public.submit_document(
       tests.requirement('proof_of_address'), 'company', 'c0000000-0000-4000-8000-00000000000b',
       tests.path('c0000000-0000-4000-8000-00000000000b', 'f0000000-0000-4000-8000-000000000004')) $$,
  '42501', null,
  'shipper cannot submit documents for another company'
);
select throws_ok(
  $$ select tests.submit('sct_permit', 'f0000000-0000-4000-8000-000000000005') $$,
  '22023', null,
  'carrier-only requirements do not apply to shippers'
);
select throws_ok(
  $$ select tests.submit('legal_representative_id', 'f0000000-0000-4000-8000-000000000006') $$,
  '22023', null,
  'requirements with expiry need an expiry date'
);
select throws_ok(
  $$ select tests.submit('legal_representative_id', 'f0000000-0000-4000-8000-000000000007', now() - interval '1 day') $$,
  '22023', null,
  'an expired document cannot be submitted'
);
select throws_ok(
  $$ select public.submit_document(
       tests.requirement('vehicle_registration_card'), 'vehicle', 'f0000000-0000-4000-8000-0000000000aa',
       'c0000000-0000-4000-8000-00000000000a/vehicle/f0000000-0000-4000-8000-0000000000aa/f0000000-0000-4000-8000-000000000008.pdf') $$,
  '42501', null,
  'documents for a vehicle of no company of the caller are rejected (fleet tables, B04)'
);

-- Direct writes are not allowed: only the RPCs change documents.
select throws_ok(
  $$ update public.documents set status = 'approved' $$,
  '42501', null,
  'shipper cannot approve its own document'
);
select throws_ok(
  $$ insert into public.documents (company_id, requirement_id, owner_type, owner_id, storage_path)
     values ('c0000000-0000-4000-8000-00000000000a', tests.requirement('proof_of_address'), 'company',
             'c0000000-0000-4000-8000-00000000000a', 'x') $$,
  '42501', null,
  'shipper cannot insert documents directly'
);
select throws_ok(
  $$ delete from public.documents $$,
  '42501', null,
  'shipper cannot delete documents'
);
select throws_ok(
  $$ select public.review_document((select id from public.documents limit 1), 'approve') $$,
  '42501', null,
  'shipper cannot review documents'
);
select throws_ok(
  $$ select public.review_company('c0000000-0000-4000-8000-00000000000a', 'approve') $$,
  '42501', null,
  'shipper cannot review its company'
);
select is(
  (select count(*)::int from public.audit_log),
  0,
  'shipper cannot read the audit log'
);

-- Superseding: a new submission archives the pending one for the same requirement.
select tests.submit('proof_of_address', 'f0000000-0000-4000-8000-000000000010');
select tests.submit('proof_of_address', 'f0000000-0000-4000-8000-000000000011');
select results_eq(
  $$ select count(*)::int, count(*) filter (where archived_at is null)::int
     from public.documents where requirement_id = tests.requirement('proof_of_address') $$,
  $$ values (2, 1) $$,
  'a new submission supersedes the pending one'
);

-- Teammate of A sees the company documents and files.
select tests.login('a0000000-0000-4000-8000-000000000002');
select is(
  (select count(*)::int from public.documents),
  3,
  'teammates see their company documents'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'documents'),
  3,
  'teammates see their company files'
);

-- ---------------------------------------------------------------------------
-- Other companies and operators
-- ---------------------------------------------------------------------------
select tests.login('a0000000-0000-4000-8000-000000000006');
select is((select count(*)::int from public.documents), 0, 'another company cannot read the documents');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'documents'),
  0,
  'another company cannot read the files'
);

select tests.login('a0000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.documents), 0, 'a carrier cannot read a shipper documents');

select tests.login('a0000000-0000-4000-8000-000000000004');
select throws_ok(
  $$ select tests.upload(tests.path('c0000000-0000-4000-8000-00000000000b', 'f0000000-0000-4000-8000-000000000020')) $$,
  '42501', null,
  'operators cannot upload company documents'
);
select throws_ok(
  $$ select public.submit_document(tests.requirement('sct_permit'), 'company', 'c0000000-0000-4000-8000-00000000000b', 'x') $$,
  '42501', null,
  'operators cannot submit company documents'
);

-- ---------------------------------------------------------------------------
-- Admin: review documents
-- ---------------------------------------------------------------------------
select tests.login('a0000000-0000-4000-8000-000000000005');

select is((select count(*)::int from public.documents), 3, 'admin sees every document');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'documents'),
  3,
  'admin sees every file (signed URLs for the review viewer)'
);

select throws_ok(
  $$ select public.review_document(
       (select id from public.documents where requirement_id = tests.requirement('tax_status_certificate')),
       'reject', '  ') $$,
  '22023', 'a rejection needs a reason',
  'a rejection needs a reason'
);
select is(
  public.review_document(
    (select id from public.documents where requirement_id = tests.requirement('tax_status_certificate')),
    'reject', 'Documento ilegible'
  ),
  'rejected'::public.verification_status,
  'admin rejects a document'
);
select results_eq(
  $$ select status::text, review_notes, reviewed_by from public.documents
     where requirement_id = tests.requirement('tax_status_certificate') $$,
  $$ values ('rejected', 'Documento ilegible', 'a0000000-0000-4000-8000-000000000005'::uuid) $$,
  'the rejection keeps the reason and the reviewer'
);
select throws_ok(
  $$ select public.review_document(
       (select id from public.documents where requirement_id = tests.requirement('tax_status_certificate')),
       'approve') $$,
  '55000', null,
  'a reviewed document cannot be reviewed again'
);
select throws_ok(
  $$ select public.review_document(
       (select id from public.documents where archived_at is not null), 'approve') $$,
  '55000', null,
  'a superseded document cannot be reviewed'
);
select throws_ok(
  $$ select public.review_document(
       (select id from public.documents where archived_at is null
          and requirement_id = tests.requirement('proof_of_address')), 'maybe') $$,
  '22023', null,
  'the decision must be approve or reject'
);
select is(
  public.review_document(
    (select id from public.documents where archived_at is null
       and requirement_id = tests.requirement('proof_of_address')),
    'approve'
  ),
  'approved'::public.verification_status,
  'admin approves a document'
);

-- Audit log
select results_eq(
  $$ select action, actor_id, (old_data ->> 'status'), (new_data ->> 'status'), new_data ->> 'review_notes'
     from public.audit_log
     where table_name = 'documents'
       and record_id = (select id from public.documents
                        where requirement_id = tests.requirement('tax_status_certificate')) $$,
  $$ values ('update', 'a0000000-0000-4000-8000-000000000005'::uuid, 'pending_review', 'rejected',
             'Documento ilegible') $$,
  'the audit log records who rejected what and why'
);
select throws_ok(
  $$ update public.audit_log set actor_id = null $$,
  '42501', null,
  'admins cannot edit the audit log'
);
select throws_ok(
  $$ delete from public.audit_log $$,
  '42501', null,
  'admins cannot delete from the audit log'
);
select lives_ok(
  $$ insert into public.document_requirements (code, owner_type, name, is_required)
     values ('optional_extra', 'company', 'Documento adicional', false) $$,
  'admin adds a requirement'
);
select is(
  (select count(*)::int from public.audit_log where table_name = 'document_requirements' and action = 'insert'),
  1,
  'catalog changes by the admin are audited'
);

-- ---------------------------------------------------------------------------
-- Admin: review companies
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.review_company('c0000000-0000-4000-8000-00000000000a', 'approve') $$,
  '55000',
  'company is missing required documents: tax_status_certificate, articles_of_incorporation, legal_representative_id',
  'a company without its required documents cannot be approved'
);
select throws_ok(
  $$ select public.review_company('c0000000-0000-4000-8000-00000000000a', 'reject') $$,
  '22023', null,
  'a company rejection needs a reason'
);
select is(
  public.review_company('c0000000-0000-4000-8000-00000000000a', 'reject', 'Faltan documentos'),
  'rejected'::public.verification_status,
  'admin rejects a company'
);
select results_eq(
  $$ select status::text, status_reason from public.companies where id = 'c0000000-0000-4000-8000-00000000000a' $$,
  $$ values ('rejected', 'Faltan documentos') $$,
  'the company rejection keeps the reason'
);

-- Shipper A completes its documents: the rejected company returns to review.
select tests.login('a0000000-0000-4000-8000-000000000001');
select tests.submit('tax_status_certificate', 'f0000000-0000-4000-8000-000000000030');
select tests.submit('articles_of_incorporation', 'f0000000-0000-4000-8000-000000000031');
select tests.submit('legal_representative_id', 'f0000000-0000-4000-8000-000000000032', now() + interval '2 years');
select is(
  (select status::text from public.companies where id = 'c0000000-0000-4000-8000-00000000000a'),
  'pending_review',
  'a rejected company returns to review when it submits documents'
);

select tests.login('a0000000-0000-4000-8000-000000000005');
select public.review_document(id, 'approve')
from public.documents
where company_id = 'c0000000-0000-4000-8000-00000000000a' and status = 'pending_review' and archived_at is null;

select is(
  public.review_company('c0000000-0000-4000-8000-00000000000a', 'approve'),
  'approved'::public.verification_status,
  'a company with every required document approved can be approved'
);
select results_eq(
  $$ select actor_id, old_data ->> 'status', new_data ->> 'status' from public.audit_log
     where table_name = 'companies' and record_id = 'c0000000-0000-4000-8000-00000000000a'
     order by occurred_at, (new_data ->> 'status') desc $$,
  $$ values ('a0000000-0000-4000-8000-000000000005'::uuid, 'pending_review', 'rejected'),
            ('a0000000-0000-4000-8000-000000000005'::uuid, 'pending_review', 'approved') $$,
  'the audit log records who approved or rejected the company'
);
select throws_ok(
  $$ select public.review_company('c0000000-0000-4000-8000-00000000000a', 'suspend') $$,
  '22023', null,
  'a suspension needs a reason'
);
select is(
  public.review_company('c0000000-0000-4000-8000-00000000000a', 'suspend', 'Póliza vencida'),
  'suspended'::public.verification_status,
  'admin suspends an approved company'
);
select is(
  public.review_company('c0000000-0000-4000-8000-00000000000a', 'approve'),
  'approved'::public.verification_status,
  'admin reactivates a suspended company'
);
select throws_ok(
  $$ select public.review_company('c0000000-0000-4000-8000-00000000000a', 'reject', 'x') $$,
  '55000', null,
  'an approved company cannot be rejected (suspend it instead)'
);
update public.document_requirements set requires_expiry = true where code = 'proof_of_address';
select results_eq(
  $$ select code from public.company_missing_requirements('c0000000-0000-4000-8000-00000000000a') $$,
  $$ values ('proof_of_address') $$,
  'documents approved without expiry stop counting when the requirement starts requiring one'
);

-- Persona física (company C) does not need the acta constitutiva.
select tests.login('a0000000-0000-4000-8000-000000000006');
select results_eq(
  $$ select code from public.company_missing_requirements('c0000000-0000-4000-8000-00000000000c') $$,
  $$ values ('tax_status_certificate'), ('legal_representative_id'), ('proof_of_address') $$,
  'a persona física does not need the acta constitutiva'
);
select throws_ok(
  $$ select tests.submit('articles_of_incorporation', 'f0000000-0000-4000-8000-000000000040') $$,
  '22023', null,
  'requirements for personas morales do not apply to personas físicas'
);
select is(
  (select count(*)::int from public.company_missing_requirements('c0000000-0000-4000-8000-00000000000a')),
  0,
  'other companies cannot inspect a company requirements status'
);
select is(public.is_company_approved(), false, 'company C is still in review');

select tests.login('a0000000-0000-4000-8000-000000000001');
select is(public.is_company_approved(), true, 'company A is approved after the review');

-- The audit log is immutable even for privileged roles.
reset role;
select throws_ok(
  $$ delete from public.audit_log $$,
  '42501', 'audit_log is immutable',
  'the audit log is immutable even for the table owner'
);

select * from finish();
rollback;
