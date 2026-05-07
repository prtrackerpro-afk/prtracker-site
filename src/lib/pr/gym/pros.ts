// Diretório de profissionais fitness (Nutricionistas + Personal Trainers).
// V11: hardcoded sample — 6 de cada categoria com cidades BR + especialidades
// + cores de avatar. Schema futuro: tabela pr_creators com onboarding,
// validação de CREF/CRN, billing, etc.
//
// Quando o atleta NÃO tem profissional contratado, o NPC mostra essa
// LISTA — diretório aberto pra escolher quem quer contratar. Cada
// item leva pro WhatsApp + Instagram do pro.

export type ProType = "nutri" | "pt";

export interface Pro {
  id: string;
  type: ProType;
  name: string;
  city: string;
  state: string;
  specialty: string;
  /** Credencial profissional (CRN pra Nutri, CREF pra PT). */
  credential: string;
  /** Cor inicial do avatar (até foto real). */
  avatarColor: string;
  /** WhatsApp BR (formato 5551XXXXXXXXX sem +). */
  whatsapp: string;
  /** @username Instagram. */
  instagram: string;
  /** Featured = aparece no booth principal do gym. */
  featured?: boolean;
}

export const SAMPLE_NUTRIS: Pro[] = [
  {
    id: "nutri-camila",
    type: "nutri",
    name: "Camila Silva",
    city: "São Paulo",
    state: "SP",
    specialty: "Nutrição esportiva · Hipertrofia",
    credential: "CRN-3 12345",
    avatarColor: "#43B02A",
    whatsapp: "5551982061914",
    instagram: "pr.tracker",
    featured: true,
  },
  {
    id: "nutri-roberta",
    type: "nutri",
    name: "Roberta Mendes",
    city: "Rio de Janeiro",
    state: "RJ",
    specialty: "Cutting · Bulking · Comp",
    credential: "CRN-4 67890",
    avatarColor: "#0057B8",
    whatsapp: "5551982061914",
    instagram: "pr.tracker",
  },
  {
    id: "nutri-joao",
    type: "nutri",
    name: "João Santos",
    city: "Porto Alegre",
    state: "RS",
    specialty: "Powerlifting · Peak week",
    credential: "CRN-2 11223",
    avatarColor: "#DA291C",
    whatsapp: "5551982061914",
    instagram: "pr.tracker",
  },
  {
    id: "nutri-marina",
    type: "nutri",
    name: "Marina Costa",
    city: "Curitiba",
    state: "PR",
    specialty: "CrossFit · Endurance",
    credential: "CRN-8 44556",
    avatarColor: "#FFC72C",
    whatsapp: "5551982061914",
    instagram: "pr.tracker",
  },
  {
    id: "nutri-pedro",
    type: "nutri",
    name: "Pedro Lima",
    city: "Belo Horizonte",
    state: "MG",
    specialty: "Halterofilismo · LPO",
    credential: "CRN-9 77889",
    avatarColor: "#9aa3b0",
    whatsapp: "5551982061914",
    instagram: "pr.tracker",
  },
  {
    id: "nutri-larissa",
    type: "nutri",
    name: "Larissa Almeida",
    city: "Salvador",
    state: "BA",
    specialty: "Plant-based · Atletas vegan",
    credential: "CRN-6 99001",
    avatarColor: "#43B02A",
    whatsapp: "5551982061914",
    instagram: "pr.tracker",
  },
];

export const SAMPLE_PTS: Pro[] = [
  {
    id: "pt-bruno",
    type: "pt",
    name: "Bruno Castro",
    city: "São Paulo",
    state: "SP",
    specialty: "Powerlifting · Big 3",
    credential: "CREF 12345-G/SP",
    avatarColor: "#DA291C",
    whatsapp: "5551982061914",
    instagram: "pr.tracker",
    featured: true,
  },
  {
    id: "pt-lucas",
    type: "pt",
    name: "Lucas Pereira",
    city: "Rio de Janeiro",
    state: "RJ",
    specialty: "CrossFit Level 3 · Coaching",
    credential: "CREF 67890-G/RJ",
    avatarColor: "#FFC72C",
    whatsapp: "5551982061914",
    instagram: "pr.tracker",
  },
  {
    id: "pt-felipe",
    type: "pt",
    name: "Felipe Rocha",
    city: "Porto Alegre",
    state: "RS",
    specialty: "Halterofilismo Olímpico",
    credential: "CREF 11223-G/RS",
    avatarColor: "#0057B8",
    whatsapp: "5551982061914",
    instagram: "pr.tracker",
  },
  {
    id: "pt-marina",
    type: "pt",
    name: "Marina Sá",
    city: "Curitiba",
    state: "PR",
    specialty: "Hipertrofia feminina",
    credential: "CREF 44556-G/PR",
    avatarColor: "#43B02A",
    whatsapp: "5551982061914",
    instagram: "pr.tracker",
  },
  {
    id: "pt-carla",
    type: "pt",
    name: "Carla Dias",
    city: "Belo Horizonte",
    state: "MG",
    specialty: "Mobilidade · Recuperação",
    credential: "CREF 77889-G/MG",
    avatarColor: "#9aa3b0",
    whatsapp: "5551982061914",
    instagram: "pr.tracker",
  },
  {
    id: "pt-rafael",
    type: "pt",
    name: "Rafael Souza",
    city: "Florianópolis",
    state: "SC",
    specialty: "Strongman · Força bruta",
    credential: "CREF 99001-G/SC",
    avatarColor: "#111111",
    whatsapp: "5551982061914",
    instagram: "pr.tracker",
  },
];

export function getProsByType(type: ProType): Pro[] {
  return type === "nutri" ? SAMPLE_NUTRIS : SAMPLE_PTS;
}

export function getFeaturedPro(type: ProType): Pro | null {
  const list = getProsByType(type);
  return list.find((p) => p.featured) ?? list[0] ?? null;
}
