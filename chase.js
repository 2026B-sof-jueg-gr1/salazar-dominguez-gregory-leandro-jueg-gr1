"use strict";
/* =====================================================================
 * CINEMÁTICA · LA VÍA VIEJA (la persecución)
 * Pepe maneja la Azulita. La radio repite lo que el viejo escuchó en el bar,
 * la luz verde baja del cerro y Samira se da cuenta de que la nave no
 * soporta la electricidad: los cables de alta tensión la derriban, pero
 * el apagón también saca a la camioneta del camino.
 * Lo que pasó en el bar decide quién va adelante, qué dice la radio
 * y quién sale más herido. No hay decisiones: solo se mira.
 * Depende de game.js (ctx, tcv, BSPR, barSkyTex, cornStalk, AC, etc.).
 * ===================================================================== */

let CH = null;                       // estado de la cinemática
let CHASE_RESULT = null;             // lo que hereda el maizal

/* ---------- Guion (cambia según el bar) ---------- */
// Pocas líneas y cortas: lo que se ve no se narra.
function chaseScript(R) {
  const f = R.flags || {}, mended = !!f.paulMended;
  const co = mended ? "paul" : "stalin";
  const back = mended ? ["samira", "sebas", "stalin"] : ["samira", "sebas", "paul"];
  const wounded = mended ? "Sebas" : "Paul";
  const coName = mended ? "Paul" : "Stalin";

  // La radio: primero lo que Pepe le chismeó al viejo, después lo que el viejo oyó solo
  const told = (R.told || [])[0];
  const heard = ["paul", "sebas", "samira", "stalin"].find(k => R.secrets && R.secrets[k] && R.secrets[k].overheard);
  let radio, radioKind;
  if (told) {
    radioKind = "told:" + told;
    const yours = ["", "(Es tu voz.)"];
    radio = {
      stalin: [["Radio", "«Su papá desapareció por aquí, hace quince años.»"], yours, ["Stalin", "¿A quién le contaste eso?"]],
      samira: [["Radio", "«Él le debe plata. Apuesta.»"], yours, ["Sebas", "¿Se lo contaste a ese viejo?"]],
      sebas:  [["Radio", "«A él lo botaron del trabajo y no le ha dicho a nadie.»"], yours, ["Sebas", "Te lo conté solo a ti, Pepe."]]
    }[told];
  } else if (heard) {
    radioKind = "heard:" + heard;
    radio = {
      paul:   [["Radio", "«Me voy a España el 3 de diciembre.»"], ["Sebas", "¿España? ¿Te vas?"], ["Paul", "…Eso lo dije en el bar. Bajito."]],
      samira: [["Radio", "«Me mintió mirándome a la cara.»"], ["Samira", "Eso lo dije hace una hora."]],
      sebas:  [["Radio", "«Perdí el trabajo hace dos meses.»"], ["Sebas", "¡Apaga eso!"]],
      stalin: [["Radio", "«Mi papá me decía Cabra Stalin.»"], ["", "(Es la voz de Stalin, de niño.)"]]
    }[heard];
  }
  if (!radio) {
    radioKind = "apodo";
    radio = [["Radio", "«…Cabra Stalin… ya es hora…»"], ["", "(Stalin apaga la radio de un golpe.)"]];
  }

  const shots = [
    { kind: "ext", scene: "road", min: 3, lead: 0.2, lines: [["", "00:06 · Vía vieja a Baños", 2.4]] },
    { kind: "cab", scene: "talk", min: 3, lead: 0.4, lines: mended ? [
      ["Paul", "Suave en las curvas. La Azulita era de mi abuela."],
      ["Sebas", "¡Pepe al volante! Si me muero, yo pagué las empanadas."],
      ["Samira", "Las pagó Paul."]
    ] : [
      ["Paul", "Un año sin llamar, y ahora manejas mi carro."],
      ["Stalin", "Paul, ya. Es mi cumpleaños."],
      ["Sebas", "¿Alguien quiere empanada? Fría, pero con cariño."]
    ] },
    { kind: "cab", scene: "radio", min: 3, lead: 0.6, lines: radio },
    { kind: "cab", scene: "mirror", min: 4, lead: 1.2, lines: [
      ["Sebas", mended ? "¡Una luz atrás! ¡Voy a grabar!" : "¿Qué es esa luz?"],
      ["Samira", "Eso no es un dron."],
      ["Stalin", "Es la misma luz."],
      ["Paul", "¡Acelera!"]] },
    { kind: "ext", scene: "chase", min: 6, lead: 0, lines: [] },
    { kind: "cab", scene: "plan", min: 3, lead: 0.2, tail: 2.2, lines: [
      ["Samira", "¡La radio se vuelve loca cuando se acerca, como en el bar!"],
      ["Samira", "¡Métete bajo los cables de alta tensión!"],
      mended ? ["Paul", "¡Hazle caso!"] : ["Stalin", "¡No, para! Quiero verla."]] },
    { kind: "ext", scene: "towers", min: 5.32, lead: 0, lines: [] },
    { kind: "cab", scene: "crash", min: 2.1, lead: 0.05, lines: [[coName, "¡PEPE, CUIDADO!", 1.0]] },
    { kind: "black", scene: "after", min: 2.5, lead: 1.2, lines: [
      ["", mended ? "(Sebas iba de pie. Escuchaste su grito y después, nada.)"
                  : "(Paul no llevaba cinturón. Escuchaste romperse el vidrio de atrás.)"],
      ["", "(Despiertas solo. La Azulita está volcada entre el maíz, con las puertas abiertas.)"],
      ["", "(A lo lejos, Stalin camina hacia la luz verde. No mira atrás.)"]] }
  ];
  for (const s of shots) {                                     // tiempos de cada línea
    let t = s.lead;
    s.lines = s.lines.map(([who, text, d]) => {
      const dur = d || clamp(1.1 + text.length * 0.042, 1.7, 4.4);
      const l = { who, text, t0: t, t1: t + dur }; t += dur; return l;
    });
    s.dur = Math.max(s.min, t + (s.tail || 0.4));
  }
  return { shots, co, back, wounded, radioKind, mended };
}

