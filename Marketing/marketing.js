/* =========================================================
   marketing.js — PACMAN (4 niveaux)
   - Appui = 1 case
   - Maintien = avance en continu (case par case)
   - Tunnel fluide (wrap animé)
   - Labyrinthe petit au début puis grandit
   - AUCUNE zone inaccessible (connectivité strong)
   - Cage fantômes: sortie sûre (porte en bas)
   - Bonus (power):
       * dure POWER_DURATION secondes
       * fantômes retournent à la cage, restent sur place, gigottent
       * ils repartent à la fin du bonus
   - Quand tous les pellets sont mangés:
       * l'item du niveau apparaît à la sortie (tunnel droite)
       * pour passer au niveau suivant => récupérer l'item en sortant
   - Fin niveau 4 => debrief items (viewer)
   ========================================================= */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

/* ---------- HUD ---------- */
const livesEl = document.getElementById("lives");
const levelEl = document.getElementById("level");
const remainingEl = document.getElementById("remaining");
const powerEl = document.getElementById("power");

/* ---------- UI ---------- */
const backBtn = document.getElementById("back");
const restartBtn = document.getElementById("restart");
const overlay = document.getElementById("overlay");
const startBtn = document.getElementById("start");
const ovTitle = document.getElementById("ovTitle");
const ovText = document.getElementById("ovText");

/* ---------- End viewer ---------- */
const endScreen = document.getElementById("endScreen");
const endItemImg = document.getElementById("endItemImg");
const endItemName = document.getElementById("endItemName");
const endItemText = document.getElementById("endItemText");
const endPrev = document.getElementById("endPrev");
const endNext = document.getElementById("endNext");
const endCounter = document.getElementById("endCounter");
const restartWin = document.getElementById("restartWin");

/* =========================================================
   CONFIG
   ========================================================= */
const LEVELS = 4;

// plus petit au début + croissance graduelle
const BASE_W = 11;
const BASE_H = 13;
const GROW_W = 1;
const GROW_H = 1;

// Vies
const START_LIVES = 2;

// Bonus
const POWER_DURATION = 10.0;

// Vitesse joueur (cases/sec)
const PLAYER_TPS = 7.0;

// Fantômes
let FORCE_GHOST_COUNT = null;

const CHASE_RADIUS_TILES = 5; // distance en cases pour déclencher la poursuite

const LEVEL_CONFIG = {
  1: { ghosts: 2, wallDensity: 0.18, ghostSpeed: 3.0, rampStart: 0.55, rampSeconds: 11 },
  2: { ghosts: 3, wallDensity: 0.22, ghostSpeed: 3.5, rampStart: 0.60, rampSeconds: 10 },
  3: { ghosts: 4, wallDensity: 0.26, ghostSpeed: 4.0, rampStart: 0.68, rampSeconds: 9  },
  4: { ghosts: 5, wallDensity: 0.30, ghostSpeed: 4.4, rampStart: 0.75, rampSeconds: 8  },
};

const GHOST_COLORS = ["#ff3b3b", "#ff89ff", "#55d7ff", "#ffb84d", "#68ff7a", "#b68cff"];

// IA modes (on garde mais pendant power => freeze cage)
const GHOST_MODE = { scatterSeconds: 4.0, chaseSeconds: 10.0 };
const GHOST_ROLE = ["chase", "ambush", "intercept", "wander"];

/* =========================================================
   ITEMS (débrief final) — 1 par niveau, récupéré en sortant
   ========================================================= */
const ITEM_INFO = [
  { name: "Item 1", text: "Définir le message permet de savoir exactement ce que l’on veut communiquer. Un message clair et cohérent aide le public à comprendre rapidement l’idée principale et à s’en souvenir.", src: "/assets/items/citem1.png" },
  { name: "Item 2", text: "Identifier le public permet d’adapter le ton, le vocabulaire et le contenu. Une bonne communication dépend du fait de parler aux bonnes personnes, au bon moment.", src: "/assets/items/citem2.png" },
  { name: "Item 3", text: "Choisir les bons canaux permet de diffuser le message là où le public est présent. Un message efficace doit être transmis sur les plateformes les plus adaptées.", src: "/assets/items/citem3.png" },
  { name: "Item 4", text: "La diffusion sert à faire entendre le message et à renforcer sa visibilité. Une communication régulière et cohérente permet d’augmenter l’impact et la reconnaissance.", src: "/assets/items/citem4.png" },
];

let collectedItems = new Set();

const exitItemImg = new Image();
exitItemImg.src = ITEM_INFO[0].src;

/* =========================================================
   TILES
   ========================================================= */
const T = { EMPTY:0, WALL:1, CAGE:2 };

/* =========================================================
   STATE
   ========================================================= */
let level = 1;
let lives = START_LIVES;
let running = false;

let gridW = BASE_W;
let gridH = BASE_H;

let tile = 28;
let offsetX = 0;
let offsetY = 0;

let grid = [];
let pellets = new Set();
let powers = new Set();

let powerTime = 0;
let remainingPellets = 0;

let exitOpen = false;     // devient vrai quand pellets=0
let exitItemReady = false;// item visible à la sortie

let levelTime = 0;

