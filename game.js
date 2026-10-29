/* Escape del Maizal — Phaser 3
 * Arte pixelado dibujado por código; no requiere descargar sprites externos.
 */
const TILE = 32;
const COLS = 25;
const ROWS = 19;
const W = COLS * TILE;
const H = ROWS * TILE;
const PLAYER_SPEED = 155;
const ALIEN_SPEED = 83;

// # = maizal (bloquea al jugador), . = camino, P = inicio, X = salida.
// El alien puede atravesar cualquier casilla, pero queda oculto en el maíz.
const MAP = [
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

class EscapeScene extends Phaser.Scene {
  constructor() { super("escape"); }

  create() {
    this.gameOver = false;
    this.elapsed = 0;
    this.cornTiles = [];
    this.drawWorld();

    const start = this.findTile("P");
    const exit = this.findTile("X");
    this.exitZone = new Phaser.Geom.Rectangle(exit.x * TILE, exit.y * TILE, TILE, TILE);

    this.player = this.physics.add.sprite(
      start.x * TILE + TILE / 2, start.y * TILE + TILE / 2, "player"
    );
    this.player.setDepth(5);
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(16, 18).setOffset(8, 9);

    this.alien = this.physics.add.sprite(
      (COLS - 2) * TILE + TILE / 2, 2 * TILE + TILE / 2, "alien"
    );
    this.alien.setDepth(4);
    this.alien.body.setSize(18, 18).setOffset(7, 7);

    // Solo el jugador colisiona con los bloques de maíz.
    this.physics.add.collider(this.player, this.cornTiles);

    this.physics.world.setBounds(0, 0, W, H);
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys("W,A,S,D,R");
    this.input.keyboard.on("keydown-R", () => this.scene.restart());

    this.exitMarker = this.add.container(exit.x * TILE + TILE / 2, exit.y * TILE + TILE / 2);
    const glow = this.add.rectangle(0, 0, 28, 28, 0xb8ff58, 0.16);
    const pad = this.add.rectangle(0, 0, 22, 22, 0x213e27).setStrokeStyle(2, 0xc9ff78);
    const arrow = this.add.text(0, 0, "↑", {
      fontFamily: "Courier New", fontSize: "23px", color: "#d7ff8c",
      fontStyle: "bold"
    }).setOrigin(0.5);
    this.exitMarker.add([glow, pad, arrow]).setDepth(2);

    this.hud = this.add.container(12, 10).setDepth(20);
    this.hudBg = this.add.rectangle(0, 0, 250, 29, 0x07111d, 0.82).setOrigin(0);
    this.hudText = this.add.text(10, 7, "ENCUENTRA LA SALIDA", {
      fontFamily: "Courier New", fontSize: "14px", color: "#e9f7c2",
      fontStyle: "bold"
    });
    this.hud.add([this.hudBg, this.hudText]);

    this.message = this.add.container(W / 2, H / 2).setDepth(30).setVisible(false);
    const veil = this.add.rectangle(0, 0, W, H, 0x020611, 0.83);
    const title = this.add.text(0, -25, "", {
      fontFamily: "Courier New", fontSize: "42px", color: "#b9f66d",
      fontStyle: "bold", align: "center"
    }).setOrigin(0.5);
    const desc = this.add.text(0, 20, "", {
      fontFamily: "Courier New", fontSize: "17px", color: "#d8e7fa",
      align: "center"
    }).setOrigin(0.5);
    const retry = this.add.text(0, 67, "[ R  —  REINICIAR ]", {
      fontFamily: "Courier New", fontSize: "17px", color: "#fff1a6",
      backgroundColor: "#203650", padding: { x: 12, y: 8 }
    }).setOrigin(0.5);
    this.message.add([veil, title, desc, retry]);
    this.messageTitle = title;
    this.messageDesc = desc;

    // Oscuridad ambiental y un pequeño halo alrededor del jugador.
    this.darkness = this.add.graphics().setDepth(15).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.playerGlow = this.add.graphics().setDepth(16).setBlendMode(Phaser.BlendModes.ADD);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setBackgroundColor("#080d13");
  }

  findTile(char) {
    for (let y = 0; y < MAP.length; y++) {
      const x = MAP[y].indexOf(char);
      if (x !== -1) return { x, y };
    }
    return { x: 1, y: 1 };
  }

  drawWorld() {
    const g = this.add.graphics();
    // Suelo nocturno y caminos.
    g.fillStyle(0x182019, 1);
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const ch = MAP[y][x];
        const px = x * TILE, py = y * TILE;
        if (ch === "#") {
          this.drawCorn(g, px, py, x, y);
        } else {
          g.fillStyle((x + y) % 2 ? 0x30291f : 0x28251f, 1);
          g.fillRect(px, py, TILE, TILE);
          // Granitos de tierra en el camino.
          g.fillStyle(0x50402b, 0.45);
          g.fillRect(px + ((x * 7 + y * 3) % 23) + 3, py + ((y * 5 + x) % 22) + 4, 2, 2);
          if ((x + y) % 5 === 0) {
            g.fillStyle(0x3c3225, 0.8);
            g.fillRect(px + 7, py + 22, 3, 2);
          }
        }
      }
    }
    // Cerca exterior de madera.
    g.lineStyle(4, 0x493a2a, 1);
    g.strokeRect(3, 3, W - 6, H - 6);
    g.lineStyle(2, 0x80603a, 0.85);
    g.strokeRect(7, 7, W - 14, H - 14);
    for (let x = 14; x < W; x += 64) {
      g.fillStyle(0x65482c, 1); g.fillRect(x, 2, 5, 9); g.fillRect(x, H - 11, 5, 9);
    }
    for (let y = 14; y < H; y += 64) {
      g.fillStyle(0x65482c, 1); g.fillRect(2, y, 9, 5); g.fillRect(W - 11, y, 9, 5);
    }
    // Pequeñas lámparas cálidas junto a algunos pasillos.
    const lamps = [[1,7],[8,5],[13,3],[21,7],[5,15],[17,15],[22,16]];
    lamps.forEach(([x,y]) => {
      const cx = x*TILE + TILE/2, cy = y*TILE + TILE/2;
      g.fillStyle(0xffc65b, 0.15); g.fillCircle(cx, cy, 13);
      g.fillStyle(0xffd77b, 0.95); g.fillRect(cx-2, cy-4, 4, 8);
      g.fillStyle(0x7e5427, 1); g.fillRect(cx-4, cy-6, 8, 2);
    });
  }

  drawCorn(g, px, py, x, y) {
    // Denso bloque de maíz: base oscura y hojas con pequeños píxeles dorados.
    g.fillStyle(0x102016, 1); g.fillRect(px, py, TILE, TILE);
    g.fillStyle(0x172c1b, 1); g.fillRect(px + 2, py + 2, 28, 28);
    for (let i = 0; i < 5; i++) {
      const sx = px + 4 + ((i * 7 + x * 3 + y) % 24);
      const sy = py + 4 + ((i * 11 + y * 5 + x) % 23);
      g.fillStyle(i % 2 ? 0x315329 : 0x42652b, 1);
      g.fillRect(sx, sy, 3, 14);
      g.fillStyle(0x567333, 1);
      g.fillRect(sx - 3, sy + 4, 7, 3);
      g.fillRect(sx + 1, sy + 8, 8, 2);
      if ((i + x + y) % 3 === 0) {
        g.fillStyle(0x9b8b42, 1); g.fillRect(sx + 1, sy - 2, 2, 4);
      }
    }
    g.fillStyle(0x09150e, 0.75);
    g.fillRect(px, py, TILE, 3);
    const blocker = this.add.rectangle(
      px + TILE / 2,
      py + TILE / 2,
      TILE,
      TILE,
      0x000000,
      0
    ).setVisible(false);

    this.physics.add.existing(blocker, true);
    this.cornTiles.push(blocker);
  }

  update(_, delta) {
    if (this.gameOver) return;
    this.elapsed += delta;

    let vx = 0, vy = 0;
    if (this.cursors.left.isDown || this.keys.A.isDown) vx = -1;
    else if (this.cursors.right.isDown || this.keys.D.isDown) vx = 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) vy = -1;
    else if (this.cursors.down.isDown || this.keys.S.isDown) vy = 1;
    if (vx && vy) { vx *= 0.7071; vy *= 0.7071; }
    this.player.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED);

    // El alien siempre sabe dónde está el jugador y puede cruzar el maizal.
    const dx = this.player.x - this.alien.x;
    const dy = this.player.y - this.alien.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      this.alien.setVelocity(dx / dist * ALIEN_SPEED, dy / dist * ALIEN_SPEED);
    } else {
      this.alien.setVelocity(0, 0);
    }

    // El alien solo se dibuja cuando está en un camino; dentro del maíz se oculta.
    const ax = Math.max(0, Math.min(COLS - 1, Math.floor(this.alien.x / TILE)));
    const ay = Math.max(0, Math.min(ROWS - 1, Math.floor(this.alien.y / TILE)));
    const hidden = MAP[ay][ax] === "#";
    this.alien.setVisible(!hidden);
    this.alien.setAlpha(0.95);

    // La colisión con el alien funciona aunque esté oculto en el maíz.
    if (dist < 22) this.finish(false);
    if (Phaser.Geom.Rectangle.Contains(this.exitZone, this.player.x, this.player.y)) this.finish(true);

    // Oscuridad azulada con visión limitada del jugador.
    this.darkness.clear();
    this.darkness.fillStyle(0x020817, 0.56);
    this.darkness.fillRect(0, 0, W, H);
    this.playerGlow.clear();
    this.playerGlow.fillStyle(0x8bbdff, 0.09);
    this.playerGlow.fillCircle(this.player.x, this.player.y, 105);
    this.playerGlow.fillStyle(0x9fcaff, 0.045);
    this.playerGlow.fillCircle(this.player.x, this.player.y, 145);
    // Reabrir una zona visible alrededor del jugador usando un círculo oscuro transparente.
    this.darkness.setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.darkness.fillStyle(0xffffff, 0);
    this.darkness.fillCircle(this.player.x, this.player.y, 82);

    // Brillo pulsante de la salida.
    this.exitMarker.setAlpha(0.78 + Math.sin(this.elapsed / 220) * 0.22);
  }

  finish(won) {
    if (this.gameOver) return;
    this.gameOver = true;
    this.player.setVelocity(0, 0);
    this.alien.setVelocity(0, 0);
    this.message.setVisible(true);
    this.messageTitle.setText(won ? "¡ESCAPASTE!" : "¡TE ATRAPÓ!");
    this.messageTitle.setColor(won ? "#b9f66d" : "#ff5b68");
    this.messageDesc.setText(won
      ? "Has conseguido salir del maizal."
      : "El alien te encontró entre las plantas.");
  }
}

