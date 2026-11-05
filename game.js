"use strict";
/* Escape del Maizal — primera persona (raycasting en canvas, sin dependencias).
 * El arte pixelado se dibuja por código; no hay que descargar sprites.
 */

/* ============ Configuración (ajusta aquí la dificultad) ============ */
const CFG = {
  W: 640, H: 400, COL: 2, FOV: 1.15,       // resolución interna, ancho de columna, campo de visión (rad)
  MOVE: 3.1, TURN: 2.3,                    // casillas/s y rad/s del jugador
  ALIEN_BASE: 0.5,                         // velocidad inicial del alien (casillas/s)
  ALIEN_PER_EVENT: 0.08,                   // aumento por cada encuentro resuelto
  CATCH: 0.55,                             // distancia a la que el alien te atrapa
  ASK_COST_SEC: 2.5,                       // segundos de persecución que cuesta cada pregunta
  TRIGGER: 2.0,                            // distancia para iniciar un encuentro
  IMPOSTORS: 2                             // cantidad de aliens disfrazados
};
const { W, H, COL } = CFG;
const NCOLS = W / COL;

/* ============ Mapa ============ */
// # = maizal (muro), . = camino, P = inicio, X = salida.
const RAW = [
"#########################",
"#P....#.......#.........#",
"#####.#.#####.#.#######.#",
"#.....#.....#.#.....#...#",
"#.#########.#.#####.#.###",
"#.........#.#.....#.#...#",
"#########.#.#####.#.###.#",
"#.........#.....#.#.....#",
"#.#############.#.#####.#",
"#.....#.........#.....#.#",
"#####.#.###########.#.#.#",
"#.....#.......#.....#.#.#",
"#.###########.#.#####.#.#",
"#...........#.#.....#...#",
"###########.#.#####.#####",
"#...........#.....#......#",
"#.#####################..#",
"#.......................X#",
"#########################"
];
const COLS = 26, ROWS = RAW.length;
const MAP = RAW.map(r => r.padEnd(COLS, "#"));
const isWall = (x, y) => x < 0 || y < 0 || x >= COLS || y >= ROWS || MAP[y][x] === "#";

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
const FRIENDS = ["Samira", "Sebas", "Stalin", "Paul"];
const OUTFIT = {              // [chaqueta, pelo]
  Samira: ["#c0508a", "#3a2418"], Sebas: ["#d19a2a", "#1a1a1a"],
  Stalin: ["#8a5bc0", "#6b3a1e"], Paul: ["#3a9a8f", "#141414"]
};

const STORY = [
  "Salieron de Quito un viernes por la noche: cinco amigos apretados en la camioneta azul de Paul, rumbo a Baños para celebrar el cumpleaños de Stalin.",
  "En la gasolinera, Sebas compró empanadas para todos. Reían, cantaban, nadie notó la luz verde que los seguía desde las nubes.",
  "Una hora después, en medio de la carretera, el motor se apagó. La luz bajó sobre el maizal… y algo salió de ella.",
  "Corrieron. El alien los persiguió entre las plantas y, entre gritos, el grupo se separó. Ahora estás solo en un laberinto de maíz, de noche.",
  "Tus amigos —Samira, Sebas, Stalin y Paul— siguen perdidos aquí. Pero el alien copia rostros y voces, y te espera disfrazado de ellos.\n\nSi dejas vivir a un impostor, es el fin. Si acabas con un amigo, nunca te lo perdonarás.\n\nSal vivo… con todos tus amigos.\n\nPista: sigue la luz verde en el cielo, es la salida."
];

const DIARY = [
  "Lo que recuerdas del viaje:",
  "• Salieron de Quito rumbo a Baños.",
  "• Paul manejaba su camioneta azul.",
  "• Era el cumpleaños de Stalin.",
  "• En la gasolinera, Sebas compró empanadas.",
  "",
  "Los impostores solo conocen parte de la historia. Cuanto más preguntes, más seguro estarás… pero cada pregunta le da tiempo al alien."
];

const QUESTIONS = [
  { id: "driver", label: "¿Quién manejaba la camioneta?", truth: "Paul", wrong: ["Sebas", "Stalin", "Samira"],
    say: [v => `Manejaba ${v}, ¿por qué preguntas eso?`, v => `${v} iba al volante, ¿ya lo olvidaste?`],
    self: "Yo manejaba, ¿no me reconoces?" },
  { id: "birthday", label: "¿De quién era el cumpleaños?", truth: "Stalin", wrong: ["Samira", "Sebas", "Paul"],
    say: [v => `Íbamos a celebrar el cumpleaños de ${v}.`, v => `Era el cumple de ${v}. ¿Qué te pasa?`],
    self: "¡Era mi cumpleaños! ¿Cómo puedes olvidarlo?" },
  { id: "dest", label: "¿A dónde íbamos?", truth: "Baños", wrong: ["Mindo", "Tena", "Montañita"],
    say: [v => `Íbamos a ${v}.`, v => `Rumbo a ${v}, hasta teníamos reserva.`] },
  { id: "gas", label: "¿Qué compró Sebas en la gasolinera?", truth: "empanadas", wrong: ["helados", "café", "chocolates"],
    say: [v => `Sebas compró ${v} para todos.`, v => `Compró ${v}. ¿Para qué quieres saberlo?`] }
];

