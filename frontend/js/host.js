// Host screen: create a game, run the lobby, show questions, answers and the leaderboard.

let socket = null;
let session = null;          // { code, host_token }
let timerInterval = null;
let readyInterval = null;
let lastPlayerCount = 0;
let minPlayers = 2, maxPlayers = 20;
let hostPin = "";

const params = new URLSearchParams(location.search);

// ---------- setup ----------

async function loadCategories() {
  try {
    const data = await api("/api/categories");
    const sel = $("#category");
    data.categories.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.category;
      opt.textContent = `${c.category} (${c.total})`;
      sel.appendChild(opt);
    });
    sel.options[0].textContent = `All categories (${data.total})`;
  } catch (e) {
    showSetupError("Could not reach the database: " + e.message);
  }
}

$("#hostPinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#hostPinBtn");
  const error = $("#hostPinError");
  error.classList.add("hidden");
  button.disabled = true;
  hostPin = $("#hostPin").value;
  try {
    await api("/api/host/check", { method: "POST", body: { pin: hostPin } });
    show("setupView");
    await loadCategories();
  } catch (ex) {
    hostPin = "";
    error.textContent = ex.message;
    error.classList.remove("hidden");
  } finally {
    button.disabled = false;
  }
});

function showSetupError(msg) {
  const el = $("#setupError");
  el.textContent = msg;
  el.classList.remove("hidden");
}

$("#hostName").value = localStorage.getItem("quiz_host_name") || "";

$("#setupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#setupError").classList.add("hidden");
  $("#createBtn").disabled = true;
  try {
    const body = {
      host_name: $("#hostName").value,
      category: $("#category").value || null,
      num_questions: parseInt($("#numQ").value, 10) || 10,
      time_limit: parseInt($("#timeLimit").value, 10) || 20,
    };
    const res = await api("/api/games", {
      method: "POST",
      body,
      headers: { "X-Host-Pin": hostPin },
    });
    localStorage.setItem("quiz_host_name", body.host_name);
    session = { code: res.code, host_token: res.host_token };
    sessionStorage.setItem("quiz_host", JSON.stringify(session));
    history.replaceState(null, "", `host.html?code=${res.code}`);
    if (res.num_questions < body.num_questions) {
      toast(`Only ${res.num_questions} questions available in that category - using all of them.`, 4500);
    }
    connect();
  } catch (ex) {
    showSetupError(ex.message);
  } finally {
    $("#createBtn").disabled = false;
  }
});

// ---------- connection ----------

