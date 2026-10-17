export const meta = {
  name: 'transport-redesign',
  description: 'Rediseño visual "Transport · Nativo": tokens, kits de UI y todas las pantallas de la app y la web, un PR por bloque con gate de Greptile (docs/plan-rediseno.md)',
  whenToUse: 'Ejecutar el plan de rediseño de docs/plan-rediseno.md (U1–U9) con un agente Opus por bloque. args opcionales: { skip: ["U1", ...] } para bloques ya en main, { only: ["U6", "U7"] } para correr un subconjunto.',
  phases: [
    { title: 'Plan', detail: 'U0: el plan de rediseño en main' },
    { title: 'Base', detail: 'U1 tokens, fuentes y tema' },
    { title: 'Kits', detail: 'U2 kit móvil · U6 kit web y shell' },
    { title: 'Pantallas', detail: 'U3, U4, U5 móvil · U7, U8 web' },
    { title: 'Cierre', detail: 'U9 limpieza, tema oscuro, E2E y capturas' },
  ],
}

const REPO = 'mateopirela/transport'
const PLAN = 'docs/plan-rediseno.md'
const MODEL = 'opus'

const RESULT = {
  type: 'object',
  properties: {
    id: { type: 'string' }, pr_url: { type: 'string' }, merged: { type: 'boolean' },
    greptile_rounds: { type: 'integer' }, final_confidence: { type: 'string' },
    escalated: { type: 'boolean' }, escalation_reason: { type: 'string' },
    done: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' }, follow_ups: { type: 'array', items: { type: 'string' } },
  },
  required: ['id', 'merged', 'escalated', 'summary'],
}

// La referencia visual: el sistema "C · Nativo" de la app de ShowBe. Solo lectura.
const REFERENCE = `
## Referencia visual (solo lectura, fuera del repo)
El sistema que Mateo quiere es el de la app de ShowBe. Léelo antes de diseñar o construir cualquier componente:
- /Users/mateopirela/Desktop/projects/showbe/showbe-app/apps/mobile/src/theme.tsx (tokens, escala tipográfica, useTheme, opciones de cabecera)
- /Users/mateopirela/Desktop/projects/showbe/showbe-app/apps/mobile/src/components/ui.tsx (Screen, Group, Cell, Button, BottomBar, Pill, Empty, Skeleton, Segmented, SearchBox…)
- /Users/mateopirela/Desktop/projects/showbe/showbe-app/apps/mobile/src/components/tab-bar.tsx y sheet.tsx
- Pantallas de ejemplo: /Users/mateopirela/Desktop/projects/showbe/showbe-app/apps/mobile/src/app/
Adapta, no copies a ciegas: Transport tiene su acento (azul) y sus tokens en ${PLAN} §1. No edites nada en el repo de ShowBe.`