const OPENERS = [
  n => `¡Eres tú! Soy ${n}, me perdí entre el maíz. ¡Ayúdame, esa cosa me viene siguiendo!`,
  n => `¡Por fin alguien! ${n}… soy ${n}. Por favor, no me dejes solo/a aquí.`,
  n => `¡Shhh! ¡Soy ${n}! Ven, sácame de aquí antes de que nos encuentre.`
];
const QUIRK_REAL = ["(Tiembla y mira hacia atrás.)", "(Respira agitado, con hojas en el pelo.)", "", ""];
const QUIRK_FAKE = ["(Sus ojos brillan verde un instante.)", "(Sonríe, pero un segundo tarde.)", "(Habla sin pestañear.)", "", ""];

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
function buildSky() {
  const sh = 600;
  const c = makeCanvas(SKYW, sh), g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, sh);
  gr.addColorStop(0, "#04070f"); gr.addColorStop(1, "#17294a");
  g.fillStyle = gr; g.fillRect(0, 0, SKYW, sh);
  for (let i = 0; i < 380; i++) {
    g.fillStyle = `rgba(255,255,255,${rand(0.25, 0.9)})`;
    g.fillRect(Math.random() * SKYW, Math.random() * sh * 0.95, 1, 1);
  }
  const mx = SKYW * 0.3, my = 470;                   // luna
  g.fillStyle = "rgba(200,220,255,.12)"; g.beginPath(); g.arc(mx, my, 30, 0, 7); g.fill();
  g.fillStyle = "#dfe8ff"; g.beginPath(); g.arc(mx, my, 15, 0, 7); g.fill();
  g.fillStyle = "#04070f"; g.beginPath(); g.arc(mx + 6, my - 3, 13, 0, 7); g.fill();
  return c;
}

function sprite(painter) {
  const c = makeCanvas(32, 32), g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  painter(g);
  return c;
}
function figureSprite(jacket, hair) {
  return sprite(c => {
    c.fillStyle = "#080b10"; c.fillRect(7, 28, 18, 3);
    c.fillStyle = "#292b36"; c.fillRect(9, 25, 5, 5); c.fillRect(18, 25, 5, 5);
    c.fillStyle = "#263e67"; c.fillRect(10, 18, 12, 8);
    c.fillStyle = jacket; c.fillRect(9, 11, 14, 9);
    c.fillStyle = "#e5a56f"; c.fillRect(4, 5, 5, 10); c.fillRect(23, 5, 5, 10);   // brazos en alto
    c.fillStyle = jacket; c.fillRect(5, 12, 4, 4); c.fillRect(23, 12, 4, 4);
    c.fillStyle = "#f0bd8b"; c.fillRect(11, 2, 10, 9);
    c.fillStyle = hair; c.fillRect(10, 0, 12, 4);
    c.fillStyle = "#10151e"; c.fillRect(13, 6, 2, 2); c.fillRect(18, 6, 2, 2);
    c.fillStyle = "#7a2f2f"; c.fillRect(14, 9, 4, 1);
  });
}
const SPR = { alien: null, player: null, figures: {} };
function buildSprites() {
  SPR.alien = sprite(c => {
    c.fillStyle = "#020405"; c.fillRect(5, 29, 22, 3);                       // sombra
    c.fillStyle = "#0e2a1a"; c.fillRect(11, 21, 3, 9); c.fillRect(18, 21, 3, 9);   // piernas largas
    c.fillStyle = "#08170f"; c.fillRect(9, 29, 5, 2); c.fillRect(18, 29, 5, 2);
    c.fillStyle = "#173a26"; c.fillRect(11, 11, 10, 12);                     // torso alargado
    c.fillStyle = "#0a1a11"; c.fillRect(13, 13, 1, 8); c.fillRect(15, 13, 1, 8); c.fillRect(17, 13, 1, 8);  // costillas
    c.fillStyle = "#173a26"; c.fillRect(7, 11, 3, 16); c.fillRect(22, 11, 3, 16);  // brazos largos
    c.fillStyle = "#d8dcc8";                                                 // garras
    c.fillRect(6, 27, 1, 5); c.fillRect(8, 27, 1, 5); c.fillRect(10, 27, 1, 4);
    c.fillRect(21, 27, 1, 4); c.fillRect(23, 27, 1, 5); c.fillRect(25, 27, 1, 5);
    c.fillStyle = "#2a6b3f"; c.fillRect(10, 1, 12, 11); c.fillRect(13, 0, 6, 1);   // cráneo alargado
    c.fillStyle = "#7dff9b"; c.fillRect(15, 2, 1, 3); c.fillRect(17, 2, 1, 2);     // venas brillantes
    c.fillStyle = "#000000"; c.fillRect(11, 5, 4, 4); c.fillRect(17, 5, 4, 4);     // ojos enormes
    c.fillRect(10, 4, 2, 1); c.fillRect(20, 4, 2, 1);
    c.fillStyle = "#ff2030"; c.fillRect(12, 6, 2, 2); c.fillRect(18, 6, 2, 2);     // pupilas rojas
    c.fillStyle = "#ffd0d0"; c.fillRect(12, 6, 1, 1); c.fillRect(18, 6, 1, 1);
    c.fillStyle = "#000000"; c.fillRect(12, 9, 8, 3);                        // boca
    c.fillStyle = "#e8ecd8";                                                 // dientes
    for (let x = 12; x < 20; x += 2) { c.fillRect(x, 9, 1, 2); c.fillRect(x + 1, 10, 1, 2); }
  });
  SPR.player = figureSprite("#426ca1", "#8c513d");
  for (const n of FRIENDS) SPR.figures[n] = figureSprite(OUTFIT[n][0], OUTFIT[n][1]);
}

