"use strict";
// Si algo falla, que se vea en pantalla y no solo en la consola del navegador.
function showError(msg) {
  try {
    let el = document.getElementById("errbox");
    if (!el) {
      el = document.createElement("div"); el.id = "errbox";
      el.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9999;max-width:70vw;padding:8px 12px;font:13px 'Atkinson Hyperlegible',system-ui,sans-serif;color:#ffd0d0;background:rgba(40,4,8,.94);border:2px solid #ff5b68;box-shadow:4px 4px 0 rgba(0,0,0,.65);white-space:pre-wrap";
      document.body.appendChild(el);
    }
    el.textContent = "Error: " + msg;
  } catch (e) { /* nada */ }
}
window.addEventListener("error", ev => showError(ev.message + " (" + String(ev.filename || "").split("/").pop() + ":" + ev.lineno + ")"));
/* Escape del Maizal — primera persona (raycasting en canvas, sin dependencias).
 * El arte pixelado se dibuja por código; no hay que descargar sprites.
 */

/* ============ Configuración (ajusta aquí la dificultad) ============ */
const CFG = {
  W: 640, H: 400, COL: 2, FOV: 1.15,       // resolución interna, ancho de columna, campo de visión (rad)
  MOVE: 3.1,                               // casillas/s del jugador en el maizal
  ALIEN_BASE: 0.5,                         // velocidad inicial del alien (casillas/s)
  ALIEN_PER_EVENT: 0.08,                   // aumento por cada encuentro resuelto
  CATCH: 0.55,                             // distancia a la que el alien te atrapa
  TRIGGER: 0.75,                           // distancia para iniciar un encuentro (al que está dentro del maíz, 1.6)
  IMPOSTORS: 2                             // cantidad de aliens disfrazados
};
const { W, H, COL } = CFG;
let FOG_D = 8;                                         // distancia a la que la noche se traga todo
const NCOLS = W / COL;

/* ============ Mapa del maizal (edítalo aquí) ============
 * Cada carácter es una casilla; todas las filas deben tener el mismo largo.
 *   #  maíz (muro)            .  camino
 *   o  maíz aplastado por el choque (el claro del inicio)
 *   P  inicio de Pepe         X  salida (allí está la luz verde)
 *   =  pasillo hacia las afueras (camino de tierra)
 *   F  maíz seco y bajo del borde: no se puede cruzar, pero se ve por encima (el cielo, el campo)
 *      Lo que hay fuera del mapa detrás de una F es campo abierto.
 * El camino correcto se calcula solo (de P a X): las señales del camino, las apariciones
 * y el resto se adaptan a lo que dibujes. Deja siempre un camino de P a X.
 */
const RAW = [
  "######################################",
  "#ooo#...........#.............########",
  "#ooo#.#########.###.#########.########",
  "#ooP#...............#.......#.########",
  "###.###.#####.#######.#####.#.########",
  "#.#...#.....#...#.....#...#.#.########",
  "#.###.#######.#.#####.#.#.#.#.########",
  "#...#...#...#.#.#.....#.#.#.#.########",
  "#.#.###.#.#.###.#.#.###.#.#.#.########",
  "#.#...#...#.....#.#.#...#.....########",
  "#.##.##.#.#######.###.#####.#.########",
  "#.#...#.........#...#.#...#.#.########",
  "#.#.#.#.###.#####.#.#.###.#.#.########",
  "#...#.....#.#.....#.#...#.#...########",
  "#######.###.#.#####.###.#.#.#.########",
  "#.......#...#.#...#...#...#.#.########",
  "#.#####.#.#.#.###.#.#####.#.##########",
  "#...#.....#.#.....#.......#...########",
  "###.#######.#####.#######.###.########",
  "#...#...#...#...#.#...#.......########",
  "#.###.#.#.#.#.#.#.#.#.#.#####.FFFFFFFF",
  "#.....#...#...#.........#####.======XF",
  "##############################FFFFFFFF"
];
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const COLS = RAW[0].length, ROWS = RAW.length;
const MAP = RAW.map(r => r.padEnd(COLS, "#"));
const isWall = (x, y) => x < 0 || y < 0 || x >= COLS || y >= ROWS || MAP[y][x] === "#" || MAP[y][x] === "F";
const LOW_F = 0.42;                                    // altura del maíz seco del borde (el muro normal mide 1)

function findTile(ch) {
  for (let y = 0; y < ROWS; y++) {
    const x = MAP[y].indexOf(ch);
    if (x !== -1) return { x, y };
  }
  return { x: 1, y: 1 };
}

function bfs(sx, sy, tx, ty) {
  const key = (x, y) => y * COLS + x;
  const prev = new Map([[key(sx, sy), null]]);
  const q = [[sx, sy]];
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h];
    if (x === tx && y === ty) break;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox, ny = y + oy;
      if (isWall(nx, ny) || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), [x, y]);
      q.push([nx, ny]);
    }
  }
  if (!prev.has(key(tx, ty))) return [];
  const path = [];
  for (let cur = [tx, ty]; cur; cur = prev.get(key(cur[0], cur[1]))) path.push(cur);
  return path.reverse();
}

/* ============ Historia y datos del viaje ============ */
/* ---------- Personajes: una sola ficha por persona, para los cuatro niveles ----------
 * name: como aparece en diálogos y subtítulos · color: su color al hablar
 * look: cómo se dibuja (personSprite) · bar: dónde está en el bar y desde qué distancia se le habla */