// difficulté chargée
let GHOST_COUNT = 3;
let GHOST_TPS = 3.5;
let GHOST_RAMP_START = 0.55;
let GHOST_RAMP_SECONDS = 10.0;
let wallDensity = 0.22;

// positions utiles
let spawnX=0, spawnY=0;
let cageCenterX=0, cageTopY=0;
let doorY=0;

// tunnel / sortie
let tunnelY = 0;
let exitPos = {x:0,y:0};

// input maintien
const held = { left:false, right:false, up:false, down:false };
let lastHeld = null;

// joueur (déplacement case par case + animation)
const player = {
  x:0, y:0,
  px:0, py:0,
  dirX:0, dirY:0,
  moving:false,
  fromX:0, fromY:0,
  toX:0, toY:0,
  fromPx:0, fromPy:0,
  toPx:0, toPy:0,
  moveT:0,
  queuedDir: null
};

// fantômes
let ghosts = [];

/* =========================================================
   UTILS
   ========================================================= */
function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
function key(x,y){ return `${x},${y}`; }

function resize(){
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);

  tile = Math.floor(Math.min(rect.width / gridW, rect.height / gridH));
  tile = clamp(tile, 18, 44);

  const worldW = tile * gridW;
  const worldH = tile * gridH;
  offsetX = Math.floor((rect.width - worldW)/2);
  offsetY = Math.floor((rect.height - worldH)/2);

  // resync positions
  player.px = player.x * tile;
  player.py = player.y * tile;
  for (const g of ghosts){
    g.px = g.x * tile;
    g.py = g.y * tile;
    g.homePx = g.homeX * tile;
    g.homePy = g.homeY * tile;
  }
}
window.addEventListener("resize", resize);

/* =========================================================
   UI / NAV
   ========================================================= */
if (backBtn) backBtn.addEventListener("click", ()=> window.location.href="../index.html");
if (restartBtn) restartBtn.addEventListener("click", ()=> restartAll());
if (startBtn) startBtn.addEventListener("click", ()=> startGame());
if (restartWin) restartWin.addEventListener("click", ()=> restartAll());

function showOverlay(title, text, btnLabel="Jouer"){
  overlay.style.display = "grid";
  ovTitle.textContent = title;
  ovText.textContent = text;
  startBtn.textContent = btnLabel;
}
function hideOverlay(){ overlay.style.display = "none"; }

function showEndDebrief(){
  running = false;
  hideOverlay();
  overlay.style.display = "none";
  endScreen.classList.remove("hidden");
  endIndex = 0;
  renderEndItem();
}
function hideEnd(){ endScreen.classList.add("hidden"); }

/* =========================================================
   End viewer
   ========================================================= */
let endIndex = 0;

function renderEndItem(){
  const owned = Array.from(collectedItems).sort((a,b)=>a-b);
  if (!owned.length){
    endItemImg.src = "";
    endItemName.textContent = "Aucun item";
    endItemText.textContent = "Tu n'as récupéré aucun item.";
    endCounter.textContent = "0 / 0";
    return;
  }
  endIndex = clamp(endIndex, 0, owned.length-1);
  const idx = owned[endIndex];
  const info = ITEM_INFO[idx];

  endItemImg.src = info.src;
  endItemImg.alt = info.name;
  endItemName.textContent = info.name;
  endItemText.textContent = info.text;
  endCounter.textContent = `${endIndex+1} / ${owned.length}`;
}

if (endPrev) endPrev.addEventListener("click", ()=>{ endIndex--; renderEndItem(); });
if (endNext) endNext.addEventListener("click", ()=>{ endIndex++; renderEndItem(); });

/* =========================================================
   WRAP / TUNNEL
   ========================================================= */
function wrapXCase(x,y){
  if (y === tunnelY){
    if (x < 0) return gridW-1;
    if (x > gridW-1) return 0;
  }
  return clamp(x, 0, gridW-1);
}
function isTunnelWrapMove(fromX, fromY, toX){
  return (fromY === tunnelY) && ((fromX === 0 && toX === gridW-1) || (fromX === gridW-1 && toX === 0));
}

/* =========================================================
   DIFFICULTY
   ========================================================= */
function applyLevelDifficulty(lv){
  const cfg = LEVEL_CONFIG[lv] || LEVEL_CONFIG[1];
  GHOST_COUNT = (typeof FORCE_GHOST_COUNT === "number") ? FORCE_GHOST_COUNT : cfg.ghosts;
  GHOST_TPS = cfg.ghostSpeed;
  GHOST_RAMP_START = cfg.rampStart ?? 0.55;
  GHOST_RAMP_SECONDS = cfg.rampSeconds ?? 10.0;
  wallDensity = cfg.wallDensity ?? 0.22;
}

/* =========================================================
   CONNECTIVITY (strong)
   ========================================================= */