async function connect() {
  const info = await api("/api/server-info").catch(() => ({ join_url: location.origin }));
  minPlayers = info.min_players || 2;
  maxPlayers = info.max_players || 20;
  const joinUrl = info.join_url;
  $("#joinUrl").textContent = joinUrl.replace(/^https?:\/\//, "");
  $("#bigCode").textContent = session.code;
  $("#codePill").textContent = "Code " + session.code;
  $("#codePill").classList.remove("hidden");
  $("#endBtn").classList.remove("hidden");
  drawQr(`${joinUrl}/?code=${session.code}`);

  socket = new LiveSocket(`/ws/host/${session.code}?token=${session.host_token}`, handle);
}

function drawQr(url) {
  try {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    $("#qr").innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
  } catch (_) {
    $("#qr").classList.add("hidden");
  }
}

function handle(msg) {
  switch (msg.type) {
    case "lobby": return onLobby(msg);
    case "players": return; // connection status changes mid-game; nothing to redraw
    case "get_ready": return onGetReady(msg);
    case "question": return onQuestion(msg);
    case "answer_count": return onAnswerCount(msg);
    case "reveal": return onReveal(msg);
    case "finished": return onFinished(msg);
    case "error": return toast(msg.message, 3500);
    case "fatal":
      sessionStorage.removeItem("quiz_host");
      toast(msg.message, 5000);
      history.replaceState(null, "", "host.html");
      show("setupView");
      $("#endBtn").classList.add("hidden");
      $("#codePill").classList.add("hidden");
      return;
  }
}

// ---------- lobby ----------

function onLobby(msg) {
  show("lobbyView");
  const grid = $("#playersGrid");
  if (msg.players.length === 0) {
    grid.innerHTML = `<p class="muted">Waiting for players to join...</p>`;
  } else {
    grid.innerHTML = msg.players.map(p => `
      <span class="player-chip ${p.connected ? "" : "offline"}" title="${p.connected ? "Connected" : "Offline"}">
        ${esc(p.name)}
        <button data-kick="${p.id}" title="Remove ${esc(p.name)}">&times;</button>
      </span>`).join("");
  }
  if (msg.count > lastPlayerCount) Sound.join();
  lastPlayerCount = msg.count;

  $("#playerCount").textContent = `${msg.count} / ${msg.max_players}`;
  const enough = msg.count >= msg.min_players;
  $("#startBtn").disabled = !enough;
  $("#startHint").textContent = enough
    ? `${msg.num_questions} questions, ${msg.time_limit}s each`
    : `Need at least ${msg.min_players} players`;
}

$("#playersGrid").addEventListener("click", (e) => {
  const id = e.target.getAttribute("data-kick");
  if (id) socket.send({ action: "kick", player_id: Number(id) });
});

$("#startBtn").addEventListener("click", () => {
  $("#startBtn").disabled = true;
  socket.send({ action: "start" });
});

// ---------- get ready ----------

function onGetReady(msg) {
  show("readyView");
  clearInterval(readyInterval);
  let n = msg.seconds;
  $("#readyCount").textContent = n;
  $("#readyInfo").textContent = `${msg.total} questions coming up`;
  readyInterval = setInterval(() => {
    n -= 1;
    if (n <= 0) { clearInterval(readyInterval); $("#readyCount").textContent = "Go!"; return; }
    $("#readyCount").textContent = n;
    Sound.tick();
  }, 1000);
}

// ---------- question ----------

function optionsHtml(options, extra = () => "") {
  return ["A", "B", "C", "D"].map(k => `
    <div class="opt ${k}" data-opt="${k}">
      <span class="letter">${k}</span><span>${esc(options[k])}</span>${extra(k)}
    </div>`).join("");
}

function onQuestion(msg) {
  show("questionView");
  clearInterval(readyInterval);
  $("#qCount").textContent = `Question ${msg.index} of ${msg.total}`;
  $("#qCategory").textContent = msg.category;
  $("#qText").textContent = msg.text;
  $("#qOptions").innerHTML = optionsHtml(msg.options);
  onAnswerCount(msg);
  startTimer(msg.remaining_ms, msg.time_limit);
}

function startTimer(remainingMs, limit) {
  clearInterval(timerInterval);
  const endsAt = Date.now() + remainingMs;
  let lastSecond = null;
  const draw = () => {
    const left = Math.max(0, endsAt - Date.now());
    const secs = Math.ceil(left / 1000);
    $("#timerNum").textContent = secs;
    const t = $("#timer");
    t.style.setProperty("--p", (left / (limit * 1000)).toFixed(3));
    t.classList.toggle("urgent", secs <= 5);
    if (secs !== lastSecond && secs <= 5 && secs > 0) Sound.tick();
    lastSecond = secs;
    if (left <= 0) clearInterval(timerInterval);
  };
  draw();
  timerInterval = setInterval(draw, 100);
}

function onAnswerCount(msg) {
  $("#answeredNum").textContent = msg.answered;
  $("#answeredOf").textContent = `of ${msg.player_count} answered`;
}

$("#skipBtn").addEventListener("click", () => socket.send({ action: "reveal_now" }));

// ---------- reveal ----------

function onReveal(msg) {
  clearInterval(timerInterval);
  show("revealView");
  Sound.reveal();
  $("#rCount").textContent = `Question ${msg.index} of ${msg.total}`;
  $("#rText").textContent = msg.text;
  $("#rOptions").innerHTML = optionsHtml(msg.options, k =>
    `<span class="votes">${msg.distribution[k]} ${k === msg.correct ? "&#10004;" : ""}</span>`);
  document.querySelectorAll("#rOptions .opt").forEach(el => {
    el.classList.add(el.dataset.opt === msg.correct ? "right" : "dim");
  });

  const f = $("#fastest");
  if (msg.fastest) {
    f.innerHTML = `<span class="bolt">&#9889;</span><span>Fastest correct answer: <b>${esc(msg.fastest.name)}</b> in ${(msg.fastest.ms / 1000).toFixed(2)}s (+100 bonus)</span>`;
    f.classList.remove("hidden");
  } else {
    f.classList.add("hidden");
  }
  const right = msg.leaderboard.filter(r => r.last_correct).length;
  $("#rSummary").textContent = `${right} of ${msg.player_count} got it right - ${msg.answered} answered.`;
  $("#rBoard").innerHTML = renderLeaderboard(msg.leaderboard, { limit: 10 });
  $("#nextBtn").innerHTML = msg.is_last ? "See final results &#127942;" : "Next question &#9654;";
  $("#nextBtn").disabled = false;
}

$("#nextBtn").addEventListener("click", () => {
  $("#nextBtn").disabled = true;
  socket.send({ action: "next" });
});

// ---------- finished ----------

function onFinished(msg) {
  clearInterval(timerInterval);
  show("finishedView");
  Sound.fanfare();
  $("#endBtn").classList.add("hidden");
  $("#finalInfo").textContent = `${msg.leaderboard.length} players - ${msg.total_questions} questions`;
  $("#podium").innerHTML = renderPodium(msg.podium);
  $("#finalBoard").innerHTML = renderLeaderboard(msg.leaderboard, { showGain: false });
}

$("#endBtn").addEventListener("click", () => {
  if (confirm("End the game now and show final results?")) socket.send({ action: "end" });
});

$("#newGameBtn").addEventListener("click", () => {
  sessionStorage.removeItem("quiz_host");
  location.href = "host.html";
});

$("#muteBtn").addEventListener("click", () => {
  Sound.muted = !Sound.muted;
  $("#muteBtn").innerHTML = Sound.muted ? "&#128263; Muted" : "&#128266; Sound";
});

// ---------- start ----------

(function init() {
  const saved = JSON.parse(sessionStorage.getItem("quiz_host") || "null");
  if (saved && params.get("code") === saved.code) {
    session = saved;   // host refreshed the page - reconnect to the same game
    connect();
  } else {
    show("hostPinView");
  }
})();
