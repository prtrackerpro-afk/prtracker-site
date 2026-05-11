// Offline PR log queue — client-only.
//
// Quando o atleta tenta logar PR sem internet (caso comum no box com
// sinal ruim), gravamos a tentativa em localStorage. Quando o app volta
// online (próxima carga ou listener `online`), drenamos a fila contra
// /api/pr/records e mostramos toast com a contagem sincronizada.
//
// localStorage > IndexedDB porque: payload é minúsculo (~200 bytes por
// PR), API síncrona sem promessa de Worker, código fica trivial pra
// debugar via DevTools.

const KEY = "pr_offline_queue_v1";

export interface QueuedPR {
  /** Local UUID gerado offline — usado pra dedupe na fila local. */
  localId: string;
  exercise: string;
  weight_kg: number;
  performed_at: string;
  notes: string | null;
  /** ISO timestamp do momento que o PR foi tentado offline. */
  queued_at: string;
}

function readQueue(): QueuedPR[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedPR[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedPR[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // localStorage cheio (improvável com PRs) — silenciosamente ignora
  }
}

export function enqueuePR(pr: Omit<QueuedPR, "localId" | "queued_at">): QueuedPR {
  const item: QueuedPR = {
    ...pr,
    localId: crypto.randomUUID(),
    queued_at: new Date().toISOString(),
  };
  const queue = readQueue();
  queue.push(item);
  writeQueue(queue);
  return item;
}

export function getQueuedPRs(): QueuedPR[] {
  return readQueue();
}

export function clearQueue(): void {
  writeQueue([]);
}

/**
 * Drena a fila: POST cada PR sequencialmente. Sucesso → remove da fila.
 * Falha → mantém o item (próxima chamada tenta de novo). Retorna a
 * contagem de PRs sincronizados nesta chamada (pra mostrar toast).
 */
export async function drainQueue(): Promise<{ synced: number; failed: number }> {
  const queue = readQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { synced: 0, failed: 0 };
  }
  let synced = 0;
  let failed = 0;
  const remaining: QueuedPR[] = [];
  for (const item of queue) {
    try {
      const res = await fetch("/api/pr/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exercise: item.exercise,
          weight_kg: item.weight_kg,
          performed_at: item.performed_at,
          notes: item.notes,
        }),
      });
      if (res.ok || res.status === 409) {
        // 409 = duplicate (já sincronizado em outra aba); ainda conta como ok
        synced++;
      } else {
        failed++;
        remaining.push(item);
      }
    } catch {
      failed++;
      remaining.push(item);
    }
  }
  writeQueue(remaining);
  return { synced, failed };
}