const CHARS = {
  paul:   { name: "Paul", color: "#5ec4b8", bar: { x: 2.2, y: 5.45, range: 1.2 },                 // de negro: un año de la muerte de su abuela
            look: { jacket: "#1e1e24", hair: "#141414", style: "cap", cap: "#26262c", shirt: "#121216", pants: "#141418", seated: true, skin: "#a8724e" } },
  samira: { name: "Samira", color: "#e07ab0", bar: { x: 6.0, y: 4.7, range: 1.1 },
            look: { jacket: "#c0508a", hair: "#2a1a12", style: "long", skin: "#c08a62", shirt: "#1a1a22" } },
  sebas:  { name: "Sebas", color: "#e8b84a", bar: { x: 3.05, y: 2.88, range: 1.1 },
            look: { jacket: "#d19a2a", hair: "#1a1a1a", style: "short", skin: "#b07a54", shirt: "#e8e2d0", partyHat: true } },
  stalin: { name: "Stalin", color: "#a98ae0", bar: { x: 5.4, y: 9.2, range: 1.2 },
            look: { jacket: "#8a5bc0", hair: "#2e1c12", style: "curly", skin: "#c48e66", ushanka: true } },
  lucho:  { name: "Don Lucho", color: "#d0705e", bar: { x: 1.5, y: 2.85, range: 1.2 },
            look: { jacket: "#3a3a3a", poncho: "#5e2420", style: "hat", seated: true, skin: "#a87a58", pants: "#2a2622" } },
  carmen: { name: "Doña Carmen", color: "#8aaed0", bar: { x: 2.5, y: 1.55, range: 1.6 },
            look: { jacket: "#3a4a5a", hair: "#2a2220", style: "bun", apron: true, skin: "#b8845e" } },
  radio:  { name: "Radio", color: "#7dff9a", icon: true },                    // su retrato es la radio de la barra
  pepe:   { name: "Tú", color: "#9fcaff",
            look: { jacket: "#4a6a9a", hair: "#2a1a12", style: "short", skin: "#c08a62", shirt: "#d8d2c0" } },
  doble:  { name: "El otro Pepe", color: "#9fcaff",                         // el nivel 4: tu misma cara
            look: { jacket: "#4a6a9a", hair: "#2a1a12", style: "short", skin: "#c08a62", shirt: "#d8d2c0" } },
  rafael: { name: "Rafael", color: "#d0705e",                               // el papá de Stalin: la cara que usa don Lucho
            look: { jacket: "#3a3a3a", poncho: "#5e2420", style: "hat", skin: "#a87a58", pants: "#2a2622" } }
};
const CHAR_BY_NAME = {};
for (const k in CHARS) { CHARS[k].key = k; CHAR_BY_NAME[CHARS[k].name] = CHARS[k]; }
const charOf = n => CHARS[n] || CHAR_BY_NAME[n] || (n && CHARS[n.toLowerCase()]) || null;   // "sebas", "Sebas" o "Don Lucho"
const charColor = (n, def) => { const c = charOf(n); return c ? c.color : def; };
const charSprite = n => { const c = charOf(n); return c ? BSPR[c.key] || null : null; };
const FRIENDS = ["Samira", "Sebas", "Stalin", "Paul"];
const NPC_R = 0.14;                                    // radio con el que una persona estorba el paso
// Alto en paredes de un sprite de persona (32x48, más el gorro): sentado se ve más bajo
const personH = img => (img.seated ? 0.56 : 0.72) * img.height / 48;
// Recorte de la cabeza para retratos e íconos
function headCrop(img) { const pad = img.height - 48; return { sx: 8, sy: 0, sw: 16, sh: 18 + pad }; }
function drawHead(g, img, x, bottom, w) {              // dibuja la cabeza con su base en (x, bottom)
  const c = headCrop(img), h = w * c.sh / c.sw;
  g.drawImage(img, c.sx, c.sy, c.sw, c.sh, x, bottom - h, w, h);
  return h;
}
// Retrato de quien habla en un cuadro de sz x sz: su cara, o su ícono (la radio, con estática). false si no tiene.
function drawPortrait(g, who, sz) {
  const c = charOf(who), img = charSprite(who);
  if (!c || !img || c.key === "pepe") return false;
  g.imageSmoothingEnabled = false; g.clearRect(0, 0, sz, sz);
  if (!c.icon) { drawHead(g, img, sz * 0.075, sz, sz * 0.85); return true; }
  const w = sz * 0.8, h = w * img.height / img.width;
  g.drawImage(img, (sz - w) / 2, (sz - h) / 2, w, h);
  for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(125,255,154,${(Math.random() * 0.6).toFixed(2)})`; g.fillRect(Math.random() * sz, Math.random() * sz, 1, 1); }
  return true;
}

const QUIRK_REAL = ["(Tiembla entero.)", "(Respira entrecortado, mirando a todos lados.)", "(Tiene sangre seca en la frente.)", "(Se tapa la boca para no gritar.)", ""];
const QUIRK_FAKE = ["(No parpadea.)", "(Sonríe un segundo tarde.)", "(Respira demasiado tranquilo.)", "(Ni una hoja en el pelo. Ni un rasguño.)", ""];

/* ============ Utilidades ============ */
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function makeCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

/* ============ Texturas y sprites (dibujados por código) ============ */
const TEX = 64;
function buildCorn() {
  const c = makeCanvas(TEX, TEX), g = c.getContext("2d");
  g.fillStyle = "#12261a"; g.fillRect(0, 0, TEX, TEX);
  const greens = ["#1c3a22", "#26492a", "#31602f", "#3f7536", "#2a5230"];
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(Math.random() * TEX), w = 3 + Math.floor(Math.random() * 4);
    g.fillStyle = greens[i % greens.length]; g.fillRect(x, 0, w, TEX);
    g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(x + w - 1, 0, 1, TEX);
  }
  for (let i = 0; i < 14; i++) {            // hojas cruzadas
    const x = Math.floor(Math.random() * TEX), y = Math.floor(Math.random() * TEX);
    g.fillStyle = greens[(i + 2) % greens.length];
    for (let k = 0; k < 12; k++) g.fillRect((x + k) % TEX, (y + (k >> 1)) % TEX, 3, 2);
  }
  for (let i = 0; i < 7; i++) {             // mazorcas doradas
    const x = Math.floor(Math.random() * (TEX - 4)), y = 8 + Math.floor(Math.random() * 44);
    g.fillStyle = "#b79a3a"; g.fillRect(x, y, 3, 8);
    g.fillStyle = "#d8bf5a"; g.fillRect(x + 1, y, 1, 6);
  }
  const sh = g.createLinearGradient(0, 0, 0, TEX);
  sh.addColorStop(0, "rgba(0,0,0,.35)"); sh.addColorStop(.25, "rgba(0,0,0,0)");
  sh.addColorStop(.8, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,.4)");
  g.fillStyle = sh; g.fillRect(0, 0, TEX, TEX);
  return c;
}

const PXRAD = W / CFG.FOV;                          // píxeles por radián del cielo
const SKYW = Math.round(Math.PI * 2 * PXRAD);
function sprite(painter) {
  const c = makeCanvas(32, 32), g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  painter(g);
  return c;
}
// El alien: pálido como hueso, cráneo alto y estrecho con pliegues en la frente, dos cuencas
// redondas y vacías (sin brillo, sin pupila) y la boca abierta en una "O" oscura, como si gritara
// sin sonido. Cuerpo consumido, brazos hasta las rodillas, dedos como agujas. Ladea la cabeza.
function buildAlien() {
  const w = 96, h = 170, c = makeCanvas(w, h), g = c.getContext("2d");
  const rnd = mulberry32(66);
  const limb = (pts, wd, col) => {
    g.strokeStyle = col; g.lineWidth = wd; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) g.lineTo(x, y); g.stroke();
  };
  const hole = (x, y, rx, ry, soft, rot = 0) => {       // un hueco: negro al centro, sombra que se abre hacia afuera
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, ry / rx);
    const hg = g.createRadialGradient(0, 0, 0, 0, 0, rx * soft);
    hg.addColorStop(0, "#000"); hg.addColorStop(1 / soft * 0.8, "rgba(0,0,0,.97)"); hg.addColorStop(1, "rgba(20,16,12,0)");
    g.fillStyle = hg; g.beginPath(); g.arc(0, 0, rx * soft, 0, 7); g.fill();
    g.restore();
  };
  g.fillStyle = "rgba(0,0,0,.6)"; g.beginPath(); g.ellipse(48, 165, 26, 4, 0, 0, 7); g.fill();
  // Piernas largas y flacas, rodillas huesudas, en sombra
  limb([[43, 106], [38, 133], [41, 160]], 5, "#3d3830"); limb([[54, 106], [59, 133], [56, 160]], 5, "#36312a");
  g.fillStyle = "#5c564b"; g.beginPath(); g.arc(38, 133, 3.4, 0, 7); g.arc(59, 133, 3.4, 0, 7); g.fill();
  for (const [x, s] of [[41, -1], [56, 1]]) for (let k = -1; k <= 1; k++) limb([[x, 160], [x + s * 4 + k * 4, 165]], 1.6, "#47423a");
  // Brazos colgando hasta las rodillas; dedos larguísimos con uñas negras
  limb([[34, 74], [25, 103], [22, 136]], 4.5, "#6e675b"); limb([[62, 74], [72, 103], [75, 136]], 4.5, "#575146");
  g.fillStyle = "#7d766a"; g.beginPath(); g.arc(25, 103, 2.8, 0, 7); g.arc(72, 103, 2.8, 0, 7); g.fill();
  for (const [hx, s] of [[22, -1], [75, 1]]) {
    for (const [dx, len] of [[-4, 20], [0, 24], [4, 18]]) {
      limb([[hx, 136], [hx + dx * 0.6 * s + dx, 136 + len * 0.6], [hx + dx * 1.2 + s * 2, 136 + len]], 1.6, "#8d8679");
      g.fillStyle = "#120f0c"; g.fillRect(hx + dx * 1.2 + s * 2 - 1, 136 + len - 1, 2, 3);
    }
  }
  // Torso consumido: hombros caídos, cintura de avispa, costillas
  const tg = g.createLinearGradient(0, 70, 0, 106);
  tg.addColorStop(0, "#a49d8f"); tg.addColorStop(1, "#3f3a32");
  g.fillStyle = tg; g.beginPath();
  g.moveTo(31, 72); g.quadraticCurveTo(48, 66, 65, 72); g.quadraticCurveTo(61, 88, 55, 106);
  g.lineTo(42, 106); g.quadraticCurveTo(35, 88, 31, 72); g.fill();
  g.strokeStyle = "rgba(30,24,18,.5)"; g.lineWidth = 1.2;
  for (const y of [79, 85, 91]) { g.beginPath(); g.moveTo(37, y); g.quadraticCurveTo(48, y + 4, 59, y); g.stroke(); }
  g.beginPath(); g.moveTo(48, 74); g.lineTo(48, 96); g.stroke();
  g.strokeStyle = "rgba(225,218,204,.35)"; g.beginPath(); g.moveTo(35, 73); g.quadraticCurveTo(42, 70, 47, 73); g.stroke();
  // Cuello largo de tendones
  g.fillStyle = "#857e71"; g.beginPath(); g.moveTo(44, 56); g.lineTo(52, 56); g.lineTo(54, 72); g.lineTo(42, 72); g.fill();
  g.strokeStyle = "rgba(35,28,22,.55)"; g.lineWidth = 1; g.beginPath(); g.moveTo(45, 60); g.lineTo(44, 71); g.moveTo(51, 60); g.lineTo(52, 71); g.stroke();

  // Cabeza ladeada: alta y estrecha
  g.save(); g.translate(48, 36); g.rotate(-0.09); g.translate(-48, -36);
  const head = () => {
    g.beginPath(); g.ellipse(48, 28, 24, 28, 0, Math.PI * 0.97, Math.PI * 2.03);
    g.quadraticCurveTo(73, 50, 57, 64); g.quadraticCurveTo(48, 70, 39, 64); g.quadraticCurveTo(23, 50, 24, 30); g.closePath();
  };
  const hg = g.createRadialGradient(40, 12, 3, 47, 32, 50);
  hg.addColorStop(0, "#e2dccd"); hg.addColorStop(0.45, "#a39c8e"); hg.addColorStop(1, "#3c372f");
  head(); g.fillStyle = hg; g.fill();
  g.save(); head(); g.clip();
  for (let k = 0; k < 800; k++) {                      // piel moteada, húmeda
    g.fillStyle = rnd() < 0.5 ? "rgba(40,30,22,.10)" : "rgba(245,238,225,.07)";
    g.fillRect(20 + rnd() * 56, rnd() * 70, 1 + rnd() * 2, 1);
  }
  for (const [y, x0, x1] of [[17, 30, 50], [21, 40, 64], [25, 31, 47], [24, 52, 66]]) {   // pliegues de la frente
    g.strokeStyle = "rgba(55,45,35,.45)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y); g.quadraticCurveTo((x0 + x1) / 2, y - 2.5, x1, y); g.stroke();
    g.strokeStyle = "rgba(240,232,218,.3)"; g.beginPath(); g.moveTo(x0 + 1, y - 1.2); g.quadraticCurveTo((x0 + x1) / 2, y - 3.7, x1 - 1, y - 1.2); g.stroke();
  }
  for (const [cx, cy] of [[33, 51], [63, 51]]) {       // mejillas hundidas
    const sg = g.createRadialGradient(cx, cy, 1, cx, cy, 11);
    sg.addColorStop(0, "rgba(25,18,12,.55)"); sg.addColorStop(1, "rgba(25,18,12,0)");
    g.fillStyle = sg; g.fillRect(cx - 11, cy - 11, 22, 22);
  }
  const bottom = g.createLinearGradient(0, 44, 0, 70);   // la luz viene de arriba: el mentón se hunde en sombra
  bottom.addColorStop(0, "rgba(14,10,8,0)"); bottom.addColorStop(1, "rgba(14,10,8,.5)");
  g.fillStyle = bottom; g.fillRect(0, 44, w, 30);
  g.restore();
  // Dos cuencas redondas, vacías y un poco desiguales
  hole(38, 37.5, 7.4, 4.3, 1.65, -0.16);
  hole(58.5, 36.8, 8.0, 4.7, 1.65, 0.16);
  // Nariz casi inexistente y la boca abierta en "O", larga y oscura
  g.fillStyle = "rgba(20,15,10,.7)"; g.fillRect(46, 47, 1.5, 2.5); g.fillRect(50, 47, 1.5, 2.5);
  hole(48, 57.5, 3.6, 6.4, 1.6);
  g.strokeStyle = "rgba(230,222,206,.35)"; g.lineWidth = 1; g.beginPath(); g.ellipse(48, 58.5, 4.6, 7.4, 0, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();   // labio inferior
  g.restore();
  // Todo el cuerpo se hunde en la oscuridad hacia abajo
  g.globalCompositeOperation = "source-atop";
  const dg = g.createLinearGradient(0, 84, 0, h);
  dg.addColorStop(0, "rgba(4,4,4,0)"); dg.addColorStop(1, "rgba(4,4,4,.6)");
  g.fillStyle = dg; g.fillRect(0, 84, w, h - 84);
  g.globalCompositeOperation = "source-over";
  return c;
}
const SPR = { alien: null };
function buildSprites() { SPR.alien = buildAlien(); }

/* ---------- Maizal: lo que hereda del bar y de la vía ---------- */
// El alien escuchó todo lo que se dijo cerca de don Lucho, pero nunca vio cómo es cada uno.
// Por eso los amigos reales están donde su forma de ser los deja, y el impostor rompe ese patrón.
const capName = k => k ? k[0].toUpperCase() + k.slice(1) : k;
function mzContext() {
  const R = BAR_RESULT || { secrets: {}, told: [], flags: {} };
  const C = (typeof CHASE_RESULT !== "undefined" && CHASE_RESULT) || {};   // chase.js se carga después
  const mended = C.mended != null ? !!C.mended : !!(R.flags && R.flags.paulMended);
  return { R, mended, wounded: C.wounded || (mended ? "Sebas" : "Paul"), copilot: capName(C.copilot || (mended ? "paul" : "stalin")) };
}

// Pregunta privada: solo existe si Pepe conoció ese secreto en el bar.
// El impostor la responde bien únicamente si don Lucho la escuchó.
const PRIVATE_Q = {
  paul:   { label: "¿A dónde te vas?", real: "A España. Ya lo sabes.", fake: "¿Irme? A ningún lado." },
  samira: { label: "¿Cuánto te debe Sebas?", real: "Cuatrocientos. No quiero hablar de eso.", fake: "¿Sebas? Nada." },
  sebas:  { label: "¿Con qué pagaste las empanadas?", real: "Con lo último que tenía.", fake: "Con mi sueldo, pues." },
  stalin: { label: "¿Cómo se llamaba tu papá?", real: "Rafael.", fake: "¿Qué tiene que ver mi papá?" }
};
function mzQuestions(e, cx) {
  const qs = [
    { id: "driver", label: "¿Quién manejaba?", truth: "Pepe", pool: ["Pepe", "Paul", "Stalin", "Sebas"],
      say: v => v === "Pepe" ? "Tú, Pepe." : v === e.name ? "Yo." : `${v}.` },
    { id: "copilot", label: "¿Quién iba adelante?", truth: cx.copilot, pool: FRIENDS,
      say: v => v === e.name ? "Yo, a tu lado." : `${v}.` },
    { id: "hurt", label: "¿Quién se lastimó?", truth: cx.wounded, pool: FRIENDS,
      say: v => v === e.name ? "Yo. ¿No me ves?" : `${v}.` }
  ];
  const k = e.name.toLowerCase(), sec = cx.R.secrets && cx.R.secrets[k];
  if (sec) qs.push({ id: "secret", private: true, overheard: !!sec.overheard, ...PRIVATE_Q[k] });
  return qs;
}

// Cómo habla cada uno, sea real o impostor: el alien copia la voz y también las mañas. Así el tono no delata a nadie.
//   Sebas duda de todo · Samira se defiende de todo · Stalin habla de ellos, de las luces, de su papá
//   Paul está borracho y resentido: le echa en cara a Pepe el funeral y se le cruzan los nombres
const TONE = {
  Sebas:  { pre: ["C-creo que… ", "Eh… no sé… ", "Espera, espera… ", "No estoy seguro, pero… ", "¿N-no era…? "],
            post: ["… ¿no?", "… creo.", "… o eso me pareció.", "… ¿o no? Ya no sé nada.", "… no me hagas caso."] },
  Samira: { pre: ["¿Por qué me preguntas eso a mí? ", "¿Me estás acusando? ", "Ya te dije. ", "¿Ahora me vas a interrogar? ", ""],
            post: [" ¿Contento?", " Deja de mirarme así.", " ¿Ahora sospechas de mí?", " Pregúntale a otro.", ""] },
  Stalin: { pre: ["…Se movían en triángulo, ¿viste? ", "Mi papá decía que no vienen del cielo. ", "…Las estrellas se apagaron un segundo. ", "¿No oyes ese zumbido? ", ""],
            post: [" Ellos ya sabían que veníamos.", " Es como una frecuencia.", " Nunca estuvimos solos aquí.", " Mi papá vio lo mismo.", ""] },
  Paul:   { pre: ["Ah, ¿ahora sí te importa lo que yo diga? ", "¡¿Ahora me preguntas eso?! ", "Como si te importara… ", "…Hic. ", ""],
            post: [" Como en el funeral: tú decides y te vas.", " ¿Contento?", " Igual nunca me escuchas.", "… hic.", ""] }
};
// Paul borracho: a veces se le cruza un nombre antes de dar su respuesta. Cuenta la última palabra, no el tropiezo.
function mzStumble(name, q, line) {
  if (name !== "Paul" || !q.pool || Math.random() > 0.4) return line;
  const cands = q.pool.filter(x => x !== q.truth && x !== "Pepe" && x !== name && !line.includes(x));
  if (!cands.length) return line;
  const start = /^(Yo|Tú)\b/.test(line) ? line.charAt(0).toLowerCase() + line.slice(1) : line;   // los nombres siguen en mayúscula
  return `${pick(cands)}… no, no, espera… ${start}`;
}
function mzTone(name, line) {
  const t = TONE[name]; if (!t) return line;
  const post = pick(t.post);
  return pick(t.pre) + (post.startsWith("…") ? line.replace(/[.]$/, "") : line) + post;
}
// Cómo saluda cada uno. El impostor copia la voz, no el carácter: y siempre te empuja hacia la luz,
// porque eso es lo que esa cosa quiere. El Stalin real también va hacia la luz, pero solo, y no quiere que lo sigan.
function mzOpener(e, cx) {
  if (e.rejoin) return e.name === "Sebas" ? "¡Perdón, perdón! Lo vi detrás de ti y… no pude. No me sueltes, ñaño." : "Perdón… entré en pánico. Tenía tu cara, Pepe. Tu cara.";
  if (e.impostor) return {                               // copian las mañas, pero siempre te empujan hacia la luz
    Sebas: "¿P-Pepe? Creo que… creo que todos están en la luz, ¿no? Deberíamos ir… ¿no?",
    Samira: "¿Qué me miras? ¿Crees que soy esa cosa? …Ya. Vamos a la luz y se acaba esto.",
    Paul: cx.mended ? "Ya, ya… Sebas está bien… hic… lo dejé allá atrás. Vamos a la luz, ¿ya?" : "Ya te perdoné, ñaño… hic… lo del funeral, todo. Todo bien. Vamos a la luz.",
    Stalin: "Ellos no hacen daño, Pepe. Mi papá está con ellos, en la luz. Ven conmigo."
  }[e.name];
  return {
    Sebas: e.pose === "sit" ? "N-no siento el pie… creo que está roto… ¿o no? No sé. Jaja… ay. No me dejes aquí, ¿ya?" : "¡Pepe! ¿Eres tú? C-creo que lo vi… ¿o fue mi sombra? Jaja… ya no sé qué vi.",
    Samira: "¡No me mires así! Yo no hice nada. …Pasó por aquí. Tenía la cara de Paul. ¿Me crees o también sospechas de mí?",
    Paul: cx.mended ? (e.pose === "sit" ? "¡Ayúdame! Sebas no puede caminar y esa cosa anda cerca… ¿o eran dos? Ya ni veo bien." : "¡Pepe! ¿Has visto a Sebas? Lo escuché gritar y… ¿y tú dónde estabas, ah? Como siempre.") : "¿Vienes a dejarme ti-tirado otra vez? Como en el funeral… hic. …No. Espera. No te vayas.",
    Stalin: cx.R.secrets && cx.R.secrets.stalin ? "No me sigas, Pepe. Es la misma luz de hace quince años. Volvieron… vinieron por mí." : "No me sigas… se mueven en triángulo, como en los videos de mi papá. Saben mi nombre, Pepe."
  }[e.name];
}

// Lo que opina el último amigo que se unió a ti, con lo que sabe de cada uno.
function mzOpinion(c, e, cx) {
  if (c === e.name) return c === "Samira" ? "Pepe… esa soy yo. Yo estoy aquí." : "Pepe… ese soy yo. Yo estoy aquí contigo.";
  const t = e.name, fake = e.impostor;
  if (c === "Samira" || (c === "Paul" && cx.mended)) {                       // los que se fijan
    const said = {
      Samira: {
        Sebas:  fake ? (cx.mended ? "Sebas tenía el tobillo destrozado. ¿Cómo… cómo está de pie?" : "Sebas no se calla ni dormido. Esto no me gusta, Pepe.")
                     : (e.pose === "sit" ? "Se ríe del dolor… ese es Sebas." : "Esa risa nerviosa… es Sebas. Creo. Ya no sé."),
        Paul:   fake ? (cx.mended ? "Paul no dejaría a Sebas solo por nada. ¿Dónde está Sebas?" : "Paul salió volando por el vidrio. ¿Y no tiene ni un rasguño?")
                     : (cx.mended ? "Está buscando a Sebas. Así es Paul." : "Ni herido pide ayuda. Es Paul."),
        Stalin: fake ? "En la camioneta quería ir solo a la luz. ¿Y ahora nos invita? No, no, no." : "Va hacia la luz y no quiere que lo sigamos… es él."
      },
      Paul: {
        Sebas:  fake ? (cx.mended ? "Mira cómo está parado. Sebas no puede ni apoyar el pie." : "Sebas no se queda callado ni en un velorio.")
                     : "Es Sebas. Solo él hace chistes en un momento así.",
        Samira: fake ? "¿Samira gritando? Ella susurra hasta cuando pelea." : "Samira se esconde cuando tiene miedo. Es ella.",
        Stalin: fake ? "Stalin no quería que nadie lo siguiera a esa luz. Este nos está llamando." : "Es Stalin. Lleva toda la noche mirando esa luz."
      }
    };
    const op = said[c][t] || "No sé. Pregúntale algo que solo él sepa.";
    return c === "Samira" ? pick(["No me culpes si me equivoco, pero… ", "No me mires a mí, pero… ", ""]) + op : op;
  }
  if (c === "Sebas") return `¿Es ${t === "Samira" ? "ella" : "él"}? C-creo que sí… o no… ¡no sé, Pepe, no me hagas decidir a mí!`;   // no se atreve a decidir
  if (c === "Paul") return pick(["No me preguntes a mí… hic… tú eres el que decide a quién dejar tirado.", "¿Ahora quieres mi opinión? Ni veo bien, Pepe. Decide tú, como siempre."]);
  return "Ellos copian lo que más quieres, Pepe. Así se llevaron a mi papá. Ya no sé qué es real.";       // Stalin
}

// Lo que gana Pepe con cada uno. Se dice una vez, corto.
function mzSaveText(e, cx) {
  if (e.rejoin) return `${e.name} vuelve contigo, avergonzado.`;
  return {
    Samira: "Samira se une. Recuerda por dónde vino: marca un tramo del camino.",
    Sebas: "Sebas se une. Vio a alguien cerca de aquí y te lo marca en el mapa: ve a buscarlo. Pero Sebas solo vio una cara… y se desespera rápido.",
    Paul: "Paul se une. Si esa cosa te alcanza, se le lanza encima.",
    Stalin: "Stalin se une. Siente dónde está esa cosa: la ves en tu mapa."
  }[e.name];
}
function mzGivePerk(name, on) {
  const P = G.perk;
  if (name === "Samira" && on) revealAhead(20);
  if (name === "Sebas" && on && !P.spotUsed) { P.spotUsed = true; mzSebasSpot(G.cur ? { x: G.cur.bx, y: G.cur.by } : { x: G.px, y: G.py }); }   // una sola vez
  if (name === "Paul") P.shield = on ? 1 : 0;
  if (name === "Stalin") P.stalin = on;
}
function mzDiaryLines() {
  const cx = (G && G.cx) || mzContext(), L = [{ h: "Lo que sabes" }];
  L.push(`• Tú manejabas la Azulita. ${cx.copilot} iba de copiloto.`);
  L.push(`• ${cx.wounded} salió peor herido del choque.`);
  for (const k of Object.keys(cx.R.secrets || {})) L.push("• " + SECRET_TXT[k] + (cx.R.secrets[k].overheard ? " (Don Lucho lo escuchó.)" : ""));
  L.push({ sub: "Cómo es cada uno" });
  L.push("• Sebas habla solo y se ríe cuando tiene miedo.", "• Samira no grita: se esconde y observa.", "• Paul nunca deja solo a un herido.", "• Stalin va hacia la luz, solo, y no quiere que lo sigan.");
  L.push("• Esa cosa quiere que vayas a la luz.");
  L.push({ note: "Lo que no encaja no es tu amigo. Cada pregunta le da tiempo al alien. [J] cerrar" });
  return L;
}

// Señales discretas del camino: cosas que alguien dejó tiradas en el maizal
const GUIDE_H = { stones: 0.15, fence: 0.2, sign: 0.4, sack: 0.22, tire: 0.17 };
function guideSprites() {
  const stones = makeSprite(24, 10, R => {
    R("rgba(0,0,0,.4)", 1, 8, 22, 2);
    R("#55534c", 2, 4, 7, 5); R("#6b6960", 3, 4, 4, 2); R("#4a4842", 10, 5, 6, 4); R("#626058", 11, 5, 3, 1);
    R("#5c5a52", 16, 2, 6, 7); R("#75736a", 17, 2, 3, 2); R("#3e3c37", 8, 7, 3, 2);
  });
  const fence = makeSprite(34, 12, R => {                // tramo de valla caído, con un poste roto
    R("rgba(0,0,0,.4)", 0, 10, 34, 2);
    R("#4e3c28", 0, 6, 30, 3); R("#64503a", 0, 6, 30, 1); R("#4a3a26", 6, 8, 26, 2);
    R("#3a2c1c", 4, 3, 3, 8); R("#3a2c1c", 22, 4, 3, 7); R("#2a2014", 23, 3, 1, 1);
    R("#5a4630", 28, 2, 6, 2);
  });
  const sign = (() => {                                  // letrero torcido, borrado por la lluvia
    const c = makeCanvas(28, 26), g = c.getContext("2d");
    g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(2, 23, 24, 3);
    g.translate(12, 25); g.rotate(0.55);
    g.fillStyle = "#3a2c1c"; g.fillRect(-1.5, -22, 3, 22);
    g.fillStyle = "#5e4c32"; g.fillRect(-9, -24, 18, 10); g.fillStyle = "#4a3a26"; g.fillRect(-9, -16, 18, 2);
    g.fillStyle = "rgba(200,190,160,.25)"; g.fillRect(-6, -22, 7, 1); g.fillRect(2, -21, 4, 1); g.fillRect(-5, -19, 9, 1);
    return c;
  })();
  const sack = makeSprite(18, 12, R => {                 // costal de maíz abierto
    R("rgba(0,0,0,.4)", 1, 10, 16, 2);
    R("#7a6c48", 2, 3, 13, 8); R("#93845a", 3, 3, 6, 2); R("#5e5236", 12, 4, 3, 7); R("#544830", 7, 1, 4, 3);
    R("#b8983a", 15, 9, 1, 1); R("#b8983a", 16, 10, 1, 1); R("#a88a34", 14, 10, 1, 1);
  });
  const tire = (() => {                                  // llanta vieja medio enterrada
    const c = makeCanvas(22, 10), g = c.getContext("2d");
    g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(1, 8, 20, 2);
    g.fillStyle = "#18181a"; g.beginPath(); g.ellipse(11, 6, 10, 4, 0, 0, 7); g.fill();
    g.fillStyle = "#2a2622"; g.beginPath(); g.ellipse(11, 6, 5, 2, 0, 0, 7); g.fill();
    g.fillStyle = "#26262a"; g.fillRect(3, 4, 4, 1);
    return c;
  })();
  return { stones, fence, sign, sack, tire };
}

/* ---------- Maizal: arte de la escena del choque ---------- */
let MZ = null;
function mzSprites() {
  if (MZ) return MZ;
  if (!BSPR.paul || typeof truckSprite !== "function") return null;
  MZ = {
    ufo: [0, 1, 2].map(mzUfoSprite), truck: mzTruckSprite(), tank: mzTankSprite(),
    ...guideSprites(), clump: mzClumpSprite(), scarecrow: scarecrowSprite(), roadsign: roadSignSprite(),
    fly: makeSprite(3, 3, R => { R("#f4ff9a", 1, 0, 1, 3); R("#f4ff9a", 0, 1, 3, 1); R("#ffffff", 1, 1, 1, 1); }), samiraSit: personSprite({ ...CHARS.samira.look, seated: true }),
    paulStand: personSprite({ ...CHARS.paul.look, seated: false }), sebasSit: personSprite({ ...CHARS.sebas.look, seated: true }),
    pepe: BSPR.pepe
  };
  return MZ;
}
function mzImg(e) {
  const M = mzSprites();
  if (!M) return null;
  let img = charSprite(e.name);
  if (e.name === "Paul") img = e.pose === "sit" ? BSPR.paul : M.paulStand;
  else if (e.pose === "sit") img = e.name === "Sebas" ? M.sebasSit : e.name === "Samira" ? M.samiraSit : img;
  return e.mercy ? bloodied(img) : img;
}
function bloodied(img) {                                // el que alcanzó el alien
  if (img._blood) return img._blood;
  const c = makeCanvas(img.width, img.height), g = c.getContext("2d"), pad = img.height - 48;
  c.seated = img.seated;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = "rgba(110,8,10,.85)";
  for (const [x, y, w, h] of [[12, 22, 6, 7], [16, 26, 5, 6], [10, 30, 4, 3], [19, 21, 3, 4], [13, 12, 2, 2]]) g.fillRect(x, y + pad, w, h);
  return (img._blood = c);
}
function scarecrowSprite() {                            // espantapájaros a la entrada del pasillo
  return makeSprite(26, 46, R => {
    R("rgba(0,0,0,.45)", 7, 44, 12, 2);
    R("#3a2c1a", 12, 10, 2, 35); R("#3a2c1a", 2, 16, 22, 2);                 // cruz de palos
    R("#4a3e2c", 6, 15, 14, 14); R("#3a3022", 6, 22, 14, 2); R("#5a4c36", 7, 15, 4, 12);  // camisa vieja
    R("#4a3e2c", 2, 15, 5, 5); R("#4a3e2c", 19, 15, 5, 5);
    R("#b89a4a", 1, 19, 2, 3); R("#b89a4a", 23, 19, 2, 3); R("#b89a4a", 8, 29, 2, 4); R("#b89a4a", 15, 29, 2, 3);   // paja
    R("#8a7a5a", 9, 6, 8, 9); R("#6e6046", 9, 13, 8, 2);                     // cabeza de costal
    R("#1a1410", 10, 8, 2, 2); R("#1a1410", 14, 8, 2, 2); R("#1a1410", 10, 12, 6, 1);   // ojos cosidos, boca
    R("#4a3a20", 6, 4, 14, 2); R("#5a4826", 9, 1, 8, 4);                     // sombrero de paja
  });
}
function roadSignSprite() {                             // letrero de la vía, torcido
  const c = makeCanvas(34, 36), g = c.getContext("2d");
  g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(10, 33, 14, 3);
  g.translate(17, 35); g.rotate(-0.12);
  g.fillStyle = "#4a4a4e"; g.fillRect(-1.5, -30, 3, 30);
  g.fillStyle = "#e8e2c8"; g.fillRect(-15, -34, 30, 13); g.fillStyle = "#2a5a2a"; g.fillRect(-14, -33, 28, 11);
  g.fillStyle = "#e8e2c8"; g.font = "bold 7px monospace"; g.textBaseline = "top"; g.fillText("BAÑOS", -12, -32);
  g.fillText("→", 7, -32);
  g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(-14, -27, 10, 2);
  return c;
}
function mzClumpSprite() {                              // mata de maíz con la misma textura de los muros
  const w = 26, h = 52, c = makeCanvas(w, h), g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.fillStyle = "#fff";
  g.fillRect(4, 16, 18, h - 16);
  for (let k = 0; k < 7; k++) { const x = 3 + k * 3.3; g.beginPath(); g.moveTo(x - 2.5, h); g.lineTo(x + (k % 2 ? 2 : -2), 1 + (k * 7) % 10); g.lineTo(x + 2.5, h); g.fill(); }
  for (const [x0, y0, x1, y1] of [[4, 22, -2, 12], [22, 18, 28, 8], [5, 34, -3, 28], [21, 30, 28, 24]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x0, y0 + 5); g.fill(); }
  g.globalCompositeOperation = "source-in";
  g.drawImage(cornTex, 0, 0, 26, 64, 0, 0, w, h);
  return c;
}
// La nave clavada en la tierra, en llamas. El lienzo termina en la línea del suelo: lo que queda debajo
// está enterrado. La sombra y la tierra quemada se pintan en el suelo de verdad (ver MZ_WORLD.pixel).
function mzUfoSprite(f) {
  const c = makeCanvas(80, 42), g = c.getContext("2d");
  g.save(); g.translate(40, 30); g.rotate(-0.32);
  const b = g.createLinearGradient(0, -7, 0, 7);
  b.addColorStop(0, "#b8c2ca"); b.addColorStop(0.5, "#5a646c"); b.addColorStop(1, "#22282c");
  g.fillStyle = "rgba(150,230,170,.75)"; g.beginPath(); g.ellipse(0, -5, 12, 10, 0, Math.PI, 0); g.fill();      // cúpula
  g.fillStyle = "#050806"; g.beginPath(); g.ellipse(-4, -7, 5, 4, 0, 0, 7); g.fill();                            // escotilla abierta
  g.fillStyle = b; g.beginPath(); g.ellipse(0, 0, 34, 7, 0, 0, 7); g.fill();
  g.fillStyle = "#14181b"; g.beginPath(); g.ellipse(0, 3, 20, 3, 0, 0, Math.PI); g.fill();
  g.fillStyle = "#0c0e10"; g.fillRect(8, -2, 12, 2); g.fillRect(-22, 1, 6, 2);                                  // abolladuras
  for (let k = 0; k < 5; k++) { g.fillStyle = k === f ? "#7dff9a" : "#3a4a40"; g.fillRect(-26 + k * 13, 2, 3, 2); }
  g.restore();
  for (let k = 0; k < 7; k++) {                                 // llamas verdes
    const x = 12 + k * 9 + ((f * 5 + k * 3) % 4), h = 9 + ((k * 7 + f * 5) % 10);
    g.fillStyle = "rgba(110,255,140,.85)"; g.beginPath(); g.moveTo(x - 4, 42); g.lineTo(x + ((f + k) % 3) - 1, 42 - h); g.lineTo(x + 4, 42); g.fill();
    g.fillStyle = "#e8ffd8"; g.beginPath(); g.moveTo(x - 2, 42); g.lineTo(x, 42 - h * 0.5); g.lineTo(x + 2, 42); g.fill();
  }
  return c;
}
function mzTruckSprite() {                                      // la Azulita volcada, con las ruedas al aire
  if (!TRUCK) TRUCK = truckSprite();
  const c = makeCanvas(52, 26), g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.save(); g.translate(2, 24); g.scale(1, -1); g.drawImage(TRUCK, 0, 0, 48, 19, 0, 0, 48, 19); g.restore();
  for (const x of [17, 39]) { g.fillStyle = "#0c0c10"; g.beginPath(); g.arc(x, 7, 4, 0, 7); g.fill(); g.fillStyle = "#6a6a70"; g.fillRect(x - 1, 6, 2, 2); }
  g.globalCompositeOperation = "source-atop"; g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(2, 5, 48, 19); g.globalCompositeOperation = "source-over";
  g.strokeStyle = "rgba(200,220,230,.7)"; g.lineWidth = 1;                                                        // vidrios rotos
  g.beginPath(); g.moveTo(28, 16); g.lineTo(33, 19); g.moveTo(30, 15); g.lineTo(27, 19); g.moveTo(31, 17); g.lineTo(35, 15); g.stroke();
  g.fillStyle = "#0a0a0c"; g.fillRect(44, 13, 4, 3);
  return trimBottom(c);
}
// Recorta las filas transparentes de abajo para que el objeto toque el suelo; hScale corrige su alto en el mundo
function trimBottom(c) {
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let y = c.height;
  rows: while (y > 1) { for (let x = 0; x < c.width; x++) if (d[((y - 1) * c.width + x) * 4 + 3] > 40) break rows; y--; }
  if (y === c.height) return c;
  const o = makeCanvas(c.width, y); o.getContext("2d").drawImage(c, 0, 0);
  o.hScale = y / c.height;
  return o;
}
function mzTankSprite() {                                       // tanque de agua oxidado, sobre patas
  return makeSprite(24, 42, R => {
    R("rgba(0,0,0,.45)", 1, 40, 22, 2);
    R("#2a2620", 3, 20, 2, 21); R("#2a2620", 19, 20, 2, 21); R("#1e1a16", 11, 22, 2, 19);
    R("#24201c", 4, 30, 16, 1);
    R("#5a5a52", 1, 4, 22, 17); R("#6e6e64", 2, 4, 3, 17); R("#3e3e38", 20, 4, 3, 17);
    R("#4a4038", 1, 8, 22, 2); R("#4a4038", 1, 15, 22, 2);
    R("#6a4024", 7, 11, 3, 3); R("#6a4024", 15, 6, 2, 5); R("#5a3420", 12, 17, 4, 3);
    R("#3a3a34", 4, 1, 16, 3); R("#2a2a26", 10, 0, 4, 1);
  });
}
// La risa nerviosa de Sebas entre el maíz
function nervousLaugh() {
  if (!AC) return;
  try { for (let i = 0; i < 4; i++) sndTone("triangle", 330 - i * 25, 240 - i * 20, AC.currentTime + i * 0.13, 0.11, 0.05, SND.sfx, 0.02); } catch (e) { /* sin audio */ }
}

/* ============ Estado del juego ============ */
// Casilla de maíz al costado (perpendicular a la dirección de llegada), para esconderse
function wallSideOf(x, y, fx, fy) {
  const c = [[-fy, fx], [fy, -fx], [fx, fy], [-fx, -fy]].filter(([dx, dy]) => (dx || dy) && isWall(x + dx, y + dy));
  return c[0] || null;
}
// Cómo aparece cada uno. El real sigue su forma de ser; el impostor la rompe.
function mzSpec(name, impostor, cx) {
  if (impostor) return {
    Stalin: { mode: "middle", pose: "stand", bark: { text: "«Pepe… ellos nos esperan en la luz. Mi papá también.»", r: 6 }, far: true },
    Samira: { mode: "middle", pose: "stand", bark: { text: "«¡No te acerques así! …¿Pepe? ¿Eres tú?»", r: 7 } },
    Sebas:  { mode: "middle", pose: "stand", bark: { text: "«¿Hay alguien…? Creo que… ¿Pepe? ¿O no?»", r: 5 } },
    Paul:   { mode: "peek", pose: "stand", bark: { text: "«¡Pepe! Estoy bien… hic… todo bien, ñaño.»", r: 6 } }
  }[name];
  return {
    Stalin: { mode: "middle", pose: "stand", bark: { text: "«¿Papá…? ¿Son ellos? ¿Volvieron? Contéstame…»", r: 6 }, near: true },     // solo cerca de la luz
    Samira: { mode: "hidden", pose: "stand", bark: { text: "(Entre el maíz, alguien llora en silencio.)", r: 2.6 } },
    Sebas:  cx.mended ? { mode: "middle", pose: "sit", bark: { text: "«Ay… creo que me rompí algo… ¿o no? Jaja… me duele.»", r: 5 } }
                      : { mode: "peek", pose: "stand", bark: { text: "«Es un dron… creo… ¿es un dron? Sí… no… no sé…»", r: 7, rep: 7, laugh: true } },
    Paul:   cx.mended ? { mode: "middle", pose: "stand", bark: { text: "«¡Sebas! ¡Sebaaas! …¿Dónde estás, ñaño? Hic…»", r: 6 } }
                      : { mode: "middle", pose: "sit", bark: { text: "«Claro… nadie viene. Como al funeral… hic.»", r: 5 } }
  }[name];
}
function newGameState(state) {
  const start = findTile("P"), exit = findTile("X");
  const path = bfs(start.x, start.y, exit.x, exit.y), n = path.length;
  if (state !== "menu" && !BTEX.B) buildBarAssets();
  const cx = mzContext();
  FOG_D = 8;
  const props = [
    { img: "ufo", x: 1.75, y: 1.75, h: 1.37, r: 0.8, glow: true, shadow: [1.5, 1.1, 0.85] },   // sombra: radios y qué tan oscura
    { img: "truck", x: 3.05, y: 1.45, h: 0.9, r: 0.55, shadow: [0.85, 0.6, 0.75] }
  ];
  // Señales discretas en el camino correcto: en cada cruce y en las curvas (cada pocas casillas)
  const GUIDES = ["stones", "fence", "sign", "sack", "tire"];
  for (let i = 1, k = 0, last = -99; i < n - 2; i++) {
    const [x, y] = path[i], [px, py] = path[i - 1], [nx, ny] = path[i + 1];
    if (MAP[y][x] === "o") continue;
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => !isWall(x + dx, y + dy)).length;
    const turn = x - px !== nx - x || y - py !== ny - y;
    if (!(open >= 3 || (turn && i - last >= 5))) continue;
    const fx = nx - x, fy = ny - y, side = (k % 2 ? 1 : -1) * 0.27, img = GUIDES[(k * 3 + i) % GUIDES.length];
    props.push({ img, x: nx + 0.5 - fx * 0.2 - fy * side, y: ny + 0.5 - fy * 0.2 + fx * side, h: GUIDE_H[img], r: 0, guide: true });
    last = i; k++;
  }

  // El borde del maizal: un espantapájaros donde empieza el pasillo de salida, el letrero de la vía junto
  // a la salida y luciérnagas sobre el maíz seco
  const corr = path.filter(([x, y]) => MAP[y][x] === "=" || MAP[y][x] === "X"), flies = [];
  if (corr.length >= 2) {
    const [x0, y0] = corr[0], fx = corr[1][0] - x0, fy = corr[1][1] - y0, [xe, ye] = corr[corr.length - 1];
    props.push({ img: "scarecrow", x: x0 + 0.5 + -fy * 0.3, y: y0 + 0.5 + fx * 0.3, h: 1.15, r: 0.15 });
    props.push({ img: "roadsign", x: xe + 0.5 - fx * 0.3 + fy * 0.32, y: ye + 0.5 - fy * 0.3 - fx * 0.32, h: 0.75, r: 0 });
    for (let k = 0; k < 14; k++) { const [cx2, cy2] = corr[k % corr.length]; flies.push({ x: cx2 + 0.5 + rand(-0.6, 0.6), y: cy2 + 0.5 + rand(-0.6, 0.6), ph: rand(0, 6) }); }
  }
  // Quién huye y quién aparece herido por el alien: nunca el mismo
  const runner = cx.mended ? "Samira" : "Sebas";
  const mercy = pick(FRIENDS.filter(f => f !== runner && f !== "Stalin"));
  // La fila de apariciones, en orden aleatorio. El primero siempre es un amigo real que pide ayuda,
  // y nunca salen dos impostores seguidos.
  let queue = shuffle([
    ...FRIENDS.map(name => ({ name, impostor: false, mercy: name === mercy })),
    ...shuffle(FRIENDS).slice(0, CFG.IMPOSTORS).map(name => ({ name, impostor: true }))
  ]);
  const firstOk = q => !q.impostor && !q.mercy && q.name !== "Stalin";
  const f0 = queue.findIndex(firstOk); queue.unshift(queue.splice(f0, 1)[0]);
  for (let i = 1; i < queue.length; i++) if (queue[i].impostor && queue[i - 1].impostor) {
    const j = queue.findIndex((q, k) => k > i && !q.impostor); if (j > 0) [queue[i], queue[j]] = [queue[j], queue[i]];
  }

  const look = path[Math.min(2, n - 1)];
  return {
    state, t: 0, bob: 0,
    px: start.x + 0.5, py: start.y + 0.5, pitch: 0,
    ang: Math.atan2(look[1] - start.y, look[0] - start.x),   // de espaldas a la nave y a la camioneta
    ...(() => { const k = path.findIndex(([x, y]) => MAP[y][x] === "=" || MAP[y][x] === "X"), c = path[Math.max(0, k - 1)];   // la esquina opuesta, a la entrada del pasillo
      return { ax: c[0] + 0.5, ay: c[1] + 0.5 }; })(),                // ahí empieza el alien, buscándote
    exit: { x: exit.x + 0.5, y: exit.y + 0.5 },
    enc: [], queue, spawnCD: 4, moved: 0, lastCell: start.y * COLS + start.x,
    props, flies, cx, path, party: [], lost: [], perk: {}, alienBoost: 0, runner,
    talkLog: [], talkOpts: [], cur: null, shot: null, talkT: null, flee: null, resolved: 0, saved: 0,
    seen: Array.from({ length: ROWS }, () => Array(COLS).fill(false)),
    showMap: true, beat: 0, toastT: 0
  };
}

/* ---------- Apariciones: adelante, hacia donde vas, y no demasiado seguido ---------- */
function lineOfSight(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 0.2);
  for (let i = 1; i < n; i++) if (isWall(Math.floor(x0 + (x1 - x0) * i / n), Math.floor(y0 + (y1 - y0) * i / n))) return false;
  return true;
}
// Casillas del pasillo que el jugador tiene enfrente, siguiéndolo hasta el próximo cruce (máx. 9 pasos):
// por ahí va a pasar sí o sí. Se prefieren las que están fuera de su vista (tras una curva o en la niebla).
function spawnCandidates() {
  let x = Math.floor(G.px), y = Math.floor(G.py);
  const vx = Math.cos(G.ang), vy = Math.sin(G.ang), D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const opts = D4.filter(([dx, dy]) => !isWall(x + dx, y + dy)).map(dd => ({ dd, dot: dd[0] * vx + dd[1] * vy })).sort((a, b) => b.dot - a.dot);
  if (!opts.length || opts[0].dot < 0.3) return [];
  let f = opts[0].dd;
  const out = [];
  for (let d = 1; d <= 9; d++) {
    x += f[0]; y += f[1];
    if (MAP[y][x] !== "o" && d >= 2) out.push({ x, y, f, d, seen: lineOfSight(G.px, G.py, x + 0.5, y + 0.5) && Math.hypot(x + 0.5 - G.px, y + 0.5 - G.py) < 5 });
    const nexts = D4.filter(([dx, dy]) => !(dx === -f[0] && dy === -f[1]) && !isWall(x + dx, y + dy));
    if (nexts.length !== 1) break;                 // cruce o callejón: hasta aquí es seguro que pasará
    f = nexts[0];
  }
  return out.sort((a, b) => (a.seen - b.seen) || (Math.abs(a.d - 5) - Math.abs(b.d - 5)));
}
function mzSpawn(spec, custom) {
  const s = mzSpec(spec.name, spec.impostor, G.cx);
  const mode = spec.mercy || spec.rejoin ? "middle" : s.mode, pose = spec.mercy ? "sit" : s.pose;
  const cands = custom || spawnCandidates();
  if (!cands.length) return false;
  const pickC = test => cands.find(c => !c.seen && test(c)) || cands.find(test);
  const mk = (c, extra) => {
    const e = { name: spec.name, impostor: spec.impostor, mercy: !!spec.mercy, rejoin: !!spec.rejoin, bx: c.x + 0.5, by: c.y + 0.5, x: c.x + 0.5, y: c.y + 0.5,
      pose, mode: "middle", beacon: !!spec.rejoin,
      bark: spec.mercy ? { text: "(Alguien respira con dificultad. Hay sangre en las hojas.)", r: 4 } : spec.rejoin ? { text: "«¡Pepe! ¡Pepe, aquí! ¡Perdón!»", r: 12, rep: 6 } : s.bark,
      peek: 0, tilt: 0, done: false, asked: new Set(), ...extra };
    e.wrong = new Set(e.impostor ? shuffle(["driver", "copilot", "hurt"]).slice(0, Math.random() < 0.5 ? 1 : 2) : []);
    e.qs = mzQuestions(e, G.cx);
    G.enc.push(e);
    return e;
  };
  if (mode === "peek") {                         // en el maíz de enfrente, en una curva
    const c = pickC(c => isWall(c.x + c.f[0], c.y + c.f[1]) && [[-c.f[1], c.f[0]], [c.f[1], -c.f[0]]].some(([lx, ly]) => !isWall(c.x + lx, c.y + ly)));
    if (c) {
      const [fx, fy] = c.f, L = [[-fy, fx], [fy, -fx]].find(([lx, ly]) => !isWall(c.x + lx, c.y + ly));
      const e = mk(c, { mode: "peek", L });
      e.x = e.sx = c.x + 0.5 + fx * 0.36 - L[0] * 0.1; e.y = e.sy = c.y + 0.5 + fy * 0.36 - L[1] * 0.1;
      G.props.push({ img: "clump", x: c.x + 0.5 + fx * 0.27 - L[0] * 0.1, y: c.y + 0.5 + fy * 0.27 - L[1] * 0.1, h: 1.05, r: 0 });
      return true;
    }
  }
  if (mode === "hidden") {                       // dentro del maíz, al costado; un tanque viejo marca el lugar
    const c = pickC(c => wallSideOf(c.x, c.y, c.f[0], c.f[1]));
    if (c) {
      const dir = wallSideOf(c.x, c.y, c.f[0], c.f[1]);
      const e = mk(c, { mode: "hidden", dir });
      e.x = c.x + 0.5 + dir[0] * 0.95; e.y = c.y + 0.5 + dir[1] * 0.95;
      G.props.push({ img: "tank", x: c.x + 0.5 + dir[0] * 0.3 - c.f[0] * 0.25, y: c.y + 0.5 + dir[1] * 0.3 - c.f[1] * 0.25, h: 1.05, r: 0.2 });
      return true;
    }
  }
  const c = cands.find(c => !c.seen) || cands[0];
  mk(c, {});
  if (!spec.impostor && !spec.mercy && spec.name === "Paul" && G.cx.mended && G.queue.some(q => q.name === "Sebas" && !q.impostor && !q.mercy)) {
    const i = G.queue.findIndex(q => q.name === "Sebas" && !q.impostor && !q.mercy);   // Paul está cuidando a Sebas
    const sb = G.queue.splice(i, 1)[0], back = [c.x - c.f[0], c.y - c.f[1]];
    const e2 = mk({ x: c.x, y: c.y }, {}); e2.name = sb.name; e2.pose = "sit"; e2.bark = mzSpec("Sebas", false, G.cx).bark; e2.qs = mzQuestions(e2, G.cx);
    const pl = G.enc[G.enc.length - 2]; pl.pose = "sit"; pl.bx = back[0] + 0.5; pl.by = back[1] + 0.5; pl.x = pl.bx; pl.y = pl.by;
  }
  return true;
}
function mzSpawnTick(dt) {
  const cell = Math.floor(G.py) * COLS + Math.floor(G.px);
  if (cell !== G.lastCell) { G.lastCell = cell; G.moved++; }
  G.spawnCD -= dt;
  // Si dejaste atrás a alguien sin hablarle, vuelve a la fila y aparecerá más adelante
  for (const e of G.enc) if (!e.done && !e.gone && Math.hypot(e.bx - G.px, e.by - G.py) > 13) {
    e.gone = e.done = true; G.queue.unshift({ name: e.name, impostor: e.impostor, mercy: e.mercy, rejoin: e.rejoin });
  }
  if (G.enc.some(e => !e.done) || !G.queue.length) return;
  const atExit = Math.hypot(G.exit.x - G.px, G.exit.y - G.py) < 3;
  if (!atExit && (G.spawnCD > 0 || G.moved < 3)) return;
  const toExit = Math.hypot(G.exit.x - G.px, G.exit.y - G.py);
  // Stalin, el real, solo está cerca de la luz; el falso, lejos
  let i = G.queue.findIndex(q => { const s = mzSpec(q.name, q.impostor, G.cx); return (!s.near || toExit < 12 || G.queue.length === 1) && (!s.far || toExit > 12); });
  if (i < 0) i = 0;
  const spec = G.queue[i];
  if (mzSpawn(spec)) { G.queue.splice(i, 1); G.moved = 0; }
}
// La habilidad de Sebas: vio a alguien entre el maíz, cerca de donde lo encontraste. Esa persona aparece
// ahí mismo (puede ser tu amigo o esa cosa: Sebas solo vio una cara) y queda marcada en el minimapa, con el
// camino para llegar. Sale a su manera de siempre (escondido, asomándose o en medio) y solo pasa una vez.
function mzSebasSpot(src) {
  const i = G.queue.findIndex(q => !q.mercy && !q.rejoin && q.name !== "Sebas" && !mzSpec(q.name, q.impostor, G.cx).near);   // Stalin, el real, solo está cerca de la luz
  if (i < 0) return null;
  const sx = Math.floor(src.x), sy = Math.floor(src.y), D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const dist = new Map([[sy * COLS + sx, 0]]), prev = new Map(), q = [[sx, sy]], cands = [];
  for (let h = 0; h < q.length; h++) {                   // casillas a pocos pasos de Sebas, por el camino
    const [x, y] = q[h], d = dist.get(y * COLS + x);
    if (d >= 7) continue;
    for (const [ox, oy] of D4) {
      const nx = x + ox, ny = y + oy, k = ny * COLS + nx;
      if (isWall(nx, ny) || dist.has(k)) continue;
      dist.set(k, d + 1); prev.set(k, [x, y]); q.push([nx, ny]);
      if (d + 1 >= 3 && !"o=X".includes(MAP[ny][nx]))
        cands.push({ x: nx, y: ny, f: [ox, oy], d: d + 1, seen: lineOfSight(G.px, G.py, nx + 0.5, ny + 0.5) && Math.hypot(nx + 0.5 - G.px, ny + 0.5 - G.py) < 5 });
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => (a.seen - b.seen) || (Math.abs(a.d - 5) - Math.abs(b.d - 5)) || (Math.random() - 0.5));
  const spec = G.queue[i], before = G.enc.length;
  if (!mzSpawn(spec, cands.slice(0, 8))) return null;
  G.queue.splice(i, 1); G.moved = 0;
  const e = G.enc.slice(before).find(x => x.name === spec.name) || G.enc[G.enc.length - 1];
  e.beacon = true; e.spotted = true; G.showMap = true;
  for (let c = [Math.floor(e.bx), Math.floor(e.by)]; c; c = prev.get(c[1] * COLS + c[0])) {   // el camino desde Sebas, en el mapa
    for (const [ox, oy] of [[0, 0], ...D4]) { const tx = c[0] + ox, ty = c[1] + oy; if (tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS) G.seen[ty][tx] = true; }
  }
  voice(`«Pepe… c-creo que vi a ${e.name} por allá. Cerquita. ¿O era…? No sé. Te lo marqué.»`, "Sebas");
  return e;
}
// Al resolver un encuentro, una pausa antes del próximo (más larga después de un impostor)
function mzAfterEncounter(e) { G.spawnCD = e.impostor ? 16 : 9; G.moved = 0; }   // antes: 40 y 26 s

/* ---------- El alien busca: va hacia donde cree que estás; si te huele, viene directo ---------- */
function moveAlienSearch(dt) {
  const d = Math.hypot(G.px - G.ax, G.py - G.ay);
  if (d < 7) { moveAlienFor(dt); return; }
  G.alienWpT = (G.alienWpT || 0) - dt;
  if (!G.alienWp || G.alienWpT <= 0 || Math.hypot(G.alienWp.x - G.ax, G.alienWp.y - G.ay) < 0.5) {
    G.alienWp = { x: clamp(G.px + rand(-5, 5), 1, COLS - 1), y: clamp(G.py + rand(-5, 5), 1, ROWS - 1) };
    G.alienWpT = 8;
  }
  const dx = G.alienWp.x - G.ax, dy = G.alienWp.y - G.ay, dd = Math.hypot(dx, dy) || 1, st = Math.min(dd, alienSpeed() * 0.85 * dt);
  G.ax += dx / dd * st; G.ay += dy / dd * st;
}

/* ---------- El que no aguanta: se espanta, corre y desaparece ---------- */
function mzRunnerTick() {
  if (G.ran || !G.runAt || G.t < G.runAt || !G.party.includes(G.runner)) return;
  const name = G.runner;
  G.ran = true; G.party = G.party.filter(n => n !== name); G.saved = Math.max(0, G.saved - 1); mzGivePerk(name, false);
  toast(name === "Sebas" ? "«¡No, no, no! ¡Lo vi!» Sebas se pierde entre el maíz." : "«¡Ahí está! ¡Ahí está!» Samira se pierde entre el maíz.", "danger", `${name} sale corriendo`, 1.45);
  scream();
  try { AMBIENT.steps(0, 1.3); AMBIENT.rustle(0, 1.2); } catch (e) { /* sin audio */ }
  const img = charSprite(name), vx = Math.cos(G.ang), vy = Math.sin(G.ang);
  let d = 1.3;
  while (d > 0.5 && isWall(Math.floor(G.px + vx * d), Math.floor(G.py + vy * d))) d -= 0.2;
  G.flee = { img, x: G.px + vx * d, y: G.py + vy * d, vx, vy, t: 0 };
  voice(name === "Sebas" ? "«¡No, no, no! ¡Lo vi!»" : "«¡Ahí está! ¡Ahí está!»", name, G.flee.x, G.flee.y);
  G.queue.unshift({ name, impostor: false, rejoin: true });  // habrá que encontrarlo otra vez: es el próximo en aparecer
  G.spawnCD = 5; G.moved = 3;
}
function mzFleeTick(dt) {
  const f = G.flee; if (!f) return;
  f.t += dt;
  if (f.t > 0.45) { f.x += f.vx * dt * 5; f.y += f.vy * dt * 5; }   // primero se espanta, después corre
  if (f.t > 1.4) G.flee = null;
}

let G;
const keys = {};
// Trucos (se escriben en cualquier momento):
//   «ovni»: en el maizal, sales directo al nivel 4 · «amanecer»: final bueno · «otro»: eligieron al otro Pepe
let cheat = "";
function cheatKey(ch) {
  cheat = (cheat + ch).slice(-12);
  if (cheat.endsWith("amanecer")) { cheat = ""; cheatEnding("good"); return true; }
  if (cheat.endsWith("otro")) { cheat = ""; cheatEnding("bad"); return true; }
  if (cheat.endsWith("ovni") && MODE === "maizal" && G && (G.state === "play" || G.state === "dialog")) { cheat = ""; mzWin(); return true; }
  return false;
}
function cheatEnding(kind) {
  setPause(false);
  if (MODE !== "final" || !FN) startLevel(4);
  STORYP = null; hidePanels(); talkClose();
  FN.anim = null; FN.opts = null; FN.talkT = null;
  fnEnding(kind);
}
let AC = null;

/* ============ Audio compartido (todos los niveles) ============
 * Una sola mezcla:  efectos ─┐
 *                   ambiente ─┴─> volumen general ─> parlantes
 *   sndGain(vol, bus, pan): un nodo de salida para un sonido suelto (bus "sfx" o "amb", paneo -1..1)
 *   sndNoise / sndTone: ruido filtrado y tonos con envolvente, las piezas de casi todos los sonidos
 *   sndLoop(nombre, construir) / sndStop(nombre): fondos que suenan sin parar (zumbido del maizal,
 *   murmullo del bar, motor de la camioneta). Al cambiar de nivel, sndStopAll los apaga todos. */
const SND = { master: null, sfx: null, amb: null, loops: {}, vol: 0.8 };
try { const v = parseFloat(localStorage.getItem("maizal.vol")); if (v >= 0 && v <= 1) SND.vol = v; } catch (e) { /* sin almacenamiento */ }
function initAudio() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    SND.master = AC.createGain(); SND.master.gain.value = SND.vol; SND.master.connect(AC.destination);
    SND.sfx = AC.createGain(); SND.sfx.connect(SND.master);
    SND.amb = AC.createGain(); SND.amb.connect(SND.master);
  } catch (e) { AC = null; }
}
function sndVolume(v) {
  SND.vol = clamp(v, 0, 1);
  if (SND.master) SND.master.gain.setTargetAtTime(SND.vol, AC.currentTime, 0.05);
  for (const k in SND.loops) { const L = SND.loops[k]; if (L.el && !L.routed) L.el.volume = clamp(SND.vol * L.base * L.level, 0, 1); }   // sin la mezcla
  try { localStorage.setItem("maizal.vol", String(SND.vol)); } catch (e) { /* sin almacenamiento */ }
}
function sndGain(vol, bus, pan) {
  const g = AC.createGain(); g.gain.value = vol;
  const out = bus === "amb" ? SND.amb : SND.sfx;
  if (pan != null && AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(out); }
  else g.connect(out);
  return g;
}
function noiseBuf(sec, shape) {
  const n = Math.floor(AC.sampleRate * sec), b = AC.createBuffer(1, n, AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (shape ? shape(i / n) : 1);
  return b;
}
// Ruido de sec segundos, con forma shape(0..1), por un filtro (type, freq, q), hacia out
function sndNoise(at, sec, shape, type, freq, q, out) {
  const s = AC.createBufferSource(); s.buffer = noiseBuf(sec, shape);
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
  s.connect(f); f.connect(out); s.start(at);
  return f;
}
// Tono de dur segundos que va de f0 a f1 Hz, sube en attack y se apaga, hacia out
function sndTone(type, f0, f1, at, dur, peak, out, attack) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, at); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + dur * 0.9);
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + (attack || 0.01)); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  o.connect(g); g.connect(out); o.start(at); o.stop(at + dur + 0.02);
}
// Fondos con nombre: construir(out) arma los nodos y devuelve { srcs: [...], ...lo que se quiera ajustar después }
function sndLoop(name, build) {
  if (!AC) return null;
  if (SND.loops[name]) return SND.loops[name];
  try {
    const out = AC.createGain(); out.connect(SND.amb);
    const L = build(out) || {}; L.out = out; L.srcs = L.srcs || [];
    return (SND.loops[name] = L);
  } catch (e) { return null; }
}
function sndStop(name, fade) {
  const L = SND.loops[name]; if (!L) return;
  delete SND.loops[name];
  try {
    L.out.gain.setTargetAtTime(0, AC.currentTime, fade || 0.15);
    setTimeout(() => { for (const n of L.srcs) try { n.stop(); } catch (e) { /* ya parado */ } L.out.disconnect(); }, (fade || 0.15) * 5000);
  } catch (e) { /* nada */ }
}
function sndStopAll() { for (const k in SND.loops) sndStop(k); }
/* ---------- Música en loop, en streaming ----------
 * Se toca desde un <audio>: se va descargando mientras suena y no se decodifica entera en memoria.
 * Formato: Opus (.ogg), que pesa poco y suena bien a pocos kbps; donde no hay Opus (Safari), la copia .mp3.
 * Servida por http(s), pasa por la mezcla del juego (volumen general, filtro para que suene lejos o detrás
 * de una pared). Abierta como archivo (file://) el navegador no deja procesarla: solo se ajusta su volumen. */
let MUSIC_DIR = "audio/";
const MUSIC_OPUS = (() => { try { return !!document.createElement("audio").canPlayType('audio/ogg; codecs="opus"'); } catch (e) { return false; } })();
function sndMusic(name, file, base) {
  if (!AC) return null;
  return sndLoop(name, out => {
    const el = new Audio();
    el.loop = true; el.preload = "auto";
    el.src = MUSIC_DIR + file + (MUSIC_OPUS ? ".ogg" : ".mp3");
    el.addEventListener("ended", () => { try { el.currentTime = 0; } catch (e) { /* no se puede saltar */ } const p = el.play(); if (p && p.catch) p.catch(() => {}); });   // por si el servidor no deja volver al inicio
    const L = { el, base, level: 1, srcs: [{ stop() { el.pause(); el.removeAttribute("src"); el.load(); } }] };
    if (location.protocol !== "file:") {
      try {
        const src = AC.createMediaElementSource(el), lp = AC.createBiquadFilter(), g = AC.createGain();
        lp.type = "lowpass"; lp.frequency.value = 18000; g.gain.value = base;
        src.connect(lp); lp.connect(g); g.connect(out);
        L.routed = true; L.lp = lp; L.gain = g;
      } catch (e) { L.routed = false; }
    }
    if (!L.routed) el.volume = clamp(SND.vol * base, 0, 1);
    if (!PAUSED) { const p = el.play(); if (p && p.catch) p.catch(() => {}); }
    return L;
  });
}
// Cuánto suena (0..1 de su volumen base) y qué tan apagada (corte en Hz; solo con la mezcla del juego)
function sndMusicSet(name, level, cutoff) {
  const L = SND.loops[name]; if (!L || !L.el) return;
  if (L.lastLv != null && Math.abs(level - L.lastLv) < 0.01 && (!cutoff || Math.abs(cutoff - L.lastCut) < L.lastCut * 0.03)) return;   // no llenar la línea de tiempo del audio
  L.lastLv = level; L.lastCut = cutoff || L.lastCut;
  if (L.routed) {
    const t = AC.currentTime;
    L.gain.gain.setTargetAtTime(L.base * level, t, 0.15);
    if (cutoff) L.lp.frequency.setTargetAtTime(cutoff, t, 0.2);
  } else L.el.volume = clamp(SND.vol * L.base * level, 0, 1);
}
function sndMusicPause(on) {
  for (const k in SND.loops) {
    const L = SND.loops[k]; if (!L.el) continue;
    if (on) L.el.pause(); else { const p = L.el.play(); if (p && p.catch) p.catch(() => {}); }
  }
}
const sndSafe = fn => (...a) => { if (!AC) return; try { fn(...a); } catch (e) { /* sin audio */ } };

/* ---------- Efectos ---------- */
const thump = sndSafe(vol => sndTone("sine", 58, 58, AC.currentTime, 0.22, vol, SND.sfx, 0.03));
// El zumbido del maizal: grave y desafinado, de fondo todo el nivel
function drone() {
  sndLoop("drone", out => {
    out.gain.value = 0.05;
    const srcs = [43, 43.8, 86.5].map(f => { const o = AC.createOscillator(); o.type = "sine"; o.frequency.value = f; o.connect(out); o.start(); return o; });
    return { srcs };
  });
}
const scream = sndSafe(() => {                          // un chillido que sube
  const t = AC.currentTime, f = sndNoise(t, 1.2, x => 1 - x, "bandpass", 900, 0, sndGain(0.55));
  f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(3200, t + 1);
  sndTone("sawtooth", 300, 1500, t, 1.1, 0.3, SND.sfx, 0.005);
});
const chime = sndSafe(() => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => sndTone("sine", f, f, AC.currentTime + i * 0.35, 2.2, 0.12, SND.sfx, 0.05)));
const growl = sndSafe(() => {                           // gruñido grave que se hunde
  const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 600; lp.connect(SND.sfx);
  sndTone("sawtooth", 140, 38, AC.currentTime, 1.0, 0.35, lp, 0.05);
});
function heartbeat(d) { thump(0.25 + 0.3 * d); setTimeout(() => thump(0.18 + 0.25 * d), 170); }

/* ============ Jugador en primera persona: caminar, chocar, mirar (bar, maizal y el final) ============
 * Cada nivel guarda en su estado px, py, ang, pitch, bob y faceTo, y describe su cuerpo con un objeto:
 *   { speed (casillas/s), r (radio de choque), bobRate, bobAmp (balanceo al caminar) }
 * Los choques usan la misma descripción del mundo que el motor 3D (cell / floor / low). */
const MOUSE_SENS = 0.0025;                           // radianes por píxel
const PITCH_MIN = -130, PITCH_MAX = 150;             // cuánto se puede mirar abajo / arriba (en píxeles de horizonte)
function lockMouse() {
  try { const p = cv.requestPointerLock && cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* sin bloqueo */ }
}
function releaseMouse() {
  try { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* nada */ }
}
// El estado que se está jugando a pie ahora mismo (o null: menú, diálogo, cinemática...)
function fpActive() {
  if (MODE === "bar") return B && B.state === "play" ? B : null;
  if (MODE === "maizal") return G && G.state === "play" && !G.flee ? G : null;   // mientras alguien huye, solo miras
  if (MODE === "final") return FN && FN.state === "play" && !FN.anim && !FN.cine ? FN : null;
  return null;
}
function fpLook(S, e) {
  S.ang += clamp(e.movementX || 0, -120, 120) * MOUSE_SENS;
  S.pitch = clamp(S.pitch - clamp(e.movementY || 0, -120, 120) * MOUSE_SENS * 400, PITCH_MIN, PITCH_MAX);
}
// ¿Choca un círculo de radio r en (x, y)? Paredes, muros bajos (solo su caja) y obstáculos redondos { x, y, r }
function fpBlocked(world, x, y, r, discs) {
  for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
    const tx = Math.floor(x + ox), ty = Math.floor(y + oy), ch = world.cell(tx, ty);
    if (ch !== null && world.floor(ch)) continue;
    const b = ch !== null && world.low[ch] && world.low[ch].box;
    if (!b) return true;                                 // pared, o campo abierto fuera del mapa
    if (x + r > tx + b[0] && x - r < tx + b[1] && y + r > ty + b[2] && y - r < ty + b[3]) return true;
  }
  if (discs) for (const d of discs) if (d.r && Math.hypot(d.x - x, d.y - y) < d.r + r) return true;
  return false;
}
// WASD / flechas: adelante, atrás y de lado; la cámara gira con el mouse. Devuelve true si se movió.
function fpWalk(S, dt, body, world, discs) {
  const fwd = (keys.ArrowUp || keys.KeyW ? 1 : 0) - (keys.ArrowDown || keys.KeyS ? 1 : 0);
  const side = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  if (!fwd && !side) return false;
  const len = Math.hypot(fwd, side), sp = body.speed * dt;
  const vx = (Math.cos(S.ang) * fwd - Math.sin(S.ang) * side) / len, vy = (Math.sin(S.ang) * fwd + Math.cos(S.ang) * side) / len;
  if (!fpBlocked(world, S.px + vx * sp, S.py, body.r, discs)) S.px += vx * sp;
  if (!fpBlocked(world, S.px, S.py + vy * sp, body.r, discs)) S.py += vy * sp;
  S.bob += dt * body.bobRate;
  return true;
}
const fpBobY = (S, body) => Math.sin(S.bob) * body.bobAmp;
// Girar la cabeza con suavidad hacia algo (quien te habla, lo que examinas)
function fpFaceTo(S, x, y) { S.faceTo = Math.atan2(y - S.py, x - S.px); }
function fpTurnTick(S, dt) {
  if (S.faceTo == null) return;
  const d = normAngle(S.faceTo - S.ang);
  S.ang += d * Math.min(1, dt * 5); S.pitch *= Math.max(0, 1 - dt * 5);
  if (Math.abs(d) < 0.003) { S.ang = S.faceTo; S.faceTo = null; }
}
// Teclas de cualquier conversación: H historial, Enter/Espacio/E avanzar, 1-6 elegir, Q/Esc irse (si se puede)
function talkKey(c, choose, leave) {
  if (c === "KeyH") { toggleTalkLog(); return; }
  if (!$("talkLog").classList.contains("hidden")) { if (c === "Escape") toggleTalkLog(); return; }
  if (c === "Enter" || c === "Space" || c === "KeyE") advanceTalk();
  else if (c >= "Digit1" && c <= "Digit6") choose(Number(c.slice(5)) - 1);
  else if (leave && (c === "KeyQ" || c === "Escape")) leave();
}

/* ============ UI (historia, diálogos, final) ============ */
/* ---------- Pantallas compartidas por todos los niveles ----------
 * storyOpen: páginas de historia con un botón (la intro de cada nivel)
 * diaryToggle: el cuaderno de la tecla J
 * endScreen: la pantalla del final de un nivel, con sus botones
 * hud*: las piezas del HUD (recuadro, aviso de tecla, ayuda del mouse) */
function hidePanels() { for (const k of ["menu", "intro", "diary", "end", "levelList"]) $(k).classList.add("hidden"); }

let STORYP = null;
function storyOpen(pages, last, done) {
  STORYP = { pages, i: 0, last, done };
  $("intro").classList.remove("hidden");
  storyShow();
}
function storyShow() {
  const sp = STORYP;
  $("introText").textContent = sp.pages[sp.i];
  $("introBtn").textContent = sp.i === sp.pages.length - 1 ? sp.last : "Continuar »";
}
function storyNext() {
  const sp = STORYP;
  if (!sp) return;
  if (sp.i < sp.pages.length - 1) { sp.i++; storyShow(); return; }
  STORYP = null;
  $("intro").classList.add("hidden");
  sp.done();
}

// Líneas: texto suelto, o { h: título }, { sub: subtítulo }, { note: nota gris }
const DIARY_CSS = {                                       // mismos tokens que game.html
  h: "font-family:var(--font-pixel);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--acc);margin-bottom:12px",
  sub: "font-family:var(--font-pixel);font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);margin:16px 0 6px",
  note: "font-size:13px;color:var(--fg-mute);margin-top:12px" };
const diaryOpen = () => !$("diary").classList.contains("hidden");
function diaryToggle(lines) {
  const d = $("diary");
  if (diaryOpen()) { d.classList.add("hidden"); return; }
  d.innerHTML = "";
  for (const l of lines) {
    const p = document.createElement("div"), k = typeof l === "string" ? null : Object.keys(l)[0];
    p.textContent = k ? l[k] : l;
    if (k) p.style.cssText = DIARY_CSS[k];
    d.appendChild(p);
  }
  d.classList.remove("hidden");
}

// o: { title, text, win, style ("win-end" / "lose-end": deja ver la escena detrás), next: [texto, fn], retry: [texto, fn] }
// En la pantalla final, Enter sigue y R repite.
const END = { next: null, retry: null };
function endScreen(o) {
  releaseMouse();
  $("endTitle").textContent = o.title; $("endTitle").className = "t-title " + (o.win ? "win" : "lose");
  $("endText").textContent = o.text;
  $("end").className = "panel full" + (o.style ? " " + o.style : "");
  END.next = o.next ? o.next[1] : null; END.retry = o.retry ? o.retry[1] : null;
  for (const [id, b] of [["endNextBtn", o.next], ["endBtn", o.retry]]) { $(id).classList.toggle("hidden", !b); if (b) $(id).textContent = b[0]; }
}
const endShown = () => !$("end").classList.contains("hidden");
function endKey(c) {
  if (c === "Enter" && END.next) { END.next(); return true; }
  if (c === "KeyR" && END.retry) { END.retry(); return true; }
  return false;
}

/* ---------- Sistema de diseño en el lienzo: los mismos tokens de game.html ----------
 * pixel: títulos, etiquetas y teclas (11 px en el lienzo, que se ve a ~16 px en pantalla) · text: frases
 * Todo recuadro del HUD es el mismo: fondo de panel, borde de 2 px y sombra dura. Margen al borde: 10 px. */
const UI = {
  pixel: '"Silkscreen", "Courier New", monospace', text: '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif',
  bg: "rgba(7,11,19,.9)", line: "#2a3d57", lineHi: "#4d6b8f", fg: "#e8eef7", dim: "#9aabc2", mute: "#5d6e86",
  acc: "#b9f66d", gold: "#ffe08a", warn: "#ffb347", danger: "#ff5b68", m: 10, px: 11
};
const HUD_BG = UI.bg;
const uiPixel = (px) => `${px || UI.px}px ${UI.pixel}`;
const uiText = (px, bold) => `${bold ? "bold " : ""}${px || 12}px ${UI.text}`;
function uiBox(x, y, w, h, line) {                      // el recuadro de siempre
  ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(x + 3, y + 3, w, h);      // sombra dura
  ctx.fillStyle = UI.bg; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = line || UI.line; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}
// Recuadro de arriba a la izquierda. rows: [{ t, c }]: la primera fila es un título (píxel), las demás, frases
function hudPanel(rows) {
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  let w = 0;
  rows.forEach((r, i) => { ctx.font = i ? uiText(12) : uiPixel(); w = Math.max(w, ctx.measureText(r.t).width); });
  const h = 12 + 10 + (rows.length - 1) * 16, bw = Math.ceil(w) + 24;
  uiBox(UI.m, UI.m, bw, h);
  rows.forEach((r, i) => { ctx.font = i ? uiText(12) : uiPixel(); ctx.fillStyle = r.c || (i ? UI.dim : UI.gold); ctx.fillText(r.t, UI.m + 12, UI.m + 11 + (i ? 4 + i * 16 : 0)); });
  ctx.textBaseline = "alphabetic";
  return h;
}
function hudCorner(msg, y) {                            // recordatorio de teclas, arriba a la derecha
  ctx.font = uiPixel(); ctx.fillStyle = UI.dim; ctx.textBaseline = "middle"; ctx.textAlign = "right";
  ctx.fillText(msg.toUpperCase(), W - UI.m - 2, y || 22);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}
function hudPrompt(msg) {                               // lo que puedes hacer ahora mismo, abajo al centro
  ctx.font = uiPixel(); ctx.textBaseline = "middle";
  const t = msg.toUpperCase(), w = Math.ceil(ctx.measureText(t).width) + 28;
  uiBox(Math.round(W / 2 - w / 2), H - 50, w, 26, UI.gold);
  ctx.fillStyle = UI.gold; ctx.textAlign = "center"; ctx.fillText(t, W / 2, H - 36);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}
function hudMouseHint() {
  if (document.pointerLockElement === cv) return;
  ctx.font = uiText(12); ctx.fillStyle = UI.dim; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("Haz clic para mirar con el mouse", W / 2, H - 36);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
}
// Avisos: una tarjeta visible arriba al centro. Si llegan varios, hacen fila y salen de a uno
// (los repetidos no se encolan). kind: "info" | "good" | "warn" | "danger" | "voice"
function toast(msg, kind, title, delay) {
  if (!kind) kind = /^[«(]/.test(msg) ? "voice" : "info";
  if (kind === "voice") return mzSub(msg.replace(/^\((.*)\)$/s, "$1"));
  if (kind === "good" || kind === "danger" || kind === "story") return mzStory(msg, title, kind, delay);
  return mzBand(msg, kind);
}

// El reloj de la conversación: grande, sobre el diálogo; mientras menos queda, más late y tiembla
let mzTimerShown = null;
function mzTimerUpdate() {
  const el = $("mzTimer");
  if (!el) return;
  const fin = MODE === "final" && FN && FN.state === "dialog" && FN.talkT != null;
  const on = fin || (MODE === "maizal" && G && G.state === "dialog" && G.talkT != null);
  if (!on) { if (mzTimerShown !== null) { el.classList.add("hidden"); mzTimerShown = null; } return; }
  const T = fin ? FN.talkT : G.talkT;
  const lbl = fin ? "te están mirando" : G.party.includes("Sebas") ? "Sebas dispara en" : "esa cosa llega en";
  const s = Math.max(0, Math.ceil(T)), key = s + lbl;
  const talk = $("talk"); el.style.bottom = (talk.offsetHeight + 6) + "px";
  el.style.setProperty("--p", clamp(T / 15, 0, 1).toFixed(3));
  if (key === mzTimerShown) return;
  if (mzTimerShown !== null && s <= 5 && s > 0) tick(s);
  mzTimerShown = key;
  el.classList.remove("hidden");
  el.className = s <= 4 ? "danger" : s <= 8 ? "warn" : "calm";
  $("mzTimerNum").textContent = s;
  $("mzTimerLbl").textContent = lbl;
}
const tick = sndSafe(sec => {                           // el reloj suena en los últimos segundos
  sndTone("square", sec <= 2 ? 1400 : 1000, 0, AC.currentTime, 0.06, 0.05, SND.sfx, 0.002);
  if (sec <= 3) thump(0.3);
});


function showMenu() {
  hidePanels();
  $("menu").classList.remove("hidden");
  const box = $("menuEyes");
  box.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const e = document.createElement("div");
    e.className = "eyes";
    e.style.left = rand(4, 92).toFixed(1) + "%";
    e.style.top = rand(8, 86).toFixed(1) + "%";
    e.style.animationDuration = rand(9, 20).toFixed(1) + "s";
    e.style.animationDelay = (-rand(0, 20)).toFixed(1) + "s";
    box.appendChild(e);
  }
}
function startFromMenu() {
  if (MODE !== "menu" || G.state !== "menu") return;
  startBar();                                   // la historia empieza en el bar
}
function toMenu() {
  releaseMouse(); talkClose(); mzOverlayClear();
  if (MODE === "chase" && CH) { chaseAudioStop(); CH.done = true; }
  MODE = "menu"; sndStopAll(); ECHO = null; B = null; STORYP = null;
  G = newGameState("menu");
  showMenu();
}

/* ---------- Conversaciones del maizal: el mismo sistema del bar ---------- */
function startEncounter(e) {
  G.state = "dialog"; G.cur = e; G.talkOpts = [];
  fpFaceTo(G, e.x, e.y);
  G.talkT = e.mercy ? null : 15;                           // quince segundos: después, ya no hay conversación
  talkOpen(e.name);
  if (e.mercy) {                                           // lo alcanzó el alien: te pide que acabes con él
    typeLines([[e.name, "P-Pepe… me alcanzó. Siento algo moviéndose adentro… me está cambiando."], [e.name, "Hazlo. Por favor. Antes de que deje de ser yo."]], () => {
      G.talkOpts = [{ tag: "Esperar", t: "No puedo.", refuse: true }, { tag: "Acabar", hard: true, t: "Perdóname.", mercy: true }];
      showOpts();
    });
    return;
  }
  const lines = [[e.name, mzOpener(e, G.cx)]];
  const quirk = pick(e.impostor ? QUIRK_FAKE : QUIRK_REAL);
  if (quirk) lines.push(["", quirk]);
  const comp = G.party[G.party.length - 1];                // el último que se unió opina, a su manera
  if (comp) lines.push([comp, mzOpinion(comp, e, G.cx)]);
  typeLines(lines, () => mzOptions(e));
}
// Las opciones nunca cambian de lugar: las preguntas hechas quedan apagadas y "Acabar" siempre es la última.
// Además, recién aparecidas no responden un instante, para que un clic de "continuar" no dispare nada.
function showOpts() {
  drawOptButtons(G.talkOpts, mzChoose, o => o.cost ? `−${o.cost} s` : "");
  G.optT = performance.now();
}
function mzOptions(e) {
  G.talkOpts = e.qs.map((q, i) => ({ tag: q.private ? "Privado" : "Preguntar", t: q.label, q: i, cost: 2, used: e.asked.has(q.id) }));
  G.talkOpts.push({ tag: "Confiar", t: "Ven conmigo.", spare: true });
  G.talkOpts.push({ tag: "Acabar", hard: true, t: `Tú no eres ${e.name}.`, kill: true });
  showOpts();
}
function mzChoose(i) {
  if (MODE !== "maizal" || G.state !== "dialog" || typerBusy()) return;
  if (performance.now() - (G.optT || 0) < 450) return;
  const o = G.talkOpts[i], e = G.cur;
  if (!o || !e || o.used) return;
  $("talkOpts").innerHTML = ""; G.talkOpts = [];
  if (o.mercy) { typeLines([["Tú", o.t]], () => startShoot(e, "mercy"), true); return; }
  if (o.refuse) {
    e.done = true; G.resolved++; G.alienBoost += 0.15; G.lost.push(e.name); mzAfterEncounter(e);
    typeLines([["", `(Le das la espalda. ${e.name} deja de llorar.)`]], () => { mzEndTalk(); toast("Algo más camina ahora entre el maíz.", "danger"); }, true);
    return;
  }
  if (o.kill) { typeLines([["Tú", o.t]], () => decide(false), true); return; }
  if (o.spare) { typeLines([["Tú", o.t]], () => decide(true), true); return; }
  const q = e.qs[o.q];
  e.asked.add(q.id);
  G.talkT = Math.max(0.5, G.talkT - o.cost);                 // cada pregunta gasta tiempo
  G.talkLog.push({ who: "Tú", text: o.t });
  let line;
  if (q.private) line = (!e.impostor || q.overheard) ? q.real : q.fake;    // el alien solo sabe lo que oyó don Lucho
  else line = q.say(e.impostor && e.wrong.has(q.id) ? pick(q.pool.filter(x => x !== q.truth)) : q.truth);
  if (!q.private) line = mzStumble(e.name, q, line);
  line = mzTone(e.name, line);
  const lines = [["Tú", o.t], [e.name, line]];
  if (e.name === "Paul" && Math.random() < 0.35) lines.push(["", pick(["(Huele a cerveza. Se apoya en el maíz para no caerse.)", "(Le cuesta enfocarte.)", "(Arrastra las palabras.)"])]);
  else if (Math.random() < 0.5) { const quirk = pick(e.impostor ? QUIRK_FAKE : QUIRK_REAL); if (quirk) lines.push(["", quirk]); }
  typeLines(lines, () => mzOptions(e));
}
// Se acabó el tiempo: si Sebas va contigo, dispara él; si no, esa cosa te alcanza
function dialogTimeout() {
  const e = G.cur;
  if (G.party.includes("Sebas")) {
    G.talkT = null;
    toast("Sebas te arrebata la pistola: «¡No hay tiempo!»", "warn");
    startShoot(e, "sebas");
    return;
  }
  heartbeat(1); growl();                                  // un solo intento: esa cosa llega
  endGame(false, "¡TE ATRAPÓ!", "Te quedaste demasiado tiempo hablando. Esa cosa salió del maíz detrás de ti.");
}
function mzEndTalk() {
  talkClose();
  G.cur = null; G.state = "play"; G.talkT = null;
  lockMouse();
}
function decide(spare) {
  if (G.state !== "dialog" || !G.cur) return;
  const e = G.cur;
  G.talkT = null;
  if (spare && !e.impostor) {
    e.done = true;
    G.resolved++; G.saved++;
    revealAhead(14);
    G.party.push(e.name);
    mzGivePerk(e.name, true);
    if (e.name === G.runner && !G.ran) G.runAt = G.t + rand(16, 26);      // este no va a aguantar mucho
    mzAfterEncounter(e);
    const st = mzSaveText(e, G.cx), cut = st.indexOf(". ");
    mzEndTalk();
    if (cut > 0) toast(st.slice(cut + 2), "good", st.slice(0, cut)); else toast(st, "good");
  } else if (!spare) {
    startShoot(e);                                       // se resuelve al terminar la animación del disparo
  } else {
    e.done = true;
    endGame(false, "¡TE ENGAÑÓ!", `Dejaste vivir al impostor. "${e.name}" te abraza, y sus brazos se vuelven garras.`);
  }
}

function endGame(win, title, text) {
  releaseMouse(); mzOverlayClear(); talkClose();
  $("diary").classList.add("hidden");
  const kind = win ? "win" : title === "ERA UN AMIGO" ? "friend" : title === "¡TE ENGAÑÓ!" ? "fake" : "caught";
  const t0 = (kind === "friend" || kind === "fake") ? 1.6 : 0;
  G.cine = { type: win ? "win" : "lose", kind, title, text, t: 0, t0, name: G.cur ? G.cur.name : null, img: G.cur ? mzImg(G.cur) : null,
             dur: win ? 9 : t0 + 4.8, s1: false, s2: false };
  // el alien real sale de escena: la animación lo dibuja aparte
  G.ax = G.px - Math.cos(G.ang) * 60; G.ay = G.py - Math.sin(G.ang) * 60;
  G.pitch = 0;
  G.state = "cutscene";
}

function showEndPanel() {
  const c = G.cine, win = c.type === "win";
  G.state = "end";
  endScreen({ title: c.title, text: c.text, win, style: win ? "win-end" : "lose-end", retry: ["Jugar de nuevo [R]", restart] });
}

function restart() {
  lockMouse(); cancelTyping(); mzOverlayClear();
  talkClose(); hidePanels();
  G = newGameState("play");
}

/* ---------- Disparo en primera persona (impostor o amigo real) ---------- */
const SHOT_FIRE = 0.45;                                // instante del disparo
function startShoot(e, why) {
  cancelTyping();
  $("talk").classList.add("hidden"); $("talkLog").classList.add("hidden");
  if (e.mode === "hidden" && e.dir) { e.mode = "middle"; e.x = e.bx + e.dir[0] * 0.3; e.y = e.by + e.dir[1] * 0.3; }  // sale del maíz
  G.ang = Math.atan2(e.y - G.py, e.x - G.px); G.pitch = 0; G.faceTo = null;
  G.state = "shoot"; G.talkT = null; G.shot = { e, t: 0, why: why || "pepe" };
}
function updateShoot(dt) {
  const s = G.shot, e = s.e;
  s.t += dt; G.t += dt;
  if (!s.bang && s.t >= SHOT_FIRE) { s.bang = true; gunshot(); }
  if (s.why === "mercy") {                             // le diste paz: no hay transformación, solo silencio
    if (s.t >= 1.6) {
      e.done = true; G.resolved++; G.lost.push(e.name); mzAfterEncounter(e);
      G.shot = null; G.cur = null; G.state = "play";
      toast(`Le cierras los ojos a ${e.name}.`, "story");
      lockMouse();
    }
    return;
  }
  if (!e.impostor) {                                   // era un amigo: cae, y ya no hay vuelta atrás
    if (s.t >= 1.05) {
      G.shot = null;
      endGame(false, "ERA UN AMIGO", s.why === "sebas" ? `Sebas disparó. ${e.name} era real.` : `${e.name} era real. Acabaste con la vida de tu amigo… y el alien te encuentra solo.`);
    }
    return;
  }
  if (!s.scr && s.t >= 0.8) { s.scr = true; scream(); }
  if (s.t >= 1.9) {                                    // ya transformado, huye entre el maíz
    if (!s.fdir) { const dx = e.x - G.px, dy = e.y - G.py, d = Math.hypot(dx, dy) || 1; s.fdir = [dx / d, dy / d]; growl(); }
    e.x += s.fdir[0] * dt * 4.5; e.y += s.fdir[1] * dt * 4.5;
  }
  if (s.t >= 3.2) {
    e.done = true; G.resolved++; pushAlienAway(4); mzAfterEncounter(e);
    G.shot = null; G.cur = null; G.state = "play";
    lockMouse();
  }
}
function drawGun(gx, gy, rot) {                        // pistola vista desde atrás, en la mano de Pepe
  ctx.save(); ctx.translate(gx, gy); ctx.rotate(rot); ctx.scale(1.7, 1.7);
  ctx.fillStyle = "#3e5a86"; ctx.beginPath(); ctx.moveTo(-6, 130); ctx.lineTo(74, 130); ctx.lineTo(40, 8); ctx.lineTo(2, 16); ctx.fill();   // manga
  ctx.fillStyle = "#2c4266"; ctx.fillRect(2, 12, 38, 6);
  ctx.fillStyle = "#141417"; ctx.fillRect(-15, -42, 30, 54);                                                // empuñadura
  ctx.fillStyle = "#8a5a3c"; ctx.fillRect(-22, -24, 46, 38);                                                // mano
  ctx.fillStyle = "#6e4630"; ctx.fillRect(-22, -10, 46, 2); ctx.fillRect(-22, 0, 46, 2);
  ctx.fillStyle = "#9a6a48"; ctx.fillRect(-27, -40, 11, 22);                                                // pulgar
  ctx.fillStyle = "#24262a"; ctx.fillRect(-17, -80, 34, 40);                                                // corredera
  ctx.fillStyle = "#3a3d43"; ctx.fillRect(-17, -80, 34, 6);
  ctx.fillStyle = "#0b0b0d"; ctx.fillRect(-12, -88, 8, 8); ctx.fillRect(4, -88, 8, 8);                       // mira trasera
  ctx.fillStyle = "#d8d8d0"; ctx.fillRect(-2, -90, 4, 6);                                                   // mira delantera
  ctx.restore();
}
function drawShootFX() {
  const s = G.shot; if (!s) return;
  const t = s.t, since = t - SHOT_FIRE;
  if (s.e.impostor && t > 0.75 && t < 1.95) {          // la cara se deshace: destellos verdes y la imagen se rasga
    const q = (t - 0.75) / 1.2;
    if (Math.random() < 0.4) { ctx.fillStyle = `rgba(110,255,140,${(0.28 * Math.random()).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    if (Math.random() < 0.6) glitchStrips(3, 10 + 24 * q);
  }
  const raise = clamp(t / 0.3, 0, 1), lower = s.why === "mercy" ? clamp((t - 1.0) / 0.4, 0, 1) : s.e.impostor ? clamp((t - 2.0) / 0.4, 0, 1) : 0;
  const rec = since > 0 ? Math.exp(-since * 9) : 0;
  const gx = W * 0.56, gy = H + 30 + (1 - raise * raise) * 240 + lower * 240 - rec * 22;
  drawGun(gx, gy, -rec * 0.3);
  if (since > 0 && since < 0.09) {                     // fogonazo
    const mx = gx + Math.sin(-rec * 0.3) * 150, my = gy - 155;
    const g = ctx.createRadialGradient(mx, my, 2, mx, my, 90);
    g.addColorStop(0, "rgba(255,250,220,1)"); g.addColorStop(0.3, "rgba(255,200,90,.85)"); g.addColorStop(1, "rgba(255,160,40,0)");
    ctx.fillStyle = g; ctx.fillRect(mx - 90, my - 90, 180, 180);
    ctx.fillStyle = "rgba(255,240,200,.35)"; ctx.fillRect(0, 0, W, H);
  }
}
const gunshot = sndSafe(() => {
  const t = AC.currentTime, f = sndNoise(t, 0.7, x => Math.pow(1 - x, 6), "lowpass", 6000, 0, sndGain(0.9));
  f.frequency.setValueAtTime(6000, t); f.frequency.exponentialRampToValueAtTime(260, t + 0.35);
  thump(0.6);
});
// El maíz se abre
const rustle = sndSafe(() => sndNoise(AC.currentTime, 0.5, x => Math.sin(Math.PI * x) * (0.6 + 0.4 * Math.sin(x * 80)), "bandpass", 3200, 0.7, sndGain(0.25)));
// Copia inclinada de un sprite, girada desde los pies (para asomarse desde el maíz)
function rotSprite(img, a) {
  a = Math.round(a / 0.04) * 0.04;
  if (!a) return img;
  const cache = img._rot || (img._rot = {}), k = a.toFixed(2);
  if (cache[k]) return cache[k];
  const w = img.width, h = img.height, ex = Math.ceil(h * Math.abs(Math.sin(a))), c = makeCanvas(w + ex * 2, h), g = c.getContext("2d");
  g.imageSmoothingEnabled = false; g.translate(c.width / 2, h); g.rotate(a); g.drawImage(img, -w / 2, -h);
  return (cache[k] = c);
}

/* ---------- Ruidos del maizal: ¿está cerca, o te estás volviendo loco? ---------- */
const sfxOut = (pan, vol) => sndGain(vol, "amb", pan);   // ruidos del maizal: van al ambiente, con su lado
const playNoise = sndNoise;
const AMBIENT = {
  rustle(pan, v) { const o = sfxOut(pan, 0.3 * v); playNoise(AC.currentTime, 0.7, x => Math.sin(Math.PI * x) * (0.6 + 0.4 * Math.sin(x * 60)), "bandpass", 3000, 0.7, o); },
  steps(pan, v) { const o = sfxOut(pan, 0.5 * v), t = AC.currentTime, k = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < k; i++) playNoise(t + i * rand(0.34, 0.46), 0.09, x => Math.pow(1 - x, 3), "lowpass", 420, 0, o); },
  twig(pan, v) { const o = sfxOut(pan, 0.45 * v), t = AC.currentTime;
    playNoise(t, 0.03, x => 1 - x, "highpass", 2400, 0, o); playNoise(t + rand(0.06, 0.12), 0.04, x => 1 - x, "highpass", 1800, 0, o); },
  chitter(pan, v) {                                    // chasquidos secos, como de algo que no es de aquí
    const o = sfxOut(pan, 0.12 * v), t = AC.currentTime, n = 6 + Math.floor(Math.random() * 8);
    for (let i = 0; i < n; i++) { const os = AC.createOscillator(), g = AC.createGain(), at = t + i * rand(0.04, 0.09);
      os.type = "square"; os.frequency.value = rand(700, 1300); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + 0.005); g.gain.exponentialRampToValueAtTime(0.001, at + 0.03);
      os.connect(g); g.connect(o); os.start(at); os.stop(at + 0.04); } },
  laugh(pan, v) {                                      // una risa lenta, grave y desafinada
    const o = sfxOut(pan, 0.07 * v), t = AC.currentTime;
    for (let i = 0; i < 5; i++) for (const det of [0, 7]) { const os = AC.createOscillator(), g = AC.createGain(), at = t + i * 0.24;
      os.type = "triangle"; os.frequency.setValueAtTime(190 - i * 12 + det, at); os.frequency.exponentialRampToValueAtTime(120 - i * 8 + det, at + 0.18);
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + 0.03); g.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
      os.connect(g); g.connect(o); os.start(at); os.stop(at + 0.22); } },
  whisper(pan, v) { const o = sfxOut(pan, 0.35 * v), t = AC.currentTime;
    for (let i = 0; i < 5; i++) playNoise(t + i * rand(0.12, 0.2), rand(0.08, 0.16), x => Math.sin(Math.PI * x), "bandpass", rand(1500, 2400), 4, o); },
  wind(pan, v) { const o = sfxOut(pan, 0.35 * v), t = AC.currentTime;
    playNoise(t, 3.2, x => Math.sin(Math.PI * x) * (0.7 + 0.3 * Math.sin(x * 9)), "lowpass", 520, 0, o); },
  moan(pan, v) { const o = sfxOut(pan, 0.06 * v), t = AC.currentTime, os = AC.createOscillator(), g = AC.createGain();
    os.type = "sine"; os.frequency.setValueAtTime(rand(200, 260), t); os.frequency.exponentialRampToValueAtTime(rand(90, 120), t + 1.8);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.4); g.gain.exponentialRampToValueAtTime(0.001, t + 1.9);
    os.connect(g); g.connect(o); os.start(t); os.stop(t + 2); }
};
function mzAmbient(dt) {
  if (!AC) return;
  const toExit = Math.hypot(G.exit.x - G.px, G.exit.y - G.py);
  G.windT = (G.windT || 0) - dt;
  if (toExit < 10 && G.windT <= 0) { G.windT = rand(5, 8); try { AMBIENT.wind(rand(-0.5, 0.5), 1.4 - toExit / 10); } catch (e) { /* sin audio */ } }
  G.ambT = (G.ambT == null ? 12 : G.ambT) - dt;
  if (G.ambT > 0) return;
  const ad = Math.hypot(G.ax - G.px, G.ay - G.py), near = clamp(1 - ad / 14, 0, 1);
  G.ambT = rand(17, 23);
  // Lejos del alien: sobre todo maíz, pisadas y ramas (que pueden no ser nada). Cerca: lo otro.
  const pool = near > 0.4 ? ["chitter", "steps", "twig", "laugh", "whisper", "rustle", "moan"] : ["rustle", "rustle", "steps", "twig", "twig", "whisper", "laugh", "moan", "chitter"];
  const kind = pick(pool);
  // Los sonidos del alien vienen de su lado; los demás, de cualquier parte
  let pan = rand(-1, 1);
  if ((kind === "chitter" || kind === "steps") && near > 0.2) pan = Math.sin(normAngle(Math.atan2(G.ay - G.py, G.ax - G.px) - G.ang));
  try { AMBIENT[kind](pan, 0.5 + near * 0.6); } catch (e) { /* sin audio */ }
}

