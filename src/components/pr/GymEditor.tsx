import { useState, useEffect, useRef } from "react";
import {
  loadLayout,
  saveLayout,
  resetLayout,
  updateObject,
  DEFAULT_LAYOUT,
  OBJECT_META,
  GYM_BOUNDS,
  snapCoord,
  type GymLayout,
  type GymObject,
} from "../../lib/pr/gym/layout";

/**
 * GymEditor V2 — drag and drop.
 *
 * Step 4: usuário arrasta objetos no top-down 2D, snap a 0.5m,
 * salva no localStorage. Próximos steps adicionam rotação,
 * paleta (add/remove), reset, presets e persistência Supabase.
 */

const PX_PER_M = 36;
const PADDING = 24;

const GYM_W = GYM_BOUNDS.maxX - GYM_BOUNDS.minX;
const GYM_D = GYM_BOUNDS.maxZ - GYM_BOUNDS.minZ;

const SVG_W = GYM_W * PX_PER_M + PADDING * 2;
const SVG_H = GYM_D * PX_PER_M + PADDING * 2;

function gymXtoSvg(x: number): number {
  return (x - GYM_BOUNDS.minX) * PX_PER_M + PADDING;
}
function gymZtoSvg(z: number): number {
  return (z - GYM_BOUNDS.minZ) * PX_PER_M + PADDING;
}
function svgToGymX(px: number): number {
  return (px - PADDING) / PX_PER_M + GYM_BOUNDS.minX;
}
function svgToGymZ(px: number): number {
  return (px - PADDING) / PX_PER_M + GYM_BOUNDS.minZ;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

interface DragState {
  id: string;
  /** Offset entre o ponto de clique e o centro do objeto (em metros). */
  offsetX: number;
  offsetZ: number;
}

interface GymEditorProps {
  initialLayout?: GymLayout;
}

export default function GymEditor({ initialLayout }: GymEditorProps) {
  const [layout, setLayout] = useState<GymLayout>(initialLayout ?? DEFAULT_LAYOUT);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    setLayout(loadLayout());
  }, []);

  /** Converte um pointer event pra coordenadas do gym (metros). */
  function pointerToGym(e: React.PointerEvent | PointerEvent): { x: number; z: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, z: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, z: 0 };
    const local = pt.matrixTransform(ctm.inverse());
    return { x: svgToGymX(local.x), z: svgToGymZ(local.y) };
  }

  function startDrag(obj: GymObject, e: React.PointerEvent) {
    e.stopPropagation();
    setSelected(obj.id);
    const p = pointerToGym(e);
    setDragging({
      id: obj.id,
      offsetX: p.x - obj.x,
      offsetZ: p.z - obj.z,
    });
    // Captura pra não perder o pointer ao sair do elemento
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }

  function onSvgPointerMove(e: React.PointerEvent) {
    if (!dragging) return;
    const p = pointerToGym(e);
    const targetX = snapCoord(p.x - dragging.offsetX);
    const targetZ = snapCoord(p.z - dragging.offsetZ);
    const meta = OBJECT_META[
      layout.objects.find((o) => o.id === dragging.id)?.type ?? "spawn"
    ];
    // Bound: deixa metade do footprint dentro dos limites
    const halfW = meta.footprintW / 2;
    const halfD = meta.footprintD / 2;
    const x = clamp(targetX, GYM_BOUNDS.minX + halfW, GYM_BOUNDS.maxX - halfW);
    const z = clamp(targetZ, GYM_BOUNDS.minZ + halfD, GYM_BOUNDS.maxZ - halfD);
    setLayout((prev) => updateObject(prev, dragging.id, { x, z }));
  }

  function onSvgPointerUp() {
    if (!dragging) return;
    saveLayout(layout);
    setDragging(null);
    setSavedAt(Date.now());
  }

  function onSvgClick(e: React.MouseEvent) {
    // Click no fundo deseleciona
    if (e.target === e.currentTarget) setSelected(null);
  }

  function handleReset() {
    if (!confirm("Restaurar layout padrão? Suas mudanças serão perdidas.")) return;
    const fresh = resetLayout();
    setLayout(fresh);
    setSelected(null);
    setSavedAt(Date.now());
  }

  return (
    <div className="space-y-3">
      {/* Toolbar topo */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-brand-lime">PLANTA BAIXA</div>
          <div className="font-display text-base tracking-tight">Editor do Ginásio</div>
        </div>
        <div className="flex gap-2 items-center">
          {savedAt && (
            <span className="text-[10px] text-brand-lime/70">✓ salvo</span>
          )}
          <button
            type="button"
            onClick={handleReset}
            className="text-xs border border-navy-600 text-navy-200 rounded px-2.5 py-1.5 hover:border-red-500 hover:text-red-300"
          >
            Resetar
          </button>
          <a
            href="/pr/gym"
            className="text-xs bg-brand-lime text-navy-900 font-semibold rounded px-3 py-1.5 hover:opacity-90"
          >
            Ver em 3D →
          </a>
        </div>
      </div>

      {/* Aviso V2 */}
      <div className="rounded-lg border border-brand-lime/30 bg-brand-lime/5 p-3 text-xs text-brand-lime/90">
        🎯 Arrasta os objetos pra reorganizar o ginásio. Snap de 50cm. Salva automático.
      </div>

      {/* Canvas SVG */}
      <div className="rounded-2xl overflow-hidden border border-navy-700 bg-navy-900 p-2 select-none touch-none">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full h-auto"
          style={{ maxHeight: "min(640px, 75vh)" }}
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onPointerCancel={onSvgPointerUp}
          onClick={onSvgClick}
        >
          {/* Fundo (paredes) */}
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

          {/* Eixo central */}
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

          {/* Indicadores fundo / entrada */}
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
              selected={selected === obj.id}
              dragging={dragging?.id === obj.id}
              onHover={(h) => setHovered(h ? obj.id : null)}
              onPointerDown={(e) => startDrag(obj, e)}
            />
          ))}
        </svg>
      </div>

      {/* Lista lateral */}
      <div className="rounded-2xl border border-navy-700 bg-navy-800/30 p-3">
        <div className="text-[10px] uppercase tracking-[0.3em] text-navy-300 mb-2">
          Objetos ({layout.objects.length})
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
          {layout.objects.map((obj) => {
            const meta = OBJECT_META[obj.type];
            const isSelected = selected === obj.id;
            return (
              <div
                key={obj.id}
                onMouseEnter={() => setHovered(obj.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setSelected(obj.id)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded border transition cursor-pointer ${
                  isSelected
                    ? "border-brand-lime bg-brand-lime/15"
                    : hovered === obj.id
                    ? "border-brand-lime/60 bg-brand-lime/5"
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

function GymObjectShape({
  obj,
  hovered,
  selected,
  dragging,
  onHover,
  onPointerDown,
}: {
  obj: GymObject;
  hovered: boolean;
  selected: boolean;
  dragging: boolean;
  onHover: (h: boolean) => void;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const meta = OBJECT_META[obj.type];
  const cx = gymXtoSvg(obj.x);
  const cy = gymZtoSvg(obj.z);
  const w = meta.footprintW * PX_PER_M;
  const h = meta.footprintD * PX_PER_M;
  const rotDeg = (obj.rot * 180) / Math.PI;

  const strokeColor = selected
    ? "#D8FF2C"
    : hovered || dragging
    ? "#ffffff"
    : meta.color;
  const strokeWidth = selected ? 3 : hovered || dragging ? 2 : 1;
  const opacity = dragging ? 0.95 : hovered || selected ? 0.85 : 0.55;

  return (
    <g
      transform={`translate(${cx} ${cy}) rotate(${rotDeg})`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onPointerDown={onPointerDown}
      style={{ cursor: dragging ? "grabbing" : "grab", touchAction: "none" }}
    >
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill={meta.color}
        opacity={opacity}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        rx={4}
      />
      {/* Indicador de "frente" */}
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
        style={{
          fontFamily: "Archivo Black, Inter, sans-serif",
          pointerEvents: "none",
          userSelect: "none",
        }}
        transform={`rotate(${-rotDeg})`}
      >
        {meta.label.toUpperCase()}
      </text>
    </g>
  );
}