const SHARED = (prefix, id) => `
## Recursos compartidos de esta máquina (IMPORTANTE)
- Mateo puede estar usando la app: Supabase del proyecto "transport" en puertos 563xx, web en 3020, Metro en 8081 y el simulador iPhone 18 Pro. **No los detengas ni los toques.** Nunca corras \`supabase stop\` sin tu propio SUPABASE_PROJECT_ID. El iPhone 17e es de otro proyecto (ShowBe): no lo toques.
- Tu Supabase local: \`eval "$(sh scripts/local-ports.sh ${prefix})"\` y \`export SUPABASE_PROJECT_ID=transport-${id.toLowerCase()}\` en cada terminal. Toma el candado (\`mkdir /tmp/transport-supabase.lock\`; si tiene >60 min, bórralo) solo mientras corres \`supabase start\` / \`db reset\`. Al terminar: \`supabase stop --no-backup\` con TUS variables. No hay psql en el host: \`docker exec supabase_db_<project> psql -U postgres\`.
- Simulador para capturas y Maestro: iPhone 18 Pro Max (B4D89744-B091-42B9-8AD0-5F29F0A2CF31), Metro en 8092 (\`expo start --dev-client --port 8092\`). Si otro agente lo está usando (\`xcrun simctl list devices booted\`, procesos de Maestro o Metro en 8092), espera. Maestro: ~/.local/maestro/maestro/bin con JAVA_HOME=~/.local/jdk/jdk-17.0.20.1+1/Contents/Home. Si cambias módulos nativos (expo-blur, bottom-sheet) haz la rebuild: \`pnpm --filter @transport/mobile exec expo run:ios --device <id> --no-bundler\`; con Xcode 27.1, si falla con "cannot find type '__ObjC::expo'", borra node_modules/.pnpm/expo-modules-jsi@57*/node_modules/expo-modules-jsi/apple/Products/ExpoModulesJSI.xcframework y compila con EXPO_USE_PRECOMPILED_MODULES=0. Metro reescribe apps/mobile/tsconfig.json: reviértelo antes de commitear. apps/mobile/.env (ignorado por git) apunta a tu Supabase con EXPO_PUBLIC_E2E_FAKE_CAMERA=1.
- Flujos móviles: \`pnpm e2e:mobile\` (apps/mobile/.maestro/README.md), o un flujo suelto con \`maestro test\`. Web: Playwright en e2e/ (\`pnpm --filter @transport/web build\` y \`pnpm --filter @transport/e2e e2e\` con NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY de tu Supabase). Capturas web con Playwright a 1280 y 390 px.
- Turbo cachea typecheck: usa \`pnpm typecheck --force\` antes de dar por bueno.`

const GIT = (branch) => `
## Git y gate (D14)
- Worktree aislado. \`git fetch origin\` y \`git switch -c ${branch} --no-track origin/main\`. Push SIEMPRE con \`git push -u origin HEAD:refs/heads/${branch}\`. Nunca push a main. \`pnpm install\` si falta node_modules.
- Commits en inglés, imperativos, terminados con: Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
- PR según .github/pull_request_template.md (en español), cuerpo terminado con: 🤖 Generated with [Claude Code](https://claude.com/claude-code). Capturas en claro y oscuro de cada pantalla migrada en una rama assets/${branch.split('/')[1].split('-')[0]}-screenshots (sin código), enlazadas en una tabla del cuerpo.
- Definición de terminado: plan-v1.md §0.3 y ${PLAN} §0.3 (contraste AA, un primario por pantalla, sin sombras, sin valores sueltos, tema oscuro revisado, copy intacto, E2E de la zona en verde, format:check).
- CI verde (\`gh pr checks <n> --watch\`) y Greptile aprobado: su revisión más reciente sobre el HEAD con "Confidence Score" ≥ 4/5 y sin comentarios de lógica/seguridad sin atender. Polling con gh api cada 30–60 s; si a ~10 min de un push no hay revisión, comenta "@greptileai review". Responde cada comentario en su hilo. Tras 5 rondas sin aprobar: no hagas merge, escalated=true.
- Si CI rechaza los jobs con "recent account payments have failed or your spending limit needs to be increased", no es tu código: deja el PR listo y devuelve escalated=true con escalation_reason que empiece por "billing".
- Con gate aprobado: \`gh pr merge <n> --squash --delete-branch\`. Si main avanzó: rebase, repite checks y gate. Antes de abrir el PR y antes del merge, rebasa y migra también las pantallas nuevas que otros bloques (G) hayan agregado en tu zona (${PLAN} §0.4).
- Paso 0 (idempotencia): revisa \`gh pr list --state all --search "[${branch.split('/')[1].split('-')[0]}]"\` y la rama remota; si ya está merged devuelve merged=true; si hay PR o rama, continúa desde ahí.
- No devuelvas la salida hasta merge o escalación. Libera tus recursos al final (Supabase, Metro, simulador).`

