const API = "http://localhost:5000";

let currentUrl = "";
let currentFormats = [];
let transcriptData = null;
let showTimestamps = false;

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
    showError("Não foi possível conectar ao servidor. Certifique-se de que o backend está rodando.");
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

  // Reseta transcrição
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

    const badge = f.height >= 1080 ? "HD" : f.height >= 720 ? "HD" : f.height >= 480 ? "SD" : "LD";
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 6a2 2 0 012-2h6l2 2h4a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
      </svg>
      ${f.label}
      <span class="format-badge">${badge}</span>
    `;
    btn.onclick = () => downloadVideo(f.height, btn);
    list.appendChild(btn);
  });
}

// ─── Download de vídeo ───────────────────────────────────────────────────────

async function downloadVideo(height, btn) {
  const progress = document.getElementById("videoProgress");
  document.querySelectorAll(".format-btn").forEach((b) => (b.disabled = true));
  progress.classList.remove("hidden");

  try {
    const res = await fetch(`${API}/api/download/video`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: currentUrl, height }),
    });

    if (!res.ok) {
      const data = await res.json();
      alert("Erro: " + (data.error || "Falha no download."));
      return;
    }

    const disposition = res.headers.get("Content-Disposition") || "";
    let filename = "video.mp4";
    const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)/i);
    if (match) filename = decodeURIComponent(match[1]);

    const blob = await res.blob();
    triggerDownload(blob, filename);
  } catch (e) {
    alert("Erro de conexão: " + e.message);
  } finally {
    document.querySelectorAll(".format-btn").forEach((b) => (b.disabled = false));
    progress.classList.add("hidden");
  }
}

// ─── Download de áudio ───────────────────────────────────────────────────────

async function downloadAudio() {
  const btn = document.querySelector(".btn-audio");
  const progress = document.getElementById("audioProgress");
  btn.disabled = true;
  progress.classList.remove("hidden");

  try {
    const res = await fetch(`${API}/api/download/audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: currentUrl }),
    });

    if (!res.ok) {
      const data = await res.json();
      alert("Erro: " + (data.error || "Falha no download."));
      return;
    }

    const disposition = res.headers.get("Content-Disposition") || "";
    let filename = "audio.mp3";
    const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)/i);
    if (match) filename = decodeURIComponent(match[1]);

    const blob = await res.blob();
    triggerDownload(blob, filename);
  } catch (e) {
    alert("Erro de conexão: " + e.message);
  } finally {
    btn.disabled = false;
    progress.classList.add("hidden");
  }
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
      .map(
        (e) =>
          `<span class="timestamp-line">[${e.time}]</span>${escapeHtml(e.text)}\n`
      )
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
  triggerDownload(blob, `${title}_transcricao.txt`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function triggerDownload(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelector(`.tab[data-tab="${name}"]`).classList.add("active");
  document.getElementById(`tab-${name}`).classList.add("active");
}

// Enter para buscar
document.getElementById("urlInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") fetchInfo();
});

// Auto-colar da área de transferência ao focar
document.getElementById("urlInput").addEventListener("focus", async () => {
  if (document.getElementById("urlInput").value) return;
  try {
    const text = await navigator.clipboard.readText();
    if (text.includes("youtube.com") || text.includes("youtu.be")) {
      document.getElementById("urlInput").value = text;
    }
  } catch (_) {}
});