/* ---------- Mensajes del maizal, en pixel art, según su importancia ----------
 * A · pantalla negra (pausa): lo que cambia la partida (alguien se une, un impostor, una huida, una muerte).
 * B · franja de cine al centro: advertencias. No pausa.
 * C · subtítulos de VHS abajo: voces entre el maíz. No pausa.
 * El texto se dibuja a media resolución y se agranda sin suavizar: letras de píxel nítidas. */
const MZO = { story: [], storyCur: null, band: [], bandCur: null, sub: null };
function mzStory(text, title, kind, delay) {
  if (MZO.storyCur && MZO.storyCur.text === text) return;
  if (MZO.story.some(s => s.text === text)) return;
  MZO.story.push({ text, title, kind: kind || "good", t: -(delay || 0) });
}
function mzBand(text, kind) {
  if ((MZO.bandCur && MZO.bandCur.text === text) || MZO.band.some(b => b.text === text)) return;
  MZO.band.push({ text, kind, t: 0 });
  if (MZO.band.length > 3) MZO.band.shift();
}
function mzSub(text, who) { if (!MZO.sub || MZO.sub.text !== text) MZO.sub = { text, who, t: 0 }; }
// Voces a lo lejos (bar y maizal): siempre como subtítulo de cinta, con el nombre de quien habla si se le reconoce
// Eco: ondas que salen del lugar de donde vino la voz (o del borde de la pantalla, si está fuera de vista)
let ECHO = null;
function echoFrom(x, y, who, S) {
  const a = normAngle(Math.atan2(y - S.py, x - S.px) - S.ang), d = Math.hypot(x - S.px, y - S.py);
  ECHO = { a, d, col: charColor(who, "#c8d6ea"), t: 0 };
}
function drawEcho(dt) {
  const e = ECHO; if (!e) return;
  e.t += dt;
  if (e.t > 2.2) { ECHO = null; return; }
  const k = Math.tan(CFG.FOV / 2), inView = Math.abs(e.a) < CFG.FOV / 2 * 0.92;
  const x = inView ? W / 2 + Math.tan(e.a) / k * (W / 2) : e.a < 0 ? 0 : W, y = H * 0.46;
  const near = clamp(1 - e.d / 14, 0.35, 1);
  const rgb = [1, 3, 5].map(i => parseInt(e.col.substr(i, 2), 16)).join(",");
  if (!inView) {                                         // el borde de ese lado se ilumina
    const gw = W * 0.22, g = ctx.createLinearGradient(x, 0, e.a < 0 ? gw : W - gw, 0);
    const a = 0.35 * near * Math.sin(Math.min(1, e.t / 2.2) * Math.PI);
    g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(e.a < 0 ? 0 : W - gw, 0, gw, H);
  }
  ctx.save(); ctx.lineWidth = 2.5;
  for (let i = 0; i < 4; i++) {                          // cuatro ondas, una tras otra: un eco
    const t = e.t - i * 0.28; if (t < 0 || t > 1.3) continue;
    const r = 14 + t * 190 * (inView ? 0.8 : 1.2), a = (1 - t / 1.3) * 0.7 * near;
    ctx.strokeStyle = `rgba(${rgb},${a.toFixed(3)})`;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}
// Una voz a lo lejos: subtítulo y, si se sabe de dónde vino, eco hacia allá
function voice(text, who, x, y) {
  mzSub(text.replace(/^\((.*)\)$/s, "$1"), who);
  const S = MODE === "bar" ? B : MODE === "final" ? FN : G;
  if (x != null && S) echoFrom(x, y, who, S);
}
function mzOverlayClear() { MZO.story = []; MZO.storyCur = null; MZO.band = []; MZO.bandCur = null; MZO.sub = null; }
const storyDur = s => clamp(1.4 + s.text.length * 0.05, 2.6, 6);
function ovState() {                                  // "play" / "dialog" en el nivel que esté activo
  if (MODE === "bar") return !B ? "" : B.state === "play" ? "play" : B.state === "talk" ? "dialog" : B.state;
  if (MODE === "chase") return CH && !CH.done ? "cine" : "";
  if (MODE === "final") return !FN ? "" : FN.state;
  return G ? G.state : "";
}
const mzFrozen = () => (MODE === "maizal" || MODE === "bar" || MODE === "final") && ovState() === "play" && MZO.storyCur && MZO.storyCur.t >= 0;
// Devuelve true si una pantalla negra está pausando el juego
function mzOverlayTick(dt) {
  if (!MZO.bandCur && MZO.band.length) MZO.bandCur = MZO.band.shift();
  if (MZO.bandCur && (MZO.bandCur.t += dt) > clamp(1.6 + MZO.bandCur.text.length * 0.04, 2.4, 4.5)) MZO.bandCur = null;
  if (MZO.sub && (MZO.sub.t += dt) > clamp(1.5 + MZO.sub.text.length * 0.045, 2.4, 4.5)) MZO.sub = null;
  if (ovState() !== "play") return false;               // las pantallas negras esperan a que termine lo que pasa
  if (!MZO.storyCur && MZO.story.length) MZO.storyCur = MZO.story.shift();
  const s = MZO.storyCur;
  if (!s) return false;
  s.t += dt;
  if (s.t < 0) return false;                            // con retraso: deja ver primero lo que ocurre
  if (s.t > storyDur(s) + 0.35) { MZO.storyCur = null; return false; }
  return true;
}
function mzStoryKey() {                                  // Enter / clic: completa el texto o pasa al siguiente
  const s = MZO.storyCur;
  if (!s || s.t < 0 || ovState() !== "play") return false;
  const full = 0.25 + s.text.length / 32;
  s.t = s.t < full ? full : storyDur(s) + 0.36;
  return true;
}
// Texto con la tipografía de los diálogos (las coordenadas vienen a media escala: x2 al dibujar)
const MZO_FONT = (size, w, pixel) => pixel ? uiPixel() : `${w || "normal"} ${Math.round(size * 1.75)}px ${UI.text}`;
function pxWrap(text, maxW, size) {
  ctx.font = MZO_FONT(size);
  const out = [], words = text.split(" "); let cur = "";
  for (const w of words) { const t2 = cur ? cur + " " + w : w; if (ctx.measureText(t2).width > maxW * 2 && cur) { out.push(cur); cur = w; } else cur = t2; }
  if (cur) out.push(cur);
  return out;
}
function pxDraw(items) {
  ctx.save(); ctx.textBaseline = "middle";
  for (const it of items) {
    ctx.font = MZO_FONT(it.size, it.weight, it.pixel); ctx.textAlign = it.align || "center";
    const x = it.x * 2, y = it.y * 2;
    if (it.shadow) {                                     // corrimiento de color de cinta vieja
      ctx.globalAlpha = 0.55; ctx.fillStyle = it.shadow[0]; ctx.fillText(it.text, x - 1.5, y);
      ctx.fillStyle = it.shadow[1]; ctx.fillText(it.text, x + 1.5, y); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = it.color; ctx.fillText(it.text, x, y);
  }
  ctx.restore();
}
const MZO_COL = { good: UI.acc, danger: UI.danger, warn: UI.warn, info: UI.gold, story: UI.gold };
function drawMzOverlay() {
  if (MODE !== "maizal" && MODE !== "bar" && MODE !== "chase" && MODE !== "final") return;
  const st = ovState();
  const items = [];
  // C · subtítulos de VHS (abajo, solo cuando no hay diálogo)
  const sub = MZO.sub;
  if (sub && st === "play") {
    const a = clamp(Math.min(sub.t / 0.2, 1), 0, 1);
    const ln = pxWrap(sub.text, W / 2 - 30, 9).slice(0, 2), hh = (sub.who ? 26 : 14) + ln.length * 16, yc = H - 64;
    ctx.fillStyle = `rgba(0,0,0,${(0.75 * a).toFixed(2)})`; ctx.fillRect(0, yc - hh / 2, W, hh);
    ctx.fillStyle = "rgba(255,255,255,.05)"; for (let y = yc - hh / 2; y < yc + hh / 2; y += 3) ctx.fillRect(0, y, W, 1);
    ln.forEach((t, i) => items.push({ text: t, x: W / 4, y: yc / 2 + (i - (ln.length - 1) / 2) * 8, size: 9, color: "#f2f2f2", shadow: ["#ff304a", "#30e0ff"] }));
    if (sub.who) items.push({ text: sub.who.toUpperCase(), x: W / 4, y: yc / 2 - hh / 4 - 1, size: 6, pixel: true, color: charColor(sub.who, UI.dim) });
  }
  // B · franja de cine al centro
  const band = MZO.bandCur;
  if (band && (st === "play" || st === "dialog" || st === "cine")) {
    const a = clamp(Math.min(band.t / 0.2, (clamp(1.6 + band.text.length * 0.04, 2.4, 4.5) - band.t) / 0.3), 0, 1);
    const by = st === "dialog" ? H * 0.28 : H * 0.42;
    const ln = pxWrap(band.text, W / 2 - 24, 9).slice(0, 2), hh = 18 + ln.length * 16;
    ctx.fillStyle = `rgba(0,0,0,${(0.82 * a).toFixed(2)})`; ctx.fillRect(0, by - hh / 2, W, hh);
    ctx.fillStyle = MZO_COL[band.kind] || MZO_COL.info; ctx.globalAlpha = a; ctx.fillRect(0, by - hh / 2, W, 2); ctx.fillRect(0, by + hh / 2 - 2, W, 2); ctx.globalAlpha = 1;
    if (a > 0.4) ln.forEach((t, i) => items.push({ text: t, x: W / 4, y: by / 2 + (i - (ln.length - 1) / 2) * 8, size: 9, color: "#ffffff" }));
  }
  // A · pantalla negra con el texto al centro, letra por letra
  const s = MZO.storyCur;
  if (s && s.t >= 0 && st === "play") {
    const dur = storyDur(s), a = clamp(Math.min(s.t / 0.3, (dur + 0.35 - s.t) / 0.35), 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${(0.9 * a).toFixed(2)})`; ctx.fillRect(0, 0, W, H);
    if (a > 0.5) {
      const shown = s.text.slice(0, Math.max(0, Math.floor((s.t - 0.25) * 32)));
      const ln = pxWrap(s.text, W / 2 - 60, 11), lh = 12, y0 = H / 4 - (ln.length - 1) * lh / 2;
      let left = shown.length;
      ln.forEach((t, i) => { const part = t.slice(0, Math.max(0, left)); left -= t.length + 1; if (part) items.push({ text: part, x: W / 4, y: y0 + i * lh, size: 11, color: "#ffffff" }); });
      if (s.title) items.push({ text: s.title.toUpperCase(), x: W / 4, y: y0 - 18, size: 8, pixel: true, color: MZO_COL[s.kind] || MZO_COL.story });
      if (s.t > 1.2) items.push({ text: "[ENTER]", x: W / 4, y: y0 + ln.length * lh + 12, size: 8, pixel: true, color: UI.mute });
    }
  }
  if (items.length) pxDraw(items);
}

/* ============ Lógica ============ */
function alienSpeed() { return CFG.ALIEN_BASE + CFG.ALIEN_PER_EVENT * G.resolved + (G.alienBoost || 0); }

function moveAlienFor(sec) {
  const dx = G.px - G.ax, dy = G.py - G.ay, d = Math.hypot(dx, dy);
  if (d < 0.01) return;
  const step = Math.min(d, alienSpeed() * sec);
  G.ax += dx / d * step; G.ay += dy / d * step;     // atraviesa el maíz en línea recta
}
function pushAlienAway(tiles) {
  const dx = G.ax - G.px, dy = G.ay - G.py, d = Math.hypot(dx, dy) || 1;
  G.ax = clamp(G.ax + dx / d * tiles, 0.5, COLS - 0.5);
  G.ay = clamp(G.ay + dy / d * tiles, 0.5, ROWS - 0.5);
}
function revealAhead(n) {
  const path = bfs(Math.floor(G.px), Math.floor(G.py), Math.floor(G.exit.x), Math.floor(G.exit.y));
  for (let i = 0; i < Math.min(n, path.length); i++) {
    const [x, y] = path[i];
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const tx = x + ox, ty = y + oy;
      if (tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS) G.seen[ty][tx] = true;
    }
  }
}

const MZ_BODY = { speed: CFG.MOVE, r: 0.22, bobRate: 9, bobAmp: 2.5 };

function mzWin() {                                     // fuera del maizal: empieza el nivel 4 con los que llegaron
  FINAL_IN = { party: G.party.slice(), lost: G.lost.slice() };
  startLevel(4);
}

function updateCine(dt) {
  const c = G.cine;
  c.t += dt;
  const u = c.t - c.t0;
  if (c.type === "win") {
    if (!c.s1 && c.t >= 0.4) { c.s1 = true; chime(); }
  } else {
    if (!c.s1 && u >= 0) { c.s1 = true; heartbeat(1); growl(); }
    if (!c.s2 && u >= 2.6) { c.s2 = true; scream(); }
  }
  if (G.state === "cutscene" && c.t >= c.dur) showEndPanel();
}

function update(dt) {
  mzTimerUpdate();
  if (MODE === "maizal" && G.state !== "menu" && mzOverlayTick(dt)) return;   // una pantalla negra pausa el juego
  if (G.cine && (G.state === "cutscene" || G.state === "end")) { updateCine(dt); return; }
  if (G.state !== "menu") fpTurnTick(G, dt);             // gira hacia quien te habla (o hacia el que huye)
  if (G.state === "shoot") { updateShoot(dt); return; }
  if (G.state === "dialog" && G.talkT != null) {         // el tiempo corre mientras decides (no mientras lees)
    if (!typerBusy()) {
      const before = Math.ceil(G.talkT);
      G.talkT -= dt;
      if (G.talkT <= 0) { dialogTimeout(); return; }

    }
    return;
  }
  if (G.state !== "play") return;
  mzAmbient(dt);
  mzRunnerTick();
  G.t += dt;

  if (G.flee) { fpFaceTo(G, G.flee.x, G.flee.y); mzFleeTick(dt); return; }   // te quedas helado viéndolo correr
  fpWalk(G, dt, MZ_BODY, MZ_WORLD, G.props);

  // Mapa explorado
  const cx = Math.floor(G.px), cy = Math.floor(G.py);
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS && Math.hypot(x + 0.5 - G.px, y + 0.5 - G.py) < 2.4) G.seen[y][x] = true;
  }

  // El alien siempre sabe dónde estás y cruza el maizal.
  moveAlienSearch(dt);
  mzSpawnTick(dt);
  mzFleeTick(dt);
  const ad = Math.hypot(G.ax - G.px, G.ay - G.py);
  if (ad < CFG.CATCH) {
    if (G.perk.shield) { G.perk.shield = 0; pushAlienAway(9); growl(); toast("¡Paul se lanza contra esa cosa! Corre.", "danger"); }
    else { endGame(false, "¡TE ATRAPÓ!", "El alien te encontró entre las plantas."); return; }
  }

  const danger = clamp(1 - ad / 6, 0, 1);
  G.beat -= dt;
  if (danger > 0.05 && G.beat <= 0) { heartbeat(danger); G.beat = 1.1 - 0.8 * danger; }
  G.growlT = (G.growlT || 0) - dt;
  if (ad < 7 && !isWall(Math.floor(G.ax), Math.floor(G.ay)) && G.growlT <= 0) { growl(); G.growlT = 8; }

  // Voces entre el maíz: cada uno se delata a su manera (o no)
  for (const e of G.enc) {
    if (e.done || !e.bark) continue;
    if (Math.hypot(e.x - G.px, e.y - G.py) < e.bark.r && G.t - (e.barkT ?? -1e9) > (e.bark.rep || 1e9)) {
      e.barkT = G.t; voice(e.bark.text, /^«/.test(e.bark.text) ? e.name : null, e.x, e.y); if (e.bark.laugh) nervousLaugh();
    }
  }

  // Los que se asoman: están en el maíz de enfrente, detrás de una mata, y se inclinan hacia un lado
  for (const e of G.enc) {
    if (e.done || e.mode !== "peek" || e.peek >= 1) continue;
    if (e.peek === 0 && Math.hypot(e.bx - G.px, e.by - G.py) > 3.6) continue;
    if (e.peek === 0) rustle();
    e.peek = Math.min(1, e.peek + dt * 1.1);
    const ease = 1 - (1 - e.peek) ** 2;
    e.tilt = 0.5 * ease;                                   // se inclina bastante
    if (e.sx != null) { e.x = e.sx + e.L[0] * 0.32 * ease; e.y = e.sy + e.L[1] * 0.32 * ease; }   // y asoma medio cuerpo fuera de la mata
  }

  // Encuentros con personas
  for (const e of G.enc) {
    if (e.done || (e.mode === "peek" && e.peek < 1)) continue;
    const r = e.mode === "hidden" ? 1.6 : CFG.TRIGGER;   // solo al que está dentro del maíz se le habla desde más lejos
    if (Math.hypot(e.x - G.px, e.y - G.py) < r) { startEncounter(e); return; }
  }

  // Salida
  if (Math.hypot(G.exit.x - G.px, G.exit.y - G.py) < 0.7) {
    if (G.enc.every(e => e.done) && !G.queue.length) {
      mzWin();
    } else if (G.t - G.toastT > 3) {
      toast("Todavía hay gente ahí dentro. No puedes irte aún.", "warn");
      G.toastT = G.t;
    }
  }
}

/* ============ Render (raycasting) ============ */
const cv = $("view"), ctx = cv.getContext("2d");
cv.width = W; cv.height = H;
ctx.imageSmoothingEnabled = false;
const tcv = makeCanvas(W, H), tctx = tcv.getContext("2d");
tctx.imageSmoothingEnabled = false;
/* ============ Motor 3D compartido (bar, maizal y el nivel final) ============
 * El motor hace la geometría: cámara, cielo, piso/techo por filas, paredes y muros bajos por rayos,
 * y sprites recortados por lo que tienen delante. Cada nivel describe su mundo y cómo se ilumina:
 *   cell(mx, my)  -> carácter de la casilla, o null si ahí empieza campo abierto (el rayo se va sin pared)
 *   floor(ch)     -> true si se camina por encima (el rayo sigue)
 *   low[ch]       -> { h, box: [x0, x1, y0, y1] } muro bajo que deja ver lo de atrás (el rayo sigue)
 *   lowMax        -> cuántos muros bajos seguidos se pintan por rayo (los de más atrás casi no se ven)
 *   wall(i, w)    -> pinta la columna i de una pared        (w: ch, perp, side, u, top, lineH, rdx, rdy)
 *   lowWall(i, w) -> pinta la columna i de un muro bajo     (w: además topFar, ftop, bot, dEnter)
 *   plane(rd, floor) -> prepara una fila de piso (floor) o techo; false = cielo. pixel(fx, fy, buf, o) la pinta
 *   shade(it, ty) -> color con el que se oscurece un sprite (o null)
 * Las alturas van en unidades de pared: la pared mide 1 y los ojos están a 0.5. */
const ENG = { z: new Float32Array(NCOLS), lowD: new Float32Array(NCOLS * 2), lowExit: new Float32Array(NCOLS * 2), lowN: new Uint8Array(NCOLS) };
const FULL_BOX = [0, 1, 0, 1];
function engCamera(px, py, ang, bobY, pitch) {
  const k = Math.tan(CFG.FOV / 2), dx = Math.cos(ang), dy = Math.sin(ang);
  return { px, py, ang, k, dx, dy, plx: -dy * k, ply: dx * k, hz: H / 2 + bobY + pitch };
}
function engSky(tex, cam) {                               // el cielo gira con la cámara y su borde inferior queda en el horizonte
  const skyH = tex.height, off = (((cam.ang * PXRAD) % SKYW) + SKYW) % SKYW;
  const drawH = Math.min(skyH, Math.ceil(cam.hz)), first = Math.min(W, SKYW - off), srcY = skyH - drawH;
  if (drawH <= 0) return;
  ctx.drawImage(tex, off, srcY, first, drawH, 0, 0, first, drawH);
  if (first < W) ctx.drawImage(tex, 0, srcY, W - first, drawH, first, 0, W - first, drawH);
}
let engPC = null, engPG = null, engPI = null;
function engPlanes(cam, world) {                          // piso y techo, fila por fila, a media resolución horizontal
  if (!engPC) { engPC = makeCanvas(NCOLS, H); engPG = engPC.getContext("2d"); engPI = engPG.createImageData(NCOLS, H); }
  const buf = engPI.data, r0x = cam.dx - cam.plx, r0y = cam.dy - cam.ply, r1x = cam.dx + cam.plx, r1y = cam.dy + cam.ply;
  if (world.planesBegin) world.planesBegin(cam, r0x, r0y, r1x, r1y);
  for (let y = 0; y < H; y++) {
    let o = y * NCOLS * 4;
    const p = y + 0.5 - cam.hz, floor = p > 0, rd = (H * 0.5) / Math.abs(p);
    if (Math.abs(p) < 1 || !world.plane(rd, floor, p)) { for (let x = 0; x < NCOLS; x++, o += 4) buf[o + 3] = 0; continue; }
    let fx = cam.px + rd * r0x, fy = cam.py + rd * r0y;
    const sx = rd * (r1x - r0x) / NCOLS, sy = rd * (r1y - r0y) / NCOLS;
    for (let x = 0; x < NCOLS; x++, fx += sx, fy += sy, o += 4) world.pixel(fx, fy, buf, o, x);
  }
  engPG.putImageData(engPI, 0, 0);
  ctx.drawImage(engPC, 0, 0, NCOLS, H, 0, 0, W, H);
}
const engLows = [];
function engWalls(cam, world) {
  const { px, py, dx, dy, plx, ply, hz } = cam, Z = ENG.z;
  for (let i = 0; i < NCOLS; i++) {
    const camX = 2 * i / NCOLS - 1, rdx = dx + plx * camX, rdy = dy + ply * camX;
    let mx = Math.floor(px), my = Math.floor(py);
    const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx), ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
    let stepX, stepY, sdx, sdy, side = 0, ch = null;
    if (rdx < 0) { stepX = -1; sdx = (px - mx) * ddx; } else { stepX = 1; sdx = (mx + 1 - px) * ddx; }
    if (rdy < 0) { stepY = -1; sdy = (py - my) * ddy; } else { stepY = 1; sdy = (my + 1 - py) * ddy; }
    engLows.length = 0;
    for (let n = 0; n < 64; n++) {
      if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
      ch = world.cell(mx, my);
      if (ch === null) break;
      if (world.floor(ch)) { ch = null; continue; }
      const lw = world.low[ch];
      if (lw) {                                           // caja dentro de la casilla: se calcula por dónde entra y sale el rayo
        const b = lw.box || FULL_BOX, x0 = mx + b[0], x1 = mx + b[1], y0 = my + b[2], y1 = my + b[3];
        let txn = -Infinity, txf = Infinity, tyn = -Infinity, tyf = Infinity;
        if (rdx !== 0) { const a1 = (x0 - px) / rdx, a2 = (x1 - px) / rdx; txn = Math.min(a1, a2); txf = Math.max(a1, a2); }
        else if (px < x0 || px > x1) { ch = null; continue; }
        if (rdy !== 0) { const a1 = (y0 - py) / rdy, a2 = (y1 - py) / rdy; tyn = Math.min(a1, a2); tyf = Math.max(a1, a2); }
        else if (py < y0 || py > y1) { ch = null; continue; }
        const tIn = Math.max(txn, tyn), tOut = Math.min(txf, tyf);
        if (tIn < tOut && tOut > 0 && engLows.length < (world.lowMax || 4)) engLows.push({ ch, h: lw.h, dEnter: Math.max(0.05, tIn), dExit: tOut, side: txn > tyn ? 0 : 1 });
        ch = null; continue;
      }
      break;                                              // pared entera
    }
    Z[i] = 1e9;
    if (ch !== null) {
      const perp = Math.max(0.05, side === 0 ? sdx - ddx : sdy - ddy);
      Z[i] = perp;
      let u = side === 0 ? py + perp * rdy : px + perp * rdx; u -= Math.floor(u);
      if ((side === 0 && rdx < 0) || (side === 1 && rdy > 0)) u = 1 - u;   // que los letreros no salgan en espejo
      const lineH = H / perp;
      world.wall(i, { ch, perp, side, u, top: hz - lineH / 2, lineH, rdx, rdy });
    }
    for (let j = engLows.length - 1; j >= 0; j--) {        // muros bajos, del más lejano al más cercano
      const L = engLows[j], lh = H / L.dEnter, bot = hz + lh * 0.5, ftop = bot - lh * L.h;
      let u = L.side === 0 ? py + L.dEnter * rdy : px + L.dEnter * rdx; u -= Math.floor(u);
      if ((L.side === 0 && rdx < 0) || (L.side === 1 && rdy > 0)) u = 1 - u;
      world.lowWall(i, { ch: L.ch, side: L.side, u, dEnter: L.dEnter, lineH: lh, bot, ftop, topFar: hz + (H / L.dExit) * (0.5 - L.h), rdx, rdy });
    }
    ENG.lowN[i] = Math.min(2, engLows.length);
    for (let j = 0; j < 2; j++) {                          // lo que hay detrás de un muro bajo se recorta por arriba de él
      ENG.lowD[i * 2 + j] = j < engLows.length ? engLows[j].dExit : 1e9;
      ENG.lowExit[i * 2 + j] = j < engLows.length ? hz + (H / engLows[j].dExit) * (0.5 - engLows[j].h) : H;
    }
  }
}
// items: { img, x, y, h (alto en paredes; el ancho sale de la imagen), lift (altura del pie) }.
// Se dibujan de lejos a cerca; onDrawn(it, r) recibe dónde quedó cada uno en pantalla (para halos de luz).
function engSprites(cam, items, shade, onDrawn) {
  const { px, py, dx, dy, plx, ply, hz } = cam, Z = ENG.z, inv = 1 / (plx * dy - dx * ply);
  for (const it of items) it.d = (it.x - px) ** 2 + (it.y - py) ** 2;
  items.sort((a, b) => b.d - a.d);
  for (const it of items) {
    const sx = it.x - px, sy = it.y - py;
    const tx = inv * (dy * sx - dx * sy), ty = inv * (-ply * sx + plx * sy);
    if (ty < 0.15) continue;
    const img = it.img, size = (H / ty) * it.h, wdt = size * img.width / img.height;
    const cx = (W / 2) * (1 + tx / ty), left = cx - wdt / 2;
    if (left > W || left + wdt < 0) continue;
    const bottom = hz + (H / ty) * (0.5 - (it.lift || 0)), top = bottom - size;
    if (bottom < 0 || top > H) continue;
    const i0 = Math.max(0, Math.floor(left / COL)), i1 = Math.min(NCOLS - 1, Math.floor((left + wdt) / COL));
    // Solo se toca el rectángulo del sprite: limpiar y oscurecer la pantalla entera por cada luciérnaga es carísimo
    const bx = i0 * COL, bw = (i1 + 1) * COL - bx, by = Math.max(0, Math.floor(top)), bh = Math.min(H, Math.ceil(bottom) + 1) - by;
    if (bw <= 0 || bh <= 0) continue;
    tctx.clearRect(bx, by, bw, bh);
    let any = false;
    for (let i = i0; i <= i1; i++) {
      if (ty >= Z[i]) continue;                            // tapado por una pared
      let clipY = H;
      for (let j = 0; j < ENG.lowN[i]; j++) if (ENG.lowD[i * 2 + j] < ty) clipY = Math.min(clipY, ENG.lowExit[i * 2 + j]);
      const visH = Math.min(size, clipY - top);
      if (visH <= 0) continue;
      const u = (i * COL + COL / 2 - left) / wdt;
      if (u < 0 || u >= 1) continue;
      tctx.drawImage(img, Math.floor(u * img.width), 0, 1, Math.max(1, img.height * visH / size), i * COL, top, COL, visH);
      any = true;
    }
    if (!any) continue;                                    // completamente tapado: ni se dibuja ni ilumina
    const f = shade(it, ty);
    if (f) {
      tctx.globalCompositeOperation = "source-atop";
      tctx.fillStyle = f; tctx.fillRect(bx, by, bw, bh);
      tctx.globalCompositeOperation = "source-over";
    }
    ctx.drawImage(tcv, bx, by, bw, bh, bx, by, bw, bh);
    if (onDrawn) onDrawn(it, { cx, bottom, size, ty });
  }
}
// Halo de luz aditivo (focos, fuego, rocola)
function engGlow(x, y, r, rgb, a) {
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = "source-over";
}
function engVignette(inner, a) {
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * inner, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(0,0,0,${a})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}
const cornTex = buildCorn();
// Maíz seco del borde: más bajo, amarillento y quebrado. Por encima se ve el cielo de verdad.
function buildDryCorn() {
  const c = makeCanvas(TEX, TEX), g = c.getContext("2d");
  g.fillStyle = "#211b0d"; g.fillRect(0, 0, TEX, TEX);
  const tones = ["#5a4a22", "#6e5a2a", "#806a34", "#4a3c1c", "#77643a"];
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(Math.random() * TEX), w = 2 + Math.floor(Math.random() * 3), top = Math.random() < 0.4 ? Math.floor(Math.random() * 24) : 0;
    g.fillStyle = tones[i % tones.length]; g.fillRect(x, top, w, TEX - top);                    // tallos, algunos quebrados
    g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(x + w - 1, top, 1, TEX - top);
  }
  for (let i = 0; i < 12; i++) {                        // hojas secas caídas
    const x = Math.floor(Math.random() * TEX), y = 10 + Math.floor(Math.random() * 50);
    g.fillStyle = tones[(i + 1) % tones.length];
    for (let k = 0; k < 9; k++) g.fillRect((x + k) % TEX, Math.min(TEX - 2, y + (k >> 1)), 2, 1);
  }
  const sh = g.createLinearGradient(0, 0, 0, TEX);
  sh.addColorStop(0, "rgba(0,0,0,.25)"); sh.addColorStop(0.3, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,.45)");
  g.fillStyle = sh; g.fillRect(0, 0, TEX, TEX);
  return c;
}
const dryTex = buildDryCorn();
// Borde superior del maizal: hojas en punta y espigas. Se pintan con los mismos colores de la parte
// alta de la textura del muro, así continúan cada tallo hacia arriba. Una versión por nivel de niebla.
const TIP_H = 24, TIP_FOG = 16;
function buildCornTips(src) {
  const mask = makeCanvas(TEX, TIP_H), m = mask.getContext("2d");
  m.fillStyle = "#fff"; m.fillRect(0, TIP_H - 3, TEX, 3);
  for (let i = 0; i < 34; i++) {                       // hojas que se abren hacia arriba
    const x = (i * 37 + Math.floor(Math.random() * 6)) % TEX, hh = 7 + Math.floor(Math.random() * 15), lean = Math.floor(Math.random() * 9) - 4;
    for (const ox of x < 4 ? [0, TEX] : x > TEX - 4 ? [0, -TEX] : [0]) {
      m.beginPath(); m.moveTo(x + ox - 2, TIP_H); m.lineTo(x + ox + lean, TIP_H - hh); m.lineTo(x + ox + 2, TIP_H); m.fill();
    }
  }
  const c = makeCanvas(TEX, TIP_H), g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, TEX, 2, 0, 0, TEX, TIP_H);                  // los colores del borde de arriba del muro
  g.globalCompositeOperation = "destination-in"; g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = "source-over";
  for (let i = 0; i < 6; i++) {                        // espigas secas, tan apagadas como el borde del muro
    const x = 4 + Math.floor(Math.random() * (TEX - 8)), top = 1 + Math.floor(Math.random() * 5);
    g.fillStyle = "#4e4424"; g.fillRect(x, top, 1, TIP_H - top - 4);
    g.fillStyle = "#675a2e"; g.fillRect(x - 2, top + 2, 2, 1); g.fillRect(x + 1, top + 4, 2, 1); g.fillRect(x - 1, top, 1, 2);
  }
  const out = [];
  for (let f = 0; f <= TIP_FOG; f++) {
    const v = makeCanvas(TEX, TIP_H), vg = v.getContext("2d");
    vg.drawImage(c, 0, 0);
    vg.globalCompositeOperation = "source-atop"; vg.fillStyle = `rgba(3,8,20,${(f / TIP_FOG * 0.97).toFixed(3)})`; vg.fillRect(0, 0, TEX, TIP_H);
    out.push(v);
  }
  return out;
}
const CORN_TIPS = buildCornTips(cornTex);
const GRASS_H = 16;
function buildGrass() {
  const c = makeCanvas(TEX, GRASS_H), g = c.getContext("2d");
  const cols = ["#2c4a24", "#36582a", "#40662e", "#56602e", "#6a5e34", "#2a3e20"];
  for (let i = 0; i < 70; i++) {                       // matas de hierba y tallos secos
    const x = (i * 23 + Math.floor(Math.random() * 7)) % TEX, h = 4 + Math.floor(Math.random() * 11), lean = Math.floor(Math.random() * 5) - 2;
    g.fillStyle = cols[i % cols.length];
    for (const ox of x < 3 ? [0, TEX] : x > TEX - 3 ? [0, -TEX] : [0]) { g.beginPath(); g.moveTo(x + ox - 1.5, GRASS_H); g.lineTo(x + ox + lean, GRASS_H - h); g.lineTo(x + ox + 1.5, GRASS_H); g.fill(); }
  }
  const out = [];
  for (let f = 0; f <= TIP_FOG; f++) {
    const v = makeCanvas(TEX, GRASS_H), vg = v.getContext("2d");
    vg.drawImage(c, 0, 0); vg.globalCompositeOperation = "source-atop";
    vg.fillStyle = `rgba(3,8,20,${(f / TIP_FOG * 0.97).toFixed(3)})`; vg.fillRect(0, 0, TEX, GRASS_H);
    out.push(v);
  }
  return out;
}
const GRASS = buildGrass();
const DRY_TIPS = buildCornTips(dryTex);
buildSprites();

function fogAlpha(dist, side) {
  return clamp(Math.pow(clamp(dist / FOG_D, 0, 1), 0.8) * 0.95 + (side ? 0.12 : 0), 0, 0.97);
}

function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/* ---------- El maizal visto por el motor: maíz alto, maíz seco del borde y tierra con niebla ---------- */
let mzRowK = 0, mzRowF = 0, mzShadows = [];
const MZ_WORLD = {
  cell: (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS) ? null : MAP[y][x],   // fuera del mapa: campo abierto
  floor: ch => ch !== "#" && ch !== "F",
  low: { F: { h: LOW_F } }, lowMax: 1,
  wall(i, w) {
    const tx = Math.min(TEX - 1, Math.floor(w.u * TEX)), fog = fogAlpha(w.perp, w.side), x = i * COL;
    ctx.drawImage(cornTex, tx, 0, 1, TEX, x, w.top, COL, w.lineH);
    ctx.fillStyle = `rgba(3,8,20,${fog.toFixed(3)})`; ctx.fillRect(x, w.top, COL, w.lineH);
    const fi = Math.min(TIP_FOG, Math.round(fog / 0.97 * TIP_FOG)), tipH = w.lineH * 0.3, gh = w.lineH * 0.26;
    ctx.drawImage(CORN_TIPS[fi], tx, 0, 1, TIP_H, x, w.top - tipH + 1, COL, tipH);          // las hojas sobresalen del bloque
    ctx.drawImage(GRASS[fi], tx, 0, 1, GRASS_H, x, w.top + w.lineH - gh * 0.62, COL, gh);  // y abajo, hierba sobre el borde del suelo
  },
  lowWall(i, w) {                                        // el borde: maíz seco y bajo
    const tx = Math.min(TEX - 1, Math.floor(w.u * TEX)), fog = fogAlpha(w.dEnter, w.side), x = i * COL, hh = w.bot - w.ftop;
    ctx.drawImage(dryTex, tx, 0, 1, TEX, x, w.ftop, COL, hh);
    ctx.fillStyle = `rgba(3,8,20,${fog.toFixed(3)})`; ctx.fillRect(x, w.ftop, COL, hh);
    const fi = Math.min(TIP_FOG, Math.round(fog / 0.97 * TIP_FOG)), tipH = w.lineH * 0.22, gh = w.lineH * 0.16;
    ctx.drawImage(DRY_TIPS[fi], tx, 0, 1, TIP_H, x, w.ftop - tipH + 1, COL, tipH);
    ctx.drawImage(GRASS[fi], tx, 0, 1, GRASS_H, x, w.bot - gh * 0.75, COL, gh);
  },
  plane(rd, floor) {                                     // solo suelo: arriba está el cielo
    if (!floor) return false;
    mzRowF = fogAlpha(rd, 0); mzRowK = (1 - mzRowF) * 0.5;
    return true;
  },
  planesBegin() { mzShadows = G.props ? G.props.filter(p => p.shadow) : []; },
  pixel(fx, fy, d, o) {
    const T = FT.dirt, ti = ((((fy * TEX) | 0) & (TEX - 1)) * TEX + (((fx * TEX) | 0) & (TEX - 1))) * 4;
    let k = mzRowK;
    for (const p of mzShadows) {                         // sombra y tierra quemada bajo la nave y la camioneta
      const sx = (fx - p.x) / p.shadow[0], sy = (fy - p.y) / p.shadow[1], q = sx * sx + sy * sy;
      if (q < 1) k *= 1 - p.shadow[2] * Math.sqrt(1 - q);
    }
    d[o] = T[ti] * k + 3 * mzRowF; d[o + 1] = T[ti + 1] * k + 8 * mzRowF; d[o + 2] = T[ti + 2] * k + 20 * mzRowF; d[o + 3] = 255;
  }
};
const mzShade = (it, ty) => `rgba(3,8,20,${(fogAlpha(ty, 0) * (it.glow ? 0.3 : (it.fogK || 1))).toFixed(3)})`;
function mzGlowAfter(it, r) {                            // el fuego verde ilumina alrededor, solo en la zona del choque
  if (!it.glow) return;
  const inCrash = MAP[Math.floor(G.py)] && MAP[Math.floor(G.py)][Math.floor(G.px)] === "o";
  if (!inCrash && r.ty >= 3) return;
  const a = clamp(0.5 - r.ty * 0.04, 0.12, 0.45) * (0.85 + 0.15 * Math.sin(G.t * 13));
  engGlow(r.cx, r.bottom - r.size * 0.25, r.size * 1.6, "110,255,140", a);
}
function render(skipCine) {
  if (!skipCine && G.cine && (G.state === "cutscene" || G.state === "end")) { renderCine(); return; }
  const adist = Math.hypot(G.ax - G.px, G.ay - G.py);
  const shake = clamp(1 - adist / 4, 0, 1) * 5;
  ctx.save();
  if (shake > 0.1) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  const cam = engCamera(G.px, G.py, G.ang, fpBobY(G, MZ_BODY), G.pitch), hz = cam.hz, k = cam.k;
  engSky(barSkyTex, cam);
  drawSkyLife(hz, performance.now() / 1000, G);
  engPlanes(cam, MZ_WORLD);

  // Luz verde de la salida, visible sobre el maíz lejano
  const delta = normAngle(Math.atan2(G.exit.y - G.py, G.exit.x - G.px) - G.ang);
  if (Math.abs(delta) < 1.4) {
    const bx = W / 2 + Math.tan(delta) / k * (W / 2);
    const pulse = 0.55 + Math.sin(G.t * 3) * 0.15;
    const bg = ctx.createLinearGradient(0, 0, 0, hz);
    bg.addColorStop(0, "rgba(190,255,100,0)"); bg.addColorStop(1, `rgba(190,255,100,${pulse})`);
    ctx.fillStyle = bg; ctx.fillRect(bx - 5, 0, 10, hz);
    ctx.fillStyle = `rgba(190,255,100,${pulse * 0.25})`; ctx.fillRect(bx - 16, 0, 32, hz);
  }

  engWalls(cam, MZ_WORLD);

  // Sprites (de lejos a cerca): restos del choque, personas y alien
  const items = [], M = mzSprites();
  if (M) for (const p of G.props || []) {
    const img = p.img === "ufo" ? M.ufo[Math.floor(G.t * 8) % 3] : M[p.img];
    if (img) items.push({ img, x: p.x, y: p.y, h: p.h * (img.hScale || 1), glow: p.glow, fogK: p.guide ? 0.6 : 1 });
  }
  for (const e of G.enc) {
    const shot = G.shot && G.shot.e === e;
    if ((e.done && !shot) || (e.mode === "hidden" && !shot)) continue;   // el escondido no se ve
    let img = mzImg(e);
    if (!img) continue;
    let hgt = personH(img);
    if (shot && e.impostor) {                               // la transformación: parpadea entre su cara y la del alien
      const t = G.shot.t;
      if (t >= 1.9 || (t > 0.75 && Math.random() < (t - 0.75) / 1.15 * 1.2)) { img = SPR.alien; hgt = 1.45; }
    }
    if (shot && G.shot.why === "mercy" && G.shot.t > SHOT_FIRE + 0.3) continue;   // se desploma en la oscuridad
    if (e.mode === "peek" && e.tilt > 0.01 && img !== SPR.alien) {
      const lat = e.L[0] * cam.plx + e.L[1] * cam.ply;          // hacia qué lado de la pantalla se inclina
      img = rotSprite(img, (lat >= 0 ? 1 : -1) * e.tilt);
    }
    items.push({ img, x: e.x, y: e.y, h: hgt, fogK: e.mode === "peek" ? 0.7 : 1 });   // el que se asoma resalta un poco más
  }
  if (G.flee && G.flee.img) {                               // el que se espantó: tiembla, y luego corre
    const f = G.flee;
    const img = f.t < 0.45 ? rotSprite(f.img, Math.sin(f.t * 40) * 0.1) : rotSprite(f.img, Math.sin(f.t * 22) > 0 ? 0.16 : -0.16);
    items.push({ img, x: f.x + (f.t < 0.45 ? Math.sin(f.t * 60) * 0.02 : 0), y: f.y, h: personH(f.img) });
  }
  if (M && G.flies) for (const f of G.flies) {              // luciérnagas sobre el maíz seco
    if (!mzFrozen()) G.flyT = performance.now() / 1000;
    const t = (G.flyT || 0) + f.ph;
    if (Math.sin(t * 1.7) < -0.6) continue;                  // se apagan y se prenden
    items.push({ img: M.fly, x: f.x + Math.sin(t * 0.7) * 0.3, y: f.y + Math.cos(t * 0.5) * 0.3, h: 0.04, fogK: 0.15, lift: 0.35 + Math.sin(t * 1.3) * 0.12 });
  }
  // El alien se mueve a saltos, como si a la imagen le faltaran cuadros
  const nowS = mzFrozen() ? (G.aq ? G.aq.t : 0) : performance.now() / 1000;
  if (!G.aq || nowS - G.aq.t > 0.12) G.aq = { t: nowS, x: G.ax + (Math.random() - 0.5) * 0.06, y: G.ay + (Math.random() - 0.5) * 0.06 };
  if (!isWall(Math.floor(G.ax), Math.floor(G.ay))) items.push({ img: SPR.alien, x: G.aq.x, y: G.aq.y, h: 1.45 });
  engSprites(cam, items, mzShade, mzGlowAfter);

  // Viñeta, peligro, minimapa y HUD
  engVignette(0.3, 0.65);

  const ad = Math.hypot(G.ax - G.px, G.ay - G.py);
  const danger = clamp(1 - ad / 6, 0, 1);
  if (danger > 0.02) {
    const dg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H);
    dg.addColorStop(0, "rgba(180,0,20,0)"); dg.addColorStop(1, `rgba(180,0,20,${(danger * 0.55).toFixed(3)})`);
    ctx.fillStyle = dg; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  if (G.state === "shoot") drawShootFX();
  if (G.state === "play" || G.state === "dialog") { if (G.showMap) drawMinimap(); drawHud(); }
  drawEcho(PAUSED ? 0 : 1 / 60);
  drawMzOverlay();
}

function drawMinimap() {
  const T = 5, ox = W - COLS * T - UI.m - 6, oy = UI.m + 6;
  uiBox(ox - 6, oy - 6, COLS * T + 12, ROWS * T + 12);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (!G.seen[y][x]) continue;
    const ch = MAP[y][x];
    ctx.fillStyle = ch === "F" ? "#7a6a34" : isWall(x, y) ? "#1f3a24" : ch === "X" ? "#c9ff78" : ch === "o" ? "#3a6a46" : ch === "=" ? "#9a8458" : "#6b5a3c";
    ctx.fillRect(ox + x * T, oy + y * T, T, T);
  }
  for (const e of G.enc) if (e.beacon && !e.done && Math.floor(performance.now() / 350) % 2) {   // el que volvió a perderse grita: se marca
    ctx.fillStyle = charColor(e.name, "#fff"); ctx.fillRect(ox + e.bx * T - 2.5, oy + e.by * T - 2.5, 5, 5);
  }
  if (G.perk && G.perk.stalin) {                          // Stalin siente dónde está esa cosa
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 160);
    ctx.fillStyle = `rgba(255,60,70,${pulse.toFixed(2)})`; ctx.fillRect(ox + G.ax * T - 2.5, oy + G.ay * T - 2.5, 5, 5);
  }
  const mx = ox + G.px * T, my = oy + G.py * T;
  ctx.fillStyle = "#ffe36b"; ctx.fillRect(mx - 2, my - 2, 4, 4);
  ctx.strokeStyle = "#ffe36b"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(G.ang) * 8, my + Math.sin(G.ang) * 8); ctx.stroke();
}

// Íconos de los amigos para el contador: a color y en gris, preparados una sola vez
// (filtrar el lienzo en cada cuadro es carísimo)
const ICONS = {};
function friendIcon(name, on) {
  const k = name + (on ? "1" : "0");
  if (ICONS[k]) return ICONS[k];
  const img = charSprite(name), c = headCrop(img), w = 22, h = Math.round(w * c.sh / c.sw);
  const cv2 = makeCanvas(w, h), g = cv2.getContext("2d");
  g.imageSmoothingEnabled = false; drawHead(g, img, 0, h, w);
  if (!on) {
    const id = g.getImageData(0, 0, w, h), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const v = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) * 0.6; d[i] = d[i + 1] = d[i + 2] = v; }
    g.putImageData(id, 0, 0);
  }
  return (ICONS[k] = cv2);
}
function drawHud() {
  if (BSPR.paul) FRIENDS.forEach((n, i) => {   // apagados hasta que se unen; tachados si se perdieron
    const S = 28, x = UI.m + i * (S + 6), y = UI.m, on = G.party.includes(n), lost = G.lost.includes(n);
    uiBox(x, y, S, S, on ? charColor(n) : lost ? UI.danger : UI.line);
    const ic = friendIcon(n, on);
    ctx.save(); if (!on) ctx.globalAlpha = lost ? 0.5 : 0.4;
    ctx.drawImage(ic, x + 3, y + S - 2 - ic.height);
    ctx.restore();
    if (lost) { ctx.strokeStyle = UI.danger; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + S - 6, y + S - 6); ctx.moveTo(x + S - 6, y + 6); ctx.lineTo(x + 6, y + S - 6); ctx.stroke(); }
  });
  if (G.state !== "play") return;
  hudCorner("[J] lo que sabes · [M] mapa", G.showMap ? ROWS * 5 + 40 : 22);   // debajo del minimapa
  hudMouseHint();
}

/* ============ Escenas finales ============ */
function mixc(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.substr(i, 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.substr(i, 2), 16));
  return "rgb(" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",") + ")";
}
const dawnStars = Array.from({ length: 120 }, () => ({ x: Math.random() * W, y: Math.random() * 215, a: rand(0.3, 1) }));
const dawnDust = Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: rand(2, 9), vy: rand(2, 12), ph: Math.random() * 6 }));

function cornStalk(x, baseY, s, e, sway) {
  const hgt = 130 * s, w = 11 * s;
  ctx.fillStyle = mixc("#0c1a10", "#3f6a2c", e * 0.9);
  for (let k = 0; k < 5; k++) {
    const bx = x + (k - 2) * 3.2 * s, lean = (k - 2) * 6 * s + sway * s;
    ctx.beginPath();
    ctx.moveTo(bx - w / 2, baseY);
    ctx.lineTo(bx + lean, baseY - hgt * (k % 2 ? 0.82 : 0.95));
    ctx.lineTo(bx + w / 2, baseY);
    ctx.fill();
  }
  ctx.fillStyle = mixc("#2a2410", "#e8c25a", e);
  ctx.fillRect(x - 1.5 * s, baseY - hgt * 0.5, 3 * s, 9 * s);
}

function renderDawn(t, crewImgs) {
  const p = clamp(t / 7, 0, 1), e = p * p * (3 - 2 * p), hy = 232;
  const sky = ctx.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, mixc("#070d20", "#3f74b8", e));
  sky.addColorStop(0.6, mixc("#16264a", "#f19a62", e));
  sky.addColorStop(1, mixc("#1c2a40", "#ffd98a", e));
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hy + 1);
  for (const st of dawnStars) { ctx.fillStyle = `rgba(255,255,255,${(st.a * (1 - e)).toFixed(3)})`; ctx.fillRect(st.x, st.y, 1.5, 1.5); }

  const sx = W / 2, sy = hy + 38 - e * 100;
  const glow = ctx.createRadialGradient(sx, sy, 5, sx, sy, 190);
  glow.addColorStop(0, `rgba(255,214,130,${(0.95 * e).toFixed(3)})`); glow.addColorStop(1, "rgba(255,214,130,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, hy + 1);
  ctx.fillStyle = mixc("#ffb35a", "#fff2b0", e); ctx.beginPath(); ctx.arc(sx, sy, 24, 0, 7); ctx.fill();

  ctx.globalCompositeOperation = "lighter";            // rayos de luz
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.24 + Math.sin(t * 0.4 + i) * 0.03;
    ctx.fillStyle = `rgba(255,220,150,${(0.07 * e).toFixed(3)})`;
    ctx.beginPath(); ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a - 0.05) * 420, sy + Math.sin(a - 0.05) * 420);
    ctx.lineTo(sx + Math.cos(a + 0.05) * 420, sy + Math.sin(a + 0.05) * 420);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  if (e > 0.55) {                                      // pájaros
    ctx.strokeStyle = `rgba(20,20,30,${(e * 0.8).toFixed(2)})`; ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const bx = ((t * 28 + i * 150) % (W + 60)) - 30, by = 55 + i * 20 + Math.sin(t * 3 + i) * 4, fl = Math.sin(t * 9 + i) * 3;
      ctx.beginPath(); ctx.moveTo(bx - 6, by + fl); ctx.lineTo(bx, by); ctx.lineTo(bx + 6, by + fl); ctx.stroke();
    }
  }
  for (let k = 0; k < 2; k++) {                        // colinas lejanas
    ctx.fillStyle = k ? mixc("#08130f", "#46533f", e) : mixc("#0c1626", "#7a6f78", e);
    ctx.beginPath(); ctx.moveTo(0, hy + 2);
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, hy - 14 - k * 10 - Math.sin(x * 0.012 + k * 2) * (10 + k * 5));
    ctx.lineTo(W, hy + 2); ctx.fill();
  }
  const gr = ctx.createLinearGradient(0, hy, 0, H);
  gr.addColorStop(0, mixc("#0d0f0b", "#8c7a4a", e)); gr.addColorStop(1, mixc("#050805", "#3a3020", e));
  ctx.fillStyle = gr; ctx.fillRect(0, hy, W, H - hy);
  const half = y => 3 + 147 * (y - hy) / (H - hy);
  ctx.fillStyle = mixc("#15110c", "#b38d58", e);       // camino
  ctx.beginPath(); ctx.moveTo(W / 2 - 3, hy); ctx.lineTo(W / 2 + 3, hy); ctx.lineTo(W / 2 + 150, H); ctx.lineTo(W / 2 - 150, H); ctx.fill();

  for (let j = 0; j <= 14; j++) {                      // maizal a los lados, de lejos a cerca
    const q = 1 - j / 14, y = hy + 2 + (H + 20 - hy) * Math.pow(q, 1.7);
    const s = clamp((y - hy) / (H - hy), 0.03, 1.2) * 1.1, hw = half(y);
    for (let m = 0; m < 3; m++) {
      const off = hw + 22 * s + m * 18 * s, sw = Math.sin(t * 1.3 + j + m) * 2;
      cornStalk(W / 2 - off, y, s, e, sw); cornStalk(W / 2 + off, y, s, e, -sw);
    }
  }

  // El grupo camina hacia la luz
  const M = mzSprites();
  const SLOTS = [[0, 0.2], [-0.5, 0.3], [0.5, 0.3], [-0.25, 0.38], [0.25, 0.38]];
  const crew = crewImgs ? crewImgs.map((img, i) => [img, ...SLOTS[i]])
    : [[BSPR.pepe, 0, 0.2], [BSPR.samira, -0.5, 0.3], [BSPR.sebas, 0.5, 0.3], [BSPR.stalin, -0.25, 0.38], [M ? M.paulStand : BSPR.paul, 0.25, 0.38]];
  const list = crew.map(([img, off, d0], i) => {
    const d = clamp(d0 + t * 0.04, 0, 0.8), y0 = hy + 2 + (H - hy) * Math.pow(1 - d, 1.7);
    const sz = (y0 - hy) / (H - hy) * 190 + 10, y = y0 - Math.abs(Math.sin(t * 5 + i * 1.3)) * 3 * (sz / 190);
    return { img, x: W / 2 + off * half(y0) * 0.8, y, sz };
  }).sort((a, b) => a.y - b.y);
  for (const f of list) {
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(f.x, f.y, f.sz * 0.25, f.sz * 0.05, 0, 0, 7); ctx.fill();
    tctx.clearRect(0, 0, W, H);
    const img = typeof f.img === "function" ? f.img(t) : f.img;          // el otro Pepe: a ratos se le ve lo que es
    const sz = img === SPR.alien ? f.sz * 1.7 : f.sz, fw = sz * img.width / img.height;
    tctx.drawImage(img, f.x - fw / 2, f.y - sz * 0.97, fw, sz);
    tctx.globalCompositeOperation = "source-atop";
    tctx.fillStyle = `rgba(8,10,20,${(0.82 - 0.4 * e).toFixed(2)})`; tctx.fillRect(0, 0, W, H);
    tctx.globalCompositeOperation = "source-over";
    ctx.drawImage(tcv, 0, 0);
  }

  for (const d of dawnDust) {                           // polen flotando
    const x = (d.x + t * d.vx) % W, y = ((d.y - t * d.vy) % H + H) % H;
    ctx.fillStyle = `rgba(255,230,150,${(0.55 * e * (0.5 + 0.5 * Math.sin(t * 2 + d.ph))).toFixed(3)})`;
    ctx.fillRect(x, y, 2, 2);
  }
  for (const [fx, fs] of [[18, 1.7], [64, 1.4], [W - 18, 1.7], [W - 64, 1.4]]) cornStalk(fx, H + 12, fs, e, Math.sin(t * 1.1 + fx) * 3);

  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.45)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  if (t < 1) { ctx.fillStyle = `rgba(0,0,0,${(1 - t).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
}

function glitchStrips(n, maxShift) {
  for (let k = 0; k < n; k++) {
    const y = Math.random() * H, h = 6 + Math.random() * 34, dx = (Math.random() - 0.5) * 2 * maxShift;
    ctx.drawImage(cv, 0, y, W, h, dx, y, W, h);
  }
}
function drawAlienAt(cx, cy, size) {
  const img = SPR.alien, w = size * img.width / img.height;
  const x0 = cx - w / 2, y0 = cy - size / 2;
  ctx.drawImage(img, x0, y0, w, size);
}
function drawDeathFace(a, u) {                    // en la oscuridad queda su cara, borrosa, mirándote
  const s = H * (0.9 + Math.sin(u * 1.3) * 0.02);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.filter = "blur(3px) brightness(0.55) contrast(1.15)";
  ctx.drawImage(SPR.alien, 16, 0, 64, 67, W / 2 - s * 0.48, H * 0.5 - s * 0.5, s * 0.955, s);
  ctx.restore();
}

function renderLose(t) {
  const c = G.cine, u = t - c.t0;
  if (u < 3.6) {
    render(true);                                        // el maizal de fondo
    ctx.fillStyle = `rgba(0,0,0,${(u < 0 ? 0.25 : clamp(0.35 + u * 0.15, 0, 0.7)).toFixed(2)})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (u < 0) {                                           // antes del alien: la víctima o el impostor
    const f = t / c.t0, img = c.img || BSPR.pepe, asp = img.width / img.height;
    ctx.save();
    if (c.kind === "friend") {                           // cae de lado
      ctx.translate(W / 2, H * 0.85); ctx.rotate(f * f * Math.PI / 2);
      ctx.drawImage(img, -130 * asp, -260, 260 * asp, 260);
    } else {
      const sz = 240 + f * 140, jx = (Math.random() - 0.5) * f * 8;
      ctx.drawImage(img, W / 2 - sz * asp / 2 + jx, H * 0.92 - sz, sz * asp, sz);
    }
    ctx.restore();
    ctx.fillStyle = `rgba(200,0,20,${(f * 0.4).toFixed(2)})`; ctx.fillRect(0, 0, W, H);
    if (c.kind === "fake" && f > 0.55) glitchStrips(4, 18 * f);
    return;
  }
  if (u < 1.8) {                                         // se acerca a saltos, como si faltaran cuadros
    const st = Math.floor(u * 8) / 8, size = 70 + (st / 1.8) * 200;
    drawAlienAt(W / 2 + (Math.random() - 0.5) * 3, H * 0.62 + size * 0.3 - size / 2, size);
    if (Math.random() < 0.05) { ctx.fillStyle = "rgba(0,0,0,.9)"; ctx.fillRect(0, 0, W, H); }
  } else if (u < 2.6) {                                  // embestida
    const q = (u - 1.8) / 0.8, size = 270 * Math.pow(1500 / 270, q * q);
    ctx.save(); ctx.translate((Math.random() - 0.5) * q * 16, (Math.random() - 0.5) * q * 16);
    drawAlienAt(W / 2, H * 0.48, size);
    ctx.restore();
    ctx.fillStyle = `rgba(200,0,20,${(q * 0.5).toFixed(2)})`; ctx.fillRect(0, 0, W, H);
  } else if (u < 3.6) {                                  // primer plano de la cara
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const size = H * (0.98 + Math.sin(u * 30) * 0.03), jx = (Math.random() - 0.5) * 14, jy = (Math.random() - 0.5) * 14;
    ctx.drawImage(SPR.alien, 16, 0, 64, 74, W / 2 - size * 0.43 + jx, H / 2 - size * 0.5 + jy, size * 0.865, size);
    const ph = Math.floor(u * 14) % 3;
    if (ph === 0) { ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.fillRect(0, 0, W, H); }
    else if (ph === 1) { ctx.fillStyle = "rgba(200,0,20,.4)"; ctx.fillRect(0, 0, W, H); }
    glitchStrips(7, 40);
  } else {                                               // oscuridad y dos ojos rojos
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 50; i++) { ctx.fillStyle = `rgba(160,160,160,${rand(0.03, 0.14).toFixed(2)})`; ctx.fillRect(Math.random() * W, Math.random() * H, rand(2, 14), 1); }
    const a = clamp((u - 3.9) / 0.6, 0, 1) * (0.75 + 0.25 * Math.sin(u * 6));
    if (a > 0) drawDeathFace(a, u);
  }
}

function renderCine() {
  const c = G.cine;
  if (c.type === "win") renderDawn(c.t); else renderLose(c.t);
}

/* =====================================================================
 * NIVEL 1 · LA ÚLTIMA PARADA (el bar)
 * Pepe llega tarde al cumpleaños de Stalin. Todos están peleados.
 * Las verdades que importan son las incómodas, y el viejo de la barra
 * escucha todo lo que se dice cerca de él.
 * ===================================================================== */
let MODE = "menu";
function tone(hex, k) {                 // aclara (k>0) u oscurece (k<0) un color
  const n = parseInt(hex.slice(1), 16);
  const ch = sh => { const v = (n >> sh) & 255; return Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k); };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}                 // "menu" | "bar" | "maizal"
const BAR_LIMIT = 30;              // minutos entre las 23:30 y las 00:00
const EARSHOT = 3.2;               // radio en el que don Lucho escucha

// # madera · G guitarra · L calendario · S neón · H perchero · D pizarra · B estantería · V ventana · P cartel · X salida · C barra
// A adobe · F cerca de carrizo (baja) · K puerta del baño · O campo abierto · . piso · , pasillo · _ patio
// ; paso techado del salón al patio
const BAR_RAW = [
  "#BBBB###",
  "#....###",
  "#CCC...X",
  "G......V",
  "P......S",
  "H......#",
  "#,#D;#L#",
  "#,#A__A#",
  "#,#A__A#",
  "#,#A__A#",
  "#K#FFFF#",
  "###OOOO#"
];
const BCOLS = 8, BROWS = BAR_RAW.length;
const bTile = (x, y) => (x < 0 || y < 0 || x >= BCOLS || y >= BROWS) ? "#" : BAR_RAW[y][x];
const bFloor = c => c === "." || c === "_" || c === "," || c === ";";
const LOW_H = { C: 0.42, F: 0.46 }; // barra y cerca del patio (las paredes miden 1)
const LOW_TOP = { C: "#5a3820", F: "#2a2216" };
const LOW_BOX = { C: [0, 1, 0, 0.45], F: [0, 1, 0, 0.14] };    // la barra ocupa solo el fondo de la casilla, junto a doña Carmen
function zoneAt(x, y) {
  const c = bTile(Math.floor(x), Math.floor(y));
  return (c === "_" || c === "O" || c === "F" || y >= BROWS) ? "patio" : c === "," ? "pasillo" : "salon";
}

/* ---------- Texturas del bar ---------- */
function texWood(dark) {
  const c = makeCanvas(TEX, TEX), g = c.getContext("2d");
  const base = dark ? ["#2a1a10", "#311f13", "#261710", "#2d1c11"] : ["#4a2e1b", "#55351f", "#432a18", "#5c3a22", "#4f311c"];
  for (let x = 0; x < TEX; x += 8) {                              // tablones verticales
    g.fillStyle = base[(x / 8) % base.length]; g.fillRect(x, 0, 8, 40);
    g.fillStyle = "rgba(255,210,160,.08)"; g.fillRect(x, 0, 1, 40);
    g.fillStyle = "rgba(0,0,0,.5)"; g.fillRect(x + 7, 0, 1, 40);
    for (let k = 0; k < 5; k++) { g.fillStyle = "rgba(0,0,0,.16)"; g.fillRect(x + 1 + Math.floor(Math.random() * 5), Math.floor(Math.random() * 34), 1, 3 + Math.floor(Math.random() * 9)); }
    if (Math.random() < 0.4) { const ky = 8 + Math.floor(Math.random() * 24); g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(x + 3, ky, 2, 2); g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(x + 2, ky - 1, 4, 1); g.fillRect(x + 2, ky + 2, 4, 1); }
    g.fillStyle = "#140c07"; g.fillRect(x + 3, 5, 1, 1); g.fillRect(x + 3, 37, 1, 1);   // clavos
  }
  g.fillStyle = "#1e120a"; g.fillRect(0, 0, TEX, 3); g.fillStyle = "#6b4426"; g.fillRect(0, 3, TEX, 1);     // cornisa
  g.fillStyle = "#6b4426"; g.fillRect(0, 40, TEX, 2); g.fillStyle = "#8a5a32"; g.fillRect(0, 40, TEX, 1);   // friso
  g.fillStyle = "#140c06"; g.fillRect(0, 42, TEX, 1);
  g.fillStyle = dark ? "#1e120a" : "#2c1b0f"; g.fillRect(0, 43, TEX, 17);                                   // zócalo con paneles
  for (let x = 2; x < TEX; x += 16) {
    g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(x, 46, 12, 1); g.fillRect(x, 46, 1, 11);
    g.fillStyle = "rgba(255,200,150,.09)"; g.fillRect(x, 57, 12, 1); g.fillRect(x + 11, 46, 1, 11);
  }
  g.fillStyle = "#0e0804"; g.fillRect(0, 60, TEX, 4); g.fillStyle = "#4a2e1b"; g.fillRect(0, 60, TEX, 1);     // rodapié
  for (let i = 0; i < 3; i++) {                                                                           // manchas de humedad
    const sx = Math.random() * TEX, sy = 10 + Math.random() * 40, r = 4 + Math.random() * 8;
    const st = g.createRadialGradient(sx, sy, 0, sx, sy, r); st.addColorStop(0, "rgba(0,0,0,.18)"); st.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = st; g.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  return c;
}
// Paredes con decoración: cada una es un detalle del lugar
function texDecor(kind) {
  const c = texWood(false), g = c.getContext("2d");
  const R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  if (kind === "G") {                                              // guitarra colgada y una foto vieja
    R("#2a1a0f", 19, 3, 3, 13); R("#1a0f08", 18, 1, 5, 4);
    g.fillStyle = "#7a4a22"; g.beginPath(); g.ellipse(20.5, 22, 5, 4.5, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(20.5, 30, 7, 6, 0, 0, 7); g.fill();
    g.fillStyle = "#9a6a32"; g.beginPath(); g.ellipse(18.5, 29, 3, 3, 0, 0, 7); g.fill();
    R("#0a0604", 19, 24, 3, 3); for (const x of [19, 20, 21]) R("rgba(230,220,190,.6)", x, 4, 1, 30);
    R("#1a0f08", 34, 8, 22, 18); R("#c8b48a", 36, 10, 18, 14); R("#8a7a5a", 36, 18, 18, 6);
    for (const x of [39, 44, 49]) { R("#4a3a2a", x, 13, 3, 3); R("#5a4a34", x, 16, 3, 5); }
  } else if (kind === "L") {                                       // reloj detenido y calendario
    g.fillStyle = "#d8cfb4"; g.beginPath(); g.arc(32, 9, 6, 0, 7); g.fill(); g.strokeStyle = "#2a1a10"; g.lineWidth = 1; g.stroke();
    R("#1a120c", 32, 5, 1, 4); R("#1a120c", 32, 9, 3, 1);
    R("#e6dfc8", 21, 18, 22, 22); R("#8a2a1a", 21, 18, 22, 5);
    g.fillStyle = "#f0e8d0"; g.font = "bold 5px monospace"; g.textAlign = "center"; g.fillText("NOV", 32, 22.5);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) R("#a89a7a", 22 + k * 3.4, 25 + r * 3.6, 2, 2);
    g.strokeStyle = "#c01818"; g.lineWidth = 1; g.beginPath(); g.arc(30.5, 29.2, 2.6, 0, 7); g.stroke();
  } else if (kind === "S") {                                       // letrero de neón de cerveza
    R("#0c0807", 6, 10, 52, 22); R("#2a1a10", 6, 10, 52, 1);
    g.shadowColor = "#ffb030"; g.shadowBlur = 6; g.fillStyle = "#ffd060"; g.font = "bold 10px monospace"; g.textAlign = "center"; g.fillText("CONDOR", 32, 22);
    g.shadowColor = "#ff3020"; g.fillStyle = "#ff5a3a"; g.fillRect(12, 26, 40, 1); g.font = "bold 5px monospace"; g.fillText("BIEN HELADA", 32, 31);
    g.shadowBlur = 0;
  } else if (kind === "H") {                                       // perchero con sombrero y cobija
    for (const x of [12, 30, 48]) R("#c9a24a", x, 8, 2, 2);
    R("#1e1a18", 6, 12, 14, 2); R("#2a2420", 9, 7, 8, 5); R("#140f0c", 9, 11, 8, 1);
    for (let y = 10; y < 38; y++) {
      const band = Math.floor((y - 10) / 3) % 4;
      R(["#8a2a1a", "#c87a2a", "#1a1410", "#2a5a6a"][band], 26, y, 28, 1);
    }
    for (let x = 26; x < 54; x += 2) R("#5a1a10", x, 38, 1, 3);
  } else if (kind === "D") {                                       // pizarra con el menú
    R("#5a3a22", 6, 6, 52, 32); R("#18201c", 8, 8, 48, 28);
    g.fillStyle = "#d8dccf"; g.font = "5px monospace"; g.textAlign = "left";
    g.fillText("FRITADA   $4", 11, 15); g.fillText("EMPANADA  $1", 11, 22); g.fillText("CANELAZO  $2", 11, 29);
    g.strokeStyle = "#cfd4c4"; g.beginPath(); g.ellipse(48, 30, 4, 1.5, 0, 0, 7); g.stroke(); g.beginPath(); g.arc(48, 29, 2, Math.PI, 0); g.stroke();
  }
  return c;
}
// Texturas del piso y del techo (se leen píxel a píxel)
function texPlanksFloor() {
  const c = makeCanvas(TEX, TEX), g = c.getContext("2d");
  const cols = ["#4a2e1a", "#40281a", "#53341e", "#3a2416"];
  for (let r = 0; r < 4; r++) {
    const y = r * 16, joint = (r * 23) % 64;
    g.fillStyle = cols[r]; g.fillRect(0, y, TEX, 16);
    for (let k = 0; k < 10; k++) { g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(Math.floor(Math.random() * 60), y + 2 + Math.floor(Math.random() * 12), 3 + Math.floor(Math.random() * 10), 1); }
    g.fillStyle = "rgba(255,210,160,.07)"; g.fillRect(0, y + 1, TEX, 1);
    g.fillStyle = "#140b06"; g.fillRect(0, y + 15, TEX, 1); g.fillRect(joint, y, 1, 16);
    g.fillStyle = "#0e0804"; g.fillRect(joint + 2, y + 3, 1, 1); g.fillRect(joint - 3, y + 12, 1, 1);
  }
  const wear = g.createRadialGradient(32, 32, 4, 32, 32, 40);                 // desgaste del paso
  wear.addColorStop(0, "rgba(255,220,180,.06)"); wear.addColorStop(1, "rgba(0,0,0,.1)");
  g.fillStyle = wear; g.fillRect(0, 0, TEX, TEX);
  return c;
}
function texTilesFloor() {
  const c = makeCanvas(TEX, TEX), g = c.getContext("2d");
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
    g.fillStyle = (r + k) % 2 ? "#2a2826" : "#9a9280"; g.fillRect(k * 16, r * 16, 16, 16);
    g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(k * 16, r * 16 + 15, 16, 1); g.fillRect(k * 16 + 15, r * 16, 1, 16);
  }
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(40,30,20,${rand(0.05, 0.2).toFixed(2)})`; g.fillRect(Math.random() * TEX, Math.random() * TEX, 2, 2); }
  g.strokeStyle = "rgba(0,0,0,.4)"; g.beginPath(); g.moveTo(10, 4); g.lineTo(14, 12); g.lineTo(12, 20); g.stroke();
  return c;
}
function texDirt() {
  const c = makeCanvas(TEX, TEX), g = c.getContext("2d");
  g.fillStyle = "#2e251a"; g.fillRect(0, 0, TEX, TEX);
  for (let i = 0; i < 300; i++) { g.fillStyle = Math.random() < 0.5 ? "rgba(0,0,0,.2)" : "rgba(160,130,90,.12)"; g.fillRect(Math.random() * TEX, Math.random() * TEX, 2, 1); }
  for (let i = 0; i < 6; i++) { const x = Math.random() * 58, y = Math.random() * 58; g.fillStyle = "#4a4236"; g.fillRect(x, y, 4, 3); g.fillStyle = "#6a6050"; g.fillRect(x, y, 3, 1); g.fillStyle = "#14100c"; g.fillRect(x, y + 3, 4, 1); }
  for (let i = 0; i < 5; i++) { const x = Math.random() * 60, y = Math.random() * 60; g.fillStyle = "#2a3a1e"; for (let k = 0; k < 4; k++) g.fillRect(x + k, y - k % 2, 1, 3); }
  return c;
}
function texCeiling() {
  const c = makeCanvas(TEX, TEX), g = c.getContext("2d");
  for (let r = 0; r < 8; r++) { g.fillStyle = r % 2 ? "#2a1a10" : "#24160d"; g.fillRect(0, r * 8, TEX, 8); g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(0, r * 8 + 7, TEX, 1); }
  g.fillStyle = "#150c06"; g.fillRect(0, 0, 10, TEX);                          // viga
  g.fillStyle = "#3a2414"; g.fillRect(8, 0, 2, TEX); g.fillStyle = "#0a0503"; g.fillRect(10, 0, 1, TEX);
  const st = g.createRadialGradient(44, 30, 0, 44, 30, 12); st.addColorStop(0, "rgba(0,0,0,.25)"); st.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = st; g.fillRect(30, 16, 28, 28);
  return c;
}
function texShelves() {
  const c = texWood(true), g = c.getContext("2d");
  const glass = ["#3d6b3a", "#6b3a22", "#c9a24a", "#2c4a6e", "#7a1f2a", "#d8d2b0"];
  for (const sy of [8, 24, 40]) {
    g.fillStyle = "#1a0f08"; g.fillRect(0, sy + 12, TEX, 3);
    g.fillStyle = "#5a3a22"; g.fillRect(0, sy + 12, TEX, 1);
    for (let x = 2; x < TEX - 3; x += 5 + Math.floor(Math.random() * 3)) {
      const h = 7 + Math.floor(Math.random() * 5), col = pick(glass);
      g.fillStyle = col; g.fillRect(x, sy + 12 - h, 3, h);
      g.fillRect(x + 1, sy + 12 - h - 2, 1, 2);
      g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(x, sy + 13 - h, 1, h - 3);
      g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(x + 2, sy + 12 - h, 1, h);
    }
  }
  return c;
}
function texWindow() {
  const c = texWood(false), g = c.getContext("2d");
  g.fillStyle = "#1c120a"; g.fillRect(10, 8, 44, 34);
  const gr = g.createLinearGradient(0, 10, 0, 40);
  gr.addColorStop(0, "#060a14"); gr.addColorStop(1, "#101a2a");
  g.fillStyle = gr; g.fillRect(12, 10, 40, 30);
  g.fillStyle = "#1c120a"; g.fillRect(31, 10, 2, 30); g.fillRect(12, 24, 40, 2);
  g.fillStyle = "rgba(160,190,220,.18)"; g.fillRect(14, 12, 3, 10); g.fillRect(35, 27, 2, 9);
  g.fillStyle = "rgba(255,200,140,.25)"; g.fillRect(44, 14, 2, 2);          // reflejo de un foco
  return c;
}
function texPoster() {
  const c = texWood(false), g = c.getContext("2d");
  g.save(); g.translate(32, 24); g.rotate(-0.04);
  g.fillStyle = "#cfc4a2"; g.fillRect(-15, -18, 30, 38);
  g.fillStyle = "rgba(90,70,40,.35)"; g.fillRect(-15, 12, 30, 8);
  g.fillStyle = "#3a2a1a"; g.font = "bold 7px monospace"; g.textAlign = "center";
  g.fillText("SE BUSCA", 0, -11);
  g.fillStyle = "#9a9078"; g.fillRect(-8, -8, 16, 15);                     // foto desteñida
  g.fillStyle = "#6e6550"; g.fillRect(-4, -6, 8, 8); g.fillRect(-6, -8, 12, 2);
  g.fillStyle = "#5a5240"; g.fillRect(-6, 2, 12, 5);
  g.fillStyle = "#4a3c2a"; for (let k = 0; k < 4; k++) g.fillRect(-11, 10 + k * 2, 22 - k * 3, 1);
  g.fillStyle = "#8a2a1a"; g.fillRect(-15, -18, 3, 3);                    // chinche
  g.restore();
  return c;
}
function texDoor(label) {
  const c = makeCanvas(TEX, TEX), g = c.getContext("2d");
  g.fillStyle = "#2a1a10"; g.fillRect(0, 0, TEX, TEX);
  g.fillStyle = "#5b3a22"; g.fillRect(12, 4, 40, 60);
  g.fillStyle = "#4a2e1b"; g.fillRect(16, 10, 32, 20); g.fillRect(16, 36, 32, 24);
  g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(16, 29, 32, 1); g.fillRect(47, 10, 1, 50);
  g.fillStyle = "#c9a24a"; g.fillRect(44, 34, 3, 3);
  g.fillStyle = "#d8cfb4"; g.fillRect(18, 14, 28, 9);
  g.fillStyle = "#2a1a10"; g.font = "bold 6px monospace"; g.textAlign = "center"; g.fillText(label, 32, 21);
  return c;
}
function texCounter() {
  const c = makeCanvas(TEX, TEX), g = c.getContext("2d");
  g.fillStyle = "#3a2314"; g.fillRect(0, 0, TEX, TEX);
  g.fillStyle = "#6b4426"; g.fillRect(0, 0, TEX, 6);                      // canto superior
  g.fillStyle = "#8a5a32"; g.fillRect(0, 0, TEX, 1);
  for (let x = 0; x < TEX; x += 16) {
    g.fillStyle = "#2c1a0f"; g.fillRect(x + 2, 12, 12, 40);
    g.fillStyle = "#452a18"; g.fillRect(x + 3, 13, 10, 38);
    g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(x + 12, 13, 1, 38);
  }
  g.fillStyle = "#1d110a"; g.fillRect(0, 56, TEX, 8);
  g.fillStyle = "#7a7a72"; g.fillRect(0, 58, TEX, 2);                     // reposapiés metálico
  return c;
}
function texFence() {
  const c = makeCanvas(TEX, TEX), g = c.getContext("2d");
  g.fillStyle = "#0e0c08"; g.fillRect(0, 0, TEX, TEX);
  for (let x = 0; x < TEX; x += 3) {
    const h = 6 + Math.floor(Math.random() * 6);
    g.fillStyle = pick(["#5a4a2c", "#4a3c22", "#6a5834"]); g.fillRect(x, h, 2, TEX - h);
    g.fillStyle = "rgba(0,0,0,.4)"; g.fillRect(x + 1, h, 1, TEX - h);
  }
  g.fillStyle = "#2a2014"; g.fillRect(0, 20, TEX, 2); g.fillRect(0, 44, TEX, 2);
  return c;
}

/* ---------- Sprites del bar ---------- */
function makeSprite(w, h, painter) {
  const c = makeCanvas(w, h), g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  painter((col, x, y, ww, hh) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); }, g);
  return c;
}
// Persona de pie o sentada (32x48), brazos abajo
// Con gorro (o.partyHat / o.ushanka) el lienzo crece HAT_PAD filas hacia arriba para que quepa.
const HAT_PAD = 5;
function personSprite(o) {
  const pad = o.partyHat || o.ushanka ? HAT_PAD : 0;
  const spr = makeSprite(32, 48 + pad, R0 => {
    const R = (c, x, y, w, h) => R0(c, x, y + pad, w, h);
    const sk = o.skin || "#c08a62", skD = tone(sk, -0.28), jk = o.jacket, jkD = tone(jk, -0.38), jkL = tone(jk, 0.14);
    const pt = o.pants || "#202a3c", ptD = tone(pt, -0.4), hr = o.hair || "#1a1210", hrL = tone(hr, 0.25);
    R("rgba(0,0,0,.45)", 6, 45, 20, 3);
    if (!o.seated) {
      R(pt, 11, 30, 4, 14); R(pt, 17, 30, 4, 14); R(ptD, 14, 30, 1, 14); R(ptD, 20, 31, 1, 13);
      R("#120d09", 10, 43, 6, 3); R("#120d09", 16, 43, 6, 3);
    } else {
      R(pt, 10, 30, 12, 5); R(ptD, 10, 34, 12, 1);
      R(pt, 11, 35, 4, 8); R(pt, 17, 35, 4, 8); R(ptD, 14, 35, 1, 8);
      R("#120d09", 10, 42, 6, 3); R("#120d09", 16, 42, 6, 3);
    }
    if (o.apron) { R(jk, 9, 15, 14, 16); R("#cfc7b0", 11, 19, 10, 13); R("#a8a08a", 11, 30, 10, 2); }
    else { R(jk, 9, 15, 14, 16); R(jkD, 20, 15, 3, 16); R(jkL, 10, 16, 2, 12); R(jkD, 9, 29, 14, 2); }
    if (o.shirt) { R(o.shirt, 14, 15, 4, 12); R(tone(o.shirt, -0.3), 17, 15, 1, 12); }
    R(jk, 6, 16, 3, 13); R(jk, 23, 16, 3, 13); R(jkD, 25, 16, 1, 13); R(jkL, 6, 16, 1, 9);
    R(sk, 6, 29, 3, 3); R(sk, 23, 29, 3, 3); R(skD, 8, 30, 1, 2); R(skD, 25, 30, 1, 2);
    if (o.poncho) {                                                           // poncho rojo desteñido
      const pc = o.poncho, pcD = tone(pc, -0.35);
      R(pc, 6, 14, 20, 18); R(pc, 5, 18, 22, 12); R(pcD, 21, 14, 6, 18); R(tone(pc, 0.12), 7, 15, 3, 10);
      R(pcD, 5, 24, 22, 1); R("#9a8a62", 5, 25, 22, 1); R(pcD, 5, 26, 22, 1);       // una sola franja tejida
      for (let x = 5; x < 27; x += 2) R(pcD, x, 31, 1, 2);                          // flecos
    }
    R(skD, 14, 13, 4, 2);
    R(sk, 12, 4, 8, 10); R(skD, 18, 5, 2, 8); R(skD, 12, 13, 8, 1);
    R(skD, 13, 7, 2, 1); R(skD, 17, 7, 2, 1);
    R("#120d0a", 13, 8, 2, 1); R("#120d0a", 17, 8, 2, 1);
    R(skD, 15, 10, 2, 1); R(tone(sk, -0.4), 14, 12, 4, 1);
    const st = o.style || "short";
    if (st === "short") { R(hr, 11, 2, 10, 4); R(hr, 11, 5, 1, 3); R(hr, 20, 5, 1, 2); R(hrL, 13, 2, 3, 1); }
    if (st === "long") { R(hr, 11, 2, 10, 4); R(hr, 10, 4, 2, 14); R(hr, 20, 4, 2, 14); R(hrL, 12, 2, 3, 1); }
    if (st === "curly") { R(hr, 10, 1, 12, 5); for (let x = 10; x < 22; x += 2) R(hrL, x, 1 + (x % 4 ? 0 : 1), 1, 1); R(hr, 10, 5, 2, 3); R(hr, 20, 5, 2, 3); }
    if (st === "cap") { R(o.cap || "#5a2a26", 11, 1, 10, 4); R(tone(o.cap || "#5a2a26", -0.35), 11, 4, 12, 1); R(hr, 11, 5, 1, 3); R(hr, 20, 5, 1, 2); }
    if (st === "bun") { R(hr, 11, 2, 10, 4); R(hr, 13, 0, 6, 3); R(hrL, 14, 0, 2, 1); }
    if (st === "hat") {                                                       // sombrero de paño
      R("#d8d2c4", 11, 5, 1, 4); R("#d8d2c4", 20, 5, 1, 3);                 // canas
      R("#cfc9bb", 14, 11, 4, 1);                                            // bigote
      R("#2a2220", 8, 4, 16, 1); R("#3a302c", 11, 0, 10, 4); R("#1a1412", 11, 3, 10, 1); R("#4a403a", 12, 0, 3, 1);
    }
    if (o.partyHat) {                                                         // gorro cónico de cumpleaños
      const a = "#e04a8a", b = "#4ab8e0";
      R("#f4f0e0", 15, -5, 2, 2);
      R(a, 15, -3, 2, 1); R(b, 14, -2, 4, 1); R(a, 14, -1, 4, 1); R(b, 13, 0, 6, 1); R(a, 13, 1, 6, 1); R(b, 12, 2, 8, 1);
      R("#ffd84a", 15, 0, 1, 1); R("#ffd84a", 16, -2, 1, 1);
    }
    if (o.ushanka) {                                                          // gorro ruso de piel con orejeras
      const fu = "#6a4a32", fd = "#4a321f", fl = "#8a6a4a";
      R(fu, 10, -3, 12, 5); R(fl, 11, -3, 5, 1); R(fd, 21, -2, 1, 4);
      R(fd, 9, 2, 14, 3); R(fl, 9, 2, 14, 1);
      R("#d0302a", 15, 3, 2, 2); R("#ffd040", 15, 3, 1, 1);
      R(fd, 9, 5, 3, 7); R(fd, 20, 5, 3, 7); R(fu, 9, 5, 1, 7); R(fu, 20, 11, 3, 1); R(fu, 9, 11, 3, 1);
    }
  });
  spr.seated = !!o.seated;
  return spr;
}
function tableSprite() {
  return makeSprite(32, 24, R => {
    R("rgba(0,0,0,.4)", 3, 21, 26, 3);
    R("#5a3a22", 2, 8, 28, 3); R("#7a5232", 2, 8, 28, 1); R("#3a2414", 2, 11, 28, 1);
    R("#3a2414", 4, 12, 2, 10); R("#3a2414", 26, 12, 2, 10); R("#2a1a0e", 15, 12, 2, 10);
    for (const x of [7, 11, 20]) { R("#4a2a10", x, 1, 2, 7); R("#6a3e18", x, 1, 1, 6); R("#c9b48a", x, 3, 2, 2); }   // botellas
    R("#b8c8c8", 24, 4, 3, 4); R("#d8b84a", 24, 6, 3, 2);                   // vaso
  });
}
function stoolSprite() { return makeSprite(16, 16, R => { R("rgba(0,0,0,.4)", 3, 14, 10, 2); R("#5a3a22", 2, 3, 12, 2); R("#3a2414", 3, 5, 1, 10); R("#3a2414", 12, 5, 1, 10); R("#2a1a0e", 4, 10, 8, 1); }); }
function jukeboxSprite() {
  return makeSprite(32, 48, R => {
    R("rgba(0,0,0,.45)", 4, 45, 24, 3);
    R("#2a1a12", 4, 8, 24, 38); R("#3a2418", 6, 4, 20, 6); R("#3a2418", 9, 2, 14, 3);
    R("#d0408a", 6, 10, 2, 34); R("#40c0d0", 24, 10, 2, 34); R("#e8c040", 9, 5, 14, 1);
    R("#0e0a08", 9, 12, 14, 12); R("#e8d8a0", 10, 13, 12, 1); for (let y = 15; y < 24; y += 2) R("#5a4a30", 10, y, 12, 1);
    R("#1a120c", 9, 27, 14, 14); for (let x = 10; x < 23; x += 2) R("#3a2a1a", x, 28, 1, 12);
  });
}
function bulbSprite() { return makeSprite(8, 16, R => { R("#1a1410", 3, 0, 1, 9); R("#3a3020", 2, 8, 4, 2); R("#ffe2a0", 2, 10, 4, 4); R("#fff6d8", 3, 11, 2, 2); }); }
function plateSprite() { return makeSprite(16, 8, R => { R("#d8d2c4", 1, 4, 14, 3); R("#b8b2a4", 1, 6, 14, 1); R("#7a4a22", 4, 2, 4, 3); R("#9a5a2a", 5, 2, 2, 1); R("#e8e2c8", 9, 3, 3, 2); R("#c9a24a", 12, 3, 2, 2); }); }
function radioSprite() { return makeSprite(16, 10, R => { R("#3a2a1a", 1, 2, 14, 8); R("#1a120c", 2, 3, 6, 6); for (let y = 4; y < 9; y += 2) R("#5a4a30", 2, y, 6, 1); R("#c9a24a", 10, 4, 3, 1); R("#8a7a5a", 10, 6, 1, 2); R("#8a7a5a", 12, 6, 1, 2); R("#8a8a8a", 12, 0, 1, 3); }); }

function festoonSprite(col) { return makeSprite(4, 6, R => { R("#1a1410", 1, 0, 1, 2); R(col, 0, 2, 4, 4); R("rgba(255,255,255,.6)", 1, 3, 1, 1); }); }
function tvSprite() { return makeCanvas(20, 18); }
function drawTV(t) {                                                // televisor con estática, siempre encendido
  const g = BSPR.tv.getContext("2d");
  g.fillStyle = "#1a1612"; g.fillRect(0, 0, 20, 15); g.fillStyle = "#2a241e"; g.fillRect(0, 0, 20, 1);
  g.fillStyle = "#3a3430"; g.fillRect(8, 15, 4, 3);
  const loud = B ? clamp(1 - Math.hypot(B.px - B.npc.lucho.x, B.py - B.npc.lucho.y) / 6, 0, 1) : 0;
  for (let y = 2; y < 13; y++) for (let x = 2; x < 16; x++) { const v = 60 + Math.random() * (120 + 100 * loud); g.fillStyle = `rgb(${v * 0.8 | 0},${v * 0.9 | 0},${v | 0})`; g.fillRect(x, y, 1, 1); }
  if (Math.random() < 0.08) { g.fillStyle = "rgba(255,255,255,.5)"; g.fillRect(2, 2 + (Math.random() * 10 | 0), 14, 1); }
  g.fillStyle = "#c9a24a"; g.fillRect(17, 4, 2, 2); g.fillStyle = "#5a5048"; g.fillRect(17, 8, 2, 1); g.fillRect(17, 10, 2, 1);
}
function dogSprite() {
  return makeSprite(24, 12, R => {
    R("rgba(0,0,0,.4)", 2, 10, 20, 2);
    R("#6a4a2a", 4, 5, 14, 6); R("#5a3c22", 4, 9, 14, 2); R("#7a5a36", 5, 5, 8, 2);
    R("#6a4a2a", 16, 3, 6, 6); R("#4a321c", 17, 2, 2, 3); R("#4a321c", 20, 2, 2, 3);
    R("#0e0a08", 18, 5, 1, 1); R("#0e0a08", 21, 7, 1, 1); R("#e8e0d0", 18, 5, 1, 1);
    R("#5a3c22", 1, 7, 4, 2); R("#7a5a36", 14, 9, 4, 2);
  });
}
function plantSprite() {
  return makeSprite(16, 24, R => {
    R("rgba(0,0,0,.4)", 3, 22, 10, 2);
    R("#7a3a22", 4, 15, 8, 7); R("#9a4a2a", 4, 15, 8, 1); R("#5a2a18", 10, 16, 2, 6);
    for (const [x, y, h, c] of [[6, 4, 11, "#3a6a3a"], [8, 2, 13, "#4a7a44"], [10, 5, 10, "#3a6a3a"], [4, 8, 7, "#2e5a32"], [12, 8, 7, "#2e5a32"]]) { R(c, x, y, 2, h); R("#6a9a5a", x, y, 1, h - 2); }
  });
}
function cratesSprite() {
  return makeSprite(24, 24, R => {
    R("rgba(0,0,0,.45)", 1, 22, 22, 2);
    for (const [x, y] of [[1, 12], [12, 12], [6, 2]]) {
      R("#a8281e", x, y, 11, 10); R("#7a1a12", x, y + 8, 11, 2); R("#c8382a", x, y, 11, 1);
      for (const bx of [x + 2, x + 5, x + 8]) { R("#3a2a1a", bx, y - 1, 2, 3); R("#c9b48a", bx, y - 1, 2, 1); }
    }
  });
}
function barrelSprite() { return makeSprite(16, 20, R => { R("rgba(0,0,0,.4)", 2, 18, 12, 2); R("#3a3a40", 2, 2, 12, 16); R("#5a5a62", 3, 2, 3, 16); R("#1e1e22", 12, 2, 2, 16); R("#6a2a1a", 2, 5, 12, 1); R("#6a2a1a", 2, 14, 12, 1); R("#14141a", 3, 1, 10, 2); }); }
function bucketSprite() { return makeSprite(12, 16, R => { R("rgba(0,0,0,.4)", 1, 14, 10, 2); R("#3a5a8a", 2, 8, 8, 6); R("#5a7aaa", 2, 8, 2, 6); R("#c8c0a8", 5, 0, 2, 9); R("#8a8070", 4, 8, 4, 1); }); }

const SKY_H = 600;
const SKY_SOUTH = () => Math.PI / 2 * PXRAD + W / 2;         // columna del cielo que se ve al mirar al sur
const TWINKLE = [];
function buildBarSky() {
  const sh = SKY_H, c = makeCanvas(SKYW, sh), g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, sh);
  gr.addColorStop(0, "#010208"); gr.addColorStop(0.55, "#06102a"); gr.addColorStop(0.85, "#10224a"); gr.addColorStop(1, "#24395e");
  g.fillStyle = gr; g.fillRect(0, 0, SKYW, sh);
  const moonX = SKY_SOUTH() + 120, moonY = sh - 128, cerroX = SKY_SOUTH() - 110;
  // Vía Láctea: una franja inclinada de polvo y estrellas finas
  for (let i = 0; i < 70; i++) {
    const t = Math.random(), x = t * SKYW, y = sh * 0.18 + Math.sin(t * Math.PI * 2) * sh * 0.22 + rand(-30, 30), r = rand(40, 110);
    const neb = g.createRadialGradient(x, y, 0, x, y, r);
    neb.addColorStop(0, `rgba(${pick(["120,130,190", "150,120,180", "110,150,190"])},${rand(0.04, 0.09).toFixed(3)})`); neb.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = neb; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 2600; i++) {
    const t = Math.random(), x = t * SKYW, y = sh * 0.18 + Math.sin(t * Math.PI * 2) * sh * 0.22 + rand(-55, 55) * Math.random();
    g.fillStyle = `rgba(220,225,255,${rand(0.15, 0.55).toFixed(2)})`; g.fillRect(x, y, 1, 1);
  }
  // Estrellas: muchas tenues, algunas brillantes con color y destello
  for (let i = 0; i < 1500; i++) {
    const x = Math.random() * SKYW, y = Math.pow(Math.random(), 1.2) * sh * 0.92;
    if (Math.hypot(x - moonX, y - moonY) < 70) continue;            // la luna apaga las estrellas cercanas
    g.fillStyle = `rgba(${pick(["255,255,255", "200,215,255", "255,236,210", "210,230,255"])},${rand(0.25, 0.9).toFixed(2)})`;
    g.fillRect(x, y, 1, 1);
  }
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * SKYW, y = Math.random() * sh * 0.8;
    if (Math.hypot(x - moonX, y - moonY) < 90) continue;
    const col = pick(["255,255,255", "190,210,255", "255,225,190"]);
    g.fillStyle = `rgba(${col},.95)`; g.fillRect(x, y, 2, 2);
    g.fillStyle = `rgba(${col},.25)`; g.fillRect(x - 2, y, 6, 2); g.fillRect(x, y - 2, 2, 6);
    if (i % 3 === 0) TWINKLE.push({ x, y, ph: Math.random() * 6.28, sp: rand(1.5, 4) });
  }
  // Luna: halo amplio, luz sobre las nubes y un disco con mares y cráteres
  for (const [r, a] of [[260, 0.07], [150, 0.12], [70, 0.22], [40, 0.32]]) {
    const h = g.createRadialGradient(moonX, moonY, 10, moonX, moonY, r);
    h.addColorStop(0, `rgba(200,215,240,${a})`); h.addColorStop(1, "rgba(200,215,240,0)");
    g.fillStyle = h; g.fillRect(moonX - r, moonY - r, r * 2, r * 2);
  }
  for (let i = 0; i < 6; i++) {                                     // velos de nube iluminados
    const x = moonX + rand(-220, 220), y = moonY + rand(-60, 70), w = rand(90, 180);
    g.fillStyle = `rgba(150,170,205,${rand(0.05, 0.1).toFixed(3)})`;
    g.beginPath(); g.ellipse(x, y, w, rand(4, 9), 0, 0, 7); g.fill();
    g.fillStyle = "rgba(6,12,30,.35)"; g.beginPath(); g.ellipse(x + 10, y + 4, w * 0.8, 3, 0, 0, 7); g.fill();
  }
  const R = 23, maria = [[-8, -6, 7, 5], [5, -9, 6, 4], [3, 3, 8, 6], [-6, 8, 5, 4], [10, 9, 3, 3]];
  const craters = [[-12, 4, 2], [14, -2, 2], [-2, -15, 2], [8, 15, 1.5], [-15, -8, 1.5], [0, 12, 1.5]];
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    const d = Math.hypot(x, y) / R;
    if (d > 1) continue;
    let v = 0.86 + 0.14 * Math.sqrt(1 - d * d) - 0.06 * d;          // oscurecimiento del borde
    for (const [mx, my, rx, ry] of maria) { const q = ((x - mx) / rx) ** 2 + ((y - my) / ry) ** 2; if (q < 1) v -= 0.17 * (1 - q * 0.6); }
    for (const [cx, cy, cr] of craters) { const q = Math.hypot(x - cx, y - cy); if (q < cr + 0.6) v += q < cr ? -0.08 : 0.08; }
    v += (Math.random() - 0.5) * 0.04;
    const k = clamp(v, 0, 1);
    g.fillStyle = `rgb(${Math.round(232 * k)},${Math.round(236 * k)},${Math.round(226 * k)})`;
    g.fillRect(moonX + x, moonY + y, 1, 1);
  }
  // Cerro con el resplandor verde, y montañas lejanas en capas
  const glow = g.createRadialGradient(cerroX, sh - 50, 5, cerroX, sh - 50, 170);
  glow.addColorStop(0, "rgba(140,255,150,.24)"); glow.addColorStop(1, "rgba(140,255,150,0)");
  g.fillStyle = glow; g.fillRect(cerroX - 170, sh - 220, 340, 220);
  for (const [col, base, amp, peak] of [["#0b1424", 34, 14, 40], ["#05080b", 14, 6, 72]]) {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, sh);
    for (let x = 0; x <= SKYW; x += 5) {
      const d = Math.min(Math.abs(x - cerroX), SKYW - Math.abs(x - cerroX));
      g.lineTo(x, sh - (base + Math.sin(x * 0.008 + base) * amp + Math.sin(x * 0.031) * amp * 0.3 + peak * Math.exp(-(d * d) / (2 * 95 * 95))));
    }
    g.lineTo(SKYW, sh); g.fill();
  }
  return c;
}
// Estrellas que titilan y alguna estrella fugaz (solo se ven al aire libre)
function drawSkyLife(hz, T, S) {                        // estrellas que titilan y alguna estrella fugaz (bar y maizal)
  const off = (((S.ang * PXRAD) % SKYW) + SKYW) % SKYW;
  for (const s of TWINKLE) {
    let sx = s.x - off; if (sx < 0) sx += SKYW;
    if (sx > W) continue;
    const sy = hz - (SKY_H - s.y);
    if (sy < 0 || sy > hz) continue;
    const a = 0.5 + 0.5 * Math.sin(T * s.sp + s.ph);
    ctx.fillStyle = `rgba(255,255,255,${(a * 0.9).toFixed(2)})`; ctx.fillRect(sx - 1, sy, 4, 2); ctx.fillRect(sx, sy - 1, 2, 4);
  }
  if (!S.meteor && Math.random() < 0.004) S.meteor = { x: rand(60, W - 60), y: rand(10, Math.max(20, hz * 0.5)), t: 0 };
  if (S.meteor) {
    const m = S.meteor; m.t += 1 / 60;
    const k = m.t / 0.7, x = m.x + k * 160, y = m.y + k * 60;
    const gr = ctx.createLinearGradient(x - 50, y - 19, x, y);
    gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(1, `rgba(255,255,255,${(0.9 * (1 - k)).toFixed(2)})`);
    ctx.strokeStyle = gr; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 50, y - 19); ctx.lineTo(x, y); ctx.stroke();
    if (k >= 1) S.meteor = null;
  }
}

