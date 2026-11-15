/* =====================================================================
 * NIVEL 4 · LA LUZ
 * Al salir del maizal, la luz verde baja sobre un claro junto a la vía vieja. Cuando se apaga, hay dos Pepes.
 * Tus amigos, los que salvaste, los interrogan a los dos. Esa cosa escuchó todo lo que se dijo cerca de
 * don Lucho y lo repite palabra por palabra. Solo te salva lo que nunca se dijo en voz alta: lo que te
 * contaron a solas y cómo lo viviste. Y no mentir: en la radio de la camioneta sonó tu voz.
 * Si Stalin llegó, esa cosa se pone la cara de su papá para llevárselo.
 * Finales: todos salen · Stalin se queda en la luz para que los demás se vayan · eligen al otro Pepe ·
 * sales solo · nadie nota la diferencia.
 * Depende de game.js (motor 3D, personajes, diálogo, HUD, audio y pantallas) y se carga después de chase.js.
 * ===================================================================== */
let FN = null;
let FINAL_IN = null;                       // lo que deja el maizal: quiénes llegaron y quiénes no

/* ---------- El claro ---------- */
const FN_RAW = [
  "###########",
  "####...####",
  "##.......##",
  "#.........#",
  "#.........#",
  "#.........#",
  "#.........#",
  "#.........#",
  "F.........F",
  "FF.......FF",
  "FFF=====FFF"
];
const FN_LIGHT = { x: 5.5, y: 3.6 };                 // donde baja la luz
const FN_DOUBLE = { x: 5.5, y: 3.3 };                // el otro Pepe, justo debajo
const FN_SPOT = { samira: [3.1, 5.3], sebas: [3.5, 3.5], stalin: [7.5, 3.5], paul: [7.9, 5.3] };
const FN_BODY = { speed: 2.4, r: 0.2, bobRate: 8, bobAmp: 2 };
const fnCell = (x, y) => (x < 0 || y < 0 || x >= FN_RAW[0].length || y >= FN_RAW.length) ? null : FN_RAW[y][x];
// El mismo maíz, la misma tierra y la misma niebla del maizal; el suelo se pinta de verde bajo la luz
const FN_WORLD = {
  ...MZ_WORLD, cell: fnCell,
  planesBegin() { mzShadows = []; },
  pixel(fx, fy, d, o) {
    MZ_WORLD.pixel(fx, fy, d, o);
    const q = ((fx - FN_LIGHT.x) ** 2 + (fy - FN_LIGHT.y) ** 2) / 6.5;
    if (q < 1) { const g = (1 - q) * FN.glow; d[o] += 25 * g; d[o + 1] += 150 * g; d[o + 2] += 60 * g; }
  }
};

/* ---------- Lo que pregunta cada uno ----------
 * heard: lo que dijo en el bar, palabra por palabra (si don Lucho lo escuchó, esa cosa lo repite así)
 * lived: lo mismo, pero como lo viviste tú · pub: algo que oyó todo el bar · guess: un manotazo de ahogado
 * bluff: lo que dice esa cosa cuando no sabe (nunca dice «no sé») */
const FN_Q = {
  paul: {
    q: "¿Qué te conté en el bar? Lo que solo sabía Stalin.",
    heard: "«Me voy a España. El tres de diciembre. Mi tío me consiguió trabajo allá.»",
    lived: "Que te vas a España. Me lo dijiste bajito, mirando a todos lados… y que la última vez que me necesitaste, no estuve.",
    pub: "Que llegué tarde. Como siempre.", guess: "Que te vas a casar.",
    bluff: "Que llegué tarde, como siempre. Me lo dijiste delante de todos."
  },
  samira: {
    q: "¿Por qué terminé con Sebas? Lo que te conté a ti, no lo que dice él.",
    heard: "«Me debe cuatrocientos dólares. Pero no es por la plata. Apuesta.»",
    lived: "Porque apuesta y te mintió mirándote a la cara. Y que todavía lo quieres. Creo.",
    pub: "Porque las cosas ya no funcionaban.", guess: "Porque te engañó con otra.",
    bluff: "Porque las cosas ya no funcionaban, Samira. Eso dijiste en la rocola."
  },
  sebas: {
    q: "¿Qué te dije en el pasillo? Lo que me da vergüenza.",
    heard: "«Me botaron del trabajo hace dos meses. No le he dicho a nadie.»",
    lived: "Que te botaron del trabajo, y que pagaste las empanadas con lo último que tenías. Querías que esta noche fuera normal.",
    pub: "Que invitabas las empanadas. Bueno, que las pedías.", guess: "Que te ganaste algo apostando.",
    bluff: "Que invitabas las empanadas. Delegar es liderazgo, ¿no?"
  },
  stalin: {                                          // esa cosa siempre sabe el apodo: fue ella la que se llevó a su papá
    q: "¿Cómo me decía mi papá?",
    heard: "«Se llamaba Rafael. Me decía Cabra Stalin. Este gorro ruso me lo regaló él.»",
    lived: "Cabra Stalin. Y ese gorro te lo regaló él, por el chiste del nombre. Por eso no te lo quitas.",
    pub: "Te decía Stalin, pues. Como todos.", guess: "Talín.",
    bluff: "«Cabra Stalin.»"
  }
};
const fnName = k => CHARS[k].name;
const fnPepeKnows = k => !!(FN.R.secrets && FN.R.secrets[k]);
const fnAlienKnows = k => k === "stalin" || !!(FN.R.secrets && FN.R.secrets[k] && FN.R.secrets[k].overheard);
const fnAlienExact = k => !!(FN.R.secrets && FN.R.secrets[k] && FN.R.secrets[k].overheard);   // se sabe la frase entera
function fnBaseTrust(k) {                            // lo que quedó entre ustedes desde el bar
  const f = FN.R.flags || {};
  return (k === "paul" && f.paulMended) || (k === "samira" && f.samiraOpen) || ((k === "sebas" || k === "stalin") && fnPepeKnows(k)) ? 1 : 0;
}

