// Player screen (usually a phone).

const me = JSON.parse(sessionStorage.getItem("quiz_player") || "null");
let socket = null;
let timerInterval = null;
let readyInterval = null;
let currentIndex = null;
let locked = false;

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function setScore(score) {
  $("#meScore").textContent = `${(score || 0).toLocaleString()} pts`;
}

function fail(title, text) {
  clearInterval(timerInterval);
  $("#errorTitle").textContent = title;
  $("#errorText").textContent = text;
  show("errorView");
}

if (!me) {
  location.href = "index.html";
} else {
  $("#meName").textContent = "⚡ " + me.name;
  socket = new LiveSocket(`/ws/player/${me.code}?player_id=${me.player_id}&token=${me.token}`, handle);
}

function handle(msg) {
  if (msg.you) setScore(msg.you.score);
  switch (msg.type) {
    case "lobby": return onLobby(msg);
    case "get_ready": return onGetReady(msg);
    case "question": return onQuestion(msg);
    case "answer_locked": return onLocked(msg.option);
    case "answer_count":
      $("#lockedCount").textContent = `${msg.answered} of ${msg.player_count} answered`;
      return;
    case "reveal": return onReveal(msg);
    case "finished": return onFinished(msg);
    case "kicked": sessionStorage.removeItem("quiz_player"); return fail("Removed", msg.message);
    case "replaced": return fail("Opened elsewhere", msg.message);
    case "fatal": sessionStorage.removeItem("quiz_player"); return fail("Game not found", msg.message);
  }
}

function onLobby(msg) {
  show("lobbyView");
  $("#progress").textContent = `Game ${msg.code}`;
  $("#lobbyCount").textContent = `${msg.count} player${msg.count === 1 ? "" : "s"} in the game`;
  $("#lobbyText").textContent = msg.count < msg.min_players
    ? `Waiting for at least ${msg.min_players} players...`
    : `Waiting for ${msg.host_name} to start the game...`;
}

function onGetReady(msg) {
  show("readyView");
  clearInterval(readyInterval);
  let n = msg.seconds;
  $("#readyCount").textContent = n;
  readyInterval = setInterval(() => {
    n -= 1;
    $("#readyCount").textContent = n > 0 ? n : "Go!";
    if (n <= 0) clearInterval(readyInterval);
  }, 1000);
}

function onQuestion(msg) {
  clearInterval(readyInterval);
  $("#progress").textContent = `Q ${msg.index} / ${msg.total}`;
  $("#lockedCount").textContent = `${msg.answered} of ${msg.player_count} answered`;

  // Reconnected after already answering this question
  if (msg.you && msg.you.answered) { onLocked(msg.you.option); return; }

  currentIndex = msg.index;
  locked = false;
  show("questionView");
  $("#qText").textContent = msg.text;
  $("#answerButtons").innerHTML = ["A", "B", "C", "D"].map(k => `
    <button class="opt ${k}" data-opt="${k}">
      <span class="letter">${k}</span><span>${esc(msg.options[k])}</span>
    </button>`).join("");

  clearInterval(timerInterval);
  const endsAt = Date.now() + msg.remaining_ms;
  const total = msg.time_limit * 1000;
  const bar = $("#timebar");
  const draw = () => {
    const left = Math.max(0, endsAt - Date.now());
    bar.firstElementChild.style.width = (left / total * 100) + "%";
    bar.classList.toggle("urgent", left < 5000);
    if (left <= 0) {
      clearInterval(timerInterval);
      if (!locked) {
        document.querySelectorAll("#answerButtons .opt").forEach(b => b.disabled = true);
        $("#qText").textContent = "Time's up!";
      }
    }
  };
  draw();
  timerInterval = setInterval(draw, 200);
}

$("#answerButtons").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-opt]");
  if (!btn || locked || btn.disabled) return;
  locked = true;
  btn.classList.add("chosen");
  document.querySelectorAll("#answerButtons .opt").forEach(b => { if (b !== btn) b.classList.add("dim"); });
  socket.send({ action: "answer", option: btn.dataset.opt });
  if (navigator.vibrate) navigator.vibrate(40);
});

function onLocked(option) {
  locked = true;
  clearInterval(timerInterval);
  show("lockedView");
  $("#lockedText").textContent = `You chose ${option}. Let's see if you're right...`;
}

function onReveal(msg) {
  clearInterval(timerInterval);
  show("revealView");
  const you = msg.you;
  const card = $("#resultCard");
  if (!you.answered) {
    card.className = "result-card none";
    $("#resultTitle").textContent = "Time's up!";
    $("#resultPoints").textContent = "+0";
  } else if (you.correct) {
    card.className = "result-card good";
    $("#resultTitle").textContent = "Correct! ✔";
    $("#resultPoints").textContent = `+${you.points}`;
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
  } else {
    card.className = "result-card bad";
    $("#resultTitle").textContent = "Wrong ✖";
    $("#resultPoints").textContent = "+0";
  }
  let extra = "";
  if (you.fastest_bonus) extra = "⚡ Fastest correct answer! +100 bonus";
  else if (!you.correct) extra = `Answer: ${msg.correct}. ${msg.correct_text}`;
  else if (you.response_ms != null) extra = `Answered in ${(you.response_ms / 1000).toFixed(2)}s`;
  $("#resultExtra").textContent = extra;

  $("#myRank").innerHTML = you.rank ? `${ordinal(you.rank)}${moveBadge(you.rank_change)}` : "-";
  $("#myScore").textContent = you.score.toLocaleString();
  $("#board").innerHTML = renderLeaderboard(msg.leaderboard, { limit: 5, meId: you.id });
  // Make sure the player always sees their own row
  if (you.rank > 5) {
    const mine = msg.leaderboard.find(r => r.id === you.id);
    if (mine) $("#board").innerHTML += `<div class="muted center board-ellipsis">...</div>` +
      renderLeaderboard([mine], { meId: you.id });
  }
}

function onFinished(msg) {
  clearInterval(timerInterval);
  show("finishedView");
  $("#progress").textContent = "Final";
  const you = msg.you;
  $("#finalLine").textContent = you && you.rank
    ? `You finished ${ordinal(you.rank)} of ${msg.leaderboard.length} with ${you.score.toLocaleString()} points`
    : "";
  $("#podium").innerHTML = renderPodium(msg.podium);
  $("#finalBoard").innerHTML = renderLeaderboard(msg.leaderboard, { meId: you && you.id, showGain: false });
}
