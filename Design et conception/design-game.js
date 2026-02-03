/* =========================================================
   DESIGN & CONCEPTION — OPEN SPACE INFINI (FULL JS)
   - Fusée petite + inertie + rotation réaliste (nez vers direction)
   - Items immobiles, random à chaque partie, à récupérer DANS L’ORDRE
   - Flèche (pointer) vers l’item cible
   - Astéroïdes PNG: tailles variées MAIS plus petits, spawn 1 par 1,
     champ stable autour du joueur (plus d’îlots / pop-in réduit)
   - Collision fusée <-> astéroïdes pixel-perfect (rotation incluse)
   - Collision item simple (cercle) + ordre obligatoire
   - Win: débrief viewer (image + texte + prev/next + compteur)
   - Lose: explosion + écran échec (pas de débrief)
   ========================================================= */

/* -------------------------
   DOM
------------------------- */
const frame = document.getElementById("frame");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const stepEl = document.getElementById("step");
const timeEl = document.getElementById("time");
const hintEl = document.getElementById("hint");

const backBtn = document.getElementById("back");
const briefing = document.getElementById("briefing");
const startBtn = document.getElementById("startMission");

const loseScreen = document.getElementById("loseScreen");
const restartLose = document.getElementById("restartLose");

const endScreen = document.getElementById("endScreen");
const endTitle = document.getElementById("endTitle");
const restartBtn = document.getElementById("restart");

const endItemImg = document.getElementById("endItemImg");
const endItemName = document.getElementById("endItemName");
const endItemText = document.getElementById("endItemText");
const endPrev = document.getElementById("endPrev");
const endNext = document.getElementById("endNext");
const endCounter = document.getElementById("endCounter");

if (backBtn) backBtn.addEventListener("click", () => (window.location.href = "../index.html"));
// --- Quick restart on Enter when losing ---
window.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;

  const losingVisible = loseScreen && !loseScreen.classList.contains("hidden");
  if (!losingVisible) return;

  e.preventDefault();
  // relancer direct (sans repasser par le briefing)
  if (briefing) briefing.classList.add("hidden");
  if (loseScreen) loseScreen.classList.add("hidden");
  if (endScreen) endScreen.classList.add("hidden");

  resetGame();
  running = true;
  lastT = performance.now();
  tStart = performance.now();
  requestAnimationFrame(loop);
}, { passive: false });

/* -------------------------
   PATHS (ADAPTE SI BESOIN)
------------------------- */
const ROCKET_SRC = "assets/rocket.png";
const ASTEROID_SRC = "assets/asteroid.png";
const ITEM_SRCs = [
  "assets/items/mitem1.png", // Brainstorming
  "assets/items/mitem2.png", // Croquis
  "assets/items/mitem3.png", // Illustrator
  "assets/items/mitem4.png", // Charte graphique
];

/* -------------------------
   Loader + Alpha cache
------------------------- */
function loadImg(src) {
  const img = new Image();
  img.src = src;
  img.onload = () => console.log("OK image:", src);
  img.onerror = () => console.warn("ERREUR image:", src);
  return img;
}

const rocketImg = loadImg(ROCKET_SRC);
const asteroidImg = loadImg(ASTEROID_SRC);

