import { useState, useEffect } from "react";
import {
  loadLayout,
  DEFAULT_LAYOUT,
  OBJECT_META,
  GYM_BOUNDS,
  type GymLayout,
  type GymObject,
} from "../../lib/pr/gym/layout";

/**
 * GymEditor — V1 read-only.
 *
 * Renderiza o layout do gym em SVG top-down 2D (planta baixa) pra
 * o atleta visualizar antes de mexer. Drag-drop, rotação, paleta e
 * persistência vêm nos próximos steps.
 *
 * Escala: 40px = 1 metro. Gym 18×16m = SVG 720×640px (+ padding).
 * Origem do gym (0,0) = centro do SVG. z negativo (fundo do gym)
 * fica em cima no SVG (orientação natural pra plant view).
 */

const PX_PER_M = 36; // ajustável — 40 fica grande em mobile
const PADDING = 24;

const GYM_W = GYM_BOUNDS.maxX - GYM_BOUNDS.minX; // 18
const GYM_D = GYM_BOUNDS.maxZ - GYM_BOUNDS.minZ; // 16

const SVG_W = GYM_W * PX_PER_M + PADDING * 2;
const SVG_H = GYM_D * PX_PER_M + PADDING * 2;

/** Converte x do gym (metros) pra SVG (px). */
function gymXtoSvg(x: number): number {
  return (x - GYM_BOUNDS.minX) * PX_PER_M + PADDING;
}

/** Converte z do gym (metros) pra SVG (px). z fundo (negativo) → SVG topo. */
function gymZtoSvg(z: number): number {
  return (z - GYM_BOUNDS.minZ) * PX_PER_M + PADDING;
}

interface GymEditorProps {
  /** Posição inicial — vem do localStorage. */
  initialLayout?: GymLayout;
}

