const MAX_PLAYERS = 4;
const MIN_PLAYERS = 1;
const MAX_ROLLS = 3;
const STORAGE_KEY = "yachoo.settings.v1";
const PEER_IMPORT_URL = "https://esm.sh/peerjs@1.5.5?bundle";
const RELAY_URL = "wss://49.50.129.67.nip.io:8080";
const DEFAULT_ROOM_CODE = "1234";
const DEFAULT_SKIN = "#d18a4d";
const DATA_CONNECTION_TIMEOUT_MS = 20000;
const JOIN_RETRY_LIMIT = 2;
const ROOM_NAMESPACE = "yachoo-room-v4";
const PEER_OPTIONS = {
  host: "0.peerjs.com",
  port: 443,
  path: "/",
  secure: true,
  debug: 0,
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      {
        urls: [
          "turn:openrelay.metered.ca:80",
          "turn:openrelay.metered.ca:443",
          "turn:openrelay.metered.ca:443?transport=tcp",
          "turns:openrelay.metered.ca:443",
          "turns:openrelay.metered.ca:443?transport=tcp"
        ],
        username: "openrelayproject",
        credential: "openrelayproject"
      }
    ],
    iceTransportPolicy: "all"
  }
};

const AVATAR_PRESETS = [
  { id: "felix", seed: "Felix" },
  { id: "aneka", seed: "Aneka" },
  { id: "milo", seed: "Milo" },
  { id: "luna", seed: "Luna" },
  { id: "sophie", seed: "Sophie" },
  { id: "dusty", seed: "Dusty" },
  { id: "buster", seed: "Buster" },
  { id: "pepper", seed: "Pepper" },
  { id: "mimi", seed: "Mimi" },
  { id: "bandit", seed: "Bandit" }
];
const SKINS = ["#ffcf56", "#ff6b6b", "#5fd0ff", "#74f48b", "#c084fc", "#ff8bd1", "#f97316", "#d9f99d"];
const VOICE_CLIPS = [
  { id: "voice_01", label: "야" },
  { id: "voice_02", label: "아니" },
  { id: "voice_03", label: "되겠냐고" },
  { id: "voice_04", label: "잠시만" },
  { id: "voice_05", label: "채수민놀리기" }
];
const VOICE_GAINS = {
  voice_03: 1.4,
  voice_04: 1.4
};
const TURN_ACTIONS = new Set(["roll", "toggle-hold", "score", "use-boast", "use-breaker", "use-comeback"]);

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
const GAME_MODES = {
  normal: "일반전",
  items: "아이템전"
};

const initialSettings = loadSettings();
const app = document.querySelector("#app");

let state = createInitialState(initialSettings);
let touchState = {
  dragging: false,
  originX: 0,
  originY: 0,
  knobX: 0,
  knobY: 0,
  axisX: 0,
  axisY: 0,
  rafId: 0,
  lastFrameAt: 0,
  lastSyncAt: 0
};
let PeerCtor = null;
let voiceAudioContext = null;
let network = {
  role: "local",
  transport: "none",
  socket: null,
  peer: null,
  hostConn: null,
  connections: [],
  pendingPlayerIndexes: new Set(),
  roomId: "",
  playerIndex: 0,
  status: "Local play",
  busy: false
};