// Sprites pixel art dibujados en una textura pequeña, ampliada sin suavizado.
function makePixelSprite(scene, key, painter) {
  const c = document.createElement("canvas");
  c.width = 32; c.height = 32;
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  painter(ctx);
  scene.textures.addCanvas(key, c);
}
function createSprites(scene) {
  makePixelSprite(scene, "player", c => {
    // sombra
    c.fillStyle = "#080b10"; c.fillRect(7, 24, 18, 5);
    // botas
    c.fillStyle = "#292b36"; c.fillRect(8, 23, 6, 6); c.fillRect(19, 23, 6, 6);
    // pantalón y chaqueta
    c.fillStyle = "#263e67"; c.fillRect(9, 17, 14, 8);
    c.fillStyle = "#426ca1"; c.fillRect(11, 18, 4, 5);
    // brazos
    c.fillStyle = "#e5a56f"; c.fillRect(5, 17, 5, 7); c.fillRect(22, 17, 5, 7);
    // cabeza
    c.fillStyle = "#f0bd8b"; c.fillRect(10, 8, 12, 11);
    c.fillStyle = "#8c513d"; c.fillRect(10, 14, 12, 3);
    // ojos
    c.fillStyle = "#10151e"; c.fillRect(12, 12, 2, 2); c.fillRect(18, 12, 2, 2);
    // gorra roja
    c.fillStyle = "#9e2633"; c.fillRect(8, 6, 16, 5);
    c.fillStyle = "#e3444d"; c.fillRect(11, 4, 11, 4); c.fillRect(20, 8, 6, 2);
    c.fillStyle = "#ffbd80"; c.fillRect(14, 20, 4, 3);
  });
  makePixelSprite(scene, "alien", c => {
    c.fillStyle = "#060b0c"; c.fillRect(6, 24, 20, 5);
    c.fillStyle = "#236b3c"; c.fillRect(8, 20, 6, 8); c.fillRect(19, 20, 6, 8);
    c.fillStyle = "#48a84d"; c.fillRect(8, 13, 16, 12); c.fillRect(5, 16, 5, 6); c.fillRect(22, 16, 5, 6);
    c.fillStyle = "#78d65b"; c.fillRect(9, 5, 14, 12); c.fillRect(12, 3, 8, 3);
    c.fillStyle = "#9ef06c"; c.fillRect(12, 6, 7, 4);
    c.fillStyle = "#07140e"; c.fillRect(10, 10, 4, 5); c.fillRect(19, 10, 4, 5);
    c.fillStyle = "#d7ff8b"; c.fillRect(11, 11, 2, 2); c.fillRect(20, 11, 2, 2);
    c.fillStyle = "#17462b"; c.fillRect(14, 17, 4, 2);
    c.fillStyle = "#6bd456"; c.fillRect(2, 17, 4, 3); c.fillRect(26, 17, 4, 3);
  });
}

const config = {
  type: Phaser.AUTO,
  parent: "game",
  width: W,
  height: H,
  pixelArt: true,
  antialias: false,
  backgroundColor: "#080d13",
  physics: { default: "arcade", arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: {
    preload() {},
    create() { createSprites(this); this.scene.restart(); },
  }
};

// Boot scene makes textures before constructing the gameplay scene.
class BootScene extends Phaser.Scene {
  constructor() { super("boot"); }
  create() {
    createSprites(this);
    this.scene.start("escape");
  }
}
const finalConfig = { ...config, scene: [BootScene, EscapeScene] };
new Phaser.Game(finalConfig);
