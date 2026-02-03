/* =========================================================
   SPACE SHOOTER — gestion.js (FULL FIX)
   - Controls: ArrowLeft / ArrowRight
   - Shooting: AUTO (Space/click/mobile button optional)
   - Assets: /assets/... and /assets/items/...
   - Items: sequential 1->4 (only current appears). If missed, same item returns.
   - Bonuses: sequential 3. If missed => next replaces it. If collected => stack upgrades.
   - Bonus label: "BONUS" drawn on top
   - Kills counter: asteroids destroyed
   - Pixel-perfect collision: ship <-> asteroid (alpha masks)
   - Random starfield background
   - Press Enter to restart instantly on lose
   ========================================================= */

const frame = document.getElementById("frame");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const gotEl = document.getElementById("got");
const killsEl = document.getElementById("kills");
const timeEl = document.getElementById("time");

const backBtn = document.getElementById("back");
const briefing = document.getElementById("briefing");
const startBtn = document.getElementById("startMission");

const loseScreen = document.getElementById("loseScreen");
const restartLose = document.getElementById("restartLose");

const endScreen = document.getElementById("endScreen");
const restartWin = document.getElementById("restartWin");

const endItemImg = document.getElementById("endItemImg");
const endItemName = document.getElementById("endItemName");
const endItemText = document.getElementById("endItemText");
const endPrev = document.getElementById("endPrev");
const endNext = document.getElementById("endNext");
const endCounter = document.getElementById("endCounter");

const fireBtn = document.getElementById("fireBtn");

/* ---------------- helpers ---------------- */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/* ---------------- Menu ---------------- */
if (backBtn) backBtn.addEventListener("click", () => (window.location.href = "../index.html"));

/* ---------------- Assets ---------------- */
const ASSETS = {
  ship: "/assets/rocket.png",
  missile: "/assets/missile.png",
  asteroid: "/assets/asteroid.png",
  bonus: "/assets/bonus.png",
  items: [
    "/assets/items/gitem1.png",
    "/assets/items/gitem2.png",
    "/assets/items/gitem3.png",
    "/assets/items/gitem4.png",
  ]
};

function loadImg(src) {
  const img = new Image();
  img.src = src;
  return img;
}
const imgShip = loadImg(ASSETS.ship);
const imgMissile = loadImg(ASSETS.missile);
const imgAst = loadImg(ASSETS.asteroid);
const imgBonus = loadImg(ASSETS.bonus);
const imgItems = ASSETS.items.map(loadImg);

/* ---------------- Debrief ---------------- */
const ITEM_INFO = [
  { name: "Cahier des charges", text: "Le cahier des charges est indispensable car il définit clairement le projet dès le départ. Il décrit les objectifs, les besoins, le public cible, les contraintes et le résultat attendu. Grâce à lui, toute l’équipe travaille dans la même direction et évite les malentendus. Cette étape permet aussi de gagner du temps, car on sait exactement ce qui doit être réalisé et ce qui est hors périmètre. Un projet bien défini est un projet plus simple à gérer et plus facile à réussir.", src: ASSETS.items[0] },
  { name: "Diagramme de Gantt", text: "Le diagramme de Gantt est important car il transforme le projet en un planning concret et organisé. Il permet de visualiser toutes les étapes, leur durée, leur ordre, ainsi que les délais à respecter. Grâce à lui, on peut anticiper les périodes chargées, répartir le travail correctement et éviter les retards. Cette étape aide aussi à suivre l’avancement et à repérer rapidement si une tâche prend trop de temps. Un bon planning permet de garder le contrôle et d’avancer de manière structurée.", src: ASSETS.items[1] },
  { name: "Suivie des tâches et communication", text: "La checklist est essentielle car elle permet de suivre précisément ce qui est fait, ce qui est en cours et ce qui reste à terminer. Elle évite les oublis et aide l’équipe à rester organisée, surtout quand il y a plusieurs tâches en parallèle. Le talkie-walkie représente la communication, qui est tout aussi importante : même avec un bon planning, un projet peut échouer si l’équipe ne partage pas les informations. Cette étape montre donc qu’un projet avance grâce à un suivi régulier et à une bonne coordination entre les personnes.", src: ASSETS.items[2] },
  { name: "Tests et validation", text: "L’étape de test et validation est essentielle car elle permet de vérifier que tout fonctionne correctement avant de livrer le projet. Tester sert à repérer les erreurs, les bugs, les oublis ou les éléments qui ne respectent pas le cahier des charges. Cela évite de rendre un travail incomplet ou non conforme, et garantit une meilleure qualité finale. La validation, elle, confirme que le résultat correspond bien aux attentes du client ou de l’équipe : c’est l’accord final avant la livraison officielle. Cette étape est importante car elle sécurise le projet, améliore la fiabilité du rendu et assure une fin de projet propre et professionnelle.", src: ASSETS.items[3] },
];

