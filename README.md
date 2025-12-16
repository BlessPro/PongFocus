# PongFocus

Simple Pong with themes, pause/serve control, a draggable leaderboard, and optional online play through a tiny WebSocket relay bundled in `server.js`.

## How to run locally
- Install deps (only `ws`): `npm install`
- Start the bundled web+WS server: `node server.js`
- Open http://localhost:3001 in two browser windows/tabs

## Controls
- P1: Arrow Up/Down
- P2 (local multiplayer): W/S
- Serve/start: Space or Enter (when ball is centered)
- Pause/resume: Space or P

## Online play
- Click Play Online, enter your name, and a room code (or leave blank to auto-generate), then Create Room.
- Second player enters the same code and clicks Join Room.
- Both click Ready. Host serves first; guest uses W/S (or arrows) for their paddle.
- Leaderboard (match wins) stays in sync; panel is draggable.

## Resetting
- Use the Reset Game button to clear local storage (names, theme, leaderboard, levels) and restart.