const OUTPUT = (id) => `
## Salida
id='${id}', pr_url, merged, greptile_rounds, final_confidence, escalated, escalation_reason, done (lo hecho, una línea por pantalla o componente), summary (español, corto), follow_ups (lo que quedó fuera o necesita decisión de Mateo).`

const U0 = `Eres el agente U0 en ${REPO}. El plan de rediseño visual está en un PR de documentación abierto por Mateo (busca \`gh pr list --state all --search "[U0]"\`; agrega ${PLAN} y una línea en docs/plan-v1.md). Tu único trabajo es llevarlo a main: CI verde y Greptile aprobado, respondiendo cada comentario (corrige el texto si tiene razón; no cambies las decisiones del plan). Si Greptile pide algo que contradiga lo que Mateo decidió (una sola fuente, un solo acento, píldoras, sin sombras, tema oscuro), explícalo en el hilo. Si el PR ya está merged, devuelve merged=true.
${GIT('docs/U0-redesign-plan')}
${SHARED('733', 'U0')}
${OUTPUT('U0')}`

const BLOCKS = [
  { id: 'U1', slug: 'design-tokens-theme', title: 'Diseño: tokens, fuentes y tema claro/oscuro', deps: [], prefix: '743', phase: 'Base' },
  { id: 'U2', slug: 'mobile-ui-kit', title: 'Móvil: kit de UI "Nativo"', deps: ['U1'], prefix: '753', phase: 'Kits' },
  { id: 'U6', slug: 'web-ui-kit-shell', title: 'Web: kit de UI, shell y acceso', deps: ['U1'], prefix: '763', phase: 'Kits' },
  { id: 'U3', slug: 'mobile-access-account', title: 'Móvil: acceso, registro, empresa y cuenta', deps: ['U2'], prefix: '773', phase: 'Pantallas' },
  { id: 'U4', slug: 'mobile-carrier', title: 'Móvil: pantallas del transportista', deps: ['U2'], prefix: '783', phase: 'Pantallas' },
  { id: 'U5', slug: 'mobile-operator', title: 'Móvil: pantallas del operador', deps: ['U2'], prefix: '793', phase: 'Pantallas' },
  { id: 'U7', slug: 'web-shipper', title: 'Web: pantallas del cliente', deps: ['U6'], prefix: '803', phase: 'Pantallas' },
  { id: 'U8', slug: 'web-admin-public', title: 'Web: admin y páginas públicas', deps: ['U6'], prefix: '813', phase: 'Pantallas' },
  { id: 'U9', slug: 'redesign-closeout', title: 'Cierre del rediseño: limpieza, tema oscuro, E2E y capturas', deps: ['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7', 'U8'], prefix: '823', phase: 'Cierre' },
]

function blockPrompt(b) {
  return `Eres el agente del bloque ${b.id} en ${REPO}. El plan de rediseño visual "Transport · Nativo" está en main: ${PLAN}. Implementa **solo tu bloque ${b.id}** según su sección (§2) y el sistema visual (§1), abre UN PR, pasa el gate de Greptile y haz merge.

Antes de escribir código: git fetch; lee ${PLAN} completo (§0 reglas, §1 sistema, §2 tu bloque, §0.4 convivencia con §G), plan-v1.md §0.3, y lo que ya mergearon los bloques U anteriores (git log origin/main; en especial el kit de tu plataforma: apps/mobile/src/components/ui.tsx y theme.tsx, o apps/web/src/components/ui/ y globals.css). Reutiliza el kit; no inventes variantes. Lo fuera de alcance va a "Seguimiento" del PR.

Reglas que no se negocian (${PLAN} §0.1 y §0.3): es solo presentación (ni copy, ni rutas, ni consultas, ni RPC, ni migraciones); los textos, roles de accesibilidad y etiquetas que usan Playwright y Maestro se conservan; un primario por pantalla; sin sombras; nada de colores, radios ni tamaños escritos a mano en pantallas; tema oscuro revisado; capturas claro/oscuro de cada pantalla; los E2E de tu zona en verde (corre los flujos indicados en tu sección y arréglalos en este PR si tu cambio de estructura los rompió).

Criterio estético, por si el plan deja dudas: menos es más. Aire, jerarquía clara con una sola familia, un solo acento, celdas blancas sobre página cálida, bordes finos, píldoras, esqueletos, oraciones cortas. Si una pantalla queda "ocupada", quita, no agregues.
${REFERENCE}
${GIT(`feat/${b.id}-${b.slug}`)}
- Título del PR: "[${b.id}] ${b.title}".
${SHARED(b.prefix, b.id)}
${OUTPUT(b.id)}`
}

