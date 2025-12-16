// Minimal relay + static file server for online Pong.
// Run: `npm install ws` then `node server.js` (defaults to port 3001).
const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3001;

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  let filePath = req.url.split("?")[0];
  if (filePath === "/") filePath = "/index.html";
  const resolvedPath = path.join(__dirname, filePath);

  fs.readFile(resolvedPath, (err, data) => {
    if (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500);
      return res.end("Not found");
    }
    const ext = path.extname(resolvedPath).toLowerCase();
    const type = mimeTypes[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

const rooms = new Map(); // roomCode -> { host, guest, hostName, guestName }

function send(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function cleanup(ws) {
  const code = ws.roomCode;
  const role = ws.role;
  if (!code) return;
  const room = rooms.get(code);
  if (!room) return;
  const other = role === "host" ? room.guest : room.host;
  send(other, { type: "peer_left" });
  if (role === "host") {
    if (room.guest) {
      send(room.guest, { type: "error", message: "Host left the room" });
      room.guest.close();
    }
    rooms.delete(code);
  } else {
    room.guest = null;
    room.guestName = null;
  }
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (err) {
      return;
    }

    switch (msg.type) {
      case "create_room": {
        const roomCode = (msg.roomCode || makeRoomCode()).toUpperCase();
        if (rooms.has(roomCode)) {
          send(ws, { type: "error", message: "Room already exists" });
          return;
        }
        rooms.set(roomCode, {
          host: ws,
          guest: null,
          hostName: msg.name || "Host",
          guestName: null,
        });
        ws.roomCode = roomCode;
        ws.role = "host";
        send(ws, {
          type: "room_created",
          roomCode,
          role: "host",
          hostName: msg.name || "Host",
        });
        break;
      }
      case "join_room": {
        const roomCode = (msg.roomCode || "").toUpperCase();
        const room = rooms.get(roomCode);
        if (!room) {
          send(ws, { type: "error", message: "Room not found" });
          return;
        }
        if (room.guest) {
          send(ws, { type: "error", message: "Room is full" });
          return;
        }
        room.guest = ws;
        room.guestName = msg.name || "Guest";
        ws.roomCode = roomCode;
        ws.role = "guest";
        send(ws, {
          type: "room_joined",
          roomCode,
          role: "guest",
          hostName: room.hostName || "Host",
        });
        send(room.host, { type: "peer_joined", name: room.guestName });
        break;
      }
      case "ready":
      case "input":
      case "state":
      case "serve":
      case "start": {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        const target = ws.role === "host" ? room.guest : room.host;
        send(target, msg);
        break;
      }
      default:
        break;
    }
  });

  ws.on("close", () => cleanup(ws));
});

server.listen(PORT, () => {
  console.log(`Pong server listening on http://localhost:${PORT} (WS on same port)`);
});