render();

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      playerCount: 1,
      muted: Boolean(saved.muted),
      players: Array.from({ length: MAX_PLAYERS }, (_, index) => ({
        name: saved.players?.[index]?.name || `친구 ${index + 1}`,
        avatarId: saved.players?.[index]?.avatarId || AVATAR_PRESETS[index % AVATAR_PRESETS.length].id,
        emoji: saved.players?.[index]?.emoji || "",
        skin: saved.players?.[index]?.skin || DEFAULT_SKIN
      }))
    };
  } catch {
    return {
      playerCount: 1,
      muted: false,
      players: Array.from({ length: MAX_PLAYERS }, (_, index) => ({
        name: `친구 ${index + 1}`,
        avatarId: AVATAR_PRESETS[index % AVATAR_PRESETS.length].id,
        emoji: "",
        skin: DEFAULT_SKIN
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
      avatarId: player.avatarId,
      emoji: player.emoji,
      skin: player.skin
    }))
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function createInitialState(settings) {
  return {
    screen: "setup",
    gameMode: "normal",
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
    diceRolling: false,
    characterMode: "idle",
    characterModePlayerIndex: null,
    itemEffects: createEmptyItemEffects(),
    itemPrompt: null,
    toast: "",
    winner: null,
    forfeit: null,
    rematchVotes: [],
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
    avatarId: player.avatarId || AVATAR_PRESETS[index % AVATAR_PRESETS.length].id,
    emoji: player.emoji || "",
    skin: player.skin || SKINS[index % SKINS.length],
    scores: {},
    yahtzeeBonus: 0,
    yahtzeeBaseScored: false,
    items: createPlayerItems(player.items),
    x: seats[index].x,
    y: seats[index].y
  };
}

function createPlayerItems(items = {}) {
  return {
    boastUsed: Boolean(items.boastUsed),
    breakerUsed: Boolean(items.breakerUsed),
    comebackUnlocked: Boolean(items.comebackUnlocked),
    comebackUsed: Boolean(items.comebackUsed)
  };
}

function createEmptyItemEffects() {
  return {
    boast: null,
    breaker: null,
    comeback: null
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
        ${state.screen === "setup" ? renderSetup() : renderGame(activePlayers)}
      </section>
      ${state.toast ? renderToast() : ""}
      ${network.busy ? renderNetworkLoading() : ""}
    </main>
  `;

  bindEvents();
}

function renderAvatar(player, className) {
  const preset = getAvatarPreset(player.avatarId);
  return `<img class="${className}" src="${avatarUrl(preset)}" alt="" loading="lazy" draggable="false" />`;
}

function getAvatarPreset(id) {
  return AVATAR_PRESETS.find(preset => preset.id === id) || AVATAR_PRESETS[0];
}

function avatarUrl(preset) {
  const seed = encodeURIComponent(preset.seed);
  return `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=transparent&radius=0`;
}

function renderNetworkLoading() {
  return `
    <div class="network-loading" role="alert" aria-live="assertive">
      <div class="loading-card">
        <div class="loading-ring" aria-hidden="true"></div>
        <strong>${escapeHtml(network.status || "연결 중...")}</strong>
      </div>
    </div>
  `;
}

function renderToast() {
  return `<div class="toast-message" role="status">${escapeHtml(state.toast)}</div>`;
}

function renderSetup() {
  const inRoom = network.role !== "local";
  const canStart = network.role === "host";
  return `
    <div class="setup-grid ${inRoom ? "is-room-lobby" : "is-entry"}">
      ${inRoom ? `
        <section class="intro-panel">
          <div class="sticker">채부오야추</div>
          <p class="setup-copy">빈 자리에 친구가 들어오면 자동으로 표시됩니다. 호스트가 시작할 수 있습니다.</p>
        </section>
      ` : ""}

      <section class="customizer">
        ${inRoom
          ? state.players.map((player, index) => renderPlayerEditor(player, index, index < state.playerCount)).join("")
          : renderPlayerEditor(state.players[0], 0, true)
        }
      </section>

      ${renderModePanel()}

      ${renderOnlinePanel()}

      ${canStart ? `
        <button class="start-button" data-action="start-game">
          <span>시작하기</span>
          <strong>🎲</strong>
        </button>
      ` : ""}
    </div>
  `;
}

function renderModePanel() {
  const canChange = network.role !== "client";
  return `
    <section class="mode-panel">
      <button class="${state.gameMode === "normal" ? "is-active" : ""}" data-action="set-mode" data-mode="normal" ${canChange ? "" : "disabled"}>
        일반전
      </button>
      <button class="${state.gameMode === "items" ? "is-active" : ""}" data-action="set-mode" data-mode="items" ${canChange ? "" : "disabled"}>
        아이템전
      </button>
    </section>
  `;
}

function renderPlayerEditor(player, index, occupied) {
  const editable = occupied && canEditPlayer(index);
  const nameValue = occupied ? player.name : "빈 자리";
  return `
    <article class="player-editor ${occupied ? "" : "is-empty"} ${editable ? "" : "is-locked"}" style="--skin:${player.skin}">
      <div class="player-editor-head">
        <div class="mini-avatar">${occupied ? renderAvatar(player, "avatar-thumb") : ""}</div>
        <label>
          <span>P${index + 1}</span>
          <input data-action="rename" data-player="${index}" maxlength="12" value="${escapeHtml(nameValue)}" ${editable ? "" : "disabled"} />
        </label>
      </div>
      ${occupied ? `
        <div class="avatar-preset-row" aria-label="avatar choices">
          ${AVATAR_PRESETS.map(preset => `
            <button class="avatar-choice ${player.avatarId === preset.id ? "is-active" : ""}" data-action="set-avatar" data-player="${index}" data-value="${preset.id}" ${editable ? "" : "disabled"}>
              ${renderAvatar({ avatarId: preset.id }, "avatar-choice-img")}
            </button>
          `).join("")}
        </div>
      ` : `<div class="empty-slot-copy">입장 대기 중</div>`}
    </article>
  `;
}

function renderGame(activePlayers) {
  const current = state.players[state.currentPlayer];
  const canAct = canCurrentDeviceAct();
  const itemTargeting = Boolean(state.itemPrompt && canAct);
  return `
    <div class="game-layout ${state.gameMode === "items" ? "is-items" : ""} ${itemTargeting ? "is-item-targeting" : ""}" style="--player-count:${activePlayers.length}">
      <section class="arena table-felt" aria-label="character arena">
        <div class="round-pill">Round ${state.round} / ${ALL_CATEGORIES.length}</div>
        <div class="game-help">${escapeHtml(state.message)}</div>
        ${activePlayers.map((player, index) => renderCharacter(player, index)).join("")}
        <div class="dice-board ${state.diceRolling ? "is-rolling" : ""}" aria-label="dice board">
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
          <div class="keep-tray" aria-label="kept dice tray">
            <span>KEEP</span>
          </div>
        </div>
        <div class="center-console">
          <button class="roll-button" data-action="roll" ${state.rollsLeft <= 0 || !canAct ? "disabled" : ""}>Roll Dice</button>
          <div class="roll-meta">
            <span>${escapeHtml(current.name)} turn</span>
            <span>${canAct ? `${state.rollsLeft} rolls left` : "wait for your turn"}</span>
          </div>
        </div>
      </section>

      ${renderScoreboard(activePlayers)}
      ${itemTargeting ? renderItemTargetOverlay() : ""}

      <section class="network-bar">
        <span>${escapeHtml(network.status)}</span>
        ${network.role !== "local" ? `<button data-action="disconnect-online">Disconnect</button>` : ""}
      </section>

      <section class="right-action-pad">
        ${renderItemPanel(activePlayers)}
        <div class="voice-pad">
        <button class="special-pad-button twerk-pad-button" data-action="dance">트월킹</button>
        <button class="special-pad-button balls-pad-button" data-action="balls">고환</button>
        ${VOICE_CLIPS.map(clip => `
          <button data-action="voice" data-clip="${clip.id}">${clip.label}</button>
        `).join("")}
        </div>
      </section>

      <div class="joystick" data-joystick>
        <div class="stick" data-stick></div>
      </div>
    </div>
    ${state.winner ? renderWinner() : ""}
  `;
}

function renderItemPanel(activePlayers) {
  if (state.gameMode !== "items" || state.winner) return "";
  const current = state.players[state.currentPlayer];
  const items = current.items || createPlayerItems();
  const canAct = canCurrentDeviceAct();
  const beforeRoll = state.rollsLeft === MAX_ROLLS;
  const opponents = activePlayers
    .map((player, index) => ({ player, index }))
    .filter(entry => entry.index !== state.currentPlayer);
  const availableCategories = ALL_CATEGORIES.filter(category => !Object.hasOwn(current.scores, category.id));
  const boastReady = canAct && beforeRoll && !items.boastUsed && availableCategories.length > 0;
  const breakerReady = canAct && beforeRoll && !items.breakerUsed && hasFiveRoundsRemaining() && opponents.length > 0;
  const comebackReady = canAct && canUseComeback(current);

  return `
    <section class="item-panel">
      <button data-action="prepare-item" data-item="boast" ${boastReady ? "" : "disabled"}>호언장담</button>
      <button data-action="prepare-item" data-item="breaker" ${breakerReady ? "" : "disabled"}>족보 브레이커</button>
      <button data-action="use-comeback" ${comebackReady ? "" : "disabled"}>역전의 기회</button>
    </section>
  `;
}

function renderItemTargetOverlay() {
  const prompt = state.itemPrompt;
  const message = prompt?.type === "boast"
    ? "호언장담을 사용할 내 점수 칸을 선택하세요."
    : "족보 브레이커로 막을 상대 점수 칸을 선택하세요.";
  return `
    <div class="item-target-dim" aria-hidden="true"></div>
    <div class="item-target-banner">
      <span>${message}</span>
      <button data-action="cancel-item">취소</button>
    </div>
  `;
}

function renderOnlinePanel() {
  const inRoom = network.role !== "local";
  return `
    <section class="online-panel ${inRoom ? "" : "is-entry-panel"}">
      ${inRoom ? `
        <div>
          <strong>Online room</strong>
          <span>${escapeHtml(network.status)}</span>
        </div>
      ` : ""}
      <div class="online-controls">
        <input id="room-code-input" maxlength="8" placeholder="${DEFAULT_ROOM_CODE}" value="${escapeHtml(inRoom ? network.roomId : DEFAULT_ROOM_CODE)}" ${inRoom ? "disabled" : ""} />
        ${inRoom ? "" : `<button data-action="enter-online">입장</button>`}
        ${inRoom ? `<button data-action="disconnect-online">해제</button>` : ""}
      </div>
      ${network.roomId ? `<p>친구에게 코드 <b>${escapeHtml(network.roomId)}</b> 를 보내세요.</p>` : ""}
    </section>
  `;
}

function renderCharacter(player, index) {
  const active = index === state.currentPlayer;
  const modeActive = index === state.characterModePlayerIndex;
  return `
    <div
      class="character ${active ? "is-active" : ""} ${modeActive ? state.characterMode : ""}"
      data-character-index="${index}"
      style="--x:${player.x}%;--y:${player.y}%;--skin:${player.skin}"
    >
      <div class="character-shadow"></div>
      <div class="character-body">
        <div class="character-head">${renderAvatar(player, "character-avatar-img")}</div>
        <div class="character-torso"></div>
        <div class="character-hips"></div>
        <div class="character-balls" aria-hidden="true"><span></span><span></span></div>
        <div class="character-legs">
          <span></span>
          <span></span>
        </div>
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
  const prompt = canCurrentDeviceAct() ? state.itemPrompt : null;
  return `
    <tr>
      <td>${category.label}</td>
      ${players.map((player, index) => {
        const isCurrent = index === state.currentPlayer;
        const filled = Object.hasOwn(player.scores, category.id);
        const blocked = isCategoryBlocked(index, category.id);
        const canBoastTarget = prompt?.type === "boast" && isCurrent && !filled;
        const canBreakerTarget = prompt?.type === "breaker" && !isCurrent && !filled;
        const itemAction = canBoastTarget ? "use-boast" : canBreakerTarget ? "use-breaker" : "";
        const itemTarget = Boolean(itemAction);
        const canScore = isCurrent && canCurrentDeviceAct() && !filled && !blocked && state.rollsLeft !== MAX_ROLLS;
        const value = filled ? player.scores[category.id] : canScore ? previewScore(player, category) : "";
        return `
          <td class="${isCurrent ? "is-current" : ""} ${filled ? "is-filled" : ""} ${blocked ? "is-blocked" : ""} ${itemTarget ? "is-item-target" : ""}">
            ${itemTarget
              ? `<button class="score-cell-button item-target-button" data-action="${itemAction}" data-category="${category.id}" data-target-player="${index}">선택</button>`
              : canScore
              ? `<button class="score-cell-button" data-action="score" data-category="${category.id}">${value}</button>`
              : `<span>${blocked && !filled ? "막힘" : value}</span>`
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
    .sort((a, b) => {
      if (state.winner && a.player.id === state.winner) return -1;
      if (state.winner && b.player.id === state.winner) return 1;
      return b.score - a.score;
    });
  const title = state.forfeit
    ? `${escapeHtml(ranking[0].player.name)} 기권승`
    : `${escapeHtml(ranking[0].player.name)} 승리`;
  const onlineRematch = network.role !== "local";
  const rematchVotes = state.rematchVotes || [];
  const rematchRequested = onlineRematch && rematchVotes.includes(network.playerIndex);
  const rematchLabel = network.role === "local" ? "다시 준비" : rematchRequested ? "신청 완료" : "재대결 신청";

  return `
    <div class="modal-backdrop">
      <div class="winner-modal">
        <canvas class="confetti-canvas" width="360" height="640" data-confetti></canvas>
        <p class="eyebrow">FINAL SCORE</p>
        <h2>${title}</h2>
        ${state.forfeit ? `<p class="forfeit-copy">${escapeHtml(state.forfeit.reason)}</p>` : ""}
        <strong class="winner-score">${ranking[0].score}</strong>
        <div class="ranking">
          ${ranking.map((entry, index) => `
            <div>
              <span>${index + 1}. ${renderAvatar(entry.player, "ranking-avatar")} ${escapeHtml(entry.player.name)}</span>
              <b>${entry.score}</b>
            </div>
          `).join("")}
        </div>
        ${onlineRematch ? `<p class="rematch-status">재대결 신청 ${rematchVotes.length}/${state.playerCount}</p>` : ""}
        <button class="start-button" data-action="${network.role === 'local' ? 'restart' : 'rematch'}" ${rematchRequested ? "disabled" : ""}>
          ${rematchLabel}
        </button>
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
      if (!canEditPlayer(player)) return;
      state.players[player].name = event.currentTarget.value || `친구 ${player + 1}`;
      saveSettings();
      syncProfileChange(player);
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
  data.actorPlayerIndex = network.role === "local" ? state.currentPlayer : network.playerIndex;
  if (action === "use-boast") {
    data.category = data.category || app.querySelector('[data-item-select="boast-category"]')?.value || "";
  }
  if (action === "use-breaker") {
    data.targetPlayer = data.targetPlayer || app.querySelector('[data-item-select="breaker-player"]')?.value || "";
    data.category = data.category || app.querySelector('[data-item-select="breaker-category"]')?.value || "";
  }

  if (TURN_ACTIONS.has(action) && !canCurrentDeviceAct()) {
    render();
    return;
  }

  if (action !== "toggle-hold") playSfx("button_click");

  if (shouldForwardAction(action)) {
    sendToHost({ type: "action", action, data });
    return;
  }

  runAction(action, data);

  if (shouldBroadcastAction(action)) {
    if (isActionBroadcast(action)) {
      broadcastAction(action, data);
    } else {
      broadcastState();
    }
  }
}

function runAction(action, data = {}) {
  if (action === "toggle-mute") {
    state.muted = !state.muted;
    saveSettings();
    render();
    return;
  }

  if (action === "set-mode") {
    if (network.role === "client") return;
    state.gameMode = data.mode === "items" ? "items" : "normal";
    state.itemEffects = createEmptyItemEffects();
    state.itemPrompt = null;
    state.toast = "";
    state.players.forEach(player => {
      player.items = createPlayerItems();
    });
    state.message = `${GAME_MODES[state.gameMode]}으로 설정했습니다.`;
    render();
    broadcastState();
    return;
  }

  if (action === "set-avatar") {
    const player = Number(data.player);
    if (!canEditPlayer(player)) return;
    state.players[player].avatarId = data.value;
    saveSettings();
    syncProfileChange(player);
    render();
    return;
  }

  if (action === "enter-online") {
    const input = app.querySelector("#room-code-input");
    enterOnlineRoom(input?.value || network.roomId);
    return;
  }

  if (action === "disconnect-online") {
    disconnectOnline();
    render();
    return;
  }

  if (action === "start-game") {
    if (network.role === "client") return;
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

  if (action === "prepare-item") {
    prepareItem(data.item);
    return;
  }

  if (action === "cancel-item") {
    state.itemPrompt = null;
    render();
    return;
  }

  if (action === "score") {
    scoreCategory(data.category);
    return;
  }

  if (action === "use-boast") {
    useBoast(data);
    return;
  }

  if (action === "use-breaker") {
    useBreaker(data);
    return;
  }

  if (action === "use-comeback") {
    useComeback();
    return;
  }

  if (action === "dance") {
    const playerIndex = actionPlayerIndex(data);
    setCharacterMode("twerk", `${state.players[playerIndex].name} 님이 트월킹 중입니다.`, playerIndex);
    return;
  }

  if (action === "balls") {
    const playerIndex = actionPlayerIndex(data);
    setCharacterMode("balls", `${state.players[playerIndex].name} 님이 고환 동작을 했습니다.`, playerIndex);
    return;
  }

  if (action === "celebrate") {
    const playerIndex = actionPlayerIndex(data);
    setCharacterMode("celebrate", `${state.players[playerIndex].name} 님 차례입니다.`, playerIndex);
    return;
  }

  if (action === "move-player") {
    movePlayerFromNetwork(data);
    return;
  }

  if (action === "voice") {
    playVoice(data.clip);
    return;
  }

  if (action === "focus-player") {
    return;
  }

  if (action === "rematch") {
    requestRematch(data);
    return;
  }

  if (action === "restart") {
    restartGame();
  }
}

function shouldForwardAction(action) {
  const localOnly = new Set([
    "toggle-mute",
    "set-mode",
    "prepare-item",
    "cancel-item",
    "set-avatar",
    "enter-online",
    "disconnect-online"
  ]);
  return network.role === "client" && !localOnly.has(action) && (
    network.hostConn?.open || network.socket?.readyState === WebSocket.OPEN
  );
}

function canCurrentDeviceAct() {
  if (network.role === "host" || network.role === "client") {
    return network.playerIndex === state.currentPlayer;
  }
  return true;
}

function canEditPlayer(index) {
  if (network.role === "local") return index === 0;
  return index === network.playerIndex;
}

function localPlayerIndex() {
  if (network.role === "host" || network.role === "client") return network.playerIndex;
  return state.currentPlayer;
}

function actionPlayerIndex(data = {}) {
  const raw = Number(data.actorPlayerIndex);
  if (Number.isFinite(raw)) return clamp(raw, 0, Math.max(0, state.playerCount - 1));
  return localPlayerIndex();
}

function canConnectionAct(conn, action) {
  if (action === "start-game") return conn?.yachooPlayerIndex === 0;
  if (!TURN_ACTIONS.has(action)) return true;
  return conn?.yachooPlayerIndex === state.currentPlayer;
}

function canPlayerIndexAct(playerIndex, action) {
  if (action === "start-game") return playerIndex === 0;
  if (!TURN_ACTIONS.has(action)) return true;
  return playerIndex === state.currentPlayer;
}

function canUseItemsNow() {
  return state.gameMode === "items" && !state.winner && state.players[state.currentPlayer];
}

function canUseComeback(player) {
  if (!canUseItemsNow() || state.rollsLeft === MAX_ROLLS) return false;
  const items = player.items || createPlayerItems();
  if (!items.comebackUnlocked || items.comebackUsed) return false;
  if (player.scores.yahtzee === 0 || Object.hasOwn(player.scores, "yahtzee")) return false;
  if (state.itemEffects.comeback?.playerIndex === state.currentPlayer) return false;
  return hasCount(state.dice, 4);
}

function hasFiveRoundsRemaining() {
  return ALL_CATEGORIES.length - state.round + 1 >= 5;
}

function isCategoryBlocked(playerIndex, categoryId) {
  const breaker = state.itemEffects?.breaker;
  return Boolean(
    state.gameMode === "items" &&
    breaker &&
    breaker.round === state.round &&
    breaker.targetIndex === playerIndex &&
    breaker.categoryId === categoryId
  );
}

function nextConnectionPlayerIndex() {
  const used = new Set(network.connections.map(conn => conn.yachooPlayerIndex));
  network.pendingPlayerIndexes?.forEach(index => used.add(index));
  for (let index = 1; index < MAX_PLAYERS; index += 1) {
    if (!used.has(index)) return index;
  }
  return null;
}

function shouldBroadcastAction(action) {
  const localOnly = new Set([
    "toggle-mute",
    "set-mode",
    "prepare-item",
    "cancel-item",
    "set-avatar",
    "enter-online",
    "disconnect-online"
  ]);
  return network.role === "host" && !localOnly.has(action) && (
    network.connections.length > 0 || network.socket?.readyState === WebSocket.OPEN
  );
}

function isActionBroadcast(action) {
  return action === "voice" || action === "move-player";
}

function playerProfile(index) {
  const player = state.players[index];
  return {
    name: player.name,
    avatarId: player.avatarId,
    emoji: player.emoji,
    skin: player.skin
  };
}

function applyPlayerProfile(index, profile) {
  if (typeof index !== "number" || !profile || !state.players[index]) return false;
  state.players[index].name = profile.name || `친구 ${index + 1}`;
  state.players[index].avatarId = profile.avatarId || state.players[index].avatarId;
  state.players[index].emoji = profile.emoji || state.players[index].emoji;
  state.players[index].skin = profile.skin || state.players[index].skin;
  state.playerCount = Math.max(state.playerCount, index + 1);
  return true;
}

function syncProfileChange(index) {
  if (network.socket?.readyState === WebSocket.OPEN) {
    sendRelay({ type: "profile", profile: playerProfile(index) });
    return;
  }
  if (network.role === "host") {
    broadcastState();
    return;
  }
  if (network.role === "client" && index === network.playerIndex && network.hostConn?.open) {
    network.hostConn.send({ type: "profile", profile: playerProfile(index) });
  }
}

async function loadPeer() {
  if (PeerCtor) return PeerCtor;
  network.status = "Loading online room...";
  network.busy = true;
  render();
  const module = await import(PEER_IMPORT_URL);
  PeerCtor = module.Peer || module.default;
  return PeerCtor;
}

async function enterOnlineRoom(roomCode) {
  const roomId = normalizeRoomCode(roomCode);
  connectRelayRoom(roomId);
  return;
  try {
    disconnectOnline(false);
    resetToLobbyState();
    network.status = `Room ${roomId} 입장 중...`;
    network.busy = true;
    render();
    const Peer = await loadPeer();
    startHostPeer(Peer, roomId);
  } catch (error) {
    network.status = `Online failed: ${error.message}`;
    network.busy = false;
    render();
  }
}

function connectRelayRoom(roomId) {
  disconnectOnline(false);
  resetToLobbyState();
  network = {
    role: "local",
    transport: "relay",
    socket: null,
    peer: null,
    hostConn: null,
    connections: [],
    pendingPlayerIndexes: new Set(),
    roomId,
    playerIndex: 0,
    status: `Room ${roomId} 연결 중...`,
    busy: true
  };
  render();

  let socket;
  try {
    socket = new WebSocket(RELAY_URL);
  } catch (error) {
    network.status = `Relay failed: ${error.message}`;
    network.busy = false;
    render();
    return;
  }

  network.socket = socket;
  socket.addEventListener("open", () => {
    sendRelay({
      type: "join",
      roomId,
      profile: playerProfile(0)
    });
  });
  socket.addEventListener("message", event => {
    try {
      handleRelayMessage(JSON.parse(event.data));
    } catch {
      network.status = "Relay message error";
      render();
    }
  });
  socket.addEventListener("error", () => {
    network.status = "Relay connection failed";
    network.busy = false;
    render();
  });
  socket.addEventListener("close", () => {
    if (network.socket !== socket) return;
    if (state.screen === "game" && !state.winner) {
      if (network.role === "client") {
        finishForfeit(network.playerIndex, 0);
      } else {
        state.message = "릴레이 연결이 끊겼습니다.";
        network.status = "Relay disconnected";
        network.role = "local";
        network.transport = "none";
        network.socket = null;
        render();
      }
      return;
    }
    network.status = "Relay disconnected";
    network.role = "local";
    network.transport = "none";
    network.socket = null;
    network.busy = false;
    render();
  });
}

function handleRelayMessage(message) {
  if (!message || typeof message !== "object") return;

  if (message.type === "assign") {
    network.role = message.playerIndex === 0 ? "host" : "client";
    network.playerIndex = message.playerIndex;
    network.roomId = message.roomId || network.roomId;
    network.status = network.role === "host"
      ? `Hosting room ${network.roomId} (${message.playerCount || 1}/${MAX_PLAYERS})`
      : `Connected as P${message.playerIndex + 1} in ${network.roomId}`;
    network.busy = false;
    if (network.role === "host") {
      state.playerCount = Math.max(state.playerCount, 1);
    }
    render();
    return;
  }

  if (message.type === "join" && network.role === "host") {
    if (applyPlayerProfile(message.playerIndex, message.profile)) {
      state.playerCount = Math.max(state.playerCount, message.playerIndex + 1);
      network.status = `Hosting room ${network.roomId} (${message.playerCount || state.playerCount}/${MAX_PLAYERS})`;
      render();
      broadcastState();
    }
    return;
  }

  if (message.type === "profile" && network.role === "host") {
    if (applyPlayerProfile(message.playerIndex, message.profile)) {
      render();
      broadcastState();
    }
    return;
  }

  if (message.type === "state" && network.role === "client") {
    receiveState(message.state);
    return;
  }

  if (message.type === "action" && network.role === "client") {
    runAction(message.action, actionMessageData(message));
    return;
  }

  if (message.type === "action" && network.role === "host") {
    if (!canPlayerIndexAct(message.playerIndex, message.action)) {
      broadcastState();
      return;
    }
    runAction(message.action, { ...(message.data || {}), actorPlayerIndex: message.playerIndex });
    if (isActionBroadcast(message.action)) {
      broadcastAction(message.action, { ...(message.data || {}), actorPlayerIndex: message.playerIndex });
    } else {
      broadcastState();
    }
    return;
  }

  if (message.type === "peer-left" && network.role === "host") {
    const loserIndex = message.playerIndex;
    network.status = `Hosting room ${network.roomId} (${message.playerCount || 1}/${MAX_PLAYERS})`;
    if (state.screen === "game" && !state.winner && typeof loserIndex === "number") {
      finishForfeit(selectForfeitWinner(loserIndex), loserIndex);
      return;
    }
    state.playerCount = Math.max(1, ...((message.activePlayers || [0]).map(index => index + 1)));
    render();
    broadcastState();
    return;
  }

  if (message.type === "full") {
    network.status = "Room is full.";
    network.busy = false;
    render();
    return;
  }

  if (message.type === "notice") {
    network.status = message.message || network.status;
    network.busy = false;
    render();
  }
}

function sendRelay(message) {
  if (network.socket?.readyState === WebSocket.OPEN) {
    network.socket.send(JSON.stringify(message));
    return true;
  }
  return false;
}

function startHostPeer(Peer, roomId) {
  resetToLobbyState();
  const hostId = roomPeerId(roomId);
  const peer = createPeer(Peer, hostId);
  network = {
    role: "host",
    peer,
    hostConn: null,
    connections: [],
    pendingPlayerIndexes: new Set(),
    roomId,
    playerIndex: 0,
    status: `Room ${roomId} 확인 중...`,
    busy: true
  };

  peer.on("open", openedId => {
    if (openedId !== hostId) {
      peer.destroy?.();
      joinOnlineGame(roomId);
      return;
    }
    becomeHost(peer, roomId);
  });

  peer.on("connection", setupHostConnection);
  peer.on("error", error => {
    const type = error.type || "";
    const isRoomAlreadyOpen = type === "unavailable-id" || /unavailable|taken|ID/i.test(error.message || "");
    if (isRoomAlreadyOpen) {
      peer.destroy?.();
      joinOnlineGame(roomId);
      return;
    }
    network.status = `Online error: ${type || error.message}`;
    network.busy = false;
    render();
  });

  render();
}

function becomeHost(peer, roomId) {
  resetToLobbyState();
  state.playerCount = 1;
  network = {
    role: "host",
    peer,
    hostConn: null,
    connections: [],
    pendingPlayerIndexes: new Set(),
    roomId,
    playerIndex: 0,
    status: `Room ${roomId} 입장 완료`,
    busy: false
  };
  render();
}

async function hostOnlineGame() {
  try {
    disconnectOnline(false);
    const Peer = await loadPeer();
    const roomId = randomRoomCode();
    const peer = createPeer(Peer, roomPeerId(roomId));
    network = {
      role: "host",
      peer,
      hostConn: null,
      connections: [],
      pendingPlayerIndexes: new Set(),
      roomId,
      playerIndex: 0,
      status: `Hosting room ${roomId}`,
      busy: true
    };

    peer.on("open", () => {
      network.status = `Hosting room ${roomId}`;
      network.busy = false;
      render();
    });
    peer.on("connection", setupHostConnection);
    peer.on("error", error => {
      network.status = `Online error: ${error.type || error.message}`;
      network.busy = false;
      render();
    });
    render();
  } catch (error) {
    network.status = `Online failed: ${error.message}`;
    network.busy = false;
    render();
  }
}

async function joinOnlineGame(roomCode, attempt = 0) {
  const roomId = normalizeRoomCode(roomCode);
  if (!roomId) {
    network.status = "Enter a room code first";
    render();
    return;
  }

  try {
    disconnectOnline(false);
    resetToLobbyState();
    const Peer = await loadPeer();
    const peer = createPeer(Peer);
    network = {
      role: "client",
      peer,
      hostConn: null,
      connections: [],
      pendingPlayerIndexes: new Set(),
      roomId,
      playerIndex: 1,
      status: attempt > 0 ? `Joining room ${roomId}... retry ${attempt + 1}` : `Joining room ${roomId}...`,
      busy: true
    };

    peer.on("open", () => {
      const conn = peer.connect(roomPeerId(roomId), { reliable: true, serialization: "json" });
      network.hostConn = conn;
      setupClientConnection(conn, {
        onTimeoutBeforeOpen: () => {
          peer.destroy?.();
          if (attempt < JOIN_RETRY_LIMIT) {
            joinOnlineGame(roomId, attempt + 1);
            return;
          }
          network.status = "P2P relay connection timed out. Try entering again.";
          network.busy = false;
          render();
        },
        onCloseBeforeOpen: () => {
          peer.destroy?.();
          if (attempt < JOIN_RETRY_LIMIT) {
            joinOnlineGame(roomId, attempt + 1);
            return;
          }
          network.status = "P2P relay connection failed. Try entering again.";
          network.busy = false;
          render();
        },
        onErrorBeforeOpen: () => {
          peer.destroy?.();
          if (attempt < JOIN_RETRY_LIMIT) {
            joinOnlineGame(roomId, attempt + 1);
            return;
          }
          network.status = "P2P relay connection failed. Try entering again.";
          network.busy = false;
          render();
        }
      });
    });
    peer.on("error", error => {
      network.status = `Online error: ${error.type || error.message}`;
      network.busy = false;
      render();
    });
    render();
  } catch (error) {
    network.status = `Online failed: ${error.message}`;
    network.busy = false;
    render();
  }
}

function setupHostConnection(conn) {
  const playerIndex = nextConnectionPlayerIndex();
  if (playerIndex === null) {
    conn.on("open", () => conn.send({ type: "full" }));
    return;
  }

  conn.yachooPlayerIndex = playerIndex;
  network.pendingPlayerIndexes ||= new Set();
  network.pendingPlayerIndexes.add(playerIndex);

  conn.on("open", () => {
    network.pendingPlayerIndexes?.delete(playerIndex);
    if (!network.connections.includes(conn)) {
      network.connections.push(conn);
    }
    state.playerCount = Math.max(state.playerCount, playerIndex + 1);
    network.status = `Hosting room ${network.roomId} (${network.connections.length + 1}/${MAX_PLAYERS})`;
    conn.send({ type: "assign", playerIndex });
    sendState(conn);
    render();
    broadcastState();
  });
  conn.on("data", message => handlePeerMessage(message, conn));
  conn.on("error", () => {
    network.pendingPlayerIndexes?.delete(playerIndex);
    network.connections = network.connections.filter(item => item !== conn);
    render();
  });
  conn.on("close", () => {
    const loserIndex = conn.yachooPlayerIndex;
    network.pendingPlayerIndexes?.delete(loserIndex);
    network.connections = network.connections.filter(item => item !== conn);
    network.status = `Hosting room ${network.roomId} (${network.connections.length + 1}/${MAX_PLAYERS})`;
    if (state.screen === "game" && !state.winner && typeof loserIndex === "number") {
      finishForfeit(selectForfeitWinner(loserIndex), loserIndex);
      return;
    }
    render();
  });
}

function setupClientConnection(conn, options = {}) {
  return setupClientConnectionHandlers(conn, options);
}

function setupClientConnectionHandlers(conn, options = {}) {
  let hasOpened = false;
  const openTimer = window.setTimeout(() => {
    if (!hasOpened && options.onTimeoutBeforeOpen) {
      options.onTimeoutBeforeOpen();
    }
  }, DATA_CONNECTION_TIMEOUT_MS);

  conn.on("open", () => {
    hasOpened = true;
    window.clearTimeout(openTimer);
    options.onOpen?.();
    network.status = `Connected to room ${network.roomId}`;
    conn.send({
      type: "join",
      profile: {
        name: state.players[0].name,
        avatarId: state.players[0].avatarId,
        emoji: state.players[0].emoji,
        skin: state.players[0].skin
      }
    });
    render();
  });
  conn.on("data", message => handlePeerMessage(message, conn));
  conn.on("error", () => {
    window.clearTimeout(openTimer);
    if (!hasOpened && options.onErrorBeforeOpen) {
      options.onErrorBeforeOpen();
    }
  });
  conn.on("close", () => {
    window.clearTimeout(openTimer);
    if (!hasOpened && options.onCloseBeforeOpen) {
      options.onCloseBeforeOpen();
      return;
    }
    if (state.screen === "game" && !state.winner) {
      finishForfeit(network.playerIndex, 0);
      network.status = "Host left. You win by forfeit.";
      network.role = "local";
      render();
      return;
    }
    network.status = "Host connection closed.";
    network.role = "local";
    render();
  });
}

function handlePeerMessage(message, conn) {
  if (!message || typeof message !== "object") return;

  if (message.type === "join" && network.role === "host") {
    const index = conn.yachooPlayerIndex;
    if (applyPlayerProfile(index, message.profile)) {
      render();
      broadcastState();
    }
    return;
  }

  if (message.type === "profile" && network.role === "host") {
    if (applyPlayerProfile(conn.yachooPlayerIndex, message.profile)) {
      render();
      broadcastState();
    }
    return;
  }

  if (message.type === "assign" && network.role === "client") {
    network.playerIndex = message.playerIndex;
    network.status = `Connected as P${message.playerIndex + 1} in ${network.roomId}`;
    network.busy = false;
    render();
    return;
  }

  if (message.type === "full" && network.role === "client") {
    network.status = "Room is full.";
    network.busy = false;
    render();
    return;
  }

  if (message.type === "state" && network.role === "client") {
    receiveState(message.state);
    return;
  }

  if (message.type === "action" && network.role === "client") {
    runAction(message.action, actionMessageData(message));
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
    runAction(message.action, { ...(message.data || {}), actorPlayerIndex: conn?.yachooPlayerIndex });
    if (isActionBroadcast(message.action)) {
      broadcastAction(message.action, { ...(message.data || {}), actorPlayerIndex: conn?.yachooPlayerIndex });
    } else {
      broadcastState();
    }
  }
}

function sendToHost(message) {
  if (network.socket?.readyState === WebSocket.OPEN) {
    sendRelay(message);
    return;
  }
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

function broadcastAction(action, data = {}) {
  const payload = { type: "action", action, data };
  if (network.role === "host" && network.socket?.readyState === WebSocket.OPEN) {
    sendRelay(payload);
    return;
  }
  if (network.role !== "host") return;
  network.connections.forEach(conn => {
    if (conn.open) conn.send(payload);
  });
}

function broadcastState() {
  if (network.role === "host" && network.socket?.readyState === WebSocket.OPEN) {
    sendRelay({ type: "state", state: stripStateForNetwork(state) });
    return;
  }
  if (network.role !== "host") return;
  const payload = { type: "state", state: stripStateForNetwork(state) };
  network.connections.forEach(conn => {
    if (conn.open) conn.send(payload);
  });
}

function actionMessageData(message) {
  const data = { ...(message.data || {}) };
  if (!Number.isFinite(Number(data.actorPlayerIndex)) && Number.isFinite(Number(message.playerIndex))) {
    data.actorPlayerIndex = message.playerIndex;
  }
  return data;
}

function receiveState(nextState) {
  if (!nextState) return;
  const muted = state.muted;
  const previousLayout = state.screen === "game" ? state.diceLayout?.map(layout => ({ ...layout })) : null;
  state = { ...nextState, muted };
  state.itemEffects ||= createEmptyItemEffects();
  state.itemPrompt ||= null;
  state.toast ||= "";
  state.diceRolling ||= false;
  state.characterMode ||= "idle";
  state.characterModePlayerIndex ??= null;
  state.players.forEach(player => {
    player.items = createPlayerItems(player.items);
  });
  network.status = `Connected as P${network.playerIndex + 1} in ${network.roomId}`;
  network.busy = false;
  render();
  if (previousLayout && state.screen === "game") {
    animateDiceMoves(previousLayout);
  }
  scheduleDiceRollIdle();
  scheduleCharacterIdle();
}

function stripStateForNetwork(value) {
  return JSON.parse(JSON.stringify(value));
}

function disconnectOnline(shouldRender = true) {
  const socket = network.socket;
  network.socket = null;
  socket?.close?.();
  network.connections.forEach(conn => conn.close?.());
  network.hostConn?.close?.();
  network.peer?.destroy?.();
  network = {
    role: "local",
    transport: "none",
    socket: null,
    peer: null,
    hostConn: null,
    connections: [],
    pendingPlayerIndexes: new Set(),
    roomId: "",
    playerIndex: 0,
    status: "Local play",
    busy: false
  };
  if (shouldRender) render();
}

function resetToLobbyState() {
  state.screen = "setup";
  state.winner = null;
  state.forfeit = null;
  state.characterMode = "idle";
  state.characterModePlayerIndex = null;
  state.itemPrompt = null;
  state.message = "입장 대기 중입니다.";
}

function randomRoomCode() {
  return DEFAULT_ROOM_CODE;
}

function normalizeRoomCode(value) {
  const normalized = String(value || "").trim().replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase();
  return normalized || DEFAULT_ROOM_CODE;
}

function roomPeerId(roomId) {
  return `${ROOM_NAMESPACE}-${roomId}`;
}

function createPeer(Peer, id) {
  return id ? new Peer(id, PEER_OPTIONS) : new Peer(undefined, PEER_OPTIONS);
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
  state.forfeit = null;
  state.rematchVotes = [];
  state.diceRolling = false;
  state.itemEffects = createEmptyItemEffects();
  state.itemPrompt = null;
  state.toast = "";
  state.players.forEach(player => {
    player.items = createPlayerItems();
  });
  state.message = `${state.players[state.currentPlayer].name} 님 차례입니다.`;
  state.characterMode = "idle";
  state.characterModePlayerIndex = null;
  saveSettings();
  render();
}

function restartGame() {
  state.screen = "setup";
  state.winner = null;
  state.forfeit = null;
  state.rematchVotes = [];
  state.message = "다시 판 깔 준비.";
  render();
}

function requestRematch(data = {}) {
  if (network.role === "local") {
    restartGame();
    return;
  }
  if (!state.winner) return;
  const actorIndex = clamp(
    Number.isFinite(Number(data.actorPlayerIndex)) ? Number(data.actorPlayerIndex) : network.playerIndex,
    0,
    state.playerCount - 1
  );
  state.rematchVotes = Array.from(new Set([...(state.rematchVotes || []), actorIndex]));
  if (state.rematchVotes.length >= state.playerCount) {
    startGame();
    broadcastState();
    return;
  }
  const player = state.players[actorIndex] || state.players[0];
  state.message = `${player.name} 님이 재대결을 신청했습니다. (${state.rematchVotes.length}/${state.playerCount})`;
  render();
  broadcastState();
}

function rollDice() {
  if (state.rollsLeft <= 0 || state.winner) return;

  const playerName = state.players[state.currentPlayer].name;
  state.dice = state.dice.map((value, index) => state.held[index] ? value : rand(1, 6));
  state.diceLayout = state.diceLayout.map((layout, index) => state.held[index] ? layout : createDieLayout(index));
  state.rollsLeft -= 1;
  state.animationTick += 1;
  state.diceRolling = true;
  unlockComebackForOpponents();
  playSfx("dice_roll");
  setCharacterMode("celebrate", `${playerName} 님이 주사위를 던졌습니다.`);
  scheduleDiceRollIdle();
  render();
}

function toggleHold(index) {
  if (state.rollsLeft === MAX_ROLLS || state.winner) return;
  const previousLayout = state.diceLayout.map(layout => ({ ...layout }));
  state.held[index] = !state.held[index];
  if (!state.held[index]) {
    state.diceLayout[index] = createDieLayout(index);
  }
  syncKeptDiceLayout();
  playSfx(state.held[index] ? "score_lock" : "button_click");
  state.message = state.held[index]
    ? `${state.players[state.currentPlayer].name} 님이 주사위를 킵했습니다.`
    : `${state.players[state.currentPlayer].name} 님이 주사위를 다시 보드에 놓았습니다.`;
  render();
  animateDiceMoves(previousLayout);
}

function prepareItem(type) {
  if (!canUseItemsNow() || state.rollsLeft !== MAX_ROLLS) return;
  const player = state.players[state.currentPlayer];
  player.items ||= createPlayerItems();
  if (type === "boast" && player.items.boastUsed) return;
  if (type === "breaker") {
    if (player.items.breakerUsed) return;
    if (!hasFiveRoundsRemaining()) {
      showToast("족보 브레이커는 5라운드 이상 남았을 때만 사용할 수 있습니다.");
      return;
    }
  }
  state.itemPrompt = { type };
  state.message = type === "boast"
    ? "호언장담을 사용할 칸을 선택하세요."
    : "족보 브레이커로 막을 상대와 칸을 선택하세요.";
  render();
}

function useBoast(data = {}) {
  if (!canUseItemsNow() || state.rollsLeft !== MAX_ROLLS) return;
  const player = state.players[state.currentPlayer];
  player.items ||= createPlayerItems();
  if (player.items.boastUsed) return;
  const categoryId = data.category || app.querySelector('[data-item-select="boast-category"]')?.value;
  const category = ALL_CATEGORIES.find(item => item.id === categoryId);
  if (!category || Object.hasOwn(player.scores, categoryId)) return;
  player.items.boastUsed = true;
  state.itemEffects.boast = {
    playerIndex: state.currentPlayer,
    categoryId,
    round: state.round
  };
  state.itemPrompt = null;
  state.message = `${player.name} 님이 ${category.label}에 호언장담했습니다.`;
  playSfx("score_lock");
  render();
}

function useBreaker(data = {}) {
  if (!canUseItemsNow() || state.rollsLeft !== MAX_ROLLS || !hasFiveRoundsRemaining()) return;
  const player = state.players[state.currentPlayer];
  player.items ||= createPlayerItems();
  if (player.items.breakerUsed) return;
  const targetIndex = Number(data.targetPlayer ?? app.querySelector('[data-item-select="breaker-player"]')?.value);
  const categoryId = data.category || app.querySelector('[data-item-select="breaker-category"]')?.value;
  const category = ALL_CATEGORIES.find(item => item.id === categoryId);
  if (!category || !state.players[targetIndex] || targetIndex === state.currentPlayer) return;
  player.items.breakerUsed = true;
  state.itemEffects.breaker = {
    ownerIndex: state.currentPlayer,
    targetIndex,
    categoryId,
    round: state.round
  };
  state.itemPrompt = null;
  state.message = `${player.name} 님이 ${state.players[targetIndex].name} 님의 ${category.label}을 막았습니다.`;
  playSfx("score_lock");
  render();
}

function useComeback() {
  if (!canUseItemsNow()) return;
  const player = state.players[state.currentPlayer];
  player.items ||= createPlayerItems();
  if (!canUseComeback(player)) return;
  player.items.comebackUsed = true;
  state.itemEffects.comeback = {
    playerIndex: state.currentPlayer,
    round: state.round
  };
  state.itemPrompt = null;
  state.message = `${player.name} 님이 역전의 기회를 사용했습니다.`;
  playSfx("score_lock");
  render();
}

function unlockComebackForOpponents() {
  if (state.gameMode !== "items" || !isYahtzee(state.dice)) return;
  state.players.slice(0, state.playerCount).forEach((player, index) => {
    if (index === state.currentPlayer) return;
    player.items ||= createPlayerItems();
    if (!player.items.comebackUsed) {
      player.items.comebackUnlocked = true;
    }
  });
}

function scoreCategory(categoryId) {
  const player = state.players[state.currentPlayer];
  const category = ALL_CATEGORIES.find(item => item.id === categoryId);
  if (
    !category ||
    Object.hasOwn(player.scores, categoryId) ||
    state.rollsLeft === MAX_ROLLS ||
    isCategoryBlocked(state.currentPlayer, categoryId)
  ) return;

  const baseScore = scoreWithItems(player, category);
  const rawScore = applyBoastMultiplier(baseScore, categoryId);
  player.scores[categoryId] = rawScore;

  if (categoryId === "yahtzee" && baseScore > 0) {
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

function expireRoundItemEffects() {
  if (state.itemEffects.boast?.round < state.round) state.itemEffects.boast = null;
  if (state.itemEffects.breaker?.round < state.round) state.itemEffects.breaker = null;
  if (state.itemEffects.comeback?.round < state.round) state.itemEffects.comeback = null;
}

function nextTurn() {
  const previousPlayer = state.currentPlayer;
  state.currentPlayer = (state.currentPlayer + 1) % state.playerCount;
  if (state.currentPlayer === 0 && previousPlayer === state.playerCount - 1) {
    state.round += 1;
    expireRoundItemEffects();
  }
  state.dice = randomDice();
  state.held = [false, false, false, false, false];
  state.rollsLeft = MAX_ROLLS;
  state.diceRolling = false;
  state.characterMode = "idle";
  state.characterModePlayerIndex = null;
  state.itemPrompt = null;
  state.message = `${state.players[state.currentPlayer].name} 님 차례입니다.`;
  render();
  maybeShowBreakerLastRoundToast();
}

function maybeShowBreakerLastRoundToast() {
  if (state.gameMode !== "items" || state.winner) return;
  if (ALL_CATEGORIES.length - state.round + 1 !== 5) return;
  const player = state.players[state.currentPlayer];
  player.items ||= createPlayerItems();
  if (!player.items.breakerUsed) {
    showToast("족보 브레이커를 쓸 수 있는 마지막 라운드입니다.");
  }
}

function showToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    if (state.toast !== message) return;
    state.toast = "";
    render();
    broadcastState();
  }, 2200);
}

function finishGame() {
  const ranking = state.players
    .slice(0, state.playerCount)
    .map(player => ({ player, score: totalScore(player) }))
    .sort((a, b) => b.score - a.score);

  state.winner = ranking[0].player.id;
  state.forfeit = null;
  state.message = `${ranking[0].player.name} 님이 승리했습니다.`;
  playSfx("confetti_pop");
  render();
}

function finishForfeit(winnerIndex, loserIndex) {
  const winner = state.players[winnerIndex] || state.players[0];
  const loser = state.players[loserIndex] || { name: "상대" };
  state.winner = winner.id;
  state.forfeit = {
    winnerIndex,
    loserIndex,
    reason: `${loser.name}님이 나가서 ${winner.name}님이 기권승 처리됐습니다.`
  };
  state.message = state.forfeit.reason;
  playSfx("confetti_pop");
  render();
  broadcastState();
}

function selectForfeitWinner(loserIndex) {
  return state.players
    .slice(0, state.playerCount)
    .map((player, index) => ({ index, score: totalScore(player) }))
    .filter(entry => entry.index !== loserIndex)
    .sort((a, b) => b.score - a.score)[0]?.index ?? 0;
}

function isGameOver() {
  return state.players
    .slice(0, state.playerCount)
    .every(player => ALL_CATEGORIES.every(category => Object.hasOwn(player.scores, category.id)));
}

function previewScore(player, category) {
  const score = applyBoastMultiplier(scoreWithItems(player, category), category.id);
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

function scoreWithItems(player, category) {
  if (
    state.gameMode === "items" &&
    category.id === "yahtzee" &&
    state.itemEffects.comeback?.playerIndex === state.currentPlayer &&
    hasCount(state.dice, 4)
  ) {
    return 50;
  }
  return category.scorer(state.dice);
}

function applyBoastMultiplier(score, categoryId) {
  const boast = state.itemEffects?.boast;
  if (
    state.gameMode === "items" &&
    boast &&
    boast.round === state.round &&
    boast.playerIndex === state.currentPlayer &&
    boast.categoryId === categoryId
  ) {
    return score * 2;
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
    { x: 13, y: 58 },
    { x: 31, y: 30 },
    { x: 54, y: 72 },
    { x: 70, y: 40 },
    { x: 85, y: 60 }
  ];
  const slot = slots[index % slots.length];
  return {
    x: clamp(slot.x + rand(-6, 6), 9, 91),
    y: clamp(slot.y + rand(-9, 9), 16, 84),
    rot: rand(-28, 28)
  };
}

function syncKeptDiceLayout() {
  let slot = 0;
  state.held.forEach((held, index) => {
    if (!held) return;
    state.diceLayout[index] = createKeptDieLayout(slot);
    slot += 1;
  });
}

function animateDiceMoves(previousLayout) {
  requestAnimationFrame(() => {
    const dice = app.querySelectorAll(".dice-board .die");
    dice.forEach((element, index) => {
      const from = previousLayout[index];
      const to = state.diceLayout[index];
      if (!from || !to || (from.x === to.x && from.y === to.y && from.rot === to.rot)) return;
      const toScale = state.held[index] ? 0.9 : 1;
      const fromScale = toScale;
      element.animate(
        [
          {
            left: `${from.x}%`,
            top: `${from.y}%`,
            transform: `translate(-50%, -50%) rotate(${from.rot}deg) scale(${fromScale})`
          },
          {
            left: `${to.x}%`,
            top: `${to.y}%`,
            transform: `translate(-50%, -50%) rotate(${to.rot}deg) scale(${toScale})`
          }
        ],
        { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" }
      );
    });
  });
}

function createKeptDieLayout(slot) {
  return {
    x: 18 + slot * 16,
    y: 91,
    rot: 0
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

function setCharacterMode(mode, message, playerIndex = state.currentPlayer) {
  state.characterMode = mode;
  state.characterModePlayerIndex = clamp(playerIndex, 0, Math.max(0, state.playerCount - 1));
  state.message = message;
  render();
  if (network.role === "host") {
    broadcastState();
  }
  scheduleCharacterIdle();
}

function scheduleCharacterIdle() {
  window.clearTimeout(setCharacterMode.timer);
  if (state.characterMode === "idle") return;
  setCharacterMode.timer = window.setTimeout(() => {
    state.characterMode = "idle";
    state.characterModePlayerIndex = null;
    render();
    broadcastState();
  }, 900);
}

function scheduleDiceRollIdle() {
  window.clearTimeout(scheduleDiceRollIdle.timer);
  if (!state.diceRolling) return;
  scheduleDiceRollIdle.timer = window.setTimeout(() => {
    if (!state.diceRolling) return;
    state.diceRolling = false;
    render();
    if (network.role === "host") broadcastState();
  }, 380);
}

function movePlayerFromNetwork(data = {}) {
  const playerIndex = actionPlayerIndex(data);
  const player = state.players[playerIndex];
  if (!player) return;
  const x = Number(data.x);
  const y = Number(data.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  player.x = clamp(x, 8, 92);
  player.y = clamp(y, 16, 86);
  updateCharacterPosition(playerIndex);
}

function updateCharacterPosition(playerIndex) {
  const player = state.players[playerIndex];
  const character = app.querySelector(`[data-character-index="${playerIndex}"]`);
  if (!player || !character) return false;
  character.style.setProperty("--x", `${player.x}%`);
  character.style.setProperty("--y", `${player.y}%`);
  return true;
}

function startJoystick(event) {
  const joystick = event.currentTarget;
  const rect = joystick.getBoundingClientRect();
  touchState = {
    dragging: true,
    originX: rect.left + rect.width / 2,
    originY: rect.top + rect.height / 2,
    knobX: 0,
    knobY: 0,
    axisX: 0,
    axisY: 0,
    rafId: 0,
    lastFrameAt: performance.now(),
    lastSyncAt: 0
  };
  joystick.setPointerCapture(event.pointerId);
  moveJoystick(event);
  startJoystickLoop();
}

function moveJoystick(event) {
  if (!touchState.dragging) return;
  const maxDistance = 34;
  let dx = event.clientX - touchState.originX;
  let dy = event.clientY - touchState.originY;
  const distance = Math.hypot(dx, dy);
  if (distance > maxDistance) {
    const scale = maxDistance / distance;
    dx *= scale;
    dy *= scale;
  }
  touchState.knobX = dx;
  touchState.knobY = dy;
  touchState.axisX = Math.abs(dx) < 3 ? 0 : dx / maxDistance;
  touchState.axisY = Math.abs(dy) < 3 ? 0 : dy / maxDistance;
  const stick = app.querySelector("[data-stick]");
  if (stick) stick.style.transform = `translate(${dx}px, ${dy}px)`;
}

function startJoystickLoop() {
  if (touchState.rafId) return;
  touchState.lastFrameAt = performance.now();
  const step = now => {
    if (!touchState.dragging) {
      touchState.rafId = 0;
      return;
    }
    updateJoystickMovement(now);
    touchState.rafId = requestAnimationFrame(step);
  };
  touchState.rafId = requestAnimationFrame(step);
}

function updateJoystickMovement(now) {
  const playerIndex = localPlayerIndex();
  const player = state.players[playerIndex];
  if (!player) return;
  const deltaSeconds = Math.min(0.05, Math.max(0, (now - (touchState.lastFrameAt || now)) / 1000));
  touchState.lastFrameAt = now;
  const speed = 34;
  const magnitude = Math.hypot(touchState.axisX, touchState.axisY);
  const eased = magnitude * magnitude;
  player.x = clamp(player.x + touchState.axisX * speed * eased * deltaSeconds, 8, 92);
  player.y = clamp(player.y + touchState.axisY * speed * eased * deltaSeconds, 16, 86);
  updateCharacterPosition(playerIndex);
  syncPlayerPosition(playerIndex, player, false);
}

function endJoystick(event) {
  const playerIndex = localPlayerIndex();
  const player = state.players[playerIndex];
  if (player) syncPlayerPosition(playerIndex, player, true);
  touchState.dragging = false;
  touchState.axisX = 0;
  touchState.axisY = 0;
  const stick = app.querySelector("[data-stick]");
  if (stick) stick.style.transform = "translate(0, 0)";
  try {
    event.currentTarget.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer may already be released by the browser.
  }
}

function syncPlayerPosition(playerIndex, player, force) {
  if (network.role === "local") return;
  const now = performance.now();
  if (!force && now - (touchState.lastSyncAt || 0) < 80) return;
  touchState.lastSyncAt = now;
  const payload = {
    type: "action",
    action: "move-player",
    data: {
      actorPlayerIndex: playerIndex,
      x: Number(player.x.toFixed(2)),
      y: Number(player.y.toFixed(2))
    }
  };
  if (network.role === "client") {
    sendToHost(payload);
    return;
  }
  if (network.role === "host") {
    broadcastAction("move-player", payload.data);
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
  const gain = VOICE_GAINS[id] || 0.7;
  if (gain > 1) {
    playVoiceWithGain(id, gain).catch(() => playVoiceElement(id, 1));
    return;
  }
  playVoiceElement(id, gain);
}

function playVoiceElement(id, volume) {
  const wav = new Audio(`./assets/sfx/${id}.wav`);
  wav.volume = volume;
  wav.play().catch(() => {
    const mp3 = new Audio(`./assets/sfx/${id}.mp3`);
    mp3.volume = volume;
    mp3.play().catch(() => {});
  });
}

async function playVoiceWithGain(id, gainValue) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) throw new Error("Web Audio is unavailable");
  voiceAudioContext ||= new AudioContextCtor();
  if (voiceAudioContext.state === "suspended") {
    await voiceAudioContext.resume();
  }

  const response = await fetch(`./assets/sfx/${id}.mp3`);
  if (!response.ok) throw new Error(`voice ${id} not found`);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = await voiceAudioContext.decodeAudioData(arrayBuffer);
  const source = voiceAudioContext.createBufferSource();
  const gain = voiceAudioContext.createGain();
  gain.gain.value = gainValue;
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(voiceAudioContext.destination);
  source.start();
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