/* ---------- Inicio ---------- */
// Para entrar directo desde «Elegir nivel»: una noche a medias (dos verdades a solas, una que oyó don Lucho)
const DEFAULT_FINAL_BAR = () => ({ keysBy: "paul", told: [], secrets: { paul: { overheard: false }, sebas: { overheard: true }, stalin: { overheard: false } },
  flags: { paulMended: true, samiraOpen: true, clue_poster: true, clue_oldNoEat: true } });
function startFinal(from) {
  initAudio(); mzOverlayClear(); talkClose(); hidePanels(); sndStopAll(); hush();
  if (!BAR_RESULT) BAR_RESULT = DEFAULT_FINAL_BAR();
  MODE = "final";
  const R = BAR_RESULT, cx = mzContext();
  const party = (from ? from.party : FRIENDS).filter(n => FRIENDS.includes(n));
  FN = { state: "intro", px: 5.5, py: 8.4, ang: -Math.PI / 2, pitch: 0, bob: 0, faceTo: null, t: 0, meteor: null,
    R, cx, party, alive: party.slice(), lost: from ? from.lost.slice() : FRIENDS.filter(n => !party.includes(n)),
    npc: {}, trust: {}, asked: new Set(), talkLog: [], glow: 0.7, form: "pepe", dx: FN_DOUBLE.x, dy: FN_DOUBLE.y, dlift: 0,
    talkT: null, opts: null, barkT: 9, afterT: null, anim: null, cine: null, fall: 0, flash: 0, stalinLeft: false };
  for (const n of party) { const k = n.toLowerCase(); FN.npc[k] = { x: FN_SPOT[k][0], y: FN_SPOT[k][1] }; FN.trust[k] = fnBaseTrust(k); }
  drone();
  sndLoop("final", out => {                          // el zumbido de la nave, encima del claro
    const o = AC.createOscillator(), lfo = AC.createOscillator(), lg = AC.createGain(), g = AC.createGain();
    o.type = "sine"; o.frequency.value = 92; lfo.frequency.value = 3.5; lg.gain.value = 9; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.value = 0.05; o.connect(g); g.connect(out); o.start(); lfo.start();
    return { srcs: [o, lfo] };
  });
  const list = party.length > 1 ? party.slice(0, -1).join(", ") + " y " + party[party.length - 1] : party[0];
  const pages = party.length ? [
    `NIVEL 4 · LA LUZ\n\nSalen del maíz a un claro junto a la vía vieja. ${list} ${party.length > 1 ? "vienen" : "viene"} contigo.\n\nLa luz verde baja despacio sobre el claro. Zumba. El aire huele a quemado.`,
    "Cuando la luz se apaga, hay alguien más parado en el centro.\n\nTiene tu chaqueta. Tu cara. Tu forma de pararte.\n\nEs Pepe. Y tú también.",
    "Tus amigos los van a interrogar a los dos. Esa cosa escuchó todo lo que se dijo cerca de don Lucho, y lo repite palabra por palabra.\n\nSolo te salva lo que nunca se dijo en voz alta.\n\nAcércate a cada uno y habla con [E]. J: lo que sabes."
  ] : [
    "NIVEL 4 · LA LUZ\n\nSales del maíz solo. Nadie más llegó hasta aquí.\n\nLa luz verde baja despacio sobre un claro junto a la vía vieja.",
    "Cuando se apaga, alguien te espera en el centro. Tiene tu cara.\n\nNo queda nadie que pueda decir cuál de los dos es Pepe."
  ];
  storyOpen(pages, "Salir del maíz ▶", party.length ? fnOpening : fnSolo);
}
function fnHolder() {                                  // quién se queda con la pistola
  return ["Paul", "Samira", "Stalin", "Sebas"].find(n => FN.alive.includes(n));
}

