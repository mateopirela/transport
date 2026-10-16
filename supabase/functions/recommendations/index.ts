// Edge Function `recommendations` (B08). The logic lives in handler.ts
// (tested with `deno test`); this file only wires the Deno runtime.
import { handleRecommendations } from './handler.ts';

Deno.serve((request) =>
  handleRecommendations(request, {
    env: (name) => Deno.env.get(name),
    fetch: (input, init) => fetch(input, init),
  }),
);
