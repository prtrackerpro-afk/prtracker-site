/**
 * PR Tracker — coleções (curadorias de produtos por linha de marca).
 *
 * Espelham o split do menu (mai/2026) em três linhas semânticas:
 *
 *   - "miniaturas": réplicas em escala do equipamento de academia.
 *   - "pr-trackers": placas-troféu configuráveis (My PR Set + Boards).
 *   - "pr-runners": linha de corrida.
 *
 * O array `products` contém slugs na ordem de display da página de coleção.
 * Single source of truth — `colecao/[slug].astro` lê daqui, header lê daqui
 * (futuro), home lê daqui (TODO).
 */

export interface CollectionMeta {
  /** URL slug — usado em /colecao/{slug}. */
  slug: "miniaturas" | "pr-trackers" | "pr-runners";
  /** Nome de display (PT-BR, com capitalização normal). */
  name: string;
  /** Título grande (ALL CAPS pra hero da página). */
  title: string;
  /** Tagline curta (subtitle hero). */
  tagline: string;
  /** Descrição longa (parágrafo introdutório da página). */
  description: string;
  /** Slugs de produtos da coleção, na ordem de display. */
  products: string[];
}

export const COLLECTIONS: CollectionMeta[] = [
  {
    slug: "miniaturas",
    name: "Miniaturas",
    title: "MINIATURAS",
    tagline: "Réplicas em escala do equipamento que faz o seu PR.",
    description:
      "Cada peça reproduz um equipamento real da academia em escala — barra olímpica usinada em aço inox, anilhas padrão IWF em ABS, base proporcional. Você configura o peso da sua barra, nós produzimos, você expõe.",
    products: ["deadlift-set", "power-rack-set", "bench-press-set", "my-pr-gym"],
  },
  {
    slug: "pr-trackers",
    name: "PR Trackers",
    title: "PR TRACKERS",
    tagline:
      "Placas-troféu configuráveis. Escolha o exercício, monte a barra, exiba o número.",
    description:
      "Para quem prefere uma placa-troféu compacta e personalizável. Você escolhe os exercícios (até 20+), a cor (Cobre, Preto ou Rosa nos Boards) e o peso de cada barra. Cada peça vira um registro físico dos seus PRs.",
    products: ["my-pr-set", "pr-tracker-board-2", "pr-tracker-board-2-snatch-cj", "pr-tracker-board-3"],
  },
  {
    slug: "pr-runners",
    name: "PR Runners",
    title: "PR RUNNERS",
    tagline: "Sua corrida em troféu. RP = Recorde Pessoal.",
    description:
      "Primeira linha de corrida da PR Tracker. No mundo do running brasileiro usa-se RP (Recorde Pessoal), e essas peças celebram exatamente isso. Distâncias clássicas, tempos do cliente, cadeado nas que ainda faltam bater.",
    products: ["meus-rps"],
  },
];

export function getCollection(slug: string): CollectionMeta | undefined {
  return COLLECTIONS.find((c) => c.slug === slug);
}

/** Devolve as outras coleções (para o cross-link "Explore também"). */
export function otherCollections(currentSlug: string): CollectionMeta[] {
  return COLLECTIONS.filter((c) => c.slug !== currentSlug);
}