/* ---------- Diálogo del final: el mismo recuadro, con tiempo para responder ---------- */
function fnTalk(lines, then) { FN.state = "dialog"; typeLines(lines, then, true); }
function fnOptions(opts, onPick, onTimeout) {
  FN.opts = opts; FN.onPick = onPick;
  FN.onTimeout = () => { $("talkOpts").innerHTML = ""; FN.opts = null; onTimeout(); };
  drawOptButtons(opts, fnChoose, () => "");
  FN.optT = performance.now(); FN.talkT = 15;
}
function fnChoose(i) {
  if (MODE !== "final" || !FN || FN.state !== "dialog" || typerBusy() || !FN.opts) return;
  if (performance.now() - FN.optT < 450) return;          // un clic de más no elige por ti
  const o = FN.opts[i]; if (!o) return;
  FN.opts = null; FN.talkT = null; $("talkOpts").innerHTML = "";
  FN.onPick(o);
}
function fnToPlay() { talkClose(); FN.state = "play"; FN.talkT = null; lockMouse(); }

function fnOpening() {
  const H = fnHolder(), has = n => FN.alive.includes(n);
  talkOpen("La luz");
  fpFaceTo(FN, FN.dx, FN.dy);
  const lines = [
    ["", "(La luz se apaga de golpe. En el centro del claro hay otro Pepe. Te mira con tus propios ojos.)"],
    ["El otro Pepe", "¡Esa cosa tiene mi cara! ¡No le crean! ¡Es el alien!"],
    [H, H === "Paul" ? "¡Quietos los dos! …Hic. Nadie se mueve." : H === "Samira" ? "¡Quietos! ¿Me oyeron? ¡Los dos!" : H === "Stalin" ? "Quietos… es lo mismo que le pasó a mi papá. Quietos." : "Q-quietos… creo… ¡quietos!"],
    ["", `(${H} les saca la pistola de la chaqueta a los dos. Pesan igual. Son la misma pistola.)`],
    [H, "Nadie dispara hasta saber quién es quién. Les vamos a preguntar cosas. Cosas de verdad."]
  ];
  if (has("Sebas") && H !== "Sebas") lines.push(["Sebas", "C-creo que es el de la izquierda… ¿o el otro? No sé, ñaño, son iguales."]);
  fnTalk(lines, fnToPlay);
}

/* ---------- Una ronda: un amigo pregunta, responden los dos ---------- */
function fnRound(k) {
  const Q = FN_Q[k], name = fnName(k), dk = fnAlienKnows(k);
  FN.cur = k; FN.asked.add(k);
  talkOpen(name); fpFaceTo(FN, FN.npc[k].x, FN.npc[k].y);
  const ans = fnAlienExact(k) ? Q.heard : dk ? Q.bluff : Q.bluff;
  fnTalk([[name, Q.q], ["El otro Pepe", ans], ["", fnAlienExact(k) ? "(Lo dice sin pensar. Palabra por palabra, como se dijo en el bar.)" : "(Lo dice sin dudar ni un segundo.)"]], () => {
    const opts = [fnPepeKnows(k) ? { t: Q.lived, kind: "lived" } : { t: "No lo sé. Nunca me lo contaste… y es mi culpa: nunca pregunté.", kind: "honest" },
      { t: Q.pub, kind: "pub" }, { t: Q.guess, kind: "guess" }];
    fnOptions(shuffle(opts), o => fnAnswer(k, o.kind, o.t), () => fnAnswer(k, "timeout"));
  });
}
// Cuánto les acerca a ti cada respuesta (frente a lo que dijo el otro)
function fnAnswer(k, kind, text) {
  const name = fnName(k), dk = fnAlienKnows(k), exact = fnAlienExact(k), good = fnBaseTrust(k) > 0;
  const delta = { lived: exact ? 1 : 2, honest: (good ? 1 : 0) - (dk ? 1 : 0), pub: dk ? -1 : 0, guess: dk ? -2 : -1, timeout: dk ? -2 : -1 }[kind];
  FN.trust[k] += delta;
  const react = {
    lived: exact ? "Los dos lo saben… pero él lo dijo igualito a como yo lo dije. Palabra por palabra. Tú lo dijiste como… como fue." : "…Eso no lo sabía nadie más. Nadie.",
    honest: good ? "…Él tiene respuesta para todo. Tú no. Eso es muy tuyo, Pepe." : "¿No sabes? Claro. Nunca preguntas nada.",
    pub: "Eso lo escuchó todo el bar.",
    guess: "¿Qué? No. No, eso no fue así.",
    timeout: "¿Te quedas callado? …Él no dudó ni un segundo."
  }[kind];
  const lines = kind === "timeout" ? [["", "(Te quedas callado. Todos te miran.)"], [name, react]] : [["Tú", text], [name, react]];
  fnTalk(lines, () => (FN.R.told || []).includes(k) ? fnToldRound(k) : fnEndRound());
}
// Si le contaste su secreto a don Lucho, esa cosa lo confiesa primero: sabe que en la radio sonó tu voz
function fnToldRound(k) {
  const name = fnName(k);
  fnTalk([["El otro Pepe", `Y otra cosa, ${name}. Yo le conté a ese viejo lo tuyo. Lo oíste en la radio, con mi voz. Perdón.`]], () =>
    fnOptions(shuffle([{ t: "Fui yo. Perdón. No sabía quién era ese viejo.", kind: "confess" }, { t: "Yo no fui. Fue él. Tiene mi cara, ¿no ves?", kind: "deny" }]),
      o => { if (o.kind === "deny") FN.trust[k] -= 2;
        fnTalk([["Tú", o.t], [name, o.kind === "deny" ? "Era tu voz en la radio, Pepe. Tu voz. …Él por lo menos lo admite." : "…Los dos dicen que fueron. Claro. Los dos."]], fnEndRound); },
      () => { FN.trust[k] -= 1; fnTalk([["", "(No dices nada.)"], [name, "¿Nada? …Él por lo menos pidió perdón."]], fnEndRound); }));
}
function fnEndRound() {
  fnToPlay(); FN.cur = null;
  if (FN.alive.every(n => FN.asked.has(n.toLowerCase()))) FN.afterT = 1.2;
}