// Recorte de la cabeza de un personaje (incluye el gorro si lo tiene)

/* ---------- Arte ---------- */
let TRUCK = null;
function truckSprite() {                                        // la Azulita, de perfil, mirando a la derecha
  return makeSprite(48, 22, R => {
    const b = "#3a6aa8", d = "#244a7a", l = "#6a9ad6";
    R("rgba(0,0,0,.45)", 7, 20, 40, 2);
    R(b, 7, 9, 16, 7); R(l, 7, 9, 16, 1); R(d, 7, 12, 16, 1);                         // balde (corto)
    R(b, 22, 3, 14, 13); R(l, 23, 3, 12, 1);                                          // cabina
    R("#121c28", 24, 5, 10, 5); R(b, 29, 5, 1, 5); R("#3a5470", 25, 5, 2, 3);       // ventanas
    R(b, 36, 8, 10, 8); R(l, 36, 8, 10, 1);                                           // capó
    R(d, 7, 15, 40, 1);
    R("#9a9a9a", 45, 12, 3, 3); R("#fff2b0", 45, 9, 2, 2);                           // parachoques y faro
    R("#d02020", 6, 9, 2, 3); R("#6a6a6a", 6, 13, 2, 2);                             // stop
    R("#0a0a0e", 10, 13, 10, 4); R("#0a0a0e", 32, 13, 10, 4);                        // pasos de rueda
    R("#c8c8c8", 26, 11, 2, 1);                                                       // manija
  });
}
function wheel(x, y, r, a) {
  ctx.fillStyle = "#0c0c10"; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  ctx.fillStyle = "#7a7a80"; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, 7); ctx.fill();
  ctx.fillStyle = "#2a2a30";
  for (let k = 0; k < 3; k++) { const q = a + k * 2.094; ctx.fillRect(x + Math.cos(q) * r * 0.28 - 2, y + Math.sin(q) * r * 0.28 - 2, 4, 4); }
}
function drawTruck(x, y, t, lights) {
  // Posición entera: así carrocería y ruedas se mueven juntas, sin temblar entre píxeles
  x = Math.round(x); y = Math.round(y);
  const s = 4, bounce = Math.round(Math.sin(t * 9));
  if (lights > 0) {                                             // haz de los faros sobre el camino
    const fx = x + 46 * s, fy = y + 10 * s + bounce;
    const g = ctx.createLinearGradient(fx, 0, fx + 300, 0);
    g.addColorStop(0, `rgba(255,236,170,${(0.35 * lights).toFixed(3)})`); g.addColorStop(1, "rgba(255,236,170,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(fx, fy - 3); ctx.lineTo(fx + 300, fy - 26); ctx.lineTo(fx + 300, fy + 34); ctx.lineTo(fx, fy + 6); ctx.fill();
  }
  ctx.drawImage(TRUCK, x, y + bounce, 48 * s, 22 * s);
  const spin = t * 18;
  wheel(x + 15 * s, y + 18 * s, 3.6 * s, spin); wheel(x + 37 * s, y + 18 * s, 3.6 * s, spin);
  ctx.fillStyle = "rgba(255,40,40,.35)"; ctx.beginPath(); ctx.arc(x + 6 * s + 2, y + 10.5 * s + bounce, 10, 0, 7); ctx.fill();
}
function drawUFO(x, y, s, t, beam, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0);
  if (beam > 0) {                                               // rayo hacia el suelo
    const g = ctx.createLinearGradient(0, 0, 0, 260);
    g.addColorStop(0, `rgba(140,255,160,${(0.45 * beam).toFixed(3)})`); g.addColorStop(1, "rgba(140,255,160,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-14 * s, 4 * s); ctx.lineTo(14 * s, 4 * s); ctx.lineTo(70 * s, 260); ctx.lineTo(-70 * s, 260); ctx.fill();
  }
  const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 90 * s);
  halo.addColorStop(0, "rgba(120,255,150,.35)"); halo.addColorStop(1, "rgba(120,255,150,0)");
  ctx.fillStyle = halo; ctx.fillRect(-90 * s, -90 * s, 180 * s, 180 * s);
  ctx.fillStyle = "rgba(170,255,190,.55)"; ctx.beginPath(); ctx.ellipse(0, -5 * s, 15 * s, 11 * s, 0, Math.PI, 0); ctx.fill();   // cúpula
  ctx.fillStyle = "rgba(230,255,235,.6)"; ctx.fillRect(-6 * s, -12 * s, 3 * s, 3 * s);
  const body = ctx.createLinearGradient(0, -6 * s, 0, 8 * s);
  body.addColorStop(0, "#c8d2da"); body.addColorStop(0.5, "#6a7680"); body.addColorStop(1, "#2a3036");
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, 0, 42 * s, 8 * s, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#1a2026"; ctx.beginPath(); ctx.ellipse(0, 4 * s, 24 * s, 4 * s, 0, 0, Math.PI); ctx.fill();
  for (let k = 0; k < 9; k++) {                                 // luces del borde que giran
    const a = (k / 9) * Math.PI * 2 + t * 3, lx = Math.cos(a) * 36 * s, ly = Math.sin(a) * 5 * s;
    if (Math.sin(a) < -0.2) continue;
    const on = (k + Math.floor(t * 8)) % 3 === 0;
    ctx.fillStyle = on ? "#eaffb0" : "#5aff7a"; ctx.fillRect(lx - 1.5 * s, ly - 1.5 * s, 3 * s, 3 * s);
  }
  ctx.restore();
}
function bolt(x0, y0, x1, y1, w) {                              // rayo eléctrico quebrado
  ctx.save(); ctx.shadowColor = "#9ad8ff"; ctx.shadowBlur = 14; ctx.strokeStyle = "#eaf6ff"; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x0, y0);
  const n = 7;
  for (let k = 1; k < n; k++) { const q = k / n; ctx.lineTo(x0 + (x1 - x0) * q + rand(-12, 12), y0 + (y1 - y0) * q + rand(-10, 10)); }
  ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore();
}

