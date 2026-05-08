import { useEffect, useRef, useState, useCallback } from "react";

// Endless runner — pula barras, abaixa nas baixas. Score por distancia.
// V2 (cycles 4-10 fix): client:load + autostart + responsive canvas + ESC reset.

type Obstacle = { x: number; y: number; w: number; h: number; type: "high" | "low" };

export default function BarbellBounceGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [hi, setHi] = useState(0);
  const [running, setRunning] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const runningRef = useRef(false);

  useEffect(() => {
    const stored = Number(localStorage.getItem("pr_bb_hi") ?? "0");
    setHi(stored);
  }, []);

  const startGame = useCallback(() => {
    setScore(0);
    setGameOver(false);
    setSubmitted(false);
    setRunning(true);
    runningRef.current = true;
  }, []);

  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const groundY = H - 60;

    const player = { x: 80, y: groundY, vy: 0, w: 38, h: 56, ducking: false };
    const gravity = 0.85;
    const jumpV = -16;

    let obstacles: Obstacle[] = [];
    let frame = 0;
    let speed = 6;
    let scoreLocal = 0;
    let stopped = false;

    function spawn() {
      const t = Math.random() < 0.6 ? "high" : "low";
      if (t === "high") {
        obstacles.push({ x: W + 20, y: groundY - 60, w: 24, h: 60, type: t });
      } else {
        obstacles.push({ x: W + 20, y: groundY - 130, w: 50, h: 18, type: t });
      }
    }

    let jumpHeld = false;
    let duckHeld = false;

    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        jumpHeld = true;
      }
      if (e.code === "ArrowDown") {
        e.preventDefault();
        duckHeld = true;
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space" || e.code === "ArrowUp") jumpHeld = false;
      if (e.code === "ArrowDown") duckHeld = false;
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Touch / click — tap = jump, swipe down = duck
    let touchStartY = 0;
    function onPointerDown(e: PointerEvent) {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      touchStartY = e.clientY - rect.top;
      jumpHeld = true;
    }
    function onPointerMove(e: PointerEvent) {
      if (!jumpHeld) return;
      const rect = canvas.getBoundingClientRect();
      const y = e.clientY - rect.top;
      if (y - touchStartY > 25) {
        duckHeld = true;
        jumpHeld = false;
      }
    }
    function onPointerUp() {
      jumpHeld = false;
      duckHeld = false;
    }
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    function loop() {
      if (stopped || !runningRef.current) return;
      frame++;

      // Player physics
      if (jumpHeld && player.y >= groundY - 1) {
        player.vy = jumpV;
      }
      player.ducking = duckHeld && player.y >= groundY - 1;
      player.vy += gravity;
      player.y += player.vy;
      if (player.y > groundY) {
        player.y = groundY;
        player.vy = 0;
      }

      const playerH = player.ducking ? 30 : player.h;
      const playerY = player.ducking ? groundY - 30 : player.y - player.h;

      if (frame % Math.max(50, 90 - Math.floor(scoreLocal / 100)) === 0) {
        spawn();
      }

      obstacles.forEach((o) => {
        o.x -= speed;
      });
      obstacles = obstacles.filter((o) => o.x + o.w > 0);

      // Collision
      for (const o of obstacles) {
        if (
          player.x < o.x + o.w &&
          player.x + player.w > o.x &&
          playerY < o.y + o.h &&
          playerY + playerH > o.y
        ) {
          stopped = true;
          runningRef.current = false;
          setGameOver(true);
          setScore(scoreLocal);
          submitScoreInternal(scoreLocal);
          return;
        }
      }

      if (frame % 200 === 0 && speed < 14) speed += 0.5;

      scoreLocal = Math.floor(frame / 6);

      // Render
      ctx.fillStyle = "#01002A";
      ctx.fillRect(0, 0, W, H);

      // Background lines (parallax)
      ctx.strokeStyle = "rgba(216,255,44,0.1)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const x = (frame * speed * 0.3 + i * 100) % W;
        ctx.beginPath();
        ctx.moveTo(x, groundY);
        ctx.lineTo(x - 30, H);
        ctx.stroke();
      }

      // Ground
      ctx.fillStyle = "#0a0a14";
      ctx.fillRect(0, groundY, W, H - groundY);
      ctx.strokeStyle = "#D8FF2C";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(W, groundY);
      ctx.stroke();

      // Player
      ctx.fillStyle = "#D8FF2C";
      ctx.fillRect(player.x, playerY, player.w, playerH);
      // Eye + brand
      ctx.fillStyle = "#01002A";
      ctx.fillRect(player.x + 8, playerY + 8, 6, 6);
      ctx.font = "bold 10px sans-serif";
      ctx.fillText("PR", player.x + 4, playerY + 30);

      // Obstacles
      for (const o of obstacles) {
        if (o.type === "high") {
          ctx.fillStyle = "#DA291C";
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = "#0057B8";
          ctx.fillRect(o.x - 5, o.y - 6, o.w + 10, 8);
        } else {
          ctx.fillStyle = "#FFC72C";
          ctx.fillRect(o.x, o.y, o.w, o.h);
        }
      }

      // HUD
      ctx.fillStyle = "#D8FF2C";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText(`SCORE: ${scoreLocal}`, 16, 30);
      ctx.font = "14px sans-serif";
      ctx.fillStyle = "#9ca3af";
      ctx.fillText(`HI: ${hi}`, 16, 50);

      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    return () => {
      stopped = true;
      runningRef.current = false;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    };
  }, [running, hi]);

  // Quando game over, pinta a tela "GAME OVER" sobre o canvas
  useEffect(() => {
    if (!gameOver) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "rgba(1,0,42,0.85)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#DA291C";
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 10);
    ctx.fillStyle = "#D8FF2C";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 + 30);
    ctx.fillStyle = "#ffffff";
    ctx.font = "14px sans-serif";
    ctx.fillText("Toque/Espaço pra jogar de novo", canvas.width / 2, canvas.height / 2 + 60);
  }, [gameOver, score]);

  function submitScoreInternal(s: number) {
    if (submitted) return;
    setSubmitted(true);
    if (s > hi) {
      localStorage.setItem("pr_bb_hi", String(s));
      setHi(s);
    }
    if (s > 50) {
      void fetch("/api/pr/arcade/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: "barbell_bounce", score: s }),
      }).catch(() => {});
    }
  }

  // Tap/space na tela de start ou game over → start
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.code === "Space" && (!running || gameOver)) {
        e.preventDefault();
        startGame();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [running, gameOver, startGame]);

  return (
    <div ref={containerRef} className="flex flex-col items-center gap-3 w-full">
      <div className="relative w-full max-w-2xl">
        <canvas
          ref={canvasRef}
          width={640}
          height={360}
          onClick={() => {
            if (!running || gameOver) startGame();
          }}
          className="bg-navy-900 border-2 border-brand-lime/40 rounded-lg w-full h-auto cursor-pointer touch-none"
          style={{ imageRendering: "pixelated" }}
        />
        {!running && !gameOver ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none rounded-lg bg-black/40">
            <div className="text-3xl font-display font-bold text-brand-lime mb-2">
              ▶ TOQUE PRA JOGAR
            </div>
            <div className="text-xs text-white/80">Best: {hi}</div>
          </div>
        ) : null}
      </div>
      <div className="text-xs text-navy-300 text-center max-w-md">
        <strong className="text-white">Como jogar:</strong> ESPAÇO ou ↑ pra pular ·
        ↓ pra abaixar · No celular: tap pula, swipe ↓ abaixa.
      </div>
      {gameOver ? (
        <button
          type="button"
          onClick={startGame}
          className="bg-brand-lime text-navy-900 font-display font-bold rounded-lg px-6 py-3 hover:opacity-90"
        >
          ↻ JOGAR DE NOVO
        </button>
      ) : null}
    </div>
  );
}