/* ---------- Stalin y su papá ---------- */
function fnAfterRounds() {
  const H = fnHolder();
  talkOpen(H);
  fnTalk([[H, H === "Sebas" ? "Ya… ya, ya. Basta. C-creo que ya sé." : "Ya. Basta. Ya sé."]], () => (FN.alive.includes("Stalin") && !FN.stalinDone) ? fnStalin() : fnVerdict());
}
function fnStalin() {
  FN.stalinDone = true; FN.form = "rafael"; FN.glow = 1.2; fpFaceTo(FN, FN.dx, FN.dy);
  const f = FN.R.flags || {}, clues = ["poster", "carmen", "legend", "talin", "oldNoEat", "calendario", "radio"].filter(c => f["clue_" + c]);
  fnTalk([
    ["", "(La luz se enciende otra vez, más fuerte. El otro Pepe camina hacia el centro… y a cada paso es más viejo. Poncho rojo. Sombrero de paño.)"],
    ["", "(Es don Lucho. Pero Stalin no ve a don Lucho.)"],
    ["Rafael", "Cabra Stalin… mírate. Ya cumpliste veintidós. Ven, mijo. Vamos a casa."],
    ["Stalin", "¿Papá…? Te busqué quince años… ¿Eres tú?"]
  ], () => {
    const opts = [];
    if (clues.length >= 2) opts.push({ t: "Stalin, es el viejo del bar. El del plato intacto, el del cartel. Lleva quince años usando la cara de tu papá.", kind: "clues" });
    if (fnPepeKnows("stalin")) opts.push({ t: "Tu papá te regaló ese gorro, Stalin. Él no te habría dejado solo quince años.", kind: "gorro" });
    opts.push({ t: "Quédate con nosotros. Es tu cumpleaños.", kind: "warm" }, { t: "Si eso quieres… ve.", kind: "let" });
    fnOptions(opts, o => {
      const t = FN.trust.stalin, stays = o.kind === "clues" || (o.kind === "gorro" && t >= 0) || (o.kind === "warm" && t >= 1);
      fnTalk([["Tú", o.t]], () => stays ? fnStalinStays() : fnStalinGoes());
    }, fnStalinGoes);
  });
}
function fnStalinStays() {
  FN.trust.stalin += 1;
  fnTalk([
    ["Stalin", "…Mi papá nunca me dijo mijo. Nunca."],
    ["", "(Stalin retrocede. Lo que tiene la cara de su papá abre la boca en una O sin fondo y chilla. La luz baja.)"]
  ], () => { scream(); FN.form = "pepe"; FN.glow = 0.7; fnVerdict(); });
}
function fnStalinGoes() {
  FN.stalinLeft = true;
  fnTalk([
    ["Stalin", "Perdón, Pepe. Lo elegí a él hace quince años, en este mismo maizal."],
    ["Stalin", "Váyanse. Mientras me tenga a mí, no los va a seguir."],
    ["", "(Stalin se acomoda el gorro y camina hacia la luz. Rafael le pone la mano en el hombro. La luz se cierra con los dos adentro.)"]
  ], () => { talkClose(); FN.alive = FN.alive.filter(n => n !== "Stalin"); FN.anim = { kind: "stalin", t: 0 }; });
}

