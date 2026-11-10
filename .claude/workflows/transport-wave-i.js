export const meta = {
  name: 'transport-wave-i',
  description: 'Ola I (respuestas de JP, 2026-11-07): I0 docs + I1–I7 un PR por bloque con gate de Greptile, confirmación independiente de cada bloque, despliegue y verificación final',
  whenToUse: 'Construir docs/plan-v1.md §I. args opcionales: { skip: ["I1", ...] } para bloques ya en main.',
  phases: [
    { title: 'Plan', detail: 'I0: decisiones y §I en main' },
    { title: 'Ola IA', detail: 'I1 seguro · I2 soporte · I3 libro del flete · I7 regreso' },
    { title: 'Ola IB', detail: 'I5 CFDI · I6 intermediadas' },
    { title: 'Ola IC', detail: 'I4 pago rápido' },
    { title: 'Confirmación', detail: 'dos verificadores independientes por bloque y PR de corrección si falla' },
    { title: 'Producción', detail: 'verificación integral en main, despliegue y cobertura de lo que pidió JP' },
  ],
};

const REPO = 'mateopirela/transport';
const PLAN = 'docs/plan-v1.md §I';

const RESULT = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    pr_url: { type: 'string' },
    merged: { type: 'boolean' },
    greptile_rounds: { type: 'integer' },
    final_confidence: { type: 'string' },
    escalated: { type: 'boolean' },
    escalation_reason: { type: 'string' },
    done: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    follow_ups: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'merged', 'escalated', 'summary'],
};

