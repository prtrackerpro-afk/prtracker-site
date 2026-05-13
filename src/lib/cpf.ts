/**
 * Validação de CPF brasileiro — formato + algoritmo dos dígitos
 * verificadores. Usado tanto no client (checkout.astro) quanto no
 * server (create-preference, create-pix-payment) pra prevenir CPFs
 * inválidos chegarem ao MP/Bling.
 *
 * Caso que motivou: cliente colocou "99999999999" (todos os dígitos
 * iguais — formato válido mas reprovado pelos DV). Bling aceitou,
 * NF-e ia falhar.
 */

/**
 * Valida formato + dígitos verificadores. Aceita string com ou sem
 * pontuação (.).XX.XXX-XX → strip pra dígitos antes de validar.
 *
 * Regras:
 * 1. Exatamente 11 dígitos
 * 2. Não pode ser todos os dígitos iguais (00000000000, 11111111111, ...)
 * 3. Dígitos verificadores (10º e 11º) precisam bater com algoritmo padrão
 */
export function validCpf(raw: string): boolean {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length !== 11) return false;
  // Todos os dígitos iguais — "99999999999", "00000000000", etc
  if (/^(\d)\1{10}$/.test(d)) return false;

  // 1º dígito verificador (posição 9)
  let s = 0;
  for (let i = 0; i < 9; i++) s += Number(d[i]) * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10) r = 0;
  if (r !== Number(d[9])) return false;

  // 2º dígito verificador (posição 10)
  s = 0;
  for (let i = 0; i < 10; i++) s += Number(d[i]) * (11 - i);
  r = (s * 10) % 11;
  if (r === 10) r = 0;
  return r === Number(d[10]);
}

/**
 * Strip de formatação. Retorna 11 dígitos ou empty.
 */
export function normalizeCpf(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "");
}