/* ---------- El veredicto: quien tiene la pistola elige ---------- */
function fnVerdict() {
  const H = fnHolder();
  talkOpen(H);
  fnTalk([
    ["", `(${H} levanta la pistola. Te apunta a ti. Después al otro. Le tiembla la mano.)`],
    ["El otro Pepe", `${H}… soy yo. Mírame bien. Soy yo.`]
  ], () => fnOptions([
    { t: `${H}, soy yo.`, kind: "plea" },
    { t: "(No decir nada. Mirarlo a los ojos.)", kind: "look" },
    { t: "Si tienes que dispararme, hazlo. Pero sálvalos a ellos.", kind: "sacrifice" }    // esa cosa nunca se ofrece
  ], o => fnResolve(o), () => fnResolve(null)));
}
function fnResolve(o) {
  const H = fnHolder(), hk = H.toLowerCase();
  const S = FN.alive.reduce((s, n) => s + FN.trust[n.toLowerCase()], 0) + (o && o.kind === "sacrifice" ? 1 : 0);
  const you = S > 0 || (S === 0 && FN.trust[hk] > 0);    // en un empate, la duda favorece al que nunca duda
  const right = { Paul: "El de verdad duda, Pepe. Siempre dudaste. Hasta para ir a un funeral.", Samira: "Tú te equivocas. Él nunca se equivoca. Eso no es humano.",
    Sebas: "C-creo que… no. No creo. Sé. Es él.", Stalin: "Mi papá también dudaba. Esa cosa nunca." }[H];
  const lines = o ? [["Tú", o.t]] : [["", "(No te sale la voz.)"]];
  if (you) fnTalk(lines.concat([["", `(${H} gira la pistola hacia el otro Pepe.)`], [H, right]]), () => { talkClose(); FN.anim = { kind: "double", t: 0 }; gunshot(); });
  else fnTalk(lines.concat([["", `(${H} te apunta a ti. Tiene los ojos llenos de lágrimas.)`], [H, "Perdón… si eres tú… perdón."]]), () => { talkClose(); FN.anim = { kind: "you", t: 0 }; gunshot(); });
}

/* ---------- Si llegaste solo ---------- */
function fnSolo() {
  talkOpen("La luz"); fpFaceTo(FN, FN.dx, FN.dy);
  fnTalk([
    ["", "(La luz se apaga. El otro Pepe sonríe un segundo tarde.)"],
    ["El otro Pepe", "Nadie va a notar la diferencia, Pepe. Yo vuelvo a casa por ti. Tu mamá ni se va a dar cuenta."],
    ["", "(Todavía tienes la pistola de tu papá en la chaqueta.)"]
  ], () => fnOptions([{ t: "Dispararle.", kind: "shoot", hard: true }, { t: "Bajar el arma.", kind: "lower" }],
    o => { talkClose(); FN.anim = { kind: o.kind === "shoot" ? "solo" : "solobad", t: 0 }; if (o.kind === "shoot") gunshot(); },
    () => { talkClose(); FN.anim = { kind: "solobad", t: 0 }; }));
}

/* ---------- Animaciones del desenlace ---------- */
function fnAnimTick(dt) {
  const a = FN.anim; a.t += dt;
  if (a.kind === "double" || a.kind === "solo") {          // se transforma, chilla y se va por la luz
    if (!a.scr && a.t > 0.5) { a.scr = true; scream(); }
    if (a.t > 0.9) {
      FN.form = "alien";
      const k = Math.min(1, (a.t - 0.9) / 1.6);
      FN.dx += (FN_LIGHT.x - FN.dx) * Math.min(1, dt * 3); FN.dy += (FN_LIGHT.y - FN.dy) * Math.min(1, dt * 3);
      FN.dlift = k * k * 1.6; FN.glow = 0.7 + k * 1.2;
    }
    if (a.t > 2.5) { if (!a.gr) { a.gr = true; growl(); } FN.flash = Math.min(1, (a.t - 2.5) / 0.7); }
    if (a.t > 3.3) fnEnding(a.kind === "solo" ? "lonely" : "good");
  } else if (a.kind === "you") {                          // el disparo te tumba
    FN.flash = a.t < 0.25 ? -1 : 0;
    FN.fall = Math.min(1, a.t / 1.2);
    if (a.t > 2.6) fnEnding("bad");
  } else if (a.kind === "stalin") {                        // la luz se cierra con los dos adentro
    FN.glow = 1.6 * Math.max(0, 1 - a.t / 2.5); FN.dlift = a.t * 0.5;
    if (a.t > 2.6) { FN.flash = Math.min(1, (a.t - 2.6) / 0.6); }
    if (a.t > 3.2) fnEnding("bitter");
  } else if (a.kind === "solobad") {                       // se te acerca, despacio, con tu cara
    FN.dx += (FN.px - FN.dx) * Math.min(1, dt * 0.9); FN.dy += (FN.py - FN.dy) * Math.min(1, dt * 0.9);
    FN.fall = Math.max(0, (a.t - 2) / 1);
    if (a.t > 3.2) fnEnding("solobad");
  }
}

