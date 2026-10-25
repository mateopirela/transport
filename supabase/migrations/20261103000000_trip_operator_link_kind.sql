-- H2 · Trip link for the operator (D29): a new kind of share link. Enum
-- changes go in their own migration (plan §G.0): the next one uses it.
--
--   trip_operator  the manager or a coordinator of the trip's business unit
--                  sends the assigned operator a link that opens the trip in
--                  the app; it needs a session and only the operator still
--                  assigned (or the unit's staff) gets through
--                  (open_trip_operator_link)
alter type public.share_link_kind add value if not exists 'trip_operator';