const VERDICT = {
  type: 'object',
  properties: {
    works: { type: 'boolean' },
    checks: { type: 'array', items: { type: 'string' }, description: 'qué comprobaste y cómo (comando o flujo) con su resultado' },
    problems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          what: { type: 'string' },
          evidence: { type: 'string', description: 'comando, salida o pasos que lo reproducen' },
          where: { type: 'string' },
        },
        required: ['severity', 'what', 'evidence'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['works', 'checks', 'problems', 'summary'],
};

const SHARED = (prefix, id) => `
## Recursos compartidos de esta máquina (IMPORTANTE)
- Mateo puede estar usando la app: Supabase "transport" en puertos 563xx, web en 3020, Metro en 8081 y el simulador iPhone 18 Pro. **No los detengas ni los toques.** Nunca corras \`supabase stop\` sin tu propio SUPABASE_PROJECT_ID.
- Tu Supabase local: \`eval "$(sh scripts/local-ports.sh ${prefix})"\` y \`export SUPABASE_PROJECT_ID=transport-${id.toLowerCase()}\` en cada terminal. Toma el candado (\`mkdir /tmp/transport-supabase.lock\`; si tiene >60 min, bórralo) solo mientras corres \`supabase start\` / \`db reset\`. Al terminar: \`supabase stop --no-backup\` con TUS variables. No hay psql en el host: \`docker exec supabase_db_<project> psql -U postgres\`.
- Maestro: ~/.local/maestro/maestro/bin con JAVA_HOME=~/.local/jdk/jdk-17.0.20.1+1/Contents/Home, simulador iPhone 18 Pro Max (B4D89744-B091-42B9-8AD0-5F29F0A2CF31), Metro en 8092. Si otro agente lo usa (simctl booted, procesos de Maestro/Metro en 8092), espera. Metro reescribe apps/mobile/tsconfig.json: reviértelo antes de commitear. Los flujos de Maestro son algo inestables: si uno falla, repítelo antes de concluir.
- Web: Playwright en e2e/ (\`pnpm --filter @transport/web build\` y \`pnpm --filter @transport/e2e e2e\` con las variables de tu Supabase).
- \`pnpm typecheck --force\` (Turbo cachea).`;

const GIT = (branch, tag) => `
## Git y gate (D14)
- Worktree aislado. \`git fetch origin\` y \`git switch -c ${branch} --no-track origin/main\`. Push SIEMPRE con \`git push -u origin HEAD:refs/heads/${branch}\`. Nunca push a main. \`pnpm install\` si falta node_modules.
- Commits en inglés, imperativos, terminados con: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
- PR según .github/pull_request_template.md (en español), cuerpo terminado con: 🤖 Generated with [Claude Code](https://claude.com/claude-code). Capturas en claro y oscuro de las pantallas nuevas en una rama assets/${tag}-screenshots (sin código), enlazadas en el cuerpo.
- Definición de terminado: plan-v1.md §0.3 (lint, typecheck, test, format:check, RLS + pgTAP en cada tabla nueva, transiciones por RPC, \`pnpm db:types\`, \`supabase db reset\` + \`supabase test db\` en verde, variables en .env.example).
- Migraciones con marca de tiempo posterior a la última de origin/main en el momento del merge: si main avanzó, rebasa y renombra tus migraciones y renumera pgTAP (D27 despliega en orden; \`supabase db push\` rechaza migraciones anteriores a la última remota).
- CI verde (\`gh pr checks <n> --watch\`) y Greptile aprobado: su revisión más reciente sobre el HEAD con "Confidence Score" ≥ 4/5 y sin comentarios de lógica/seguridad sin atender. Polling con gh api cada 30–60 s; si a ~10 min de un push no hay revisión, comenta "@greptileai review" (en bloques 🔒, seguido del foco). Responde cada comentario en su hilo. Tras 5 rondas sin aprobar: no hagas merge, escalated=true.
- Con gate aprobado: \`gh pr merge <n> --squash --delete-branch\` (sin --delete-branch si otro PR usa tu rama como base).
- Paso 0 (idempotencia): \`gh pr list --state all --search "[${tag}]"\` y la rama remota; si ya está merged devuelve merged=true; si hay PR o rama, continúa desde ahí.
- No devuelvas la salida hasta merge o escalación. Libera tus recursos al final.`;

const OUTPUT = (id) => `
## Salida
id='${id}', pr_url, merged, greptile_rounds, final_confidence, escalated, escalation_reason, done (lo hecho, una línea por pieza), summary (español, corto), follow_ups (lo que quedó fuera o necesita decisión de Mateo).`;

const I0 = `Eres el agente I0 en ${REPO}. El PR #83 ("[I0] Pagos, facturación y seguro: respuestas de JP y plan de la ola I", rama v1/d33-jp-answers) registra en docs/decisiones.md las respuestas de JP del 2026-11-07 (D08-E2, D33-E1, D34-E1, D35-E1, D36-E1, D16-E2, D37–D41) y agrega ${PLAN}. Tu único trabajo es llevarlo a main: CI verde y Greptile aprobado, respondiendo cada comentario (corrige el texto si tiene razón: inconsistencias, enlaces, cifras de los ejemplos; no cambies lo que JP y Mateo decidieron). Si el PR ya está merged, devuelve merged=true. Trabaja en tu worktree con \`git fetch origin && git switch v1/d33-jp-answers\` (o \`git switch -c v1/d33-jp-answers --track origin/v1/d33-jp-answers\`); push con \`git push origin HEAD:refs/heads/v1/d33-jp-answers\`. Merge con \`gh pr merge 83 --squash --delete-branch\`.
Commits en inglés, imperativos, terminados con: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>. Gate: Greptile ≥ 4/5 sobre el HEAD, sin comentarios de lógica sin atender; si no hay revisión a ~10 min, comenta "@greptileai review". Tras 5 rondas sin aprobar, escalated=true.
${OUTPUT('I0')}`;

const BLOCKS = [
  { id: 'I1', slug: 'cargo-insurance-terms', title: 'Seguro de carga del cliente y términos aceptados', deps: [], prefix: '443', vp: ['313', '513'], phase: 'Ola IA', secure: true },
  { id: 'I2', slug: 'pilot-support-owner-docs', title: 'Soporte del piloto y documentos del hombre-camión', deps: [], prefix: '453', vp: ['323', '523'], phase: 'Ola IA', secure: false },
  { id: 'I3', slug: 'freight-ledger', title: 'Libro del flete: plazos, comisión, Cobranza y Cartera', deps: [], prefix: '463', vp: ['333', '533'], phase: 'Ola IA', secure: true },
  { id: 'I7', slug: 'backhaul-suggestions', title: 'Carga de regreso', deps: [], prefix: '473', vp: ['343', '603'], phase: 'Ola IA', secure: false },
  { id: 'I5', slug: 'freight-invoices', title: 'Facturas del flete (CFDI)', deps: ['I3'], prefix: '483', vp: ['353', '613'], phase: 'Ola IB', secure: true },
  { id: 'I6', slug: 'brokered-loads', title: 'Cargas intermediadas', deps: ['I3'], prefix: '493', vp: ['363', '623'], phase: 'Ola IB', secure: true },
  { id: 'I4', slug: 'quick-pay', title: 'Pago rápido', deps: ['I5'], prefix: '503', vp: ['373', '633'], phase: 'Ola IC', secure: true },
];

function blockPrompt(b) {
  return `Eres el agente del bloque ${b.id} en ${REPO}. Implementa **solo tu bloque ${b.id} (${b.title})** según ${PLAN} (lee §I completo: introducción, I.0 reglas comunes, I.1 olas y la sección de ${b.id}), abre UN PR, pasa el gate de Greptile y haz merge.

Antes de escribir código: git fetch; lee docs/decisiones.md (D08-E2, D33-E1 a D41 y las que cite tu bloque), las reglas G.0 y H.0 de plan-v1.md, plan-v1.md §0.3, y lo que ya está en origin/main (en especial lo que mergearon los bloques I anteriores: \`git log origin/main --oneline -20\`). Reutiliza, no dupliques. Lo fuera de alcance va a "Seguimiento" del PR. Si el plan contradice el código real (nombres de tablas, rutas), sigue la intención del plan y anótalo en el PR.

Reglas que no se negocian: dinero en centavos bigint y porcentajes en puntos base (I.0.1); ningún lado ve el precio ni los montos del otro (I.0.3), probado con pgTAP; sin claves externas nada falla (I.0.4); no inventes cifras (H.0.5); textos de UI en packages/shared/src/copy/; UI con el kit "Transport · Nativo" en claro y oscuro; los E2E que tu cambio rompa se arreglan en este PR. No crees cuentas ni recursos en la nube ni pongas secretos o el teléfono de JP en el repo.
${GIT(`v1/${b.id}-${b.slug}`, b.id)}
- Título del PR: "[${b.id}] ${b.title}".${b.secure ? ' Bloque 🔒: al pedir revisión, agrega el foco de seguridad de la sección "Revisión 🔒" del plan.' : ''}
${SHARED(b.prefix, b.id)}
${OUTPUT(b.id)}`;
}

function verifyPrompt(b, lens, prefix, built) {
  const lensText = lens === 'functional'
    ? `**Lente funcional:** ¿hace lo que JP pidió y lo que dice la sección ${b.id} de ${PLAN}? Recorre su "Aceptación" de punta a punta con la seed (BD por SQL/RPC autenticándote como cada usuario de la seed, la web con Playwright y, si el bloque toca la app, el flujo de Maestro del bloque). Corre \`supabase db reset\`, \`supabase test db\`, \`pnpm test\`, \`pnpm typecheck --force\`, \`pnpm lint\` y el spec de Playwright del bloque. Comprueba también que lo que dice docs/decisiones.md (las decisiones del bloque) se cumple en el comportamiento, no solo en el código.`
    : `**Lente adversaria (seguridad y datos):** intenta romperlo. Autentícate como cada rol de la seed (cliente, Gerente, coordinador de la unidad y de otra unidad, operador, otra empresa, anon, admin) y trata de leer o cambiar lo que no le toca por todas las vías: select directo, RPC, vistas, Realtime, Storage, notificaciones, enlaces públicos y Edge Functions. Revisa las regla I.0.1 (centavos, puntos base, la suma de partes = total) e I.0.3 (ningún lado ve el precio o los montos del otro), transiciones solo por RPC, carreras (dos llamadas simultáneas), y entradas maliciosas (XML con entidades externas o enorme en I5, montos negativos o enormes, fechas raras). Escribe las consultas reales y su salida como evidencia.`;
  return `Eres un verificador independiente del bloque ${b.id} (${b.title}) en ${REPO}. El agente que lo construyó dice que ya está en main (PR ${built.pr_url || '?'}): "${(built.summary || '').slice(0, 800)}". **No confíes en eso**: compruébalo tú. Tu trabajo es solo comprobar y reportar; NO edites código, NO abras PR, NO hagas push.

Prepara: en tu worktree, \`git fetch origin && git switch --detach origin/main\`, \`pnpm install\`. Lee la sección ${b.id} de ${PLAN} y las decisiones que cita en docs/decisiones.md.

${lensText}

works=true solo si no hay problemas blocker ni major. Cada problema con evidencia reproducible (comando + salida). No reportes gustos de estilo ni cosas que el plan deja fuera de alcance. Si algo no se puede comprobar en esta máquina (p. ej. un PAC real), dilo en checks, no lo cuentes como problema.
${SHARED(prefix, b.id + 'v' + (lens === 'functional' ? 'f' : 's'))}`;
}

function fixPrompt(b, problems, round) {
  const list = problems.map((p, i) => `${i + 1}. [${p.severity}] ${p.what}\n   Evidencia: ${p.evidence}${p.where ? '\n   Dónde: ' + p.where : ''}`).join('\n');
  return `Eres el agente de corrección del bloque ${b.id} (${b.title}) en ${REPO}, ronda ${round}. El bloque ya está en main, pero verificadores independientes encontraron estos problemas:

${list}

Para cada uno: reprodúcelo primero. Si es real, corrígelo con su test (pgTAP, Vitest o E2E) que falle antes y pase después. Si no es real o es fuera de alcance según ${PLAN}, explícalo en el cuerpo del PR (sección "No se cambió") con la evidencia. Si ninguno es real, no abras PR y devuelve merged=true con summary explicándolo.
${GIT(`v1/${b.id}-fix-${round}`, `${b.id}-fix-${round}`)}
- Título del PR: "[${b.id}] Correcciones de la verificación (ronda ${round})".
${SHARED(b.prefix, b.id + 'fix')}
${OUTPUT(b.id + '-fix-' + round)}`;
}

async function withRetry(id, label, phaseName, mk) {
  let r = null, prev = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const cont = attempt === 1 ? '' : `\n\n## Intento ${attempt}: continuación\nUn intento anterior quedó incompleto: ${prev}\nRetoma la rama remota o el PR abierto (Paso 0) y continúa; no rehagas lo hecho. Si dejó commits solo locales en otro worktree (.claude/worktrees/), recupéralos.`;
    r = await agent(mk() + cont, { label: `${label}${attempt > 1 ? ' (intento ' + attempt + ')' : ''}`, phase: phaseName, schema: RESULT, isolation: 'worktree' });
    if (r && r.merged) break;
    if (r && r.escalated && ((r.greptile_rounds || 0) >= 5 || /^billing/i.test(r.escalation_reason || ''))) break;
    prev = r ? `${r.escalation_reason || ''} ${r.summary || ''}`.slice(0, 1500) : 'el agente terminó sin resultado.';
    log(`${id}: intento ${attempt} incompleto`);
  }
  if (!r) r = { id, merged: false, escalated: true, summary: 'El agente terminó sin resultado.' };
  log(r.merged ? `${id} en main ✓ (${r.greptile_rounds ?? '?'} rondas, ${r.final_confidence ?? '?'})` : `${id} NO mergeado: ${r.escalation_reason || r.summary || ''}`);
  return r;
}

