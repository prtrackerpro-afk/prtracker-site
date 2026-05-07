/**
 * Gym Layout — declarative scene config.
 *
 * Antes desse arquivo, posições eram hardcoded em VirtualGym.tsx
 * (`x.position.set(-7, 0, 0)`). Agora ficam aqui em DEFAULT_LAYOUT
 * e o editor 2D (/pr/gym/edit) permite o atleta arrastar objetos.
 *
 * Coordenadas em metros, origem no centro do gym (0,0,0).
 * - x: ←→ (negativo = esquerda, positivo = direita)
 * - z: ↑↓ no top-down (negativo = fundo, positivo = entrada)
 * - rot: rotação no eixo Y em radianos
 *
 * V15: O gym dobrou — agora ROOM_W=36, ROOM_D=32. Bounds: x ∈ [-18,+18], z ∈ [-16,+16].
 *
 * V1: localStorage (`pr_gym_layout_v1`). Migração futura: coluna
 * `pr_athletes.gym_layout` JSONB pra sincronizar entre devices e
 * suportar feature "visitar gym do amigo".
 */

const STORAGE_KEY = "pr_gym_layout_v1";

/**
 * Tipos de objetos editáveis no gym. Estruturais (paredes, chão,
 * teto, lights) NÃO entram aqui — são fixos.
 *
 * V15 expandiu a paleta com equipamentos clássicos de academia +
 * CrossFit (bench, dumbbells, halters, esteira, assault bike, etc).
 */
export type GymObjectType =
  | "trophy_hall"     // 11 pedestais Hall of Fame (auto-distribuídos)
  | "skills_board"    // Painel de ginásticos (BMU/MU/HSPU/T2B/DU/Pistol)
  | "run_board"       // Painel de corrida (5K/10K/21K/42K)
  | "streak_pillar"   // Totem de fogo Duolingo-style
  | "personal_booth"  // Booth Personal Trainer + NPC marombeiro
  | "nutri_booth"     // Booth Nutricionista + NPC galega
  | "empty_booth"     // "Anuncie aqui" (placeholder pra novos parceiros)
  | "power_rack"      // Power rack com barbell
  | "squat_rack"      // Squat rack (mais simples que power rack)
  | "platform"        // Plataforma de levantamento
  | "projector_room"  // Tela + projetor + sofá pros Reels
  // === V15 — Equipamentos clássicos de academia ===
  | "bench"           // Banco de supino
  | "dumbbell_rack"   // Rack de halteres (3 níveis)
  | "kettlebell"      // Kettlebell solto
  | "plate_tree"      // Árvore de anilhas
  | "cable_machine"   // Máquina de cabos / polia
  | "treadmill"       // Esteira ergométrica
  | "assault_bike"    // Assault bike (ventoinha)
  | "rowing_machine"  // Remo (Concept2-style)
  // === V15 — CrossFit ===
  | "plyo_box"        // Caixa de CrossFit (box jump)
  | "crossfit_rig"    // Rig de CrossFit (estrutura modular)
  | "spawn";          // Posição inicial do avatar

export interface GymObject {
  /** ID único pra drag-drop e persistência. */
  id: string;
  type: GymObjectType;
  /** Posição em metros — eixo X (esquerda/direita). */
  x: number;
  /** Posição em metros — eixo Z (fundo/entrada). */
  z: number;
  /** Rotação em radianos no eixo Y. */
  rot: number;
}

export interface GymLayout {
  version: number;
  objects: GymObject[];
}

/**
 * Layout default — espelha as posições hardcoded que estavam em
 * VirtualGym.tsx antes do refactor. Quando atleta clica "Resetar
 * layout" no editor, volta pra esse estado.
 *
 * Coordenadas extraídas de:
 * - `powerRack.position.set(-7, 0, 0)` → x=-7, z=0
 * - `streakPillar.position.set(0, 0, ROOM_D / 2 - 1.2)` → z=6.8
 * - `nutriBooth.position.set(-4.2, 0, 4.5)` rot=-π/2
 * - etc.
 */
