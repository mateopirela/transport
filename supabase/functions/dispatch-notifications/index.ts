// Edge Function `dispatch-notifications` (B09). The logic lives in handler.ts
// (tested with `deno test`); this file only wires the Deno runtime.
import { handleDispatch } from './handler.ts';

Deno.serve((request) =>
  handleDispatch(request, {
    env: (name) => Deno.env.get(name),
    fetch: (input, init) => fetch(input, init),
  }),
);
