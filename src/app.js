const MAX_PLAYERS = 4;
const MIN_PLAYERS = 1;
const MAX_ROLLS = 3;
const STORAGE_KEY = "yachoo.settings.v1";
const PEER_IMPORT_URL = "https://esm.sh/peerjs@1.5.5?bundle";

const EMOJIS = ["😎", "🤡", "👻", "🤖", "🥸", "😈", "🤑", "💀", "🍤", "🪩"];
const SKINS = ["#ffcf56", "#ff6b6b", "#5fd0ff", "#74f48b", "#c084fc", "#ff8bd1", "#f97316", "#d9f99d"];
const VOICE_CLIPS = [
  { id: "voice_01", label: "야" },
  { id: "voice_02", label: "뭐하냐고" },
  { id: "voice_03", label: "되겠냐고" }
];

const CATEGORY_GROUPS = [
  {
    title: "Upper",
    categories: [
      { id: "ones", label: "Ones", hint: "1만 합산", scorer: dice => sumFace(dice, 1) },
      { id: "twos", label: "Twos", hint: "2만 합산", scorer: dice => sumFace(dice, 2) },
      { id: "threes", label: "Threes", hint: "3만 합산", scorer: dice => sumFace(dice, 3) },
      { id: "fours", label: "Fours", hint: "4만 합산", scorer: dice => sumFace(dice, 4) },
      { id: "fives", label: "Fives", hint: "5만 합산", scorer: dice => sumFace(dice, 5) },
      { id: "sixes", label: "Sixes", hint: "6만 합산", scorer: dice => sumFace(dice, 6) }
    ]
  },
  {
    title: "Lower",
    categories: [
      { id: "threeKind", label: "Three Kind", hint: "3개 이상 같은 눈", scorer: dice => hasCount(dice, 3) ? sum(dice) : 0 },
      { id: "fourKind", label: "Four Kind", hint: "4개 이상 같은 눈", scorer: dice => hasCount(dice, 4) ? sum(dice) : 0 },
      { id: "fullHouse", label: "Full House", hint: "25 고정", scorer: dice => isFullHouse(dice) ? 25 : 0 },
      { id: "smallStraight", label: "Small Straight", hint: "30 고정", scorer: dice => hasStraight(dice, 4) ? 30 : 0 },
      { id: "largeStraight", label: "Large Straight", hint: "40 고정", scorer: dice => hasStraight(dice, 5) ? 40 : 0 },
      { id: "chance", label: "Chance", hint: "전부 합산", scorer: dice => sum(dice) },
      { id: "yahtzee", label: "YAHTZEE", hint: "50 + 재달성 100", scorer: dice => isYahtzee(dice) ? 50 : 0 }
    ]
  }
];

const ALL_CATEGORIES = CATEGORY_GROUPS.flatMap(group => group.categories);
const UPPER_IDS = CATEGORY_GROUPS[0].categories.map(category => category.id);

const initialSettings = loadSettings();
const app = document.querySelector("#app");

let state = createInitialState(initialSettings);
let touchState = { dragging: false, originX: 0, originY: 0 };
let PeerCtor = null;
let network = {
  role: "local",
  peer: null,
  hostConn: null,
  connections: [],
  roomId: "",
  playerIndex: 0,
  status: "Local multiplayer"
};

render();

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      playerCount: clamp(Number(saved.playerCount) || 2, MIN_PLAYERS, MAX_PLAYERS),
      muted: Boolean(saved.muted),
      players: Array.from({ length: MAX_PLAYERS }, (_, index) => ({
        name: saved.players?.[index]?.name || `친구 ${index + 1}`,
        emoji: saved.players?.[index]?.emoji || EMOJIS[index],
        skin: saved.players?.[index]?.skin || SKINS[index]
      }))
    };
  } catch {
    return {
      playerCount: 2,
      muted: false,
      players: Array.from({ length: MAX_PLAYERS }, (_, index) => ({
        name: `친구 ${index + 1}`,
        emoji: EMOJIS[index],
        skin: SKINS[index]
      }))
    };
  }
}

