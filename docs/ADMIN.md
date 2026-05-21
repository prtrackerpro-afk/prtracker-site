# PR Tracker — Admin Dashboard

Dashboard interno multi-canal pra acompanhar Meta Ads, GA4, e vendas (Site / Mercado Livre / Amazon / Shopee / TikTok). Acessível em `/admin` após login.

## Setup (5 min — Felipe roda ao acordar)

### 1. Criar projeto Supabase (free tier)

1. Abre https://supabase.com/dashboard/projects → **New project**
2. Nome: `pr-tracker-admin` · região `South America (sa-east-1)` · senha forte
3. Aguarda ~2min provisionar
4. **Project Settings → API**: copia
   - URL (`https://xxx.supabase.co`)
   - `anon` key
   - `service_role` key (secret!)
5. **SQL Editor → New query**: cola o conteúdo de `supabase/migrations/0001_init.sql` e roda
6. **Authentication → Users → Add user → Create new user**:
   - Email: `contato@prtracker.com.br`
   - Password: `MYpr171##`
   - Auto-confirm: ON

### 2. (Opcional) Criar conta Resend pra alertas por email

1. https://resend.com/signup com `contato@prtracker.com.br`
2. **API Keys → Create API Key** (all permissions, name: `pr-tracker-admin`)
3. Copia a key (começa com `re_`)
4. Pula este passo se não quiser email — alertas continuam no dashboard

### 3. Configurar Service Account Google Cloud pra GA4

GA4 é lido via Data API com Service Account (Windsor.ai foi descontinuado em mai/2026).

1. **GCP Console** → projeto com Analytics Data API habilitada → **IAM & Admin → Service Accounts**
2. Criar SA `analytics-reader` → criar chave JSON → baixar
3. **GA4 Admin** (`analytics.google.com`) → propriedade `prtracker.com.br` (525987283) → **Property Access Management** → adicionar o email do SA como **Viewer**
   - Se a UI rejeitar o email do SA com "doesn't match a Google Account", use a Admin API v1alpha direto (ver memória `project_ga4_service_account.md`)
4. Codificar a chave em base64:
   - PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("sa.json"))`
   - Linux/Mac: `base64 -w0 < sa.json`
5. Guardar o resultado pra colar em `GA4_SA_KEY_BASE64` no Vercel (passo 4)

### 4. Setar variáveis de ambiente Vercel

No Vercel dashboard do projeto `prtracker-site` → **Settings → Environment Variables**, adiciona (Production + Preview + Development):

```
SUPABASE_URL=<url do passo 1.4>
SUPABASE_ANON_KEY=<anon key do passo 1.4>
SUPABASE_SERVICE_ROLE_KEY=<service_role key do passo 1.4>
ADMIN_EMAILS=contato@prtracker.com.br
META_ACCESS_TOKEN=<copiar do Tráfego/.env>
META_AD_ACCOUNT_ID=act_1936343516981196
META_API_VERSION=v23.0
GA4_PROPERTY_ID=525987283
GA4_SA_KEY_BASE64=<base64 do JSON da SA — passo 3>
RESEND_API_KEY=<key do passo 2, se criou>
ALERT_EMAIL_TO=contato@prtracker.com.br
CRON_SECRET=<gerar com `openssl rand -hex 32`>
```

### 5. Mergeia o PR

Abre o PR `feat/admin-dashboard`, valida o preview Vercel, mergeia. Vercel reconstrói prod.

### 6. Primeira ingestão manual (popular DB)

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://prtracker.com.br/api/cron/ingest?days=90"
```

Depois disso o cron Vercel roda diariamente às **03:23 BRT**.

### 7. (Opcional) Apontar `admin.prtracker.com.br`

No DNS provider (onde está hospedado prtracker.com.br):

```
Type: CNAME
Name: admin
Target: cname.vercel-dns.com
TTL: 3600
```

Depois no Vercel: **Settings → Domains → Add `admin.prtracker.com.br`**.

Enquanto não tiver feito isso, acessa via `prtracker.com.br/admin`.

## Arquitetura