/* ---------- Epílogo al amanecer ---------- */
// El otro Pepe titila: casi siempre tu cara, y de a ratos (en ráfagas cortas) el alien
const fnFlicker = t => (Math.sin(t * 2.3) > 0.93 || Math.sin(t * 13.7) * Math.sin(t * 3.1) > 0.9 || Math.random() < 0.03) ? SPR.alien : BSPR.doble;
function fnCrew(withDouble) {
  const M = mzSprites(), img = n => n === "Paul" ? (M ? M.paulStand : BSPR.paul) : charSprite(n);
  return [withDouble ? fnFlicker : BSPR.pepe].concat(FN.alive.map(img));
}
function fnEnding(kind) {
  FN.anim = null; FN.flash = 0; talkClose(); sndStopAll(); hush(); mzOverlayClear();
  FN.state = "epilogue";
  FN.cine = { t: 0, dur: 9, kind, crew: kind === "bad" ? fnCrew(true) : kind === "solobad" ? [fnFlicker] : fnCrew(false) };
  if (kind === "good" || kind === "bitter" || kind === "lonely") chime();
}
function fnEpilogue(kind) {
  const L = [], has = n => FN.alive.includes(n), f = FN.R.flags || {}, s = FN.R.secrets || {};
  const n = FN.alive.length + 1;
  if (kind === "good") L.push(`Amanece sobre la vía vieja. Caminan ${n === 2 ? "los dos" : `los ${["", "", "", "tres", "cuatro", "cinco"][n]}`} hacia Baños, sin hablar.`);
  if (kind === "bitter") L.push("Amanece sobre la vía vieja. La luz ya no está. Stalin tampoco.");
  if (kind === "lonely") L.push("Saliste solo al amanecer. La pistola de tu papá pesaba más que nunca. Nadie te esperaba en la vía.");
  if (kind === "bad") return "Tus amigos salieron del claro con Pepe. Con el otro.\n\nEn la camioneta, Sebas le ofreció una empanada fría. El otro Pepe se la comió entera. Nadie notó que no masticó.\n\nTú te quedaste en la luz.";
  if (kind === "solobad") return "Algo con tu cara caminó hacia Baños al amanecer.\n\nTu mamá le abrió la puerta y le sirvió café. Le preguntó cómo estuvo el cumpleaños de Stalin.\n\n«Bien», le dijo. «Todos llegamos bien.»";
  L.push("");
  if (has("Paul")) L.push(f.paulMended ? "Paul se fue a España el 3 de diciembre. Esta vez fuiste al aeropuerto. Llegaste temprano." : "Paul se fue a España el 3 de diciembre. Desde allá te escribió: «Gracias por no dejarme tirado esta vez».");
  if (has("Samira")) L.push(s.samira ? "Samira y Sebas no volvieron. Pero ella le prestó la plata para pagarle a Paul." : "Samira dejó de burlarse de las luces del cerro.");
  if (has("Sebas")) L.push(s.sebas ? "Sebas les contó a todos lo del trabajo. Nadie se rió." : "Sebas sigue diciendo que fue un dron. Ya nadie le cree, ni él.");
  if (has("Stalin")) L.push("Stalin dejó el gorro ruso en el claro. Dice que ya no lo necesita.");
  if (kind === "bitter") L.push("En el cerro, algunas noches, se ven dos luces juntas.");
  for (const x of FN.lost) L.push(`${x} no salió del maizal. Nadie lo encontró.`.replace("lo encontró", x === "Samira" ? "la encontró" : "lo encontró"));
  return L.join("\n");
}
function fnShowEnd() {
  const k = FN.cine.kind;
  const title = { good: "AMANECER", bitter: "LA LUZ SE LLEVÓ A STALIN", lonely: "SOLO", bad: "ELIGIERON AL OTRO PEPE", solobad: "NADIE NOTÓ LA DIFERENCIA" }[k];
  endScreen({ title, text: fnEpilogue(k), win: k === "good" || k === "bitter" || k === "lonely", style: "win-end", retry: ["Repetir el final [R]", () => startLevel(4)] });
}

