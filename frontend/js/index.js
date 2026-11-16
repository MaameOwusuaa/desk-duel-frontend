const params = new URLSearchParams(location.search);
const codeInput = $("#code");
const nameInput = $("#name");

if (params.get("code")) {
  codeInput.value = params.get("code");
  nameInput.focus();
} else {
  codeInput.focus();
}
nameInput.value = localStorage.getItem("quiz_last_name") || "";

codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.replace(/\D/g, "");
});

$("#joinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = $("#joinError");
  error.classList.add("hidden");
  const code = codeInput.value.trim();
  const name = nameInput.value.trim();

  if (code.length !== 6) {
    error.textContent = "The game code has 6 digits.";
    error.classList.remove("hidden");
    return;
  }

  $("#joinBtn").disabled = true;
  try {
    const result = await api(`/api/games/${code}/join`, { method: "POST", body: { name } });
    sessionStorage.setItem("quiz_player", JSON.stringify(result));
    localStorage.setItem("quiz_last_name", result.name);
    location.href = "/frontend/play.html";
  } catch (error) {
    $("#joinError").textContent = error.message;
    $("#joinError").classList.remove("hidden");
    $("#joinBtn").disabled = false;
  }
});