const BTEX = {}, BSPR = {}, FT = {};
let barSkyTex = null;
function buildBarAssets() {
  BTEX["#"] = texWood(false); BTEX.B = texShelves(); BTEX.V = texWindow(); BTEX.P = texPoster();
  BTEX.X = texDoor("SALIDA"); BTEX.K = texDoor("BANO"); BTEX.C = texCounter();
  BTEX.A = texWood(false); BTEX.F = texFence();
  for (const k of ["G", "L", "S", "H", "D"]) BTEX[k] = texDecor(k);
  const px = cv => cv.getContext("2d").getImageData(0, 0, TEX, TEX).data;
  FT.planks = px(texPlanksFloor()); FT.tiles = px(texTilesFloor()); FT.dirt = px(texDirt()); FT.ceil = px(texCeiling());
  BTEX.wood2 = texWood(true);
  try {
  for (const k in CHARS) if (CHARS[k].look) BSPR[k] = personSprite(CHARS[k].look);
  BSPR.table = tableSprite(); BSPR.stool = stoolSprite(); BSPR.jukebox = jukeboxSprite();
  BSPR.bulb = bulbSprite(); BSPR.plate = plateSprite(); BSPR.radio = radioSprite();
  BSPR.dog = dogSprite(); BSPR.plant = plantSprite(); BSPR.crates = cratesSprite(); BSPR.barrel = barrelSprite(); BSPR.bucket = bucketSprite();
  BSPR.tv = tvSprite();
  ["#ffb84a", "#ff5a3a", "#6ad06a", "#5aa0ff"].forEach((c, i) => { BSPR["f" + i] = festoonSprite(c); });
  } catch (e) { showError("sprites del bar: " + e.message); }
  try { buildLightmap(); } catch (e) { showError("luces del bar: " + e.message); }
  barSkyTex = buildBarSky();
}