function countUnreachableFrom(sx, sy){
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const reachable = new Set();
  const q = [{x:sx,y:sy}];

  while(q.length){
    const cur = q.shift();
    const ck = key(cur.x,cur.y);
    if (reachable.has(ck)) continue;
    reachable.add(ck);

    for (const [dx,dy] of dirs){
      let nx = cur.x + dx;
      let ny = cur.y + dy;
      nx = wrapXCase(nx, ny);

      if (ny<=0 || ny>=gridH-1) continue;
      if (nx<=0 || nx>=gridW-1){
        if (ny !== tunnelY) continue;
      }
      if (grid[ny][nx] !== T.EMPTY) continue;

      const nk = key(nx,ny);
      if (!reachable.has(nk)) q.push({x:nx,y:ny});
    }
  }

  let unreachable = 0;
  for (let y=1;y<gridH-1;y++){
    for (let x=1;x<gridW-1;x++){
      if (grid[y][x] !== T.EMPTY) continue;
      if (!reachable.has(key(x,y))) unreachable++;
    }
  }
  return unreachable;
}

function ensureConnectivityFrom(sx, sy){
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const reachable = new Set();
  const q = [{x:sx,y:sy}];

  while(q.length){
    const cur = q.shift();
    const ck = key(cur.x,cur.y);
    if (reachable.has(ck)) continue;
    reachable.add(ck);

    for (const [dx,dy] of dirs){
      let nx = cur.x + dx;
      let ny = cur.y + dy;
      nx = wrapXCase(nx, ny);
      if (ny<=0||ny>=gridH-1) continue;
      if (nx<=0||nx>=gridW-1){
        if (ny !== tunnelY) continue;
      }
      if (grid[ny][nx] !== T.EMPTY) continue;
      const nk = key(nx,ny);
      if (!reachable.has(nk)) q.push({x:nx,y:ny});
    }
  }

  // cases vides non atteintes => percer des murs vers une zone atteinte
  const unreachable = [];
  for (let y=1;y<gridH-1;y++){
    for (let x=1;x<gridW-1;x++){
      if (grid[y][x] !== T.EMPTY) continue;
      if (!reachable.has(key(x,y))) unreachable.push({x,y});
    }
  }
  if (!unreachable.length) return;

  for (const start of unreachable){
    const prev = new Map();
    const seen = new Set();
    const qq = [start];
    const startK = key(start.x,start.y);

    seen.add(startK);
    prev.set(startK, null);

    let foundK = null;

    while(qq.length && !foundK){
      const cur = qq.shift();
      const ck = key(cur.x,cur.y);

      for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (nx<=0||ny<=0||nx>=gridW-1||ny>=gridH-1) continue;

        const nk = key(nx,ny);
        if (seen.has(nk)) continue;

        seen.add(nk);
        prev.set(nk, ck);

        if (reachable.has(nk)){
          foundK = nk;
          break;
        }
        qq.push({x:nx,y:ny});
      }
    }

    if (!foundK) continue;

    let curK = foundK;
    while(curK && curK !== startK){
      const [cx,cy] = curK.split(",").map(Number);
      if (grid[cy][cx] === T.WALL) grid[cy][cx] = T.EMPTY;
      curK = prev.get(curK);
    }
  }
}

function ensureConnectivityStrong(sx, sy, passes=10){
  for (let i=0;i<passes;i++){
    ensureConnectivityFrom(sx, sy);
    const u = countUnreachableFrom(sx, sy);
    if (u === 0) break;
  }
}

/* =========================================================
   Dead-ends removal (light)
   ========================================================= */
function countOpenNeighbors(x,y){
  let n = 0;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const [dx,dy] of dirs){
    let nx = x+dx, ny=y+dy;
    nx = wrapXCase(nx, ny);
    if (ny<=0||ny>=gridH-1) continue;
    if (grid[ny][nx] === T.EMPTY) n++;
  }
  return n;
}

function removeDeadEnds(){
  // évite tunnel + spawn + cage
  let changed = true;
  let safety = 0;
  while(changed && safety < 2500){
    safety++;
    changed = false;
    for (let y=1;y<gridH-1;y++){
      for (let x=1;x<gridW-1;x++){
        if (grid[y][x] !== T.EMPTY) continue;
        if (y === tunnelY) continue;
        if (x === spawnX && y === spawnY) continue;
        if (isInsideCage(x,y)) continue;

        const open = countOpenNeighbors(x,y);
        if (open <= 1){
          const candidates = [];
          for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
            const nx = x+dx, ny=y+dy;
            if (nx<=0||ny<=0||nx>=gridW-1||ny>=gridH-1) continue;
            if (grid[ny][nx] === T.WALL) candidates.push({x:nx,y:ny});
          }
          if (candidates.length){
            const c = candidates[(Math.random()*candidates.length)|0];
            grid[c.y][c.x] = T.EMPTY;
            changed = true;
          }
        }
      }
    }
  }
}

/* =========================================================
   Cage helpers
   ========================================================= */
function isInsideCage(x,y){
  return grid[y][x] === T.CAGE;
}

/* =========================================================
   Build level (safe)
   ========================================================= */
