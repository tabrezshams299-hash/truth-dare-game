const socket = io();

let state = null;
let myId = null;
let myName = "";

const $ = id => document.getElementById(id);

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2800);
}

function renderDareInputs() {
  $("dareInputs").innerHTML = "";
  for (let i = 1; i <= 5; i++) {
    const wrap = document.createElement("div");
    wrap.className = "dare-input";
    wrap.innerHTML = `
      <span class="dare-number">${i}</span>
      <input maxlength="250" placeholder="Write dare ${i}">
    `;
    $("dareInputs").appendChild(wrap);
  }
}

function renderLobby() {
  showScreen("lobby");

  $("roomCode").textContent = state.code;
  $("playerCount").textContent = `${state.players.length}/4`;

  $("players").innerHTML = state.players.map(p => `
    <div class="player">
      <span>${escapeHtml(p.name)}${p.id === myId ? " (You)" : ""}</span>
      <span class="player-status">${p.daresSubmitted ? "5/5 ✓" : "Waiting"}</span>
    </div>
  `).join("");

  const allReady =
    state.players.length === 4 &&
    state.players.every(p => p.daresSubmitted);

  $("lobbyStatus").textContent =
    state.players.length < 4
      ? `Waiting for ${4 - state.players.length} more player(s)...`
      : allReady
        ? "Everyone is ready! 🎉"
        : "Everyone must submit 5 dares.";

  $("startBtn").disabled = !allReady;
}

function renderGame() {
  showScreen("game");

  const current = state.players.find(p => p.id === state.currentPlayerId);
  const isMyTurn = current && current.id === myId;

  $("turnLabel").textContent =
    isMyTurn ? "🎯 YOUR TURN" : `🎯 ${current ? current.name : "Player"}'S TURN`;

  const dare = state.currentDare;

  if (!dare) {
    $("gameContent").innerHTML = `
      <div class="wheel-area">
        <div class="wheel-pointer">▼</div>

        <div class="spin-wheel" id="spinWheel">
          <div class="wheel-lines"></div>
          <div class="wheel-label label1">🔥</div>
          <div class="wheel-label label2">❤️</div>
          <div class="wheel-label label3">😈</div>
          <div class="wheel-label label4">🎯</div>
          <div class="wheel-label label5">🔥</div>
          <div class="wheel-label label6">❤️</div>
          <div class="wheel-label label7">😈</div>
          <div class="wheel-label label8">🎯</div>

          <button id="spinBtn" class="wheel-center" ${!isMyTurn ? "disabled" : ""}>
            ${isMyTurn ? "SPIN" : "WAIT"}
          </button>
        </div>

        <p class="wheel-hint">
          ${isMyTurn
            ? "Tap the wheel to spin 🎰"
            : `Waiting for ${escapeHtml(current?.name || "player")}...`}
        </p>
      </div>
    `;

    if (isMyTurn) {
      $("spinBtn").onclick = () => {
        const wheel = $("spinWheel");
        const button = $("spinBtn");

        if (wheel.classList.contains("spinning")) return;

        button.disabled = true;
        wheel.classList.add("spinning");

        // Let the wheel animation finish before requesting the result.
        // This prevents the server response from replacing the wheel immediately.
        setTimeout(() => {
          socket.emit("spin");
        }, 3200);
      };
    }

    return;
  }

  if (!dare.completed) {
    $("gameContent").innerHTML = `
      <div class="dare-box">
        <div class="dare-icon">🔥</div>
        <div class="eyebrow">YOUR DARE</div>
        <div class="dare-text">${escapeHtml(dare.text)}</div>
        ${isMyTurn
          ? `<button id="doneBtn" class="primary">✓ DONE</button>`
          : `<p class="muted">Waiting for ${escapeHtml(current.name)}...</p>`
        }
      </div>
    `;

    if (isMyTurn) $("doneBtn").onclick = () => socket.emit("complete-dare");
    return;
  }

  const remaining = state.remainingDares;

  $("gameContent").innerHTML = `
    <div class="reveal">
      <div class="dare-icon">😈</div>
      <p class="muted">DARE REVEALED</p>
      <p>This dare was written by</p>
      <div class="reveal-name">${escapeHtml(dare.creatorName)}</div>
      <p class="muted">"${escapeHtml(dare.text)}"</p>
      ${remaining === 0
        ? `<button id="finishBtn" class="primary">🎉 Finish Game</button>`
        : isMyTurn
          ? `<button id="nextBtn" class="primary">Next Turn →</button>`
          : `<p class="muted">Waiting for ${escapeHtml(current.name)} to continue...</p>`
      }
    </div>
  `;

  if (remaining === 0) {
    $("finishBtn").onclick = () => showScreen("complete");
  } else if (isMyTurn) {
    $("nextBtn").onclick = () => socket.emit("next-turn");
  }
}

function render() {
  if (!state) return;

  if (!state.gameStarted) {
    const me = state.players.find(p => p.id === myId);

    if (me?.daresSubmitted) {
      showScreen("lobby");
      renderLobby();
    } else if (state.players.length === 4) {
      showScreen("dares");
    } else {
      renderLobby();
    }
  } else {
    if (state.remainingDares === 0 && !state.currentDare) {
      showScreen("complete");
    } else {
      renderGame();
    }
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

$("createBtn").onclick = () => {
  const name = $("name").value.trim();
  if (!name) return toast("Enter your name first.");
  myName = name;
  socket.emit("create-game", { name });
};

$("joinBtn").onclick = () => {
  const name = $("name").value.trim();
  const code = $("code").value.trim();

  if (!name) return toast("Enter your name first.");
  if (!/^\d{4}$/.test(code)) return toast("Enter the 4-digit game code.");

  myName = name;
  socket.emit("join-game", { name, code });
};

$("submitBtn").onclick = () => {
  const inputs = [...document.querySelectorAll("#dareInputs input")];
  const dares = inputs.map(i => i.value.trim());

  if (dares.length !== 5 || dares.some(d => !d)) {
    return toast("Please enter all 5 dares.");
  }

  socket.emit("submit-dares", { dares });
};

$("startBtn").onclick = () => socket.emit("start-game");

$("copyBtn").onclick = async () => {
  try {
    await navigator.clipboard.writeText(state.code);
    toast("Game code copied!");
  } catch {
    toast(`Game code: ${state.code}`);
  }
};

socket.on("joined", ({ code }) => {
  $("roomCode").textContent = code;
  renderDareInputs();
});

socket.on("state", newState => {
  state = newState;
  render();
});

socket.on("error-message", message => toast(message));

socket.on("notice", message => toast(message));

socket.on("connect", () => {
  myId = socket.id;
});

socket.on("disconnect", () => {
  toast("Connection lost. Refresh and rejoin if needed.");
});

renderDareInputs();