async function confirm(b, built) {
  const rounds = [];
  for (let round = 1; round <= 3; round++) {
    const verdicts = (await parallel(['functional', 'adversarial'].map((lens, i) => () =>
      agent(verifyPrompt(b, lens, b.vp[i], built), { label: `${b.id} verificar (${lens === 'functional' ? 'funcional' : 'adversario'}, ronda ${round})`, phase: 'Confirmación', schema: VERDICT, isolation: 'worktree' })))).filter(Boolean);
    const problems = verdicts.flatMap((v) => v.problems || []).filter((p) => p.severity !== 'minor');
    const minors = verdicts.flatMap((v) => v.problems || []).filter((p) => p.severity === 'minor');
    rounds.push({ round, works: verdicts.length === 2 && verdicts.every((v) => v.works) && !problems.length, verdicts: verdicts.map((v) => ({ works: v.works, summary: v.summary, problems: v.problems })) });
    if (verdicts.length < 2) log(`${b.id}: un verificador no devolvió resultado en la ronda ${round}`);
    if (!problems.length && verdicts.length === 2) {
      log(`${b.id} confirmado ✓${minors.length ? ` (${minors.length} menores a Seguimiento)` : ''}`);
      return { id: b.id, confirmed: true, rounds, minors };
    }
    if (round === 3) break;
    log(`${b.id}: ${problems.length} problemas; ronda de corrección ${round}`);
    const fix = await withRetry(`${b.id}-fix-${round}`, `${b.id} corrección ${round}`, 'Confirmación', () => fixPrompt(b, problems, round));
    rounds[rounds.length - 1].fix = { merged: fix.merged, pr_url: fix.pr_url, summary: fix.summary };
    if (!fix.merged) { log(`${b.id}: la corrección no llegó a main`); break; }
    built = { pr_url: fix.pr_url, summary: `${built.summary || ''} | Corrección ${round}: ${fix.summary || ''}` };
  }
  log(`${b.id} NO confirmado tras las rondas de corrección`);
  return { id: b.id, confirmed: false, rounds };
}