function buildLevel(lv){
  applyLevelDifficulty(lv);

  const LEVEL_SIZES = [
  { w: 11, h: 13 }, // niveau 1
  { w: 13, h: 15 }, // niveau 2
  { w: 15, h: 13 }, // niveau 3 (différent: plus large que haut)
  { w: 17, h: 19 }, // niveau 4
];

const s = LEVEL_SIZES[Math.min(lv-1, LEVEL_SIZES.length-1)];
gridW = s.w;
gridH = s.h;

  if (gridW % 2 === 0) gridW += 1;
  if (gridH % 2 === 0) gridH += 1;

  grid = Array.from({length:gridH}, ()=>Array(gridW).fill(T.EMPTY));

  tunnelY = Math.floor(gridH*0.55);

  // borders
  for (let y=0;y<gridH;y++){
    for (let x=0;x<gridW;x++){
      if (x===0 || y===0 || x===gridW-1 || y===gridH-1) grid[y][x] = T.WALL;
    }
  }

  // tunnel openings
  grid[tunnelY][0] = T.EMPTY;
  grid[tunnelY][gridW-1] = T.EMPTY;

  // cage placement (not too high)
  const cageW = 7;
  const cageH = 4;
  cageCenterX = Math.floor(gridW/2);
  cageTopY = Math.max(2, Math.floor(gridH*0.16));
  const left = cageCenterX - Math.floor(cageW/2);

  for (let y=cageTopY; y<cageTopY+cageH; y++){
    for (let x=left; x<left+cageW; x++){
      const border = (y===cageTopY || y===cageTopY+cageH-1 || x===left || x===left+cageW-1);
      grid[y][x] = border ? T.WALL : T.CAGE;
    }
  }

  // door at bottom center
  doorY = cageTopY + cageH - 1;
  grid[doorY][cageCenterX] = T.EMPTY;
  if (doorY + 1 < gridH - 1) grid[doorY + 1][cageCenterX] = T.EMPTY;

  // spawn player lower
  spawnX = cageCenterX;
  spawnY = Math.floor(gridH*0.70);

  // clear spawn area
  for (let y=spawnY-1; y<=spawnY+1; y++){
    for (let x=spawnX-2; x<=spawnX+2; x++){
      if (grid[y] && grid[y][x] !== undefined) grid[y][x] = T.EMPTY;
    }
  }

  // internal walls symmetric
  for (let y=2;y<gridH-2;y++){
    for (let x=2;x<Math.floor(gridW/2);x++){
      // keep some open core
      const cx = Math.floor(gridW/2);
      const cy = Math.floor(gridH*0.62);
      if (Math.abs(x-cx) < 3 && Math.abs(y-cy) < 4) continue;

      // keep cage neighborhood open
      if (Math.abs(y - (cageTopY+cageH+1)) <= 1 && Math.abs(x - cageCenterX) <= 4) continue;

      const r = (x*11 + y*7 + lv*31) % 100;
      const shouldWall = (r/100) < wallDensity && (x % 3 !== 0) && (y % 4 !== 0);

      if (shouldWall){
        grid[y][x] = T.WALL;
        grid[y][gridW-1-x] = T.WALL;
      }
    }
  }

  // ensure connectivity strongly
  ensureConnectivityStrong(spawnX, spawnY, 10);

  // remove dead ends lightly, then re-ensure
  removeDeadEnds();
  ensureConnectivityStrong(spawnX, spawnY, 10);

  // pellets / powers
  pellets.clear();
  powers.clear();

  for (let y=1;y<gridH-1;y++){
    for (let x=1;x<gridW-1;x++){
      if (grid[y][x] !== T.EMPTY) continue;
      pellets.add(key(x,y));
    }
  }

  // powers corners
  const corners = [[1,1],[gridW-2,1],[1,gridH-2],[gridW-2,gridH-2]];
  for (const [x0,y0] of corners){
    const p = findNearestEmpty(x0,y0);
    if (p){
      powers.add(key(p.x,p.y));
      pellets.delete(key(p.x,p.y));
    }
  }

  // do not place pellet on spawn and tunnel openings
  pellets.delete(key(spawnX, spawnY));
  pellets.delete(key(0, tunnelY));
  pellets.delete(key(gridW-1, tunnelY));

  // exit at tunnel right
  exitPos = {x: gridW-1, y: tunnelY};

  // reset level state
  exitOpen = false;
  exitItemReady = false;
  remainingPellets = pellets.size;
  powerTime = 0;
  levelTime = 0;

  // exit item = current level item
  const itemIdx = clamp(lv-1, 0, ITEM_INFO.length-1);
  exitItemImg.src = ITEM_INFO[itemIdx].src;

  placePlayer(spawnX, spawnY);
  initGhosts(cageCenterX, cageTopY + 2);

  resize();
}

function findNearestEmpty(x,y){
  for (let r=0;r<10;r++){
    for (let dy=-r;dy<=r;dy++){
      for (let dx=-r;dx<=r;dx++){
        const nx = x+dx, ny=y+dy;
        if (nx<=0||ny<=0||nx>=gridW-1||ny>=gridH-1) continue;
        if (grid[ny][nx]===T.EMPTY) return {x:nx,y:ny};
      }
    }
  }
  return null;
}

/* =========================================================
   Entities
   ========================================================= */
function placePlayer(x,y){
  player.x = x; player.y = y;
  player.px = x * tile;
  player.py = y * tile;
  player.dirX = 0; player.dirY = 0;
  player.moving = false;
  player.moveT = 0;
  player.queuedDir = null;
}

