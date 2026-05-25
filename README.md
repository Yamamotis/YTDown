# 🎬 YT Downloader

Site local para baixar vídeos, áudio e transcrições do YouTube.

## ✨ Funcionalidades

| Recurso | Detalhes |
|---|---|
| 🎬 **Vídeo** | Todas as qualidades disponíveis (até 4K), formato MP4 |
| 🎵 **Áudio MP3** | Extrai o áudio em MP3 192kbps |
| 📝 **Transcrição** | Texto completo com ou sem timestamps, exportável em .txt |

## 🚀 Como usar

### 1. Instalar (só na primeira vez)

Dê duplo clique em **`instalar.bat`**

> Requisito: [Python 3.9+](https://python.org/downloads) instalado

### 2. Iniciar

Dê duplo clique em **`iniciar.bat`**

O site abre automaticamente no navegador!

## 📁 Estrutura

```
videodownloader/
├── backend/
│   ├── app.py           # Servidor Flask
│   ├── requirements.txt # Dependências Python
│   └── downloads/       # Arquivos temporários (auto-deletados)
├── frontend/
│   ├── index.html       # Interface do site
│   ├── style.css        # Estilos
│   └── script.js        # Lógica do frontend
├── instalar.bat         # Instala dependências
└── iniciar.bat          # Inicia o servidor e abre o site
```

## ⚠️ Observações

- Para download de vídeo/áudio, o **FFmpeg** precisa estar instalado e no PATH
  - [Baixar FFmpeg](https://ffmpeg.org/download.html) → extrair → adicionar ao PATH
- A transcrição só funciona em vídeos que têm legendas ativadas no YouTube
- Use apenas para fins pessoais e educacionais
