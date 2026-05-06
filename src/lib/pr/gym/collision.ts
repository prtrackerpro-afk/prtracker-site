// AABB collision system pro gym virtual.
//
// Boneco se move clamping x/z dentro da sala E evita uma lista de
// retângulos de colisão (cada equipamento registra um). Sem física —
// o avatar simplesmente é empurrado pro lado livre quando colide,
// suficiente pra UX de "não atravessa".

export interface AABB {
  /** Centro X. */
  cx: number;
  /** Centro Z. */
  cz: number;
  /** Half-width em X. */
  hw: number;
  /** Half-depth em Z. */
  hd: number;
}

export const AVATAR_RADIUS = 0.4;

/**
 * Resolve colisão: dado a posição candidata (x, z), retorna a posição
 * ajustada que não está dentro de nenhum dos rects (com padding do
 * AVATAR_RADIUS). Usa axis-separating: empurra na menor distância.
 */
export function resolveCollisions(
  x: number,
  z: number,
  rects: AABB[]
): { x: number; z: number; collided: boolean } {
  let nx = x;
  let nz = z;
  let collided = false;

  for (const r of rects) {
    const dx = nx - r.cx;
    const dz = nz - r.cz;
    const px = r.hw + AVATAR_RADIUS - Math.abs(dx);
    const pz = r.hd + AVATAR_RADIUS - Math.abs(dz);
    if (px > 0 && pz > 0) {
      collided = true;
      // Empurra no eixo de menor penetração
      if (px < pz) {
        nx += dx > 0 ? px : -px;
      } else {
        nz += dz > 0 ? pz : -pz;
      }
    }
  }

  return { x: nx, z: nz, collided };
}