function initGhosts(cx, startY){
  ghosts = [];
  for (let i=0;i<GHOST_COUNT;i++){
    const gx = cx + (i%3) - 1;
    const gy = startY + Math.floor(i/3);

    ghosts.push({
      index:i,

      x:gx, y:gy,
      px:gx*tile, py:gy*tile,

      // home = spawn location (cage)
      homeX: gx,
      homeY: gy,
      homePx: gx*tile,
      homePy: gy*tile,

      dirX:0, dirY:-1,
      moving:false,
      fromX:gx, fromY:gy,
      toX:gx, toY:gy,
      fromPx:gx*tile, fromPy:gy*tile,
      toPx:gx*tile, toPy:gy*tile,
      moveT:0,

      frightened:false,
      frozen:false,      // ✅ freeze during power
      respawnT:0,
      color:GHOST_COLORS[i % GHOST_COLORS.length],
      seed:Math.random()*9999
    });
  }
}

/* =========================================================
   Blocking
   ========================================================= */
function isBlockedForPlayer(x,y){
  if (x<0||y<0||x>=gridW||y>=gridH) return true;
  if (grid[y][x] === T.WALL) return true;
  if (grid[y][x] === T.CAGE) return true;
  // exit cell blocked until item is ready
  if (x === exitPos.x && y === exitPos.y && !exitItemReady) return true;
  return false;
}
function isBlockedForGhost(x,y){
  if (x<0||y<0||x>=gridW||y>=gridH) return true;
  if (grid[y][x] === T.WALL) return true;
  return false;
}
function neighbors(x,y, forGhost=false){
  const blocked = forGhost ? isBlockedForGhost : isBlockedForPlayer;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const list = [];
  for (const [dx,dy] of dirs){
    let nx = x+dx, ny=y+dy;
    nx = wrapXCase(nx, ny);
    if (ny<0||ny>=gridH) continue;
    if (!blocked(nx,ny)) list.push({dx,dy,nx,ny});
  }
  return list;
}

/* =========================================================
   Input: appui = 1 case, maintien = continu
   ========================================================= */
window.addEventListener("keydown", (e)=>{
  if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Enter"].includes(e.key)) e.preventDefault();
  if (e.repeat) return;

  if (e.key==="ArrowLeft"){ held.left=true; lastHeld="left"; tryPlayerStep(-1,0); }
  if (e.key==="ArrowRight"){ held.right=true; lastHeld="right"; tryPlayerStep(1,0); }
  if (e.key==="ArrowUp"){ held.up=true; lastHeld="up"; tryPlayerStep(0,-1); }
  if (e.key==="ArrowDown"){ held.down=true; lastHeld="down"; tryPlayerStep(0,1); }

  if (e.key==="Enter" && !running && lives < 0) restartAll();
},{passive:false});

window.addEventListener("keyup", (e)=>{
  if (e.key==="ArrowLeft") held.left=false;
  if (e.key==="ArrowRight") held.right=false;
  if (e.key==="ArrowUp") held.up=false;
  if (e.key==="ArrowDown") held.down=false;
});

function heldDir(){
  const order = [lastHeld, "left","right","up","down"];
  for (const k of order){
    if (!k) continue;
    if (k==="left" && held.left) return {dx:-1,dy:0};
    if (k==="right" && held.right) return {dx:1,dy:0};
    if (k==="up" && held.up) return {dx:0,dy:-1};
    if (k==="down" && held.down) return {dx:0,dy:1};
  }
  return null;
}

function tryPlayerStep(dx,dy){
  if (!running) return;

  if (player.moving){
    player.queuedDir = {dx,dy};
    return;
  }

  const nx = wrapXCase(player.x + dx, player.y + dy);
  const ny = player.y + dy;
  if (ny<0 || ny>=gridH) return;
  if (isBlockedForPlayer(nx,ny)) return;

  startPlayerMove(dx,dy,nx,ny);
}

function startPlayerMove(dx,dy,nx,ny){
  player.dirX = dx; player.dirY = dy;
  player.moving = true;
  player.moveT = 0;

  player.fromX = player.x; player.fromY = player.y;
  player.toX = nx; player.toY = ny;

  player.fromPx = player.fromX * tile;
  player.fromPy = player.fromY * tile;

  if (isTunnelWrapMove(player.fromX, player.fromY, player.toX)){
    if (player.fromX === 0 && player.toX === gridW-1) player.toPx = -1 * tile;
    else if (player.fromX === gridW-1 && player.toX === 0) player.toPx = gridW * tile;
    else player.toPx = player.toX * tile;
  } else {
    player.toPx = player.toX * tile;
  }
  player.toPy = player.toY * tile;
}

/* =========================================================
   Ghost AI helpers (BFS)
   ========================================================= */
function currentGhostMode(){
  const cycle = GHOST_MODE.scatterSeconds + GHOST_MODE.chaseSeconds;
  const t = levelTime % cycle;
  return (t < GHOST_MODE.scatterSeconds) ? "scatter" : "chase";
}