const ITEM_INFO = [
  {
    name: "Brainstorming",
    text: "Le brainstorming est une étape essentielle car il permet de poser les bases du projet avant de commencer à créer. C’est le moment où l’on cherche des idées, des mots-clés, des références et des concepts qui correspondent à l’identité du client ou de la marque. Cette étape aide à clarifier le message que le logo doit transmettre : sérieux, moderne, dynamique, créatif, etc. En prenant le temps de réfléchir avant de dessiner, on évite de partir dans une mauvaise direction et on gagne du temps pour la suite. Un bon brainstorming permet aussi de trouver des idées plus originales et plus cohérentes, ce qui rend le résultat final plus fort et plus logique.",
    src: ITEM_SRCs[0],
  },
  {
    name: "Croquis",
    text: "Le croquis est important parce qu’il permet de tester plusieurs idées rapidement et librement. Dessiner à la main offre une grande liberté : on peut essayer des formes, des symboles, des lettres, des styles différents sans se soucier des détails techniques. C’est une étape qui favorise l’exploration et qui aide à trouver la meilleure piste créative. Le croquis permet aussi de simplifier le logo : un bon logo doit rester lisible et reconnaissable même en très petit. Grâce aux essais sur papier, on repère ce qui fonctionne ou non, et on peut améliorer le concept avant de passer au travail numérique.",
    src: ITEM_SRCs[1],
  },
  {
    name: "Illustrator",
    text: "Cette étape est essentielle car Illustrator permet de transformer une idée en logo propre, précis et professionnel. Le logo devient alors un fichier vectoriel, ce qui signifie qu’il peut être agrandi ou réduit sans perdre de qualité. C’est indispensable pour une utilisation sur différents supports : site internet, réseaux sociaux, flyers, vêtements, affiches, etc. Illustrator sert aussi à travailler la régularité et la cohérence : alignements, proportions, symétrie, formes nettes, courbes propres. C’est à cette étape que le logo prend sa forme finale, prêt à être utilisé dans un vrai projet, avec un rendu clair et sérieux.",
    src: ITEM_SRCs[2],
  },
  {
    name: "Charte graphique",
    text: "La charte graphique est une étape très importante car elle garantit que le logo et l’identité visuelle seront utilisés correctement partout. Elle définit les couleurs officielles, les typographies, les tailles minimales, les marges de sécurité autour du logo et les différentes versions possibles (couleur, noir et blanc, fond clair/foncé). Elle précise aussi ce qu’il ne faut pas faire : déformer le logo, changer les couleurs, ajouter des effets ou le placer sur des fonds illisibles. Grâce à la charte graphique, l’identité reste cohérente sur tous les supports et dans le temps, ce qui rend la marque plus professionnelle et plus reconnaissable.",
    src: ITEM_SRCs[3],
  },
];

const itemImgs = ITEM_INFO.map((i) => loadImg(i.src));

const alphaCache = new Map(); // src -> {data,w,h}
function getAlphaData(img) {
  if (!img.complete || !img.naturalWidth) return null;
  if (alphaCache.has(img.src)) return alphaCache.get(img.src);

  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height).data;

  const entry = { data, w: c.width, h: c.height };
  alphaCache.set(img.src, entry);
  return entry;
}
function alphaAt(entry, u, v) {
  const { data, w, h } = entry;
  const x = u | 0;
  const y = v | 0;
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  return data[(y * w + x) * 4 + 3];
}

/* -------------------------
   Canvas sizing
------------------------- */
const screen = { w: 360, h: 740 };
function resize() {
  const r = frame.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(r.width * dpr);
  canvas.height = Math.floor(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  screen.w = r.width;
  screen.h = r.height;

  // fusée plus petite (visuel + pré-check hit radius)
  ship.renderW = Math.round(screen.w * 0.045);
  ship.radius = Math.max(8, Math.round(screen.w * 0.013));
}
window.addEventListener("resize", resize);

/* -------------------------
   Helpers
------------------------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/* -------------------------
   Seeded random
------------------------- */
function hash2i(x, y) {
  let n = x * 374761393 + y * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  return (n ^ (n >> 16)) >>> 0;
}
function rand01(seed) {
  return (seed % 1000000) / 1000000;
}

/* -------------------------
   Ship physics
------------------------- */
// IMPORTANT: angle offset selon ton PNG
// - si PNG pointe vers le HAUT => Math.PI/2
// - si PNG pointe vers la DROITE => 0
// - si PNG pointe vers le BAS => -Math.PI/2
const SHIP_DRAW_ANGLE_OFFSET = Math.PI / 2;

const ship = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  angle: -Math.PI / 2, // facing up
  angVel: 0,

  radius: 10, // set in resize()
  renderW: 26, // set in resize()

  // tuning
  thrust: 900,
  maxSpeed: 820,
  linearDamping: 0.987, // inertia but playable
  turnSpeed: 6.5,
  turnDamping: 0.86,
};

/* -------------------------
   Game state
------------------------- */
let running = false;
let lastT = performance.now();
let tStart = 0;

let runSeed = 1;

// explosion
let exploding = false;
let explosionParticles = [];
let explosionTime = 0;

// items in world (immobile)
let items = []; // {id,x,y,collected}
let currentTarget = 0;

// asteroids field (stable)
let asteroids = [];

