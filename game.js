// Theme setup
const themes = {
  classic: { bg: "#000", ballSize: 14, ballShape: "square", paddleColor: "#fff", border: "#0ff" },
  neon:    { bg: "#111", ballSize: 18, ballShape: "circle", paddleColor: "#0ff", border: "#f0f" },
  retro:   { bg: "#241c1c", ballSize: 12, ballShape: "square", paddleColor: "#fa0", border: "#fff700" },
  ocean:   { bg: "#0a2233", ballSize: 16, ballShape: "circle", paddleColor: "#00e0ff", border: "#00ffee" },
  lava:    { bg: "#2e0000", ballSize: 20, ballShape: "circle", paddleColor: "#ff4500", border: "#ff0000" }
};

// Mode selection
let gameMode = localStorage.getItem("pongMode");
if (!gameMode) {
  gameMode = prompt("Choose mode:\n1 = Play vs AI\n2 = Multiplayer (2 players)").trim() === "2" ? "multiplayer" : "ai";
  localStorage.setItem("pongMode", gameMode);
}

const selectedThemeKey = localStorage.getItem("pongTheme") || "classic";
let currentThemeKey = selectedThemeKey;
let theme = themes[currentThemeKey];

// Ask for player name and store it once
let playerName = localStorage.getItem('pongUsername');
if (!playerName) {
  playerName = prompt("Enter your name:");
  if (playerName) {
    localStorage.setItem('pongUsername', playerName);
  } else {
    playerName = "Player";
  }
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

const hitSound = document.getElementById("hitSound");
const scoreSound = document.getElementById("scoreSound");

let keys = {};
document.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "Space") {
    paused = !paused;
    if (!paused && !gameOver) {
      requestAnimationFrame(gameLoop);
    }
  }
});

document.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

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

  // Handle paddle movement
  if (keys["KeyW"]) playerY -= 6;
  if (keys["KeyS"]) playerY += 6;
  playerY = Math.max(0, Math.min(canvas.height - PADDLE_HEIGHT, playerY));

  if (gameMode === "multiplayer") {
    if (keys["ArrowUp"]) aiY -= 6;
    if (keys["ArrowDown"]) aiY += 6;
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
  } else if (ballX + BALL_SIZE > canvas.width) {
    playerScore++;
    scoreSound.play();
    resetBall(1);
  }

  if (gameMode === "ai") {
    let aiCenter = aiY + PADDLE_HEIGHT / 2;
    if (aiCenter < ballY + BALL_SIZE / 2 - 10) aiY += AI_SPEED;
    else if (aiCenter > ballY + BALL_SIZE / 2 + 10) aiY -= AI_SPEED;
    aiY = Math.max(0, Math.min(canvas.height - PADDLE_HEIGHT, aiY));
  }

  if (playerScore === 10 || aiScore === 10) {
    gameOver = true;
    setTimeout(showGameOverScreen, 300);
  }
}

function resetBall(direction) {
  BALL_SIZE = theme.ballSize;
  ballX = canvas.width / 2 - BALL_SIZE / 2;
  ballY = canvas.height / 2 - BALL_SIZE / 2;
  ballVX = BALL_SPEED * direction;
  ballVY = BALL_SPEED * (Math.random() * 2 - 1) * 0.7;
}

function gameLoop() {
  if (!gameOver && !paused) {
    update();
    draw();
    requestAnimationFrame(gameLoop);
  }
}
gameLoop();

function showGameOverScreen() {
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

  if (playerScore === 10) {
    title.textContent = `🎉 You won, ${playerName}!`;
    button.textContent = `Play Level ${currentLevel + 1}`;
    button.onclick = () => {
      localStorage.setItem('pongLevel', currentLevel + 1);
      location.reload();
    };
  } else {
    title.textContent = `😢 You lost to AI`;
    button.textContent = "Replay";
    button.onclick = () => location.reload();
  }

  overlay.appendChild(title);
  overlay.appendChild(button);
  document.body.appendChild(overlay);
}

function resetGameData() {
  localStorage.clear();
  location.reload();
}
