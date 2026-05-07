# Auditoria de proporções — gym virtual

**Cycle 102 (2026-05-07)** — primeira auditoria sistemática das medidas
de cada equipamento contra o avatar (1.95m altura) e contra
especificações reais de mercado (Rogue, Eleiko, Concept2).

## Avatar referência

| Componente | Medida atual | Real (BR median) |
|------------|-------------:|-----------------:|
| Altura total | 1.95m | 1.74m |
| Cabeça (centro) | 2.00m | 1.62m |
| Ombros | 1.65m | 1.45m |
| Quadril | 1.00m | 0.95m |
| Joelho | 0.55m | 0.50m |
| Pé (sola) | 0.00m | 0.00m |

**Decisão**: avatar 10-12% mais alto que median. **Manter** — é estilo "stylized
hero" propositadamente, pra dar presença visual no gym dobrado em tamanho.

---

## Equipamentos auditados

### 1. Power Rack

| Medida | Atual | Spec real | Status |
|--------|------:|----------:|:------:|
| Altura total | 2.60m | 2.30-2.45m | ⚠️ 8% alto |
| Largura (W) | 1.60m | 1.20-1.40m | ⚠️ 14% largo |
| Profundidade (D) | 1.40m | 1.00-1.30m | ⚠️ 8% prof |
| J-hook altura | 1.25m | 1.10-1.40m | ✅ ok |
| Pull-up bar topo | 2.58m | 2.30-2.40m | ⚠️ alto |
| Coluna espessura | 0.09m | 0.06-0.08m | ⚠️ grossa |
| Furos ajuste | 24 furos | ~20-30 | ✅ ok |

**Plano**: cycle 103 reduz altura pra 2.40m, W=1.40m, D=1.20m.

### 2. Bench Press

| Medida | Atual | Spec real | Status |
|--------|------:|----------:|:------:|
| Comprimento | 1.40m | 1.20-1.40m | ✅ ok |
| Largura pad | 0.34m | 0.25-0.30m | ⚠️ 13% largo |
| Altura assento | 0.50m | 0.43-0.45m | ⚠️ 11% alto |
| Espessura pad | 0.12m | 0.08-0.10m | ⚠️ espesso |
| Posts barbell | 1.05m | 0.95-1.05m | ✅ ok |

**Plano**: cycle 108 reduz pad pra 0.28m × 0.10m, assento pra 0.45m.

### 3. Treadmill

| Medida | Atual | Spec real | Status |
|--------|------:|----------:|:------:|
| Belt largura | 0.70m | 0.50-0.55m | ⚠️ 27% largo |
| Belt comprimento | 1.60m | 1.40-1.55m | ⚠️ ok-ish |
| Deck altura | 0.18m | 0.14-0.20m | ✅ ok |
| Console altura | 1.32m | 1.30-1.45m | ✅ ok |
| Posts handles | 1.20m × 0.78m | 1.00-1.20m × 0.50m | ⚠️ posts atrás |

**Plano**: cycle 125 ajusta belt 0.55m, posts 0.50m forward.

### 4. Plyo Box

| Medida | Atual | Spec real | Status |
|--------|------:|----------:|:------:|
| Altura | varies | 0.50/0.60/0.75m | precisa medir |

**Plano**: cycle 134 — 3 caixas empilháveis com cores.

### 5. Cable Machine

| Medida | Atual | Spec real | Status |
|--------|------:|----------:|:------:|
| Altura torre | a verificar | 2.20-2.40m | TBD |
| Pulley alto | a verificar | 2.10m | TBD |
| Pulley baixo | a verificar | 0.20m | TBD |

### 6. Rowing Machine

| Medida | Atual | Spec Concept2 | Status |
|--------|------:|--------------:|:------:|
| Comprimento | a verificar | 2.44m | TBD |
| Altura assento | a verificar | 0.36m | TBD |
| Largura | a verificar | 0.61m | TBD |

### 7. Assault Bike

| Medida | Atual | Spec Rogue Echo | Status |
|--------|------:|----------------:|:------:|
| Altura ventilador | a verificar | 1.30m | TBD |
| Comprimento total | a verificar | 1.42m | TBD |

---

## Materiais — auditoria

| Material | Roughness atual | Metalness atual | Ideal R/M |
|----------|----------------:|----------------:|:---------:|
| Chrome (CHROME_MAT) | 0.12 | 0.95 | 0.10 / 0.95 ✅ |
| Steel (STEEL_MAT) | 0.40 | 0.70 | 0.40 / 0.70 ✅ |
| Rubber (RUBBER_MAT) | 0.85 | 0.00 | 0.85 / 0.00 ✅ |
| Wood | varia | varia | 0.65 / 0.05 |
| Vinyl bench | 0.65 | 0.15 | 0.55 / 0.20 ⚠️ |

**Conclusão materiais**: chrome/steel/rubber bem definidos.
Vinyl pode ficar 10% mais brilhante (como vinil real do bench).

---

## Acabamentos faltantes

| Item | Status | Plano |
|------|:------:|------|
| Parafusos visíveis | ⚠️ poucos | cycle 153 |
| Soldas (raised seams) | ❌ ausente | cycle 154 |
| Borracha textured nos pés | ⚠️ simples | cycle 155 |
| Stickers brand "PR TRACKER" | ❌ ausente | cycle 156 |
| Cabos com tensão (catenária) | ⚠️ retos | cycle 157 |
| Wear marks nas plates | ❌ ausente | cycle 120 |
| Chalk dust sob deadlift | ❌ ausente | cycle 167 |
| Garrafas + shaker | ❌ ausente | cycle 168 |
| Toalhas | ❌ ausente | cycle 169 |
| Belt pendurado | ❌ ausente | cycle 171 |

---

## Ordem de fix prioritária (próximos ciclos)

1. **103-107**: Power Rack rebuild (altura, largura, hooks)
2. **108-111**: Bench rebuild (pad menor, mais detalhe)
3. **112-115**: Deadlift platform (madeira + borracha)
4. **116-120**: Plates (cores IWF, hub, gravação, wear)
5. **121-124**: Squat/Cable rebuild
6. **125-128**: Cardio (treadmill, assault, rowing)
7. **129-152**: Remaining equipment

---

*Auditoria feita pelo Claude Opus 4.7 em 2026-05-07. Sujeita a revisão.*
