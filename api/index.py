import re
from flask import Flask, request, jsonify
from flask_cors import CORS
import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import NoTranscriptFound, TranscriptsDisabled

app = Flask(__name__)
CORS(app)


def extract_video_id(url: str):
    patterns = [
        r"(?:v=|\/)([0-9A-Za-z_-]{11}).*",
        r"youtu\.be\/([0-9A-Za-z_-]{11})",
        r"embed\/([0-9A-Za-z_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


# ─── Info ────────────────────────────────────────────────────────────────────

@app.route("/api/info", methods=["POST"])
def get_info():
    data = request.get_json()
    url = data.get("url", "").strip()
    if not url:
        return jsonify({"error": "URL não informada."}), 400

    ydl_opts = {"quiet": True, "no_warnings": True, "skip_download": True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        formats = {}
        for f in info.get("formats", []):
            height = f.get("height")
            vcodec = f.get("vcodec", "none")
            if height and vcodec != "none":
                if height not in formats or f.get("ext") == "mp4":
                    formats[height] = {
                        "label": f"{height}p",
                        "height": height,
                        "ext": f.get("ext"),
                    }

        sorted_formats = sorted(formats.values(), key=lambda x: x["height"], reverse=True)

        return jsonify({
            "title": info.get("title"),
            "thumbnail": info.get("thumbnail"),
            "duration": info.get("duration"),
            "channel": info.get("uploader"),
            "formats": sorted_formats,
            "video_id": extract_video_id(url),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── URL direta de vídeo (sem proxying — browser baixa direto do YouTube) ───

@app.route("/api/download/video", methods=["POST"])
def get_video_url():
    data = request.get_json()
    url = data.get("url", "").strip()
    height = data.get("height", 720)

    if not url:
        return jsonify({"error": "URL não informada."}), 400

    # Busca formato já pronto (vídeo + áudio embutidos, sem precisar de merge)
    fmt = (
        f"best[height<={height}][ext=mp4]"
        f"/best[height<={height}]"
        f"/best[ext=mp4]"
        f"/best"
    )

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "format": fmt,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        # Encontra o formato selecionado
        selected = info.get("requested_formats") or [info]
        fmt_info = selected[0] if selected else info

        direct_url = fmt_info.get("url") or info.get("url")
        if not direct_url:
            return jsonify({"error": "URL do vídeo não encontrada."}), 500

        title = info.get("title", "video")
        ext = fmt_info.get("ext", "mp4")

        return jsonify({
            "url": direct_url,
            "filename": f"{title}.{ext}",
            "ext": ext,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── URL direta de áudio ─────────────────────────────────────────────────────

@app.route("/api/download/audio", methods=["POST"])
def get_audio_url():
    data = request.get_json()
    url = data.get("url", "").strip()

    if not url:
        return jsonify({"error": "URL não informada."}), 400

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        selected = info.get("requested_formats") or [info]
        fmt_info = selected[0] if selected else info

        direct_url = fmt_info.get("url") or info.get("url")
        if not direct_url:
            return jsonify({"error": "URL do áudio não encontrada."}), 500

        title = info.get("title", "audio")
        ext = fmt_info.get("ext", "m4a")

        return jsonify({
            "url": direct_url,
            "filename": f"{title}.{ext}",
            "ext": ext,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Transcrição ─────────────────────────────────────────────────────────────

@app.route("/api/transcript", methods=["POST"])
def get_transcript():
    data = request.get_json()
    url = data.get("url", "").strip()

    if not url:
        return jsonify({"error": "URL não informada."}), 400

    video_id = extract_video_id(url)
    if not video_id:
        return jsonify({"error": "ID do vídeo não encontrado na URL."}), 400

    try:
        ytt_api = YouTubeTranscriptApi()
        transcript_list = ytt_api.list(video_id)

        transcript = None
        lang_used = None

        for lang in ["pt", "pt-BR", "en", "en-US"]:
            try:
                transcript = transcript_list.find_transcript([lang])
                lang_used = lang
                break
            except Exception:
                continue

        if transcript is None:
            for t in transcript_list:
                transcript = t
                lang_used = t.language_code
                break

        if transcript is None:
            return jsonify({"error": "Nenhuma transcrição disponível."}), 404

        entries_raw = list(transcript.fetch())
        full_text = " ".join([e.text for e in entries_raw])

        timestamped = []
        for e in entries_raw:
            mins = int(e.start // 60)
            secs = int(e.start % 60)
            timestamped.append({
                "time": f"{mins:02d}:{secs:02d}",
                "start": e.start,
                "text": e.text,
            })

        return jsonify({
            "language": lang_used,
            "full_text": full_text,
            "entries": timestamped,
        })

    except TranscriptsDisabled:
        return jsonify({"error": "Transcrições desativadas para este vídeo."}), 404
    except NoTranscriptFound:
        return jsonify({"error": "Nenhuma transcrição encontrada."}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


# Ponto de entrada para Vercel
handler = app
