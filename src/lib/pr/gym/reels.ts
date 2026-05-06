// Lista de "Reels" disponíveis pra exibir no projetor do gym virtual.
// V4 honest: o auto-Reel server-side (tentpole #4 em PR_TRACKER_VISION.md)
// vai gerar 15s a partir de cada PR. Enquanto isso, mostramos placeholders
// + CTAs reais pra Instagram da PR Tracker (Brand Bible §canais).

export type ReelKind = "comingsoon" | "external" | "youtube";

export interface Reel {
  id: string;
  title: string;
  subtitle: string;
  kind: ReelKind;
  /** Para kind=youtube, ID do vídeo (último segmento após v=). */
  ytId?: string;
  /** Para kind=external, URL externa pra abrir em nova aba. */
  externalUrl?: string;
  /** Cor de acento no card (hex). */
  accent?: string;
  /** Emoji do ícone no card. */
  emoji?: string;
}

// Placeholders honestos. Ao invés de YouTube embeds que podem quebrar
// (vídeo deletado, geo-block, ToS de terceiros), apontamos pros canais
// oficiais da marca + roadmap claro do que está vindo.
export const REELS: Reel[] = [
  {
    id: "auto-reel-soon",
    title: "Auto-Reel do seu PR",
    subtitle: "Em breve · 15s · gerado server-side a partir do PR registrado",
    kind: "comingsoon",
    accent: "#D8FF2C",
    emoji: "✨",
  },
  {
    id: "instagram-pr-tracker",
    title: "Instagram @pr.tracker",
    subtitle: "Conteúdo oficial · troféus, atletas, drops",
    kind: "external",
    externalUrl: "https://instagram.com/pr.tracker",
    accent: "#D8FF2C",
    emoji: "📷",
  },
  {
    id: "tiktok-pr-tracker",
    title: "TikTok PR Tracker",
    subtitle: "Reels curtos · highlights da comunidade",
    kind: "external",
    externalUrl: "https://www.tiktok.com/@pr.tracker",
    accent: "#D8FF2C",
    emoji: "🎵",
  },
  {
    id: "friend-gym-soon",
    title: "Visitar gym do amigo",
    subtitle: "Em breve · multiplayer Realtime · entra no gym do seu coach",
    kind: "comingsoon",
    accent: "#D8FF2C",
    emoji: "🏛️",
  },
];
