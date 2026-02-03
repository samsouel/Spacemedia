/* =========================================================
   CASSE-BRIQUES — JS COMPLET (avec bonus/malus)
   - Balle part automatiquement au début
   - Item visible dans une brique spéciale dès le début
   - Détruire brique item => item tombe => à attraper (sinon lose)
   - Si toutes les balles tombent => lose
   - Après N briques détruites => un bonus/malus tombe aléatoirement
   - Bonus:
       * TRIPLE => 3 balles
       * FIRE => détruit tout jusqu'au prochain mur touché
     Malus:
       * SLOW => plateforme ralentie (durée)
       * INVERT => flèches inversées (durée)
     Neutre:
       * WRAP => plateforme traverse les murs (durée)
   - 4 items => win + debrief
   - Assets: /assets/... + /assets/items/...
   ========================================================= */

const frame = document.getElementById("frame");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const gotEl = document.getElementById("got");
const timeEl = document.getElementById("time");
const backBtn = document.getElementById("back");

const briefing = document.getElementById("briefing");
const startBtn = document.getElementById("startMission");

const loseScreen = document.getElementById("loseScreen");
const loseText = document.getElementById("loseText");
const restartLose = document.getElementById("restartLose");

const endScreen = document.getElementById("endScreen");
const endTitle = document.getElementById("endTitle");
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
  ship: "/assets/rocket.png", // utilisé comme sprite de balle (optionnel)
  items: [
    "/assets/items/iitem1.png",
    "/assets/items/iitem2.png",
    "/assets/items/iitem3.png",
    "/assets/items/iitem4.png",
  ]
};
function loadImg(src){ const img = new Image(); img.src = src; return img; }
const imgBall = loadImg(ASSETS.ship);
const itemImgs = ASSETS.items.map(loadImg);

/* ---------------- Debrief ---------------- */
const ITEM_INFO = [
  { name: "Maquettage", text: "Le maquettage est une étape essentielle car il permet de planifier le site avant de commencer à coder. On y définit la structure des pages, l’emplacement des menus, des boutons, des images et des textes. Grâce à cette étape, on visualise le parcours de l’utilisateur et on peut corriger rapidement l’organisation si quelque chose n’est pas clair ou pas pratique. Le maquettage évite de perdre du temps ensuite, car il sert de guide pour la création du site et permet de valider l’idée avec le client ou l’équipe avant de passer au développement.", src: ASSETS.items[0] },
  { name: "codage", text: "Le développement est l’étape où le site prend réellement vie. Visual Studio Code représente l’outil utilisé pour écrire le code (HTML, CSS, JavaScript ou d’autres langages). Cette étape est importante car elle transforme la maquette en un site fonctionnel et interactif. Un bon développement permet d’avoir un site rapide, bien organisé, lisible et facile à modifier plus tard. C’est aussi à ce moment qu’on fait attention à la compatibilité mobile, aux performances et à la qualité du code pour que le site soit fiable et agréable à utiliser.", src: ASSETS.items[1] },
  { name: "hébergement", text: "L’hébergement est indispensable car un site internet doit être stocké quelque part pour être accessible en ligne. L’hébergeur permet de publier le site sur un serveur, afin que tout le monde puisse le consulter sur internet. Sans cette étape, le site reste seulement sur l’ordinateur du développeur. L’hébergement est important aussi pour la stabilité du site : il doit être disponible, rapide et sécurisé. C’est grâce à cette étape que le projet devient concret et visible par les utilisateurs.", src: ASSETS.items[2] },
  { name: "Base de données", text: "La base de données est essentielle dès qu’un site doit stocker et gérer des informations : utilisateurs, articles, produits, formulaires, commentaires, réservations, etc. Elle permet de rendre le site dynamique, c’est-à-dire qu’il peut afficher du contenu qui change et s’adapte selon les données enregistrées. Cette étape est importante car elle rend le site plus complet et plus utile, surtout pour les projets modernes. Sans base de données, un site reste souvent limité à des pages fixes, alors qu’avec une base de données, on peut créer un site évolutif et interactif.", src: ASSETS.items[3] },
];

