/* Hero: a 3-link planar arm, drawn like a technical sketch, solving IK
   toward the cursor. Joints are smoothed independently so the motion reads
   like real actuators with different inertia rather than a rigid follow. */
(() => {
  const canvas = document.querySelector("[data-arm]");
  if (!canvas) return;
  const hero = canvas.closest(".hero");
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const out = {};
  document.querySelectorAll("[data-r]").forEach((el) => (out[el.dataset.r] = el));

  const TAU = Math.PI * 2;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

  let W = 0, H = 0, dpr = 1;
  let ink = "#0f0f0e", paper = "#f1f0eb", accent = "#ff4f12";
  // geometry, recomputed on resize
  let base = { x: 0, y: 0 }, floorY = 0, colH = 0, L1 = 0, L2 = 0, L3 = 0, s = 1;
  // joint state (absolute angles, screen space: y down)
  const q = { a1: -1.9, a2: -0.6, a3: 0.5 };
  let grip = 1, gripTarget = 1;
  const target = { x: 0, y: 0 }, aim = { x: 0, y: 0 };
  let pointerActive = false, lastPointer = 0, pressed = false;
  let intro = reduce ? 1 : 0, started = reduce, visible = true, raf = 0, frame = 0;
  let last = performance.now(), clock = 0;

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    ink = cs.getPropertyValue("--ink").trim() || ink;
    paper = cs.getPropertyValue("--paper").trim() || paper;
    accent = cs.getPropertyValue("--accent").trim() || accent;
  }

  function resize() {
    const r = hero.getBoundingClientRect();
    W = r.width;
    H = r.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const small = W < 820;
    s = small ? clamp(Math.min(W / 430, H / 900), 0.62, 1) : clamp(Math.min(W / 1500, H / 900), 0.72, 1.25);
    floorY = H - (small ? H * 0.46 : 72 * s);
    base.x = small ? W * 0.68 : W * 0.76;
    colH = 118 * s;
    base.y = floorY - colH;
    L1 = 250 * s;
    L2 = 210 * s;
    L3 = 92 * s;
    if (!pointerActive) idleTarget(clock, true);
  }

  function idleTarget(t, snap) {
    const small = W < 820;
    const cx = base.x - (small ? 150 : 340) * s;
    const cy = base.y - (small ? 190 : 200) * s;
    target.x = cx + Math.sin(t * 0.37) * (small ? 110 : 150) * s;
    target.y = cy + Math.sin(t * 0.74 + 0.6) * 80 * s;
    if (snap) {
      aim.x = target.x;
      aim.y = target.y;
    }
  }

  // Solve for absolute link angles given a tool-tip goal.
  function solve(gx, gy) {
    // keep the goal above the floor and inside the reachable annulus
    gy = Math.min(gy, floorY - 26 * s);
    let dx = gx - base.x, dy = gy - base.y;
    const d0 = Math.hypot(dx, dy) || 1;
    const Lt = toolLen();
    const maxR = L1 + L2 + Lt * 0.98;
    if (d0 > maxR) {
      dx *= maxR / d0;
      dy *= maxR / d0;
    }
    const tx = base.x + dx, ty = base.y + dy;
    // tool points along the reach direction, tipped downward like a real approach
    const reachAng = Math.atan2(dy, dx);
    const down = Math.PI / 2;
    const phi = reachAng + wrap(down - reachAng) * 0.38;
    const wx = tx - Math.cos(phi) * Lt, wy = ty - Math.sin(phi) * Lt;
    let ex = wx - base.x, ey = wy - base.y;
    let d = Math.hypot(ex, ey);
    d = clamp(d, Math.abs(L1 - L2) + 1, L1 + L2 - 0.5);
    const a = Math.atan2(ey, ex);
    const c = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const off = Math.acos(c);
    // choose elbow-up solution (smaller screen y)
    const c1 = a - off, c2 = a + off;
    const e1y = base.y + Math.sin(c1) * L1, e2y = base.y + Math.sin(c2) * L1;
    const a1 = e1y < e2y ? c1 : c2;
    const ex2 = base.x + Math.cos(a1) * L1, ey2 = base.y + Math.sin(a1) * L1;
    const a2 = Math.atan2(wy - ey2, wx - ex2);
    return { a1, a2, a3: phi };
  }

  function fk() {
    const S = { x: base.x, y: base.y };
    const E = { x: S.x + Math.cos(q.a1) * L1, y: S.y + Math.sin(q.a1) * L1 };
    const Wr = { x: E.x + Math.cos(q.a2) * L2, y: E.y + Math.sin(q.a2) * L2 };
    const T = { x: Wr.x + Math.cos(q.a3) * L3, y: Wr.y + Math.sin(q.a3) * L3 };
    return { S, E, Wr, T };
  }

  /* ---------- drawing helpers ---------- */

  function line(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function link(A, ang, len, w, grow) {
    const l = len * grow;
    ctx.save();
    ctx.translate(A.x, A.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -w / 2, l + w, w, w / 2);
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.stroke();
    // centerline
    ctx.save();
    ctx.setLineDash([10 * s, 4 * s, 2 * s, 4 * s]);
    ctx.globalAlpha *= 0.35;
    line(-w * 0.2, 0, l + w * 0.2, 0);
    ctx.restore();
    // extrusion slots
    ctx.save();
    ctx.globalAlpha *= 0.25;
    line(w * 0.6, -w * 0.22, l - w * 0.1, -w * 0.22);
    line(w * 0.6, w * 0.22, l - w * 0.1, w * 0.22);
    ctx.restore();
    ctx.restore();
  }

  function joint(P, r, rot) {
    ctx.beginPath();
    ctx.arc(P.x, P.y, r, 0, TAU);
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(P.x, P.y, r * 0.52, 0, TAU);
    ctx.stroke();
    // bolt pattern rotates with the joint
    for (let i = 0; i < 6; i++) {
      const a = rot + (i * TAU) / 6;
      ctx.beginPath();
      ctx.arc(P.x + Math.cos(a) * r * 0.77, P.y + Math.sin(a) * r * 0.77, Math.max(1.2, r * 0.07), 0, TAU);
      ctx.stroke();
    }
    ctx.save();
    ctx.globalAlpha *= 0.6;
    line(P.x - r * 0.22, P.y, P.x + r * 0.22, P.y);
    line(P.x, P.y - r * 0.22, P.x, P.y + r * 0.22);
    ctx.restore();
  }

  function angleArc(P, from, to, r, label) {
    ctx.save();
    ctx.globalAlpha *= 0.5;
    ctx.setLineDash([3, 3]);
    line(P.x, P.y, P.x + Math.cos(from) * (r + 18 * s), P.y + Math.sin(from) * (r + 18 * s));
    ctx.setLineDash([]);
    const delta = wrap(to - from);
    ctx.beginPath();
    ctx.arc(P.x, P.y, r, from, from + delta, delta < 0);
    ctx.stroke();
    ctx.restore();
    const mid = from + delta / 2;
    const lx = P.x + Math.cos(mid) * (r + 16 * s), ly = P.y + Math.sin(mid) * (r + 16 * s);
    ctx.save();
    ctx.globalAlpha *= 0.7;
    ctx.fillStyle = ink;
    ctx.textAlign = Math.cos(mid) >= 0 ? "left" : "right";
    ctx.fillText(label, lx, ly + 3);
    ctx.restore();
  }

  function gripper(T, ang, open) {
    ctx.save();
    ctx.translate(T.x, T.y);
    ctx.rotate(ang);
    const w = 22 * s, fl = 30 * s, gap = (4 + open * 11) * s;
    // palm
    ctx.beginPath();
    ctx.rect(-10 * s, -w / 2 - 3 * s, 12 * s, w + 6 * s);
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.stroke();
    // fingers
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      const y0 = sgn * gap;
      ctx.moveTo(2 * s, y0);
      ctx.lineTo(2 * s + fl, y0 + sgn * 1 * s);
      ctx.lineTo(2 * s + fl, y0 + sgn * 6 * s);
      ctx.lineTo(2 * s + fl * 0.35, y0 + sgn * 9 * s);
      ctx.lineTo(2 * s, y0 + sgn * 9 * s);
      ctx.closePath();
      ctx.fillStyle = paper;
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    // tool centre point
    const tcp = { x: T.x + Math.cos(ang) * (2 + fl * 0.8), y: T.y + Math.sin(ang) * (2 + fl * 0.8) };
    return tcp;
  }

  function pedestal(grow) {
    const bw = 130 * s, bh = 18 * s;
    ctx.save();
    ctx.globalAlpha *= grow;
    // floor with ticks
    ctx.save();
    ctx.globalAlpha *= 0.55;
    line(0, floorY, W, floorY);
    ctx.globalAlpha *= 0.7;
    for (let x = (base.x % (24 * s)) - 24 * s; x < W; x += 24 * s) line(x, floorY, x - 8 * s, floorY + 8 * s);
    ctx.restore();
    // base plate
    ctx.beginPath();
    ctx.moveTo(base.x - bw / 2, floorY);
    ctx.lineTo(base.x - bw / 2 + 12 * s, floorY - bh);
    ctx.lineTo(base.x + bw / 2 - 12 * s, floorY - bh);
    ctx.lineTo(base.x + bw / 2, floorY);
    ctx.closePath();
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.stroke();
    // column (base yaw housing) with hatch
    const cw = 58 * s, top = base.y + 10 * s, bot = floorY - bh;
    ctx.beginPath();
    ctx.rect(base.x - cw / 2, top, cw, bot - top);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.rect(base.x - cw / 2, top, cw, bot - top);
    ctx.clip();
    ctx.globalAlpha *= 0.28;
    for (let y = top - cw; y < bot + cw; y += 7 * s) line(base.x - cw / 2, y + cw, base.x + cw / 2, y);
    ctx.restore();
    // motor on shoulder
    const m = 46 * s;
    ctx.beginPath();
    ctx.rect(base.x - m / 2, base.y - m / 2, m, m);
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function envelope(p) {
    if (p <= 0) return;
    ctx.save();
    ctx.globalAlpha *= 0.22;
    ctx.setLineDash([2, 6]);
    const R = L1 + L2 + toolLen();
    const startA = Math.PI;
    const endA = startA + Math.PI * easeOut(p);
    ctx.beginPath();
    ctx.arc(base.x, base.y, R, startA, endA);
    ctx.stroke();
    ctx.restore();
  }

  function crosshair(P, alpha) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = accent;
    const r = 9;
    ctx.beginPath();
    ctx.arc(P.x, P.y, r, 0, TAU);
    ctx.stroke();
    line(P.x - r - 9, P.y, P.x - r + 3, P.y);
    line(P.x + r - 3, P.y, P.x + r + 9, P.y);
    line(P.x, P.y - r - 9, P.x, P.y - r + 3);
    line(P.x, P.y + r - 3, P.x, P.y + r + 9);
    ctx.restore();
  }

  function dimension(x1, x2, y, label) {
    ctx.save();
    ctx.globalAlpha *= 0.55;
    line(x1, y, x2, y);
    line(x1, y - 5, x1, y + 5);
    line(x2, y - 5, x2, y + 5);
    const dir = Math.sign(x2 - x1) || 1;
    ctx.beginPath();
    ctx.moveTo(x1 + dir * 7, y - 3);
    ctx.lineTo(x1, y);
    ctx.lineTo(x1 + dir * 7, y + 3);
    ctx.moveTo(x2 - dir * 7, y - 3);
    ctx.lineTo(x2, y);
    ctx.lineTo(x2 - dir * 7, y + 3);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = ink;
    ctx.globalAlpha *= 0.8;
    ctx.textAlign = "center";
    const tx = (x1 + x2) / 2, tw = ctx.measureText(label).width + 10;
    ctx.fillStyle = paper;
    ctx.fillRect(tx - tw / 2, y - 7, tw, 14);
    ctx.fillStyle = ink;
    ctx.fillText(label, tx, y + 3.5);
    ctx.restore();
  }

  /* ---------- loop ---------- */

  function tick(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    if (started && intro < 1) intro = Math.min(1, intro + dt / 1.9);

    // target selection: cursor, or a slow figure-eight when idle
    const idle = !pointerActive || (now - lastPointer > 3500 && !pressed);
    if (idle && !reduce) {
      idleTarget(clock);
      // rhythmic grip while idle
      gripTarget = Math.sin(clock * 0.9) > 0.55 ? 0 : 1;
    }
    const kAim = 1 - Math.exp(-dt * (idle ? 3 : 9));
    aim.x += (target.x - aim.x) * kAim;
    aim.y += (target.y - aim.y) * kAim;

    const goal = solve(aim.x, aim.y);
    // different "inertia" per joint: shoulder is slowest
    const rates = reduce ? [60, 60, 60] : [4.2, 5.6, 8];
    q.a1 += wrap(goal.a1 - q.a1) * (1 - Math.exp(-dt * rates[0]));
    q.a2 += wrap(goal.a2 - q.a2) * (1 - Math.exp(-dt * rates[1]));
    q.a3 += wrap(goal.a3 - q.a3) * (1 - Math.exp(-dt * rates[2]));
    grip += (gripTarget - grip) * (1 - Math.exp(-dt * 10));

    draw(now);
    if (visible) raf = requestAnimationFrame(tick);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1.15;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = ink;
    ctx.font = `500 ${Math.round(10.5 * Math.max(s, 0.9))}px "Geist Mono", ui-monospace, monospace`;

    const pEnv = clamp(intro / 0.6, 0, 1);
    const pBase = easeOut(intro / 0.35);
    const g1 = easeOut((intro - 0.2) / 0.4);
    const g2 = easeOut((intro - 0.35) / 0.4);
    const g3 = easeOut((intro - 0.5) / 0.4);
    const pAnno = easeOut((intro - 0.7) / 0.3);

    envelope(pEnv);
    pedestal(pBase);
    if (g1 <= 0) return;

    const { S } = fk();
    const E2 = { x: S.x + Math.cos(q.a1) * L1 * g1, y: S.y + Math.sin(q.a1) * L1 * g1 };
    const W2 = { x: E2.x + Math.cos(q.a2) * L2 * g2, y: E2.y + Math.sin(q.a2) * L2 * g2 };
    const T2 = { x: W2.x + Math.cos(q.a3) * L3 * g3, y: W2.y + Math.sin(q.a3) * L3 * g3 };

    // links, back to front
    link(S, q.a1, L1, 30 * s, g1);
    if (g2 > 0) link(E2, q.a2, L2, 24 * s, g2);
    if (g3 > 0) link(W2, q.a3, L3 * 0.55, 18 * s, g3);

    let tcp = T2;
    if (g3 > 0) {
      ctx.save();
      ctx.globalAlpha *= g3;
      tcp = gripper({ x: W2.x + Math.cos(q.a3) * L3 * 0.55 * g3, y: W2.y + Math.sin(q.a3) * L3 * 0.55 * g3 }, q.a3, grip);
      ctx.restore();
    }
    joint(S, 25 * s, q.a1);
    if (g2 > 0) joint(E2, 20 * s, q.a2);
    if (g3 > 0) joint(W2, 15 * s, q.a3);

    // annotations
    const q1 = -q.a1, q2 = wrap(q.a2 - q.a1), q3 = wrap(q.a3 - q.a2);
    if (pAnno > 0) {
      ctx.save();
      ctx.globalAlpha = pAnno;
      angleArc(S, 0, q.a1, 44 * s, `θ1 ${deg(q1)}`);
      angleArc(E2, q.a1, q.a2, 36 * s, `θ2 ${deg(q2)}`);
      angleArc(W2, q.a2, q.a3, 28 * s, `θ3 ${deg(q3)}`);

      // aim line + crosshair
      const dist = Math.hypot(aim.x - tcp.x, aim.y - tcp.y);
      if (dist > 6) {
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.globalAlpha *= 0.7;
        ctx.setLineDash([3, 4]);
        line(tcp.x, tcp.y, aim.x, aim.y);
        ctx.restore();
      }
      crosshair(aim, pointerActive ? 1 : 0.55);
      ctx.save();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(tcp.x, tcp.y, 3, 0, TAU);
      ctx.fill();
      ctx.restore();

      // reach dimension along the floor
      const mm = mmPerPx();
      const dimY = floorY + 30 * s;
      if (dimY < H - 16) dimension(base.x, tcp.x, dimY, `R ${Math.round(Math.abs(tcp.x - base.x) * mm)}`);
      ctx.restore();
    }

    // readout at ~20 Hz
    if (++frame % 3 === 0 && out.q1) {
      const mm = mmPerPx();
      out.q1.textContent = `${deg(q1)}°`;
      out.q2.textContent = `${deg(q2)}°`;
      out.q3.textContent = `${deg(q3)}°`;
      out.g.textContent = grip < 0.5 ? "closed" : "open";
      out.x.textContent = `${Math.round((tcp.x - base.x) * mm)} mm`;
      out.y.textContent = `${Math.round((base.y - tcp.y) * mm)} mm`;
    }
  }

  // wrist link + palm + fingers up to the tool centre point
  const toolLen = () => L3 * 0.55 + 2 + 24 * s;
  // scale drawing so full reach reads as ~500 mm, like the real v7
  const mmPerPx = () => 500 / (L1 + L2 + toolLen());
  const deg = (r) => ((r * 180) / Math.PI).toFixed(1).padStart(6, " ");

  /* ---------- input ---------- */

  function setPointer(e) {
    const r = hero.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (y < 0 || y > r.height) return;
    target.x = x;
    target.y = y;
    pointerActive = true;
    lastPointer = performance.now();
  }
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse") setPointer(e);
  }, { passive: true });
  hero.addEventListener("pointerdown", (e) => {
    setPointer(e);
    pressed = true;
    gripTarget = 0;
  });
  window.addEventListener("pointerup", () => {
    pressed = false;
    gripTarget = 1;
  });
  hero.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") pointerActive = false;
  });

  /* ---------- lifecycle ---------- */

  const kick = () => {
    if (!raf && visible) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  };
  new ResizeObserver(() => {
    resize();
    kick();
  }).observe(hero);
  new IntersectionObserver(([en]) => {
    visible = en.isIntersecting && !document.hidden;
    kick();
  }).observe(hero);
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    kick();
  });

  readColors();
  resize();
  const init = solve(aim.x, aim.y);
  Object.assign(q, init);

  window.heroArm = {
    start() {
      started = true;
      kick();
    },
  };
  if (reduce) kick();
})();