/* ============ Estado del juego ============ */
function newGameState(state) {
  const start = findTile("P"), exit = findTile("X");
  const path = bfs(start.x, start.y, exit.x, exit.y);

  // Encuentros: 4 amigos reales + impostores, en orden aleatorio a lo largo de la ruta.
  const list = shuffle([
    ...FRIENDS.map(n => ({ name: n, impostor: false })),
    ...Array.from({ length: CFG.IMPOSTORS }, () => ({ name: pick(FRIENDS), impostor: true }))
  ]);
  if (list[0].impostor) {                       // el primer encuentro siempre es un amigo real
    const j = list.findIndex(e => !e.impostor);
    [list[0], list[j]] = [list[j], list[0]];
  }
  const n = path.length;
  list.forEach((e, k) => {
    const idx = clamp(Math.floor(n * (k + 1) / (list.length + 1)), 4, n - 4);
    e.x = path[idx][0] + 0.5; e.y = path[idx][1] + 0.5;
    e.done = false; e.asked = new Set();
    e.wrong = new Set(e.impostor ? shuffle(QUESTIONS.map(q => q.id)).slice(0, Math.random() < 0.5 ? 1 : 2) : []);
  });

  // El alien aparece lejos del jugador y de la salida.
  const cands = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (isWall(x, y)) continue;
    const ds = Math.hypot(x - start.x, y - start.y), de = Math.hypot(x - exit.x, y - exit.y);
    if (ds >= 18 && ds <= 26 && de >= 10) cands.push([x, y]);
  }
  const [ax, ay] = cands.length ? pick(cands) : [COLS - 3, 2];

  return {
    state, t: 0, bob: 0,
    px: start.x + 0.5, py: start.y + 0.5, ang: 0, pitch: 0,
    ax: ax + 0.5, ay: ay + 0.5,
    exit: { x: exit.x + 0.5, y: exit.y + 0.5 },
    enc: list, cur: null, resolved: 0, saved: 0,
    seen: Array.from({ length: ROWS }, () => Array(COLS).fill(false)),
    showMap: true, beat: 0, warnT: 0, toastT: 0, introPage: 0
  };
}

let G;
const keys = {};
let cheat = "";
let AC = null;

/* ============ Audio (latidos cuando el alien está cerca) ============ */
function initAudio() {
  try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
}
function thump(vol) {
  if (!AC) return;
  try {
    const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
    o.type = "sine"; o.frequency.value = 58;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(g); g.connect(AC.destination);
    o.start(t); o.stop(t + 0.25);
  } catch (e) { /* sin audio */ }
}
let droneOn = false;
function drone() {
  if (!AC || droneOn) return;
  droneOn = true;
  try {
    const g = AC.createGain(); g.gain.value = 0.05; g.connect(AC.destination);
    for (const f of [43, 43.8, 86.5]) { const o = AC.createOscillator(); o.type = "sine"; o.frequency.value = f; o.connect(g); o.start(); }
  } catch (e) { /* sin audio */ }
}
function scream() {
  if (!AC) return;
  try {
    const t = AC.currentTime, n = Math.floor(AC.sampleRate * 1.2);
    const buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = AC.createBufferSource(); src.buffer = buf;
    const bp = AC.createBiquadFilter(); bp.type = "bandpass";
    bp.frequency.setValueAtTime(900, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 1);
    const g = AC.createGain(); g.gain.value = 0.55;
    src.connect(bp); bp.connect(g); g.connect(AC.destination); src.start(t);
    const o = AC.createOscillator(), og = AC.createGain();
    o.type = "sawtooth"; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(1500, t + 0.8);
    og.gain.setValueAtTime(0.3, t); og.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    o.connect(og); og.connect(AC.destination); o.start(t); o.stop(t + 1.2);
  } catch (e) { /* sin audio */ }
}
function chime() {
  if (!AC) return;
  try {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const t = AC.currentTime + i * 0.35, o = AC.createOscillator(), g = AC.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
      o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + 2.3);
    });
  } catch (e) { /* sin audio */ }
}
function growl() {
  if (!AC) return;
  try {
    const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.9);
    f.type = "lowpass"; f.frequency.value = 600;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    o.connect(f); f.connect(g); g.connect(AC.destination);
    o.start(t); o.stop(t + 1.05);
  } catch (e) { /* sin audio */ }
}
function heartbeat(d) { thump(0.25 + 0.3 * d); setTimeout(() => thump(0.18 + 0.25 * d), 170); }

