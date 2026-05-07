import { useState, useEffect, useRef } from "react";
import {
  loadLayout,
  saveLayout,
  resetLayout,
  updateObject,
  addObject,
  removeObject,
  generateObjectId,
  applyPreset,
  PRESETS,
  DEFAULT_LAYOUT,
  OBJECT_META,
  GYM_BOUNDS,
  snapCoord,
  type GymLayout,
  type GymObject,
  type GymObjectType,
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
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pendingSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hidrata do servidor (Supabase) na montagem; fallback localStorage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/pr/gym/layout", { credentials: "include" });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (data.layout) {
            setLayout(data.layout);
            // Sincroniza localStorage com o servidor (cache local).
            saveLayout(data.layout);
            return;
          }
        }
      } catch {
        // Sem rede / sem auth → cai pro localStorage.
      }
      if (!cancelled) setLayout(loadLayout());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Salva no servidor com debounce de 500ms (evita flood durante drag).
   * Sempre salva no localStorage primeiro (cache rápido).
   */
  function persistLayout(next: GymLayout) {
    saveLayout(next);
    if (pendingSaveRef.current) clearTimeout(pendingSaveRef.current);
    pendingSaveRef.current = setTimeout(async () => {
      setSyncStatus("syncing");
      try {
        const res = await fetch("/api/pr/gym/layout", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layout: next }),
        });
        setSyncStatus(res.ok ? "synced" : "error");
      } catch {
        setSyncStatus("error");
      }
    }, 500);
  }

  /** Rotação em snap de 45° (π/4). dir=+1 horário, -1 anti-horário. */
  function rotateSelected(dir: 1 | -1 = 1) {
    if (!selected) return;
    const obj = layout.objects.find((o) => o.id === selected);
    if (!obj) return;
    const STEP = Math.PI / 4;
    let next = obj.rot + dir * STEP;
    // Normaliza pra [-π, π]
    while (next > Math.PI) next -= 2 * Math.PI;
    while (next < -Math.PI) next += 2 * Math.PI;
    // Snap pra múltiplo exato de 45°
    next = Math.round(next / STEP) * STEP;
    const updated = updateObject(layout, selected, { rot: next });
    setLayout(updated);
    persistLayout(updated);
    setSavedAt(Date.now());
  }

  /** Adiciona novo objeto do tipo informado no centro (0,0). */
  function addNewObject(type: GymObjectType) {
    const id = generateObjectId(type);
    const newObj: GymObject = { id, type, x: 0, z: 0, rot: 0 };
    const updated = addObject(layout, newObj);
    setLayout(updated);
    persistLayout(updated);
    setSelected(id);
    setSavedAt(Date.now());
  }

  /** Remove objeto (só se for deletable). */
  function deleteSelected() {
    if (!selected) return;
    const obj = layout.objects.find((o) => o.id === selected);
    if (!obj) return;
    const meta = OBJECT_META[obj.type];
    if (!meta.deletable) {
      // Sem confirm — só ignora silencioso (botão estará disabled de qualquer jeito)
      return;
    }
    if (!confirm(`Remover "${meta.label}"?`)) return;
    const updated = removeObject(layout, selected);
    setLayout(updated);
    persistLayout(updated);
    setSelected(null);
    setSavedAt(Date.now());
  }

  /** Tecla R rotaciona selecionado, Delete remove, Esc deseleciona. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignora se está num input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (!selected) {
        if (e.key === "Escape") setSelected(null);
        return;
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        rotateSelected(e.shiftKey ? -1 : 1);
      } else if (e.key === "Escape") {
        setSelected(null);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelected();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, layout]);

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
    persistLayout(layout);
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
    persistLayout(fresh);
    setSelected(null);
    setSavedAt(Date.now());
  }

  function handleApplyPreset(presetId: string) {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    if (
      !confirm(
        `Aplicar preset "${preset.label}"?\n\n${preset.description}\n\nSeu layout atual será substituído.`,
      )
    )
      return;
    const fresh = applyPreset(presetId);
    setLayout(fresh);
    persistLayout(fresh);
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

      {/* Aviso + atalhos */}
      <div className="rounded-lg border border-brand-lime/30 bg-brand-lime/5 p-3 text-xs text-brand-lime/90">
        🎯 Arrasta pra reposicionar (snap 50cm). Selecionado:
        {" "}<kbd className="px-1 py-0.5 rounded bg-navy-900 border border-navy-600 font-mono">R</kbd> gira 45°,
        {" "}<kbd className="px-1 py-0.5 rounded bg-navy-900 border border-navy-600 font-mono">Shift+R</kbd> anti-horário,
        {" "}<kbd className="px-1 py-0.5 rounded bg-navy-900 border border-navy-600 font-mono">Esc</kbd> deseleciona.
      </div>

      {/* Painel do objeto selecionado */}
      {selected && (
        <SelectedPanel
          obj={layout.objects.find((o) => o.id === selected)!}
          onRotate={(dir) => rotateSelected(dir)}
          onDelete={deleteSelected}
          onDeselect={() => setSelected(null)}
        />
      )}

      {/* Paleta de tipos — adicionar novos objetos */}
      <AddPalette layout={layout} onAdd={addNewObject} />

      {/* Presets pré-definidos */}
      <div className="rounded-2xl border border-navy-700 bg-navy-800/30 p-3">
        <div className="text-[10px] uppercase tracking-[0.3em] text-navy-300 mb-2">
          Aplicar preset
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleApplyPreset(p.id)}
              className="text-left px-3 py-2 rounded-lg border border-navy-600 hover:border-brand-lime hover:bg-brand-lime/5 transition"
              title={p.description}
            >
              <div className="text-xs font-semibold text-navy-100">{p.label}</div>
              <div className="text-[10px] text-navy-400 truncate">{p.description}</div>
            </button>
          ))}
        </div>
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