/* -------------------------
   Input
------------------------- */
const keys = {};
window.addEventListener(
  "keydown",
  (e) => {
    keys[e.key] = true;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
  },
  { passive: false }
);
window.addEventListener("keyup", (e) => (keys[e.key] = false));

/* -------------------------
   UI flow
------------------------- */
function showBriefing() {
  if (briefing) briefing.classList.remove("hidden");
  if (endScreen) endScreen.classList.add("hidden");
  if (loseScreen) loseScreen.classList.add("hidden");
  running = false;
}

if (startBtn) {
  startBtn.addEventListener("click", () => {
    if (briefing) briefing.classList.add("hidden");
    if (endScreen) endScreen.classList.add("hidden");
    if (loseScreen) loseScreen.classList.add("hidden");

    resetGame();
    running = true;
    lastT = performance.now();
    tStart = performance.now();
    requestAnimationFrame(loop);
  });
}

if (restartBtn) restartBtn.addEventListener("click", showBriefing);
if (restartLose) restartLose.addEventListener("click", showBriefing);

/* -------------------------
   Debrief viewer (WIN)
------------------------- */
let endIndex = 0;
function renderEndItem() {
  const info = ITEM_INFO[endIndex];
  endItemImg.src = info.src;
  endItemImg.alt = info.name;
  endItemName.textContent = info.name;
  endItemText.textContent = info.text;
  endCounter.textContent = `${endIndex + 1} / ${ITEM_INFO.length}`;
}

if (endPrev) {
  endPrev.addEventListener("click", () => {
    endIndex = (endIndex - 1 + ITEM_INFO.length) % ITEM_INFO.length;
    renderEndItem();
  });
}
if (endNext) {
  endNext.addEventListener("click", () => {
    endIndex = (endIndex + 1) % ITEM_INFO.length;
    renderEndItem();
  });
}

function win() {
  running = false;
  if (endTitle) endTitle.textContent = "Mission réussie";
  endIndex = 0;
  renderEndItem();
  if (endScreen) endScreen.classList.remove("hidden");
}

function lose() {
  running = false;
  if (loseScreen) loseScreen.classList.remove("hidden");
}

/* -------------------------
   Items generation (random each run)
------------------------- */
function generateItems(seed) {
  const result = [];
  const rings = [1400, 2200, 3000, 3800];

  for (let i = 0; i < 4; i++) {
    const s = (seed + i * 99991) >>> 0;
    const a = rand01(s) * Math.PI * 2;
    const r = rings[i] + rand01(s ^ 0xabcdef) * 600;

    result.push({
      id: i,
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      collected: false,
    });
  }
  return result;
}

/* -------------------------
   Asteroids field (spawn 1 by 1, no islands)
------------------------- */
const AST = {
  minSizeFactor: 0.05,  // smaller asteroids
  maxSizeFactor: 0.10,
  maxCount: 55,         // more, but spread
  spawnMin: 950,
  spawnMax: 1850,
  despawn: 2400,
  minSpacing: 220,      // bigger => fewer clusters
  driftMin: 6,
  driftMax: 26,
};

function asteroidSize(seed) {
  const min = screen.w * AST.minSizeFactor;
  const max = screen.w * AST.maxSizeFactor;
  return lerp(min, max, rand01(seed));
}

function spawnOneAsteroid(seed) {
  const a = rand01(seed) * Math.PI * 2;
  const r = AST.spawnMin + rand01(seed ^ 0xabcdef) * (AST.spawnMax - AST.spawnMin);

  const x = ship.x + Math.cos(a) * r;
  const y = ship.y + Math.sin(a) * r;

  const size = asteroidSize(seed ^ 0x1234567);
  const radius = size * 0.38;

  const vSeed = seed ^ 0xbeefcafe;
  const ang = rand01(vSeed) * Math.PI * 2;
  const spd = AST.driftMin + rand01(vSeed ^ 0x777777) * (AST.driftMax - AST.driftMin);

  return {
    x,
    y,
    size,
    r: radius,
    vx: Math.cos(ang) * spd,
    vy: Math.sin(ang) * spd,
    rot: rand01(seed ^ 0x444444) * Math.PI * 2,
    rotSpd: (rand01(seed ^ 0x888888) - 0.5) * 0.6,
  };
}