let endIndex = 0;
function renderEndItem(){
  const info = ITEM_INFO[endIndex];
  endItemImg.src = info.src;
  endItemImg.alt = info.name;
  endItemName.textContent = info.name;
  endItemText.textContent = info.text;
  endCounter.textContent = `${endIndex+1} / 4`;
}
if (endPrev) endPrev.addEventListener("click", ()=>{ endIndex=(endIndex-1+4)%4; renderEndItem(); });
if (endNext) endNext.addEventListener("click", ()=>{ endIndex=(endIndex+1)%4; renderEndItem(); });

/* ---------------- Helpers ---------------- */
function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
function lerp(a,b,t){ return a + (b-a)*t; }
function rects(a,b){
  return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}

/* circle vs rect */
function circleRectCollide(cx, cy, r, rx, ry, rw, rh){
  const closestX = clamp(cx, rx, rx+rw);
  const closestY = clamp(cy, ry, ry+rh);
  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx*dx + dy*dy) <= r*r;
}

function reflectBallOnRect(ball, rect){
  // choose axis by penetration
  const cx = ball.x, cy = ball.y;
  const left = cx - rect.x;
  const right = rect.x + rect.w - cx;
  const top = cy - rect.y;
  const bottom = rect.y + rect.h - cy;
  const minH = Math.min(left, right);
  const minV = Math.min(top, bottom);
  if (minH < minV) ball.vx *= -1;
  else ball.vy *= -1;
}