let endIndex = 0;
function renderEndItem() {
  const info = ITEM_INFO[endIndex];
  if (endItemImg) { endItemImg.src = info.src; endItemImg.alt = info.name; }
  if (endItemName) endItemName.textContent = info.name;
  if (endItemText) endItemText.textContent = info.text;
  if (endCounter) endCounter.textContent = `${endIndex + 1} / 4`;
}
if (endPrev) endPrev.addEventListener("click", () => { endIndex = (endIndex - 1 + 4) % 4; renderEndItem(); });
if (endNext) endNext.addEventListener("click", () => { endIndex = (endIndex + 1) % 4; renderEndItem(); });

/* ---------------- Canvas sizing ---------------- */
const screen = { w: 360, h: 740 };
function resize() {
  const r = frame.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(r.width * dpr);
  canvas.height = Math.floor(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  screen.w = r.width;
  screen.h = r.height;
  setSizes();
  initStars();
}
window.addEventListener("resize", resize);

/* ---------------- Random stars ---------------- */
const STAR_COUNT = 220;
let stars = [];

function initStars() {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * screen.w,
      y: Math.random() * screen.h,
      size: Math.random() < 0.85 ? 1 : 2,
      alpha: 0.25 + Math.random() * 0.65,
      speed: 20 + Math.random() * 90
    });
  }
}

/* ---------------- Pixel-perfect collision cache ---------------- */
const maskCache = new Map();
const maskCanvas = document.createElement("canvas");
const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });

function getAlphaMask(img, w, h) {
  const key = `${img.src}|${w}|${h}`;
  const cached = maskCache.get(key);
  if (cached) return cached;

  maskCanvas.width = w;
  maskCanvas.height = h;
  maskCtx.clearRect(0, 0, w, h);
  maskCtx.drawImage(img, 0, 0, w, h);

  const data = maskCtx.getImageData(0, 0, w, h).data;
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 3; i < alpha.length; i++, p += 4) alpha[i] = data[p];

  const entry = { w, h, alpha };
  maskCache.set(key, entry);
  return entry;
}

function pixelPerfectOverlap(ax, ay, aw, ah, aImg, bx, by, bw, bh, bImg, alphaThreshold = 20) {
  if (!aImg?.complete || !aImg.naturalWidth) return false;
  if (!bImg?.complete || !bImg.naturalWidth) return false;

  const ox1 = Math.max(ax, bx);
  const oy1 = Math.max(ay, by);
  const ox2 = Math.min(ax + aw, bx + bw);
  const oy2 = Math.min(ay + ah, by + bh);
  if (ox2 <= ox1 || oy2 <= oy1) return false;

  const ow = Math.floor(ox2 - ox1);
  const oh = Math.floor(oy2 - oy1);

  const aMask = getAlphaMask(aImg, Math.max(1, Math.round(aw)), Math.max(1, Math.round(ah)));
  const bMask = getAlphaMask(bImg, Math.max(1, Math.round(bw)), Math.max(1, Math.round(bh)));

  for (let y = 0; y < oh; y++) {
    const wy = oy1 + y;

    const aLy = Math.floor(((wy - ay) / ah) * aMask.h);
    const bLy = Math.floor(((wy - by) / bh) * bMask.h);
    if (aLy < 0 || aLy >= aMask.h || bLy < 0 || bLy >= bMask.h) continue;

    const aRow = aLy * aMask.w;
    const bRow = bLy * bMask.w;

    for (let x = 0; x < ow; x++) {
      const wx = ox1 + x;

      const aLx = Math.floor(((wx - ax) / aw) * aMask.w);
      const bLx = Math.floor(((wx - bx) / bw) * bMask.w);
      if (aLx < 0 || aLx >= aMask.w || bLx < 0 || bLx >= bMask.w) continue;

      const aA = aMask.alpha[aRow + aLx];
      if (aA <= alphaThreshold) continue;

      const bA = bMask.alpha[bRow + bLx];
      if (bA <= alphaThreshold) continue;

      return true;
    }
  }
  return false;
}

