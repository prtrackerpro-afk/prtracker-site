/**
 * Bling v3 — Contatos.
 *
 * Endpoints used:
 *   GET  /contatos?numeroDocumento=<cpf>   → search by CPF
 *   POST /contatos                          → create
 *
 * Idempotency by CPF: every customer must have a contato in Bling so that
 * (a) NF-e gets the right destinatário and (b) repeat customers aren't
 * duplicated. We never UPDATE an existing contato — if the customer's
 * address changed, the new sale's address goes on the pedido itself,
 * which Bling supports via the order's own `enderecoEntrega`.
 */

import { blingFetch, BlingApiError } from "./api";

export interface BlingContact {
  id: number;
  nome: string;
  numeroDocumento?: string;
  tipo?: "F" | "J"; // Física | Jurídica
  email?: string;
}

export interface CreateContactInput {
  nome: string;
  /** CPF (11 digits, no formatting) or CNPJ (14 digits). */
  numeroDocumento: string;
  /** "F" = Física (default for CPF), "J" = Jurídica (CNPJ). */
  tipo?: "F" | "J";
  email?: string;
  /** Phone with area code, digits only. e.g. "51982061914". */
  telefone?: string;
  endereco?: {
    endereco?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cep?: string;
    municipio?: string;
    uf?: string;
    pais?: string;
  };
}

function digits(s: string | undefined | null): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Bling v3 valida o telefone do contato contra o padrão brasileiro (DDD
 * válido + fixo 8 dígitos OU celular 9 dígitos começando em 9). Quando o
 * cliente digita com prefixo "+55" o checkout às vezes salva 11 dígitos
 * começados em "55" — DDD 55 é técnicamente válido (Santa Maria/RS) mas
 * o número anexado vira inválido. Em vez de mandar lixo pro Bling
 * (rejeita o contato inteiro), filtra: se não bate com fixo/celular BR,
 * volta undefined e a chamada é feita sem telefone (Bling aceita).
 */
function sanitizeBrazilianPhone(raw: string | undefined): string | undefined {
  let d = digits(raw);
  if (!d) return undefined;
  // Strip country code "55" prefix when total ficou 12-13 dígitos (cliente
  // digitou +55 antes do DDD).
  if (d.length === 12 || d.length === 13) {
    if (d.startsWith("55")) d = d.slice(2);
  }
  // Aceita só formatos canônicos: DDDXXXXXXXX (fixo, 10) ou DDD9XXXXXXXX
  // (celular, 11, terceiro dígito é 9).
  if (/^\d{2}\d{8}$/.test(d)) return d;          // fixo
  if (/^\d{2}9\d{8}$/.test(d)) return d;         // celular
  return undefined;
}

export async function findContactByDocument(
  numeroDocumento: string,
  accessToken?: string,
): Promise<BlingContact | null> {
  const cleaned = digits(numeroDocumento);
  if (!cleaned) return null;
  const list = await blingFetch<BlingContact[] | undefined>("/contatos", {
    method: "GET",
    query: { numeroDocumento: cleaned },
    accessToken,
  });
  if (!Array.isArray(list) || list.length === 0) return null;
  const exact = list.find(
    (c) => digits(c.numeroDocumento) === cleaned,
  );
  return exact ?? list[0] ?? null;
}

export async function createContact(
  input: CreateContactInput,
  accessToken?: string,
): Promise<BlingContact> {
  const cpfDigits = digits(input.numeroDocumento);
  const tipo = input.tipo ?? (cpfDigits.length === 14 ? "J" : "F");

  const body: Record<string, unknown> = {
    nome: input.nome,
    numeroDocumento: cpfDigits,
    tipo,
    // Bling v3 passou a exigir situacao explícito (~mai/2026). "A" = ativo.
    situacao: "A",
  };
  if (input.email) body.email = input.email;
  const sanitizedPhone = sanitizeBrazilianPhone(input.telefone);
  if (sanitizedPhone) body.telefone = sanitizedPhone;
  if (input.endereco) {
    body.endereco = {
      geral: {
        endereco: input.endereco.endereco ?? "",
        numero: input.endereco.numero ?? "",
        complemento: input.endereco.complemento ?? "",
        bairro: input.endereco.bairro ?? "",
        cep: digits(input.endereco.cep),
        municipio: input.endereco.municipio ?? "",
        uf: (input.endereco.uf ?? "").toUpperCase().slice(0, 2),
        pais: input.endereco.pais ?? "Brasil",
      },
    };
  }

  const created = await blingFetch<BlingContact>("/contatos", {
    method: "POST",
    body,
    accessToken,
  });
  return created;
}

/**
 * Idempotent: returns existing contato by CPF, or creates one on first call.
 */
export async function getOrCreateContact(
  input: CreateContactInput,
  accessToken?: string,
): Promise<BlingContact> {
  const cpfDigits = digits(input.numeroDocumento);
  const existing = cpfDigits
    ? await findContactByDocument(cpfDigits, accessToken)
    : null;
  if (existing) return existing;
  try {
    return await createContact(input, accessToken);
  } catch (err) {
    if (err instanceof BlingApiError && err.status === 422) {
      const retried = await findContactByDocument(cpfDigits, accessToken);
      if (retried) return retried;
    }
    throw err;
  }
}