/**
 * Painel flutuante mostrando objeto selecionado + ações de rotação/delete.
 */
function SelectedPanel({
  obj,
  onRotate,
  onDelete,
  onDeselect,
}: {
  obj: GymObject;
  onRotate: (dir: 1 | -1) => void;
  onDelete: () => void;
  onDeselect: () => void;
}) {
  const meta = OBJECT_META[obj.type];
  const rotDeg = Math.round((obj.rot * 180) / Math.PI);
  return (
    <div className="rounded-lg border border-brand-lime/40 bg-brand-lime/10 p-3 flex items-center justify-between gap-2 flex-wrap">
      <div className="flex items-center gap-2 text-xs">
        <span
          className="inline-block w-3 h-3 rounded-sm"
          style={{ background: meta.color }}
        />
        <span className="font-semibold text-brand-lime">{meta.label}</span>
        <span className="text-navy-300">
          x={obj.x.toFixed(1)}m · z={obj.z.toFixed(1)}m · {rotDeg}°
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onRotate(-1)}
          className="text-xs border border-navy-600 text-navy-200 rounded px-2 py-1 hover:border-brand-lime hover:text-brand-lime"
          aria-label="Girar anti-horário"
        >
          ↺ -45°
        </button>
        <button
          type="button"
          onClick={() => onRotate(1)}
          className="text-xs border border-navy-600 text-navy-200 rounded px-2 py-1 hover:border-brand-lime hover:text-brand-lime"
          aria-label="Girar horário"
        >
          ↻ +45°
        </button>
        {meta.deletable ? (
          <button
            type="button"
            onClick={onDelete}
            className="text-xs border border-navy-600 text-navy-200 rounded px-2 py-1 hover:border-red-500 hover:text-red-300"
            aria-label="Remover"
            title="Delete pra remover"
          >
            🗑️
          </button>
        ) : (
          <span
            className="text-[10px] text-navy-400 px-1.5"
            title="Esse objeto é obrigatório no gym"
          >
            🔒
          </span>
        )}
        <button
          type="button"
          onClick={onDeselect}
          className="text-xs text-navy-400 hover:text-white px-2"
          aria-label="Deselecionar"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/**
 * Paleta horizontal pra adicionar novos objetos. Mostra só os tipos
 * que permitem múltiplas instâncias (multiple: true) e disable se já
 * tem o singleton no layout.
 */
function AddPalette({
  layout,
  onAdd,
}: {
  layout: GymLayout;
  onAdd: (type: GymObjectType) => void;
}) {
  const types = (Object.keys(OBJECT_META) as GymObjectType[]).filter((t) => {
    const meta = OBJECT_META[t];
    if (meta.multiple) return true;
    // Singleton: só mostra se ainda NÃO existe no layout
    return !layout.objects.some((o) => o.type === t);
  });
  if (types.length === 0) return null;
  return (
    <div className="rounded-2xl border border-navy-700 bg-navy-800/30 p-3">
      <div className="text-[10px] uppercase tracking-[0.3em] text-navy-300 mb-2">
        Adicionar objeto
      </div>
      <div className="flex flex-wrap gap-1.5">
        {types.map((t) => {
          const meta = OBJECT_META[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => onAdd(t)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-navy-600 hover:border-brand-lime hover:bg-brand-lime/10 transition text-xs"
              style={{ borderLeftColor: meta.color, borderLeftWidth: 3 }}
              title={`Adicionar ${meta.label} no centro`}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ background: meta.color }}
              />
              <span className="text-navy-100">+ {meta.label}</span>
            </button>
          );
        })}
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