/* ---------- Escena ---------- */
const BAR_CAST = ["paul", "samira", "sebas", "stalin", "lucho", "carmen"];     // quiénes están esa noche (su ficha en CHARS)
const npcOf = id => BAR_CAST.includes(id) ? CHARS[id] : null;
const BAR_PROPS = [
  { img: "table", x: 2.2, y: 4.85, h: 0.32, r: 0.2 },
  { img: "stool", x: 2.4, y: 2.8, h: 0.24, r: 0 },
  { img: "jukebox", x: 6.55, y: 5.45, h: 0.66, r: 0.17 },
  { img: "plant", x: 6.65, y: 3.55, h: 0.36, r: 0.08 },
  { img: "dog", x: 3.05, y: 5.6, h: 0.13, r: 0 },
  { img: "tv", x: 6.82, y: 5.55, h: 0.17, lift: 0.64 },
  { img: "plate", x: 1.5, y: 2.25, h: 0.05, lift: LOW_H.C },
  { img: "radio", x: 3.35, y: 2.22, h: 0.08, lift: LOW_H.C },
  { img: "bulb", x: 2.2, y: 4.85, h: 0.12, lift: 0.84, glow: 1 }, { img: "bulb", x: 3.1, y: 3.05, h: 0.12, lift: 0.84, glow: 1 },
  { img: "bulb", x: 5.3, y: 4.2, h: 0.12, lift: 0.84, glow: 1 }, { img: "bulb", x: 4.9, y: 7.2, h: 0.12, lift: 0.84, glow: 1 },
  { img: "crates", x: 5.7, y: 7.25, h: 0.3, r: 0 }, { img: "barrel", x: 4.25, y: 8.75, h: 0.3, r: 0 },
  { img: "bucket", x: 1.3, y: 9.7, h: 0.14, r: 0 },
  { img: "f0", x: 0.70, y: 4.30, h: 0.03, lift: 0.930, glow: 2 },
  { img: "f1", x: 1.40, y: 4.12, h: 0.03, lift: 0.904, glow: 2 },
  { img: "f2", x: 2.10, y: 3.95, h: 0.03, lift: 0.885, glow: 2 },
  { img: "f3", x: 2.80, y: 3.77, h: 0.03, lift: 0.874, glow: 2 },
  { img: "f0", x: 3.50, y: 3.60, h: 0.03, lift: 0.870, glow: 2 },
  { img: "f1", x: 4.20, y: 3.42, h: 0.03, lift: 0.874, glow: 2 },
  { img: "f2", x: 4.90, y: 3.25, h: 0.03, lift: 0.885, glow: 2 },
  { img: "f3", x: 5.60, y: 3.08, h: 0.03, lift: 0.904, glow: 2 },
  { img: "f0", x: 6.30, y: 2.90, h: 0.03, lift: 0.930, glow: 2 }
];
const BAR_LIGHTS = [
  { x: 2.2, y: 4.85, i: 0.75 }, { x: 3.1, y: 3.05, i: 0.8 }, { x: 5.3, y: 4.2, i: 0.7 },
  { x: 2.5, y: 1.5, i: 0.45 }, { x: 6.5, y: 5.4, i: 0.35 }, { x: 6.7, y: 4.5, i: 0.3 },
  { x: 1.5, y: 7.6, i: 0.2 }, { x: 1.5, y: 9.4, i: 0.15 }, { x: 4.9, y: 7.2, i: 0.5 }
];
const BAR_SPOTS = [                                       // cosas que se pueden examinar
  { id: "poster",     name: "el cartel de «Se busca»", x: 0.55, y: 4.5, range: 1.6 },
  { id: "exit",       name: "la puerta del parqueadero", x: 7.5, y: 2.5, range: 1.5 },
  { id: "bano",       name: "la puerta del baño", x: 1.5, y: 10.5, range: 1.4 },
  { id: "radio",      name: "la radio de la barra", x: 3.35, y: 2.22, range: 1.4 },
  { id: "perro",      name: "al perro", x: 3.05, y: 5.6, range: 1.4 },
  { id: "calendario", name: "el calendario", x: 6.5, y: 5.95, range: 1.4 },
  { id: "pizarra",    name: "la pizarra del menú", x: 3.5, y: 5.95, range: 1.4 }
];
function barLight(x, y) {
  const zone = zoneAt(x, y);
  let L = zone === "patio" ? 0.26 : zone === "pasillo" ? 0.02 : 0.06;
  for (const l of BAR_LIGHTS) { const d2 = (l.x - x) ** 2 + (l.y - y) ** 2; L += l.i / (1 + d2 * 0.45); }
  return clamp(L, 0, 1.15);
}