export const DEFAULT_LAYOUT: GymLayout = {
  version: 1,
  objects: [
    // === HALL OF FAME (parede do fundo, 11 pedestais auto-distribuídos) ===
    // Trophy hall renderiza com largura fixa 16m em VirtualGym (não escala com ROOM_W).
    { id: "trophy_hall_main", type: "trophy_hall", x: 0, z: -15, rot: 0 },

    // === PAINÉIS — flat contra a parede direita, face apontando -x (pro centro) ===
    { id: "skills_board_main", type: "skills_board", x: 17, z: -7, rot: -Math.PI / 2 },
    { id: "run_board_main", type: "run_board", x: 17, z: 5, rot: -Math.PI / 2 },

    // === STREAK PILLAR (entrada, centralizado, próximo da parede de entrada) ===
    { id: "streak_pillar_main", type: "streak_pillar", x: 0, z: 14, rot: 0 },

    // === BOOTHS DE PARCEIROS (laterais do aisle central) ===
    { id: "nutri_booth_main", type: "nutri_booth", x: -8, z: 9, rot: -Math.PI / 2 },
    { id: "personal_booth_main", type: "personal_booth", x: 8, z: 9, rot: Math.PI / 2 },
    { id: "empty_booth_1", type: "empty_booth", x: -8, z: 4, rot: -Math.PI / 2 },

    // === EQUIPAMENTOS DE TREINO ===
    { id: "power_rack_main", type: "power_rack", x: -14, z: 0, rot: 0 },
    { id: "platform_main", type: "platform", x: 13, z: -3, rot: 0 },
    { id: "bench_main", type: "bench", x: -10, z: -5, rot: 0 },
    { id: "dumbbell_rack_main", type: "dumbbell_rack", x: -14, z: -8, rot: 0 },
    { id: "plate_tree_main", type: "plate_tree", x: 13, z: 2, rot: 0 },

    // === CARDIO (lado esquerdo-frente) ===
    { id: "treadmill_1", type: "treadmill", x: 12, z: -10, rot: 0 },
    { id: "treadmill_2", type: "treadmill", x: 14, z: -10, rot: 0 },
    { id: "assault_bike_main", type: "assault_bike", x: 16, z: -10, rot: 0 },
    { id: "rowing_machine_main", type: "rowing_machine", x: 16, z: 10, rot: 0 },

    // === CROSSFIT ===
    { id: "plyo_box_1", type: "plyo_box", x: -2, z: -10, rot: 0 },
    { id: "plyo_box_2", type: "plyo_box", x: -1, z: -10, rot: 0 },
    { id: "kettlebell_1", type: "kettlebell", x: 1, z: -10, rot: 0 },
    { id: "kettlebell_2", type: "kettlebell", x: 1.5, z: -10, rot: 0 },

    // === SALA DE PROJEÇÃO (canto esquerdo-frente — sofá virado pra tela) ===
    { id: "projector_room_main", type: "projector_room", x: -13, z: 11, rot: 0 },

    // === SPAWN DO AVATAR (entrada centralizada) ===
    { id: "spawn", type: "spawn", x: 0, z: 13, rot: 0 },
  ],
};

/**
 * Metadata por tipo — usado pelo editor 2D pra renderizar o objeto
 * com cor + tamanho + label corretos. Bounds (footprintW/D) são
 * usados pra collision visual no top-down + checagem de overlap.
 */
export interface GymObjectMeta {
  label: string;
  /** Cor hex pra o retângulo no editor 2D. */
  color: string;
  /** Largura (X) do footprint em metros. */
  footprintW: number;
  /** Profundidade (Z) do footprint em metros. */
  footprintD: number;
  /** Pode ter múltiplas instâncias? false = singleton (ex: spawn, streak). */
  multiple: boolean;
  /** Pode ser deletado pelo editor? false = obrigatório (spawn). */
  deletable: boolean;
}

