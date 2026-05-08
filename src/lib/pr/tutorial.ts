// Tutorial steps definidos pra Fase 7 do roadmap.
// 12 steps pra novo athlete passar e bater seu primeiro PR.

export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  cta: string;
  href?: string;
  /** Se true, o step pode ser auto-completado quando o athlete fizer a ação. */
  autoComplete?: boolean;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Bem-vindo ao PR Tracker",
    body: "Aqui cada PR vira troféu. Não é diário de treino — é palco. Vou te mostrar como funciona em 1 minuto.",
    cta: "Bora",
  },
  {
    id: "avatar",
    title: "Cria seu avatar",
    body: "É a sua identidade no gym virtual. Cor da pele, cabelo, regata — daqui a pouco dá pra colocar boné, óculos, tatuagem.",
    cta: "Personalizar",
    href: "/pr/profile",
    autoComplete: true,
  },
  {
    id: "first_pr",
    title: "Registra seu primeiro PR",
    body: "Pega o número, pega a data, pronto. Sem mimimi de série/rep — aqui é só o melhor.",
    cta: "Registrar PR",
    href: "/pr/log",
    autoComplete: true,
  },
  {
    id: "gym_tour",
    title: "Visita o ginásio virtual",
    body: "Cada PR vira um troféu na parede. Quanto mais PR, mais troféu. Anda com WASD ou joystick.",
    cta: "Visitar gym",
    href: "/pr/gym",
  },
  {
    id: "skills",
    title: "Logue uma skill",
    body: "Pull-up, muscle-up, handstand. Skills ginásticas contam tier separado.",
    cta: "Logar skill",
    href: "/pr/skills",
  },
  {
    id: "diet",
    title: "Tracker de macros (opcional)",
    body: "Quer registrar o que come? O tracker é independente — sem nutri, sem mensalidade.",
    cta: "Conhecer dieta",
    href: "/pr/diet",
  },
  {
    id: "friends",
    title: "Adiciona amigo",
    body: "PR sem comunidade é planilha. Manda o convite pra um amigo de box.",
    cta: "Convidar",
    href: "/pr/feed",
  },
  {
    id: "share",
    title: "Compartilha",
    body: "Cada PR gera card pra story. Não compartilhar é deixar conquista quieta.",
    cta: "Voltar pro PR",
    href: "/pr",
  },
  {
    id: "complete",
    title: "Pronto",
    body: "Você passou pelo tutorial. Bora bater os próximos PRs.",
    cta: "Fechar",
  },
];

const STORAGE_KEY = "pr_tutorial_v1";

export function getTutorialState(): {
  completed: string[];
  isFinished: boolean;
  isSkipped: boolean;
} {
  if (typeof window === "undefined") return { completed: [], isFinished: false, isSkipped: false };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completed: [], isFinished: false, isSkipped: false };
    return JSON.parse(raw);
  } catch {
    return { completed: [], isFinished: false, isSkipped: false };
  }
}

export function saveTutorialState(state: {
  completed: string[];
  isFinished: boolean;
  isSkipped: boolean;
}): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // private mode etc
  }
}

export function markStepDone(id: string): void {
  const s = getTutorialState();
  if (!s.completed.includes(id)) {
    s.completed.push(id);
  }
  if (s.completed.length >= TUTORIAL_STEPS.length - 1) {
    s.isFinished = true;
  }
  saveTutorialState(s);
}

export function skipTutorial(): void {
  saveTutorialState({ completed: [], isFinished: false, isSkipped: true });
}

export function resetTutorial(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
