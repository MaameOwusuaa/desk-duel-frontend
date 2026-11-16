// Question Bank page: list, add, edit, delete, CSV import and game history.

let pin = sessionStorage.getItem("quiz_admin_pin") || "";
let questions = [];
const optColor = { A: "var(--opt-a)", B: "var(--opt-b)", C: "var(--opt-c)", D: "var(--opt-d)" };

const adminHeaders = () => ({ "X-Admin-Pin": pin });

// ---------- tabs ----------
function openTab(id) {
  document.querySelectorAll("[data-tabpanel]").forEach(p => p.classList.toggle("hidden", p.id !== id));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === id));
  if (id === "historyTab") loadHistory();
}
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => openTab(t.dataset.tab)));

// ---------- PIN ----------
async function checkPin() {
  const info = await api("/api/server-info");
  if (!info.admin_pin_required) return;
  if (pin) {
    try { await api("/api/admin/check", { method: "POST", body: { pin } }); return; }
    catch (_) { pin = ""; }
  }
  $("#pinCard").classList.remove("hidden");
}
$("#pinBtn").addEventListener("click", async () => {
  try {
    await api("/api/admin/check", { method: "POST", body: { pin: $("#pinInput").value } });
    pin = $("#pinInput").value;
    sessionStorage.setItem("quiz_admin_pin", pin);
    $("#pinCard").classList.add("hidden");
    toast("Unlocked");
  } catch (e) { toast(e.message); }
});

// ---------- list ----------
async function loadCategories() {
  const data = await api("/api/categories");
  const filter = $("#filter");
  const current = filter.value;
  filter.innerHTML = `<option value="">All categories (${data.total})</option>` +
    data.categories.map(c => `<option value="${esc(c.category)}">${esc(c.category)} (${c.total})</option>`).join("");
  filter.value = current;
  $("#catList").innerHTML = data.categories.map(c => `<option value="${esc(c.category)}">`).join("");
}

async function loadQuestions() {
  const cat = $("#filter").value;
  questions = await api("/api/questions" + (cat ? `?category=${encodeURIComponent(cat)}` : ""));
  $("#listCount").textContent = `${questions.length} question${questions.length === 1 ? "" : "s"}`;
  $("#qBody").innerHTML = questions.map(q => `
    <tr>
      <td>${esc(q.category)}</td>
      <td style="min-width:220px">${esc(q.question_text)}</td>
      <td>${esc(q.option_a)}</td><td>${esc(q.option_b)}</td><td>${esc(q.option_c)}</td><td>${esc(q.option_d)}</td>
      <td><span class="ans" style="background:${optColor[q.correct_option]}">${q.correct_option}</span></td>
      <td style="white-space:nowrap">
        <button class="btn ghost small" data-edit="${q.id}">Edit</button>
        <button class="btn danger small" data-del="${q.id}">Delete</button>
      </td>
    </tr>`).join("") || `<tr><td colspan="8" class="muted">No questions yet.</td></tr>`;
}

$("#filter").addEventListener("change", loadQuestions);

$("#qBody").addEventListener("click", async (e) => {
  const editId = e.target.getAttribute("data-edit");
  const delId = e.target.getAttribute("data-del");
  if (editId) {
    const q = questions.find(x => x.id === Number(editId));
    $("#qId").value = q.id;
    $("#qCategory").value = q.category;
    $("#qTextIn").value = q.question_text;
    $("#qA").value = q.option_a; $("#qB").value = q.option_b;
    $("#qC").value = q.option_c; $("#qD").value = q.option_d;
    $("#qCorrect").value = q.correct_option;
    $("#formTitle").textContent = "Edit question";
    $("#formTabBtn").textContent = "Edit question";
    openTab("formTab");
  }
  if (delId) {
    const btn = e.target;
    if (btn.dataset.confirm !== "1") {   // click twice to delete (no pop-up needed)
      btn.dataset.confirm = "1";
      btn.textContent = "Sure?";
      setTimeout(() => { btn.dataset.confirm = ""; btn.textContent = "Delete"; }, 3000);
      return;
    }
    try {
      await api(`/api/questions/${delId}`, { method: "DELETE", headers: adminHeaders() });
      toast("Question deleted");
      await Promise.all([loadQuestions(), loadCategories()]);
    } catch (ex) { toast(ex.message); }
  }
});

// ---------- add / edit ----------
function resetForm() {
  $("#qForm").reset();
  $("#qId").value = "";
  $("#formTitle").textContent = "Add a question";
  $("#formTabBtn").textContent = "Add question";
  $("#formError").classList.add("hidden");
}
$("#cancelEdit").addEventListener("click", resetForm);

$("#qForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    category: $("#qCategory").value, question_text: $("#qTextIn").value,
    option_a: $("#qA").value, option_b: $("#qB").value, option_c: $("#qC").value, option_d: $("#qD").value,
    correct_option: $("#qCorrect").value,
  };
  const id = $("#qId").value;
  try {
    await api(id ? `/api/questions/${id}` : "/api/questions",
      { method: id ? "PUT" : "POST", body, headers: adminHeaders() });
    toast(id ? "Question updated" : "Question added");
    const keepCategory = body.category;
    resetForm();
    $("#qCategory").value = keepCategory;   // handy when adding several in a row
    await Promise.all([loadQuestions(), loadCategories()]);
    if (id) openTab("listTab"); else $("#qTextIn").focus();
  } catch (ex) {
    $("#formError").textContent = ex.message;
    $("#formError").classList.remove("hidden");
  }
});

// ---------- import ----------
$("#csvFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) $("#csvText").value = await file.text();
});

$("#importBtn").addEventListener("click", async () => {
  const out = $("#importResult");
  try {
    const res = await api("/api/questions/import",
      { method: "POST", body: { csv: $("#csvText").value }, headers: adminHeaders() });
    out.innerHTML = `<p><b>${res.added}</b> question(s) added.</p>` +
      (res.errors.length ? `<div class="error-msg">${res.errors.map(esc).join("<br>")}</div>` : "");
    await Promise.all([loadQuestions(), loadCategories()]);
  } catch (ex) {
    out.innerHTML = `<div class="error-msg">${esc(ex.message)}</div>`;
  }
});

// ---------- history ----------
async function loadHistory() {
  const rows = await api("/api/history");
  $("#historyBody").innerHTML = rows.map(g => `
    <tr>
      <td><b>${esc(g.code)}</b></td><td>${esc(g.host_name)}</td><td>${esc(g.category || "All")}</td>
      <td>${g.num_questions}</td><td>${g.players}</td><td>${esc(g.winner || "-")}</td>
      <td>${esc(g.status.replace("_", " "))}</td>
      <td class="muted">${esc(new Date(g.created_at).toLocaleString())}</td>
    </tr>`).join("") || `<tr><td colspan="8" class="muted">No games played yet.</td></tr>`;
}

// ---------- start ----------
(async function init() {
  try {
    await checkPin();
    await loadCategories();
    await loadQuestions();
  } catch (e) {
    toast("Could not load questions: " + e.message, 5000);
  }
})();
