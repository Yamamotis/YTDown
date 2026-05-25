const API = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:5000"
  : "";

let currentUrl = "";
let currentFormats = [];
let transcriptData = null;
let showTimestamps = false;

// Ação pendente para executar após o captcha
let pendingDownload = null;
let countdownTimer = null;

// ─── Utilitários ────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function showError(msg) {
  const el = document.getElementById("urlError");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideError() {
  document.getElementById("urlError").classList.add("hidden");
}

function setSearchLoading(loading) {
  const btn = document.getElementById("searchBtn");
  const txt = document.getElementById("searchBtnText");
  const spin = document.getElementById("searchSpinner");
  btn.disabled = loading;
  txt.textContent = loading ? "Buscando..." : "Buscar";
  spin.classList.toggle("hidden", !loading);
}

// ─── Modal de verificação ─────────────────────────────────────────────────

function openDownloadModal(downloadFn) {
  // Salva a função de download para executar após o captcha
  pendingDownload = downloadFn;

  // Reseta para etapa 1 (captcha)
  showStep("stepCaptcha");

  // Reseta o widget do captcha (necessário para re-abrir)
  if (window.grecaptcha) {
    try { grecaptcha.reset(); } catch (e) {}
  }

  // Abre o modal
  document.getElementById("downloadModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  document.getElementById("downloadModal").classList.add("hidden");
  document.body.style.overflow = "";
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  pendingDownload = null;
}

function handleOverlayClick(e) {
  // Fecha se clicar fora do card
  if (e.target === document.getElementById("downloadModal")) closeModal();
}

function showStep(stepId) {
  ["stepCaptcha", "stepCountdown", "stepDone"].forEach(id => {
    document.getElementById(id).classList.add("hidden");
  });
  document.getElementById(stepId).classList.remove("hidden");
}

// Chamada pelo reCAPTCHA quando resolvido
function onCaptchaSuccess(token) {
  showStep("stepCountdown");
  startCountdown(5);
}

function startCountdown(total) {
  let remaining = total;
  const ring = document.getElementById("countdownRing");
  const numEl = document.getElementById("countdownNumber");
  const circumference = 251.2; // 2 * π * r (r=40)

  function update() {
    numEl.textContent = remaining;
    // Preenche o anel proporcionalmente
    const offset = circumference * (1 - remaining / total);
    ring.style.strokeDashoffset = offset;

    if (remaining <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
      triggerPendingDownload();
      return;
    }
    remaining--;
  }

  update(); // roda imediatamente (mostra "5")
  countdownTimer = setInterval(update, 1000);
}

async function triggerPendingDownload() {
  showStep("stepDone");

  if (pendingDownload) {
    await pendingDownload();
  }
}

function retryDownload() {
  if (pendingDownload) pendingDownload();
}

// ─── Buscar informações do vídeo ─────────────────────────────────────────────

async function fetchInfo() {
  const url = document.getElementById("urlInput").value.trim();
  if (!url) { showError("Cole um link do YouTube."); return; }
  hideError();

  currentUrl = url;
  setSearchLoading(true);
  document.getElementById("resultCard").classList.add("hidden");

  try {
    const res = await fetch(`${API}/api/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      showError(data.error || "Erro ao buscar vídeo.");
      return;
    }

    populateResult(data);
  } catch (e) {
    showError("Não foi possível conectar ao servidor.");
  } finally {
    setSearchLoading(false);
  }
}

function populateResult(data) {
  document.getElementById("thumbnail").src = data.thumbnail || "";
  document.getElementById("videoTitle").textContent = data.title || "Sem título";
  document.getElementById("videoChannel").textContent = data.channel ? `📺 ${data.channel}` : "";
  document.getElementById("videoDuration").textContent = data.duration ? `⏱ ${formatDuration(data.duration)}` : "";

  currentFormats = data.formats || [];
  buildFormatList();

  transcriptData = null;
  document.getElementById("transcriptResult").classList.add("hidden");
  document.getElementById("transcriptLoading").classList.add("hidden");

  document.getElementById("resultCard").classList.remove("hidden");
  document.getElementById("resultCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function buildFormatList() {
  const list = document.getElementById("formatList");
  list.innerHTML = "";

  if (currentFormats.length === 0) {
    list.innerHTML = `<p style="color:var(--text-muted);font-size:.88rem;">Nenhum formato encontrado.</p>`;
    return;
  }

  currentFormats.forEach((f) => {
    const btn = document.createElement("button");
    btn.className = "format-btn";
    const badge = f.height >= 720 ? "HD" : f.height >= 480 ? "SD" : "LD";
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 6a2 2 0 012-2h6l2 2h4a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
      </svg>
      ${f.label}
      <span class="format-badge">${badge}</span>
    `;
    // Abre o modal de verificação antes de baixar
    btn.onclick = () => openDownloadModal(() => downloadVideo(f.height));
    list.appendChild(btn);
  });
}

// ─── Download de vídeo ───────────────────────────────────────────────────────

async function downloadVideo(height) {
  const progress = document.getElementById("videoProgress");
  progress.classList.remove("hidden");

  try {
    const res = await fetch(`${API}/api/download/video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: currentUrl, height }),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      alert("Erro: " + (data.error || "Falha ao obter link."));
      return;
    }

    openDirectDownload(data.url, data.filename);
  } catch (e) {
    alert("Erro de conexão: " + e.message);
  } finally {
    progress.classList.add("hidden");
  }
}

// ─── Download de áudio ───────────────────────────────────────────────────────

async function downloadAudio() {
  // Abre o modal de verificação antes de baixar
  openDownloadModal(_downloadAudio);
}

async function _downloadAudio() {
  const progress = document.getElementById("audioProgress");
  progress.classList.remove("hidden");

  try {
    const res = await fetch(`${API}/api/download/audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: currentUrl }),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      alert("Erro: " + (data.error || "Falha ao obter link."));
      return;
    }

    openDirectDownload(data.url, data.filename);
  } catch (e) {
    alert("Erro de conexão: " + e.message);
  } finally {
    progress.classList.add("hidden");
  }
}

function openDirectDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 500);
}

// ─── Transcrição ─────────────────────────────────────────────────────────────

async function fetchTranscript() {
  const btn = document.querySelector(".btn-transcript");
  const loading = document.getElementById("transcriptLoading");
  const result = document.getElementById("transcriptResult");

  btn.disabled = true;
  loading.classList.remove("hidden");
  result.classList.add("hidden");

  try {
    const res = await fetch(`${API}/api/transcript`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: currentUrl }),
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      alert("Erro: " + (data.error || "Transcrição não disponível."));
      return;
    }

    transcriptData = data;
    renderTranscript();
    result.classList.remove("hidden");

    const langMap = { pt: "Português", "pt-BR": "Português (BR)", en: "English", "en-US": "English (US)" };
    document.getElementById("transcriptLang").textContent =
      `🌐 ${langMap[data.language] || data.language}`;
  } catch (e) {
    alert("Erro de conexão: " + e.message);
  } finally {
    btn.disabled = false;
    loading.classList.add("hidden");
  }
}

function renderTranscript() {
  if (!transcriptData) return;
  const container = document.getElementById("transcriptContent");
  if (showTimestamps) {
    container.innerHTML = transcriptData.entries
      .map((e) => `<span class="timestamp-line">[${e.time}]</span>${escapeHtml(e.text)}\n`)
      .join("");
  } else {
    container.textContent = transcriptData.full_text;
  }
}

function toggleTimestamps() {
  showTimestamps = !showTimestamps;
  const btn = document.getElementById("btnTimestamps");
  btn.classList.toggle("active", showTimestamps);
  btn.textContent = showTimestamps ? "⏱ Com timestamps" : "📄 Texto puro";
  renderTranscript();
}

function copyTranscript() {
  if (!transcriptData) return;
  const text = showTimestamps
    ? transcriptData.entries.map((e) => `[${e.time}] ${e.text}`).join("\n")
    : transcriptData.full_text;
  navigator.clipboard.writeText(text).then(() => {
    const btn = event.target;
    const orig = btn.textContent;
    btn.textContent = "✅ Copiado!";
    setTimeout(() => (btn.textContent = orig), 1500);
  });
}

function downloadTranscript() {
  if (!transcriptData) return;
  const text = showTimestamps
    ? transcriptData.entries.map((e) => `[${e.time}] ${e.text}`).join("\n")
    : transcriptData.full_text;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const title = document.getElementById("videoTitle").textContent.slice(0, 40);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${title}_transcricao.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelector(`.tab[data-tab="${name}"]`).classList.add("active");
  document.getElementById(`tab-${name}`).classList.add("active");
}

// Fechar modal com ESC
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

document.getElementById("urlInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") fetchInfo();
});

document.getElementById("urlInput").addEventListener("focus", async () => {
  if (document.getElementById("urlInput").value) return;
  try {
    const text = await navigator.clipboard.readText();
    if (text.includes("youtube.com") || text.includes("youtu.be")) {
      document.getElementById("urlInput").value = text;
    }
  } catch (_) {}
});