/* ---------------- Game objects ---------------- */
const ship = { x: 0, y: 0, w: 40, h: 60, speed: 520 };
const missileCfg = { w: 8, h: 18, speed: 900 };

let missiles = [];   // {x,y,w,h,vy,dead?}
let asteroids = [];  // {x,y,s,vy,dead?}

let running = false;
let lastT = performance.now();
let tStart = 0;

let got = 0;
let kills = 0;

/* Ship ratio (no squash) */
let shipRatio = 1.5;
imgShip.onload = () => {
  if (imgShip.naturalWidth) shipRatio = imgShip.naturalHeight / imgShip.naturalWidth;
  setSizes();
};

/* Upgrades / shooting */
let upgradeCount = 0;      // 0..3
let fireCooldown = 0;
const AUTO_FIRE = true;
let fireHeld = false;

/* Items sequential */
let itemIndex = 0;         // 0..3
let itemActive = null;     // {id,x,y,s,vy}
let nextItemDelay = 0;

/* Bonus sequential */
let bonusIndex = 0;        // 0..2
let bonusActive = null;    // {idx,x,y,s,vy}
let nextBonusDelay = 0;

function setSizes() {
  ship.w = Math.round(screen.w * 0.12);
  ship.h = Math.round(ship.w * shipRatio);
  ship.y = Math.round(screen.h * 0.80);

  missileCfg.w = Math.max(6, Math.round(screen.w * 0.02));
  missileCfg.h = Math.round(missileCfg.w * 2.4);

  ship.x = clamp(ship.x, 0, screen.w - ship.w);
}

function resetGame() {
  missiles = [];
  asteroids = [];

  got = 0;
  if (gotEl) gotEl.textContent = "0";

  kills = 0;
  if (killsEl) killsEl.textContent = "0";

  upgradeCount = 0;
  fireCooldown = 0;

  itemIndex = 0;
  itemActive = null;
  nextItemDelay = 0.9;

  bonusIndex = 0;
  bonusActive = null;
  nextBonusDelay = 1.4;

  ship.x = (screen.w - ship.w) / 2;

  spawnAstTimer = 0;
}

let spawnAstTimer = 0;
function spawnAsteroid() {
  const s = lerp(screen.w * 0.10, screen.w * 0.22, Math.random());
  asteroids.push({
    x: Math.random() * (screen.w - s),
    y: -s,
    s,
    vy: 170 + Math.random() * 260
  });
}

function spawnItemNow() {
  const s = Math.round(screen.w * 0.13);
  itemActive = { id: itemIndex, x: Math.random() * (screen.w - s), y: -s, s, vy: 135 };
}

function spawnBonusNow() {
  if (bonusIndex >= 3) return;
  const s = Math.round(screen.w * 0.10);
  bonusActive = { idx: bonusIndex, x: Math.random() * (screen.w - s), y: -s, s, vy: 155 };
}

function fireLevel() { return upgradeCount + 1; }

function rofInterval() {
  const lvl = fireLevel();
  if (lvl === 1) return 0.30;
  if (lvl === 2) return 0.20;
  if (lvl === 3) return 0.16;
  return 0.12;
}

function shoot() {
  const lvl = fireLevel();
  const baseX = ship.x + ship.w / 2 - missileCfg.w / 2;
  const y = ship.y - missileCfg.h;
  const spread = Math.max(10, Math.round(screen.w * 0.03));

  const shots =
    lvl === 1 ? [0] :
    lvl === 2 ? [0] :
    lvl === 3 ? [-spread / 2, spread / 2] :
    [-spread, 0, spread];

  for (const dx of shots) {
    missiles.push({ x: baseX + dx, y, w: missileCfg.w, h: missileCfg.h, vy: -missileCfg.speed });
  }
}

/* ---------------- Input ---------------- */
const keys = {};
window.addEventListener("keydown", (e) => {
  keys[e.key] = true;
  if (["ArrowLeft", "ArrowRight", " ", "Enter"].includes(e.key)) e.preventDefault();
  if (e.key === " ") fireHeld = true;
}, { passive: false });

window.addEventListener("keyup", (e) => {
  keys[e.key] = false;
  if (e.key === " ") fireHeld = false;
});

