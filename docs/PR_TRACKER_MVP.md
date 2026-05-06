# PR Tracker — App MVP (`/pr/*`)

Caderno de troféus + funil pra venda física. Branch: `feat/pr-tracker-app`.

## O que esse scaffold já entrega

| Camada | Arquivo | Estado |
|--------|---------|--------|
| **Schema DB** | [supabase/migrations/0005_pr_tracker.sql](../supabase/migrations/0005_pr_tracker.sql) | Pronta. `pr_athletes`, `pr_records`, `pr_boxes`, `pr_box_members` + RLS + função `pr_box_leaderboard` (SECURITY DEFINER). |
| **Catálogo de movimentos** | [src/lib/pr/exercises.ts](../src/lib/pr/exercises.ts) | 20 movimentos do My PR Set + Deadlift/Bench/Squat → mapeados pro produto correto. |
| **Cálculo de anilhas** | [src/lib/pr/plates.ts](../src/lib/pr/plates.ts) | Greedy split respeitando limites da tabela oficial. Gera querystring para o configurador. |
| **Auth helper** | [src/lib/pr/auth.ts](../src/lib/pr/auth.ts) | `getAuthenticatedAthlete()` — qualquer usuário Supabase, sem allowlist. |
| **DB helper** | [src/lib/pr/db.ts](../src/lib/pr/db.ts) | `insertPR` (com detecção de PR-novo), `listOwnRecords`, `getRecord`. |
| **Middleware** | [src/middleware.ts](../src/middleware.ts) | Gate `/pr/*` (exceto `/pr/login`, `/pr/auth/*`, `/pr/box/*`). |
| **Login (magic link)** | [src/pages/pr/login.astro](../src/pages/pr/login.astro) + [api/pr/auth/magic-link.ts](../src/pages/api/pr/auth/magic-link.ts) | OTP via email Supabase. |
| **Callback** | [src/pages/pr/auth/callback.astro](../src/pages/pr/auth/callback.astro) | Troca code por sessão e seta cookies. |
| **Dashboard** | [src/pages/pr/index.astro](../src/pages/pr/index.astro) | Lista PRs + FAB. Sem chart ainda. |
| **Log de PR** | [src/pages/pr/log.astro](../src/pages/pr/log.astro) | Form mínimo, ≤30s. |
| **Celebração** | [src/pages/pr/celebrate/[id].astro](../src/pages/pr/celebrate/[id].astro) | Mostra PR + delta + 2 CTAs (troféu, card). |
| **Box leaderboard** | [src/pages/pr/box/[slug].astro](../src/pages/pr/box/[slug].astro) | Público, lê via RPC `pr_box_leaderboard`. |
| **Card de compartilhamento** | [api/pr/card/[id].svg.ts](../src/pages/api/pr/card/[id].svg.ts) | **SVG 1080×1920** (dark navy + lime). Story upload mobile não aceita SVG — substituir por PNG real (Satori/Resvg) em TODO #3. |

## Pré-requisitos pra subir

1. **Rodar migration 0005** no Supabase (já tá em `supabase/migrations/`).
2. **Habilitar magic-link no Supabase Auth** (Project → Auth → Providers → Email → Magic Link).
3. **Email template** customizado no Supabase Auth (template "Magic Link") — copy curta, branding PR Tracker.
4. **Site URL allowlist** no Supabase Auth: adicionar `https://prtracker.com.br/pr/auth/callback` em "Redirect URLs".
5. **Env** já existentes — não precisa adicionar nada (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_SITE_URL` já configurados).

## O que falta pro V1 ficar completo

### Crítico (sem isso o funil não fecha)

- [x] **Configurador aceita query params** — `?w=`, `?ex=`, `?p=`, `?from=pr-celebrate`, `?prId=` integrados no `BarbellConfigurator.astro`. Plate IDs alinhados com `lib/catalog.ts`.
- [ ] **Card PNG real** — atualmente o endpoint serve SVG. Pra story do Instagram, precisa ser PNG. Opções: `@vercel/og` (Satori) ou `resvg-js`. Adicionar dep + reescrever endpoint.
- [x] **Onboarding** — `/pr/onboarding` + `/api/pr/profile` + middleware redirect quando `display_name` for null.
- [x] **Tracking de conversão PR→troféu** — `prId` stashado no sessionStorage pelo configurador, `/api/pr/records/[id]/trophy-purchase` chamado em `/obrigado` com `payment_id` da MP.

### Importante (V1.1)

- [x] **Gráfico de progressão** — `PRProgressionChart.tsx` (Recharts island) por movimento, com PR-true marcado em destaque.
- [x] **Stats no dashboard** — total PRs, dias desde última, maior peso já registrado.
- [x] **Celebrate inline preview** — card SVG renderizado direto na página, count-up no peso, botão "Compartilhar" usando Web Share API.
- [ ] **Editar/deletar PR** (UPDATE/DELETE na API, modal de confirmação no dashboard).
- [ ] **Ingresso em box** — endpoint `POST /api/pr/box/:slug/join` que insere em `pr_box_members`.
- [ ] **Perfil público do atleta** — `/pr/atleta/:handle` mostrando PRs + box.

### Roadmap (V2+)

- [ ] **Box owner dashboard** — coach vê PRs do box, exporta CSV, envia kit pro aluno em 1 clique.
- [ ] **Push PWA** — após X dias sem PR, lembrete "que tal um teste de força?".
- [ ] **Filtro AR** no TikTok Effect House (depende de validar com 50+ usuários ativos).
- [ ] **Feed social interno** — timeline de PRs dos box mates.

## Decisões registradas

- **Auth**: magic link (sem senha) — atleta registra-se com 1 click no email. `signInWithOtp({ shouldCreateUser: true })`.
- **Sem allowlist**: qualquer email vira atleta. Diferente de admin (ADMIN_EMAILS).
- **RLS estrita**: atleta só lê/escreve **próprios** registros. Leaderboard de box passa pela função `pr_box_leaderboard` (SECURITY DEFINER) pra não cair em recursão de policy.
- **Detecção de PR no insert** (não trigger): o backend grava `is_personal_record=true` antes de retornar, e a página de celebração pula direto da resposta. Trigger seria mais "correto" porém perderia a info do *anterior*.
- **Card como SVG** no V1: PNG real custa uma dep (Satori/Resvg) e tempo. SVG serve pra prova de conceito e até funciona em alguns embeds; a polish vem quando validar tração.
- **Sem nova layout**: pages usam HTML inline com `global.css`. Quando crescer, promove pra `PRLayout.astro` similar a `AdminLayout`.

## Métricas de sucesso (V1)

Logar manualmente via `pr_records.created_at`/`trophy_purchase_id` enquanto não tem dashboard:

- ≥30% dos atletas que logam o 1º PR voltam pra logar um 2º em 30 dias
- ≥10% dos PRs registrados (`is_personal_record=true`) clicam **Transforme em troféu** (UTM `from=pr-celebrate`)
- ≥3% conversão clique→checkout (vs ~1-2% ads frio)

## Como testar localmente

```bash
npm run dev
# 1. abrir http://localhost:4321/pr → redireciona pra /pr/login
# 2. inserir email → magic link cai no Inbucket (Supabase local) ou email real
# 3. clicar link → /pr/auth/callback → /pr
# 4. /pr/log → registrar PR → se for PR, /pr/celebrate/{id}
```
