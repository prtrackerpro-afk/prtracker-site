import { useEffect, useState, useRef } from "react";

// Modo lúdico: athlete clica num equipamento e brinca de "treinar".
// NÃO conta XP, NÃO vale PR. Pura diversão. Score local apenas.

export type PlayExercise =
  | "bench"
  | "squat"
  | "deadlift"
  | "pullup"
  | "pushup"
  | "burpee"
  | "boxjump"
  | "kbswing";

const LABELS: Record<PlayExercise, string> = {
  bench: "Bench Press",
  squat: "Squat",
  deadlift: "Deadlift",
  pullup: "Pull-up",
  pushup: "Push-up",
  burpee: "Burpee",
  boxjump: "Box Jump",
  kbswing: "KB Swing",
};

const EMOJI: Record<PlayExercise, string> = {
  bench: "🏋️",
  squat: "🦵",
  deadlift: "💪",
  pullup: "🤸",
  pushup: "🔽",
  burpee: "💥",
  boxjump: "📦",
  kbswing: "🪝",
};

export default function PlayModeOverlay({
  exercise,
  onClose,
}: {
  exercise: PlayExercise | null;
  onClose: () => void;
}) {
  const [reps, setReps] = useState(0);
  const [weight, setWeight] = useState(60);
  const [paused, setPaused] = useState(false);
  const [combo, setCombo] = useState(0);
  const [bestStr, setBestStr] = useState("0");
  const lastTapRef = useRef<number>(0);

  useEffect(() => {
    if (!exercise) {
      setReps(0);
      setCombo(0);
      return;
    }
    const stored = localStorage.getItem(`pr_play_best_${exercise}`) ?? "0";
    setBestStr(stored);
  }, [exercise]);

  useEffect(() => {
    if (!exercise || paused) return;
    function handleKey(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        doRep();
      } else if (e.code === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [exercise, paused]);

  function doRep() {
    const now = Date.now();
    const sinceLast = now - lastTapRef.current;
    lastTapRef.current = now;
    // Combo: timing entre 800ms e 1500ms = bom
    if (sinceLast > 400 && sinceLast < 2000) {
      setCombo((c) => c + 1);
    } else {
      setCombo(0);
    }
    setReps((r) => r + 1);
  }

  function handleEnd() {
    if (!exercise) return;
    const totalScore = reps * (1 + combo / 20);
    const best = Number(bestStr);
    if (totalScore > best) {
      localStorage.setItem(`pr_play_best_${exercise}`, String(Math.round(totalScore)));
      setBestStr(String(Math.round(totalScore)));
    }
    onClose();
  }

  if (!exercise) return null;

  const showWeight = ["bench", "squat", "deadlift"].includes(exercise);
  const score = Math.round(reps * (1 + combo / 20));

  return (
    <div className="fixed inset-0 bg-black/90 z-[55] flex items-center justify-center p-4">
      <div className="bg-navy-900 border-2 border-brand-lime/40 rounded-2xl p-6 w-full max-w-md shadow-xl shadow-brand-lime/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-brand-lime">
              MODO LÚDICO · NÃO VALE XP
            </div>
            <h2 className="font-display text-2xl">
              {EMOJI[exercise]} {LABELS[exercise]}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleEnd}
            className="text-navy-300 hover:text-white text-2xl"
          >
            ✕
          </button>
        </div>

        {showWeight ? (
          <div className="mb-4">
            <label className="block text-xs uppercase tracking-wider text-navy-300 mb-1">
              Peso (kg) — {weight}
            </label>
            <input
              type="range"
              min={20}
              max={300}
              step={5}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              className="w-full"
            />
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-3 mb-4 text-center">
          <div className="bg-navy-800/40 rounded-lg p-3">
            <div className="text-3xl font-display font-bold text-white tabular-nums">{reps}</div>
            <div className="text-[10px] uppercase tracking-wider text-navy-300">REPS</div>
          </div>
          <div className="bg-navy-800/40 rounded-lg p-3">
            <div className="text-3xl font-display font-bold text-brand-lime tabular-nums">x{combo}</div>
            <div className="text-[10px] uppercase tracking-wider text-navy-300">COMBO</div>
          </div>
          <div className="bg-navy-800/40 rounded-lg p-3">
            <div className="text-3xl font-display font-bold text-orange-400 tabular-nums">{score}</div>
            <div className="text-[10px] uppercase tracking-wider text-navy-300">SCORE</div>
          </div>
        </div>

        <div className="text-xs text-navy-400 text-center mb-3">
          Melhor: {bestStr}
        </div>

        <button
          type="button"
          onClick={doRep}
          onPointerDown={(e) => e.preventDefault()}
          className="w-full bg-brand-lime text-navy-900 font-display font-bold rounded-lg py-6 text-2xl hover:opacity-90 active:scale-95 transition select-none"
        >
          REP! (espaço)
        </button>

        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={() => setReps(0)}
            className="flex-1 bg-navy-800 text-white text-sm rounded-lg py-2 hover:bg-navy-700"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleEnd}
            className="flex-1 bg-orange-500 text-white text-sm rounded-lg py-2 hover:opacity-90"
          >
            Encerrar
          </button>
        </div>

        <div className="text-[10px] text-navy-500 text-center mt-3">
          Combo: timing entre 0.4s e 2s entre reps mantém combo. Combo aumenta o score.
        </div>
      </div>
    </div>
  );
}
