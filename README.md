# Xiangcaoshan（香草山）

[xiangcaoshan.netlify.app](https://xiangcaoshan.netlify.app/) is a quiet reading and listening site for Christian literature, music, and children’s resources. It is built as a Hugo static site, with book and music media stored outside the repository and served through small Netlify functions.

The project emphasizes long-form reading: books are organized by author and title, chapters are written in Markdown, and many passages can be followed with recorded audio.

## Current Features

- Bookshelf with title, author, grouped-author, and author-filter views
- Chapter-based reading pages with explicit previous/next navigation
- Responsive layouts tested at narrow mobile, tablet, and desktop widths
- Mobile navigation and table of contents that preserve the reader’s scroll position
- Accessible navigation dialogs, focus handling, keyboard controls, and larger touch targets
- Mobile reading controls that hide while scrolling and return after a tap or keyboard action
- Chapter audio with lazy metadata loading and sequential playback on multi-audio pages
- Optional paragraph-level highlighting synchronized to an audio recording
- Music folders, numeric/title sorting, pagination, cached API responses, and lazy thumbnails
- Children’s section for family-friendly Christian learning material
- Installable PWA metadata and a runtime-cache service worker
- Netlify functions for book-audio redirects and music-library data

## Technology and Architecture

- **Hugo Extended** builds the site from Markdown and the local `my-book` theme.
- **Vanilla JavaScript and SCSS** provide the bookshelf, music library, reading controls, audio playback, and text synchronization.
- **Netlify Functions** expose lightweight endpoints for audio redirects and paginated music metadata.
- **Alibaba Cloud OSS** stores the published audio and video assets; large media files are not committed to this repository.
- **faster-whisper** can generate paragraph-level audio timing data locally. It does not require a hosted AI API.

## Project Structure

```text
content/                     Site pages and Markdown content
content/books/               Book directories, indexes, and chapters
content/music/               Music section entry page
content/children/            Children’s section
layouts/                     Hugo overrides and shortcodes
themes/my-book/              Local Hugo theme, SCSS, PWA manifest, and service worker
static/js/                   Browser-side reading, audio, bookshelf, and music code
static/audio-sync/           Published paragraph-level audio timing JSON
netlify/functions/           Audio redirect and music-library functions
scripts/                     Local content-preparation tools
├─ generate_audio_sync.py    Local Whisper alignment tool
├─ requirements-audio-sync.txt
└─ README-audio-sync.md      Detailed audio-sync and review workflow
hugo.toml                    Site configuration and feature flags
package.json                 Node dependencies used by the deployment tooling
```

## Local Development

### Prerequisites

- A recent **Hugo Extended** release
- **Node.js/npm** when working on Netlify functions or deployment dependencies
- **Python 3.11** only when generating audio synchronization data

Install the Node dependencies when needed:

```bash
npm install
```

Start Hugo without writing a local `public/` directory:

```bash
hugo server --renderToMemory --noHTTPCache --port 1313
```

Then open [http://localhost:1313](http://localhost:1313).

During `hugo server`, chapter audio is loaded through the deployed Netlify audio endpoint configured by `params.integration.audio.previewFunctionBase`. Production builds continue to use the same-origin `/.netlify/functions/audio` endpoint. Local audio playback therefore requires an internet connection, but does not require Netlify Functions to run locally.

Create a production build with:

```bash
hugo --minify
```

## Books and Chapter Audio

Each book lives under `content/books/<book name>/`. A typical book contains an `_index.md` introduction and one or more chapter Markdown files. Some books also use front matter such as `footer_button_prev`, `footer_button_next`, or `bookPaginationStep` to define non-standard reading order.

Add a recording to a chapter with the audio shortcode:

```go-html-template
{{< audio src="01/1.mp3" >}}
```

The audio function resolves this to the object-storage path:

```text
audio/<book slug>/01/1.mp3
```

The function validates the requested book and source path, then redirects to OSS. It requires these Netlify environment variables:

- `OSS_BUCKET`
- `OSS_ENDPOINT`

The source MP3 files are intentionally kept outside Git. Keep their local preparation structure aligned with the shortcode path:

```text
audio/
└─ 效法基督/
   └─ 01/
      └─ 1.mp3
```

## Paragraph-Level Audio Highlighting

An audio shortcode can reference generated synchronization data:

```go-html-template
{{< audio src="01/1.mp3" sync="/audio-sync/效法基督/chapter/audio-01.json" >}}
```

While the recording plays, the matching heading or paragraph receives a visual highlight. The timing is intentionally paragraph-level: it is easier to review and maintain than word-perfect subtitles.

The included Python tool uses local `faster-whisper` transcription and sequential fuzzy matching against the original Markdown. It handles ordinary single-audio chapters, pages containing many recordings, and common spoken introductions that repeat the chapter title.

Generated synchronization data is treated as reviewable content rather than a finished subtitle track. A low-confidence warning can be caused by a proper name or recognition error even when its timing is correct, while an unmatched Markdown unit may be a real alignment problem or text that the recording never reads, such as a translator’s note or back-cover copy. Review warnings, chapter openings, section transitions, and endings before committing a book.

Create an isolated environment and install the dependency:

```powershell
py -3.11 -m venv .venv-audio-sync
.\.venv-audio-sync\Scripts\python.exe -m pip install `
  -r scripts\requirements-audio-sync.txt
```

Check one book’s file mapping without transcribing:

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py `
  --audio-root "D:\audio" `
  --book "效法基督" `
  --scan
```

Generate one page without changing its Markdown:

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\generate_audio_sync.py `
  --audio-root "D:\audio" `
  --book "效法基督" `
  --page "scroll1/01_02" `
  --model base
```

After reviewing `.audio-sync-cache/last-report.json` and sampling the generated cue boundaries, add `--write` to update the audio shortcode. Generated JSON under `static/audio-sync/` belongs in Git; MP3 files, Whisper models, transcripts, `.audio-sync-cache/`, virtual environments, and `.tmp/` files do not.

See [scripts/README-audio-sync.md](scripts/README-audio-sync.md) for complete setup, model selection, batch-processing, cache, and offline-machine instructions.

## Music Library

The `/music/` frontend calls:

```text
/.netlify/functions/music-library
```

The function reads the published `videos.json` manifest, normalizes folders, sorts files, and returns paginated results. It keeps the manifest in memory briefly and adds HTTP cache headers. The frontend preserves folder, page, and sort state when navigating between the list and a video.

Set `MUSIC_LIBRARY_LOGGING=1` in the Netlify environment only when short per-request diagnostic logs are needed.

## PWA and Offline Behavior

`BookServiceWorker` in `hugo.toml` controls the service worker:

- `runtime` caches successfully visited same-origin pages and assets.
- `precache` additionally lists every Hugo page during service-worker generation.

The current configuration uses `runtime` to avoid an unnecessarily large install-time cache. Audio and video hosted on external storage still require network access.

## Content Preparation Guidelines

Source material may come from PDF, Word, OCR, or manually prepared text. Before publishing:

1. Remove repeated headers, footers, page numbers, and extraction artifacts.
2. Repair paragraph boundaries, whitespace, punctuation, quotations, and headings.
3. Split the text into stable chapter Markdown files with correct Hugo front matter.
4. Keep visible book titles, author names, folder names, and audio paths consistent.
5. Check custom previous/next links for the first and final chapter of unusual book structures.
6. Proofread against the source and test the rendered page on mobile and desktop.

For audio, verify the final filename, duration, chapter boundary, playback, and storage path before adding or updating the shortcode.

## Validation Before Committing

At minimum, run:

```bash
hugo --minify
```

For interface changes, also check representative pages at approximately 320 px, 390 px, 768 px, and desktop widths. Confirm that there is no horizontal scrolling, navigation controls remain visible, chapter pagination is correct, and audio behavior works on both single- and multi-audio pages.

## Purpose

Xiangcaoshan exists to make Christian writings and music easier to access, read, and listen to. The site is designed for slow, attentive reading, peaceful listening, and simple discovery across authors, books, chapters, and songs.