/* ---------- Bucle del nivel ---------- */
function fnTarget() {
  let best = null, bestD = 1e9;
  for (const n of FN.alive) {
    const k = n.toLowerCase(), p = FN.npc[k], d = Math.hypot(p.x - FN.px, p.y - FN.py);
    if (d > 1.4) continue;
    const a = Math.abs(normAngle(Math.atan2(p.y - FN.py, p.x - FN.px) - FN.ang));
    if (a < 0.6 && d < bestD) { best = k; bestD = d; }
  }
  return best;
}
const fnDiscs = () => FN.alive.map(n => ({ x: FN.npc[n.toLowerCase()].x, y: FN.npc[n.toLowerCase()].y, r: NPC_R })).concat([{ x: FN.dx, y: FN.dy, r: 0.25 }]);
function finalUpdate(dt) {
  if (!FN) return;
  mzTimerUpdate();
  if (mzOverlayTick(dt)) return;
  FN.t += dt;
  fpTurnTick(FN, dt);
  if (FN.cine) { FN.cine.t += dt; if (!FN.cine.done && FN.cine.t > FN.cine.dur) { FN.cine.done = true; fnShowEnd(); } return; }
  if (FN.anim) { fnAnimTick(dt); return; }
  if (FN.state === "dialog" && FN.talkT != null) {
    if (!typerBusy()) { FN.talkT -= dt; if (FN.talkT <= 0) { FN.talkT = null; FN.onTimeout(); } }
    return;
  }
  if (FN.state !== "play") return;
  fpWalk(FN, dt, FN_BODY, FN_WORLD, fnDiscs());
  if (FN.afterT != null && (FN.afterT -= dt) <= 0) { FN.afterT = null; fnAfterRounds(); return; }
  FN.barkT -= dt;                                          // el otro Pepe no se calla
  if (FN.barkT <= 0) {
    FN.barkT = rand(10, 15);
    const names = FN.alive, who = pick(names);
    voice(`«${pick(["¿Por qué me miran así? Soy yo.", "Pregúntenle algo que solo Pepe sepa. A ver qué dice.", "Esa cosa copia voces, ¿no lo vieron en el maizal?",
      `${who}… tú me conoces.`, "No le den la espalda. Así empezó todo en el maizal."])}»`, "El otro Pepe", FN.dx, FN.dy);
  }
}
function finalKey(c) {
  if (!FN || FN.cine || FN.anim) return;
  if (FN.state === "dialog") { talkKey(c, fnChoose); return; }
  if (FN.state !== "play") return;
  if (c === "KeyE") { const k = fnTarget(); if (k && !FN.asked.has(k)) { $("diary").classList.add("hidden"); fnRound(k); } }
  else if (c === "KeyJ") diaryToggle(fnDiaryLines());
}
function fnDiaryLines() {
  const L = [{ h: "Lo que sabes" }], s = FN.R.secrets || {};
  const ks = Object.keys(s);
  if (!ks.length) L.push({ note: "En el bar nadie te contó nada a solas." });
  for (const k of ks) L.push("• " + SECRET_TXT[k] + (s[k].overheard ? " (Don Lucho lo escuchó: esa cosa también lo sabe.)" : ""));
  L.push({ sub: "Cómo distinguirte" });
  L.push("• Esa cosa repite lo que escuchó, palabra por palabra. Nunca dice «no sé».");
  L.push("• Lo que te contaron a solas, y cómo lo viviste, eso no lo sabe.");
  if ((FN.R.told || []).length) L.push("• Le contaste secretos a don Lucho. En la radio de la camioneta sonó tu voz: no lo niegues.");
  L.push({ note: "[J] cerrar" });
  return L;
}