/* ============ Mouse (cámara) ============ */
const MOUSE_SENS = 0.0025;                           // radianes por píxel
function lockMouse() {
  try { const p = cv.requestPointerLock && cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* sin bloqueo */ }
}
function releaseMouse() {
  try { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* nada */ }
}

/* ============ UI (historia, diálogos, final) ============ */
let toastTimer = null;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

function showMenu() {
  for (const k of ["intro", "dialog", "diary", "end"]) $(k).classList.add("hidden");
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
  if (G.state !== "menu") return;
  initAudio(); drone();
  $("menu").classList.add("hidden");
  G.state = "intro";
  showIntro();
}
function toMenu() {
  releaseMouse();
  G = newGameState("menu");
  showMenu();
}

function showIntro() {
  $("intro").classList.remove("hidden");
  $("introText").textContent = STORY[G.introPage];
  $("introBtn").textContent = G.introPage === STORY.length - 1 ? "¡Entrar al maizal! ▶" : "Continuar ▶";
}
function nextIntro() {
  initAudio();
  if (G.introPage < STORY.length - 1) { G.introPage++; showIntro(); return; }
  $("intro").classList.add("hidden");
  G.state = "play";
  lockMouse();
}

function toggleDiary() {
  const d = $("diary");
  if (d.classList.contains("hidden")) {
    d.innerHTML = "";
    DIARY.forEach((l, i) => {
      const p = document.createElement("div");
      p.textContent = l;
      if (i === 0) p.style.cssText = "color:#b9f66d;font-weight:bold;margin-bottom:6px";
      d.appendChild(p);
    });
    d.classList.remove("hidden");
  } else d.classList.add("hidden");
}

function addLog(text, cls) {
  const d = document.createElement("div");
  if (cls) d.className = cls;
  d.textContent = text;
  const log = $("dlgLog");
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}

function buildQuestionButtons() {
  const box = $("dlgQs");
  box.innerHTML = "";
  QUESTIONS.forEach((q, i) => {
    const b = document.createElement("button");
    b.textContent = `[${i + 1}] ${q.label}`;
    b.disabled = G.cur.asked.has(q.id);
    b.addEventListener("click", () => ask(i));
    box.appendChild(b);
  });
}

function startEncounter(e) {
  releaseMouse();
  G.state = "dialog"; G.cur = e;
  G.ang = Math.atan2(e.y - G.py, e.x - G.px);       // mira a la persona
  G.pitch = 0;
  $("dialog").classList.remove("hidden");
  $("dlgQs").classList.remove("hidden");
  $("dlgDecide").classList.remove("hidden");
  $("btnContinue").classList.add("hidden");
  $("dlgLog").innerHTML = "";
  $("dlgName").textContent = `Una figura entre el maíz dice llamarse ${e.name}`;
  addLog(`${e.name}: ${pick(OPENERS)(e.name)}`);
  buildQuestionButtons();
}

function ask(i) {
  if (G.state !== "dialog") return;
  const e = G.cur, q = QUESTIONS[i];
  if (!q || e.asked.has(q.id)) return;
  e.asked.add(q.id);
  addLog(`Tú: ${q.label}`, "you");

  const wrong = e.impostor && e.wrong.has(q.id);
  const v = wrong ? pick(q.wrong) : q.truth;
  const line = (q.self && v === e.name) ? q.self : pick(q.say)(v);
  const quirk = pick(e.impostor ? QUIRK_FAKE : QUIRK_REAL);
  addLog(`${e.name}: ${line}`);
  if (quirk) addLog(quirk, "narr");

  moveAlienFor(CFG.ASK_COST_SEC);                    // el tiempo corre mientras preguntas
  if (Math.hypot(G.ax - G.px, G.ay - G.py) < CFG.CATCH) {
    endGame(false, "¡TE ATRAPÓ!", "Mientras hablabas, el alien salió del maizal y te alcanzó.");
    return;
  }
  if (Math.hypot(G.ax - G.px, G.ay - G.py) < 4) addLog("(El maíz cruje cada vez más cerca…)", "narr");
  buildQuestionButtons();
}

function showResult(text) {
  G.state = "result";
  addLog(text, "res");
  $("dlgQs").classList.add("hidden");
  $("dlgDecide").classList.add("hidden");
  $("btnContinue").classList.remove("hidden");
}
function continueAfterResult() {
  if (G.state !== "result") return;
  lockMouse();
  $("dialog").classList.add("hidden");
  G.cur = null; G.state = "play";
}

function decide(spare) {
  if (G.state !== "dialog") return;
  const e = G.cur;
  e.done = true;
  if (spare && !e.impostor) {
    G.resolved++; G.saved++;
    revealAhead(14);
    showResult(`${e.name} es real. Respira aliviado/a y se une a ti: recuerda parte del camino y lo marca en tu mapa.`);
  } else if (!spare && e.impostor) {
    G.resolved++;
    pushAlienAway(4);
    showResult("Su rostro se deshace en una masa verde: era el alien. El estallido de luz lo aleja un momento del maizal.");
  } else if (!spare && !e.impostor) {
    endGame(false, "ERA UN AMIGO", `${e.name} era real. Acabaste con la vida de tu amigo/a… y el alien te encuentra solo.`);
  } else {
    endGame(false, "¡TE ENGAÑÓ!", `Dejaste vivir al impostor. "${e.name}" te abraza, y sus brazos se vuelven garras.`);
  }
}

