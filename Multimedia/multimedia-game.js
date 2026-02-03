/* =========================================================
   game.js (COMPLET) — Version avec:
   - Briefing au lancement + bouton "Commencer la mission"
   - Flèches gauche/droite (PC) + doigt/souris (drag)
   - Format basé sur #frame (cadre), pas sur l'écran
   - Tailles demandées:
       * Items: 0.17 * largeur
       * Astéroïdes: entre 0.10 et 0.27 * largeur
       * Fusée: 0.13 * largeur (ratio conservé)
   - Items uniques (4):
       * Si raté => revient AVANT le suivant
   - Collisions pixel-perfect (PNG transparents ignorés)
   - Collision astéroïde => explosion + écran "Échec" (PAS de débrief)
   - Victoire => écran de débrief items (viewer)
   ========================================================= */

/* -------------------------
   Elements
------------------------- */
const frame = document.getElementById("frame");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const gotEl = document.getElementById("got");
const distEl = document.getElementById("dist");
const backBtn = document.getElementById("back");

// Overlays
const briefing = document.getElementById("briefing");
const startMissionBtn = document.getElementById("startMission");

const endScreen = document.getElementById("endScreen");
const endTitle = document.getElementById("endTitle");
const restartBtn = document.getElementById("restart");

// End screen item viewer
const endItemImg = document.getElementById("endItemImg");
const endItemName = document.getElementById("endItemName");
const endItemText = document.getElementById("endItemText");
const endPrev = document.getElementById("endPrev");
const endNext = document.getElementById("endNext");
const endCounter = document.getElementById("endCounter");

// (Optionnel) si tu as un wrapper de ligne pour les flèches, sinon on gère via parents
const endRow = (endPrev && endPrev.parentElement) ? endPrev.parentElement : null;

/* -------------------------
   Navigation
------------------------- */
if (backBtn) {
  backBtn.addEventListener("click", () => {
    window.location.href = "../index.html";
  });
}
function quickRestart() {
  // cache les overlays
  if (briefing) briefing.classList.add("hidden");
  if (endScreen) endScreen.classList.add("hidden");

  // reset mais SANS revenir au briefing
  distance = 0;
  spawnAstTimer = 0;
  asteroids = [];
  gotItems = new Set();

  itemQueue.length = 0;
  itemQueue.push(0, 1, 2, 3);
  itemActive = null;
  nextItemAtDistance = 180;

  exploding = false;
  explosionParticles = [];
  explosionTime = 0;

  gotEl.textContent = "0";
  distEl.textContent = "0";

  rocket.x = world.w / 2 - rocket.w / 2;
  rocket.y = world.h - rocket.h - 24;

  running = true;
  lastT = performance.now();
  requestAnimationFrame(loop);
}

// --- Quick restart on Enter when lose screen is visible ---
window.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;

  // Dans ce jeu, l'écran de défaite utilise endScreen + endTitle = "Échec..."
  const endVisible = endScreen && !endScreen.classList.contains("hidden");
  const isLose = endVisible && endTitle && endTitle.textContent.includes("Échec");

  if (!isLose) return;

  e.preventDefault();
  quickRestart();
}, { passive: false });


/* -------------------------
   Assets (PNG)
------------------------- */
const rocketImg = new Image();
rocketImg.src = "/assets/rocket.png";

const asteroidImg = new Image();
asteroidImg.src = "/assets/asteroid.png";

const itemImgs = [1, 2, 3, 4].map((i) => {
  const img = new Image();
  img.src = `/assets/items/item${i}.png`;
  return img;
});

/* -------------------------
   Item info (débrief victoire)
   -> Remplace name/text si tu veux
------------------------- */
const ITEM_INFO = [
  {
    name: "Scénario",
    text: "Le scénario est la base de toute vidéo. Il définit l’histoire, le message et l’ordre des idées. Sans scénario, le tournage manque de direction et la vidéo peut devenir confuse. C’est pour cela qu’il est la première étape : on réfléchit avant de filmer.",
    src: "/assets/items/item1.png",
  },
  {
    name: "Storyboard",
    text: "Le storyboard permet de transformer le scénario en images. Il aide à visualiser chaque plan, les cadrages et les transitions. Grâce au storyboard, on sait exactement comment filmer. Il vient après le scénario, car il met en images les idées écrites.",
    src: "/assets/items/item2.png",
  },
  {
    name: "Caméra",
    text: "La caméra sert à capturer les images de la vidéo. Une fois le scénario écrit et les plans préparés avec le storyboard, le tournage peut se faire de manière efficace et organisé. La caméra intervient donc après la phase de préparation.",
    src: "/assets/items/item3.png",
  },
  {
    name: "Logiciel de montage",
    text: "Le logiciel de montage permet d’assembler les images, couper les erreurs, ajouter le son et donner du rythme à la vidéo. C’est à cette étape que la vidéo prend sa forme finale. Il arrive en dernier, car le montage n’est possible qu’une fois les images filmées.",
    src: "/assets/items/item4.png",
  },
];