export const OBJECT_META: Record<GymObjectType, GymObjectMeta> = {
  trophy_hall: {
    label: "Troféus",
    color: "#FFC72C", // ouro
    footprintW: 16.6, // largura do fameDeck (ROOM_W - 1.4)
    footprintD: 1.4,
    multiple: false,
    deletable: false,
  },
  skills_board: {
    label: "Ginásticos",
    color: "#7df9ff", // diamond
    footprintW: 3.5,
    footprintD: 0.4,
    multiple: false,
    deletable: true,
  },
  run_board: {
    label: "Corrida",
    color: "#43B02A", // verde
    footprintW: 3.5,
    footprintD: 0.4,
    multiple: false,
    deletable: true,
  },
  streak_pillar: {
    label: "Streak",
    color: "#ff6020", // laranja fogo
    footprintW: 1.2,
    footprintD: 1.2,
    multiple: false,
    deletable: false,
  },
  personal_booth: {
    label: "Personal",
    color: "#D8FF2C",
    footprintW: 1.4,
    footprintD: 2.0,
    multiple: false,
    deletable: true,
  },
  nutri_booth: {
    label: "Nutri",
    color: "#43B02A",
    footprintW: 1.4,
    footprintD: 2.0,
    multiple: false,
    deletable: true,
  },
  empty_booth: {
    label: "Anuncie",
    color: "#4D4D51",
    footprintW: 1.4,
    footprintD: 2.0,
    multiple: true,
    deletable: true,
  },
  power_rack: {
    label: "Power Rack",
    color: "#888a96",
    footprintW: 1.6,
    footprintD: 1.4,
    multiple: true,
    deletable: true,
  },
  squat_rack: {
    label: "Squat Rack",
    color: "#a0a3ad",
    footprintW: 1.6,
    footprintD: 1.0,
    multiple: true,
    deletable: true,
  },
  platform: {
    label: "Plataforma",
    color: "#6a3a1f",
    footprintW: 2.4,
    footprintD: 2.4,
    multiple: true,
    deletable: true,
  },
  projector_room: {
    label: "Reels",
    color: "#0057B8", // azul cinema
    footprintW: 4.0,
    footprintD: 3.0,
    multiple: false,
    deletable: true,
  },
  // === V15 — Equipamentos clássicos ===
  bench: {
    label: "Banco supino",
    color: "#7c1f1f",
    footprintW: 0.7,
    footprintD: 1.4,
    multiple: true,
    deletable: true,
  },
  dumbbell_rack: {
    label: "Halteres",
    color: "#5a4a3a",
    footprintW: 3.0,
    footprintD: 0.8,
    multiple: true,
    deletable: true,
  },
  kettlebell: {
    label: "Kettlebell",
    color: "#1a1a24",
    footprintW: 0.5,
    footprintD: 0.5,
    multiple: true,
    deletable: true,
  },
  plate_tree: {
    label: "Anilhas",
    color: "#DA291C",
    footprintW: 0.8,
    footprintD: 0.8,
    multiple: true,
    deletable: true,
  },
  cable_machine: {
    label: "Polia",
    color: "#3a3a4a",
    footprintW: 1.8,
    footprintD: 1.2,
    multiple: true,
    deletable: true,
  },
  treadmill: {
    label: "Esteira",
    color: "#2a3a5a",
    footprintW: 1.0,
    footprintD: 2.0,
    multiple: true,
    deletable: true,
  },
  assault_bike: {
    label: "Assault Bike",
    color: "#7a4a1a",
    footprintW: 0.8,
    footprintD: 1.4,
    multiple: true,
    deletable: true,
  },
  rowing_machine: {
    label: "Remo",
    color: "#1a4a3a",
    footprintW: 0.8,
    footprintD: 2.4,
    multiple: true,
    deletable: true,
  },
  // === V15 — CrossFit ===
  plyo_box: {
    label: "Caixa CrossFit",
    color: "#0f0f1a",
    footprintW: 0.7,
    footprintD: 0.7,
    multiple: true,
    deletable: true,
  },
  crossfit_rig: {
    label: "Rig CrossFit",
    color: "#1a1a3a",
    footprintW: 4.0,
    footprintD: 2.0,
    multiple: true,
    deletable: true,
  },
  spawn: {
    label: "Avatar",
    color: "#D8FF2C",
    footprintW: 0.8,
    footprintD: 0.8,
    multiple: false,
    deletable: false,
  },
};