async function withRetry(id, label, phaseName, mk) {
  let r = null, prev = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    const cont = attempt === 1 ? '' : `\n\n## Intento ${attempt}: continuación\nUn intento anterior quedó incompleto: ${prev}\nRetoma la rama remota o el PR abierto (Paso 0) y continúa; no rehagas lo hecho. Si dejó commits solo locales en otro worktree (.claude/worktrees/), recupéralos.`
    r = await agent(mk() + cont, { label: `${label}${attempt > 1 ? ' (intento ' + attempt + ')' : ''}`, phase: phaseName, schema: RESULT, isolation: 'worktree', model: MODEL })
    if (r && r.merged) break
    if (r && r.escalated && ((r.greptile_rounds || 0) >= 5 || /^billing/i.test(r.escalation_reason || ''))) break
    prev = r ? `${r.escalation_reason || ''} ${r.summary || ''}`.slice(0, 1500) : 'el agente terminó sin resultado.'
    log(`${id}: intento ${attempt} incompleto`)
  }
  if (!r) r = { id, merged: false, escalated: true, summary: 'El agente terminó sin resultado.' }
  log(r.merged ? `${id} en main ✓ (${r.greptile_rounds ?? '?'} rondas, ${r.final_confidence ?? '?'})` : `${id} NO mergeado: ${r.escalation_reason || r.summary || ''}`)
  return r
}

const skip = new Set((args && args.skip) || [])
const only = args && args.only ? new Set(args.only) : null
const billingBlocked = (r) => r && r.escalated && /^billing/i.test(r.escalation_reason || '')

phase('Plan')
const u0 = skip.has('U0') ? { id: 'U0', merged: true, escalated: false, summary: 'Omitido por args.skip.' } : await withRetry('U0', 'U0 plan de rediseño en main', 'Plan', () => U0)
if (!u0.merged) return { results: [u0], stopped: billingBlocked(u0) ? 'CI bloqueado por facturación de GitHub Actions' : 'U0 no llegó a main' }

const byId = Object.fromEntries(BLOCKS.map(b => [b.id, b]))
const memo = {}
let stopped = null
function run(id) {
  if (memo[id]) return memo[id]
  memo[id] = (async () => {
    const b = byId[id]
    if (skip.has(id)) return { id, merged: true, escalated: false, summary: 'Omitido por args.skip (ya en main).' }
    const deps = await Promise.all(b.deps.map(run))
    if (stopped) return { id, merged: false, escalated: false, skipped: true, summary: `Omitido: ${stopped}.` }
    const blocked = b.deps.filter((d, i) => !deps[i] || !deps[i].merged)
    if (blocked.length) {
      log(`${id} se omite: ${blocked.join(', ')} no llegó a main`)
      return { id, merged: false, escalated: false, skipped: true, summary: `Omitido: depende de ${blocked.join(', ')}.` }
    }
    if (only && !only.has(id)) return { id, merged: false, escalated: false, skipped: true, summary: 'Fuera de args.only.' }
    const r = await withRetry(id, `${id} ${b.title}`, b.phase, () => blockPrompt(b))
    if (billingBlocked(r)) stopped = 'CI bloqueado por facturación de GitHub Actions'
    return r
  })()
  return memo[id]
}
const results = await Promise.all(BLOCKS.map(b => run(b.id)))
return { results: [u0, ...results], stopped }