canvas.addEventListener("pointerdown", () => { fireHeld = true; });
canvas.addEventListener("pointerup", () => { fireHeld = false; });
canvas.addEventListener("pointercancel", () => { fireHeld = false; });

if (fireBtn) {
  fireBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); fireHeld = true; });
  fireBtn.addEventListener("pointerup", () => { fireHeld = false; });
  fireBtn.addEventListener("pointercancel", () => { fireHeld = false; });
}

/* Press Enter to restart instantly on lose */
window.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const losingVisible = loseScreen && !loseScreen.classList.contains("hidden");
  if (!losingVisible) return;

  e.preventDefault();
  if (briefing) briefing.classList.add("hidden");
  if (loseScreen) loseScreen.classList.add("hidden");
  if (endScreen) endScreen.classList.add("hidden");

  resetGame();
  running = true;
  lastT = performance.now();
  tStart = performance.now();
  requestAnimationFrame(loop);
}, { passive: false });

/* ---------------- UI flow ---------------- */
function showBriefing() {
  if (briefing) briefing.classList.remove("hidden");
  if (loseScreen) loseScreen.classList.add("hidden");
  if (endScreen) endScreen.classList.add("hidden");
  running = false;
}

if (startBtn) {
  startBtn.addEventListener("click", () => {
    if (briefing) briefing.classList.add("hidden");
    if (loseScreen) loseScreen.classList.add("hidden");
    if (endScreen) endScreen.classList.add("hidden");

    resetGame();
    running = true;
    lastT = performance.now();
    tStart = performance.now();
    requestAnimationFrame(loop);
  });
}
if (restartLose) restartLose.addEventListener("click", showBriefing);
if (restartWin) restartWin.addEventListener("click", showBriefing);

function lose() {
  running = false;
  if (loseScreen) loseScreen.classList.remove("hidden");
}

function win() {
  running = false;
  endIndex = 0;
  renderEndItem();
  if (endScreen) endScreen.classList.remove("hidden");
}

/* ---------------- Update ---------------- */
function update(dt) {
  const sec = Math.floor((performance.now() - tStart) / 1000);
  if (timeEl) timeEl.textContent = String(sec);

  // ship move
  let dir = 0;
  if (keys["ArrowLeft"]) dir -= 1;
  if (keys["ArrowRight"]) dir += 1;
  ship.x = clamp(ship.x + dir * ship.speed * dt, 0, screen.w - ship.w);

  // fire
  fireCooldown -= dt;
  const shouldFire = AUTO_FIRE || fireHeld;
  if (shouldFire && fireCooldown <= 0) {
    shoot();
    fireCooldown = rofInterval();
  }

  // spawn asteroids
  spawnAstTimer -= dt;
  if (spawnAstTimer <= 0) {
    spawnAsteroid();
    spawnAstTimer = 0.20;
  }

  // spawn item
  if (!itemActive && itemIndex < 4) {
    nextItemDelay -= dt;
    if (nextItemDelay <= 0) spawnItemNow();
  }

  // spawn bonus
  if (!bonusActive && bonusIndex < 3) {
    nextBonusDelay -= dt;
    if (nextBonusDelay <= 0) spawnBonusNow();
  }

  // move missiles
  missiles.forEach(m => { m.y += m.vy * dt; });
  missiles = missiles.filter(m => m.y + m.h > -60);

  // move asteroids
  asteroids.forEach(a => { a.y += a.vy * dt; });
  asteroids = asteroids.filter(a => a.y < screen.h + 140);

  // move item / miss => same item returns
  if (itemActive) {
    itemActive.y += itemActive.vy * dt;
    if (itemActive.y > screen.h + 90) {
      itemActive = null;
      nextItemDelay = 0.9;
    }
  }

  // move bonus / miss => next bonus replaces
  if (bonusActive) {
    bonusActive.y += bonusActive.vy * dt;
    if (bonusActive.y > screen.h + 90) {
      bonusActive = null;
      bonusIndex = Math.min(3, bonusIndex + 1);
      nextBonusDelay = 1.0;
    }
  }

  // missile -> asteroid + kills
  for (const a of asteroids) {
    const ab = { x: a.x, y: a.y, w: a.s, h: a.s };
    for (const m of missiles) {
      if (rects(m, ab)) {
        a.dead = true;
        m.dead = true;

        kills++;
        if (killsEl) killsEl.textContent = String(kills);
        break;
      }
    }
  }
  asteroids = asteroids.filter(a => !a.dead);
  missiles = missiles.filter(m => !m.dead);

  const shipBox = { x: ship.x, y: ship.y, w: ship.w, h: ship.h };

  // collect BONUS first
  if (bonusActive) {
    const bb = { x: bonusActive.x, y: bonusActive.y, w: bonusActive.s, h: bonusActive.s };
    if (rects(shipBox, bb)) {
      bonusActive = null;
      upgradeCount = Math.min(3, upgradeCount + 1);
      bonusIndex = Math.min(3, bonusIndex + 1);
      nextBonusDelay = 1.1;
    }
  }

  // collect ITEM first
  if (itemActive) {
    const ib = { x: itemActive.x, y: itemActive.y, w: itemActive.s, h: itemActive.s };
    if (rects(shipBox, ib)) {
      itemActive = null;
      got++;
      if (gotEl) gotEl.textContent = String(got);

      itemIndex = Math.min(4, itemIndex + 1);
      nextItemDelay = 0.9;

      if (got >= 4) { win(); return; }
    }
  }

  // ship -> asteroid lose (pixel-perfect)
  for (const a of asteroids) {
    const ab = { x: a.x, y: a.y, w: a.s, h: a.s };
    if (!rects(shipBox, ab)) continue;

    const hit = pixelPerfectOverlap(
      ship.x, ship.y, ship.w, ship.h, imgShip,
      a.x, a.y, a.s, a.s, imgAst,
      20
    );

    // fallback if images not loaded
    if (hit || (!imgShip.naturalWidth || !imgAst.naturalWidth)) {
      lose();
      return;
    }
  }
}

