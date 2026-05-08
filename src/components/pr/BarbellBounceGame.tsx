import { useEffect, useRef, useState } from "react";

// Endless runner simples — pula barras altas, abaixa nas baixas. Score por distância.
// Persistencia local + envio pro endpoint /api/pr/arcade/score ao game over.

type Obstacle = { x: number; y: number; w: number; h: number; type: "high" | "low" };

export default function BarbellBounceGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [hi, setHi] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const stored = Number(localStorage.getItem("pr_bb_hi") ?? "0");
    setHi(stored);
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

    let player = { x: 80, y: groundY, vy: 0, w: 38, h: 56, ducking: false };
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
      if (e.code === "Space" || e.code === "ArrowUp") jumpHeld = true;
      if (e.code === "ArrowDown") duckHeld = true;
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space" || e.code === "ArrowUp") jumpHeld = false;
      if (e.code === "ArrowDown") duckHeld = false;
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // Touch: tap = jump, swipe down = duck
    let touchStartY = 0;
    function onTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      if (t) touchStartY = t.clientY;
      jumpHeld = true;
    }
    function onTouchMove(e: TouchEvent) {
      const t = e.touches[0];
      if (t && t.clientY - touchStartY > 30) {
        duckHeld = true;
        jumpHeld = false;
      }
    }
    function onTouchEnd() {
      jumpHeld = false;
      duckHeld = false;
    }
    canvas.addEventListener("touchstart", onTouchStart);
    canvas.addEventListener("touchmove", onTouchMove);
    canvas.addEventListener("touchend", onTouchEnd);

    function loop() {
      if (stopped) return;
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

      // Spawn
      if (frame % Math.max(60, 90 - Math.floor(scoreLocal / 100)) === 0) {
        spawn();
      }

      // Move obstacles + collision
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
          setGameOver(true);
          submitScore(scoreLocal);
          return;
        }
      }

      // Speed up
      if (frame % 200 === 0 && speed < 14) speed += 0.5;

      // Score
      scoreLocal = Math.floor(frame / 6);
      setScore(scoreLocal);

      // Render
      ctx.fillStyle = "#01002A";
      ctx.fillRect(0, 0, W, H);
      // Ground
      ctx.fillStyle = "#0a0a14";
      ctx.fillRect(0, groundY, W, H - groundY);
      ctx.strokeStyle = "#D8FF2C";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(W, groundY);
      ctx.stroke();
      // Background lines
      ctx.strokeStyle = "rgba(216,255,44,0.1)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const x = ((frame * speed * 0.3) + i * 100) % W;
        ctx.beginPath();
        ctx.moveTo(x, groundY);
        ctx.lineTo(x - 30, H);
        ctx.stroke();
      }
      // Player (mini barbell + person)
      ctx.fillStyle = "#D8FF2C";
      ctx.fillRect(player.x, playerY, player.w, playerH);
      ctx.fillStyle = "#01002A";
      ctx.fillRect(player.x + 8, playerY + 8, 6, 6); // eye
      // Obstacles
      for (const o of obstacles) {
        if (o.type === "high") {
          ctx.fillStyle = "#DA291C";
          ctx.fillRect(o.x, o.y, o.w, o.h);
          // Plate
          ctx.fillStyle = "#0057B8";
          ctx.fillRect(o.x - 5, o.y - 6, o.w + 10, 8);
        } else {
          ctx.fillStyle = "#FFC72C";
          ctx.fillRect(o.x, o.y, o.w, o.h);
        }
      }
      // Score HUD
      ctx.fillStyle = "#D8FF2C";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText(`SCORE: ${scoreLocal}`, 16, 30);
      ctx.font = "14px sans-serif";
      ctx.fillStyle = "#9ca3af";
      ctx.fillText(`HI: ${hi}`, 16, 50);

      requestAnimationFrame(loop);
    }
    loop();

    return () => {
      stopped = true;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [running, hi]);

  function submitScore(s: number) {
    if (s > hi) {
      localStorage.setItem("pr_bb_hi", String(s));
      setHi(s);
    }
    if (s > 50) {
      void fetch("/api/pr/arcade/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ game_id: "barbell_bounce", score: s }),
      });
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        width={640}
        height={360}
        className="bg-navy-900 border-2 border-brand-lime/40 rounded-lg max-w-full"
      />
      {!running && !gameOver ? (
        <button
          type="button"
          onClick={() => setRunning(true)}
          className="bg-brand-lime text-navy-900 font-display font-bold rounded-lg px-6 py-3 hover:opacity-90"
        >
          ▶ JOGAR
        </button>
      ) : null}
      {gameOver ? (
        <div className="text-center">
          <div className="text-2xl font-display font-bold text-white">Game Over</div>
          <div className="text-sm text-navy-300 mb-3">Score: {score}</div>
          <button
            type="button"
            onClick={() => {
              setGameOver(false);
              setRunning(false);
              setTimeout(() => setRunning(true), 50);
            }}
            className="bg-brand-lime text-navy-900 font-display font-bold rounded-lg px-6 py-3 hover:opacity-90"
          >
            ↻ JOGAR DE NOVO
          </button>
        </div>
      ) : null}
      <div className="text-xs text-navy-400 text-center">
        ESPAÇO/↑ pula · ↓ abaixa · Mobile: tap = pula, swipe ↓ = abaixa
      </div>
    </div>
  );
}