function endGame(win, title, text) {
  releaseMouse();
  $("dialog").classList.add("hidden");
  $("diary").classList.add("hidden");
  const kind = win ? "win" : title === "ERA UN AMIGO" ? "friend" : title === "¡TE ENGAÑÓ!" ? "fake" : "caught";
  const t0 = (kind === "friend" || kind === "fake") ? 1.6 : 0;
  G.cine = { type: win ? "win" : "lose", kind, title, text, t: 0, t0, name: G.cur ? G.cur.name : null,
             dur: win ? 9 : t0 + 4.8, s1: false, s2: false };
  // el alien real sale de escena: la animación lo dibuja aparte
  G.ax = G.px - Math.cos(G.ang) * 60; G.ay = G.py - Math.sin(G.ang) * 60;
  G.pitch = 0;
  G.state = "cutscene";
}

function showEndPanel() {
  const c = G.cine;
  G.state = "end";
  const t = $("endTitle");
  t.textContent = c.title; t.className = c.type === "win" ? "win" : "lose";
  $("endText").textContent = c.text;
  $("end").className = "panel full " + (c.type === "win" ? "win-end" : "lose-end");
}

function restart() {
  lockMouse();
  for (const k of ["menu", "intro", "dialog", "diary", "end"]) $(k).classList.add("hidden");
  G = newGameState("play");
}

/* ============ Lógica ============ */
function alienSpeed() { return CFG.ALIEN_BASE + CFG.ALIEN_PER_EVENT * G.resolved; }

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