/**
 * Carrega layout do localStorage. Se não existir ou for inválido,
 * retorna DEFAULT_LAYOUT. Em SSR (window indefinido) retorna default.
 */
export function loadLayout(): GymLayout {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<GymLayout>;
    if (!parsed.objects || !Array.isArray(parsed.objects)) return DEFAULT_LAYOUT;
    if (parsed.version !== DEFAULT_LAYOUT.version) {
      // Versão incompatível — ignora layout antigo, volta pro default.
      return DEFAULT_LAYOUT;
    }
    // Sanity check em cada objeto
    const valid = parsed.objects.every(
      (o) =>
        typeof o.id === "string" &&
        typeof o.type === "string" &&
        o.type in OBJECT_META &&
        Number.isFinite(o.x) &&
        Number.isFinite(o.z) &&
        Number.isFinite(o.rot),
    );
    if (!valid) return DEFAULT_LAYOUT;
    return { version: parsed.version, objects: parsed.objects };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/**
 * Salva layout no localStorage. Falha silenciosa em modo privado.
 */
export function saveLayout(layout: GymLayout): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // localStorage cheio ou modo privado — não quebra a app.
  }
}

/**
 * Restaura layout default no localStorage.
 */
export function resetLayout(): GymLayout {
  saveLayout(DEFAULT_LAYOUT);
  return DEFAULT_LAYOUT;
}

/**
 * Helpers pra o editor 2D — encontrar / atualizar / adicionar /
 * remover objetos. Sempre retornam novo GymLayout (immutable).
 */
export function updateObject(
  layout: GymLayout,
  id: string,
  patch: Partial<Omit<GymObject, "id" | "type">>,
): GymLayout {
  return {
    ...layout,
    objects: layout.objects.map((o) =>
      o.id === id ? { ...o, ...patch } : o,
    ),
  };
}

export function addObject(layout: GymLayout, obj: GymObject): GymLayout {
  return { ...layout, objects: [...layout.objects, obj] };
}

export function removeObject(layout: GymLayout, id: string): GymLayout {
  return { ...layout, objects: layout.objects.filter((o) => o.id !== id) };
}

/**
 * Gera um ID único pra novo objeto adicionado pelo editor.
 * Formato: `<type>_<random>`.
 */
