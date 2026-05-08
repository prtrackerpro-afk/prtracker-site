import { useEffect, useState } from "react";
import {
  TUTORIAL_STEPS,
  getTutorialState,
  markStepDone,
  skipTutorial,
} from "../../lib/pr/tutorial";

export default function TutorialOverlay() {
  const [stepIdx, setStepIdx] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const s = getTutorialState();
    if (s.isFinished || s.isSkipped) return;
    // Mostra primeiro step ainda nao completo
    const firstUndone = TUTORIAL_STEPS.findIndex((step) => !s.completed.includes(step.id));
    if (firstUndone === -1) return;
    setStepIdx(firstUndone);
    setVisible(true);
  }, []);

  if (!visible) return null;
  const step = TUTORIAL_STEPS[stepIdx];
  if (!step) return null;

  function handleAdvance() {
    markStepDone(step.id);
    if (step.href) {
      window.location.href = step.href;
      return;
    }
    if (stepIdx + 1 >= TUTORIAL_STEPS.length) {
      setVisible(false);
      return;
    }
    setStepIdx(stepIdx + 1);
  }

  function handleSkip() {
    skipTutorial();
    setVisible(false);
  }

  const total = TUTORIAL_STEPS.length;
  const cur = stepIdx + 1;

  return (
    <div className="fixed inset-0 bg-black/85 z-[60] flex items-end sm:items-center justify-center p-4">
      <div className="bg-navy-900 border-2 border-brand-lime/40 rounded-2xl p-5 w-full max-w-md shadow-xl shadow-brand-lime/20">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-[0.3em] text-brand-lime">
            Tutorial · {cur}/{total}
          </div>
          <button
            type="button"
            onClick={handleSkip}
            className="text-xs text-navy-400 hover:text-white"
          >
            Pular tudo
          </button>
        </div>
        <h2 className="font-display text-2xl mb-2 text-white">{step.title}</h2>
        <p className="text-sm text-navy-300 mb-4">{step.body}</p>
        {/* Progress bar */}
        <div className="h-1 bg-navy-800 rounded-full mb-4 overflow-hidden">
          <div
            className="h-full bg-brand-lime transition-all"
            style={{ width: `${(cur / total) * 100}%` }}
          />
        </div>
        <div className="flex gap-2">
          {stepIdx > 0 ? (
            <button
              type="button"
              onClick={() => setStepIdx(stepIdx - 1)}
              className="px-3 py-2.5 rounded-lg border border-navy-600 text-sm hover:bg-navy-800"
            >
              ← Voltar
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleAdvance}
            className="flex-1 bg-brand-lime text-navy-900 font-bold rounded-lg py-2.5 text-sm hover:opacity-90"
          >
            {step.cta}
          </button>
        </div>
      </div>
    </div>
  );
}