function blocked(x, y) {
  const r = 0.22;
  return isWall(Math.floor(x - r), Math.floor(y - r)) || isWall(Math.floor(x + r), Math.floor(y - r)) ||
         isWall(Math.floor(x - r), Math.floor(y + r)) || isWall(Math.floor(x + r), Math.floor(y + r));
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
  if (G.cine && (G.state === "cutscene" || G.state === "end")) { updateCine(dt); return; }
  if (G.state !== "play") return;
  G.t += dt;

  // WASD / flechas: adelante, atrás y desplazamiento lateral. La cámara se gira con el mouse.
  const fwd = (keys.ArrowUp || keys.KeyW ? 1 : 0) - (keys.ArrowDown || keys.KeyS ? 1 : 0);
  const side = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  if (fwd || side) {
    const len = Math.hypot(fwd, side);
    const vx = (Math.cos(G.ang) * fwd - Math.sin(G.ang) * side) / len;
    const vy = (Math.sin(G.ang) * fwd + Math.cos(G.ang) * side) / len;
    const nx = G.px + vx * CFG.MOVE * dt, ny = G.py + vy * CFG.MOVE * dt;
    if (!blocked(nx, G.py)) G.px = nx;
    if (!blocked(G.px, ny)) G.py = ny;
    G.bob += dt * 9;
  }

  // Mapa explorado
  const cx = Math.floor(G.px), cy = Math.floor(G.py);
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS && Math.hypot(x + 0.5 - G.px, y + 0.5 - G.py) < 2.4) G.seen[y][x] = true;
  }

  // El alien siempre sabe dónde estás y cruza el maizal.
  moveAlienFor(dt);
  const ad = Math.hypot(G.ax - G.px, G.ay - G.py);
  if (ad < CFG.CATCH) { endGame(false, "¡TE ATRAPÓ!", "El alien te encontró entre las plantas."); return; }

  const danger = clamp(1 - ad / 6, 0, 1);
  G.beat -= dt;
  if (danger > 0.05 && G.beat <= 0) { heartbeat(danger); G.beat = 1.1 - 0.8 * danger; }
  G.growlT = (G.growlT || 0) - dt;
  if (ad < 7 && !isWall(Math.floor(G.ax), Math.floor(G.ay)) && G.growlT <= 0) { growl(); G.growlT = 8; }
  G.warnT -= dt;
  if (ad < 5 && isWall(Math.floor(G.ax), Math.floor(G.ay)) && G.warnT <= 0) {
    toast("Algo se mueve entre el maíz…"); G.warnT = 4;
  }

  // Encuentros con personas
  for (const e of G.enc) {
    if (!e.done && Math.hypot(e.x - G.px, e.y - G.py) < CFG.TRIGGER) { startEncounter(e); return; }
  }

  // Salida
  if (Math.hypot(G.exit.x - G.px, G.exit.y - G.py) < 0.7) {
    if (G.enc.every(e => e.done)) {
      endGame(true, "¡ESCAPASTE!", "Cruzan el último surco del maizal juntos, con Samira, Sebas, Stalin y Paul a salvo. Amanece, y la luz verde desaparece del cielo.");
    } else if (G.t - G.toastT > 3) {
      toast("No puedes irte aún: todavía hay personas pidiendo ayuda ahí dentro.");
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
const cornTex = buildCorn();
const skyTex = buildSky();
const zBuf = new Float32Array(NCOLS);
buildSprites();

function fogAlpha(dist, side) {
  return clamp(Math.pow(clamp(dist / 8, 0, 1), 0.8) * 0.95 + (side ? 0.12 : 0), 0, 0.97);
}

function drawSprite(R, img, wx, wy, scale) {
  const sx = wx - G.px, sy = wy - G.py;
  const inv = 1 / (R.plx * R.dy - R.dx * R.ply);
  const tx = inv * (R.dy * sx - R.dx * sy);
  const ty = inv * (-R.ply * sx + R.plx * sy);
  if (ty < 0.15) return;
  const size = Math.abs(H / ty) * scale;
  const cx = (W / 2) * (1 + tx / ty);
  const left = cx - size / 2, right = cx + size / 2;
  if (right < 0 || left > W) return;
  const bottom = R.hz + (H / ty) / 2, top = bottom - size;

  tctx.clearRect(0, 0, W, H);
  const i0 = Math.max(0, Math.floor(left / COL)), i1 = Math.min(NCOLS - 1, Math.floor(right / COL));
  for (let i = i0; i <= i1; i++) {
    if (ty >= zBuf[i]) continue;                    // tapado por maíz
    const u = (i * COL + COL / 2 - left) / size;
    if (u < 0 || u >= 1) continue;
    tctx.drawImage(img, Math.floor(u * 32), 0, 1, 32, i * COL, top, COL, size);
  }
  tctx.globalCompositeOperation = "source-atop";
  tctx.fillStyle = `rgba(3,8,20,${fogAlpha(ty, 0).toFixed(3)})`;
  tctx.fillRect(0, 0, W, H);
  tctx.globalCompositeOperation = "source-over";
  ctx.drawImage(tcv, 0, 0);
}

function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function render(skipCine) {
  if (!skipCine && G.cine && (G.state === "cutscene" || G.state === "end")) { renderCine(); return; }
  const adist = Math.hypot(G.ax - G.px, G.ay - G.py);
  const shake = clamp(1 - adist / 4, 0, 1) * 5;
  ctx.save();
  if (shake > 0.1) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  const k = Math.tan(CFG.FOV / 2);
  const dx = Math.cos(G.ang), dy = Math.sin(G.ang);
  const R = { dx, dy, plx: -dy * k, ply: dx * k, hz: H / 2 + Math.sin(G.bob) * 2.5 + G.pitch };
  const hz = R.hz;

  // Cielo (gira con la cámara) y suelo
  const skyH = skyTex.height;
  const off = (((G.ang * PXRAD) % SKYW) + SKYW) % SKYW;
  const drawH = Math.min(skyH, Math.ceil(hz));
  const first = Math.min(W, SKYW - off);
  const srcY = skyH - drawH;                         // el borde inferior del cielo queda en el horizonte
  ctx.drawImage(skyTex, off, srcY, first, drawH, 0, 0, first, drawH);
  if (first < W) ctx.drawImage(skyTex, 0, srcY, W - first, drawH, first, 0, W - first, drawH);
  const gr = ctx.createLinearGradient(0, hz, 0, H);
  gr.addColorStop(0, "#030814"); gr.addColorStop(1, "#221c14");
  ctx.fillStyle = gr; ctx.fillRect(0, hz, W, H - hz);

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

  // Muros de maíz
  for (let i = 0; i < NCOLS; i++) {
    const camX = 2 * i / NCOLS - 1;
    const rdx = dx + R.plx * camX, rdy = dy + R.ply * camX;
    let mx = Math.floor(G.px), my = Math.floor(G.py);
    const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx), ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
    let stepX, stepY, sdx, sdy, side = 0;
    if (rdx < 0) { stepX = -1; sdx = (G.px - mx) * ddx; } else { stepX = 1; sdx = (mx + 1 - G.px) * ddx; }
    if (rdy < 0) { stepY = -1; sdy = (G.py - my) * ddy; } else { stepY = 1; sdy = (my + 1 - G.py) * ddy; }
    for (let n = 0; n < 64; n++) {
      if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
      if (isWall(mx, my)) break;
    }
    const perp = Math.max(0.05, side === 0 ? sdx - ddx : sdy - ddy);
    zBuf[i] = perp;
    let wx = side === 0 ? G.py + perp * rdy : G.px + perp * rdx;
    wx -= Math.floor(wx);
    const lineH = H / perp, top = hz - lineH / 2;
    ctx.drawImage(cornTex, Math.floor(wx * TEX), 0, 1, TEX, i * COL, top, COL, lineH);
    ctx.fillStyle = `rgba(3,8,20,${fogAlpha(perp, side).toFixed(3)})`;
    ctx.fillRect(i * COL, top, COL, lineH);
  }

  // Sprites (de lejos a cerca): personas y alien
  const items = [];
  for (const e of G.enc) if (!e.done) items.push({ img: SPR.figures[e.name], x: e.x, y: e.y, s: 0.78 });
  if (!isWall(Math.floor(G.ax), Math.floor(G.ay))) items.push({ img: SPR.alien, x: G.ax + (Math.random() - 0.5) * 0.07, y: G.ay + (Math.random() - 0.5) * 0.07, s: 1.2 });
  items.sort((a, b) => Math.hypot(b.x - G.px, b.y - G.py) - Math.hypot(a.x - G.px, a.y - G.py));
  for (const it of items) drawSprite(R, it.img, it.x, it.y, it.s);

  // Viñeta, peligro, minimapa y HUD
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.65)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  const ad = Math.hypot(G.ax - G.px, G.ay - G.py);
  const danger = clamp(1 - ad / 6, 0, 1);
  if (danger > 0.02) {
    const dg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H);
    dg.addColorStop(0, "rgba(180,0,20,0)"); dg.addColorStop(1, `rgba(180,0,20,${(danger * 0.55).toFixed(3)})`);
    ctx.fillStyle = dg; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
  if (G.state === "play" || G.state === "dialog" || G.state === "result") { if (G.showMap) drawMinimap(); drawHud(); }
}