```
src/
├── pages/admin/                  # Rotas SSR /admin/*
│   ├── login.astro               # Login email/senha
│   ├── index.astro               # Overview executivo
│   ├── meta.astro                # Meta Ads (drill campaign → adset → ad)
│   ├── ga4.astro                 # GA4 / Site (via Data API com Service Account)
│   ├── sales.astro               # Multi-canal vendas
│   └── alerts.astro              # Histórico + ações
├── pages/api/
│   ├── admin/
│   │   ├── login.ts              # POST autentica
│   │   ├── logout.ts             # POST encerra sessão
│   │   └── alerts/[id].ts        # PATCH ack/resolve
│   └── cron/
│       └── ingest.ts             # GET cron diário (Vercel)
├── lib/
│   ├── supabase/server.ts        # clients (anon + service_role)
│   ├── admin/
│   │   ├── auth.ts               # whitelist + auth helper
│   │   ├── meta-api.ts           # Meta Marketing API client
│   │   ├── meta-ingest.ts        # Pull → Supabase upsert
│   │   ├── ga4-direct.ts         # GA4 Data API client (SA JWT)
│   │   ├── ga4-ingest.ts         # GA4 daily → ga4_daily upsert
│   │   ├── windsor-api.ts        # Windsor.ai client (deprecated, só pra TikTok Ads)
│   │   ├── windsor-ingest.ts     # (deprecated — substituído por ga4-ingest)
│   │   ├── alerts-engine.ts      # Thresholds + criação de alerts
│   │   ├── email.ts              # Resend (opcional)
│   │   └── format.ts             # Helpers BRL, agregação
│   └── ...
├── components/admin/
│   ├── KpiCard.astro
│   ├── DateRangeSelect.astro
│   └── TrendChart.tsx            # Recharts
├── layouts/AdminLayout.astro     # Sidebar + auth check
├── middleware.ts                 # Gate /admin/* (redirect → /admin/login)
supabase/migrations/
└── 0001_init.sql                 # Schema completo
```

## Operação

- **Cron diário** roda às **03:23 BRT** (06:23 UTC) — pulla 7d retroativos por padrão.
- **Backfill**: `?days=90` na URL do cron (ou no `vercel.json`)
- **Alertas** avaliam dados da última 24h — duplicatas são deduped por `entity_id + type + status=open`
- **Auditoria**: todas ações admin (login, alert ack/resolve) gravam em `audit_log`

### Thresholds atuais

| Tipo | Severidade | Disparo |
|---|---|---|
| `high_cpm` | warning | CPM > R$ 60 na campanha |
| `high_frequency` | warning | Frequency > 2.5 |
| `zero_impressions` | critical | 0 impressões + 0 spend em 24h |
| `low_roas` | warning | Spend > R$ 50 e ROAS < 1 |

Pra adicionar threshold, editar `src/lib/admin/alerts-engine.ts` e redeployar.

## Próximos passos sugeridos

- [ ] Adicionar gráficos de breakdown (placement, age, gender) na aba Meta
- [ ] Webhook MP → tabela `sales` (channel='site') automaticamente
- [ ] Conectar Mercado Livre / Amazon / Shopee via APIs nativas e ingerir vendas
- [ ] Substituir TikTok Ads ingest (último uso de Windsor.ai) por TikTok Business API direta
- [ ] Funil de conversão (ViewContent → ATC → IC → Purchase) com taxas
- [ ] Cohort de creators/cupons (LTV por origem)
- [ ] Custom alerts no UI sem precisar deploy
- [ ] Mobile UI (atualmente desktop-first)
- [ ] Custom domain `admin.prtracker.com.br`
- [ ] Resend custom domain (`noreply@prtracker.com.br`)

## Segurança

- Middleware Astro gate antes de qualquer rota `/admin/*` (HTTP 302 → login)
- Whitelist `ADMIN_EMAILS` aplicada server-side (browser não pode bypass)
- RLS Supabase: `is_admin()` requer `auth.uid()` não-nulo (defense in depth)
- Service role key NUNCA exposta ao browser — só usada em endpoints `/api/`
- Cron protegido por `CRON_SECRET` em header Authorization
- Cookies HTTP-only, secure, sameSite=lax
- Headers de segurança no `vercel.json` (X-Frame-Options, etc.)

## Troubleshooting

**Login retorna `not_admin`**: email não está em `ADMIN_EMAILS`. Adicionar no Vercel env vars (separados por vírgula) e redeploy.

**Login retorna `invalid_credentials`**: usuário não existe em Supabase Auth. Criar em **Authentication → Users → Add user**.

**Dashboard vazio**: cron ainda não rodou. Disparar manualmente:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://prtracker.com.br/api/cron/ingest?days=90"
```

**GA4 não popula**: `GA4_SA_KEY_BASE64` não configurada, ou Service Account sem acesso de Viewer na property 525987283. Conferir resposta do cron — se `result.ga4.skipped == true`, env não foi lida. Se `result.ga4.error` contém `403 PERMISSION_DENIED`, ajustar Property Access Management no GA4 Admin.

**Email de alerta não chega**: `RESEND_API_KEY` faltando ou domínio não verificado (free tier usa `onboarding@resend.dev`, deveria funcionar pra testes).