function ghostTarget(g, role, mode){
  const d = Math.hypot(player.x - g.x, player.y - g.y);
if (d <= CHASE_RADIUS_TILES){
  // si proche => poursuite directe
  return { x: player.x, y: player.y };
}

  if (mode === "scatter"){
    const corners = [
      {x:1, y:1},
      {x:gridW-2, y:1},
      {x:1, y:gridH-2},
      {x:gridW-2, y:gridH-2},
    ];
    return corners[g.index % corners.length];
  }

  if (role === "ambush"){
    if (player.dirX===0 && player.dirY===0) return {x:player.x,y:player.y};
    return {x: wrapXCase(player.x + player.dirX*3, player.y), y: clamp(player.y + player.dirY*3, 1, gridH-2)};
  }
  if (role === "intercept"){
    return {x: clamp(Math.round((player.x + exitPos.x)*0.5),1,gridW-2), y: clamp(Math.round((player.y + exitPos.y)*0.5),1,gridH-2)};
  }
  if (role === "wander"){
    if (Math.random()<0.35) return {x:player.x,y:player.y};
    const rx = 1 + ((Math.floor(g.seed) + (levelTime*2|0)) % (gridW-2));
    const ry = 1 + ((Math.floor(g.seed*1.7) + (levelTime*3|0)) % (gridH-2));
    return {x:rx,y:ry};
  }
  return {x:player.x,y:player.y};
}

function bfsNextStep(gx,gy,tx,ty){
  if (gx===tx && gy===ty) return null;

  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const startK = key(gx,gy);
  const targetK = key(tx,ty);

  const q = [{x:gx,y:gy}];
  const prev = new Map();
  prev.set(startK, null);

  while(q.length){
    const cur = q.shift();
    const ck = key(cur.x,cur.y);
    if (ck===targetK) break;

    for (const [dx,dy] of dirs){
      let nx = cur.x + dx;
      let ny = cur.y + dy;
      nx = wrapXCase(nx, ny);
      if (nx<0||ny<0||nx>=gridW||ny>=gridH) continue;
      if (isBlockedForGhost(nx,ny)) continue;

      const nk = key(nx,ny);
      if (prev.has(nk)) continue;

      prev.set(nk, ck);
      q.push({x:nx,y:ny});
    }
  }

  if (!prev.has(targetK)) return null;

  let cur = targetK;
  let p = prev.get(cur);
  while(p && p !== startK){ cur = p; p = prev.get(cur); }
  const [nx,ny] = cur.split(",").map(Number);
  return {nx,ny};
}

/* =========================================================
   Ghost movement + Freeze mode during power
   ========================================================= */
function ghostSpeedMul(){
  const t = clamp(levelTime / GHOST_RAMP_SECONDS, 0, 1);
  return GHOST_RAMP_START + (1 - GHOST_RAMP_START) * t;
}

function startGhostMove(g, nx, ny){
  g.moving = true;
  g.moveT = 0;
  g.fromX = g.x; g.fromY = g.y;
  g.toX = nx; g.toY = ny;

  g.fromPx = g.fromX * tile;
  g.fromPy = g.fromY * tile;

  if (isTunnelWrapMove(g.fromX, g.fromY, g.toX)){
    if (g.fromX === 0 && g.toX === gridW-1) g.toPx = -1 * tile;
    else if (g.fromX === gridW-1 && g.toX === 0) g.toPx = gridW * tile;
    else g.toPx = g.toX * tile;
  } else {
    g.toPx = g.toX * tile;
  }
  g.toPy = g.toY * tile;
}

function updateGhosts(dt){
  const mul = ghostSpeedMul();

  if (powerTime > 0){
  // Pendant le bonus: ils restent sur place, gigottent (draw),
  // et ils ne bougent plus (freeze), MAIS on ne les téléporte pas.
  for (const g of ghosts){
    g.frozen = true;
    g.moving = false;
    g.moveT = 0;
    g.px = g.x * tile;
    g.py = g.y * tile;
  }
  return;
}

// bonus fini => on libère
for (const g of ghosts) g.frozen = false;


  const mode = currentGhostMode();

  for (const g of ghosts){
    if (g.respawnT > 0) g.respawnT = Math.max(0, g.respawnT - dt);

    if (g.moving){
      const speed = GHOST_TPS * mul;
      const moveDuration = 1 / speed;

      g.moveT += dt / moveDuration;
      const t = clamp(g.moveT, 0, 1);

      g.px = g.fromPx + (g.toPx - g.fromPx) * t;
      g.py = g.fromPy + (g.toPy - g.fromPy) * t;

      if (g.moveT >= 1){
        g.x = g.toX; g.y = g.toY;
        g.px = g.x * tile; g.py = g.y * tile;
        g.moving = false; g.moveT = 0;
      }
      continue;
    }

    const opts = neighbors(g.x, g.y, true);
    if (!opts.length) continue;

    // respawn wandering
    if (g.respawnT > 0){
      const c = opts[(Math.random()*opts.length)|0];
      startGhostMove(g, c.nx, c.ny);
      continue;
    }

    const role = GHOST_ROLE[g.index % GHOST_ROLE.length];
    const target = ghostTarget(g, role, mode);
    const step = bfsNextStep(g.x, g.y, target.x, target.y);

    if (step){
      const ok = opts.find(o => o.nx===step.nx && o.ny===step.ny);
      if (ok) startGhostMove(g, ok.nx, ok.ny);
      else {
        const c = opts[(Math.random()*opts.length)|0];
        startGhostMove(g, c.nx, c.ny);
      }
    } else {
      const c = opts[(Math.random()*opts.length)|0];
      startGhostMove(g, c.nx, c.ny);
    }
  }
}

/* =========================================================
   Gameplay interactions
   ========================================================= */