export default function GymEditor({ initialLayout }: GymEditorProps) {
  const [layout, setLayout] = useState<GymLayout>(initialLayout ?? DEFAULT_LAYOUT);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    // Hidrata do localStorage no client (SSR não tem acesso).
    const loaded = loadLayout();
    setLayout(loaded);
  }, []);

  return (
    <div className="space-y-3">
      {/* Toolbar topo */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-brand-lime">PLANTA BAIXA</div>
          <div className="font-display text-base tracking-tight">Editor do Ginásio</div>
        </div>
        <div className="flex gap-2">
          <a
            href="/pr/gym"
            className="text-xs bg-brand-lime text-navy-900 font-semibold rounded px-3 py-1.5 hover:opacity-90"
          >
            Ver em 3D →
          </a>
        </div>
      </div>

      {/* Aviso V1 read-only */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
        🔧 V1 — só visualização. Drag-and-drop, rotação e paleta chegam nos próximos updates.
      </div>

      {/* Canvas SVG */}
      <div className="rounded-2xl overflow-hidden border border-navy-700 bg-navy-900 p-2">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-auto"
          style={{ maxHeight: "min(640px, 75vh)" }}
        >
          {/* Fundo do gym (paredes) */}
          <rect
            x={PADDING}
            y={PADDING}
            width={GYM_W * PX_PER_M}
            height={GYM_D * PX_PER_M}
            fill="#0a0050"
            stroke="#D8FF2C"
            strokeWidth="2"
            opacity="0.4"
          />

          {/* Grid 1m */}
          {Array.from({ length: GYM_W + 1 }).map((_, i) => (
            <line
              key={`v-${i}`}
              x1={PADDING + i * PX_PER_M}
              y1={PADDING}
              x2={PADDING + i * PX_PER_M}
              y2={PADDING + GYM_D * PX_PER_M}
              stroke="#1e1b50"
              strokeWidth="0.5"
            />
          ))}
          {Array.from({ length: GYM_D + 1 }).map((_, i) => (
            <line
              key={`h-${i}`}
              x1={PADDING}
              y1={PADDING + i * PX_PER_M}
              x2={PADDING + GYM_W * PX_PER_M}
              y2={PADDING + i * PX_PER_M}
              stroke="#1e1b50"
              strokeWidth="0.5"
            />
          ))}

          {/* Eixo central (cruz no centro do gym) */}
          <line
            x1={gymXtoSvg(0)}
            y1={PADDING}
            x2={gymXtoSvg(0)}
            y2={PADDING + GYM_D * PX_PER_M}
            stroke="#D8FF2C"
            strokeWidth="0.5"
            strokeDasharray="2,4"
            opacity="0.3"
          />
          <line
            x1={PADDING}
            y1={gymZtoSvg(0)}
            x2={PADDING + GYM_W * PX_PER_M}
            y2={gymZtoSvg(0)}
            stroke="#D8FF2C"
            strokeWidth="0.5"
            strokeDasharray="2,4"
            opacity="0.3"
          />

          {/* Indicador de entrada (z+, sul no top-down) */}
          <text
            x={SVG_W / 2}
            y={SVG_H - 6}
            fill="#D8FF2C"
            fontSize="10"
            textAnchor="middle"
            fontWeight="700"
            letterSpacing="3"
          >
            ENTRADA ↓
          </text>
          <text
            x={SVG_W / 2}
            y={PADDING - 8}
            fill="#9aa3b0"
            fontSize="10"
            textAnchor="middle"
            fontWeight="700"
            letterSpacing="3"
          >
            FUNDO ↑
          </text>

          {/* Objetos */}
          {layout.objects.map((obj) => (
            <GymObjectShape
              key={obj.id}
              obj={obj}
              hovered={hovered === obj.id}
              onHover={(h) => setHovered(h ? obj.id : null)}
            />
          ))}
        </svg>
      </div>

      {/* Lista de objetos (debug + futura paleta) */}
      <div className="rounded-2xl border border-navy-700 bg-navy-800/30 p-3">
        <div className="text-[10px] uppercase tracking-[0.3em] text-navy-300 mb-2">
          Objetos ({layout.objects.length})
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
          {layout.objects.map((obj) => {
            const meta = OBJECT_META[obj.type];
            return (
              <div
                key={obj.id}
                onMouseEnter={() => setHovered(obj.id)}
                onMouseLeave={() => setHovered(null)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded border transition cursor-default ${
                  hovered === obj.id
                    ? "border-brand-lime bg-brand-lime/10"
                    : "border-navy-700 hover:border-navy-600"
                }`}
              >
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ background: meta.color }}
                />
                <span className="text-navy-100 truncate">{meta.label}</span>
                <span className="text-navy-400 text-[10px] ml-auto">
                  {obj.x.toFixed(1)},{obj.z.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Renderiza um GymObject como retângulo SVG na sua posição+rotação.
 * Aplica transform pra rotação ficar correta no top-down.
 */
function GymObjectShape({
  obj,
  hovered,
  onHover,
}: {
  obj: GymObject;
  hovered: boolean;
  onHover: (h: boolean) => void;
}) {
  const meta = OBJECT_META[obj.type];
  const cx = gymXtoSvg(obj.x);
  const cy = gymZtoSvg(obj.z);
  const w = meta.footprintW * PX_PER_M;
  const h = meta.footprintD * PX_PER_M;
  const rotDeg = (obj.rot * 180) / Math.PI;

  return (
    <g
      transform={`translate(${cx} ${cy}) rotate(${rotDeg})`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{ cursor: "default" }}
    >
      {/* Footprint */}
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill={meta.color}
        opacity={hovered ? 0.85 : 0.55}
        stroke={hovered ? "#ffffff" : meta.color}
        strokeWidth={hovered ? 2 : 1}
        rx={4}
      />

      {/* Indicador de "frente" (seta pequena na direção da rotação) */}
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={-h / 2 - 6}
        stroke="#ffffff"
        strokeWidth="1.5"
        opacity="0.7"
      />
      <circle cx={0} cy={-h / 2 - 6} r={2} fill="#ffffff" opacity="0.7" />

      {/* Label */}
      <text
        x={0}
        y={3}
        fill="#01002A"
        fontSize={Math.min(11, Math.max(8, w * 0.08))}
        textAnchor="middle"
        fontWeight="900"
        style={{ fontFamily: "Archivo Black, Inter, sans-serif", pointerEvents: "none" }}
        transform={`rotate(${-rotDeg})`}
      >
        {meta.label.toUpperCase()}
      </text>
    </g>
  );
}