/* -------------------------
   Helpers
------------------------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

function rectIntersection(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bot = Math.min(a.y + a.h, b.y + b.h);
  const w = r - x;
  const h = bot - y;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}


/* -------------------------
   Pixel-perfect collision
------------------------- */
const alphaCache = new Map(); // src -> {data,w,h}

function getAlphaData(img) {
  const key = img.src;
  if (alphaCache.has(key)) return alphaCache.get(key);

  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;

  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);

  const data = g.getImageData(0, 0, c.width, c.height).data;
  const entry = { data, w: c.width, h: c.height };
  alphaCache.set(key, entry);
  return entry;
}

function pixelPerfectCollision(a, imgA, b, imgB, alphaThreshold = 20, step = 2) {
  const inter = rectIntersection(a, b);
  if (!inter) return false;

  if (!imgA.complete || !imgB.complete) return false;
  if (!imgA.naturalWidth || !imgB.naturalWidth) return false;

  const A = getAlphaData(imgA);
  const B = getAlphaData(imgB);

  for (let y = 0; y < inter.h; y += step) {
    for (let x = 0; x < inter.w; x += step) {
      const wx = inter.x + x;
      const wy = inter.y + y;

      const ax = Math.floor(((wx - a.x) / a.w) * A.w);
      const ay = Math.floor(((wy - a.y) / a.h) * A.h);

      const bx = Math.floor(((wx - b.x) / b.w) * B.w);
      const by = Math.floor(((wy - b.y) / b.h) * B.h);

      if (ax < 0 || ay < 0 || bx < 0 || by < 0 || ax >= A.w || ay >= A.h || bx >= B.w || by >= B.h) continue;

      const aAlpha = A.data[(ay * A.w + ax) * 4 + 3];
      if (aAlpha <= alphaThreshold) continue;

      const bAlpha = B.data[(by * B.w + bx) * 4 + 3];
      if (bAlpha > alphaThreshold) return true;
    }
  }
  return false;
}

/* -------------------------
   World sizing (based on #frame)
------------------------- */
const world = { w: 360, h: 740 };
/* -------------------------
   Random Stars (scrolling)
------------------------- */
const STAR_COUNT = 220;
let stars = [];

function initStars() {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * world.w,
      y: Math.random() * world.h,
      size: Math.random() < 0.85 ? 1 : 2,
      alpha: 0.25 + Math.random() * 0.65,
      speed: 25 + Math.random() * 110
    });
  }
}

function resize() {
  const rect = frame.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);

  // draw in CSS pixels
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  world.w = rect.width;
  world.h = rect.height;

  // recompute sizes based on new width
  recomputeSizes();

  // keep rocket inside
  rocket.x = clamp(rocket.x, 0, world.w - rocket.w);
  rocket.y = world.h - rocket.h - 24;
}

window.addEventListener("resize", resize);

/* -------------------------
   Sizes requested
------------------------- */
const SIZE = {
  rocketWFactor: 0.13,     // fusée = 0.13 * largeur
  itemWFactor: 0.17,       // items = 0.17 * largeur
  asteroidMinFactor: 0.10, // astéroïdes min
  asteroidMaxFactor: 0.27, // astéroïdes max
};

/* -------------------------
   Game objects
------------------------- */
const rocket = { x: 0, y: 0, w: 60, h: 90, speed: 420 };

// Keep rocket ratio (no flatten)
let rocketRatio = null;
rocketImg.onload = () => {
  rocketRatio = rocketImg.naturalHeight / rocketImg.naturalWidth;
  recomputeSizes();
  rocket.x = world.w / 2 - rocket.w / 2;
  rocket.y = world.h - rocket.h - 24;
};

function recomputeSizes() {
  // fusée
  rocket.w = Math.round(world.w * SIZE.rocketWFactor);
  if (rocketRatio) rocket.h = Math.round(rocket.w * rocketRatio);
  else rocket.h = Math.round(rocket.w * 1.4); // fallback

  // item size (carré)
  itemSize = Math.round(world.w * SIZE.itemWFactor);

  // asteroid range
  asteroidMinSize = Math.round(world.w * SIZE.asteroidMinFactor);
  asteroidMaxSize = Math.round(world.w * SIZE.asteroidMaxFactor);
}