function isTooCloseToOthers(cand) {
  for (const a of asteroids) {
    const dx = cand.x - a.x;
    const dy = cand.y - a.y;
    const minD = AST.minSpacing + cand.r + a.r;
    if (dx * dx + dy * dy < minD * minD) return true;
  }
  return false;
}

function maintainAsteroids() {
  // despawn too far
  const D2 = AST.despawn * AST.despawn;
  asteroids = asteroids.filter((a) => {
    const dx = a.x - ship.x;
    const dy = a.y - ship.y;
    return dx * dx + dy * dy <= D2;
  });

  // spawn 1 by 1 until maxCount, avoid clusters
  let tries = 0;
  while (asteroids.length < AST.maxCount && tries < 900) {
    const seed = (runSeed + asteroids.length * 99991 + tries * 1013) >>> 0;
    const cand = spawnOneAsteroid(seed);

    // avoid too close to ship
    const dx0 = cand.x - ship.x;
    const dy0 = cand.y - ship.y;
    const safe = cand.r + ship.radius + 150;
    if (dx0 * dx0 + dy0 * dy0 < safe * safe) {
      tries++;
      continue;
    }

    if (isTooCloseToOthers(cand)) {
      tries++;
      continue;
    }

    asteroids.push(cand);
    tries++;
  }
}

/* -------------------------
   Explosion
------------------------- */
function createExplosion(x, y) {
  exploding = true;
  explosionTime = 0;
  explosionParticles = [];

  const count = 42;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 180 + Math.random() * 520;
    explosionParticles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.35 + Math.random() * 0.6,
      size: 2 + Math.random() * 4,
    });
  }
}

/* -------------------------
   Pixel-perfect (rotated) collision
------------------------- */
function rotatedSpriteAABB(cx, cy, w, h, angle) {
  const hw = w / 2,
    hh = h / 2;
  const c = Math.cos(angle),
    s = Math.sin(angle);

  const pts = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ].map((p) => ({
    x: cx + p.x * c - p.y * s,
    y: cy + p.x * s + p.y * c,
  }));

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function pointToLocal(px, py, cx, cy, angle) {
  const dx = px - cx;
  const dy = py - cy;
  const c = Math.cos(-angle),
    s = Math.sin(-angle);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

function pixelPerfectRotatedCollision(A, imgA, angleA, wA, hA, B, imgB, angleB, wB, hB, alphaThreshold = 20, step = 3) {
  const alphaA = getAlphaData(imgA);
  const alphaB = getAlphaData(imgB);
  if (!alphaA || !alphaB) return false;

  const aabbA = rotatedSpriteAABB(A.x, A.y, wA, hA, angleA);
  const aabbB = rotatedSpriteAABB(B.x, B.y, wB, hB, angleB);

  const minX = Math.max(aabbA.minX, aabbB.minX);
  const minY = Math.max(aabbA.minY, aabbB.minY);
  const maxX = Math.min(aabbA.maxX, aabbB.maxX);
  const maxY = Math.min(aabbA.maxY, aabbB.maxY);
  if (minX >= maxX || minY >= maxY) return false;

  for (let y = minY; y <= maxY; y += step) {
    for (let x = minX; x <= maxX; x += step) {
      const la = pointToLocal(x, y, A.x, A.y, angleA);
      const lb = pointToLocal(x, y, B.x, B.y, angleB);

      if (Math.abs(la.x) > wA / 2 || Math.abs(la.y) > hA / 2) continue;
      if (Math.abs(lb.x) > wB / 2 || Math.abs(lb.y) > hB / 2) continue;

      const ua = ((la.x + wA / 2) / wA) * alphaA.w;
      const va = ((la.y + hA / 2) / hA) * alphaA.h;
      const aa = alphaAt(alphaA, ua, va);
      if (aa <= alphaThreshold) continue;

      const ub = ((lb.x + wB / 2) / wB) * alphaB.w;
      const vb = ((lb.y + hB / 2) / hB) * alphaB.h;
      const ab = alphaAt(alphaB, ub, vb);
      if (ab > alphaThreshold) return true;
    }
  }
  return false;
}

/* -------------------------
   Pointer to target item
------------------------- */
function drawPointerToTarget(tx, ty) {
  const cx = screen.w / 2;
  const cy = screen.h / 2;

  const sx = cx + (tx - ship.x);
  const sy = cy + (ty - ship.y);

  // if visible -> ring
  if (sx > 40 && sx < screen.w - 40 && sy > 90 && sy < screen.h - 40) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  const vx = sx - cx;
  const vy = sy - cy;
  const dist = Math.hypot(vx, vy) || 1;
  const nx = vx / dist;
  const ny = vy / dist;

  const margin = 54;
  const px = clamp(cx + nx * (Math.min(cx, cy) - margin), margin, screen.w - margin);
  const py = clamp(cy + ny * (Math.min(cx, cy) - margin), margin + 60, screen.h - margin);

  const ang = Math.atan2(ny, nx);

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(ang);

  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "rgba(255,255,255,0.90)";
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-10, -10);
  ctx.lineTo(-10, 10);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.18;
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.globalAlpha = 1;
}

