# Escape del Maizal

Juego 2D top-down en pixel art nocturno, hecho con Phaser 3.

## Ejecutar localmente
1. Descomprime el proyecto.
2. Abre la carpeta en Visual Studio Code.
3. Ejecuta `index.html` con Live Server.
4. Se necesita conexión a Internet para cargar Phaser desde jsDelivr.

## Controles
- Flechas o WASD: mover al jugador.
- R: reiniciar.

## Reglas
- Llega a la salida verde luminosa.
- El alien persigue al jugador y puede atravesar los cultivos.
- El alien queda visualmente oculto mientras está dentro de una casilla de maíz, pero la colisión sigue activa.
- El jugador no puede atravesar el maíz.

## Archivos
- `index.html`: página y estilos.
- `game.js`: mapa, sprites pixel art dibujados por código, movimiento, persecución y condiciones de victoria/derrota.