function eatAtPlayer(){
  const k = key(player.x, player.y);

  if (pellets.has(k)){
    pellets.delete(k);
    remainingPellets--;
  }

  if (powers.has(k)){
    powers.delete(k);

    // ✅ activer power + freeze fantômes dans la cage
    powerTime = POWER_DURATION;
  }
}

function ghostCollisions(){
  for (const g of ghosts){
    if (g.respawnT > 0) continue;

    const dx = (g.px - player.px);
    const dy = (g.py - player.py);
    const dist = Math.hypot(dx,dy);

    if (dist < tile*0.55){
      // ✅ Si bonus actif: on "mange" le fantôme => retour cage
      if (powerTime > 0){
        g.respawnT = 2.5;          // temps “mort”
        g.x = g.homeX;
        g.y = g.homeY;
        g.px = g.x * tile;
        g.py = g.y * tile;
        g.moving = false;
        g.moveT = 0;
        continue;
      }

      // ❌ sinon: on perd une vie
      lives--;
      if (lives < 0){
        running = false;
        showOverlay("Perdu ❌", "Tu es tombé sous 0 vie. Recommence.", "Rejouer");
        return;
      }

      powerTime = 0;
      placePlayer(spawnX, spawnY);
      initGhosts(cageCenterX, cageTopY + 2);
      levelTime = 0;
      return;
    }
  }
}


/* =========================================================
   Exit item logic
   ========================================================= */
function checkExitState(){
  if (!exitOpen && remainingPellets <= 0){
    exitOpen = true;
    exitItemReady = true;
  }
}

function takeExitItemAndNextLevel(){
  // prend item du niveau
  collectedItems.add(level - 1);

  level++;
  if (level > LEVELS){
    showEndDebrief();
    return;
  }

  buildLevel(level);
  refreshHUD();
}

/* =========================================================
   Player update
   ========================================================= */
function updatePlayer(dt){
  if (!player.moving){
    const h = heldDir();
    if (h) tryPlayerStep(h.dx, h.dy);

    player.px = player.x * tile;
    player.py = player.y * tile;
    return;
  }

  const moveDuration = 1 / PLAYER_TPS;
  player.moveT += dt / moveDuration;
  const t = clamp(player.moveT, 0, 1);

  player.px = player.fromPx + (player.toPx - player.fromPx) * t;
  player.py = player.fromPy + (player.toPy - player.fromPy) * t;

  if (player.moveT >= 1){
    player.x = player.toX;
    player.y = player.toY;
    player.px = player.x * tile;
    player.py = player.y * tile;

    player.moving = false;
    player.moveT = 0;

    // sortie: seulement si item prêt
    if (exitItemReady && player.x === exitPos.x && player.y === exitPos.y){
      takeExitItemAndNextLevel();
      return;
    }

    if (player.queuedDir){
      const q = player.queuedDir;
      player.queuedDir = null;
      tryPlayerStep(q.dx, q.dy);
      return;
    }

    const h = heldDir();
    if (h) tryPlayerStep(h.dx, h.dy);
  }
}

/* =========================================================
   UPDATE
   ========================================================= */
function update(dt){
  levelTime += dt;

  // countdown power
  if (powerTime > 0){
    powerTime = Math.max(0, powerTime - dt);
  }

  // open exit when pellets done
  checkExitState();

  updatePlayer(dt);
  updateGhosts(dt);

  eatAtPlayer();
  ghostCollisions();

  refreshHUD();
}

function refreshHUD(){
  livesEl.textContent = String(Math.max(lives, 0));
  levelEl.textContent = String(level);
  remainingEl.textContent = String(remainingPellets);
  powerEl.textContent = String(Math.ceil(powerTime));
}

/* =========================================================
   DRAW
   ========================================================= */
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = "#050814";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  drawMaze();
  drawPellets();
  drawPowers();
  drawExitItem();
  drawPlayer();
  drawGhosts();
  drawExitLabel();
}

function drawMaze(){
  for (let y=0;y<gridH;y++){
    for (let x=0;x<gridW;x++){
      const t = grid[y][x];
      const px = offsetX + x*tile;
      const py = offsetY + y*tile;

      if (t === T.WALL){
        ctx.fillStyle = "rgba(120,200,255,0.10)";
        ctx.fillRect(px,py,tile,tile);
        ctx.strokeStyle = "rgba(120,200,255,0.18)";
        ctx.strokeRect(px+0.5,py+0.5,tile-1,tile-1);
      } else if (t === T.CAGE){
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fillRect(px,py,tile,tile);
      }
    }
  }
}

function drawPellets(){
  ctx.fillStyle = "rgba(255,255,255,0.80)";
  for (const s of pellets){
    const [x,y] = s.split(",").map(Number);
    const cx = offsetX + x*tile + tile*0.5;
    const cy = offsetY + y*tile + tile*0.5;
    ctx.beginPath();
    ctx.arc(cx,cy,Math.max(2, tile*0.09),0,Math.PI*2);
    ctx.fill();
  }
}