function saveSettings() {
  const payload = {
    playerCount: state.playerCount,
    muted: state.muted,
    players: state.players.map(player => ({
      name: player.name,
      emoji: player.emoji,
      skin: player.skin
    }))
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function createInitialState(settings) {
  return {
    screen: "setup",
    playerCount: settings.playerCount,
    players: settings.players.map(createPlayer),
    currentPlayer: 0,
    dice: [1, 2, 3, 4, 5],
    held: [false, false, false, false, false],
    diceLayout: createDiceLayout(false),
    rollsLeft: MAX_ROLLS,
    round: 1,
    muted: settings.muted,
    message: "닉네임이랑 스킨 맞추고 시작.",
    animationTick: 0,
    characterMode: "idle",
    winner: null,
    confetti: []
  };
}

function createPlayer(player, index) {
  const seats = [
    { x: 50, y: 7 },
    { x: 50, y: 91 },
    { x: 24, y: 82 },
    { x: 76, y: 82 }
  ];
  return {
    id: `p${index + 1}`,
    name: player.name || `친구 ${index + 1}`,
    emoji: player.emoji || EMOJIS[index % EMOJIS.length],
    skin: player.skin || SKINS[index % SKINS.length],
    scores: {},
    yahtzeeBonus: 0,
    yahtzeeBaseScored: false,
    x: seats[index].x,
    y: seats[index].y
  };
}

function render() {
  const activePlayers = state.players.slice(0, state.playerCount);
  app.innerHTML = `
    <main class="portrait-shell ${state.screen === "game" ? "is-game" : ""}">
      <section class="cabinet">
        <header class="topbar">
          <div>
            <p class="eyebrow">YACHT DICE WITHOUT DIGNITY</p>
            <h1>Yachoo!</h1>
          </div>
          <button class="icon-button" data-action="toggle-mute" aria-label="sound">
            ${state.muted ? "🔇" : "🔊"}
          </button>
        </header>
        ${state.screen === "setup" ? renderSetup(activePlayers) : renderGame(activePlayers)}
      </section>
    </main>
  `;

  bindEvents();
}

function renderSetup(activePlayers) {
  return `
    <div class="setup-grid">
      <section class="intro-panel">
        <div class="sticker">B급 주사위 대환장</div>
        <p class="setup-copy">한 기기에서 최대 4명이 번갈아 플레이합니다. 닉네임과 스킨은 브라우저 캐시에 저장됩니다.</p>
        <label class="field-label" for="player-count">플레이어 수</label>
        <div class="segmented" id="player-count">
          ${[1, 2, 3, 4].map(count => `
            <button class="${state.playerCount === count ? "is-active" : ""}" data-action="set-count" data-count="${count}">
              ${count}P
            </button>
          `).join("")}
        </div>
      </section>

      <section class="customizer">
        ${activePlayers.map((player, index) => renderPlayerEditor(player, index)).join("")}
      </section>

      ${renderOnlinePanel()}

      <button class="start-button" data-action="start-game">
        <span>시작하기</span>
        <strong>🎲</strong>
      </button>
    </div>
  `;
}

function renderPlayerEditor(player, index) {
  return `
    <article class="player-editor" style="--skin:${player.skin}">
      <div class="player-editor-head">
        <div class="mini-avatar">${player.emoji}</div>
        <label>
          <span>P${index + 1}</span>
          <input data-action="rename" data-player="${index}" maxlength="12" value="${escapeHtml(player.name)}" />
        </label>
      </div>
      <div class="swatch-row" aria-label="emoji choices">
        ${EMOJIS.map(emoji => `
          <button class="emoji-choice ${player.emoji === emoji ? "is-active" : ""}" data-action="set-emoji" data-player="${index}" data-value="${emoji}">
            ${emoji}
          </button>
        `).join("")}
      </div>
      <div class="swatch-row" aria-label="skin choices">
        ${SKINS.map(color => `
          <button class="skin-choice ${player.skin === color ? "is-active" : ""}" style="--choice:${color}" data-action="set-skin" data-player="${index}" data-value="${color}"></button>
        `).join("")}
      </div>
    </article>
  `;
}

function renderGame(activePlayers) {
  const current = state.players[state.currentPlayer];
  const canAct = canCurrentDeviceAct();
  return `
    <div class="game-layout" style="--player-count:${activePlayers.length}">
      <section class="arena table-felt" aria-label="character arena">
        <div class="round-pill">Round ${state.round} / ${ALL_CATEGORIES.length}</div>
        <div class="game-help">${escapeHtml(state.message)}</div>
        ${activePlayers.map((player, index) => renderCharacter(player, index === state.currentPlayer)).join("")}
        <div class="dice-stage ${state.animationTick ? "is-rolling" : ""}">
          ${state.dice.map((value, index) => {
            const layout = state.diceLayout[index] || { x: 50, y: 50, rot: 0 };
            return `
              <button
                class="die ${state.held[index] ? "is-held" : ""}"
                style="--die-x:${layout.x}%;--die-y:${layout.y}%;--die-rot:${layout.rot}deg"
                data-action="toggle-hold"
                data-die="${index}"
                ${state.rollsLeft === MAX_ROLLS || !canAct ? "disabled" : ""}
                aria-label="die ${value}"
              >
                ${dieFace(value)}
              </button>
            `;
          }).join("")}
        </div>
        <div class="center-console">
          <button class="roll-button" data-action="roll" ${state.rollsLeft <= 0 || !canAct ? "disabled" : ""}>Roll Dice</button>
          <div class="roll-meta">
            <span>${escapeHtml(current.name)} turn</span>
            <span>${canAct ? `${state.rollsLeft} rolls left` : "wait for your turn"}</span>
          </div>
        </div>
        <div class="bottom-tools">
          <button class="multiplayer-button" data-action="restart">Multiplayer</button>
          <button class="change-player-button" data-action="celebrate">Change player...</button>
        </div>
      </section>

      ${renderScoreboard(activePlayers)}

      <section class="network-bar">
        <span>${escapeHtml(network.status)}</span>
        ${network.role !== "local" ? `<button data-action="disconnect-online">Disconnect</button>` : ""}
      </section>

      <section class="voice-pad">
        ${VOICE_CLIPS.map(clip => `
          <button data-action="voice" data-clip="${clip.id}">${clip.label}</button>
        `).join("")}
      </section>

      <div class="joystick" data-joystick>
        <div class="stick" data-stick></div>
      </div>
      <div class="action-stack">
        <button class="dance-button" data-action="dance">트월킹</button>
        <button class="dance-button" data-action="celebrate">세레모니</button>
      </div>
    </div>
    ${state.winner ? renderWinner() : ""}
  `;
}

function renderOnlinePanel() {
  return `
    <section class="online-panel">
      <div>
        <strong>Online multiplayer</strong>
        <span>${escapeHtml(network.status)}</span>
      </div>
      <div class="online-controls">
        <button data-action="host-online">방 만들기</button>
        <input id="room-code-input" maxlength="8" placeholder="ROOM CODE" value="${escapeHtml(network.roomId)}" />
        <button data-action="join-online">참가</button>
        ${network.role !== "local" ? `<button data-action="disconnect-online">해제</button>` : ""}
      </div>
      ${network.roomId ? `<p>친구에게 코드 <b>${escapeHtml(network.roomId)}</b> 를 보내세요.</p>` : ""}
    </section>
  `;
}

function renderCharacter(player, active) {
  return `
    <div
      class="character ${active ? "is-active" : ""} ${active ? state.characterMode : ""}"
      style="--x:${player.x}%;--y:${player.y}%;--skin:${player.skin}"
    >
      <div class="character-shadow"></div>
      <div class="character-body">
        <span>${player.emoji}</span>
      </div>
      <b>${escapeHtml(player.name)}</b>
    </div>
  `;
}

function renderScoreboard(players) {
  return `
    <section class="scoreboard" aria-label="score board">
      <table class="score-table">
        <thead>
          <tr>
            <th></th>
            ${players.map((player, index) => `
              <th class="${index === state.currentPlayer ? "is-current" : ""}">
                ${escapeHtml(shortName(player.name))}
              </th>
            `).join("")}
          </tr>
        </thead>
        <tbody>
          ${CATEGORY_GROUPS[0].categories.map(category => renderScoreTableRow(category, players)).join("")}
          ${renderMetaRow("Sum", players.map(upperSubtotal))}
          ${renderMetaRow("Bonus", players.map(upperBonus))}
          ${CATEGORY_GROUPS[1].categories.map(category => renderScoreTableRow(category, players)).join("")}
          ${renderMetaRow("TOTAL SCORE", players.map(totalScore), "total")}
        </tbody>
      </table>
    </section>
  `;
}

function renderScoreTableRow(category, players) {
  return `
    <tr>
      <td>${category.label}</td>
      ${players.map((player, index) => {
        const isCurrent = index === state.currentPlayer;
        const filled = Object.hasOwn(player.scores, category.id);
        const canScore = isCurrent && canCurrentDeviceAct() && !filled && state.rollsLeft !== MAX_ROLLS;
        const value = filled ? player.scores[category.id] : canScore ? previewScore(player, category) : "";
        return `
          <td class="${isCurrent ? "is-current" : ""} ${filled ? "is-filled" : ""}">
            ${canScore
              ? `<button class="score-cell-button" data-action="score" data-category="${category.id}">${value}</button>`
              : `<span>${value}</span>`
            }
          </td>
        `;
      }).join("")}
    </tr>
  `;
}

function renderMetaRow(label, values, className = "") {
  return `
    <tr class="${className}">
      <td>${label}</td>
      ${values.map(value => `<td><strong>${value}</strong></td>`).join("")}
    </tr>
  `;
}

function renderWinner() {
  const ranking = state.players
    .slice(0, state.playerCount)
    .map(player => ({ player, score: totalScore(player) }))
    .sort((a, b) => b.score - a.score);

  return `
    <div class="modal-backdrop">
      <div class="winner-modal">
        <canvas class="confetti-canvas" width="360" height="640" data-confetti></canvas>
        <p class="eyebrow">FINAL SCORE</p>
        <h2>${ranking[0].player.emoji} ${escapeHtml(ranking[0].player.name)} 승리</h2>
        <strong class="winner-score">${ranking[0].score}</strong>
        <div class="ranking">
          ${ranking.map((entry, index) => `
            <div>
              <span>${index + 1}. ${entry.player.emoji} ${escapeHtml(entry.player.name)}</span>
              <b>${entry.score}</b>
            </div>
          `).join("")}
        </div>
        <button class="start-button" data-action="restart">다시 하기</button>
      </div>
    </div>
  `;
}

function bindEvents() {
  app.querySelectorAll("[data-action]").forEach(element => {
    element.addEventListener("click", handleAction);
  });

  app.querySelectorAll('input[data-action="rename"]').forEach(input => {
    input.addEventListener("input", event => {
      const player = Number(event.currentTarget.dataset.player);
      state.players[player].name = event.currentTarget.value || `친구 ${player + 1}`;
      saveSettings();
    });
  });

  const joystick = app.querySelector("[data-joystick]");
  if (joystick) {
    joystick.addEventListener("pointerdown", startJoystick);
    joystick.addEventListener("pointermove", moveJoystick);
    joystick.addEventListener("pointerup", endJoystick);
    joystick.addEventListener("pointercancel", endJoystick);
  }

  const canvas = app.querySelector("[data-confetti]");
  if (canvas) {
    createConfetti(canvas);
  }
}

function handleAction(event) {
  const target = event.currentTarget;
  const action = target.dataset.action;
  const data = { ...target.dataset };

  if (action !== "toggle-hold") playSfx("button_click");

  if (shouldForwardAction(action)) {
    sendToHost({ type: "action", action, data });
    return;
  }

  runAction(action, data);

  if (shouldBroadcastAction(action)) {
    broadcastState();
  }
}

function runAction(action, data = {}) {
  if (action === "toggle-mute") {
    state.muted = !state.muted;
    saveSettings();
    render();
    return;
  }

  if (action === "set-count") {
    state.playerCount = Number(data.count);
    saveSettings();
    render();
    return;
  }

  if (action === "set-emoji") {
    state.players[Number(data.player)].emoji = data.value;
    saveSettings();
    render();
    return;
  }

  if (action === "set-skin") {
    state.players[Number(data.player)].skin = data.value;
    saveSettings();
    render();
    return;
  }

  if (action === "host-online") {
    hostOnlineGame();
    return;
  }

  if (action === "join-online") {
    const input = app.querySelector("#room-code-input");
    joinOnlineGame(input?.value || network.roomId);
    return;
  }

  if (action === "disconnect-online") {
    disconnectOnline();
    render();
    return;
  }

  if (action === "start-game") {
    startGame();
    return;
  }

  if (action === "roll") {
    rollDice();
    return;
  }

  if (action === "toggle-hold") {
    toggleHold(Number(data.die));
    return;
  }

  if (action === "score") {
    scoreCategory(data.category);
    return;
  }

  if (action === "dance") {
    setCharacterMode("twerk", "트월킹 발사. 품격은 두고 왔습니다.");
    return;
  }

  if (action === "celebrate") {
    setCharacterMode("celebrate", "세레모니 중. 상대 멘탈 흔들기.");
    return;
  }

  if (action === "voice") {
    playVoice(data.clip);
    return;
  }

  if (action === "focus-player") {
    return;
  }

  if (action === "restart") {
    restartGame();
  }
}

function shouldForwardAction(action) {
  const localOnly = new Set([
    "toggle-mute",
    "voice",
    "host-online",
    "join-online",
    "disconnect-online"
  ]);
  return network.role === "client" && network.hostConn?.open && !localOnly.has(action);
}

function canCurrentDeviceAct() {
  if (network.role === "client") {
    return network.playerIndex === state.currentPlayer;
  }
  return true;
}

function canConnectionAct(conn, action) {
  const guarded = new Set(["roll", "toggle-hold", "score", "dance", "celebrate"]);
  if (!guarded.has(action)) return true;
  return conn?.yachooPlayerIndex === state.currentPlayer;
}

function shouldBroadcastAction(action) {
  const localOnly = new Set([
    "toggle-mute",
    "voice",
    "host-online",
    "join-online",
    "disconnect-online"
  ]);
  return network.role === "host" && network.connections.length > 0 && !localOnly.has(action);
}

async function loadPeer() {
  if (PeerCtor) return PeerCtor;
  network.status = "Loading online multiplayer...";
  render();
  const module = await import(PEER_IMPORT_URL);
  PeerCtor = module.Peer || module.default;
  return PeerCtor;
}

async function hostOnlineGame() {
  try {
    disconnectOnline(false);
    const Peer = await loadPeer();
    const roomId = randomRoomCode();
    const peer = new Peer(`yachoo-${roomId}`, { debug: 0 });
    network = {
      role: "host",
      peer,
      hostConn: null,
      connections: [],
      roomId,
      playerIndex: 0,
      status: `Hosting room ${roomId}`
    };

    peer.on("open", () => {
      network.status = `Hosting room ${roomId}`;
      render();
    });
    peer.on("connection", setupHostConnection);
    peer.on("error", error => {
      network.status = `Online error: ${error.type || error.message}`;
      render();
    });
    render();
  } catch (error) {
    network.status = `Online failed: ${error.message}`;
    render();
  }
}

async function joinOnlineGame(roomCode) {
  const roomId = normalizeRoomCode(roomCode);
  if (!roomId) {
    network.status = "Enter a room code first";
    render();
    return;
  }

  try {
    disconnectOnline(false);
    const Peer = await loadPeer();
    const peer = new Peer(undefined, { debug: 0 });
    network = {
      role: "client",
      peer,
      hostConn: null,
      connections: [],
      roomId,
      playerIndex: 1,
      status: `Joining room ${roomId}...`
    };

    peer.on("open", () => {
      const conn = peer.connect(`yachoo-${roomId}`, { reliable: true, serialization: "json" });
      network.hostConn = conn;
      setupClientConnection(conn);
    });
    peer.on("error", error => {
      network.status = `Online error: ${error.type || error.message}`;
      render();
    });
    render();
  } catch (error) {
    network.status = `Online failed: ${error.message}`;
    render();
  }
}

function setupHostConnection(conn) {
  if (network.connections.length >= MAX_PLAYERS - 1) {
    conn.on("open", () => conn.send({ type: "full" }));
    return;
  }

  const playerIndex = Math.min(network.connections.length + 1, MAX_PLAYERS - 1);
  conn.yachooPlayerIndex = playerIndex;
  network.connections.push(conn);
  state.playerCount = Math.max(state.playerCount, playerIndex + 1);
  network.status = `Hosting room ${network.roomId} (${network.connections.length + 1}/${MAX_PLAYERS})`;

  conn.on("open", () => {
    conn.send({ type: "assign", playerIndex });
    sendState(conn);
  });
  conn.on("data", message => handlePeerMessage(message, conn));
  conn.on("close", () => {
    network.connections = network.connections.filter(item => item !== conn);
    network.status = `Hosting room ${network.roomId} (${network.connections.length + 1}/${MAX_PLAYERS})`;
    render();
  });
  render();
  broadcastState();
}

function setupClientConnection(conn) {
  conn.on("open", () => {
    network.status = `Connected to room ${network.roomId}`;
    conn.send({
      type: "join",
      profile: {
        name: state.players[0].name,
        emoji: state.players[0].emoji,
        skin: state.players[0].skin
      }
    });
    render();
  });
  conn.on("data", message => handlePeerMessage(message, conn));
  conn.on("close", () => {
    network.status = "Disconnected from online room";
    network.role = "local";
    render();
  });
}

function handlePeerMessage(message, conn) {
  if (!message || typeof message !== "object") return;

  if (message.type === "join" && network.role === "host") {
    const index = conn.yachooPlayerIndex;
    if (typeof index === "number" && message.profile) {
      state.players[index].name = message.profile.name || `친구 ${index + 1}`;
      state.players[index].emoji = message.profile.emoji || state.players[index].emoji;
      state.players[index].skin = message.profile.skin || state.players[index].skin;
      state.playerCount = Math.max(state.playerCount, index + 1);
      render();
      broadcastState();
    }
    return;
  }

  if (message.type === "assign" && network.role === "client") {
    network.playerIndex = message.playerIndex;
    network.status = `Connected as P${message.playerIndex + 1} in ${network.roomId}`;
    render();
    return;
  }

  if (message.type === "state" && network.role === "client") {
    receiveState(message.state);
    return;
  }

  if (message.type === "notice" && network.role === "client") {
    network.status = message.message || network.status;
    render();
    return;
  }

  if (message.type === "action" && network.role === "host") {
    if (!canConnectionAct(conn, message.action)) {
      conn?.send?.({
        type: "notice",
        message: `Not your turn. ${state.players[state.currentPlayer].name} is playing.`
      });
      sendState(conn);
      return;
    }
    runAction(message.action, message.data);
    broadcastState();
  }
}

function sendToHost(message) {
  if (!network.hostConn?.open) {
    network.status = "Host connection is not open";
    render();
    return;
  }
  network.hostConn.send(message);
}

function sendState(conn) {
  if (conn?.open) {
    conn.send({ type: "state", state: stripStateForNetwork(state) });
  }
}

function broadcastState() {
  if (network.role !== "host") return;
  const payload = { type: "state", state: stripStateForNetwork(state) };
  network.connections.forEach(conn => {
    if (conn.open) conn.send(payload);
  });
}

function receiveState(nextState) {
  if (!nextState) return;
  const muted = state.muted;
  state = { ...nextState, muted };
  network.status = `Connected as P${network.playerIndex + 1} in ${network.roomId}`;
  render();
}

function stripStateForNetwork(value) {
  return JSON.parse(JSON.stringify(value));
}

function disconnectOnline(shouldRender = true) {
  network.connections.forEach(conn => conn.close?.());
  network.hostConn?.close?.();
  network.peer?.destroy?.();
  network = {
    role: "local",
    peer: null,
    hostConn: null,
    connections: [],
    roomId: "",
    playerIndex: 0,
    status: "Local multiplayer"
  };
  if (shouldRender) render();
}

function randomRoomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

function normalizeRoomCode(value) {
  return String(value || "").trim().replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase();
}

function startGame() {
  state.players = state.players.map((player, index) => createPlayer(player, index));
  state.currentPlayer = 0;
  state.dice = randomDice();
  state.held = [false, false, false, false, false];
  state.diceLayout = createDiceLayout(false);
  state.rollsLeft = MAX_ROLLS;
  state.round = 1;
  state.screen = "game";
  state.winner = null;
  state.message = "빨간 버튼을 누르면 운명이 굴러갑니다.";
  state.characterMode = "idle";
  saveSettings();
  render();
}

function restartGame() {
  state.screen = "setup";
  state.winner = null;
  state.message = "다시 판 깔 준비.";
  render();
}

function rollDice() {
  if (state.rollsLeft <= 0 || state.winner) return;

  state.dice = state.dice.map((value, index) => state.held[index] ? value : rand(1, 6));
  state.diceLayout = state.diceLayout.map((layout, index) => state.held[index] ? layout : createDieLayout(index));
  state.rollsLeft -= 1;
  state.animationTick += 1;
  state.message = state.rollsLeft === 0 ? "이제 점수칸을 고르세요." : "킵할 주사위는 눌러서 붙잡기.";
  playSfx("dice_roll");
  setCharacterMode("celebrate", "굴러라 굴러.");
  render();
}

function toggleHold(index) {
  if (state.rollsLeft === MAX_ROLLS || state.winner) return;
  state.held[index] = !state.held[index];
  playSfx(state.held[index] ? "score_lock" : "button_click");
  state.message = state.held[index] ? "그 주사위 압수." : "다시 야생으로 방생.";
  render();
}

function scoreCategory(categoryId) {
  const player = state.players[state.currentPlayer];
  const category = ALL_CATEGORIES.find(item => item.id === categoryId);
  if (!category || Object.hasOwn(player.scores, categoryId) || state.rollsLeft === MAX_ROLLS) return;

  const rawScore = category.scorer(state.dice);
  player.scores[categoryId] = rawScore;

  if (categoryId === "yahtzee" && rawScore === 50) {
    player.yahtzeeBaseScored = true;
  }

  let bonusMessage = "";
  if (
    isYahtzee(state.dice) &&
    player.yahtzeeBaseScored &&
    categoryId !== "yahtzee" &&
    player.yahtzeeBonus < 100
  ) {
    player.yahtzeeBonus = 100;
    player.scores.yahtzee = (player.scores.yahtzee || 0) + 100;
    bonusMessage = " YAHTZEE 재달성 +100.";
  }

  playSfx(rawScore > 0 ? "score_lock" : "buzzer");
  state.message = `${category.label} ${rawScore}점 등록.${bonusMessage}`;

  if (isGameOver()) {
    finishGame();
  } else {
    nextTurn();
  }
}

function nextTurn() {
  const previousPlayer = state.currentPlayer;
  state.currentPlayer = (state.currentPlayer + 1) % state.playerCount;
  if (state.currentPlayer === 0 && previousPlayer === state.playerCount - 1) {
    state.round += 1;
  }
  state.dice = randomDice();
  state.held = [false, false, false, false, false];
  state.rollsLeft = MAX_ROLLS;
  state.characterMode = "idle";
  state.message = `${state.players[state.currentPlayer].name} 입장. 빨간 버튼 대기.`;
  render();
}

function finishGame() {
  const ranking = state.players
    .slice(0, state.playerCount)
    .map(player => ({ player, score: totalScore(player) }))
    .sort((a, b) => b.score - a.score);

  state.winner = ranking[0].player.id;
  state.message = `${ranking[0].player.name} 승리. 판 엎지 마세요.`;
  playSfx("confetti_pop");
  render();
}

function isGameOver() {
  return state.players
    .slice(0, state.playerCount)
    .every(player => ALL_CATEGORIES.every(category => Object.hasOwn(player.scores, category.id)));
}

function previewScore(player, category) {
  const score = category.scorer(state.dice);
  if (
    category.id !== "yahtzee" &&
    isYahtzee(state.dice) &&
    player.yahtzeeBaseScored &&
    player.yahtzeeBonus < 100
  ) {
    return `${score}+100`;
  }
  return score;
}

function upperSubtotal(player) {
  return UPPER_IDS.reduce((total, id) => total + (player.scores[id] || 0), 0);
}

function upperBonus(player) {
  return upperSubtotal(player) >= 63 ? 35 : 0;
}

function totalScore(player) {
  return ALL_CATEGORIES.reduce((total, category) => total + (player.scores[category.id] || 0), 0)
    + upperBonus(player);
}

function sumFace(dice, face) {
  return dice.filter(value => value === face).reduce((total, value) => total + value, 0);
}

function sum(dice) {
  return dice.reduce((total, value) => total + value, 0);
}

function counts(dice) {
  return dice.reduce((map, value) => {
    map[value] = (map[value] || 0) + 1;
    return map;
  }, {});
}

function hasCount(dice, needed) {
  return Object.values(counts(dice)).some(count => count >= needed);
}

function isFullHouse(dice) {
  const values = Object.values(counts(dice)).sort((a, b) => a - b);
  return values.length === 2 && values[0] === 2 && values[1] === 3;
}

function hasStraight(dice, length) {
  const unique = [...new Set(dice)].sort((a, b) => a - b);
  const runs = [
    [1, 2, 3, 4],
    [2, 3, 4, 5],
    [3, 4, 5, 6],
    [1, 2, 3, 4, 5],
    [2, 3, 4, 5, 6]
  ];
  return runs.some(run => run.length === length && run.every(value => unique.includes(value)));
}

function isYahtzee(dice) {
  return dice.every(value => value === dice[0]);
}

function randomDice() {
  return Array.from({ length: 5 }, () => rand(1, 6));
}

function createDiceLayout(scattered) {
  if (scattered) {
    return Array.from({ length: 5 }, (_, index) => createDieLayout(index));
  }
  return [18, 34, 50, 66, 82].map((x, index) => ({
    x,
    y: 78,
    rot: [-8, 5, 0, -5, 8][index]
  }));
}

function createDieLayout(index) {
  const slots = [
    { x: 13, y: 55 },
    { x: 31, y: 32 },
    { x: 54, y: 72 },
    { x: 69, y: 42 },
    { x: 84, y: 58 }
  ];
  const slot = slots[index % slots.length];
  return {
    x: clamp(slot.x + rand(-7, 7), 8, 92),
    y: clamp(slot.y + rand(-10, 10), 18, 78),
    rot: rand(-28, 28)
  };
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function dieFace(value) {
  const positions = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9]
  };
  return Array.from({ length: 9 }, (_, index) => {
    const spot = index + 1;
    return `<span class="pip ${positions[value].includes(spot) ? "is-on" : ""}"></span>`;
  }).join("");
}

function shortName(name) {
  return name.length > 6 ? `${name.slice(0, 5)}...` : name;
}

function setCharacterMode(mode, message) {
  state.characterMode = mode;
  state.message = message;
  window.clearTimeout(setCharacterMode.timer);
  setCharacterMode.timer = window.setTimeout(() => {
    state.characterMode = "idle";
    render();
    broadcastState();
  }, 900);
}

function startJoystick(event) {
  const joystick = event.currentTarget;
  const rect = joystick.getBoundingClientRect();
  touchState = {
    dragging: true,
    originX: rect.left + rect.width / 2,
    originY: rect.top + rect.height / 2
  };
  joystick.setPointerCapture(event.pointerId);
  moveJoystick(event);
}

function moveJoystick(event) {
  if (!touchState.dragging) return;
  const maxDistance = 34;
  const dx = clamp(event.clientX - touchState.originX, -maxDistance, maxDistance);
  const dy = clamp(event.clientY - touchState.originY, -maxDistance, maxDistance);
  const stick = app.querySelector("[data-stick]");
  if (stick) stick.style.transform = `translate(${dx}px, ${dy}px)`;

  const player = state.players[state.currentPlayer];
  player.x = clamp(player.x + dx * 0.045, 8, 92);
  player.y = clamp(player.y + dy * 0.045, 16, 86);
  const character = app.querySelector(".character.is-active");
  if (character) {
    character.style.setProperty("--x", `${player.x}%`);
    character.style.setProperty("--y", `${player.y}%`);
  }
}

function endJoystick(event) {
  touchState.dragging = false;
  const stick = app.querySelector("[data-stick]");
  if (stick) stick.style.transform = "translate(0, 0)";
  try {
    event.currentTarget.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer may already be released by the browser.
  }
}

function playSfx(name) {
  if (state.muted) return;
  const audio = new Audio(`./assets/sfx/${name}.wav`);
  audio.volume = name === "dice_roll" ? 0.5 : 0.36;
  audio.play().catch(() => {});
}

function playVoice(id) {
  if (state.muted) return;
  const wav = new Audio(`./assets/sfx/${id}.wav`);
  wav.volume = 0.7;
  wav.play().catch(() => {
    const mp3 = new Audio(`./assets/sfx/${id}.mp3`);
    mp3.volume = 0.7;
    mp3.play().catch(() => {});
  });
}

function createConfetti(canvas) {
  const ctx = canvas.getContext("2d");
  const pieces = Array.from({ length: 110 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * canvas.height * 0.5,
    vx: -1.8 + Math.random() * 3.6,
    vy: 1.8 + Math.random() * 4.6,
    size: 4 + Math.random() * 9,
    rotation: Math.random() * Math.PI,
    spin: -0.18 + Math.random() * 0.36,
    color: SKINS[Math.floor(Math.random() * SKINS.length)]
  }));
  let frame = 0;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(piece => {
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.vy += 0.025;
      piece.rotation += piece.spin;
      if (piece.y > canvas.height + 20) {
        piece.y = -20;
        piece.x = Math.random() * canvas.width;
      }
      ctx.save();
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.rotation);
      ctx.fillStyle = piece.color;
      ctx.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.55);
      ctx.restore();
    });
    frame += 1;
    if (frame < 520) requestAnimationFrame(draw);
  }

  draw();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