/* -------------------------
   Reset game
------------------------- */
function resetGame() {
  ship.x = 0;
  ship.y = 0;
  ship.vx = 0;
  ship.vy = 0;
  ship.angle = -Math.PI / 2;
  ship.angVel = 0;

  exploding = false;
  explosionParticles = [];
  explosionTime = 0;

  runSeed = (Math.random() * 1e9) >>> 0;

  // items random each run
  items = generateItems(runSeed);
  currentTarget = 0;

  if (stepEl) stepEl.textContent = "1";
  if (hintEl) hintEl.textContent = `À trouver : ${ITEM_INFO[0].name}`;
  if (timeEl) timeEl.textContent = "0";

  // asteroids field
  asteroids = [];
  maintainAsteroids();
}

/* -------------------------
   Update
------------------------- */
function update(dt) {
  // timer
  const sec = Math.floor((performance.now() - tStart) / 1000);
  if (timeEl) timeEl.textContent = String(sec);

  // explosion animation
  if (exploding) {
    explosionTime += dt;
    for (const p of explosionParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    explosionParticles = explosionParticles.filter((p) => p.life > 0);

    if (explosionTime > 0.8) {
      exploding = false;
      lose();
    }
    return;
  }

  // steering input vector
  let dx = 0,
    dy = 0;
  if (keys["ArrowLeft"]) dx -= 1;
  if (keys["ArrowRight"]) dx += 1;
  if (keys["ArrowUp"]) dy -= 1;
  if (keys["ArrowDown"]) dy += 1;

  const hasInput = dx !== 0 || dy !== 0;

  if (hasInput) {
    const desired = Math.atan2(dy, dx);
    const diff = wrapAngle(desired - ship.angle);

    const targetAngVel = clamp(diff * 8, -ship.turnSpeed, ship.turnSpeed);
    ship.angVel = ship.angVel * ship.turnDamping + targetAngVel * (1 - ship.turnDamping);
    ship.angle = wrapAngle(ship.angle + ship.angVel * dt);

    // thrust along nose
    ship.vx += Math.cos(ship.angle) * ship.thrust * dt;
    ship.vy += Math.sin(ship.angle) * ship.thrust * dt;
  } else {
    // smooth rotation stop
    ship.angVel *= ship.turnDamping;
    ship.angle = wrapAngle(ship.angle + ship.angVel * dt);
  }

  // damping
  ship.vx *= Math.pow(ship.linearDamping, dt * 60);
  ship.vy *= Math.pow(ship.linearDamping, dt * 60);

  // clamp speed
  const sp = Math.hypot(ship.vx, ship.vy);
  if (sp > ship.maxSpeed) {
    const k = ship.maxSpeed / sp;
    ship.vx *= k;
    ship.vy *= k;
  }

  // move ship
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;

  // maintain asteroids around ship
  maintainAsteroids();

  // move asteroids
  for (const a of asteroids) {
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.rot += a.rotSpd * dt;
  }

  // collisions: pre-check circle then pixel-perfect
  const shipDrawW = ship.renderW;
  const shipDrawH =
    rocketImg.complete && rocketImg.naturalWidth
      ? Math.round(shipDrawW * (rocketImg.naturalHeight / rocketImg.naturalWidth))
      : shipDrawW;

  const shipAngleDraw = wrapAngle(ship.angle + SHIP_DRAW_ANGLE_OFFSET);

  for (const a of asteroids) {
    const ddx = ship.x - a.x;
    const ddy = ship.y - a.y;
    const rr = ship.radius + a.r;

    if (ddx * ddx + ddy * ddy >= rr * rr) continue;

    const hit = pixelPerfectRotatedCollision(
      { x: ship.x, y: ship.y },
      rocketImg,
      shipAngleDraw,
      shipDrawW,
      shipDrawH,
      { x: a.x, y: a.y },
      asteroidImg,
      a.rot,
      a.size,
      a.size,
      20,
      3
    );

    if (hit) {
      createExplosion(ship.x, ship.y);
      return;
    }
  }

  // collect items IN ORDER
  const target = items[currentTarget];
  if (target && !target.collected) {
    const ddx = ship.x - target.x;
    const ddy = ship.y - target.y;
    const rr = ship.radius + Math.max(18, screen.w * 0.045);
    if (ddx * ddx + ddy * ddy < rr * rr) {
      target.collected = true;
      currentTarget++;

      if (currentTarget >= 4) {
        win();
        return;
      }

      if (stepEl) stepEl.textContent = String(currentTarget + 1);
      if (hintEl) hintEl.textContent = `À trouver : ${ITEM_INFO[currentTarget].name}`;
    }
  }
}

/* -------------------------
   Draw
------------------------- */
function draw() {
  ctx.clearRect(0, 0, screen.w, screen.h);

  const cx = screen.w / 2;
  const cy = screen.h / 2;

  // infinite starfield
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  const starCount = 240;
  for (let i = 0; i < starCount; i++) {
    const sx = (hash2i(i, runSeed) % 10000) / 10000;
    const sy = (hash2i(runSeed, i) % 10000) / 10000;

    const x = ((sx * 4000) - ship.x * 0.15) % 4000;
    const y = ((sy * 4000) - ship.y * 0.15) % 4000;

    const px = ((x < 0 ? x + 4000 : x) / 4000) * screen.w;
    const py = ((y < 0 ? y + 4000 : y) / 4000) * screen.h;

    ctx.fillRect(px, py, 2, 2);
  }

  // asteroids
  for (const a of asteroids) {
    const sx = cx + (a.x - ship.x);
    const sy = cy + (a.y - ship.y);
    if (sx < -350 || sy < -350 || sx > screen.w + 350 || sy > screen.h + 350) continue;

    if (asteroidImg.complete && asteroidImg.naturalWidth) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(a.rot);
      ctx.drawImage(asteroidImg, -a.size / 2, -a.size / 2, a.size, a.size);
      ctx.restore();
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.arc(sx, sy, a.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // items (immobile): show current target bright, others faint
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.collected) continue;

    const sx = cx + (it.x - ship.x);
    const sy = cy + (it.y - ship.y);
    if (sx < -250 || sy < -250 || sx > screen.w + 250 || sy > screen.h + 250) continue;

    const size = Math.round(screen.w * 0.05);
    ctx.globalAlpha = i === currentTarget ? 1 : 0.15;

    const img = itemImgs[it.id];
    if (img.complete && img.naturalWidth) {
      ctx.drawImage(img, sx - size / 2, sy - size / 2, size, size);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
    }

    ctx.globalAlpha = 1;
  }

  // pointer to current target
  const target = items[currentTarget];
  if (target && !target.collected) {
    drawPointerToTarget(target.x, target.y);
  }

  // explosion particles
  if (exploding) {
    ctx.fillStyle = "orange";
    for (const p of explosionParticles) {
      const sx = cx + (p.x - ship.x);
      const sy = cy + (p.y - ship.y);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.beginPath();
      ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }

  // ship (centered), rotated
  const drawW = ship.renderW;
  const drawH =
    rocketImg.complete && rocketImg.naturalWidth
      ? Math.round(drawW * (rocketImg.naturalHeight / rocketImg.naturalWidth))
      : drawW;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(wrapAngle(ship.angle + SHIP_DRAW_ANGLE_OFFSET));

  if (rocketImg.complete && rocketImg.naturalWidth) {
    ctx.drawImage(rocketImg, -drawW / 2, -drawH / 2, drawW, drawH);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(-drawW / 2, -drawH / 2, drawW, drawH);
  }
  ctx.restore();
}

/* -------------------------
   Loop
------------------------- */
function loop(t) {
  if (!running) return;
  const dt = Math.min(0.033, (t - lastT) / 1000);
  lastT = t;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

/* -------------------------
   Init
------------------------- */
resize();
showBriefing();