function drawPowers(){
  for (const s of powers){
    const [x,y] = s.split(",").map(Number);
    const cx = offsetX + x*tile + tile*0.5;
    const cy = offsetY + y*tile + tile*0.5;

    const r = tile*0.22;
    const pulse = 0.85 + 0.15*Math.sin(performance.now()*0.006);

    ctx.fillStyle = "rgba(255,210,120,0.65)";
    ctx.beginPath();
    ctx.arc(cx,cy,r*pulse,0,Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.stroke();
  }
}

function drawExitItem(){
  if (!exitItemReady) return;

  const px = offsetX + exitPos.x*tile;
  const py = offsetY + exitPos.y*tile;

  ctx.fillStyle = "rgba(120,255,160,0.16)";
  ctx.fillRect(px,py,tile,tile);

  const pad = tile*0.12;
  if (exitItemImg.complete && exitItemImg.naturalWidth){
    ctx.drawImage(exitItemImg, px+pad, py+pad, tile-pad*2, tile-pad*2);
  } else {
    const cx = px + tile*0.5, cy = py + tile*0.5;
    ctx.fillStyle = "rgba(120,255,160,0.75)";
    ctx.beginPath(); ctx.arc(cx,cy,tile*0.22,0,Math.PI*2); ctx.fill();
  }
}

function drawPlayer(){
  const cx = offsetX + player.px + tile*0.5;
  const cy = offsetY + player.py + tile*0.5;
  const r = tile*0.42;
  const mouth = 0.35 + 0.15*Math.sin(performance.now()*0.018);

  ctx.fillStyle = "#ffd84d";
  ctx.beginPath();
  const angle = directionAngle(player.dirX, player.dirY);
  ctx.moveTo(cx,cy);
  ctx.arc(cx,cy,r,angle + mouth, angle + Math.PI*2 - mouth);
  ctx.closePath();
  ctx.fill();
}

function directionAngle(dx,dy){
  if (dx===1) return 0;
  if (dx===-1) return Math.PI;
  if (dy===-1) return -Math.PI/2;
  if (dy===1) return Math.PI/2;
  return 0;
}

function drawGhosts(){
  for (const g of ghosts){
    // ✅ si power => gigotte sur place
    let jitterX = 0, jitterY = 0;
    if (powerTime > 0){
      const j = Math.sin(performance.now()*0.05 + g.seed) * 0.9;
      jitterX = j;
      jitterY = -j;
    }

    const cx = offsetX + g.px + tile*0.5 + jitterX;
    const cy = offsetY + g.py + tile*0.55 + jitterY;
    const r = tile*0.40;

    // couleur “peur” (même si freeze)
    let color = g.color;
    if (powerTime > 0){
      const blink = (powerTime < 2.2) ? (Math.sin(performance.now()*0.02) > 0) : false;
      color = blink ? "rgba(255,255,255,0.65)" : "rgba(120,180,255,0.80)";
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx,cy - r*0.2, r, Math.PI, 0);
    ctx.lineTo(cx + r, cy + r*0.75);

    const steps = 6;
    for (let k=0;k<=steps;k++){
      const t = k/steps;
      const wx = cx + r - t*(2*r);
      const wy = cy + r*0.75 + Math.sin((t*steps + performance.now()*0.01))*r*0.10;
      ctx.lineTo(wx, wy);
    }
    ctx.closePath();
    ctx.fill();

    // yeux
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    const ex = r*0.35;
    const ey = -r*0.15;
    ctx.beginPath(); ctx.arc(cx - ex, cy + ey, r*0.16, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + ex, cy + ey, r*0.16, 0, Math.PI*2); ctx.fill();
  }
}

function drawExitLabel(){
  const px = offsetX + exitPos.x*tile;
  const py = offsetY + exitPos.y*tile;

  ctx.fillStyle = exitItemReady ? "rgba(120,255,160,0.90)" : "rgba(255,255,255,0.25)";
  ctx.font = `900 ${Math.max(12, tile*0.45)}px system-ui`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";

  if (!exitItemReady){
    ctx.fillText("Finis les points", px + tile - 4, py - 6);
  } else {
    ctx.fillText("Prends l'item →", px + tile - 4, py - 6);
  }
}

/* =========================================================
   LOOP
   ========================================================= */
let lastT = performance.now();

function loop(t){
  if (!running) return;
  const dt = Math.min(0.033, Math.max(0.001, (t - lastT)/1000));
  lastT = t;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

/* =========================================================
   FLOW
   ========================================================= */
function startGame(){
  running = true;
  hideEnd();
  hideOverlay();
  lastT = performance.now();
  requestAnimationFrame(loop);
}

function restartAll(){
  level = 1;
  lives = START_LIVES;
  collectedItems = new Set();

  hideEnd();
  buildLevel(level);
  refreshHUD();

  running = true;
  hideOverlay();
  lastT = performance.now();
  requestAnimationFrame(loop);
}

/* =========================================================
   BOOT
   ========================================================= */
function boot(){
  hideEnd();
  showOverlay(
    "Pac-Niveau",
    "Appui = 1 case • Maintien = avance.\nObjectif: manger tous les points.\nQuand tout est fini, l'item apparaît à la sortie (tunnel droite).\nPrends-le pour passer au niveau suivant.\nBonus: les fantômes retournent à la cage et gigottent jusqu'à la fin du bonus.",
    "Jouer"
  );

  level = 1;
  lives = START_LIVES;
  collectedItems = new Set();

  buildLevel(level);
  refreshHUD();
}
boot();