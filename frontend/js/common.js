// Shared helpers for all pages.

const $ = (sel, root = document) => root.querySelector(sel);
const API_BASE = String(window.DESK_DUEL_API_BASE || "").replace(/\/+$/, "");

function apiPath(path) {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

function esc(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

async function api(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(apiPath(path), {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const responseText = await res.text();
  try { data = responseText ? JSON.parse(responseText) : null; } catch (_) { /* non-JSON response */ }
  if (!res.ok) {
    let msg = res.status === 404
      ? (API_BASE
        ? `The configured backend (${API_BASE}) does not have this Desk Duel API route.`
        : "This site serves the Desk Duel frontend, but no API backend is configured. Set the backend URL in frontend/js/api-config.js.")
      : `Server request failed (${res.status}). Check the backend logs.`;
    if (data && typeof data.detail === "string") msg = data.detail;
    else if (data && Array.isArray(data.detail)) msg = data.detail.map(d => d.msg).join(", ");
    throw new Error(msg);
  }
  if (responseText && data === null) {
    throw new Error("The API returned a non-JSON response. Open the app through the FastAPI backend, not a static file server.");
  }
  return data;
}

function toast(message, ms = 2800) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function show(id) {
  document.querySelectorAll("[data-view]").forEach(v => v.classList.toggle("hidden", v.id !== id));
}

// Polls durable game state so host and players can connect to different
// serverless instances without losing the live match.
class LiveSocket {
  constructor(path, onMessage) {
    this.onMessage = onMessage;
    this.retries = 0;
    this.closedForGood = false;
    this.version = -1;
    this.banner = null;
    this.errorShown = false;
    const url = new URL(path, location.origin);
    const match = url.pathname.match(/^\/ws\/(host|player)\/([^/]+)$/);
    if (!match) {
      this.closedForGood = true;
      this.onMessage({ type: "fatal", message: "Invalid game connection." });
      return;
    }
    this.role = match[1];
    this.code = match[2];
    this.token = url.searchParams.get("token") || "";
    this.playerId = url.searchParams.get("player_id");
    this.poll();
  }

  async poll() {
    if (this.closedForGood) return;
    const params = new URLSearchParams({ role: this.role, token: this.token, since: String(this.version) });
    if (this.playerId) params.set("player_id", this.playerId);
    try {
      const state = await api(`/api/games/${encodeURIComponent(this.code)}/stream?${params}`);
      this.retries = 0;
      this.setBanner(false);
      this.version = Math.max(this.version, Number(state.version ?? this.version));
      if (["fatal", "kicked", "replaced"].includes(state.type)) {
        this.closedForGood = true;
        this.onMessage(state);
        return;
      }
      if (state.type !== "noop") this.onMessage(state);
      setTimeout(() => this.poll(), 800);
    } catch (error) {
      this.setBanner(true);
      if (!this.errorShown) {
        toast(error.message, 5000);
        this.errorShown = true;
      }
      const wait = Math.min(800 * 2 ** this.retries, 8000);
      this.retries += 1;
      setTimeout(() => this.poll(), wait);
    }
  }

  send(obj) {
    if (this.closedForGood) return;
    api(`/api/games/${encodeURIComponent(this.code)}/action`, {
      method: "POST",
      body: { ...obj, role: this.role, token: this.token, player_id: this.playerId ? Number(this.playerId) : obj.player_id },
    }).catch(error => this.onMessage({ type: "error", message: error.message }));
  }
  setBanner(on) {
    if (on && !this.banner) {
      this.banner = document.createElement("div");
      this.banner.className = "conn-banner";
      this.banner.textContent = "Connection lost - reconnecting...";
      document.body.appendChild(this.banner);
    } else if (!on && this.banner) {
      this.banner.remove();
      this.banner = null;
    }
  }
}

function moveBadge(change) {
  if (!change) return "";
  return change > 0
    ? `<span class="move up">&#9650;${change}</span>`
    : `<span class="move down">&#9660;${-change}</span>`;
}

function renderLeaderboard(rows, { limit = 20, meId = null, showGain = true } = {}) {
  return `<ol class="leaderboard">${rows.slice(0, limit).map((r, i) => `
    <li class="lb-row ${r.id === meId ? "me" : ""}" style="animation-delay:${i * 45}ms">
      <span class="rank r${r.rank ?? i + 1}">${r.rank ?? i + 1}</span>
      <span class="name">${esc(r.name)}${moveBadge(r.rank_change)}</span>
      ${showGain ? `<span class="gain ${r.last_points ? "" : "zero"}">${r.last_points ? "+" + r.last_points : "+0"}</span>` : "<span></span>"}
      <span class="score">${r.score.toLocaleString()}</span>
    </li>`).join("")}</ol>`;
}

function renderPodium(top) {
  const order = [top[1], top[0], top[2]];
  const cls = ["p2", "p1", "p3"];
  const label = ["2", "1", "3"];
  return `<div class="podium">${order.map((p, i) => p ? `
    <div class="place ${cls[i]}">
      ${cls[i] === "p1" ? '<div class="crown">&#128081;</div>' : ""}
      <div class="pname">${esc(p.name)}</div>
      <div class="pscore">${p.score.toLocaleString()} pts</div>
      <div class="block">${label[i]}</div>
    </div>` : "").join("")}</div>`;
}

// Tiny sound effects made with the Web Audio API (no files needed).
const Sound = {
  ctx: null,
  muted: false,
  tone(freq, dur = 0.12, type = "sine", vol = 0.15, delay = 0) {
    if (this.muted) return;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type; osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t); osc.stop(t + dur);
    } catch (_) { /* audio not available */ }
  },
  tick() { this.tone(880, 0.06, "square", 0.05); },
  join() { this.tone(660, 0.1); this.tone(990, 0.12, "sine", 0.15, 0.1); },
  reveal() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.16, "triangle", 0.15, i * 0.1)); },
  fanfare() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.22, "triangle", 0.16, i * 0.15)); },
};