const LM_RES = 6;
let LM = null;
function buildLightmap() {
  const w = BCOLS * LM_RES, h = BROWS * LM_RES;
  LM = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) LM[y * w + x] = barLight((x + 0.5) / LM_RES, (y + 0.5) / LM_RES);
}
function lmAt(x, y) {
  const w = BCOLS * LM_RES;
  const gx = clamp((x * LM_RES) | 0, 0, w - 1), gy = clamp((y * LM_RES) | 0, 0, BROWS * LM_RES - 1);
  return LM[gy * w + gx];
}
/* ---------- Fachada vista desde el patio: segundo piso y techo de teja a dos aguas ----------
 * Es un plano vertical en y = FAC.y (la cara sur del bar), por encima de las paredes (z > 1).
 * Las alturas van en la misma unidad que las paredes (pared = 1, ojos a 0.5). */
const FAC = { y: 7, floor2: 1.62, apex: 2.72, eave: 0.42, tile: 0.15 };
FAC.k = (FAC.apex - FAC.floor2) / 4;                             // pendiente del techo
const facT = new Float32Array(NCOLS), facX = new Float32Array(NCOLS);
const hash2 = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) & 1023) / 1023; };
// Escribe el color de la fachada en buf[o..o+3]; devuelve false si ahí no hay nada (cielo)
function facadePixel(wx, z, t, buf, o) {
  if (z < 1) return false;
  const ax = Math.abs(wx - 4);
  if (ax > 4 + FAC.eave) return false;
  const roofLine = FAC.apex - FAC.k * ax;                         // cara inferior del alero
  if (z > roofLine + FAC.tile) return false;
  let r, g, b, glow = 0;
  if (z > roofLine) {                                             // teja: canales curvos y borde claro
    const u = ((wx * 5) % 1 + 1) % 1, v = (z - roofLine) / FAC.tile;
    const curve = Math.sin(u * Math.PI);
    r = 112 + 40 * curve; g = 44 + 16 * curve; b = 30 + 8 * curve;
    if (v > 0.8) { r += 25; g += 12; b += 8; }
    if (v < 0.18) { r *= 0.45; g *= 0.45; b *= 0.45; }           // sombra bajo el borde
  } else if (ax > 4) return false;                                // hueco bajo el alero, fuera del muro
  else if (z > FAC.floor2) {                                      // hastial de tablones verticales
    const px = Math.floor(wx * 4), seam = ((wx * 4) % 1 + 1) % 1 < 0.06;
    const n = hash2(px, 7);
    r = 66 + n * 18; g = 44 + n * 12; b = 30 + n * 8;
    if (seam) { r *= 0.5; g *= 0.5; b *= 0.5; }
    if (z < roofLine && z > roofLine - 0.05) { r *= 0.55; g *= 0.55; b *= 0.55; }   // sombra del alero
    const vx = wx - 4, vz = z - (FAC.floor2 + 0.42), vd = Math.hypot(vx, vz * 1.1);  // ventanita redonda del ático
    if (vd < 0.15) {
      if (vd > 0.12 || Math.abs(vx) < 0.012 || Math.abs(vz) < 0.012) { r = 40; g = 26; b = 16; }
      else { r = 14; g = 16; b = 22; }
    }
  } else {                                                        // segundo piso de adobe encalado
    const n = hash2(Math.floor(wx * 14), Math.floor(z * 14));
    r = 168 + n * 22; g = 158 + n * 20; b = 136 + n * 16;
    if (z < 1.07 || z > FAC.floor2 - 0.05) { r = 58; g = 36; b = 22; }          // vigas de madera
    else if (Math.floor(wx * 3) % 4 === 0 && z < 1.25) { r *= 0.85; g *= 0.85; b *= 0.8; }   // manchas de humedad
    for (const [cx, lit] of [[2, true], [6, false]]) {            // dos ventanas: una con luz, otra a oscuras
      const qx = Math.abs(wx - cx), qz = z - 1.33;
      if (qx < 0.33 && Math.abs(qz) < 0.17) {
        if (qx > 0.29 || Math.abs(qz) > 0.13 || qx < 0.015 || Math.abs(qz) < 0.012) { r = 54; g = 34; b = 20; }
        else if (lit) { const f = 0.85 + 0.15 * Math.sin(performance.now() / 700); r = 230 * f; g = 168 * f; b = 90 * f; glow = 1; }
        else { r = 22; g = 28; b = 44; if (qz > 0.04 && qx > 0.12) { r = 70; g = 82; b = 104; } }   // reflejo de la luna
      }
      if (qx < 0.38 && qz > -0.21 && qz < -0.17) { r = 48; g = 30; b = 18; }    // alféizar
    }
  }
  if (glow) { buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255; return true; }
  // Luz de luna (la fachada mira al sur, hacia la luna), el foco del patio y la ventana encendida
  const bulb = 0.55 * Math.exp(-((wx - 4.9) ** 2 + (z - 0.85) ** 2) * 1.6);
  const win = 0.25 * Math.exp(-((wx - 2) ** 2 + (z - 1.33) ** 2) * 6);
  const fog = clamp(1.2 - t / 10, 0.35, 1);
  const L = (0.3 + bulb + win) * fog;
  buf[o] = Math.min(255, r * L * (0.82 + bulb * 0.4) + 4);
  buf[o + 1] = Math.min(255, g * L * (0.9 + bulb * 0.2) + 6);
  buf[o + 2] = Math.min(255, b * L * 1.12 + 12);
  buf[o + 3] = 255;
  return true;
}