const skip = new Set((args && args.skip) || []);

phase('Plan');
const i0 = skip.has('I0') ? { id: 'I0', merged: true, escalated: false, summary: 'Omitido.' } : await withRetry('I0', 'I0 decisiones y plan en main', 'Plan', () => I0);
if (!i0.merged) return { results: [i0], stopped: 'I0 no llegó a main' };

const byId = Object.fromEntries(BLOCKS.map((b) => [b.id, b]));
const memo = {};
const confirmations = {};
function run(id) {
  if (memo[id]) return memo[id];
  memo[id] = (async () => {
    const b = byId[id];
    if (skip.has(id)) return { id, merged: true, escalated: false, summary: 'Omitido por args.skip (ya en main).' };
    const deps = await Promise.all(b.deps.map(run));
    const blocked = b.deps.filter((d, i) => !deps[i] || !deps[i].merged);
    if (blocked.length) {
      log(`${id} se omite: ${blocked.join(', ')} no llegó a main`);
      return { id, merged: false, escalated: false, skipped: true, summary: `Omitido: depende de ${blocked.join(', ')}.` };
    }
    const r = await withRetry(id, `${id} ${b.title}`, b.phase, () => blockPrompt(b));
    if (r.merged) confirmations[id] = confirm(b, r);
    return r;
  })();
  return memo[id];
}
const results = await Promise.all(BLOCKS.map((b) => run(b.id)));
const confirmed = await Promise.all(Object.values(confirmations));