/* ---------------- Draw ---------------- */
function draw() {
  ctx.clearRect(0, 0, screen.w, screen.h);

  // stars (random + moving)
  for (const st of stars) {
    st.y += st.speed * (1 / 60);
    if (st.y > screen.h) {
      st.y = -5;
      st.x = Math.random() * screen.w;
      st.speed = 20 + Math.random() * 90;
      st.alpha = 0.25 + Math.random() * 0.65;
      st.size = Math.random() < 0.85 ? 1 : 2;
    }
    ctx.fillStyle = `rgba(255,255,255,${st.alpha})`;
    ctx.fillRect(st.x, st.y, st.size, st.size);
  }

  // missiles
  for (const m of missiles) {
    if (imgMissile.complete && imgMissile.naturalWidth) ctx.drawImage(imgMissile, m.x, m.y, m.w, m.h);
    else { ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fillRect(m.x, m.y, m.w, m.h); }
  }

  // asteroids
  for (const a of asteroids) {
    if (imgAst.complete && imgAst.naturalWidth) ctx.drawImage(imgAst, a.x, a.y, a.s, a.s);
    else {
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      ctx.beginPath();
      ctx.arc(a.x + a.s / 2, a.y + a.s / 2, a.s * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // bonus + label
  if (bonusActive) {
    if (imgBonus.complete && imgBonus.naturalWidth) ctx.drawImage(imgBonus, bonusActive.x, bonusActive.y, bonusActive.s, bonusActive.s);
    else { ctx.fillStyle = "rgba(120,200,255,0.35)"; ctx.fillRect(bonusActive.x, bonusActive.y, bonusActive.s, bonusActive.s); }

    ctx.save();
    ctx.font = `900 ${Math.max(12, Math.round(bonusActive.s * 0.22))}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = bonusActive.x + bonusActive.s / 2;
    const cy = bonusActive.y + bonusActive.s / 2;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.strokeText("BONUS", cx, cy);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText("BONUS", cx, cy);
    ctx.restore();
  }

  // current item only
  if (itemActive) {
    const img = imgItems[itemActive.id];
    if (img.complete && img.naturalWidth) ctx.drawImage(img, itemActive.x, itemActive.y, itemActive.s, itemActive.s);
    else { ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(itemActive.x, itemActive.y, itemActive.s, itemActive.s); }
  }

  // ship
  if (imgShip.complete && imgShip.naturalWidth) ctx.drawImage(imgShip, ship.x, ship.y, ship.w, ship.h);
  else { ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(ship.x, ship.y, ship.w, ship.h); }
}

/* ---------------- Loop ---------------- */
function loop(t) {
  if (!running) return;
  const dt = Math.min(0.033, (t - lastT) / 1000);
  lastT = t;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

/* init */
resize();
showBriefing();