/* ---------- El bar visto por el motor: madera, focos, techo y el patio abierto ---------- */
let barRowL = 0, barRowFac = false, barFlick = 1, barOut = false;
const barFogCol = (L, outside, max) => outside ? `rgba(4,7,12,${clamp(1 - L, 0, max || 0.92).toFixed(3)})` : `rgba(8,4,2,${clamp(1 - L, 0, max || 0.94).toFixed(3)})`;
const BAR_WORLD = {
  cell: (x, y) => { const ch = bTile(x, y); return ch === "O" ? null : ch; },       // "O": campo abierto, sin pared
  floor: bFloor,
  low: { C: { h: LOW_H.C, box: LOW_BOX.C }, F: { h: LOW_H.F, box: LOW_BOX.F } },
  wall(i, w) {
    const x = i * COL, tex = BTEX[w.ch] || BTEX["#"];
    ctx.drawImage(tex, Math.min(TEX - 1, Math.floor(w.u * TEX)), 0, 1, TEX, x, w.top, COL, w.lineH);
    const L = lmAt(B.px + w.rdx * w.perp * 0.97, B.py + w.rdy * w.perp * 0.97) * (w.side ? 0.82 : 1) * barFlick;
    ctx.fillStyle = barFogCol(L, barOut); ctx.fillRect(x, w.top, COL, w.lineH);
  },
  lowWall(i, w) {                                        // la barra y la cerca: superficie de arriba y cara de frente
    const x = i * COL;
    ctx.fillStyle = LOW_TOP[w.ch]; ctx.fillRect(x, w.topFar, COL, Math.max(0, w.ftop - w.topFar));
    ctx.drawImage(BTEX[w.ch], Math.min(TEX - 1, Math.floor(w.u * TEX)), 0, 1, TEX, x, w.ftop, COL, w.bot - w.ftop);
    const L = lmAt(B.px + w.rdx * w.dEnter * 0.98, B.py + w.rdy * w.dEnter * 0.98) * barFlick;
    ctx.fillStyle = barFogCol(L, w.ch === "F"); ctx.fillRect(x, w.topFar, COL, w.bot - w.topFar);
  },
  planesBegin(cam, r0x, r0y, r1x, r1y) {                 // desde el patio se ve la fachada del bar
    barRowFac = zoneAt(B.px, B.py) === "patio" && B.py > FAC.y;
    if (barRowFac) for (let x = 0; x < NCOLS; x++) {
      const ry = r0y + (r1y - r0y) * (x + 0.5) / NCOLS, rx = r0x + (r1x - r0x) * (x + 0.5) / NCOLS;
      if (ry < -1e-4) { const t = (FAC.y - B.py) / ry; facT[x] = t; facX[x] = B.px + t * rx; } else facT[x] = -1;
    }
  },
  plane(rd, floor, p) {
    BAR_WORLD.rowFloor = floor; BAR_WORLD.rowP = p;
    barRowL = clamp(1.15 - rd / 9, 0.08, 1) * (floor ? barFlick : barFlick * 0.75);
    return true;
  },
  pixel(fx, fy, buf, o, x) {
    const cx = Math.floor(fx), cy = Math.floor(fy), ch = bTile(cx, cy), floor = BAR_WORLD.rowFloor;
    const open = ch === "_" || ch === "O" || ch === "F" || cx < 0 || cy < 0 || cx >= BCOLS || cy >= BROWS;   // al aire libre no hay techo
    if (!floor && open) {                                // el cielo del patio, o la fachada del bar
      if (barRowFac && facT[x] > 0 && facadePixel(facX[x], 0.5 - BAR_WORLD.rowP / H * facT[x], facT[x], buf, o)) return;
      buf[o + 3] = 0; return;
    }
    const T = !floor ? FT.ceil : open ? FT.dirt : ch === "," ? FT.tiles : FT.planks;
    const ti = (((((fy - cy) * TEX) | 0) & 63) * TEX + ((((fx - cx) * TEX) | 0) & 63)) * 4;
    const L = lmAt(fx, fy) * barRowL;
    buf[o] = T[ti] * L; buf[o + 1] = T[ti + 1] * L; buf[o + 2] = T[ti + 2] * L; buf[o + 3] = 255;
  }
};
const barShade = it => it.glow ? null : barFogCol(lmAt(it.x, it.y) * barFlick + 0.05, barOut || zoneAt(it.x, it.y) === "patio", barOut || zoneAt(it.x, it.y) === "patio" ? 0.9 : 0.92);

/* ---------- Estado ---------- */
let B = null;
function newBarState() {
  const npc = {};
  for (const k of BAR_CAST) npc[k] = { x: CHARS[k].bar.x, y: CHARS[k].bar.y };
  return {
    state: "intro",
    px: 6.4, py: 2.5, ang: Math.PI, pitch: 0, bob: 0, t: 0,
    min: 0, warned: false, npc,
    f: {},                       // banderas de la conversación
    secrets: {},                 // id → { overheard }
    told: [],                    // lo que le contaste a don Lucho
    talk: null, barkT: 3, lastBark: {}, talkLog: [], faceTo: null, costFx: null, meteor: null
  };
}
const clockText = () => { const m = 30 + B.min; return m >= 60 ? `00:${String(m - 60).padStart(2, "0")}` : `23:${String(m).padStart(2, "0")}`; };
function npcEarshot(id) {
  if (id === "lucho" || id === "carmen") return true;
  const n = B.npc[id], l = B.npc.lucho;
  return zoneAt(n.x, n.y) === "salon" && Math.hypot(n.x - l.x, n.y - l.y) < EARSHOT;
}

/* ---------- Secretos, pistas y textos del resumen ---------- */
const SECRET_TXT = {
  paul: "Paul se va a vivir a España el 3 de diciembre. Este es su último viaje con ustedes. Solo se lo contó a Stalin.",
  samira: "Terminó con Sebas porque él apuesta y le mintió mirándola a la cara. Le debe 400 dólares.",
  sebas: "Sebas perdió su trabajo hace dos meses. Pagó las empanadas con lo último que tenía.",
  stalin: "El papá de Stalin, Rafael, desapareció en esta vía hace 15 años, en su cumpleaños. Le decía «Cabra Stalin»."
};
const CLUE_TXT = {
  oldNoEat: "Samira notó que el viejo de la barra no ha tocado su plato ni pestañea.",
  legend: "Don Lucho: «La luz del cerro se lleva a alguien. A veces lo devuelve, pero no devuelve lo mismo».",
  carmen: "Doña Carmen: don Lucho viene cada 13 de noviembre. Nunca lo ha visto llegar ni irse.",
  poster: "El cartel busca a un tal Rafael A., desaparecido el 13 de noviembre de 2011 en la vía vieja.",
  talin: "Don Lucho llamó «Cabra Stalin» a Stalin. Nadie dijo ese apodo dentro del bar.",
  radio: "La radio de la barra se llena de estática cuando habla don Lucho.",
  bano: "Alguien en el baño contestó con la voz de Paul. Paul no estaba ahí.",
  perro: "El perro del bar tiembla bajo la mesa y no le quita los ojos al viejo.",
  calendario: "En el calendario, el 13 está encerrado en rojo. Debajo dice «vuelve». El reloj está parado a las 11:58."
};
const OVERHEARD_LINES = [
  "(En la barra, don Lucho deja de mover la cuchara.)",
  "(La radio de la barra chisporrotea más fuerte.)",
  "(Sientes una mirada en la nuca. Cuando volteas, el viejo del poncho está de espaldas.)"
];
function reveal(id) {
  if (B.secrets[id]) return [];
  const heard = npcEarshot(B.talk.id);
  B.secrets[id] = { overheard: heard };
  B.newSecret = id;
  return heard ? [["", pick(OVERHEARD_LINES)]] : [];
}
function clue(id) { if (!B.f["clue_" + id]) B.newClue = true; B.f["clue_" + id] = true; }
function tellLucho(id) { B.told.push(id); if (B.secrets[id]) B.secrets[id].overheard = true; }

/* ---------- Diálogos ---------- */
// Cada nodo: say() → líneas [quién, texto] ("" = narración); opts() → opciones.
// Opción: { t, tag, cost, go, fx, hard }  (hard = pregunta incómoda)
const F = () => B.f;
const DLG = {
  intro: {
    start: { say: () => [
      ["Sebas", "¡Llegó Pepe! Ahora sí, que empiece la fiesta."],
      ["Paul", "Llegó tarde. Como siempre."],
      ["Samira", "Paul, ya."],
      ["Paul", "¿Qué? Es verdad."],
      ["Sebas", "Pero llegó armado, ojo. Pepe trae la pistola de su papá. Si nos asaltan en la vía vieja, que sea con respeto."],
      ["", "(Sientes el peso en el bolsillo de la chaqueta. Tu papá no te deja salir a carretera sin ella.)"],
      ["", "(Nadie se ríe. Stalin no está en la mesa. Doña Carmen señala el patio con la barbilla.)"],
      ["", "(En la barra, un viejo de poncho rojo te mira entrar. No aparta la vista.)"]
    ], opts: () => [{ t: "Saludar con la mano y entrar.", go: null }] }
  },

  paul: {
    start: { say: () => {
      const f = F();
      if (!f.paulMet) { f.paulMet = true; return [["Paul", "Mira quién vino. ¿Ahora sí tienes tiempo para nosotros?"], ["", "(Tiene tres botellas vacías delante y le cuesta enfocar la mirada.)"]]; }
      if (f.paulMended) return [["Paul", "¿Qué más, ñaño?"]];
      return [["Paul", "¿Qué quieres, Pepe?"]];
    }, opts: () => {
      const f = F(), o = [];
      const canApologize = !f.paulMended && (!f.paulCold || (f.stalinNudge && !f.paulSecondTry));
      if (canApologize) o.push({ tag: "Sincero", t: f.paulCold ? "Paul, en serio. Déjame explicarte lo del funeral." : "Lo del funeral de tu abuela... Sé que te debo una explicación.", cost: 2, go: "apology", fx: () => { if (f.paulCold) f.paulSecondTry = true; } });
      if (!f.paulMended && !f.paulCold) o.push({ tag: "A la defensiva", t: "No empieces, Paul. Vine, ¿no?", cost: 1, go: "defensive" });
      if (!f.paulJoke) o.push({ tag: "Bromear", t: "¿Cuántas llevas? Mañana manejas tú, ¿ah?", cost: 1, go: "joke" });
      if (f.rumorPaul && !B.secrets.paul) o.push({ tag: "Pregunta incómoda", hard: true, t: "Samira dice que tú y Stalin esconden algo. ¿Te vas a algún lado?", cost: 2, go: f.paulMended ? "secret" : "refused" });
      if (f.paulMended && zoneAt(B.npc.paul.x, B.npc.paul.y) === "salon") o.push({ tag: "Privado", t: "¿Salimos un rato al patio? Aquí hay mucho ruido.", cost: 2, go: "patio" });
      return o;
    } },
    apology: { say: () => [["Paul", "¿Una explicación? Esta semana se cumple un año, Pepe. Te escribí la noche que murió. Viste el mensaje y no fuiste ni al velorio."]],
      opts: () => [
        { tag: "Sincero", t: "No fui porque no supe cómo verte así. Me dio miedo no saber qué decirte. Fui un cobarde.", cost: 2, go: "mended", fx: () => { F().paulMended = true; } },
        { tag: "Excusa", t: "Tuve un problema en el trabajo, en serio.", cost: 1, go: "excuse", fx: () => { F().paulCold = true; } }
      ] },
    mended: { say: () => [["Paul", "..."], ["Paul", "Eso es lo más honesto que me has dicho en años."], ["", "(Te acerca una cerveza. No es un perdón, pero se le parece.)"]], opts: () => [{ t: "Brindar con él.", go: "start" }] },
    excuse: { say: () => [["Paul", "Ajá. Siempre hay un problema en el trabajo."], ["", "(Se gira hacia la ventana. Para él, la conversación terminó.)"]], opts: () => [{ t: "Dejarlo.", go: null }] },
    defensive: { say: () => { F().paulCold = true; return [["Paul", "Sí. Viniste. Felicitaciones."], ["", "(Sebas, desde la barra, finge no haber escuchado.)"]]; }, opts: () => [{ t: "Dejarlo.", go: null }] },
    joke: { say: () => { F().paulJoke = true; return [["Paul", "Las suficientes para aguantarte. Y no, mañana no manejo. Hoy tampoco, creo."]]; }, back: true },
    refused: { say: () => [["Paul", "¿Y desde cuándo te importa lo que me pase a mí?"], ["", "(No va a contarte nada mientras siga resentido contigo.)"]], back: true },
    secret: { say: () => [
      ["", "(Paul mira alrededor antes de hablar.)"],
      ["Paul", "Me voy a España. El tres de diciembre. Mi tío me consiguió trabajo allá."],
      ["Paul", "Este es el último viaje, Pepe. Solo le conté a Stalin porque... la última vez que te necesité, no estuviste."],
      ...reveal("paul")
    ], opts: () => [
      { tag: "Sincero", t: "Esta vez sí voy a estar. Te lo prometo.", cost: 1, go: "promise" },
      { t: "No decir nada. Quedarse a su lado.", go: null }
    ] },
    promise: { say: () => [["Paul", "No prometas. Solo quédate."]], opts: () => [{ t: "Quedarse.", go: null }] },
    patio: { say: () => { barMovePrivate("paul", "patio"); return [["", "(Salen al patio. El frío de la sierra corta la cara. Adentro, la radio sigue chisporroteando.)"]]; }, opts: () => [{ t: "Seguir hablando.", go: "start" }] }
  },

  samira: {
    start: { say: () => {
      const f = F();
      if (!f.samiraMet) { f.samiraMet = true; return [["Samira", "¿Escuchaste al viejo de la barra? «La luz del cerro se lleva a la gente». Señor, son drones."], ["", "(No te mira. Pasa canciones en la rocola sin escoger ninguna.)"]]; }
      return [["Samira", f.samiraOpen ? "¿Qué pasó, Pepe?" : "¿Qué?"]];
    }, opts: () => {
      const f = F(), o = [];
      if (!B.f.clue_oldNoEat) o.push({ tag: "Curioso", t: "¿Qué tiene el viejo?", cost: 1, go: "old" });
      if (!f.samiraOpen) o.push({ tag: "Empático", t: f.samiraWary ? "Perdón por lo de antes. ¿Cómo estás tú, de verdad?" : "No tienes que contarme nada. Solo quería saber cómo estás.", cost: f.samiraWary ? 3 : 2, go: "open" });
      if (!B.secrets.samira) o.push({ tag: "Pregunta incómoda", hard: true, t: "¿Por qué terminaste con Sebas, en serio?", cost: 2, go: f.samiraOpen ? "secret" : "closed" });
      if (!f.samiraSidedSebas && !B.secrets.samira) o.push({ tag: "Del lado de Sebas", t: "Sebas dice que lo dejaste por nada.", cost: 1, go: "angry" });
      if (!f.samiraSong) o.push({ tag: "Bromear", t: "¿Pongo una de Juanes para alegrar el ambiente?", cost: 1, go: "song" });
      return o;
    } },
    old: { say: () => { clue("oldNoEat"); return [["Samira", "Nada. Solo que lleva una hora con el mismo plato de fritada y no ha comido nada."], ["Samira", "Y no pestañea, te juro. Ya, ya, también estoy paranoica."]]; }, back: true },
    open: { say: () => {
      const f = F(); f.samiraOpen = true; f.rumorPaul = true;
      return [["Samira", "...Mal. Gracias por preguntar. Nadie pregunta."], ["Samira", "Y no soy la única que está mal. Pregúntale a Paul por qué está tomando así. Stalin sabe algo y no nos dice."]];
    }, back: true },
    closed: { say: () => { F().samiraWary = true; return [["Samira", "No es tu problema, Pepe."], ["", "(Se cruza de brazos. Así no te lo va a contar.)"]]; }, back: true },
    angry: { say: () => { const f = F(); f.samiraSidedSebas = true; f.samiraWary = true; f.hintSebasPhone = true;
      return [["Samira", "¿Por nada? ¿Eso dice?"], ["", "(Se ríe sin ganas.)"], ["Samira", "Pregúntale por su celular. Pregúntale a qué hora se duerme."]]; }, back: true },
    song: { say: () => { F().samiraSong = true; return [["Samira", "Pon lo que quieras. Igual nadie va a bailar."], ["", "(La rocola se traga la moneda y no cambia nada: sigue la misma canción de siempre, entre estática.)"]]; }, back: true },
    secret: { say: () => [
      ["Samira", "Me debe cuatrocientos dólares. Pero no es por la plata."],
      ["Samira", "Apuesta, Pepe. En el celular, todo el día. Me mintió tres veces mirándome a la cara. La última vez le creí."],
      ["Samira", "No le digas a nadie, ¿ya? No quiero que se burlen de él. Todavía lo quiero, creo."],
      ...reveal("samira")
    ], opts: () => [{ tag: "Sincero", t: "No digo nada. Te lo prometo.", go: null }] }
  },

  sebas: {
    start: { say: () => {
      const f = F();
      if (!f.sebasMet) { f.sebasMet = true; return [["Sebas", "¡Pepeee! Llegaste justo: estoy invitando empanadas. Bueno, Paul invita, yo solo las pedí. Delegar es liderazgo."], ["", "(Se ríe demasiado fuerte. Revisa el celular cada pocos segundos.)"]]; }
      return [["Sebas", zoneAt(B.npc.sebas.x, B.npc.sebas.y) === "pasillo" ? "Ya, aquí no nos oye nadie. ¿Qué pasa?" : "¿Qué más, causa?"]];
    }, opts: () => {
      const f = F(), o = [], priv = zoneAt(B.npc.sebas.x, B.npc.sebas.y) !== "salon";
      if (!f.sebasJoke) o.push({ tag: "Bromear", t: "¿De queso o de viento?", cost: 1, go: "joke" });
      if (!f.sebasSamira) o.push({ tag: "Curioso", t: "¿Qué pasó con Samira?", cost: 1, go: "samira" });
      if (!priv) o.push({ tag: "Privado", t: "Acompáñame al pasillo un rato. Quiero hablar contigo.", cost: 2, go: "private" });
      if (priv && !f.sebasSoft) o.push({ tag: "Empático", t: "¿Estás bien? De verdad.", cost: 2, go: "soft" });
      const knows = B.secrets.samira || f.hintSebasPhone || f.sebasSoft;
      if (knows && !B.secrets.sebas) o.push({ tag: "Pregunta incómoda", hard: true, t: "Sebas, ¿todavía apuestas?", cost: 2, go: priv ? "secret" : "deny" });
      return o;
    } },
    joke: { say: () => { F().sebasJoke = true; return [["Sebas", "De viento, como mi sueldo."], ["", "(La broma se le queda a medio camino.)"]]; }, back: true },
    samira: { say: () => { F().sebasSamira = true; return [["Sebas", "Me dejó, ¿ya? Un día amaneció y ya no. Ni sé por qué."], ["", "(Mira al viejo de la barra, como si él tuviera la respuesta. Está mintiendo.)"]]; }, back: true },
    private: { say: () => { barMovePrivate("sebas", "pasillo"); return [["", "(En el pasillo del baño solo se oye el zumbido de un foco. Sebas deja de sonreír.)"]]; }, back: true },
    soft: { say: () => { F().sebasSoft = true; return [["Sebas", "Estoy... más o menos."], ["Sebas", "Oye, si en algún momento Samira te cuenta algo de mí, no le creas todo. Bueno, sí créele. Pero no todo."]]; }, back: true },
    deny: { say: () => {
      F().sebasDenied = true;
      const out = [["Sebas", "¿Yo? ¡Qué voy a apostar, si soy pobre! ¿Escuchó, don? ¡Dice que apuesto!"], ["", "(Don Lucho asiente despacio, como si tomara nota.)"], ["", "(Delante de todos, Sebas no va a admitir nada.)"]];
      return out;
    }, back: true },
    secret: { say: () => [
      ["Sebas", "..."],
      ["Sebas", "Me botaron del trabajo hace dos meses. No le he dicho a nadie."],
      ["Sebas", "Pensé que apostando recuperaba algo. Le debo a Samira, le debo a Paul... Las empanadas las pagué con lo último que tenía. Quería que esta noche fuera normal."],
      ["Sebas", "No le digas a nadie, porfa. Mañana lo arreglo. Siempre digo eso, ¿no?"],
      ...reveal("sebas")
    ], opts: () => [{ tag: "Sincero", t: "No tienes que arreglarlo solo.", go: "after" }] },
    after: { say: () => [["Sebas", "Bacán. Igual sí tengo que arreglarlo solo. Pero bacán."]], opts: () => [{ t: "Volver.", go: null }] }
  },

  stalin: {
    start: { say: () => {
      const f = F();
      if (!f.stalinMet) { f.stalinMet = true; return [["", "(Stalin está solo, con las manos en los bolsillos, mirando el cerro. Detrás, muy lejos, el cielo tiene un tinte verde que no debería tener.)"], ["Stalin", "Ah. Hola, Pepe."]]; }
      return [["Stalin", "¿Qué pasó?"]];
    }, opts: () => {
      const f = F(), o = [];
      if (!f.stalinBday) o.push({ tag: "Cálido", t: "Feliz cumpleaños, Stalin.", cost: 1, go: "bday" });
      if (!f.stalinOpen) o.push({ tag: "Empático", t: "Estás raro desde que llegamos. ¿Qué pasa?", cost: 2, go: f.stalinBday ? "open" : "notyet" });
      if (!B.secrets.stalin) o.push({ tag: "Pregunta incómoda", hard: true, t: "¿Por qué insististe en venir por la vía vieja? Son dos horas más.", cost: 2, go: f.stalinOpen ? "secret" : "closed" });
      if (!f.stalinNudge) o.push({ tag: "Curioso", t: "¿Sabes qué le pasa a Paul?", cost: 1, go: "paul" });
      if (f.clue_talin && !f.stalinShaken) o.push({ tag: "Pregunta incómoda", hard: true, t: "El viejo de la barra me dijo que te salude. Te llamó «Cabra Stalin».", cost: 1, go: "talin" });
      return o;
    } },
    bday: { say: () => { F().stalinBday = true; return [["Stalin", "Gracias. Eres el primero que me lo dice sin que Paul se lo recuerde."]]; }, back: true },
    notyet: { say: () => [["Stalin", "Nada. Cansancio."], ["", "(Ni siquiera te ha mirado. Quizá empezaste por el lado equivocado.)"]], back: true },
    open: { say: () => { F().stalinOpen = true; return [["Stalin", "¿Ves ese cerro?"], ["", "(No espera respuesta.)"], ["Stalin", "Hay cosas que no les he contado a ustedes."]]; }, opts: () => [{ t: "Esperar a que siga.", go: "start" }] },
    closed: { say: () => [["Stalin", "Porque sí. Me gusta el paisaje."], ["", "(De noche no hay paisaje.)"]], back: true },
    paul: { say: () => { const f = F(); f.stalinNudge = true; f.rumorPaul = true; return [["Stalin", "Te lo tiene que decir él. Pero dale chance, Pepe. Te extraña, aunque no lo diga."]]; }, back: true },
    secret: { say: () => [
      ["Stalin", "Mi papá desapareció aquí. Hoy hace quince años. Era mi cumpleaños; yo cumplía siete."],
      ["Stalin", "El carro se apagó en la vía vieja. Él bajó a ver una luz en el maizal y no volvió."],
      ["Stalin", "A mí me encontraron al amanecer entre el maíz. Sin un rasguño. Sin acordarme de nada."],
      ["Stalin", "Se llamaba Rafael. Me decía «Cabra Stalin». Este gorro ruso me lo regaló él, por el chiste del nombre."],
      ["Stalin", "Por eso quise venir por aquí. Necesitaba ver el lugar. No les digas a los demás, ¿ya? Ya tienen bastante con lo suyo."],
      ...reveal("stalin")
    ], opts: () => [{ tag: "Sincero", t: "Aquí estoy, Stalin.", go: null }] },
    talin: { say: () => { F().stalinShaken = true; return [["Stalin", "¿Qué?"], ["Stalin", "Nadie me dice así desde que tenía siete años."], ["", "(Se queda mirando la puerta del bar. No se mueve. No respira.)"]]; }, opts: () => [{ t: "Quedarse con él.", go: null }] }
  },

  lucho: {
    start: { say: () => {
      const f = F();
      if (!f.luchoMet) { f.luchoMet = true; clue("radio"); return [["Don Lucho", "Buenas noches, joven. Siéntese, que la noche es larga."], ["", "(Poncho rojo desteñido, sombrero de paño. Delante tiene un plato de fritada intacto. La radio de la barra chisporrotea cuando él habla.)"]]; }
      return [["Don Lucho", "Aquí sigo, joven."]];
    }, opts: () => {
      const f = F(), o = [];
      if (!f.luchoLocal) o.push({ tag: "Curioso", t: "¿Usted es de por aquí?", cost: 1, go: "local" });
      if (!f.clue_legend) o.push({ tag: "Curioso", t: "Mis amigos dicen que usted contó una historia.", cost: 2, go: "legend" });
      if (B.secrets.stalin && !f.clue_talin) o.push({ tag: "Pregunta incómoda", hard: true, t: "¿Usted conoció a un tal Rafael?", cost: 2, go: "rafael" });
      return o;
    } },
    local: { say: () => { F().luchoLocal = true; return [["Don Lucho", "Soy de la vía vieja. Siempre he estado en la vía vieja."]]; }, next: "askStalin" },
    legend: { say: () => { clue("legend"); return [
      ["Don Lucho", "La luz del cerro. Cada tantos años baja una luz verde por la vía vieja y se lleva a alguien."],
      ["Don Lucho", "A veces lo devuelve. Pero no devuelve lo mismo."],
      ["", "(Sonríe. Tiene los dientes demasiado parejos.)"]
    ]; }, next: "askStalin" },
    askStalin: { say: () => F().luchoAsked1 ? [["Don Lucho", "¿Y qué más me cuenta?"]] : [["Don Lucho", "¿Y el muchacho de la chaqueta morada? El del cumpleaños. Se le ve triste. ¿Qué le pasa?"]],
      opts: () => {
        const f = F();
        if (f.luchoAsked1) return [{ t: "Despedirse.", go: null }];
        const o = [];
        if (B.secrets.stalin) o.push({ tag: "Contar", t: "Su papá desapareció por aquí, hace quince años.", go: "toldStalin", fx: () => { f.luchoAsked1 = true; tellLucho("stalin"); } });
        o.push({ tag: "Evasivo", t: "No sé. Cosas de él.", go: "askCouple", fx: () => { f.luchoAsked1 = true; } });
        o.push({ tag: "Cortante", t: "No es asunto suyo.", go: "cut", fx: () => { f.luchoAsked1 = true; } });
        return o;
      } },
    toldStalin: { say: () => [["Don Lucho", "Qué pena. Los papás no deberían perderse."], ["", "(Por un segundo, su cara no hace nada. Ni un músculo.)"]], next: "askCouple" },
    cut: { say: () => [["Don Lucho", "Todo es asunto de alguien, joven."]], next: "askCouple" },
    askCouple: { say: () => F().luchoAsked2 ? [["Don Lucho", "Vaya nomás, joven."]] : [["Don Lucho", "Y esos dos, la chica de la rocola y el chistoso. Antes eran novios, ¿no? ¿Qué pasó?"]],
      opts: () => {
        const f = F();
        if (f.luchoAsked2) return [{ t: "Despedirse.", go: null }];
        const o = [];
        if (B.secrets.samira) o.push({ tag: "Contar", t: "Él le debe plata. Apuesta.", go: "toldCouple", fx: () => { f.luchoAsked2 = true; tellLucho("samira"); } });
        if (B.secrets.sebas) o.push({ tag: "Contar", t: "A él lo botaron del trabajo y no le ha dicho a nadie.", go: "toldCouple", fx: () => { f.luchoAsked2 = true; tellLucho("sebas"); } });
        o.push({ tag: "Evasivo", t: "Ni idea, don.", go: null, fx: () => { f.luchoAsked2 = true; } });
        return o;
      } },
    toldCouple: { say: () => [["Don Lucho", "Ya veo. Gracias, joven. Uno aprende mucho escuchando."]], opts: () => [{ t: "Despedirse.", go: null }] },
    rafael: { say: () => { clue("talin"); return [
      ["Don Lucho", "Conocí a muchos."],
      ["", "(La radio de la barra se queda en silencio. Del todo.)"],
      ["Don Lucho", "Dígale a la Cabra Stalin que su papá no sufrió."],
      ["", "(Nadie dijo ese apodo dentro del bar.)"]
    ]; }, opts: () => [{ t: "Alejarse despacio.", go: null }] }
  },

  carmen: {
    start: { say: () => [["Doña Carmen", F().carmenMet ? "¿Algo más, mijo?" : "¿Qué le sirvo, mijo? Ya mismo cierro la cocina."]],
      opts: () => {
        const f = F(), o = []; f.carmenMet = true;
        if (!f.carmenWater) o.push({ tag: "Pedir", t: "Un agua nomás.", cost: 1, go: "water" });
        if (!f.clue_carmen) o.push({ tag: "Curioso", t: "¿Quién es el señor del poncho?", cost: 1, go: "old" });
        if (f.clue_poster && !f.carmenPoster) o.push({ tag: "Curioso", t: "¿Y ese cartel de «Se busca»?", cost: 1, go: "poster" });
        return o;
      } },
    water: { say: () => { F().carmenWater = true; return [["Doña Carmen", "Agua. Bueno, alguien tiene que manejar en esa mesa."]]; }, back: true },
    old: { say: () => { clue("carmen"); return [
      ["", "(Baja la voz, aunque él está a dos metros.)"],
      ["Doña Carmen", "Don Lucho. Viene todos los trece de noviembre, desde hace años. Pide fritada y no la toca."],
      ["Doña Carmen", "Nunca le he visto llegar en carro. Ni irse. Y cuidado con lo que hablan cerca de él, que todo lo escucha."]
    ]; }, back: true },
    poster: { say: () => { F().carmenPoster = true; return [
      ["Doña Carmen", "Ese lo pegó una señora hace años. Buscaba al esposo. Ya ni viene."],
      ["Doña Carmen", "Dicen que se lo llevó la luz. Yo digo que se fue con otra. Cada uno cree lo que le duele menos."]
    ]; }, back: true }
  },

  poster: {
    start: { say: () => { clue("poster"); return [
      ["", "SE BUSCA. Rafael A. Visto por última vez el 13 de noviembre de 2011, vía antigua a Baños. Cualquier información..."],
      ["", "(La foto está desteñida: un hombre de unos cuarenta años con sombrero de paño. Te recuerda a alguien que viste hace un momento.)"]
    ]; }, opts: () => [{ t: "Apartarse del cartel.", go: null }] }
  },
  perro: {
    start: { say: () => { clue("perro"); return [["", "(Un perro flaco duerme bajo la mesa de Paul. No duerme: tiembla.)"], ["", "(Tiene los ojos abiertos, clavados en el viejo de la barra. Cuando intentas acariciarlo, no se mueve.)"]]; }, opts: () => [{ t: "Dejarlo tranquilo.", go: null }] }
  },
  calendario: {
    start: { say: () => { clue("calendario"); return [["", "(Un calendario de noviembre. Alguien encerró el 13 en rojo.)"], ["", "(Debajo, con otra letra, casi borrado: «vuelve».)"], ["", "(El reloj de arriba está parado a las 11:58.)"]]; }, opts: () => [{ t: "Apartarse.", go: null }] }
  },
  pizarra: {
    start: { say: () => [["", "FRITADA $4 · EMPANADA $1 · CANELAZO $2."], ["", "(En una esquina alguien dibujó un platillo volador con tiza. Debajo, una flecha que apunta al cerro.)"]], opts: () => [{ t: "Apartarse.", go: null }] }
  },
  radio: {
    start: { say: () => { clue("radio"); return [["", "(Una radio vieja sintonizada en nada. Cuanto más cerca está del viejo del poncho, más fuerte es la estática.)"]]; }, opts: () => [{ t: "Dejarla.", go: null }] }
  },
  bano: {
    start: { say: () => { clue("bano"); return [["", "(Tocas la puerta.)"], ["", "«¡Ocupado!», responde una voz. Es la voz de Paul."], ["", zoneAt(B.npc.paul.x, B.npc.paul.y) === "patio" ? "(Pero Paul está afuera, en el patio.)" : "(Pero Paul está en la mesa. Lo acabas de ver.)"]]; }, opts: () => [{ t: "Apartarse de la puerta.", go: null }] }
  },
  exit: {
    start: { say: () => [["", `(Afuera, la Azulita de Paul espera bajo un poste de luz que parpadea. Son las ${clockText()}.)`]],
      opts: () => [{ t: "Avisar a todos que nos vamos ya.", go: null, fx: () => { B.leaveNow = true; } }, { t: "Todavía no.", go: null }] }
  }
};

