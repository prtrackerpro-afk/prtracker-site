# `docs/_archive/` — arquivos históricos

Documentos que já tiveram utilidade mas hoje só servem como referência histórica. Foram movidos pra cá em 2026-05-14 pra reduzir ruído em `docs/` sem perder o conteúdo.

## Quando reativar

Mover de volta pra `docs/` (com `git mv`) se voltarem a ser fonte ativa de operação. Editar in-place não tem valor — o ponto desta pasta é congelar o estado.

## O que está aqui

| Arquivo | Por que arquivado |
|---|---|
| `HANDOFF-2026-04-29.md` | Snapshot de transição de uma sessão específica; o admin dashboard descrito já está em produção. |
| `SESSION-PROGRESS.md` | Log de sessão de 2026-05-07 (cycles 102-160); status real fica em `docs/ROADMAP-500-CYCLES.md`. |
| `current-site-inventory.md` | Inventário do site WordPress legado (pré-migração Astro). Útil só se houver dúvida de redirect histórico. |
| `design-review.md` | Audit visual ad-hoc do admin dashboard em 2026-04-29; issues já foram tratadas. |
| `PR-BODY.md` | Template descartável de body de PR (consumido na época). |
| `AMAZON_SETUP.md` | Setup placeholder do canal Amazon — feature não priorizada hoje. Reativar quando entrar no roadmap. |
| `SHOPEE_SETUP.md` | Idem Amazon. |
| `ML_SETUP.md` | Setup do Mercado Livre — credenciais já estão configuradas; o doc detalha o handshake inicial. Mantido aqui pra referência se precisar refazer OAuth. |
| `GOOGLE_MERCHANT_SETUP.md` | Setup do Google Merchant Center — não ativo no funil atual. |

## O que NÃO foi arquivado (mantido em `docs/`)

- `BLING_SETUP.md` — guia operacional ativo
- `ADMIN.md` — referência do painel admin em produção
- `PR_TRACKER_MVP.md` / `PR_TRACKER_VISION.md` / `ROADMAP-500-CYCLES.md` — visão de produto + roadmap atual
- `GYM-PROPORTIONS-AUDIT.md` — specs vigentes dos builders 3D