function drawMinimap() {
  const T = 6, ox = W - COLS * T - 10, oy = 10;
  ctx.fillStyle = "rgba(3,8,20,.72)";
  ctx.fillRect(ox - 4, oy - 4, COLS * T + 8, ROWS * T + 8);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (!G.seen[y][x]) continue;
    ctx.fillStyle = isWall(x, y) ? "#1f3a24" : (MAP[y][x] === "X" ? "#c9ff78" : "#6b5a3c");
    ctx.fillRect(ox + x * T, oy + y * T, T, T);
  }
  const mx = ox + G.px * T, my = oy + G.py * T;
  ctx.fillStyle = "#ffe36b"; ctx.fillRect(mx - 2, my - 2, 4, 4);
  ctx.strokeStyle = "#ffe36b"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(G.ang) * 8, my + Math.sin(G.ang) * 8); ctx.stroke();
}

function drawHud() {
  ctx.fillStyle = "rgba(7,17,29,.8)"; ctx.fillRect(10, 10, 215, 26);
  ctx.fillStyle = "#e9f7c2"; ctx.font = "bold 14px 'Courier New', monospace";
  ctx.textBaseline = "middle";
  ctx.fillText(`AMIGOS A SALVO: ${G.saved}/${FRIENDS.length}`, 18, 23);
  ctx.textBaseline = "alphabetic";
  if (G.state === "play" && document.pointerLockElement !== cv) {
    ctx.fillStyle = "rgba(7,17,29,.8)"; ctx.fillRect(W / 2 - 150, H - 40, 300, 26);
    ctx.fillStyle = "#fff1a6"; ctx.textAlign = "center";
    ctx.fillText("Haz clic para controlar la cámara con el mouse", W / 2, H - 22);
    ctx.textAlign = "left";
  }
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

function renderDawn(t) {
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
  const crew = [[SPR.player, 0, 0.2], [SPR.figures.Samira, -0.5, 0.3], [SPR.figures.Sebas, 0.5, 0.3], [SPR.figures.Stalin, -0.25, 0.38], [SPR.figures.Paul, 0.25, 0.38]];
  const list = crew.map(([img, off, d0], i) => {
    const d = clamp(d0 + t * 0.04, 0, 0.8), y0 = hy + 2 + (H - hy) * Math.pow(1 - d, 1.7);
    const sz = (y0 - hy) / (H - hy) * 190 + 10, y = y0 - Math.abs(Math.sin(t * 5 + i * 1.3)) * 3 * (sz / 190);
    return { img, x: W / 2 + off * half(y0) * 0.8, y, sz };
  }).sort((a, b) => a.y - b.y);
  for (const f of list) {
    ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.beginPath(); ctx.ellipse(f.x, f.y, f.sz * 0.25, f.sz * 0.05, 0, 0, 7); ctx.fill();
    tctx.clearRect(0, 0, W, H);
    tctx.drawImage(f.img, 0, 0, 32, 32, f.x - f.sz / 2, f.y - f.sz * 31 / 32, f.sz, f.sz);
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
  ctx.drawImage(SPR.alien, 0, 0, 32, 32, cx - size / 2, cy - size / 2, size, size);
  const u = size / 32;
  ctx.save();
  ctx.shadowColor = "#ff2030"; ctx.shadowBlur = Math.min(30, size * 0.12);
  ctx.fillStyle = "#ff3040";
  ctx.fillRect(cx - size / 2 + 12 * u, cy - size / 2 + 6 * u, 2 * u, 2 * u);
  ctx.fillRect(cx - size / 2 + 18 * u, cy - size / 2 + 6 * u, 2 * u, 2 * u);
  ctx.restore();
}
function drawEyes(cx, cy, a, gap) {
  for (const sx of [-1, 1]) {
    const x = cx + sx * gap;
    const g = ctx.createRadialGradient(x, cy, 1, x, cy, 26);
    g.addColorStop(0, `rgba(255,40,55,${(0.9 * a).toFixed(3)})`); g.addColorStop(1, "rgba(255,40,55,0)");
    ctx.fillStyle = g; ctx.fillRect(x - 26, cy - 26, 52, 52);
    ctx.fillStyle = `rgba(255,70,80,${a.toFixed(3)})`; ctx.beginPath(); ctx.ellipse(x, cy, 9, 6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`; ctx.fillRect(x - 1, cy - 6, 2, 12);
  }
}

function renderLose(t) {
  const c = G.cine, u = t - c.t0;
  if (u < 3.6) {
    render(true);                                        // el maizal de fondo
    ctx.fillStyle = `rgba(0,0,0,${(u < 0 ? 0.25 : clamp(0.35 + u * 0.15, 0, 0.7)).toFixed(2)})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (u < 0) {                                           // antes del alien: la víctima o el impostor
    const f = t / c.t0, img = SPR.figures[c.name] || SPR.player;
    ctx.save();
    if (c.kind === "friend") {
      ctx.translate(W / 2, H * 0.8); ctx.rotate(f * f * Math.PI / 2);
      ctx.drawImage(img, 0, 0, 32, 32, -110, -220, 220, 220);
    } else {
      const sz = 200 + f * 130, jx = (Math.random() - 0.5) * f * 8;
      ctx.drawImage(img, 0, 0, 32, 32, W / 2 - sz / 2 + jx, H * 0.85 - sz, sz, sz);
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
    const size = H * (1.5 + Math.sin(u * 30) * 0.03), jx = (Math.random() - 0.5) * 14, jy = (Math.random() - 0.5) * 14;
    ctx.drawImage(SPR.alien, 10, 0, 12, 12, W / 2 - size / 2 + jx, H / 2 - size * 0.47 + jy, size, size);
    const ph = Math.floor(u * 14) % 3;
    if (ph === 0) { ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.fillRect(0, 0, W, H); }
    else if (ph === 1) { ctx.fillStyle = "rgba(200,0,20,.4)"; ctx.fillRect(0, 0, W, H); }
    glitchStrips(7, 40);
  } else {                                               // oscuridad y dos ojos rojos
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 50; i++) { ctx.fillStyle = `rgba(160,160,160,${rand(0.03, 0.14).toFixed(2)})`; ctx.fillRect(Math.random() * W, Math.random() * H, rand(2, 14), 1); }
    const a = clamp((u - 3.9) / 0.6, 0, 1) * (0.75 + 0.25 * Math.sin(u * 6));
    if (a > 0) drawEyes(W / 2, H * 0.45, a, 38 + Math.sin(u * 1.5) * 4);
  }
}

function renderCine() {
  const c = G.cine;
  if (c.type === "win") renderDawn(c.t); else renderLose(c.t);
}

/* ============ Entrada y bucle principal ============ */
G = newGameState("menu");
showMenu();

window.addEventListener("keydown", e => {
  const c = e.code;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(c)) e.preventDefault();
  keys[c] = true;

  if (G.state === "menu") { if (c === "Enter" || c === "Space") startFromMenu(); return; }
  if (G.state === "intro") { if (c === "Enter" || c === "Space") nextIntro(); return; }
  if (c === "KeyR") { restart(); return; }
  if (G.state === "cutscene") { if ((c === "Enter" || c === "Space") && G.cine.t > 1.5) G.cine.t = G.cine.dur; return; }
  if (G.state === "end") return;
  if (c.startsWith("Key")) {                          // truco: escribir "ovni" lleva directo a la escena de escape
    cheat = (cheat + c.slice(3).toLowerCase()).slice(-4);
    if (cheat === "ovni" && (G.state === "play" || G.state === "dialog" || G.state === "result")) {
      cheat = "";
      endGame(true, "¡ESCAPASTE!", "Cruzan el último surco del maizal juntos, con Samira, Sebas, Stalin y Paul a salvo. Amanece, y la luz verde desaparece del cielo.");
      return;
    }
  }
  if (c === "KeyJ") { toggleDiary(); return; }

  if (G.state === "dialog") {
    if (c >= "Digit1" && c <= "Digit4") ask(Number(c.slice(5)) - 1);
    else if (c === "KeyE") decide(true);
    else if (c === "KeyF") decide(false);
  } else if (G.state === "result") {
    if (c === "Enter" || c === "Space") continueAfterResult();
  } else if (G.state === "play") {
    if (c === "KeyM") G.showMap = !G.showMap;
  }
});
window.addEventListener("mousemove", e => {
  if (G.state !== "play" || document.pointerLockElement !== cv) return;
  G.ang += clamp(e.movementX || 0, -120, 120) * MOUSE_SENS;
  G.pitch = clamp(G.pitch - clamp(e.movementY || 0, -120, 120) * MOUSE_SENS * 400, -140, 140);   // arriba/abajo
});
cv.addEventListener("click", () => { if (G.state === "play") lockMouse(); });
window.addEventListener("keyup", e => { keys[e.code] = false; });
window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

$("menuBtn").addEventListener("click", startFromMenu);
$("endMenuBtn").addEventListener("click", toMenu);
$("introBtn").addEventListener("click", nextIntro);
$("btnSpare").addEventListener("click", () => decide(true));
$("btnKill").addEventListener("click", () => decide(false));
$("btnContinue").addEventListener("click", continueAfterResult);
$("endBtn").addEventListener("click", restart);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.state === "menu") { G.t += dt; G.ang = Math.sin(G.t * 0.22) * 0.55; G.bob = 0; }
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