/* ---------- Exterior: la camioneta de perfil ---------- */
function drawExtBackground(scroll, o) {
  ctx.fillStyle = "#03060d"; ctx.fillRect(0, 0, W, H);
  // El cielo queda fijo: desplazarlo a 9 px/s lo hacía avanzar a saltos de un píxel
  if (barSkyTex) ctx.drawImage(barSkyTex, 1800, SKY_H - 300, W, 300, 0, -18, W, 300);
  // Campo lejano
  ctx.fillStyle = "#070c08"; ctx.fillRect(0, 280, W, 22);
  ctx.fillStyle = "#0d160d"; for (let y = 284; y < 300; y += 4) ctx.fillRect(0, y, W, 1);
  if (o.farCorn != null && o.farCorn < W) {                     // maizal a lo lejos, al final de la trocha
    const fx = Math.round(o.farCorn);
    ctx.fillStyle = "#112a14"; ctx.beginPath(); ctx.moveTo(fx, 302);
    for (let x = fx; x <= W + 8; x += 6) ctx.lineTo(x, 262 - ((x * 13) & 7) + Math.max(0, 24 - (x - fx)) * 0.9);
    ctx.lineTo(W + 8, 302); ctx.fill();
    ctx.fillStyle = "#4a4a22";                                  // espigas
    for (let x = fx + 10; x < W; x += 11) ctx.fillRect(x, 258 - ((x * 7) & 5) + Math.max(0, 24 - (x - fx)) * 0.9, 1, 4);
  }
  // Postes de luz o torres de alta tensión, con sus cables
  const gap = o.towers ? 430 : 300, off = (scroll * 0.75) % gap;
  const tops = [];
  for (let k = -1; k <= Math.ceil(W / gap) + 1; k++) {
    const x = k * gap - off;
    ctx.strokeStyle = "#0b0b0e"; ctx.fillStyle = "#0b0b0e";
    if (o.towers) {
      const top = 70, base = 300;
      ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(x - 30, base); ctx.lineTo(x - 6, top); ctx.moveTo(x + 30, base); ctx.lineTo(x + 6, top);
      for (let y = base; y > top + 10; y -= 26) {                // celosía
        const w0 = 6 + 24 * (y - top) / (base - top), w1 = 6 + 24 * (y - 26 - top) / (base - top);
        ctx.moveTo(x - w0, y); ctx.lineTo(x + w1, y - 26); ctx.moveTo(x + w0, y); ctx.lineTo(x - w1, y - 26);
      }
      ctx.stroke(); ctx.fillRect(x - 46, top + 6, 92, 5); ctx.fillRect(x - 32, top + 34, 64, 4);
      tops.push([[x - 44, top + 12], [x + 44, top + 12], [x, top + 40]]);
    } else {
      ctx.fillRect(x - 2, 150, 4, 152); ctx.fillRect(x - 18, 156, 36, 3);
      tops.push([[x - 16, 159], [x + 16, 159]]);
    }
  }
  ctx.strokeStyle = o.towers ? "rgba(40,44,52,.95)" : "rgba(20,22,26,.9)"; ctx.lineWidth = 1;
  for (let k = 0; k < tops.length - 1; k++) for (let j = 0; j < tops[k].length; j++) {
    const [ax, ay] = tops[k][j], [bx, by] = tops[k + 1][j];
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, ay + 26, bx, by); ctx.stroke();
  }
  // Camino: asfalto y, desde o.track, la trocha de tierra bajo las torres
  const bx = o.track == null ? W + 10 : clamp(o.track, -10, W + 10);
  ctx.fillStyle = "#121216"; ctx.fillRect(0, 302, bx, 36);
  ctx.fillStyle = "#2a2a2e"; ctx.fillRect(0, 302, bx, 2); ctx.fillRect(0, 336, bx, 2);
  ctx.fillStyle = "#c8b468"; const doff = scroll % 60;
  for (let x = -doff; x < bx - 28; x += 60) ctx.fillRect(x, 319, 28, 2);
  if (bx < W) {
    ctx.fillStyle = "#2a2116"; ctx.fillRect(bx, 302, W - bx, 36);
    ctx.fillStyle = "#3a2e1e"; ctx.fillRect(bx, 311, W - bx, 3); ctx.fillRect(bx, 327, W - bx, 3);
    ctx.fillStyle = "#4a3c28"; const soff = scroll % 37;
    for (let x = bx - soff; x < W; x += 37) { ctx.fillRect(x, 306 + (x * 7 & 7), 2, 2); ctx.fillRect(x + 17, 320 + (x * 3 & 7), 3, 2); }
  }
}
function drawExtForeground(scroll, t, glow) {
  ctx.fillStyle = "#040805"; ctx.fillRect(0, 338, W, H - 338);
  // Maíz en primer plano. Con tallos cada 16 px avanzaba medio espacio por cuadro y el ojo
  // lo veía vibrar o ir hacia atrás; más separados (34 px) y algo más lentos se leen fluidos.
  const GAP = 34, sp = scroll * 1.25, off = sp % GAP;
  for (let x = Math.round(-off - GAP), k = Math.floor(sp / GAP); x < W + GAP; x += GAP, k++) {
    const h = 44 + (k * 37 % 23), sw = Math.sin(t * 2 + k) * 3;
    ctx.fillStyle = (k % 3) ? "#071108" : "#0a160b";
    ctx.beginPath(); ctx.moveTo(x - 6, H); ctx.lineTo(x + sw, 338 - h + 50); ctx.lineTo(x + 6, H); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, 360); ctx.lineTo(x + 14 + sw, 350 - (k % 4) * 3); ctx.lineTo(x + 2, 366); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, 372); ctx.lineTo(x - 13 + sw, 362 - (k % 3) * 3); ctx.lineTo(x - 1, 378); ctx.fill();
  }
  if (glow > 0) { ctx.fillStyle = `rgba(90,255,130,${(0.12 * glow).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
}
function greenFire(x, y, w, t) {                                // llamas verdes del ovni caído
  ctx.globalCompositeOperation = "lighter";
  for (let k = 0; k < 9; k++) {
    const fx = x + (k - 4) * w / 9 + Math.sin(t * 7 + k) * 3, fh = 18 + 14 * Math.abs(Math.sin(t * 9 + k * 1.7));
    ctx.fillStyle = k % 2 ? "rgba(120,255,140,.55)" : "rgba(210,255,190,.45)";
    ctx.beginPath(); ctx.moveTo(fx - 6, y); ctx.lineTo(fx + Math.sin(t * 11 + k) * 4, y - fh); ctx.lineTo(fx + 6, y); ctx.fill();
  }
  const g = ctx.createRadialGradient(x, y - 10, 4, x, y - 10, w * 1.4);
  g.addColorStop(0, "rgba(120,255,150,.35)"); g.addColorStop(1, "rgba(120,255,150,0)");
  ctx.fillStyle = g; ctx.fillRect(x - w * 1.4, y - 10 - w * 1.4, w * 2.8, w * 2.8);
  ctx.globalCompositeOperation = "source-over";
}
function renderExt(s, u) {
  const t = CH.T;
  if (s.scene === "road") {
    const scroll = u * 300, tx = Math.min(210, 40 + u * 120);
    drawExtBackground(scroll, {});
    drawTruck(tx, 246, t, 1);
    drawExtForeground(scroll, t, 0);
  } else if (s.scene === "chase") {
    const scroll = 2000 + u * 460, tx = 210 + Math.sin(u * 1.7) * 30;
    const ux = clamp(-160 + u * 170, -160, tx + 110) + Math.sin(u * 2.3) * 20, uy = 110 + Math.sin(u * 1.4) * 14;
    const beam = clamp((u - 1.6) / 0.8, 0, 1) * (0.7 + 0.3 * Math.sin(u * 9));
    const near = clamp(1 - Math.abs(ux - (tx + 96)) / 300, 0, 1);
    drawExtBackground(scroll, {});
    if (beam > 0) { ctx.fillStyle = `rgba(150,255,170,${(0.18 * beam).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(ux, 320, 70, 10, 0, 0, 7); ctx.fill(); }
    const flick = u > 2.5 && Math.sin(u * 31) > 0.4 ? 0.15 : 1;  // los focos parpadean
    drawTruck(tx, 246 + Math.sin(u * 3.1) * 2, t, flick);
    drawUFO(ux, uy, 1.25, t, beam, Math.sin(u * 2) * 0.06);
    drawExtForeground(scroll, t, near * 0.8);
  } else if (s.scene === "towers") {
    // La Azulita deja el asfalto y se mete a la trocha, bajo los cables. La nave los toca,
    // cae en el maizal que cierra la trocha y la camioneta, sin frenar, entra al maíz tras ella.
    // La camioneta nunca frena: es la cámara la que se detiene mientras cae la nave,
    // así se ve a la Azulita avanzar en pantalla hacia el maizal donde cayó.
    const HIT = 3.2, FALL = 4.2, LAND = 5.0, WX = 610, V = 380, D = LAND - FALL;
    const cam = u < FALL ? V * u : u < LAND ? V * FALL + V * ((u - FALL) - (u - FALL) ** 2 / (2 * D)) : V * FALL + V * D / 2;
    const camEnd = V * FALL + V * D / 2;
    const scroll = 5000 + cam, track = 520 - cam;
    const cornX = Math.round(450 + (camEnd - cam));             // borde del maizal que cierra la trocha
    const tx = 110 + V * u - cam;
    const cross = Math.abs(track - (tx + 100)) < 110 ? Math.sin(u * 40) * 3 : 0;          // salto al pasar a la tierra
    let ux, uy, rot = Math.sin(u * 2) * 0.05;
    if (u < HIT) { ux = -80 + u * 130; uy = 30 + u * 24; }
    else if (u < FALL) { ux = -80 + HIT * 130 + Math.sin(u * 40) * 3; uy = 30 + HIT * 24 + Math.sin(u * 33) * 2; }
    else { const q = clamp((u - FALL) / (LAND - FALL), 0, 1); ux = 336 + q * (WX - 336); uy = 107 + q * q * 185; rot = q * 0.7; }
    drawExtBackground(scroll, { towers: true, track, farCorn: 700 - u * 60 });
    if (u > FALL) {                                             // humo de la nave
      CH.smoke = CH.smoke || [];
      if (Math.random() < 0.7) CH.smoke.push({ x: ux, y: uy - 4, r: rand(6, 12), a: 0.5 });
    }
    if (CH.smoke) for (const p of CH.smoke) {
      p.x -= u > LAND ? 0.3 : 1.0; p.y -= 0.6; p.r += 0.35; p.a *= 0.985;
      ctx.fillStyle = `rgba(40,46,40,${p.a.toFixed(3)})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    drawUFO(ux, uy, 1.05, t, u < HIT ? 0.5 : 0, rot);
    if (u >= HIT && u < FALL) {                                 // descarga entre la nave y los cables
      for (let k = 0; k < 3; k++) bolt(ux + rand(-40, 40), uy + 6, ux + rand(-90, 90), 82 + rand(-6, 30), rand(1.5, 3));
      if (!CH.arcSnd) { CH.arcSnd = true; chaseBurst(1.2, 2600, 0.35, "highpass"); }
    }
    drawTruck(tx, 246 + cross, t, 1);
    drawCornWall(cornX, t, u > LAND ? WX : null, tx + 190);    // el maíz tapa a la nave y a la camioneta que entra
    if (u > LAND) {
      greenFire(WX, 300, 90, t);
      if (!CH.boomSnd) { CH.boomSnd = true; chaseBurst(2.2, 160, 0.6, "lowpass"); }
      const q = clamp((u - LAND) / 0.6, 0, 1);
      if (q < 1) {                                              // fogonazo del impacto
        const g = ctx.createRadialGradient(WX, 296, 2, WX, 296, 40 + q * 160);
        g.addColorStop(0, `rgba(220,255,210,${(0.9 * (1 - q)).toFixed(3)})`); g.addColorStop(1, "rgba(90,255,120,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
    }
    drawExtForeground(scroll, t, u > LAND ? 0.7 : 0.3);
    if (u >= HIT && u < FALL) { const fl = Math.random() < 0.5 ? 0.55 : 0.12; ctx.fillStyle = `rgba(220,240,255,${fl})`; ctx.fillRect(0, 0, W, H); }
  }
}

// Muro de maíz desde x0 hasta el borde derecho. hole: x donde cayó la nave (maíz aplastado).
// push: hasta dónde llega la trompa de la camioneta (las plantas que empuja se sacuden).
function drawCornWall(x0, t, hole, push) {
  if (x0 >= W) return;
  ctx.fillStyle = "#050d06";                                    // fondo del maíz (sin tapar el hueco de la nave)
  if (hole == null || hole - 52 <= x0) ctx.fillRect(Math.max(x0, hole != null ? hole + 52 : x0) + 4, 250, W, 88);
  else { ctx.fillRect(x0 + 4, 250, hole - 52 - x0, 88); ctx.fillRect(hole + 52, 250, W, 88); }
  for (let x = x0, k = 0; x < W + 12; x += 9, k++) {
    const flat = hole != null && Math.abs(x - hole) < 52;
    const h = flat ? 14 + (k * 7 % 9) : 92 + (k * 53 % 31);
    const hit = push != null && x < push + 20 && x > push - 120;
    const sw = Math.sin(t * 2 + k) * 2 + (hit ? Math.sin(t * 30 + k) * 7 : 0);
    ctx.fillStyle = k % 2 ? "#0a1a0c" : "#0d200e";
    ctx.fillRect(x, 338 - h, 3, h);
    ctx.beginPath(); ctx.moveTo(x + 1, 338 - h * 0.62); ctx.lineTo(x + 13 + sw, 338 - h * 0.74); ctx.lineTo(x + 2, 338 - h * 0.56); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 1, 338 - h * 0.36); ctx.lineTo(x - 11 + sw, 338 - h * 0.5); ctx.lineTo(x + 2, 338 - h * 0.3); ctx.fill();
    if (!flat) { ctx.fillStyle = "#3a3a1a"; ctx.fillRect(Math.round(x - 1 + sw), 338 - h - 6, 2, 6); }
  }
  if (hole != null) {                                           // el fuego ilumina las puntas del maíz
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(hole, 290, 10, hole, 290, 170);
    g.addColorStop(0, "rgba(90,255,120,.32)"); g.addColorStop(1, "rgba(90,255,120,0)");
    ctx.fillStyle = g; ctx.fillRect(Math.max(x0, hole - 170), 120, 340, 218);
    ctx.globalCompositeOperation = "source-over";
  }
}

/* ---------- Interior: desde el asiento del conductor ---------- */
function towerSil(x, y, h) {                                    // torre lejana vista por el parabrisas
  ctx.strokeStyle = "#05070a"; ctx.lineWidth = Math.max(1, h / 40); ctx.beginPath();
  ctx.moveTo(x - h * 0.16, y); ctx.lineTo(x, y - h); ctx.lineTo(x + h * 0.16, y);
  ctx.moveTo(x - h * 0.25, y - h * 0.86); ctx.lineTo(x + h * 0.25, y - h * 0.86);
  ctx.moveTo(x - h * 0.1, y - h * 0.4); ctx.lineTo(x + h * 0.1, y - h * 0.6); ctx.moveTo(x + h * 0.1, y - h * 0.4); ctx.lineTo(x - h * 0.1, y - h * 0.6);
  ctx.stroke();
}
function renderCab(s, u) {
  const t = CH.T, scene = s.scene;
  const steerP = scene === "plan" ? clamp((u - (s.dur - 2.2)) / 1.2, 0, 1) : 0;    // giro hacia la trocha
  const HITU = 1.0;                                             // instante del choque contra el ovni caído
  const green = scene === "mirror" ? clamp((u - 0.8) / 4, 0, 0.6) : scene === "plan" ? 0.5 + 0.2 * Math.sin(u * 7) : scene === "crash" ? 0.2 + clamp(u / HITU, 0, 1) * 0.35 : 0;
  const steer = scene === "plan" ? -Math.sin(steerP * Math.PI) * 0.7 + Math.sin(u * 5) * 0.04
              : scene === "crash" ? (u < HITU ? Math.sin(u * 14) * 0.25 * u : 0.3) : Math.sin(t * 0.7) * 0.06;
  const shake = scene === "crash" ? clamp(u / HITU, 0, 1) * 7 + (u > HITU ? 16 : 0) : scene === "plan" ? 2 + steerP * 3 : 0.6;
  const speed = scene === "plan" || scene === "crash" ? 2.6 : 1.4;
  ctx.save();
  ctx.translate(rand(-shake, shake), rand(-shake, shake));
  if (scene === "crash") { ctx.translate(W / 2, H / 2); ctx.rotate(steer * 0.18); ctx.translate(-W / 2, -H / 2); }

  // Lo que se ve por el parabrisas
  const hy = 178, vx = W / 2 - 10 - steer * 160;
  const sky = ctx.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, "#01030a"); sky.addColorStop(1, "#0c1830");
  ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, hy + 20);
  for (let k = 0; k < 40; k++) { ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.fillRect((k * 97 + 13) % W, (k * 53) % (hy - 30), 1, 1); }
  ctx.fillStyle = "#04060a"; ctx.beginPath(); ctx.moveTo(-20, hy);
  for (let x = -20; x <= W + 20; x += 20) ctx.lineTo(x, hy - 12 - Math.sin(x * 0.01 + 1) * 10 - Math.sin(x * 0.033) * 4);
  ctx.lineTo(W + 20, hy + 2); ctx.lineTo(-20, hy + 2); ctx.fill();
  if (scene === "plan") {                                       // las torres de alta tensión: a donde vamos
    const shift = steerP * 230, xs = [470 - shift, 620 - shift, 770 - shift];
    for (const x of xs) towerSil(x, hy + 2, 70 + steerP * 30);
    ctx.strokeStyle = "rgba(10,12,16,.9)"; ctx.lineWidth = 1;
    for (let k = 0; k < xs.length - 1; k++) for (const dy of [0.86, 0.6]) {
      const h = 70 + steerP * 30, ay = hy + 2 - h * dy;
      ctx.beginPath(); ctx.moveTo(xs[k], ay); ctx.quadraticCurveTo((xs[k] + xs[k + 1]) / 2, ay + 10, xs[k + 1], ay); ctx.stroke();
    }
  }
  ctx.fillStyle = scene === "crash" ? "#040904" : "#030503"; ctx.fillRect(-20, hy, W + 40, H - hy + 20);
  const half = y => 6 + 300 * (y - hy) / (H - hy);
  const cx = y => vx + (W / 2 - 10 - vx) * (y - hy) / (H - hy);
  if (scene !== "crash") {                                      // el camino (en el choque ya van dentro del maíz)
    ctx.fillStyle = scene === "plan" && steerP > 0.5 ? "#2a2116" : "#141418";
    ctx.beginPath(); ctx.moveTo(vx - 6, hy); ctx.lineTo(vx + 6, hy); ctx.lineTo(cx(H) + half(H), H); ctx.lineTo(cx(H) - half(H), H); ctx.fill();
  }
  const pool = ctx.createRadialGradient(cx(270), 270, 10, cx(270), 270, 220);
  pool.addColorStop(0, "rgba(255,230,160,.32)"); pool.addColorStop(1, "rgba(255,230,160,0)");
  ctx.fillStyle = pool; ctx.fillRect(0, hy, W, H - hy);
  if (scene !== "crash" && !(scene === "plan" && steerP > 0.5)) {
    ctx.fillStyle = "#c8b468";                                  // líneas del centro acercándose
    for (let k = 0; k < 10; k++) {
      const d = k + 1 - ((t * speed * 2) % 1), y = hy + 150 / d;
      if (y > H) continue;
      ctx.fillRect(cx(y) - Math.max(1, 6 / d) / 2, y, Math.max(1, 6 / d), Math.max(1, 26 / (d * d)));
    }
  }
  // Maíz, de lejos a cerca. En la vía solo a los costados; en el choque, por todas partes,
  // azotando el parabrisas, y entre las plantas el ovni en llamas que se viene encima.
  const lanes = scene === "crash" ? [-2.6, -1.7, -0.9, 0.9, 1.7, 2.6] : [-1, 1];
  const items = [];
  for (let k = 0; k < 16; k++) {
    const d = ((k - t * speed * 3) % 16 + 16) % 16 + 0.7;
    const y = hy + 120 / d; if (y > H + 60) continue;
    items.push({ d, y });
  }
  let ufoQ = 0;
  if (scene === "crash") { ufoQ = clamp(u / HITU, 0, 1); items.push({ d: 120 / (40 + ufoQ * ufoQ * 130), ufo: true }); }
  items.sort((a, b) => b.d - a.d);
  for (const it of items) {
    if (it.ufo) {
      const y = hy + 40 + ufoQ * ufoQ * 130, sc = 1.3 + ufoQ * ufoQ * 5;
      ctx.save(); ctx.translate(cx(y), y); ctx.rotate(0.45);
      const body = ctx.createLinearGradient(0, -6 * sc, 0, 8 * sc);
      body.addColorStop(0, "#c8d2da"); body.addColorStop(1, "#2a3036");
      ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, 0, 42 * sc, 8 * sc, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(170,255,190,.6)"; ctx.beginPath(); ctx.ellipse(0, -5 * sc, 15 * sc, 11 * sc, 0, Math.PI, 0); ctx.fill();
      ctx.restore();
      greenFire(cx(y), y + 6 * sc, 60 * sc, t);
      continue;
    }
    const s2 = clamp(1.3 / it.d, 0.05, 1.6), lit = clamp(0.35 / it.d, 0, 0.3) + (scene === "crash" ? 0.25 : 0);
    for (const side of lanes) {
      const x = scene === "crash" ? cx(it.y) + side * (half(it.y) * 0.55 + 10 * s2) : cx(it.y) + side * (half(it.y) + 14 * s2 + 10);
      cornStalk(x, it.y, s2, lit, Math.sin(t * 2 + it.d + side) * (scene === "crash" ? 6 : 2));
    }
  }
  if (green > 0) {
    ctx.globalCompositeOperation = "lighter";
    const gy = scene === "crash" ? hy + 60 : -40;
    const g = ctx.createRadialGradient(W / 2, gy, 10, W / 2, gy, 420);
    g.addColorStop(0, `rgba(90,255,130,${(0.5 * green).toFixed(3)})`); g.addColorStop(1, "rgba(90,255,130,0)");
    ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.globalCompositeOperation = "source-over";
  }
  // Cabina: techo, parantes y tablero
  ctx.fillStyle = "#06070a";
  ctx.fillRect(-20, -20, W + 40, 34);
  ctx.beginPath(); ctx.moveTo(-20, -20); ctx.lineTo(70, 14); ctx.lineTo(18, 300); ctx.lineTo(-20, 300); ctx.fill();
  ctx.beginPath(); ctx.moveTo(W + 20, -20); ctx.lineTo(W - 70, 14); ctx.lineTo(W - 18, 300); ctx.lineTo(W + 20, 300); ctx.fill();
  ctx.fillStyle = "#0b0c0f";
  ctx.beginPath(); ctx.moveTo(-20, 300); ctx.quadraticCurveTo(W / 2, 270, W + 20, 300); ctx.lineTo(W + 20, H + 20); ctx.lineTo(-20, H + 20); ctx.fill();
  ctx.strokeStyle = "#22252a"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-20, 300); ctx.quadraticCurveTo(W / 2, 270, W + 20, 300); ctx.stroke();
  if (scene === "crash" && u > HITU) {                          // grietas en el parabrisas
    ctx.strokeStyle = "rgba(200,220,230,.7)"; ctx.lineWidth = 1;
    const ox = 330, oy = 120;
    for (let k = 0; k < 9; k++) { const a = k * 0.7 + 0.3; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + Math.cos(a) * 60 + Math.sin(k * 3) * 10, oy + Math.sin(a) * 50); ctx.lineTo(ox + Math.cos(a) * 140, oy + Math.sin(a + 0.2) * 110); ctx.stroke(); }
  }
  // Tablero: velocímetro y radio
  ctx.fillStyle = "#2a1a08";
  ctx.beginPath(); ctx.arc(205, 318, 16, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(248, 318, 12, 0, 7); ctx.fill();
  ctx.strokeStyle = "#ffa040"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(205, 318);
  const na = Math.PI * (0.8 + speed * 0.25) + Math.sin(t * 9) * 0.03; ctx.lineTo(205 + Math.cos(na) * 12, 318 + Math.sin(na) * 12); ctx.stroke();
  const radioOn = scene === "radio" ? (u < s.lines[s.lines.length - 1].t0 + 0.4 ? 1 : 0.15) : scene === "plan" ? 1 : 0;
  ctx.fillStyle = "#050506"; ctx.fillRect(388, 310, 108, 30);
  ctx.fillStyle = "#0c1a10"; ctx.fillRect(396, 316, 70, 13);
  if (radioOn > 0.5) {
    for (let k = 0; k < 120; k++) { ctx.fillStyle = `rgba(125,255,154,${(Math.random() * 0.8).toFixed(2)})`; ctx.fillRect(396 + Math.random() * 70, 316 + Math.random() * 13, 1, 1); }
    const rg = ctx.createRadialGradient(431, 322, 4, 431, 322, 90);
    rg.addColorStop(0, "rgba(125,255,154,.22)"); rg.addColorStop(1, "rgba(125,255,154,0)");
    ctx.fillStyle = rg; ctx.fillRect(340, 232, 182, 180);
  } else { ctx.fillStyle = "#7dff9a"; ctx.font = "9px 'Courier New', monospace"; ctx.fillText("FM 98.1", 404, 326); }
  ctx.fillStyle = "#1a1c20"; for (let k = 0; k < 3; k++) ctx.fillRect(472 + k * 7, 318, 4, 8);
  // Volante y manos de Pepe
  ctx.save(); ctx.translate(215, 452); ctx.rotate(steer);
  ctx.strokeStyle = "#101114"; ctx.lineWidth = 18; ctx.beginPath(); ctx.arc(0, 0, 128, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "#1c1e22"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 134, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  ctx.fillStyle = "#101114"; ctx.fillRect(-10, -128, 20, 70);
  for (const a of [-2.35, -0.8]) {
    const hx = Math.cos(a) * 128, hy2 = Math.sin(a) * 128;
    ctx.fillStyle = "#8a5a3c"; ctx.fillRect(hx - 13, hy2 - 10, 26, 22);
    ctx.fillStyle = "#4a6a9a"; ctx.fillRect(hx - 15, hy2 + 10, 30, 30);   // manga
  }
  ctx.restore();

  // Retrovisor grande: el copiloto (a la derecha, cerca) y los tres del asiento de atrás
  const mx = W / 2 - 150, my = 22, mw = 300, mh = 96;
  ctx.fillStyle = "#050506"; ctx.fillRect(W / 2 - 4, 0, 8, my);
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(mx - 6, my - 6, mw + 12, mh + 12, 14) : ctx.rect(mx - 6, my - 6, mw + 12, mh + 12); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(mx, my, mw, mh, 9) : ctx.rect(mx, my, mw, mh); ctx.clip();
  ctx.fillStyle = "#0a0c12"; ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = "#121824"; ctx.fillRect(mx + 24, my + 6, mw - 70, 34);                         // vidrio de atrás
  const mg = scene === "mirror" ? clamp((u - 0.6) / 3, 0, 1) : scene === "plan" ? 1 : 0;
  if (mg > 0) {
    const r = 10 + mg * 70, gx = mx + mw * 0.45, g = ctx.createRadialGradient(gx, my + 20, 1, gx, my + 20, r);
    g.addColorStop(0, "rgba(220,255,220,1)"); g.addColorStop(0.3, "rgba(110,255,140,.8)"); g.addColorStop(1, "rgba(110,255,140,0)");
    ctx.fillStyle = g; ctx.fillRect(mx, my, mw, mh);
  }
  ctx.fillStyle = "#15171c"; ctx.fillRect(mx, my + 66, mw, 40);                                  // respaldo de atrás
  CH.S.back.forEach((k, i) => {
    const img = BSPR[k]; if (!img) return;
    const c = headCrop(img), dw = 40, dh = dw * c.sh / c.sw;
    const standing = k === "sebas" && CH.S.mended && (scene === "mirror" && u > 1.4 || scene === "plan");
    ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, mx + 22 + i * 58, my + 78 - dh - (standing ? 14 : 0), dw, dh);
  });
  const coImg = BSPR[CH.S.co];                                                                  // copiloto, más cerca del espejo
  if (coImg) {
    const pad = coImg.height - 48, sw = 24, sh = 28 + pad, dw = 100, dh = dw * sh / sw;
    ctx.fillStyle = "#1b1d22"; ctx.fillRect(mx + mw - 96, my + 30, 92, mh);                       // su cabecera
    ctx.drawImage(coImg, 4, 0, sw, sh, mx + mw - 104, my + 12, dw, dh);
  }
  ctx.fillStyle = mg > 0 ? `rgba(4,20,8,${(0.5 - mg * 0.2).toFixed(2)})` : "rgba(4,6,12,.5)"; ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = "rgba(255,255,255,.05)"; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + 70, my); ctx.lineTo(mx, my + 60); ctx.fill();   // reflejo del vidrio
  ctx.restore();
  ctx.restore();

  if (scene === "crash") {
    if (u > HITU && u < HITU + 0.1) { ctx.fillStyle = "rgba(230,255,230,.9)"; ctx.fillRect(0, 0, W, H); }
    if (u >= HITU + 0.4) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); if (!CH.crashSnd) { CH.crashSnd = true; chaseBurst(1.8, 400, 0.7, "lowpass"); chaseBurst(0.9, 3000, 0.25, "highpass"); } }
  }
}

/* ---------- Subtítulos: el mismo recuadro de diálogo del bar y del maizal ----------
 * Las líneas con nombre van al recuadro con su retrato; las de narración, en cursiva; un letrero de
 * lugar y hora (narración en una toma de afuera) va a la franja de cine. Cada línea dura lo que dura. */
function chaseCaption() {
  const s = chaseShot(), l = s && s.lines.find(x => CH.u >= x.t0 && CH.u < x.t1);
  if (l === CH.line) return;
  CH.line = l;
  if (!l) { talkSay(null); return; }
  if (!l.who && s.kind === "ext") { talkSay(null); mzBand(l.text, "info"); return; }
  talkSay(l.who, l.text);
}

/* ---------- Audio ---------- */
function chaseAudioStart() {
  CH.audio = sndLoop("chase", out => {
    const eng = AC.createGain(); eng.gain.value = 0.045; const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 240;
    lp.connect(eng); eng.connect(out);
    const oscs = [];
    for (const f of [46, 47.3]) { const o = AC.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.connect(lp); o.start(); oscs.push(o); }
    const src = AC.createBufferSource(); src.buffer = noiseBuf(2); src.loop = true;
    const bp = AC.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1900; bp.Q.value = 0.6;
    const stat = AC.createGain(); stat.gain.value = 0; src.connect(bp); bp.connect(stat); stat.connect(out); src.start();
    const hum = AC.createGain(); hum.gain.value = 0; hum.connect(out);
    const ho = AC.createOscillator(); ho.type = "sine"; ho.frequency.value = 92;
    const lfo = AC.createOscillator(); lfo.frequency.value = 5; const lg = AC.createGain(); lg.gain.value = 7; lfo.connect(lg); lg.connect(ho.frequency);
    ho.connect(hum); ho.start(); lfo.start();
    return { eng, stat, hum, srcs: [...oscs, src, ho, lfo] };
  });
}
function chaseAudioSet(engine, stat, hum) {
  const A = CH && CH.audio; if (!A) return;
  const t = AC.currentTime;
  // Solo se programa un cambio cuando el valor cambia: hacerlo en cada cuadro llenaba la línea de tiempo del audio
  const key = engine + "|" + stat + "|" + hum.toFixed(3);
  if (A.last === key) return;
  A.last = key;
  A.eng.gain.setTargetAtTime(engine, t, 0.15); A.stat.gain.setTargetAtTime(stat, t, 0.08); A.hum.gain.setTargetAtTime(hum, t, 0.2);
}
function chaseAudioStop() { sndStop("chase", 0.2); if (CH) CH.audio = null; }
// Golpe de ruido: el arco eléctrico, la explosión, el choque
const chaseBurst = sndSafe((dur, freq, vol, type) => sndNoise(AC.currentTime, dur, x => Math.pow(1 - x, 2), type, freq, 0, sndGain(vol)));

/* ---------- Control ---------- */
function startChase() {
  initAudio();
  if (!BTEX.B) buildBarAssets();
  if (!TRUCK) TRUCK = truckSprite();
  const R = BAR_RESULT || { keysBy: "stalin", secrets: {}, told: [], flags: {} };
  MODE = "chase";
  CH = { S: chaseScript(R), i: 0, u: 0, T: 0, fade: 0 };
  hidePanels(); talkClose();
  chaseAudioStart();
  mzOverlayClear();
}
function chaseShot() { return CH.S.shots[CH.i]; }
function chaseNextShot() {
  CH.i++; CH.u = 0; CH.smoke = null;
  if (CH.i >= CH.S.shots.length) chaseEnd();
}
function chaseUpdate(dt) {
  if (!CH || CH.done) return;
  CH.T += dt; CH.u += dt;
  const s = chaseShot();
  if (!s) return;
  const sc = s.scene;
  const ufo = sc === "chase" ? 1 : sc === "plan" ? 0.8 : sc === "towers" ? (CH.u < 5.0 ? 1 : 0) : sc === "mirror" ? clamp((CH.u - 1) / 3, 0, 0.6) : 0;
  const stat = sc === "radio" ? (CH.u < s.lines[s.lines.length - 1].t0 + 0.4 ? 0.09 : 0) : sc === "plan" ? 0.12 : sc === "mirror" ? 0.02 : 0;
  const engine = sc === "black" || sc === "after" ? 0 : sc === "crash" ? 0.07 : 0.045;
  chaseAudioSet(engine, stat, ufo * 0.07);
  mzOverlayTick(dt);
  if (CH.u >= s.dur) chaseNextShot();
  if (!CH.done) chaseCaption();
}
function chaseKey(c) {
  if (!CH || CH.done) return;
  if (c === "Escape") { CH.i = CH.S.shots.length - 1; CH.u = chaseShot().dur; chaseNextShot(); return; }
  if (c === "Enter" || c === "Space" || c === "KeyE") {
    const s = chaseShot(); if (!s) return;
    const cur = s.lines.find(l => CH.u >= l.t0 && CH.u < l.t1);
    const next = s.lines.find(l => l.t0 > CH.u);
    if (cur && next) CH.u = next.t0;
    else if (cur) CH.u = Math.max(CH.u, cur.t1);
    else if (next) CH.u = next.t0;
    else chaseNextShot();
  }
}
function chaseRender() {
  if (!CH) return;
  const s = chaseShot();
  if (!s) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); return; }
  const u = CH.u;
  if (s.kind === "ext") renderExt(s, u);
  else if (s.kind === "cab") renderCab(s, u);
  else { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); const p = clamp(u / s.dur, 0, 1); ctx.fillStyle = `rgba(90,255,130,${(0.05 + 0.05 * Math.sin(u * 3)) * p})`; ctx.beginPath(); ctx.arc(W / 2, H * 0.8, 120, 0, 7); ctx.fill(); }
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.65)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, 22); ctx.fillRect(0, H - 4, W, 4);            // franjas de cine
  if (u < 0.35) { ctx.fillStyle = `rgba(0,0,0,${(1 - u / 0.35).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }   // corte suave
  hudCorner("Enter: siguiente · Esc: saltar la escena", 11);
  drawMzOverlay();
}
function chaseEnd() {
  if (CH.done) return;
  CH.done = true;
  chaseAudioStop(); talkClose();
  const radioShot = CH.S.shots.find(s => s.scene === "radio");
  CHASE_RESULT = { wounded: CH.S.wounded, copilot: CH.S.co, mended: CH.S.mended, radio: CH.S.radioKind,
                   radioLine: radioShot && radioShot.lines[0] ? radioShot.lines[0].text : "", stalinToLight: true };
  startMaizalAfterChase();
}