export function generateObjectId(type: GymObjectType): string {
  return `${type}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Bounds do gym (metros). Validar posições antes de aceitar drag.
 *
 * V15: dobramos o tamanho (de 18×16 pra 36×32) pra caber bench,
 * dumbbells, esteiras, assault bike, etc. Layouts antigos continuam
 * válidos (posições dentro do bound antigo cabem no novo).
 */
export const GYM_BOUNDS = {
  minX: -18,
  maxX: 18,
  minZ: -16,
  maxZ: 16,
} as const;

/**
 * Snap de coordenadas pra grid de 0.5m no editor.
 */
export function snapCoord(v: number, step: number = 0.5): number {
  return Math.round(v / step) * step;
}

// =================================================================
// PRESETS — layouts pré-definidos por estilo de atleta
// =================================================================
//
// Atleta clica "Powerlifting Heavy" / "CrossFit Box" / "Minimalista"
// e o gym é reorganizado de uma vez. DEFAULT_LAYOUT continua sendo
// o "Padrão" (recommended pra iniciantes — uma de cada coisa).

export interface LayoutPreset {
  id: string;
  label: string;
  description: string;
  layout: GymLayout;
}

export const PRESETS: LayoutPreset[] = [
  {
    id: "default",
    label: "Padrão",
    description: "Layout balanceado pra qualquer atleta",
    layout: DEFAULT_LAYOUT,
  },
  {
    id: "powerlifting",
    label: "Powerlifting Heavy",
    description: "Foco no big 3 — 2 power racks + plataforma central, sem booths",
    layout: {
      version: 1,
      objects: [
        { id: "trophy_hall_main", type: "trophy_hall", x: 0, z: -7.0, rot: 0 },
        { id: "skills_board_main", type: "skills_board", x: 7.5, z: 4.5, rot: -Math.PI / 3 },
        { id: "run_board_main", type: "run_board", x: -7.5, z: 4.5, rot: Math.PI / 3 },
        { id: "streak_pillar_main", type: "streak_pillar", x: 0, z: 6.8, rot: 0 },
        { id: "power_rack_left", type: "power_rack", x: -5.5, z: 0, rot: Math.PI / 6 },
        { id: "power_rack_right", type: "power_rack", x: 5.5, z: 0, rot: -Math.PI / 6 },
        { id: "platform_center", type: "platform", x: 0, z: -1.5, rot: 0 },
        { id: "platform_back", type: "platform", x: 0, z: 2.5, rot: 0 },
        { id: "spawn", type: "spawn", x: 0, z: 6.0, rot: 0 },
      ],
    },
  },
  {
    id: "crossfit",
    label: "CrossFit Box",
    description: "Skills no centro, plataforma pra met-cons, booths comerciais",
    layout: {
      version: 1,
      objects: [
        { id: "trophy_hall_main", type: "trophy_hall", x: 0, z: -7.0, rot: 0 },
        { id: "skills_board_main", type: "skills_board", x: 0, z: -3.5, rot: 0 },
        { id: "run_board_main", type: "run_board", x: -7.5, z: -3.0, rot: Math.PI / 3 },
        { id: "streak_pillar_main", type: "streak_pillar", x: 0, z: 6.8, rot: 0 },
        { id: "personal_booth_main", type: "personal_booth", x: 5.5, z: 5.5, rot: Math.PI / 2 },
        { id: "nutri_booth_main", type: "nutri_booth", x: -5.5, z: 5.5, rot: -Math.PI / 2 },
        { id: "empty_booth_a", type: "empty_booth", x: 5.5, z: 2.5, rot: Math.PI / 2 },
        { id: "empty_booth_b", type: "empty_booth", x: -5.5, z: 2.5, rot: -Math.PI / 2 },
        { id: "power_rack_main", type: "power_rack", x: -7.0, z: 0, rot: Math.PI / 8 },
        { id: "platform_main", type: "platform", x: 6.0, z: -1.0, rot: -Math.PI / 14 },
        { id: "spawn", type: "spawn", x: 0, z: 6.0, rot: 0 },
      ],
    },
  },
  {
    id: "minimal",
    label: "Minimalista",
    description: "Só troféus + streak. Foco total na conquista",
    layout: {
      version: 1,
      objects: [
        { id: "trophy_hall_main", type: "trophy_hall", x: 0, z: -7.0, rot: 0 },
        { id: "streak_pillar_main", type: "streak_pillar", x: 0, z: 6.8, rot: 0 },
        { id: "spawn", type: "spawn", x: 0, z: 4.0, rot: 0 },
      ],
    },
  },
];

/**
 * Aplica um preset (substitui layout atual no localStorage).
 * Retorna o novo layout.
 */
export function applyPreset(presetId: string): GymLayout {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return DEFAULT_LAYOUT;
  saveLayout(preset.layout);
  return preset.layout;
}