let itemSize = Math.round(world.w * SIZE.itemWFactor);
let asteroidMinSize = Math.round(world.w * SIZE.asteroidMinFactor);
let asteroidMaxSize = Math.round(world.w * SIZE.asteroidMaxFactor);

/* -------------------------
   Explosion (collision astéroïde)
------------------------- */
let exploding = false;
let explosionParticles = [];
let explosionTime = 0;

function createExplosion(x, y) {
  exploding = true;
  explosionTime = 0;
  explosionParticles = [];

  const count = 34;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(140, 420);
    explosionParticles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(0.35, 0.8),
      size: rand(2, 5),
    });
  }
}

/* -------------------------
   Difficulty / spawns
------------------------- */
function asteroidSpawnInterval(distanceMeters) {
  // plus loin => plus fréquent
  return clamp(0.65 - distanceMeters * 0.00004, 0.18, 0.65);
}
function asteroidSpeed(distanceMeters) {
  return clamp(260 + distanceMeters * 0.06, 260, 740);
}

let asteroids = [];

function spawnAsteroid(distanceMeters) {
  const size = rand(asteroidMinSize, asteroidMaxSize);
  asteroids.push({
    x: rand(0, world.w - size),
    y: -size,
    w: size,
    h: size,
    vy: asteroidSpeed(distanceMeters),
  });
}

/* -------------------------
   Items (4 uniques)
   - if missed => comes back BEFORE next
------------------------- */
const GOAL_ITEMS = 4;
const itemQueue = [0, 1, 2, 3];
let itemActive = null;
let nextItemAtDistance = 180;

function spawnItem(index) {
  const size = itemSize;
  itemActive = {
    idx: index,
    x: rand(0, world.w - size),
    y: -size,
    w: size,
    h: size,
    vy: 240,
  };
}

function scheduleNextItemNormal() {
  nextItemAtDistance = distance + rand(140, 280);
}
function scheduleNextItemSoon() {
  // missed => return BEFORE next
  nextItemAtDistance = distance + rand(40, 80);
}

/* -------------------------
   State
------------------------- */
let running = false; // only after start button
let lastT = performance.now();
let distance = 0;

let spawnAstTimer = 0;
let gotItems = new Set();

/* -------------------------
   Input (keyboard + pointer)
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

function setRocketXFromClientX(clientX) {
  const rect = frame.getBoundingClientRect();
  const x = clientX - rect.left;
  rocket.x = clamp(x - rocket.w / 2, 0, world.w - rocket.w);
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  setRocketXFromClientX(e.clientX);
});
canvas.addEventListener("pointermove", (e) => {
  if (e.buttons === 1 || e.pointerType === "touch") setRocketXFromClientX(e.clientX);
});

/* -------------------------
   Briefing start
------------------------- */
function showBriefing() {
  if (briefing) briefing.classList.remove("hidden");
  if (endScreen) endScreen.classList.add("hidden");
  running = false;
}

if (startMissionBtn) {
  startMissionBtn.addEventListener("click", () => {
    if (briefing) briefing.classList.add("hidden");
    if (endScreen) endScreen.classList.add("hidden");
    running = true;
    lastT = performance.now();
    requestAnimationFrame(loop);
  });
}

/* -------------------------
   End screen viewer (win only)
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

function showWinDebrief() {
  // show viewer parts
  if (endItemImg) endItemImg.style.display = "";
  if (endItemName) endItemName.style.display = "";
  if (endItemText) endItemText.style.display = "";
  if (endRow) endRow.style.display = "";
  if (endCounter) endCounter.style.display = "";

  endIndex = 0;
  renderEndItem();
  endTitle.textContent = "Mission réussie";
  endScreen.classList.remove("hidden");
}

/* -------------------------
   Lose screen (NO debrief)
------------------------- */
function showLoseScreen() {
  // hide viewer parts
  if (endItemImg) endItemImg.style.display = "none";
  if (endItemName) endItemName.style.display = "none";
  if (endItemText) endItemText.style.display = "none";
  if (endRow) endRow.style.display = "none";
  if (endCounter) endCounter.style.display = "none";

  endTitle.textContent = "Échec de la mission";
  // On peut utiliser endText si tu veux, mais ici on réutilise endItemText quand même si tu as un <p> séparé.
  // Comme dans ton HTML on met l'explication dans endItemText, on la remet visible juste pour ce message :
  if (endItemText) {
    endItemText.style.display = "";
    endItemText.textContent = "La fusée a été détruite par un astéroïde. Réessaie en évitant les obstacles.";
  }

  endScreen.classList.remove("hidden");
}

