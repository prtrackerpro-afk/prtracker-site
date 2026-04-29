# Pull Request — Admin Dashboard multi-canal

**Title:** `feat(admin): admin dashboard multi-canal (Meta + GA4 + vendas + alertas)`

**Body:**

---

## Summary

Constrói painel admin completo em `/admin` integrando Meta Ads, GA4 (via Windsor.ai) e vendas multi-canal (Site / ML / Amazon / Shopee / TikTok). Login email/senha, cron diário de ingestão, sistema de alertas com email opcional.

## O que está pronto

**Auth**
- Login email/senha via Supabase Auth, sessão HTTP-only cookie
- Middleware Astro gate `/admin/*` (302 → `/admin/login` se não auth)
- Whitelist `ADMIN_EMAILS` enforced server-side

**Schema (Supabase Postgres)**
- `meta_campaigns` / `meta_adsets` / `meta_ads` / `meta_insights_daily`
- `ga4_daily` (por source/medium/campaign)
- `sales` (multi-channel)
- `alerts` (severity + status + dedup)
- `audit_log` + `ingestion_runs`
- RLS: authenticated reads, service_role writes

**Dashboards (5)**
- **Overview**: KPIs (spend/revenue/ROAS/conversões) + chart spend×revenue + alertas abertos + status ingestão
- **Meta Ads**: drill Campaign → Adset → Ad com todas métricas + filtros de data
- **GA4 / Site**: sessões, usuários, conversões, top sources/mediums/campaigns
- **Vendas**: cards por canal + tabela de pedidos recentes
- **Alertas**: lista com ações ack/resolve + histórico

**Ingestão (cron diário 03:23 BRT)**
- Meta API: campaigns, adsets, ads, 7d insights por dia × 4 níveis
- Windsor.ai: GA4 daily metrics
- Alerts engine: detecta CPM > R$60, freq > 2.5, ROAS < 1, zero impressões
- Email Resend opcional pra alertas críticos

**Branding**
- Tema dark navy (#01002a) + lime green (#d8ff2c) match brand PR Tracker
- Sidebar com navegação, mobile-friendly, responsive

## Setup pra ativar (5 min — passos em `docs/ADMIN.md`)

1. Criar projeto Supabase free tier + rodar migration SQL
2. (Opcional) Resend account pra email + Windsor.ai API key pra GA4
3. Setar env vars no Vercel (lista completa em `.env.example`)
4. Mergeia este PR
5. `curl -H "Authorization: Bearer $CRON_SECRET" prtracker.com.br/api/cron/ingest?days=90` pra primeira ingestão

## O que NÃO está incluso (próximas iterações)

- DNS `admin.prtracker.com.br` (precisa setar CNAME no DNS provider — instruções no doc)
- Webhook MP → `sales` (atualmente vazio — adicionar quando integrar)
- TikTok / Amazon / ML / Shopee na tabela sales (placeholders por ora — Windsor.ai conecta quando configurado)
- Breakdowns Meta (placement, age, gender)
- Funil de conversão visual

## Test plan

- [ ] `npm run build` passa (✅ validado local — build em 9.32s)
- [ ] `/` (homepage) e produtos continuam estáticos (sem regressão)
- [ ] `/admin` redireciona pra `/admin/login` quando não auth
- [ ] Login com email correto + senha entra; com email errado mostra "não autorizado"
- [ ] Dashboards renderizam (vazios até cron rodar)
- [ ] Cron endpoint requer Authorization Bearer
- [ ] First ingest popula tabelas

## Arquitetura

Astro SSR routes (`output: "static"` global, `prerender = false` per route admin) + React islands pra charts (Recharts) + Tailwind 4 com brand tokens existentes.

Site existente continua 100% estático (homepage, produtos, checkout, etc.). Apenas `/admin/*` e `/api/admin/*` + `/api/cron/*` rodam SSR via Vercel Functions.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
