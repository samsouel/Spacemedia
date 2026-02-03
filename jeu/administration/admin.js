/* =========================================================
   RUNNER FUSÉE (style T-Rex, paysage) — V3
   - ↑ jump (variable si maintien), ↓ duck (scale proportionnel)
   - obstacles: asteroids ground + air (pixel-perfect)
   - less asteroid spam (anti-series)
   - collect 4 items => win
   - items spawn based on distance (spaced)
   - speed accelerates (more felt, capped)
   - starfield scroll accelerates with speed
   - sprite:
       ground = rocket2.png (mask collision)
       air    = rocket.png  (flame, display only)
   - back: ../index.html
   ========================================================= */

const frame = document.getElementById("frame");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const gotEl = document.getElementById("got");
const timeEl = document.getElementById("time");
const spdEl  = document.getElementById("spd");

const backBtn = document.getElementById("back");
const briefing = document.getElementById("briefing");
const startBtn = document.getElementById("startMission");

const loseScreen = document.getElementById("loseScreen");
const loseText = document.getElementById("loseText");
const restartLose = document.getElementById("restartLose");

const endScreen = document.getElementById("endScreen");
const restartWin = document.getElementById("restartWin");

const endItemImg = document.getElementById("endItemImg");
const endItemName = document.getElementById("endItemName");
const endItemText = document.getElementById("endItemText");
const endPrev = document.getElementById("endPrev");
const endNext = document.getElementById("endNext");
const endCounter = document.getElementById("endCounter");

if (backBtn) backBtn.addEventListener("click", () => (window.location.href = "../index.html"));

/* ---------------- Assets ---------------- */
const ASSETS = {
  rocketIdle: "/assets/rocket2.png",
  rocketJump: "/assets/rocket.png",
  asteroid: "/assets/asteroid.png",
  items: [
    "/assets/items/aitem1.png",
    "/assets/items/aitem2.png",
    "/assets/items/aitem3.png",
    "/assets/items/aitem4.png",
  ],
};
function loadImg(src){ const img = new Image(); img.src = src; return img; }
const imgRocket2 = loadImg(ASSETS.rocketIdle);
const imgRocket  = loadImg(ASSETS.rocketJump);
const imgAst = loadImg(ASSETS.asteroid);
const itemImgs = ASSETS.items.map(loadImg);

/* ---------------- Debrief ---------------- */
const ITEM_INFO = [
  { name: "Budget", text: "Le budget publicitaire est une étape essentielle car il définit combien on est prêt à investir pour diffuser une campagne. Il permet de fixer une limite claire et d’éviter de dépenser trop sans contrôle. Grâce au budget, on peut aussi répartir l’argent de manière intelligente : par exemple entre plusieurs plateformes (Instagram, TikTok, Google) ou entre plusieurs formats (vidéos, images, stories). Sans budget précis, il est impossible de comparer les résultats de la campagne, car on ne sait pas combien elle a réellement coûté au départ.", src: ASSETS.items[0] },
  { name: "Statistiques", text: "Les statistiques permettent de mesurer si la campagne fonctionne ou non. Elles montrent ce que les gens ont réellement fait : combien de personnes ont vu la publicité, combien ont cliqué, combien ont réagi, et parfois même combien ont acheté ou pris contact. Cette étape est importante car elle transforme une impression (“ça marche bien”) en informations concrètes et vérifiables. Grâce aux statistiques, on peut repérer ce qui fonctionne le mieux, comprendre le comportement du public et améliorer la campagne pour obtenir de meilleurs résultats.", src: ASSETS.items[1] },
  { name: "Rentabilité", text: "La rentabilité est une étape clé car elle permet de savoir si la campagne a été utile financièrement. Une publicité peut avoir beaucoup de vues, mais si elle ne génère aucun résultat (ventes, demandes, inscriptions), elle peut être inefficace. Calculer la rentabilité revient à comparer ce que la campagne a rapporté avec ce qu’elle a coûté. Cette étape est importante pour décider si on doit continuer la publicité, l’améliorer ou arrêter. Elle aide aussi à prouver qu’une campagne apporte une vraie valeur à l’entreprise.", src: ASSETS.items[2] },
  { name: "Coût réel", text: "Le coût réel représente ce qui a réellement été dépensé à la fin de la campagne, parfois différent du budget prévu. Il inclut les coûts directs (publicités payantes) mais aussi d’autres éléments comme la création de contenus, les outils utilisés, ou le temps de travail. Cette étape est essentielle car une analyse fiable ne peut se faire qu’avec des chiffres exacts. Connaître le coût réel permet de calculer correctement la rentabilité, de comprendre où est passé l’argent, et de mieux préparer les prochains budgets pour les futures campagnes.", src: ASSETS.items[3] },
];
let endIndex = 0;
function renderEndItem(){
  const info = ITEM_INFO[endIndex];
  if (endItemImg){ endItemImg.src = info.src; endItemImg.alt = info.name; }
  if (endItemName) endItemName.textContent = info.name;
  if (endItemText) endItemText.textContent = info.text;
  if (endCounter) endCounter.textContent = `${endIndex+1} / 4`;
}
if (endPrev) endPrev.addEventListener("click", ()=>{ endIndex=(endIndex-1+4)%4; renderEndItem(); });
if (endNext) endNext.addEventListener("click", ()=>{ endIndex=(endIndex+1)%4; renderEndItem(); });