phase('Producción');
const finalCheck = await agent(`Eres el verificador final de la ola I en ${REPO}. Todos los bloques I que llegaron a main ya pasaron su gate y su confirmación por separado; ahora compruebas el conjunto y lo pones en producción. Resultados por bloque: ${JSON.stringify(results.map((r) => ({ id: r.id, merged: r.merged, pr: r.pr_url })))}.

1. En tu worktree: \`git fetch origin && git switch --detach origin/main\`, \`pnpm install\`. Corre todo: \`supabase db reset\`, \`supabase test db\`, \`pnpm lint\`, \`pnpm typecheck --force\`, \`pnpm test\`, \`pnpm format:check\` y la suite completa de Playwright. Recorre de punta a punta el viaje del piloto con la seed: cliente publica (directo y intermediada), oferta, póliza, salida, entrega, carga de regreso, factura del cliente, CFDI del transportista, pago del cliente registrado por el admin, pago al transportista (estándar y rápido), y que Cobranza y Cartera cuadran al centavo.
2. Despliegue (Mateo autorizó desplegar sin preguntar): revisa la última corrida de "Deploy production" de main (\`gh run list --workflow deploy-production.yml -L 3\`). Si las migraciones o las Edge Functions fallaron, diagnostica y reporta (no fuerces nada sobre la base de producción). Si solo falló el paso de Vercel (token vencido), despliega la web a mano: \`git worktree add --detach <tmp>/deploy-wt origin/main\`, \`pnpm install --frozen-lockfile\`, \`npx -y vercel@63.1.2 link --yes --project transport --scope fckyeslols-projects\`, \`npx -y vercel@63.1.2 pull --yes --environment=production --scope fckyeslols-projects\`, \`npx -y vercel@63.1.2 build --prod --scope fckyeslols-projects\`, \`npx -y vercel@63.1.2 deploy --prebuilt --prod --scope fckyeslols-projects\`, y quita el worktree. Prueba de humo: https://transport-five-delta.vercel.app/login responde 200 y las rutas nuevas (/cliente/cartera, /transportista/cobranza, /admin/flete) redirigen al login sin sesión en vez de dar 500. No crees recursos en la nube ni cambies secretos.
3. Cobertura: compara lo que JP pidió (docs/decisiones.md D08-E2, D33-E1 a D36-E1, D16-E2, D37–D41) con lo que hay en main y en producción, y lista lo que falta o quedó distinto.
Tu Supabase local: \`eval "$(sh scripts/local-ports.sh 413)"\` y \`export SUPABASE_PROJECT_ID=transport-ifinal\`; al terminar \`supabase stop --no-backup\` con tus variables. No toques el Supabase en 563xx ni la web en 3020. No edites código ni abras PR: si algo falla, repórtalo con evidencia.`, { label: 'Verificación integral, despliegue y cobertura', phase: 'Producción', schema: {
  type: 'object',
  properties: {
    all_green: { type: 'boolean' },
    checks: { type: 'array', items: { type: 'string' } },
    problems: { type: 'array', items: { type: 'string' } },
    deployed: { type: 'boolean' },
    deploy_notes: { type: 'string' },
    coverage_gaps: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['all_green', 'checks', 'problems', 'deployed', 'coverage_gaps', 'summary'],
}, isolation: 'worktree' });

return { i0, results, confirmed, final: finalCheck };