// Llevar a alguien a un lugar donde don Lucho no escucha
function barMovePrivate(id, where) {
  const n = B.npc[id];
  if (where === "patio") { n.x = 4.45; n.y = 8.4; B.px = 4.6; B.py = 7.05; B.ang = Math.PI / 2; }
  else { n.x = 1.55; n.y = 8.35; B.px = 1.5; B.py = 6.7; B.ang = Math.PI / 2; }
}

/* ---------- Motor de conversación ---------- */
// Una sola frase a la vez. Arriba, en pequeño, lo último que dijo la otra parte,
// para que el jugador siempre sepa a qué está respondiendo.
const TAG_COLOR = {
  "Sincero": "#a6d98a", "Empático": "#a6d98a", "Cálido": "#a6d98a",
  "Bromear": "#e8c86a", "Curioso": "#9fb3cc", "Privado": "#8ec5e0", "Pedir": "#9fb3cc", "Evasivo": "#9fb3cc",
  "A la defensiva": "#e08a8a", "Excusa": "#e08a8a", "Cortante": "#e08a8a", "Del lado de Sebas": "#e08a8a",
  "Contar": "#ff8a6a", "Pregunta incómoda": "#ffa070",
  "Preguntar": "#9fb3cc", "Confiar": "#a6d98a", "Acabar": "#e08a8a", "Esperar": "#9fb3cc"
};
const typer = { queue: [], timer: null, cur: null, onDone: null, waitLast: false, waiting: false, gen: 0 };
const talkLogOf = () => (MODE === "bar" ? B && B.talkLog : MODE === "chase" ? CH && (CH.log = CH.log || []) : MODE === "final" ? FN && FN.talkLog : G && G.talkLog) || [];
const cleanNarr = t => t.replace(/^\((.*)\)$/s, "$1");

// Caja de conversación compartida por los tres niveles (bar, maizal y final): abrir y cerrar
const TALK_FOOT = "<kbd>Clic</kbd>/<kbd>Enter</kbd> continuar · <kbd>1</kbd>–<kbd>6</kbd> responder · <kbd>H</kbd> lo que se dijo";
function talkOpen(sep) {
  $("talkFoot").innerHTML = TALK_FOOT + (MODE === "bar" ? " · <kbd>Q</kbd> despedirse" : "");
  cancelTyping(); releaseMouse();
  $("talk").classList.remove("hidden"); $("talkLog").classList.add("hidden");
  $("talkOpts").innerHTML = ""; $("talkCtx").classList.add("hidden"); $("talkHead").innerHTML = "";
  talkLogOf().push({ sep });
}
// Una línea suelta, completa y sin esperar respuesta (las cinemáticas llevan su propio ritmo). Sin texto: se cierra.
function talkSay(who, text) {
  if (text == null) { $("talk").classList.add("hidden"); return; }
  $("talk").classList.remove("hidden"); $("talkLog").classList.add("hidden"); $("talkCtx").classList.add("hidden");
  $("talkOpts").innerHTML = ""; $("talkHead").innerHTML = "";
  $("talkLine").textContent = talkShow(who, text);
}
function talkClose() { cancelTyping(); ECHO = null; $("talk").classList.add("hidden"); $("talkLog").classList.add("hidden"); }
function talkShow(who, text) {
  const narr = who === "", box = $("talkBox");
  box.className = "talk-box fade" + (narr ? " narr" : "");
  void box.offsetWidth;                                         // reinicia la animación
  box.style.setProperty("--acc-who", charColor(who, UI.dim));
  $("talkWho").textContent = narr ? "" : who;
  $("talkNext").classList.add("hidden");
  if (!narr && drawPortrait($("talkPortrait").getContext("2d"), who, 40)) box.classList.add("has-portrait");   // el retrato de quien habla
  talkLogOf().push({ who, text: narr ? cleanNarr(text) : text });
  return narr ? cleanNarr(text) : text;
}
function typeLines(lines, onDone, waitLast) {
  cancelTyping();
  typer.queue = lines.slice(); typer.onDone = onDone || (() => {}); typer.waitLast = !!waitLast;
  typerNext(typer.gen);
}
function typerNext(gen) {
  if (gen !== typer.gen) return;
  const item = typer.queue.shift();
  if (!item) { typerFinish(); return; }
  const full = talkShow(item[0], item[1]), el = $("talkLine");
  if (item[0] === "Tú") { el.textContent = full; typerLineDone(); return; }
  let i = 0;
  el.textContent = "";
  typer.cur = { el, full };
  const id = setInterval(() => {
    if (gen !== typer.gen) { clearInterval(id); return; }
    i += 1; el.textContent = full.slice(0, i);
    if (i >= full.length) { clearInterval(id); typer.timer = null; typer.cur = null; typerLineDone(); }
  }, 17);
  typer.timer = id;
}
// Al terminar una frase: si quedan más (o hay que leerla con calma), espera un clic.
function typerLineDone() {
  if (typer.queue.length || typer.waitLast) { typer.waiting = true; $("talkNext").classList.remove("hidden"); return; }
  typerFinish();
}
function typerFinish() {
  const cb = typer.onDone; typer.onDone = null; typer.waiting = false;
  if (cb) cb();
}
const typerBusy = () => !!typer.onDone;
// Clic, Enter o E: completa la frase; si ya está completa, pasa a la siguiente.
function advanceTalk() {
  if (!typer.onDone) return;
  if (typer.cur) {
    clearInterval(typer.timer); typer.timer = null;
    typer.cur.el.textContent = typer.cur.full; typer.cur = null;
    typerLineDone(); return;
  }
  if (typer.waiting) {
    typer.waiting = false; $("talkNext").classList.add("hidden");
    if (typer.queue.length) typerNext(typer.gen); else typerFinish();
  }
}
function cancelTyping() {
  typer.gen++;
  if (typer.timer) { clearInterval(typer.timer); typer.timer = null; }
  typer.cur = null; typer.queue = []; typer.onDone = null; typer.waiting = false;
}

// Estado de la relación: le dice al jugador en qué punto está con cada uno
function moodOf(id) {
  const f = B.f, s = B.secrets;
  const M = {
    paul:   s.paul ? ["Te contó su verdad", "ok"] : f.paulMended ? ["Te perdonó a medias", "mid"] : f.paulCold ? ["Se cerró contigo", "bad"] : ["Resentido contigo", "bad"],
    samira: s.samira ? ["Te contó su verdad", "ok"] : f.samiraOpen ? ["Confía en ti", "mid"] : f.samiraWary ? ["Desconfía de ti", "bad"] : ["Distante", "neu"],
    sebas:  s.sebas ? ["Te contó su verdad", "ok"] : f.sebasSoft ? ["Se está abriendo", "mid"] : f.sebasDenied ? ["A la defensiva", "bad"] : ["Haciendo chistes", "neu"],
    stalin: s.stalin ? ["Te contó su verdad", "ok"] : f.stalinOpen ? ["Quiere hablar", "mid"] : f.stalinBday ? ["Agradecido", "mid"] : ["Ausente", "neu"],
    lucho:  ["Te observa", "bad"], carmen: ["Atareada", "neu"]
  };
  return M[id] || null;
}
function talkHeader() {
  const id = B.talk.id, npc = npcOf(id), head = $("talkHead");
  head.innerHTML = "";
  const add = (txt, cls, col) => { const e = document.createElement("span"); e.className = cls; e.textContent = txt; if (col) e.style.color = col; head.appendChild(e); };
  if (!npc) return;
  const n = B.npc[id];
  const place = ({ patio: "en el patio", pasillo: "en el pasillo", salon: id === "paul" ? "en su mesa" : id === "samira" ? "junto a la rocola" : "en la barra" })[zoneAt(n.x, n.y)];
  add(npc.name, "h-name", npc.color);
  add(place, "h-place");
  const m = moodOf(id);
  if (m) add(m[0], "chip " + m[1]);
  if (id !== "lucho" && id !== "carmen" && B.f.clue_carmen && npcEarshot(id)) add("Don Lucho puede oírlos", "chip ear");
}

function barTalk(id) {
  B.state = "talk";
  B.talk = { id, opts: [] };
  const npc = npcOf(id);
  talkOpen(npc ? npc.name : "Examinas");
  const target = npc ? B.npc[id] : BAR_SPOTS.find(s => s.id === id);
  if (target) fpFaceTo(B, target.x, target.y);
  talkHeader();
  barNode("start");
}
function barNode(key) {
  const def = DLG[B.talk.id][key];
  B.talk.node = key;
  $("talkOpts").innerHTML = "";
  const lines = def.say();
  talkHeader();
  typeLines(lines, () => {
    if (B.min >= BAR_LIMIT && B.talk.id !== "intro") {
      $("talkCtx").classList.add("hidden");
      typeLines([["", "(Paul golpea la mesa con la palma.)"], ["Paul", "¡Ya, nos vamos! Es medianoche."]], () => barOptions([{ t: "Ir a la camioneta.", go: null, fx: () => { B.leaveNow = true; } }]));
      return;
    }
    if (def.next) { barNode(def.next); return; }
    barOptions(def.back ? DLG[B.talk.id].start.opts() : def.opts());
  }, !!def.next);
}
function barOptions(opts) {
  opts = opts.slice();
  const isNpc = !!npcOf(B.talk.id);
  if (!opts.length) opts.push({ t: "Despedirse.", go: null, leave: true });
  else if (isNpc && opts.every(o => o.go !== null)) opts.push({ t: "Despedirse.", go: null, leave: true });
  B.talk.opts = opts;
  $("talkCtx").classList.add("hidden");
  talkHeader();
  drawOptButtons(opts, barChoose, o => `${o.cost} min`);
  if (B.newSecret) { toast(`Ahora sabes algo que ${CHARS[B.newSecret].name} no le cuenta a nadie · [J]`); B.newSecret = null; }
  else if (B.newClue) { toast("Algo no cuadra · [J] lo que sabes"); B.newClue = false; }
}
// Botones de respuesta (bar y maizal): número, etiqueta de tono, texto y costo
function drawOptButtons(opts, choose, costText) {
  const box = $("talkOpts"); box.innerHTML = "";
  box.className = opts.length > 4 ? "grid" : "";                       // muchas opciones: dos columnas, menos altura
  opts.forEach((o, i) => {
    const b = document.createElement("button");
    b.className = "opt" + (o.hard ? " hard" : "") + (o.leave ? " leave" : "") + (o.used ? " used" : "");
    if (o.used) b.disabled = true;
    b.style.animationDelay = (i * 45) + "ms";
    const k = document.createElement("span"); k.className = "k"; k.textContent = o.leave ? "Q" : i + 1; b.appendChild(k);
    const tg = document.createElement("span"); tg.className = "tag";
    tg.textContent = o.tag === "Pregunta incómoda" ? "Incómoda" : (o.tag || "");
    if (o.tag) tg.style.color = TAG_COLOR[o.tag] || "#9fb3cc";
    b.appendChild(tg);
    const t = document.createElement("span"); t.className = "t"; t.textContent = o.t; b.appendChild(t);
    if (o.cost) { const c = document.createElement("span"); c.className = "cost"; c.textContent = costText(o); b.appendChild(c); }
    b.addEventListener("click", e => { e.stopPropagation(); choose(i); });
    box.appendChild(b);
  });
}
function barChoose(i) {
  if (!B || B.state !== "talk" || typerBusy()) return;
  const o = B.talk.opts[i];
  if (!o) return;
  $("talkOpts").innerHTML = "";
  B.talk.opts = [];
  if (o.cost) { B.min = Math.min(BAR_LIMIT, B.min + o.cost); B.costFx = { n: o.cost, t: 1.6 }; }
  if (o.fx) o.fx();
  const go = () => { if (o.go) barNode(o.go); else barEndTalk(); };
  if (!o.tag) { go(); return; }
  if (o.go === null) { typeLines([["Tú", o.t]], go, true); return; }   // la última palabra es tuya
  const ctx2 = $("talkCtx"); ctx2.textContent = "Tú: " + o.t; ctx2.classList.remove("hidden");
  B.talkLog.push({ who: "Tú", text: o.t });
  go();
}
function barEndTalk() {
  if (!B || B.state !== "talk") return;
  talkClose();
  B.talk = null;
  if (B.leaveNow || B.min >= BAR_LIMIT) { barNightEnds(); return; }
  B.state = "play";
  if (!B.warned && B.min >= BAR_LIMIT - 8) { B.warned = true; toast("Paul: «Diez minutos y nos vamos»."); }
  lockMouse();
}
function barLeave() {
  if (!B.talk || typerBusy() || B.talk.id === "intro") return;
  const i = B.talk.opts.findIndex(o => o.leave);
  if (i >= 0) barChoose(i); else barEndTalk();
}
// Historial: todo lo que se dijo esta noche, para quien quiera releer
function toggleTalkLog() {
  const el = $("talkLog");
  if (!el.classList.contains("hidden")) { el.classList.add("hidden"); return; }
  el.innerHTML = "";
  const h = document.createElement("div"); h.className = "log-title"; h.textContent = "Lo que se ha dicho esta noche · [H] cerrar"; el.appendChild(h);
  for (const r of talkLogOf()) {
    const d = document.createElement("div");
    if (r.sep) { d.className = "log-sep"; d.textContent = r.sep; }
    else if (!r.who) { d.className = "log-narr"; d.textContent = r.text; }
    else { d.className = "log-line"; const w = document.createElement("b"); w.textContent = r.who + "  "; w.style.color = charColor(r.who, "#9fb3cc"); d.appendChild(w); d.appendChild(document.createTextNode(r.text)); }
    el.appendChild(d);
  }
  el.classList.remove("hidden");
  el.scrollTop = el.scrollHeight;
}

/* ---------- Diario: lo que sabes ---------- */
function barDiaryLines() {
  const L = [{ h: "Lo que sabes esta noche" }], ks = Object.keys(B.secrets);
  if (!ks.length) L.push({ note: "Nadie te ha contado nada importante todavía." });
  for (const k of ks) L.push("• " + SECRET_TXT[k]);
  const cl = Object.keys(CLUE_TXT).filter(k => B.f["clue_" + k]);
  if (cl.length) { L.push({ sub: "Cosas raras" }); for (const k of cl) L.push("• " + CLUE_TXT[k]); }
  L.push({ note: `Son las ${clockText()}. Paul se va a medianoche. [J] cerrar` });
  return L;
}

/* ---------- Fin de la noche ---------- */
let BAR_RESULT = null;             // se usará en los siguientes niveles
function barNightEnds() {
  B.state = "summary";
  $("diary").classList.add("hidden"); talkClose();
  const f = B.f, lines = [];
  const keysBy = f.paulMended ? "paul" : "stalin";
  lines.push(f.paulMended
    ? "Paul no puede ni con las llaves. Te las lanza: «Maneja tú. Confío en ti»."
    : "Paul no puede ni con las llaves. Stalin se las quita y te las da. Paul, desde el asiento de atrás: «Ni la camioneta me dejan»."
  );
  lines.push("Al salir miras la barra. El taburete del viejo está vacío. El plato de fritada sigue lleno.");
  lines.push("");
  const ks = Object.keys(B.secrets);
  lines.push(ks.length ? "Lo que sabes:" : "Nadie te contó nada importante.");
  for (const k of ks) lines.push("• " + SECRET_TXT[k]);
  const missing = 4 - ks.length;
  if (missing > 0) lines.push(`Hay ${missing === 1 ? "una verdad que" : missing + " verdades que"} tus amigos no te contaron.`);
  const rel = [];
  rel.push(f.paulMended ? "Paul te perdonó a medias." : "Paul sigue resentido contigo.");
  if (f.samiraOpen) rel.push("Samira confía en ti."); else if (f.samiraWary) rel.push("Samira desconfía de ti.");
  if (B.secrets.sebas) rel.push("Sebas por fin le dijo la verdad a alguien.");
  if (f.stalinShaken) rel.push("Stalin no ha dicho una palabra desde que oyó «Cabra Stalin».");
  lines.push(""); lines.push(rel.join(" "));
  BAR_RESULT = { keysBy, secrets: JSON.parse(JSON.stringify(B.secrets)), told: B.told.slice(), flags: { ...f } };
  endScreen({ title: `${clockText()} · A LA VÍA VIEJA`, text: lines.join("\n"), win: true,
              next: ["Subir a la camioneta »", barContinue], retry: ["Repetir la noche [R]", startBar] });
  barAudio(false);
}
function barContinue() {
  $("end").classList.add("hidden");
  startChase();                    // cinemática de la persecución (chase.js); al terminar llama a startMaizalAfterChase
}
function startMaizalAfterChase() {
  mzOverlayClear();
  MODE = "maizal";
  G = newGameState("intro");
  drone();
  sndMusic("mzMusic", "maizal_music", 0.4);
  const cx = G.cx;
  storyOpen([
    `NIVEL 3 · EL MAIZAL\n\nDespiertas junto a la Azulita, volcada entre el maíz. A unos metros, la nave arde en llamas verdes. La escotilla está abierta, y adentro no hay nada.\n\nLa pistola de tu papá sigue en tu chaqueta. ${cx.wounded} está herido en alguna parte.`,
    "Lo que salió de la nave copia caras y voces, y escuchó todo lo que se dijo cerca de don Lucho. Pero no sabe cómo es cada uno de tus amigos: lo que no encaja, no es tu amigo.\n\nLa única salida está bajo la luz verde, al otro lado del maizal. Es justo a donde esa cosa quiere llevarte.\n\nJ: lo que sabes."
  ], "Entrar al maizal »", () => { initAudio(); G.state = "play"; lockMouse(); });
}

/* ---------- Inicio ---------- */
const BAR_STORY = [
  "Viernes 13 de noviembre. Cumpleaños de Stalin.\n\nLa Última Parada es un bar de carretera en la vía vieja a Baños.",
  "Hace un año eran inseparables. Hoy casi no se hablan.\n\nPaul no te perdona que faltaras al funeral de su abuela. Esta semana se cumple un año, y sigue vestido de negro. Samira y Sebas terminaron hace un mes y nadie sabe por qué. Stalin eligió esta ruta, dos horas más larga, y no ha dicho por qué.",
  "Tú eres Pepe. Casi no vienes.\n\nPaul quiere salir a medianoche. Tienes media hora.\n\nLo que digan esta noche importa. Lo que callen, también."
];
function startBar() {
  initAudio(); mzOverlayClear();
  MODE = "bar";
  if (!BTEX.B) buildBarAssets();
  B = newBarState();
  hidePanels(); talkClose();
  storyOpen(BAR_STORY, "Entrar al bar »", () => barTalk("intro"));
  barAudio(true);
}

/* ---------- Audio: zumbido del bar y estática de la radio ---------- */
function barAudio(on) {                                // murmullo de la radio, el zumbido de los focos y la rocola
  if (!on) { sndStop("bar"); sndStop("barMusic"); return; }
  sndMusic("barMusic", "bar_music", 0.55);
  sndLoop("bar", out => {
    const src = AC.createBufferSource(); src.buffer = noiseBuf(2); src.loop = true;
    const bp = AC.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 0.8;
    const gain = AC.createGain(); gain.gain.value = 0;
    src.connect(bp); bp.connect(gain); gain.connect(out); src.start();
    const hum = AC.createOscillator(), hg = AC.createGain(); hum.frequency.value = 60; hum.type = "sine"; hg.gain.value = 0.018;
    hum.connect(hg); hg.connect(out); hum.start();
    return { gain, srcs: [src, hum] };
  });
}
/* ---------- Lógica ---------- */
const BAR_BODY = { speed: 2.4, r: 0.16, bobRate: 8, bobAmp: 2 };     // dentro del bar se camina más despacio
const barDiscs = () => BAR_PROPS.concat(BAR_CAST.map(k => ({ x: B.npc[k].x, y: B.npc[k].y, r: NPC_R })));
function barTarget() {
  let best = null, bestD = 1e9;
  const cands = [];
  for (const k in B.npc) cands.push({ id: k, name: CHARS[k].name, x: B.npc[k].x, y: B.npc[k].y, range: CHARS[k].bar.range, talk: true });
  for (const s of BAR_SPOTS) cands.push({ ...s, talk: false });
  for (const c of cands) {
    const d = Math.hypot(c.x - B.px, c.y - B.py);
    if (d > c.range) continue;
    const a = Math.abs(normAngle(Math.atan2(c.y - B.py, c.x - B.px) - B.ang));
    if (a > 0.6) continue;
    const score = d + a * 2;
    if (score < bestD) { bestD = score; best = c; }
  }
  return best;
}
const BARKS = {
  paul: ["Un año sin una llamada…", "¡Carmen, otra!", "Ni preguntó por mi abuela."],
  sebas: ["¡Don Lucho, usted sí se ríe de mis chistes! …¿Don Lucho?", "Carmen, ¿y las empanadas? ¡Ya pagué! Bueno, pagó Paul.", "¡Pepe, ven, que el don no habla!"],
  samira: ["Cuatro canciones y ninguna me gusta.", "No pienso sentarme en esa mesa."],
  carmen: ["¡La cocina cierra en diez!", "Esa radio está loca desde que llegó el señor."],
  stalin: ["(Stalin mira el cerro sin parpadear.)"]
};
function barUpdate(dt) {
  if (!B) return;
  if (mzOverlayTick(dt)) return;                         // una pantalla negra pausa el bar también
  B.t += dt;
  const barNodes = SND.loops.bar;
  const l = B.npc.lucho, dl = Math.hypot(l.x - B.px, l.y - B.py), zone = zoneAt(B.px, B.py);
  const talkingLucho = B.state === "talk" && B.talk && B.talk.id === "lucho" && typer.timer;
  const nearLucho = (zone === "salon" ? clamp(1 - dl / 5, 0, 1) : 0) * 0.6 + (talkingLucho ? 0.4 : 0);   // 0..1: cuánto interfiere esa cosa
  const jb = BAR_PROPS.find(p => p.img === "jukebox"), dj = Math.hypot(jb.x - B.px, jb.y - B.py);
  if (barNodes) {
    const target = (zone === "salon" ? 0.004 + 0.05 * clamp(1 - dl / 5, 0, 1) + 0.006 * clamp(1 - dj / 3, 0, 1) : 0.0) + (talkingLucho ? 0.05 : 0);
    barNodes.gain.gain.value += (target - barNodes.gain.gain.value) * Math.min(1, dt * 4);
  }
  {
    let lvl = clamp(1.15 - dj / 7, 0.15, 1), cut = clamp(5200 - dj * 380, 1600, 5200);          // la rocola suena vieja: sin agudos
    if (zone === "pasillo") { lvl *= 0.45; cut = 1100; }                                         // detrás de la pared
    else if (zone === "patio") { lvl *= 0.3; cut = 650; }                                         // desde afuera, apenas el bajo
    const wob = nearLucho > 0.05 ? 0.75 + 0.25 * Math.sin(B.t * 23) * Math.sin(B.t * 7.1) : 1;  // la canción se corta y vuelve
    sndMusicSet("barMusic", lvl * (1 - 0.55 * nearLucho) * wob, cut * (1 - 0.6 * nearLucho));
  }
  if (B.costFx) { B.costFx.t -= dt; if (B.costFx.t <= 0) B.costFx = null; }
  fpTurnTick(B, dt);
  if (B.state !== "play") return;
  fpWalk(B, dt, BAR_BODY, BAR_WORLD, barDiscs());
  // Frases sueltas de los demás cuando pasas cerca: el ambiente de la pelea
  B.barkT -= dt;
  if (B.barkT <= 0) {
    B.barkT = 6 + Math.random() * 4;
    for (const k in BARKS) {
      const n = B.npc[k];
      if (!n || Math.hypot(n.x - B.px, n.y - B.py) > 2.4) continue;
      if ((B.lastBark[k] || 0) > B.t - 12) continue;
      B.lastBark[k] = B.t;
      const line = pick(BARKS[k]);
      voice(line.startsWith("(") ? line : `«${line}»`, line.startsWith("(") ? null : CHARS[k].name, n.x, n.y);
      break;
    }
  }
}

/* ---------- Render del bar ---------- */
const FESTOON_RGB = ["255,180,80", "255,90,60", "110,220,110", "100,160,255"];
function barRender() {
  if (!B) return;
  const cam = engCamera(B.px, B.py, B.ang, fpBobY(B, BAR_BODY), B.pitch), hz = cam.hz;
  const T = performance.now() / 1000;
  barOut = zoneAt(B.px, B.py) === "patio";
  barFlick = 0.95 + 0.05 * Math.sin(T * 13) * Math.sin(T * 3.1);

  // Cielo (solo se ve hacia el patio), luego piso y techo texturizados encima
  ctx.fillStyle = "#03060d"; ctx.fillRect(0, 0, W, H);
  engSky(barSkyTex, cam);
  drawSkyLife(hz, T, B);
  engPlanes(cam, BAR_WORLD);
  drawTV(T);
  // Paredes (y la barra baja, que deja ver lo que hay detrás)
  engWalls(cam, BAR_WORLD);

  // Sprites: personas, muebles, focos (de lejos a cerca)
  const items = [];
  for (const p of BAR_PROPS) items.push({ img: BSPR[p.img], x: p.x, y: p.y, h: p.h, lift: p.lift || 0, glow: p.glow, fest: /^f\d$/.test(p.img) ? +p.img[1] : -1 });
  for (const k in B.npc) items.push({ img: BSPR[k], x: B.npc[k].x, y: B.npc[k].y, h: personH(BSPR[k]), who: k });
  const glows = [];
  engSprites(cam, items, barShade, (it, r) => {
    if (it.glow === 1) glows.push({ x: r.cx, y: r.bottom - r.size * 0.3, r: Math.min(160, (H / r.ty) * 0.9) });
    if (it.glow === 2) glows.push({ x: r.cx, y: r.bottom - r.size * 0.5, r: Math.min(40, (H / r.ty) * 0.18), col: FESTOON_RGB[it.fest], small: true });
    if (it.img === BSPR.jukebox) glows.push({ x: r.cx, y: r.bottom - r.size * 0.55, r: Math.min(140, (H / r.ty) * 0.7), col: "200,80,180" });
  });
  // Halos de luz de los focos y de la rocola
  for (const g of glows) {
    const fl = g.small ? 0.8 + 0.2 * Math.sin(T * 2 + g.x * 0.1) : g.col ? 0.85 + 0.15 * Math.sin(T * 3) : 0.92 + 0.08 * Math.sin(T * 17 + g.x);
    engGlow(g.x, g.y, g.r, g.col || "255,190,110", (g.small ? 0.5 : 0.32) * fl);
  }
  engVignette(0.32, 0.7);

  if (B.state === "play" || B.state === "talk") barHud();
  drawEcho(PAUSED ? 0 : 1 / 60);
  drawMzOverlay();
}
function barHud() {
  const left = BAR_LIMIT - B.min;
  hudPanel([{ t: clockText(), c: left <= 8 ? UI.danger : UI.gold }, { t: `Paul se va a las 00:00 (${left} min)` }]);
  if (B.costFx) {                                       // los minutos que costó lo último que dijiste
    const a = clamp(B.costFx.t / 1.6, 0, 1);
    ctx.font = uiPixel(); ctx.textBaseline = "middle";
    ctx.fillStyle = `rgba(255,91,104,${a.toFixed(2)})`; ctx.fillText(`−${B.costFx.n} MIN`, 76, 21 - (1 - a) * 8);
    ctx.textBaseline = "alphabetic";
  }
  if (B.state !== "play") return;
  hudCorner("[J] lo que sabes");
  const t = barTarget();
  if (t) hudPrompt(t.talk ? `[E] Hablar con ${t.name}` : `[E] Examinar ${t.name}`);
  else hudMouseHint();
}

/* ---------- Teclado del bar ---------- */
function barKey(c) {
  if (B.state === "talk") { talkKey(c, i => { const o = B.talk.opts[i]; if (o && !o.leave) barChoose(i); }, barLeave); return; }
  if (B.state === "play") {
    if (c === "KeyE") { const t = barTarget(); if (t) { $("diary").classList.add("hidden"); barTalk(t.id); } }
    else if (c === "KeyJ") diaryToggle(barDiaryLines());
  }
}

$("endNextBtn").addEventListener("click", () => { if (END.next) END.next(); });
$("talkBox").addEventListener("click", () => { if (MODE === "bar" || MODE === "maizal") advanceTalk(); });
cv.addEventListener("click", () => { if (MODE === "chase") chaseKey("Enter"); });
$("talkLog").addEventListener("click", () => toggleTalkLog());

/* ============ Niveles y pausa ============ */
const DEFAULT_BAR_RESULT = () => ({ keysBy: "stalin", secrets: {}, told: [], flags: {} });
function startLevel(n) {
  setPause(false);
  hidePanels(); talkClose(); STORYP = null;
  if (MODE === "chase" && CH) CH.done = true;
  sndStopAll();
  mzOverlayClear();
  if (n === 1) startBar();
  else if (n === 2) { initAudio(); if (!BAR_RESULT) BAR_RESULT = DEFAULT_BAR_RESULT(); startChase(); }
  else if (n === 3) { initAudio(); if (!BAR_RESULT) BAR_RESULT = DEFAULT_BAR_RESULT(); startMaizalAfterChase(); }
  else if (n === 4) startFinal(FINAL_IN);
}
let PAUSED = false;
function canPause() {
  if (MODE === "bar") return !!B && B.state !== "summary";
  if (MODE === "chase") return !!CH && !CH.done;
  if (MODE === "maizal") return !!G && !["end", "cutscene", "intro"].includes(G.state);
  if (MODE === "final") return !!FN && (FN.state === "play" || FN.state === "dialog") && !FN.cine;
  return false;
}
function setPause(on) {
  if (on && !canPause()) return;
  PAUSED = on;
  $("pause").classList.toggle("hidden", !on);
  if (on) releaseMouse();
  try { if (AC) { if (on) AC.suspend(); else AC.resume(); } } catch (e) { /* sin audio */ }
  sndMusicPause(on);
}
// Escape abre la pausa solo mientras caminas (en un diálogo sirve para salir de él); P, siempre
const inPlay = () => !!fpActive();
function levelOfMode() { return MODE === "bar" ? 1 : MODE === "chase" ? 2 : MODE === "final" ? 4 : 3; }
function showLevels() { $("levelList").classList.toggle("hidden"); }

/* ============ Entrada y bucle principal ============ */
try { buildBarAssets(); } catch (e) { showError("texturas: " + e.message); }
G = newGameState("menu");
showMenu();

window.addEventListener("keydown", e => {
  const c = e.code;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(c)) e.preventDefault();
  keys[c] = true;
  if (c.startsWith("Key") && cheatKey(c.slice(3).toLowerCase())) return;
  if (c === "KeyP" || (c === "Escape" && PAUSED)) { setPause(!PAUSED); return; }
  if (PAUSED) return;
  if (endShown() && endKey(c)) return;
  if (c === "Escape" && inPlay()) { setPause(true); return; }
  if (MODE === "chase") { chaseKey(c); return; }
  const adv = c === "Enter" || c === "Space" || c === "KeyE";
  if (adv && (MODE === "bar" || MODE === "maizal" || MODE === "final") && mzStoryKey()) return;     // pantalla negra: avanza
  if (STORYP) { if (c === "Enter" || c === "Space") storyNext(); return; }       // intro de cualquier nivel
  if (MODE === "bar") { if (B) barKey(c); return; }
  if (MODE === "final") { finalKey(c); return; }
  mzKey(c);
});
function mzKey(c) {
  if (G.state === "menu") { if (c === "Enter" || c === "Space") startFromMenu(); return; }
  if (G.state === "cutscene") { if ((c === "Enter" || c === "Space") && G.cine.t > 1.5) G.cine.t = G.cine.dur; return; }
  if (G.state === "end" || G.state === "shoot") return;
  if (c === "KeyJ") { diaryToggle(mzDiaryLines()); return; }

  if (G.state === "dialog") talkKey(c, mzChoose);         // en el maizal no hay cómo irse: decides o se acaba el tiempo
  else if (G.state === "play" && c === "KeyM") G.showMap = !G.showMap;
}
window.addEventListener("mousemove", e => {
  const S = fpActive();
  if (S && document.pointerLockElement === cv && !mzFrozen()) fpLook(S, e);
});
cv.addEventListener("click", () => { if ((MODE === "maizal" || MODE === "bar") && mzStoryKey()) return; if (fpActive()) lockMouse(); });
window.addEventListener("keyup", e => { keys[e.code] = false; });
window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

$("menuBtn").addEventListener("click", startFromMenu);
$("levelsBtn").addEventListener("click", showLevels);
for (const b of document.querySelectorAll("#levelList [data-lv]")) b.addEventListener("click", () => startLevel(Number(b.dataset.lv)));
$("pResume").addEventListener("click", () => setPause(false));
$("pVol").value = Math.round(SND.vol * 100);
$("pVol").addEventListener("input", e => { sndVolume(e.target.value / 100); $("pVolN").textContent = e.target.value; });
$("pVolN").textContent = $("pVol").value;
$("pRestart").addEventListener("click", () => startLevel(levelOfMode()));
$("pLevels").addEventListener("click", () => { setPause(false); toMenu(); showLevels(); });
$("pMenu").addEventListener("click", () => { setPause(false); toMenu(); });
$("endMenuBtn").addEventListener("click", toMenu);
$("introBtn").addEventListener("click", storyNext);
$("endBtn").addEventListener("click", () => { if (END.retry) END.retry(); });

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  try {
    if (G.state === "menu") { G.t += dt; G.ang = Math.sin(G.t * 0.22) * 0.55; G.bob = 0; }
    if (MODE === "bar") { if (!PAUSED) barUpdate(dt); barRender(); }
    else if (MODE === "chase") { if (!PAUSED) chaseUpdate(dt); chaseRender(); }
    else if (MODE === "final") { if (!PAUSED) finalUpdate(dt); finalRender(); }
    else { if (!PAUSED) update(dt); render(); }
  } catch (e) {
    showError(e.message + " · " + String(e.stack || "").split("\n").slice(1, 3).join(" ").trim());
    ctx.setTransform(1, 0, 0, 1, 0, 0);               // que un cuadro roto no deje el lienzo desplazado
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
}
requestAnimationFrame(frame);