/* ---------- Dibujo ---------- */
function fnDrawLight(cam) {                                // la columna de luz verde
  const sx = FN_LIGHT.x - cam.px, sy = FN_LIGHT.y - cam.py, inv = 1 / (cam.plx * cam.dy - cam.dx * cam.ply);
  const tx = inv * (cam.dy * sx - cam.dx * sy), ty = inv * (-cam.ply * sx + cam.plx * sy);
  if (ty < 0.2 || FN.glow <= 0.01) return;
  const cx = (W / 2) * (1 + tx / ty), w = (H / ty) * 1.1, bottom = cam.hz + (H / ty) * 0.5;
  const fl = 0.85 + 0.15 * Math.sin(FN.t * 9) * Math.sin(FN.t * 2.3), a = clamp(0.22 * FN.glow * fl, 0, 0.6);
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  g.addColorStop(0, "rgba(90,255,140,0)"); g.addColorStop(0.5, `rgba(150,255,180,${a.toFixed(3)})`); g.addColorStop(1, "rgba(90,255,140,0)");
  ctx.fillStyle = g; ctx.fillRect(cx - w / 2, 0, w, bottom);
  engGlow(cx, bottom, w * 0.9, "110,255,140", a * 0.9);
  for (let i = 0; i < 14; i++) {                           // motas que suben por la luz
    const p = ((FN.t * 0.25 + i * 0.137) % 1), x = cx + Math.sin(i * 7.3 + FN.t) * w * 0.3, y = bottom - p * bottom;
    ctx.fillStyle = `rgba(200,255,210,${(0.5 * (1 - p) * FN.glow).toFixed(3)})`; ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalCompositeOperation = "source-over";
}
function finalRender() {
  if (!FN) return;
  if (FN.cine) { renderDawn(FN.cine.t, FN.cine.crew); return; }
  const T = performance.now() / 1000;
  const cam = engCamera(FN.px, FN.py, FN.ang, fpBobY(FN, FN_BODY) - FN.fall * 150, FN.pitch + FN.fall * 120);
  ctx.fillStyle = "#03060d"; ctx.fillRect(0, 0, W, H);
  engSky(barSkyTex, cam);
  drawSkyLife(cam.hz, T, FN);
  engPlanes(cam, FN_WORLD);
  engWalls(cam, FN_WORLD);
  const M = mzSprites(), items = [];
  if (M) items.push({ img: M.roadsign, x: 2.4, y: 9.55, h: 0.75 });
  for (const n of FN.alive) {
    const k = n.toLowerCase(), sit = n === FN.cx.wounded;
    const img = n === "Paul" ? (sit || !M ? BSPR.paul : M.paulStand) : n === "Sebas" && sit && M ? M.sebasSit : charSprite(n);
    items.push({ img, x: FN.npc[k].x, y: FN.npc[k].y, h: personH(img), fogK: 0.7 });
  }
  if (!(FN.stalinLeft && FN.anim && FN.anim.t > 2.2) && !(FN.cine)) {     // el otro Pepe (o lo que de verdad es)
    let img = FN.form === "rafael" ? BSPR.rafael : FN.form === "alien" ? SPR.alien : BSPR.doble;
    if (FN.anim && (FN.anim.kind === "double" || FN.anim.kind === "solo") && FN.anim.t > 0.3 && FN.anim.t < 0.9) img = Math.random() < 0.5 ? SPR.alien : BSPR.doble;   // parpadea entre las dos caras
    if (FN.form === "rafael" && Math.random() < 0.06) img = SPR.alien;
    const h = img === SPR.alien ? 1.45 : personH(img);
    items.push({ img, x: FN.dx, y: FN.dy, h, lift: FN.dlift, fogK: 0.5 });
    if (FN.stalinLeft && FN.anim && FN.anim.kind === "stalin") items.push({ img: BSPR.stalin, x: FN.dx + 0.35, y: FN.dy + 0.1, h: personH(BSPR.stalin), lift: FN.dlift, fogK: 0.5 });
  }
  engSprites(cam, items, mzShade);
  fnDrawLight(cam);
  ctx.fillStyle = `rgba(60,255,120,${(0.03 + 0.02 * Math.sin(FN.t * 3)).toFixed(3)})`; ctx.fillRect(0, 0, W, H);   // todo se tiñe de verde
  engVignette(0.3, 0.65);
  if (FN.fall > 0) { ctx.fillStyle = `rgba(0,0,0,${(FN.fall * 0.85).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
  if (FN.flash > 0) { ctx.fillStyle = `rgba(235,255,235,${FN.flash.toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
  if (FN.flash < 0) { ctx.fillStyle = "rgba(200,0,20,.55)"; ctx.fillRect(0, 0, W, H); }
  if (FN.state === "play" || FN.state === "dialog") fnHud();
  drawEcho(PAUSED ? 0 : 1 / 60);
  drawMzOverlay();
}
function fnHud() {
  if (!FN.alive.length) return;
  hudPanel([{ t: "¿QUIÉN ES PEPE?", c: "#b9f66d" }, { t: `Ya preguntaron: ${FN.asked.size}/${FN.alive.length}`, c: "#a8bdd9", f: "12px" }], 230);
  if (FN.state !== "play") return;
  hudCorner("[J] lo que sabes");
  const k = fnTarget();
  if (k) hudPrompt(FN.asked.has(k) ? `${fnName(k)} ya les preguntó` : `[E] Que te pregunte ${fnName(k)}`);
  else hudMouseHint();
}
