// Lista de "Reels" disponíveis pra exibir no projetor do gym virtual.
// V3 placeholder: vídeos motivacionais públicos do YouTube + futuros
// Reels gerados pelo próprio app (tentpole #4 do PR_TRACKER_VISION.md).
//
// Quando o tentpole #4 entrar (auto-reel server-side), substituir esta
// lista hard-coded por fetch de pr_reels do Supabase.

export interface Reel {
  /** Internal ID — para tracking de cliques. */
  id: string;
  /** Título exibido na lista do modal. */
  title: string;
  /** Subtítulo curto: tipo / autor / data. */
  subtitle: string;
  /** YouTube video ID (último segmento da URL após v=). */
  ytId: string;
  /** Duração em segundos para mostrar na lista. */
  durationSec: number;
  /** Cor de acento por categoria (default lime). */
  accent?: string;
}

// Curadoria: foco em força/levantamento brasileiro. Sem corrida.
// Vídeos públicos com player embed habilitado.
export const REELS: Reel[] = [
  {
    id: "rogerio-pr-clean",
    title: "Highlights Halterofilismo BR",
    subtitle: "Brasil · Snatch + Clean & Jerk",
    ytId: "MX9F2ZyIYiI", // CBLP highlights
    durationSec: 132,
  },
  {
    id: "crossfit-open-2025",
    title: "CrossFit Open 2025 — BR",
    subtitle: "Top atletas brasileiros",
    ytId: "tnFErSXRaSk",
    durationSec: 180,
  },
  {
    id: "powerlifting-tutorial",
    title: "Técnica de Deadlift",
    subtitle: "Tutorial · 3 erros comuns",
    ytId: "op9kVnSso6Q",
    durationSec: 240,
  },
  {
    id: "auto-reel-coming",
    title: "Seu Reel automático",
    subtitle: "Em breve · 15s · gerado a partir do seu PR",
    ytId: "",
    durationSec: 15,
    accent: "#D8FF2C",
  },
];
