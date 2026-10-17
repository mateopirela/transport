-- G1b · Invitation kinds (plan §G.0, rule 1: enums go in their own migration).
--   coordinator            the manager invites a coordinator and assigns
--                          business units (D19);
--   operator               the manager or a coordinator invites an operator
--                          into one business unit (D15-E1);
--   operator_access_reset  the manager or a coordinator lets an operator who
--                          forgot their password set a new one (D15-E1).
create type public.invitation_kind as enum ('coordinator', 'operator', 'operator_access_reset');
