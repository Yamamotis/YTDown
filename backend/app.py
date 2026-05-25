import os
import re
import json
import tempfile
import threading
from flask import Flask, request, jsonify, send_file, after_this_request
from flask_cors import CORS
import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import NoTranscriptFound, TranscriptsDisabled

app = Flask(__name__)
CORS(app)

DOWNLOAD_FOLDER = os.path.join(os.path.dirname(__file__), "downloads")
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)


def extract_video_id(url: str) -> str | None:
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


def delete_file_later(path: str, delay: int = 60):
    """Deleta o arquivo após `delay` segundos."""
    def _delete():
        import time
        time.sleep(delay)
        try:
            if os.path.exists(path):
                os.remove(path)
        except Exception:
            pass
    t = threading.Thread(target=_delete, daemon=True)
    t.start()


@app.route("/api/info", methods=["POST"])
def get_info():
    """Retorna informações do vídeo (título, thumbnail, formatos disponíveis)."""
    data = request.get_json()
    url = data.get("url", "").strip()
    if not url:
        return jsonify({"error": "URL não informada."}), 400

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

        formats = []
        seen = set()
        for f in info.get("formats", []):
            height = f.get("height")
            ext = f.get("ext")
            vcodec = f.get("vcodec", "none")
            acodec = f.get("acodec", "none")
            if height and vcodec != "none" and ext in ("mp4", "webm"):
                label = f"{height}p"
                if label not in seen:
                    seen.add(label)
                    formats.append({
                        "label": label,
                        "height": height,
                        "ext": ext,
                    })

        formats.sort(key=lambda x: x["height"], reverse=True)

        # Remove duplicados mantendo mp4 preferido
        unique_formats = {}
        for f in formats:
            h = f["height"]
            if h not in unique_formats or f["ext"] == "mp4":
                unique_formats[h] = f
        formats = sorted(unique_formats.values(), key=lambda x: x["height"], reverse=True)

        return jsonify({
            "title": info.get("title"),
            "thumbnail": info.get("thumbnail"),
            "duration": info.get("duration"),
            "channel": info.get("uploader"),
            "formats": formats,
            "video_id": extract_video_id(url),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/download/video", methods=["POST"])
def download_video():
    """Faz download do vídeo na qualidade escolhida."""
    data = request.get_json()
    url = data.get("url", "").strip()
    height = data.get("height", 720)

    if not url:
        return jsonify({"error": "URL não informada."}), 400

    output_path = os.path.join(DOWNLOAD_FOLDER, "%(title)s.%(ext)s")

    # Formato sem FFmpeg: prefere MP4 já pronto com áudio embutido
    # Fallback progressivo até encontrar algo disponível
    fmt = (
        f"best[height<={height}][ext=mp4]"
        f"/best[height<={height}]"
        f"/best[ext=mp4]"
        f"/best"
    )

    ydl_opts = {
        "format": fmt,
        "outtmpl": output_path,
        "quiet": True,
        "no_warnings": True,
        # Sem postprocessors que exijam FFmpeg
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)

        if not os.path.exists(filename):
            title = info.get("title", "video")
            for f in os.listdir(DOWNLOAD_FOLDER):
                if title[:20] in f:
                    filename = os.path.join(DOWNLOAD_FOLDER, f)
                    break

        ext = os.path.splitext(filename)[1].lstrip(".")
        mime = "video/mp4" if ext == "mp4" else "video/webm" if ext == "webm" else "video/mp4"

        delete_file_later(filename, delay=120)
        return send_file(
            filename,
            as_attachment=True,
            download_name=os.path.basename(filename),
            mimetype=mime,
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/download/audio", methods=["POST"])
def download_audio():
    """Faz download do áudio em MP3."""
    data = request.get_json()
    url = data.get("url", "").strip()

    if not url:
        return jsonify({"error": "URL não informada."}), 400

    output_path = os.path.join(DOWNLOAD_FOLDER, "%(title)s.%(ext)s")

    # Prefere M4A (compatível com qualquer player), depois opus/webm, depois qualquer coisa
    ydl_opts = {
        "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
        "outtmpl": output_path,
        "quiet": True,
        "no_warnings": True,
        # Sem FFmpegExtractAudio — não precisa de FFmpeg instalado
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)

        if not os.path.exists(filename):
            title = info.get("title", "audio")
            for f in os.listdir(DOWNLOAD_FOLDER):
                if f.endswith((".m4a", ".webm", ".opus")) and title[:20] in f:
                    filename = os.path.join(DOWNLOAD_FOLDER, f)
                    break

        ext = os.path.splitext(filename)[1].lstrip(".")
        mime_map = {"m4a": "audio/mp4", "webm": "audio/webm", "opus": "audio/ogg"}
        mime = mime_map.get(ext, "audio/mp4")

        delete_file_later(filename, delay=120)
        return send_file(
            filename,
            as_attachment=True,
            download_name=os.path.basename(filename),
            mimetype=mime,
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/transcript", methods=["POST"])
def get_transcript():
    """Retorna a transcrição do vídeo."""
    data = request.get_json()
    url = data.get("url", "").strip()

    if not url:
        return jsonify({"error": "URL não informada."}), 400

    video_id = extract_video_id(url)
    if not video_id:
        return jsonify({"error": "ID do vídeo não encontrado na URL."}), 400

    try:
        ytt_api = YouTubeTranscriptApi()

        # Lista transcrições disponíveis
        transcript_list = ytt_api.list(video_id)

        transcript = None
        lang_used = None

        # Tenta idiomas preferidos: pt, pt-BR, en, en-US
        for lang in ["pt", "pt-BR", "en", "en-US"]:
            try:
                transcript = transcript_list.find_transcript([lang])
                lang_used = lang
                break
            except Exception:
                continue

        # Se não achou, pega o primeiro disponível
        if transcript is None:
            for t in transcript_list:
                transcript = t
                lang_used = t.language_code
                break

        if transcript is None:
            return jsonify({"error": "Nenhuma transcrição disponível para este vídeo."}), 404

        fetched = transcript.fetch()

        # FetchedTranscript é iterável — cada item tem .text, .start, .duration
        entries_raw = list(fetched)
        full_text = " ".join([e.text for e in entries_raw])

        # Monta lista com timestamps
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
        return jsonify({"error": "As transcrições estão desativadas para este vídeo."}), 404
    except NoTranscriptFound:
        return jsonify({"error": "Nenhuma transcrição encontrada para este vídeo."}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