/* -------------------------
   Reset / Replay
------------------------- */
function resetGame() {
  // reset state
  distance = 0;
  spawnAstTimer = 0;
  asteroids = [];
  gotItems = new Set();

  itemQueue.length = 0;
  itemQueue.push(0, 1, 2, 3);
  itemActive = null;
  nextItemAtDistance = 180;

  exploding = false;
  explosionParticles = [];
  explosionTime = 0;

  gotEl.textContent = "0";
  distEl.textContent = "0";

  rocket.x = world.w / 2 - rocket.w / 2;
  rocket.y = world.h - rocket.h - 24;

  if (endScreen) endScreen.classList.add("hidden");
  showBriefing();
}

if (restartBtn) restartBtn.addEventListener("click", resetGame);

/* -------------------------
   Update / Draw
------------------------- */
function update(dt) {
  // If explosion is happening: animate particles then lose screen
  if (exploding) {
    explosionTime += dt;

    for (const p of explosionParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    explosionParticles = explosionParticles.filter((p) => p.life > 0);

    // after short time => lose screen
    if (explosionTime > 0.75) {
      exploding = false;
      running = false;
      showLoseScreen();
    }
    return;
  }

  distance += dt * 120;
  distEl.textContent = Math.floor(distance).toString();

  // Movement (keyboard)
  if (keys["ArrowLeft"]) rocket.x -= rocket.speed * dt;
  if (keys["ArrowRight"]) rocket.x += rocket.speed * dt;
  rocket.x = clamp(rocket.x, 0, world.w - rocket.w);

  // Spawn asteroids
  spawnAstTimer += dt;
  const interval = asteroidSpawnInterval(distance);
  while (spawnAstTimer >= interval) {
    spawnAstTimer -= interval;
    spawnAsteroid(distance);
  }

  // Move asteroids
  for (const a of asteroids) a.y += a.vy * dt;
  asteroids = asteroids.filter((a) => a.y < world.h + 260);

  // Collision with asteroids (pixel-perfect) => explode
  for (const a of asteroids) {
    if (pixelPerfectCollision(rocket, rocketImg, a, asteroidImg, 20, 2)) {
      createExplosion(rocket.x + rocket.w / 2, rocket.y + rocket.h / 2);
      return;
    }
  }

  // Spawn item (one at a time)
  if (!itemActive && itemQueue.length > 0 && distance >= nextItemAtDistance) {
    const idx = itemQueue.shift();
    spawnItem(idx);
  }

  // Move item
  if (itemActive) {
    itemActive.y += itemActive.vy * dt;
    const img = itemImgs[itemActive.idx];

    // Collect
    if (pixelPerfectCollision(rocket, rocketImg, itemActive, img, 20, 2)) {
      gotItems.add(itemActive.idx);
      gotEl.textContent = gotItems.size.toString();
      itemActive = null;

      if (gotItems.size >= GOAL_ITEMS) {
        running = false;
        showWinDebrief();
        return;
      }

      scheduleNextItemNormal();
    }
    // Missed -> comes back before next
    else if (itemActive.y > world.h + 120) {
      const missed = itemActive.idx;
      itemActive = null;

      itemQueue.unshift(missed);
      scheduleNextItemSoon();
    }
  }
}

function draw() {
  ctx.clearRect(0, 0, world.w, world.h);

 // Random starfield (scrolling)
for (const st of stars) {
  st.y += st.speed * (1 / 60); // défilement stable

  if (st.y > world.h) {
    st.y = -5;
    st.x = Math.random() * world.w;
    st.speed = 25 + Math.random() * 110;
    st.alpha = 0.25 + Math.random() * 0.65;
    st.size = Math.random() < 0.85 ? 1 : 2;
  }

  ctx.fillStyle = `rgba(255,255,255,${st.alpha})`;
  ctx.fillRect(st.x, st.y, st.size, st.size);
}

  // Explosion particles (if exploding)
  if (exploding) {
    ctx.fillStyle = "orange";
    for (const p of explosionParticles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Rocket (not drawn during explosion)
  if (!exploding && rocketImg.complete) {
    ctx.drawImage(rocketImg, rocket.x, rocket.y, rocket.w, rocket.h);
  }

  // Item
  if (!exploding && itemActive) {
    const img = itemImgs[itemActive.idx];
    if (img.complete) {
      ctx.drawImage(img, itemActive.x, itemActive.y, itemActive.w, itemActive.h);
    }
  }

  // Asteroids
  if (asteroidImg.complete) {
    for (const a of asteroids) {
      ctx.drawImage(asteroidImg, a.x, a.y, a.w, a.h);
    }
  }
}

function loop(t) {
  if (!running) return;
  const dt = Math.min(0.033, (t - lastT) / 1000);
  lastT = t;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

/* -------------------------
   Start
------------------------- */
resize();
gotEl.textContent = "0";
distEl.textContent = "0";
initStars();
showBriefing();