/* ---------------- Utils ---------------- */
const clamp = (v,a,b)=>Math.max(a, Math.min(b,v));
const lerp = (a,b,t)=>a + (b-a)*t;
function rects(a,b){
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}
function rectIntersection(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const bot = Math.min(a.y + a.h, b.y + b.h);
  const w = r - x, h = bot - y;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

/* ---------------- Pixel perfect ---------------- */
const alphaCache = new Map();
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

/* ---------------- Canvas sizing ---------------- */
const world = { w: 900, h: 450 };
function resize(){
  const r = frame.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(r.width * dpr);
  canvas.height = Math.floor(r.height * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  world.w = r.width;
  world.h = r.height;
  setSizes();
  initStars();
}
window.addEventListener("resize", resize);

/* ---------------- Stars ---------------- */
const STAR_COUNT = 260;
let stars = [];
function initStars(){
  stars = [];
  for (let i=0;i<STAR_COUNT;i++){
    stars.push({
      x: Math.random()*world.w,
      y: Math.random()*world.h,
      s: Math.random()<0.86?1:2,
      a: 0.20 + Math.random()*0.70,
      sp: 40 + Math.random()*160
    });
  }
}
function updateStars(dt, speedFactor){
  for (const st of stars){
    st.y += st.sp * speedFactor * dt;
    if (st.y > world.h){
      st.y = -5;
      st.x = Math.random()*world.w;
      st.sp = 40 + Math.random()*160;
      st.a = 0.20 + Math.random()*0.70;
      st.s = Math.random()<0.86?1:2;
    }
  }
}

/* ---------------- Rocket / ground ---------------- */
const ground = { y: 0 };
const rocket = { x: 0, y: 0, w: 60, h: 90, vy: 0, onGround: true, duck: false };

let rocketRatio = 1.4;
imgRocket2.onload = ()=>{
  if (imgRocket2.naturalWidth) rocketRatio = imgRocket2.naturalHeight / imgRocket2.naturalWidth;
  setSizes();
};

function setSizes(){
  rocket.w = Math.round(world.w * 0.075);
  rocket.h = Math.round(rocket.w * rocketRatio);
  ground.y = Math.round(world.h * 0.80);
  rocket.x = Math.round(world.w * 0.12);
  snapToGround();
}

/* ---------------- Jump / duck ---------------- */
const GRAVITY = 2800;
const JUMP_V = -980;

const DUCK_SCALE = 0.65;

const HOLD_GRAVITY_FACTOR = 0.35;
const MAX_HOLD_TIME = 0.18;
let jumpHeld = false;
let holdTimer = MAX_HOLD_TIME;

function getRocketDrawScale(){
  return (rocket.duck && rocket.onGround) ? DUCK_SCALE : 1;
}
function getRocketBox(){
  const scale = getRocketDrawScale();
  const w = Math.round(rocket.w * scale);
  const h = Math.round(rocket.h * scale);
  return { x: rocket.x, y: rocket.y, w, h };
}
function snapToGround(){
  const b = getRocketBox();
  rocket.y = ground.y - b.h;
}

/* ---------------- Obstacles & items ---------------- */
let obstacles = []; // {x,y,w,h, kind:"ground"|"air"}
let items = [];     // {id,x,y,s,collected}
let itemIndex = 0;
let got = 0;

// Items spaced by distance
let nextItemAtDist = 0;

// Asteroids cadence
let nextObstacleIn = 0;

// Anti-spam series control
let chainCount = 0;           // how many asteroids spawned in a row (short interval)
let chainCooldown = 0;        // extra pause after chain
let lastObstacleKind = "ground";

/* ---------------- Speed / distance ---------------- */
const baseSpeed = 360;
let speed = baseSpeed;
let distance = 0;

const ACCEL_PER_PX = 0.0040;
const ACCEL_CAP = 2.7;

/* ---------------- Spawns ---------------- */
function spawnObstacle(){
  // choose size (fair)
  const r = Math.random();
  let factor;
  if (r < 0.70) factor = 0.052 + Math.random()*0.020;  // small/medium
  else factor = 0.068 + Math.random()*0.018;           // larger but ok
  let s = Math.round(world.w * factor);

  // choose kind: ground or air
  // alternate more often so duck matters
  let kind;
  if (Math.random() < 0.45) kind = "air";
  else kind = "ground";

  // avoid too many "air" in a row (fair)
  if (lastObstacleKind === "air" && Math.random() < 0.55) kind = "ground";

  const rocketFullH = rocket.h;
  const duckH = Math.round(rocketFullH * DUCK_SCALE);

  // air obstacle height: put it so that duck can pass, jump might also pass depending size
  // We place air asteroid around "head" area.
  const airY = ground.y - duckH - Math.round(world.h * 0.05) - s; // above ducked head
  const groundY = ground.y - s;

  obstacles.push({
    x: world.w + 30,
    y: kind === "air" ? clamp(airY, Math.round(world.h*0.10), ground.y - s - 12) : groundY,
    w: s,
    h: s,
    kind
  });

  lastObstacleKind = kind;
}

function spawnItem(){
  if (itemIndex >= 4) return;

  const s = Math.round(world.w * 0.060);
  // Items slightly higher more often to use jump
  const high = Math.random() < 0.70;
  const y = high
    ? (ground.y - rocket.h - s - Math.round(world.h*0.06))
    : (ground.y - s - 6);

  items.push({ id: itemIndex, x: world.w + 30, y, s, collected:false });
}

/* ---------------- Input ---------------- */
window.addEventListener("keydown", (e)=>{
  if (["ArrowUp","ArrowDown","Enter"].includes(e.key)) e.preventDefault();

  if (e.key === "ArrowUp"){
    if (!jumpHeld){
      jumpHeld = true;
      tryJump();
    }
  }
  if (e.key === "ArrowDown"){
    rocket.duck = true;
    if (rocket.onGround) snapToGround();
  }
},{passive:false});

window.addEventListener("keyup", (e)=>{
  if (e.key === "ArrowUp"){
    jumpHeld = false;
    holdTimer = MAX_HOLD_TIME;
  }
  if (e.key === "ArrowDown"){
    rocket.duck = false;
    if (rocket.onGround) snapToGround();
  }
});

// mobile: tap jump, swipe down duck
let touchStartY = null;
canvas.addEventListener("pointerdown", (e)=>{
  canvas.setPointerCapture(e.pointerId);
  touchStartY = e.clientY;
  setTimeout(()=>{ if (touchStartY !== null) { tryJump(); } }, 70);
});
canvas.addEventListener("pointermove", (e)=>{
  if (touchStartY === null) return;
  if (e.clientY - touchStartY > 26) {
    rocket.duck = true;
    if (rocket.onGround) snapToGround();
  }
});
canvas.addEventListener("pointerup", ()=>{ touchStartY=null; rocket.duck=false; if (rocket.onGround) snapToGround(); });
canvas.addEventListener("pointercancel", ()=>{ touchStartY=null; rocket.duck=false; if (rocket.onGround) snapToGround(); });

function tryJump(){
  if (!running) return;
  if (!rocket.onGround) return;
  rocket.vy = JUMP_V;
  rocket.onGround = false;
  holdTimer = 0;
}

/* ---------------- UI flow ---------------- */
function showBriefing(){
  if (briefing) briefing.classList.remove("hidden");
  if (loseScreen) loseScreen.classList.add("hidden");
  if (endScreen) endScreen.classList.add("hidden");
  running = false;
}

function lose(msg){
  running = false;
  if (loseText) loseText.textContent = msg || "Tu as perdu.";
  if (loseScreen) loseScreen.classList.remove("hidden");
}

function win(){
  running = false;
  endIndex = 0;
  renderEndItem();
  if (endScreen) endScreen.classList.remove("hidden");
}

function resetGame(){
  obstacles = [];
  items = [];

  itemIndex = 0;
  got = 0;
  if (gotEl) gotEl.textContent = "0";

  rocket.vy = 0;
  rocket.onGround = true;
  rocket.duck = false;
  jumpHeld = false;
  holdTimer = MAX_HOLD_TIME;

  distance = 0;
  speed = baseSpeed;

  // less spam at start
  nextObstacleIn = 0.95;

  // items spaced
  nextItemAtDist = 1400;

  // anti-spam chain
  chainCount = 0;
  chainCooldown = 0;
  lastObstacleKind = "ground";

  snapToGround();
}

function startRun(){
  if (briefing) briefing.classList.add("hidden");
  if (loseScreen) loseScreen.classList.add("hidden");
  if (endScreen) endScreen.classList.add("hidden");

  resetGame();
  running = true;
  lastT = performance.now();
  tStart = performance.now();
  requestAnimationFrame(loop);
}

if (startBtn) startBtn.addEventListener("click", startRun);
if (restartLose) restartLose.addEventListener("click", startRun);
if (restartWin) restartWin.addEventListener("click", showBriefing);

// Enter quick restart on lose
window.addEventListener("keydown", (e)=>{
  if (e.key !== "Enter") return;
  const losingVisible = loseScreen && !loseScreen.classList.contains("hidden");
  if (!losingVisible) return;
  e.preventDefault();
  startRun();
},{passive:false});

/* ---------------- Update ---------------- */
let lastT = performance.now();
let tStart = 0;

function update(dt){
  const sec = Math.floor((performance.now()-tStart)/1000);
  if (timeEl) timeEl.textContent = String(sec);

  // speed curve (strong but capped)
  const mult = clamp(1 + (distance * ACCEL_PER_PX) * 0.001, 1, ACCEL_CAP);
  speed = baseSpeed * mult;
  const sf = clamp(speed / baseSpeed, 1, ACCEL_CAP);
  if (spdEl) spdEl.textContent = sf.toFixed(1);

  // distance
  distance += speed * dt;

  // rocket physics
  let g = GRAVITY;
  if (!rocket.onGround && jumpHeld && holdTimer < MAX_HOLD_TIME && rocket.vy < 0){
    g = GRAVITY * HOLD_GRAVITY_FACTOR;
    holdTimer += dt;
  } else if (!rocket.onGround) {
    holdTimer = MAX_HOLD_TIME;
  }

  rocket.vy += g * dt;
  rocket.y += rocket.vy * dt;

  // ground lock
  const b = getRocketBox();
  const floorY = ground.y - b.h;
  if (rocket.y >= floorY){
    rocket.y = floorY;
    rocket.vy = 0;
    rocket.onGround = true;
  } else {
    rocket.onGround = false;
  }

  // ---------------- Spawning asteroids (less spam) ----------------
  // base interval decreases with speed, but:
  // - short "chains" max 2
  // - then cooldown pause
  // - also, don't spawn too close in distance
  chainCooldown = Math.max(0, chainCooldown - dt);

  nextObstacleIn -= dt;
  if (nextObstacleIn <= 0 && chainCooldown <= 0){
    spawnObstacle();

    // Determine if this spawn is a "chain" (fast next) or "normal"
    // We'll allow occasional chain of 2, then pause.
    const wantChain = Math.random() < 0.30; // ✅ less spam (was too high)
    const canChain = chainCount < 2 && wantChain;

    const t = clamp((sf - 1) / (ACCEL_CAP - 1), 0, 1);

    if (canChain){
      chainCount++;
      // short interval chain
      nextObstacleIn = lerp(0.72, 0.42, t) + Math.random()*0.12;
    } else {
      // reset chain and put a longer gap
      chainCount = 0;
      nextObstacleIn = lerp(1.05, 0.62, t) + Math.random()*0.25;

      // add cooldown sometimes, esp after chains
      if (Math.random() < 0.28){
        chainCooldown = lerp(0.25, 0.12, t);
      }
    }
  }

  // ---------------- Items spaced by distance ----------------
  if (itemIndex < 4){
    if (distance >= nextItemAtDist){
      if (!items.some(it => !it.collected)){
        spawnItem();

        const t = clamp((sf - 1) / (ACCEL_CAP - 1), 0, 1);
        const minGap = lerp(1600, 2900, t);     // ✅ plus d'espace
        const jitter = 380 + Math.random()*650;
        nextItemAtDist = distance + minGap + jitter;
      } else {
        nextItemAtDist = distance + 260;
      }
    }
  }

  // Move world left
  for (const o of obstacles) o.x -= speed * dt;
  obstacles = obstacles.filter(o => o.x + o.w > -200);

  for (const it of items) it.x -= speed * dt;
  items = items.filter(it => it.x + it.s > -220 && !it.collected);

  // Collisions
  const rbox = getRocketBox();

  for (const o of obstacles){
    const ob = { x:o.x, y:o.y, w:o.w, h:o.h };
    if (rects(rbox, ob)){
      if (pixelPerfectCollision(rbox, imgRocket2, ob, imgAst, 20, 2)){
        lose("Astéroïde ! Mission échouée.");
        return;
      }
    }
  }

  for (const it of items){
    const ib = { x: it.x, y: it.y, w: it.s, h: it.s };
    if (rects(rbox, ib)){
      it.collected = true;
      got++;
      itemIndex++;
      if (gotEl) gotEl.textContent = String(got);

      if (got >= 4){
        win();
        return;
      }
    }
  }

  // stars
  updateStars(dt, sf);
}

/* ---------------- Draw ---------------- */
function draw(){
  ctx.clearRect(0,0,world.w,world.h);

  for (const st of stars){
    ctx.fillStyle = `rgba(255,255,255,${st.a})`;
    ctx.fillRect(st.x, st.y, st.s, st.s);
  }

  // ground line
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(0, ground.y, world.w, 2);

  // obstacles
  for (const o of obstacles){
    if (imgAst.complete && imgAst.naturalWidth){
      ctx.drawImage(imgAst, o.x, o.y, o.w, o.h);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(o.x, o.y, o.w, o.h);
    }
  }

  // items
  for (const it of items){
    const img = itemImgs[it.id];
    if (img.complete && img.naturalWidth){
      ctx.drawImage(img, it.x, it.y, it.s, it.s);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.20)";
      ctx.fillRect(it.x, it.y, it.s, it.s);
    }
  }

  // rocket draw
  const rbox = getRocketBox();
  const drawImg = rocket.onGround ? imgRocket2 : imgRocket;

  if (drawImg.complete && drawImg.naturalWidth){
    ctx.drawImage(drawImg, rbox.x, rbox.y, rbox.w, rbox.h);
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(rbox.x, rbox.y, rbox.w, rbox.h);
  }
}

/* ---------------- Loop ---------------- */
function loop(t){
  if (!running) return;
  const dt = Math.min(0.033, (t-lastT)/1000);
  lastT = t;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

/* ---------------- UI flow start ---------------- */
function startRun(){
  if (briefing) briefing.classList.add("hidden");
  if (loseScreen) loseScreen.classList.add("hidden");
  if (endScreen) endScreen.classList.add("hidden");

  resetGame();
  running = true;
  lastT = performance.now();
  tStart = performance.now();
  requestAnimationFrame(loop);
}

if (startBtn) startBtn.addEventListener("click", startRun);

/* init */
resize();
showBriefing();
