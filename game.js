// Theme setup
const themes = {
  classic: { bg: "#000", ballSize: 14, ballShape: "square", paddleColor: "#fff", border: "#0ff" },
  neon:    { bg: "#111", ballSize: 18, ballShape: "circle", paddleColor: "#0ff", border: "#f0f" },
  retro:   { bg: "#241c1c", ballSize: 12, ballShape: "square", paddleColor: "#fa0", border: "#fff700" },
  ocean:   { bg: "#0a2233", ballSize: 16, ballShape: "circle", paddleColor: "#00e0ff", border: "#00ffee" },
  lava:    { bg: "#2e0000", ballSize: 20, ballShape: "circle", paddleColor: "#ff4500", border: "#ff0000" }
};

// Network setup
const WS_URL = (() => {
  const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (isLocal) return "ws://localhost:3001";
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}`;
})();

// Mode selection
let gameMode = localStorage.getItem("pongMode");
if (!gameMode) {
  const modeChoice = prompt("Choose mode:\n1 = Play vs AI\n2 = Multiplayer (2 players)");
  gameMode = modeChoice && modeChoice.trim() === "2" ? "multiplayer" : "ai";
  localStorage.setItem("pongMode", gameMode);
}

const selectedThemeKey = localStorage.getItem("pongTheme") || "classic";
let currentThemeKey = selectedThemeKey;
let theme = themes[currentThemeKey];

let player1Name = "Player 1";
let player2Name = "Player 2";
let overlayShown = false;
let isOnline = false;
let isHost = false;
let roomCode = "";
let socket = null;
let peerReady = false;
let selfReady = false;
let netStatusLabel = null;
let onlinePanel = null;
let roomCodeBadge = null;
let readyBtn = null;
let playOnlineBtn = null;
let playLocalBtn = null;
let nameInput = null;
let roomInput = null;
let hasNetState = false;
let remoteInput = { up: false, down: false };

if (gameMode === "multiplayer") {
  const storedP1 = localStorage.getItem("pongP1Name");
  const storedP2 = localStorage.getItem("pongP2Name");
  player1Name = storedP1 || prompt("Enter Player 1 name:") || "Player 1";
  player2Name = storedP2 || prompt("Enter Player 2 name:") || "Player 2";
  localStorage.setItem("pongP1Name", player1Name);
  localStorage.setItem("pongP2Name", player2Name);
} else {
  const storedName = localStorage.getItem("pongUsername");
  player1Name = storedName || prompt("Enter your name:") || "Player";
  localStorage.setItem("pongUsername", player1Name);
  player2Name = "AI";
}

function applyTheme(key) {
  currentThemeKey = key;
  theme = themes[key];
  const canvas = document.getElementById("pong");
  canvas.style.background = theme.bg;
  canvas.style.border = `4px solid ${theme.border}`;
  localStorage.setItem("pongTheme", key);
}

window.addEventListener("DOMContentLoaded", () => {
  applyTheme(currentThemeKey);
  initUI();
  initDrag();
  renderLiveScores();
  renderLeaderboard();
  updateServeHint();
});

let currentLevel = parseInt(localStorage.getItem('pongLevel') || "1");
let difficultyFactor = 1 + (currentLevel - 1) * 0.1;

const canvas = document.getElementById('pong');
const ctx = canvas.getContext('2d');

canvas.style.background = theme.bg;
canvas.style.border = `4px solid ${theme.border}`;

const PADDLE_WIDTH = 12;
const PADDLE_HEIGHT = 80;
const PADDLE_MARGIN = 18;
let BALL_SIZE = theme.ballSize;
let BALL_SPEED = 5 * difficultyFactor;
let AI_SPEED = 3.2 * difficultyFactor;

let playerY = (canvas.height - PADDLE_HEIGHT) / 2;
let aiY = (canvas.height - PADDLE_HEIGHT) / 2;

let ballX = canvas.width / 2 - BALL_SIZE / 2;
let ballY = canvas.height / 2 - BALL_SIZE / 2;
let ballVX = BALL_SPEED * (Math.random() > 0.5 ? 1 : -1);
let ballVY = BALL_SPEED * (Math.random() * 2 - 1) * 0.7;

let playerScore = 0;
let aiScore = 0;
let gameOver = false;
let paused = false;
let waitingForServe = false;
let pendingServeDirection = 1;

const hitSound = document.getElementById("hitSound");
const scoreSound = document.getElementById("scoreSound");
const liveP1 = document.getElementById("liveP1");
const liveP2 = document.getElementById("liveP2");
const leaderboardList = document.getElementById("leaderboardList");
const serveHint = document.getElementById("serveHint");

const leaderboardStorageKey = "pongLeaderboard";
let leaderboardData = loadLeaderboard();

function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(leaderboardStorageKey);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn("Could not read leaderboard", err);
    return {};
  }
}

function saveLeaderboard() {
  localStorage.setItem(leaderboardStorageKey, JSON.stringify(leaderboardData));
}

function renderLeaderboard() {
  if (!leaderboardList) return;
  leaderboardList.innerHTML = "";
  const entries = Object.entries(leaderboardData)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (!entries.length) {
    const li = document.createElement("li");
    li.textContent = "No wins yet";
    leaderboardList.appendChild(li);
    return;
  }

  entries.forEach(([name, wins]) => {
    const li = document.createElement("li");
    li.textContent = `${name}: ${wins}`;
    leaderboardList.appendChild(li);
  });
}

function recordWin(name) {
  if (!name) return;
  leaderboardData[name] = (leaderboardData[name] || 0) + 1;
  saveLeaderboard();
  renderLeaderboard();
  if (isOnline && isHost) {
    sendLeaderboard();
  }
}

function renderLiveScores() {
  if (liveP1) liveP1.textContent = `${player1Name}: ${playerScore}`;
  if (liveP2) liveP2.textContent = `${player2Name}: ${aiScore}`;
}

function updateServeHint() {
  if (!serveHint) return;
  if (waitingForServe) {
    const target = pendingServeDirection === 1 ? player2Name : player1Name;
    serveHint.textContent = `Press Space or Enter to serve to ${target}`;
  } else {
    serveHint.textContent = "Press Space or Enter to serve";
  }
}

function initUI() {
  playOnlineBtn = document.getElementById("playOnlineBtn");
  playLocalBtn = document.getElementById("playLocalBtn");
  netStatusLabel = document.getElementById("netStatusLabel");
  onlinePanel = document.getElementById("onlinePanel");
  roomCodeBadge = document.getElementById("roomCodeBadge");
  readyBtn = document.getElementById("readyBtn");
  nameInput = document.getElementById("nameInput");
  roomInput = document.getElementById("roomInput");

  if (nameInput) {
    nameInput.value = player1Name;
  }

  const createBtn = document.getElementById("createRoomBtn");
  const joinBtn = document.getElementById("joinRoomBtn");

  if (playOnlineBtn) {
    playOnlineBtn.addEventListener("click", () => {
      if (onlinePanel) onlinePanel.classList.remove("hidden");
      setNetStatus("Online mode");
    });
  }

  if (playLocalBtn) {
    playLocalBtn.addEventListener("click", () => {
      disconnectOnline();
      if (onlinePanel) onlinePanel.classList.add("hidden");
      setNetStatus("Offline");
      peerReady = false;
      selfReady = false;
      overlayShown = false;
      gameMode = localStorage.getItem("pongMode") || "ai";
    });
  }

  if (createBtn) {
    createBtn.addEventListener("click", () => {
      const name = (nameInput?.value || "Player 1").trim() || "Player 1";
      const codeRaw = (roomInput?.value || "").trim();
      const code = codeRaw ? codeRaw.toUpperCase() : "";
      if (roomInput && code) roomInput.value = code;
      connectAndSend({ type: "create_room", name, roomCode: code || undefined });
    });
  }

  if (joinBtn) {
    joinBtn.addEventListener("click", () => {
      const name = (nameInput?.value || "Player 2").trim() || "Player 2";
      const codeRaw = (roomInput?.value || "").trim();
      const code = codeRaw ? codeRaw.toUpperCase() : "";
      if (!code) {
        alert("Enter a room code to join.");
        return;
      }
      if (roomInput) roomInput.value = code;
      connectAndSend({ type: "join_room", name, roomCode: code });
    });
  }

  if (readyBtn) {
    readyBtn.addEventListener("click", () => {
      if (!isOnline || !socket || socket.readyState !== WebSocket.OPEN) return;
      selfReady = true;
      readyBtn.disabled = true;
      setNetStatus("Ready - waiting for opponent");
      sendNet({ type: "ready" });
      if (isHost && peerReady) {
        startOnlineMatch();
      }
    });
  }
}

function initDrag() {
  const panel = document.getElementById("leaderboardPanel");
  const handle = panel?.querySelector("h3") || panel;
  if (!panel || !handle) return;
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener("mousedown", (e) => {
    dragging = true;
    offsetX = e.clientX - panel.getBoundingClientRect().left;
    offsetY = e.clientY - panel.getBoundingClientRect().top;
    panel.style.right = "auto";
    panel.style.left = `${panel.getBoundingClientRect().left}px`;
    panel.style.top = `${panel.getBoundingClientRect().top}px`;
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", stopDrag);
  });

  function onMove(e) {
    if (!dragging) return;
    panel.style.left = `${e.clientX - offsetX}px`;
    panel.style.top = `${e.clientY - offsetY}px`;
  }

  function stopDrag() {
    dragging = false;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", stopDrag);
  }
}

function setNetStatus(text) {
  if (netStatusLabel) netStatusLabel.textContent = text;
}

function connectAndSend(initialMessage) {
  disconnectOnline();
  setNetStatus("Connecting...");
  socket = new WebSocket(WS_URL);
  socket.onopen = () => {
    setNetStatus("Connected");
    sendNet(initialMessage);
  };
  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleNetMessage(data);
    } catch (err) {
      console.warn("Bad message", err);
    }
  };
  socket.onclose = () => {
    setNetStatus("Disconnected");
    isOnline = false;
    peerReady = false;
    selfReady = false;
    readyBtn && (readyBtn.disabled = true);
  };
}

function disconnectOnline() {
  if (socket) {
    socket.close();
    socket = null;
  }
  isOnline = false;
  isHost = false;
  roomCode = "";
  peerReady = false;
  selfReady = false;
  hasNetState = false;
  remoteInput = { up: false, down: false };
  roomCodeBadge && (roomCodeBadge.textContent = "");
}

function sendNet(msg) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(msg));
}

function handleNetMessage(msg) {
  switch (msg.type) {
    case "room_created":
      isOnline = true;
      isHost = true;
      roomCode = msg.roomCode;
      player1Name = msg.hostName || (nameInput?.value || "Player 1");
      player2Name = "Waiting...";
      readyBtn && (readyBtn.disabled = false);
      if (roomCodeBadge) roomCodeBadge.textContent = `Room: ${roomCode}`;
      setNetStatus("Room created - waiting for join");
      renderLiveScores();
      paused = true;
      resetBall(1);
      break;
    case "room_joined":
      isOnline = true;
      isHost = false;
      roomCode = msg.roomCode;
      player1Name = msg.hostName || "Host";
      player2Name = (nameInput?.value || "Player 2");
      readyBtn && (readyBtn.disabled = false);
      if (roomCodeBadge) roomCodeBadge.textContent = `Room: ${roomCode}`;
      setNetStatus("Connected - click Ready");
      renderLiveScores();
      paused = true;
      resetBall(-1);
      break;
    case "peer_joined":
      player2Name = msg.name || "Guest";
      peerReady = false;
      setNetStatus("Connected - click Ready");
      renderLiveScores();
      if (isHost) {
        sendLeaderboard();
      }
      break;
    case "ready":
      peerReady = true;
      setNetStatus("Opponent ready");
      if (isHost && selfReady) {
        startOnlineMatch();
      }
      break;
    case "start":
      isOnline = true;
      gameMode = "online";
      isHost = msg.role === "host" ? true : false;
      player1Name = msg.names?.p1 || player1Name;
      player2Name = msg.names?.p2 || player2Name;
      overlayShown = false;
      renderLiveScores();
      updateServeHint();
      break;
    case "input":
      if (isHost) {
        remoteInput.up = !!msg.up;
        remoteInput.down = !!msg.down;
        if (waitingForServe && msg.serve) {
          startServe();
        }
      }
      break;
    case "serve":
      if (isHost && waitingForServe) {
        startServe();
      }
      break;
    case "state":
      if (!isHost) {
        applyNetState(msg.state);
      }
      break;
    case "leaderboard":
      if (msg.data) {
        leaderboardData = msg.data;
        saveLeaderboard();
        renderLeaderboard();
      }
      break;
    case "pause_toggle":
      if (isHost) {
        togglePause();
        sendState();
      }
      break;
    case "peer_left":
      setNetStatus("Opponent disconnected");
      pauseGameForDisconnect();
      break;
    case "error":
      alert(msg.message || "Network error");
      setNetStatus("Error");
      break;
    default:
      break;
  }
}

function sendOnlineInput() {
  if (!isOnline || isHost) return;
  sendNet({
    type: "input",
    up: !!(keys["KeyW"] || keys["ArrowUp"]),
    down: !!(keys["KeyS"] || keys["ArrowDown"]),
    serve: waitingForServe && (keys["Space"] || keys["Enter"]),
  });
}

function applyNetState(state) {
  if (!state) return;
  hasNetState = true;
  playerY = state.playerY;
  aiY = state.aiY;
  ballX = state.ballX;
  ballY = state.ballY;
  ballVX = state.ballVX;
  ballVY = state.ballVY;
  playerScore = state.playerScore;
  aiScore = state.aiScore;
  waitingForServe = state.waitingForServe;
  pendingServeDirection = state.pendingServeDirection;
  gameOver = state.gameOver;
  paused = state.paused;
  renderLiveScores();
  updateServeHint();
  if (state.currentTheme && state.currentTheme !== currentThemeKey) {
    applyTheme(state.currentTheme);
  }
  if (gameOver && !overlayShown) {
    overlayShown = true;
    showGameOverScreen();
  }
}

function sendState() {
  if (!isOnline || !isHost) return;
  sendNet({
    type: "state",
    state: {
      playerY,
      aiY,
      ballX,
      ballY,
      ballVX,
      ballVY,
      playerScore,
      aiScore,
      waitingForServe,
      pendingServeDirection,
      gameOver,
      paused,
      currentTheme: currentThemeKey,
    },
  });
}

function sendLeaderboard() {
  if (!isOnline || !isHost) return;
  sendNet({ type: "leaderboard", data: leaderboardData });
}

function pauseGameForDisconnect() {
  paused = true;
  waitingForServe = true;
  setNetStatus("Paused - opponent left");
}

function togglePause() {
  paused = !paused;
  if (isOnline && isHost) {
    sendState();
  }
}

function startOnlineMatch() {
  gameMode = "online";
  isOnline = true;
  overlayShown = false;
  gameOver = false;
  playerScore = 0;
  aiScore = 0;
  playerY = (canvas.height - PADDLE_HEIGHT) / 2;
  aiY = (canvas.height - PADDLE_HEIGHT) / 2;
  selfReady = false;
  peerReady = false;
  readyBtn && (readyBtn.disabled = false);
  const serveDir = Math.random() > 0.5 ? 1 : -1;
  resetBall(serveDir);
  renderLiveScores();
  updateServeHint();
  sendNet({
    type: "start",
    role: "guest",
    names: { p1: player1Name, p2: player2Name },
  });
  sendState();
}

let keys = {};
document.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (isOnline && !isHost) {
    if (waitingForServe && (e.code === "Space" || e.code === "Enter")) {
      sendNet({ type: "serve" });
      return;
    }
    if (e.code === "Space" || e.code === "KeyP") {
      sendNet({ type: "pause_toggle" });
      return;
    }
    sendOnlineInput();
    return;
  }
  if (waitingForServe && (e.code === "Space" || e.code === "Enter")) {
    startServe();
    return;
  }
  if (e.code === "Space" || e.code === "KeyP") {
    togglePause();
  }
});

document.addEventListener("keyup", (e) => {
  keys[e.code] = false;
  if (isOnline && !isHost) {
    sendOnlineInput();
  }
});

renderLiveScores();
renderLeaderboard();
updateServeHint();

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#fff";
  ctx.setLineDash([8, 10]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = theme.paddleColor;
  ctx.fillRect(PADDLE_MARGIN, playerY, PADDLE_WIDTH, PADDLE_HEIGHT);
  ctx.fillRect(canvas.width - PADDLE_MARGIN - PADDLE_WIDTH, aiY, PADDLE_WIDTH, PADDLE_HEIGHT);

  ctx.fillStyle = "#fff";
  if (theme.ballShape === "circle") {
    ctx.beginPath();
    ctx.arc(ballX + BALL_SIZE / 2, ballY + BALL_SIZE / 2, BALL_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillRect(ballX, ballY, BALL_SIZE, BALL_SIZE);
  }

  ctx.font = "36px Arial";
  ctx.textAlign = "center";
  ctx.fillText(playerScore, canvas.width / 2 - 60, 48);
  ctx.fillText(aiScore, canvas.width / 2 + 60, 48);
}

function update() {
  if (gameOver || paused) return;
  if (isOnline && !isHost) return; // guests render from host state only

  // Handle paddle movement
  if (keys["ArrowUp"]) playerY -= 6;
  if (keys["ArrowDown"]) playerY += 6;
  playerY = Math.max(0, Math.min(canvas.height - PADDLE_HEIGHT, playerY));

  if (isOnline && isHost) {
    if (remoteInput.up) aiY -= 6;
    if (remoteInput.down) aiY += 6;
    aiY = Math.max(0, Math.min(canvas.height - PADDLE_HEIGHT, aiY));
  } else if (gameMode === "multiplayer") {
    if (keys["KeyW"]) aiY -= 6;
    if (keys["KeyS"]) aiY += 6;
    aiY = Math.max(0, Math.min(canvas.height - PADDLE_HEIGHT, aiY));
  }

  ballX += ballVX;
  ballY += ballVY;

  if (ballY <= 0 || ballY + BALL_SIZE >= canvas.height) {
    ballVY *= -1;
    ballY = Math.max(0, Math.min(canvas.height - BALL_SIZE, ballY));
  }

  if (
    ballX <= PADDLE_MARGIN + PADDLE_WIDTH &&
    ballY + BALL_SIZE > playerY &&
    ballY < playerY + PADDLE_HEIGHT
  ) {
    ballX = PADDLE_MARGIN + PADDLE_WIDTH;
    ballVX *= -1;
    ballVY = ((ballY + BALL_SIZE / 2) - (playerY + PADDLE_HEIGHT / 2)) * 0.18;
    hitSound.play();
  }

  if (
    ballX + BALL_SIZE >= canvas.width - PADDLE_MARGIN - PADDLE_WIDTH &&
    ballY + BALL_SIZE > aiY &&
    ballY < aiY + PADDLE_HEIGHT
  ) {
    ballX = canvas.width - PADDLE_MARGIN - PADDLE_WIDTH - BALL_SIZE;
    ballVX *= -1;
    ballVY = ((ballY + BALL_SIZE / 2) - (aiY + PADDLE_HEIGHT / 2)) * 0.18;
    hitSound.play();
  }

  if (ballX < 0) {
    aiScore++;
    scoreSound.play();
    resetBall(-1);
    renderLiveScores();
  } else if (ballX + BALL_SIZE > canvas.width) {
    playerScore++;
    scoreSound.play();
    resetBall(1);
    renderLiveScores();
  }

  if (!isOnline && gameMode === "ai") {
    let aiCenter = aiY + PADDLE_HEIGHT / 2;
    if (aiCenter < ballY + BALL_SIZE / 2 - 10) aiY += AI_SPEED;
    else if (aiCenter > ballY + BALL_SIZE / 2 + 10) aiY -= AI_SPEED;
    aiY = Math.max(0, Math.min(canvas.height - PADDLE_HEIGHT, aiY));
  }

  if (playerScore === 10 || aiScore === 10) {
    gameOver = true;
    setTimeout(showGameOverScreen, 300);
  }

  if (isOnline && isHost) {
    sendState();
  }
}

function resetBall(direction) {
  BALL_SIZE = theme.ballSize;
  ballX = canvas.width / 2 - BALL_SIZE / 2;
  ballY = canvas.height / 2 - BALL_SIZE / 2;
  ballVX = 0;
  ballVY = 0;
  pendingServeDirection = direction;
  waitingForServe = true;
  updateServeHint();
  if (isOnline && isHost) {
    sendState();
  }
}

function startServe() {
  if (gameOver || !waitingForServe) return;
  BALL_SIZE = theme.ballSize;
  ballVX = BALL_SPEED * pendingServeDirection;
  ballVY = BALL_SPEED * (Math.random() * 2 - 1) * 0.7;
  waitingForServe = false;
  paused = false;
  updateServeHint();
  if (isOnline && isHost) {
    sendState();
  }
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}
gameLoop();

function showGameOverScreen() {
  if (overlayShown) return;
  overlayShown = true;
  const overlay = document.createElement("div");
  overlay.style = `
    position:fixed;top:0;left:0;width:100vw;height:100vh;
    background:rgba(0,0,0,0.8);color:#fff;z-index:9999;
    display:flex;flex-direction:column;justify-content:center;align-items:center;
  `;

  const title = document.createElement("h2");
  title.style = "font-size:2rem;margin-bottom:1rem;";
  const button = document.createElement("button");
  button.style = `
    padding:0.75rem 1.5rem;font-size:1rem;cursor:pointer;
    border:none;border-radius:8px;background:#fff;color:#000;
  `;

  const winnerIsPlayer1 = playerScore === 10;
  const winnerName = winnerIsPlayer1 ? player1Name : player2Name;
  title.textContent = `Game Over: ${winnerName} wins`;

  const subtitle = document.createElement("p");
  subtitle.textContent = `${player1Name} ${playerScore} - ${aiScore} ${player2Name}`;
  subtitle.style = "margin:0 0 1rem 0;font-size:1rem;";

  renderLiveScores();
  recordWin(winnerName);

  if (gameMode === "ai" && winnerIsPlayer1) {
    button.textContent = `Play Level ${currentLevel + 1}`;
    button.onclick = () => {
      localStorage.setItem('pongLevel', currentLevel + 1);
      location.reload();
    };
  } else {
    button.textContent = "Rematch";
    button.onclick = () => location.reload();
  }

  overlay.appendChild(title);
  overlay.appendChild(subtitle);
  overlay.appendChild(button);
  document.body.appendChild(overlay);
}

function resetGameData() {
  localStorage.clear();
  overlayShown = false;
  location.reload();
}
