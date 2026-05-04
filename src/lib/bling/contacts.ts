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
  };
  if (input.email) body.email = input.email;
  if (input.telefone) body.telefone = digits(input.telefone);
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