/* ---------------- Canvas sizing ---------------- */
const screen = { w: 360, h: 740 };
function resize(){
  const r = frame.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(r.width * dpr);
  canvas.height = Math.floor(r.height * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  screen.w = r.width;
  screen.h = r.height;
  setSizes();
}
window.addEventListener("resize", resize);

/* ---------------- Game objects ---------------- */
const paddle = { x: 0, y: 0, w: 90, h: 16, baseSpeed: 760 };
let balls = []; // {x,y,r,vx,vy,fire:boolean}
let bricks = []; // {x,y,w,h,hp,isItemBrick}
let got = 0;
let itemIndex = 0;         // 0..3
let fallingItem = null;    // {id,x,y,s,vy}
let fallingPowers = [];    // {type,x,y,s,vy}

let running = false;
let lastT = performance.now();
let tStart = 0;

/* ---------------- Effects (timers) ---------------- */
const effects = {
  slow: 0,     // seconds
  invert: 0,   // seconds
  wrap: 0      // seconds
};

function effectActive(name){ return effects[name] > 0; }

/* ---------------- Bonus system ---------------- */
const BRICKS_FOR_POWER = 4;   // ✅ nombre défini de briques détruites avant drop
let bricksDestroyedSincePower = 0;

// types
const POWER = {
  TRIPLE: "3x",
  FIRE: "invincible",
  SLOW: "lent",
  INVERT: "invertion",
  WRAP: "fantôme"
};

function randomPowerType(){
  // tu peux ajuster les chances ici
  const bag = [
    POWER.TRIPLE, POWER.FIRE,       // bonus
    POWER.SLOW, POWER.INVERT,       // malus
    POWER.WRAP                      // neutre
  ];
  // petites pondérations: plus de neutre et malus un peu
  const weighted = [
    POWER.TRIPLE,
    POWER.FIRE,
    POWER.SLOW,
    POWER.INVERT,
    POWER.WRAP,
  ];
  return weighted[Math.floor(Math.random()*weighted.length)];
}

function spawnPowerDrop(){
  const s = Math.round(screen.w * 0.12);
  fallingPowers.push({
    type: randomPowerType(),
    x: Math.random()*(screen.w - s),
    y: -s,
    s,
    vy: 240
  });
}

function applyPower(type){
  if (type === POWER.TRIPLE){
    // 3 balls total
    if (balls.length === 0) return;
    // keep 1 reference ball
    const b0 = balls[0];
    // if already 3+, keep it
    if (balls.length >= 3) return;

    const speed = Math.max(360, Math.hypot(b0.vx, b0.vy));
    const baseAngle = Math.atan2(b0.vy, b0.vx);
    const angles = [baseAngle, baseAngle + 0.25, baseAngle - 0.25];

    balls = angles.slice(0,3).map((ang, i) => ({
      x: b0.x + i*2,
      y: b0.y,
      r: b0.r,
      vx: Math.cos(ang)*speed,
      vy: Math.sin(ang)*speed,
      fire: false
    }));
    return;
  }

const FIRE_DURATION = 4.0;   // durée du feu en secondes
effects.fire = 0;            // timer feu (0 = pas actif)


  if (type === POWER.FIRE){
  // ✅ feu actif pendant X secondes
  effects.fire = FIRE_DURATION;

  // allume le feu sur toutes les balles
  for (const b of balls) b.fire = true;
  return;
}
if (effects.fire > 0){
  effects.fire -= dt;

  if (effects.fire <= 0){
    effects.fire = 0;

    // ✅ éteint le feu sur toutes les balles
    for (const b of balls) b.fire = false;
  }
}
  if (type === POWER.SLOW){
    effects.slow = 8.0; // durée
    return;
  }

  if (type === POWER.INVERT){
    effects.invert = 8.0; // durée
    return;
  }

  if (type === POWER.WRAP){
    effects.wrap = 10.0; // durée
    return;
  }
}

/* ---------------- Patterns ---------------- */
const PATTERNS = [
  { rows: 1, cols: 7, hpMax: 2 },
  { rows: 2, cols: 7, hpMax: 3 },
  { rows: 3, cols: 7, hpMax: 3 },
  { rows: 4, cols: 7, hpMax: 3 },
];



function setSizes(){
  paddle.w = Math.round(screen.w * 0.26);
  paddle.h = Math.max(12, Math.round(screen.h * 0.018));
  paddle.y = Math.round(screen.h * 0.88);

  const r = Math.max(7, Math.round(screen.w * 0.022));
  // update existing balls radius
  for (const b of balls) b.r = r;
}

/* ---------------- Build pattern ---------------- */
function buildPattern(levelIdx){
  const p = PATTERNS[levelIdx % PATTERNS.length];

  const marginX = Math.round(screen.w * 0.06);
  const topY = Math.round(screen.h * 0.14);
  const gap = Math.max(6, Math.round(screen.w * 0.012));

  const usableW = screen.w - marginX*2;
  const brickW = Math.floor((usableW - gap*(p.cols-1)) / p.cols);
  const brickH = Math.max(14, Math.round(screen.h * 0.028));
// ✅ choisit une brique au hasard dans la grille (r,c)
const itemAt = {
  r: Math.floor(Math.random() * p.rows),
  c: Math.floor(Math.random() * p.cols),
};

  bricks = [];
  for (let r=0;r<p.rows;r++){
    for (let c=0;c<p.cols;c++){
      const x = marginX + c*(brickW+gap);
      const y = topY + r*(brickH+gap);

      const base = 1 + Math.floor(Math.random() * p.hpMax);
      const hp = clamp(base + (r > 2 ? 1 : 0), 1, 4);
      const isItemBrick = (r === itemAt.r && c === itemAt.c);


      bricks.push({ x, y, w: brickW, h: brickH, hp, isItemBrick });
    }
  }

  fallingItem = null;
  fallingPowers = [];
  bricksDestroyedSincePower = 0;

  // reset effects each pattern? (tu peux commenter si tu veux garder)
  effects.slow = 0;
  effects.invert = 0;
  effects.wrap = 0;

  resetBallAndPaddleAutoStart();
}

function resetBallAndPaddleAutoStart(){
  paddle.x = (screen.w - paddle.w)/2;

  const r = Math.max(7, Math.round(screen.w * 0.022));
  const x = paddle.x + paddle.w/2;
  const y = paddle.y - r - 2;

  const dir = (Math.random()*0.9 - 0.45);
  const vx = 320 * dir;
  const vy = -440;

  balls = [{ x, y, r, vx, vy, fire:false }];
}

/* ---------------- UI flow ---------------- */
function showBriefing(){
  briefing.classList.remove("hidden");
  loseScreen.classList.add("hidden");
  endScreen.classList.add("hidden");
  running = false;
}

function lose(msg){
  running = false;
  if (loseText) loseText.textContent = msg || "Tu as perdu.";
  loseScreen.classList.remove("hidden");
}

function win(){
  running = false;
  endIndex = 0;
  renderEndItem();
  if (endTitle) endTitle.textContent = "Mission réussie ✅";
  endScreen.classList.remove("hidden");
}

/* ---------------- Start / reset ---------------- */
function resetAll(){
  got = 0;
  itemIndex = 0;
  if (gotEl) gotEl.textContent = "0";
  buildPattern(0);
}

function startRun(){
  briefing.classList.add("hidden");
  loseScreen.classList.add("hidden");
  endScreen.classList.add("hidden");

  resetAll();
  running = true;
  lastT = performance.now();
  tStart = performance.now();
  requestAnimationFrame(loop);
}

if (startBtn) startBtn.addEventListener("click", startRun);
if (restartLose) restartLose.addEventListener("click", startRun);
if (restartWin) restartWin.addEventListener("click", showBriefing);

window.addEventListener("keydown", (e)=>{
  if (e.key !== "Enter") return;
  const losingVisible = loseScreen && !loseScreen.classList.contains("hidden");
  if (!losingVisible) return;
  e.preventDefault();
  startRun();
}, {passive:false});

/* ---------------- Controls (L/R + drag) ---------------- */
const keys = {};
window.addEventListener("keydown", (e)=>{
  keys[e.key] = true;
  if (["ArrowLeft","ArrowRight"].includes(e.key)) e.preventDefault();
},{passive:false});
window.addEventListener("keyup", (e)=>{ keys[e.key]=false; });

/* ---------------- Item logic ---------------- */
function releaseItemFromBrick(brick){
  const s = Math.round(screen.w * 0.12);
  fallingItem = {
    id: itemIndex,
    x: brick.x + brick.w/2 - s/2,
    y: brick.y + brick.h/2 - s/2,
    s,
    vy: 240
  };
}

function catchItem(){
  got++;
  if (gotEl) gotEl.textContent = String(got);
  itemIndex++;
  fallingItem = null;

  if (got >= 4){
    win();
    return;
  }
  buildPattern(itemIndex);
}

/* ---------------- Update ---------------- */
function update(dt){
  const sec = Math.floor((performance.now() - tStart)/1000);
  if (timeEl) timeEl.textContent = String(sec);

  // update effect timers
  for (const k of Object.keys(effects)){
    if (effects[k] > 0) effects[k] = Math.max(0, effects[k] - dt);
  }

  // paddle speed modifiers
  let speed = paddle.baseSpeed;
  if (effectActive("slow")) speed *= 0.55;

  // keyboard direction (maybe inverted)
  let dir = 0;
  const leftPressed = !!keys["ArrowLeft"];
  const rightPressed = !!keys["ArrowRight"];

  if (!effectActive("invert")) {
    if (leftPressed) dir -= 1;
    if (rightPressed) dir += 1;
  } else {
    // invert
    if (leftPressed) dir += 1;
    if (rightPressed) dir -= 1;
  }

  paddle.x += dir * speed * dt;

  // clamp or wrap
  if (effectActive("wrap")){
    // wrap-around
    if (paddle.x < -paddle.w) paddle.x = screen.w;
    if (paddle.x > screen.w) paddle.x = -paddle.w;
  } else {
    paddle.x = clamp(paddle.x, 0, screen.w - paddle.w);
  }

  // move balls
  for (const b of balls){
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // wall collisions: left/right/top
    let hitWall = false;

    if (b.x - b.r < 0){ b.x = b.r; b.vx *= -1; hitWall = true; }
    if (b.x + b.r > screen.w){ b.x = screen.w - b.r; b.vx *= -1; hitWall = true; }
    if (b.y - b.r < 0){ b.y = b.r; b.vy *= -1; hitWall = true; }

    // paddle bounce
    if (circleRectCollide(b.x, b.y, b.r, paddle.x, paddle.y, paddle.w, paddle.h)){
      const hit = (b.x - (paddle.x + paddle.w/2)) / (paddle.w/2);
      b.vx = hit * 520;
      b.vy = -Math.abs(b.vy);
      b.y = paddle.y - b.r - 2;
    }
  }

  // remove balls that fell
  balls = balls.filter(b => b.y - b.r <= screen.h + 12);

  // lose if no balls left
  if (balls.length === 0){
    lose("La balle est tombée. Tu recommences tout.");
    return;
  }

  // brick collisions (for each ball)
  for (const b of balls){
    // FIRE ball: destroys bricks without bouncing
    if (b.fire){
      for (const br of bricks){
        if (br.hp <= 0) continue;
        if (circleRectCollide(b.x, b.y, b.r, br.x, br.y, br.w, br.h)){
          // destroy brick instantly
          const wasItem = br.isItemBrick;
          br.hp = 0;

          bricksDestroyedSincePower++;
          if (bricksDestroyedSincePower >= BRICKS_FOR_POWER){
            bricksDestroyedSincePower = 0;
            spawnPowerDrop();
          }

          if (wasItem && !fallingItem){
            releaseItemFromBrick(br);
          }
          // continue flying, no reflection
        }
      }
      continue;
    }

    // normal ball: one brick per frame
    for (const br of bricks){
      if (br.hp <= 0) continue;
      if (circleRectCollide(b.x, b.y, b.r, br.x, br.y, br.w, br.h)){
        br.hp -= 1;
        reflectBallOnRect(b, br);

        if (br.hp <= 0){
          bricksDestroyedSincePower++;
          if (bricksDestroyedSincePower >= BRICKS_FOR_POWER){
            bricksDestroyedSincePower = 0;
            spawnPowerDrop();
          }
          if (br.isItemBrick && !fallingItem){
            releaseItemFromBrick(br);
          }
        }
        break;
      }
    }
  }

  // falling item
  if (fallingItem){
    fallingItem.y += fallingItem.vy * dt;

    const itRect = { x: fallingItem.x, y: fallingItem.y, w: fallingItem.s, h: fallingItem.s };
    const padRect = { x: paddle.x, y: paddle.y, w: paddle.w, h: paddle.h };

    if (rects(itRect, padRect)){
      catchItem();
      return;
    }
    if (fallingItem.y > screen.h + 30){
      lose("Tu as raté l’item. Tu recommences tout.");
      return;
    }
  }

  // falling powers
  for (const p of fallingPowers){
    p.y += p.vy * dt;

    const pr = { x:p.x, y:p.y, w:p.s, h:p.s };
    const padRect = { x: paddle.x, y: paddle.y, w: paddle.w, h: paddle.h };

    if (rects(pr, padRect)){
      applyPower(p.type);
      p.dead = true;
    } else if (p.y > screen.h + 40){
      // missed powerup => ignore
      p.dead = true;
    }
  }
  fallingPowers = fallingPowers.filter(p => !p.dead);
}

/* ---------------- Draw ---------------- */
function brickColor(hp){
  if (hp >= 4) return "rgba(255, 80, 80, 0.88)";
  if (hp === 3) return "rgba(255, 170, 60, 0.88)";
  if (hp === 2) return "rgba(70, 200, 255, 0.88)";
  return "rgba(160, 255, 120, 0.88)";
}

function drawPower(p){
  // background box
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(p.x, p.y, p.s, p.s);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.strokeRect(p.x+0.5, p.y+0.5, p.s-1, p.s-1);

  // label
  let label = "";
  if (p.type === POWER.TRIPLE) label = "3X";
  else if (p.type === POWER.FIRE) label = "FIRE";
  else if (p.type === POWER.SLOW) label = "SLOW";
  else if (p.type === POWER.INVERT) label = "INV";
  else label = "WRAP";

  ctx.save();
  ctx.font = `900 ${Math.max(12, Math.round(p.s*0.28))}px system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = p.x + p.s/2;
  const cy = p.y + p.s/2;
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0,0,0,0.65)";
  ctx.strokeText(label, cx, cy);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText(label, cx, cy);
  ctx.restore();
}

function draw(){
  ctx.clearRect(0,0,screen.w,screen.h);

  // background dots
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  for (let i=0;i<140;i++){
    const x = (i*97) % screen.w;
    const y = ((i*173) + (performance.now()*0.02)) % screen.h;
    ctx.fillRect(x, y, 2, 2);
  }

  // bricks
  for (const br of bricks){
    if (br.hp <= 0) continue;

    ctx.fillStyle = brickColor(br.hp);
    ctx.fillRect(br.x, br.y, br.w, br.h);

    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.strokeRect(br.x+0.5, br.y+0.5, br.w-1, br.h-1);

    // number
    ctx.save();
    ctx.font = `900 ${Math.max(12, Math.round(br.h*0.7))}px system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cx = br.x + br.w/2;
    const cy = br.y + br.h/2;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(String(br.hp), cx, cy);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText(String(br.hp), cx, cy);
    ctx.restore();

    // Item visible in special brick (embedded)
    if (br.isItemBrick && !fallingItem && itemIndex < 4){
      const img = itemImgs[itemIndex];
      const s = Math.min(br.w, br.h) * 0.9;
      const ix = br.x + br.w/2 - s/2;
      const iy = br.y + br.h/2 - s/2;
      if (img.complete && img.naturalWidth){
        ctx.globalAlpha = 0.95;
        ctx.drawImage(img, ix, iy, s, s);
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(ix, iy, s, s);
      }
    }
  }

  // paddle
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
  ctx.strokeStyle = "rgba(255,255,255,0.20)";
  ctx.strokeRect(paddle.x+0.5, paddle.y+0.5, paddle.w-1, paddle.h-1);

  // balls
  for (const b of balls){
    if (b.fire){
      // glow fire
      ctx.save();
      ctx.fillStyle = "rgba(255,120,40,0.35)";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r*2.2, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    if (imgBall.complete && imgBall.naturalWidth){
      const d = b.r*2;
      ctx.drawImage(imgBall, b.x - b.r, b.y - b.r, d, d);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // falling item
  if (fallingItem){
    const img = itemImgs[fallingItem.id];
    if (img.complete && img.naturalWidth){
      ctx.drawImage(img, fallingItem.x, fallingItem.y, fallingItem.s, fallingItem.s);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(fallingItem.x, fallingItem.y, fallingItem.s, fallingItem.s);
    }
  }

  // falling powers
  for (const p of fallingPowers){
    drawPower(p);
  }

  // small status hint (optional)
  // show active effects
  const tags = [];
  if (effectActive("slow")) tags.push("SLOW");
  if (effectActive("invert")) tags.push("INV");
  if (effectActive("wrap")) tags.push("WRAP");
  const anyFire = balls.some(b=>b.fire);
  if (anyFire) tags.push("FIRE");

  if (tags.length){
    ctx.save();
    ctx.font = "800 12px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText(tags.join("  "), 12, screen.h - 10);
    ctx.restore();
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

/* ---------------- Init ---------------- */
resize();
showBriefing();
