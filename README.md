# Xiangcaoshan（香草山）

[xiangcaoshan.netlify.app](https://xiangcaoshan.netlify.app/) is a quiet reading and listening site for Christian literature, music, and children’s resources. It is built as a Hugo static site, with book and music media stored outside the repository and served through small Netlify functions.

The project emphasizes long-form reading: books are organized by author and title, chapters are written in Markdown, and many passages can be followed with recorded audio.

## Current Features

- Bookshelf with title, author, grouped-author, and author-filter views
- Chapter-based reading pages with explicit previous/next navigation
- Responsive layouts tested at narrow mobile, tablet, and desktop widths
- Mobile navigation and table of contents that preserve the reader’s scroll position
- Local reading history that restores the last chapter, paragraph position, and paused audio progress
- Persistent reading preferences with sans-serif (黑体) and serif (宋体) previews and 14–26 px body text sizing
- Accessible navigation dialogs, focus handling, keyboard controls, and larger touch targets
- Mobile reading controls that progressively return on upward scroll and hide on downward scroll, with keyboard support
- Book/chapter context and a mobile table of contents that reveals the current section
- Chapter audio with lazy metadata loading and sequential playback on multi-audio pages
- Labeled audio segments on multi-part chapters and optional paragraph-level highlighting, loaded on demand
- Responsive WebP book covers and local reading illustrations
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
assets/                      Reading progress/preferences scripts and source images
themes/my-book/              Local Hugo theme, SCSS, PWA manifest, and service worker
static/js/                   Browser-side reading, audio, bookshelf, and music code
static/audio-sync/           Published paragraph-level audio timing JSON
netlify/functions/           Audio redirect and music-library functions
scripts/                     Audio-sync tooling and Python/Node regression tests
├─ generate_audio_sync.py    Local Whisper alignment tool
├─ requirements-audio-sync.txt
└─ README-audio-sync.md      Detailed audio-sync and review workflow
hugo.toml                    Site configuration and feature flags
package.json                 Node dependencies used by the deployment tooling
```

## Local Development

### Prerequisites

- A recent **Hugo Extended** release
- **Node.js** with built-in `node:test` and `fetch` support for regression tests and Netlify functions; **npm** for deployment dependencies
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

Reading progress is saved in the current browser for the 30 most recently visited reading pages. Directly opening the homepage returns to the latest chapter; internal homepage links (`?home=1`), reloads, and browser back navigation stay at their chosen destinations. Opening another book only restores progress saved for that page. Uncached pages show an offline message when loading fails instead of falling back to the homepage. Chapter fragment links keep their normal destinations. Audio resumes at the saved time only after the reader presses play. No reading history is sent to a server.

Font and size preferences are also stored in the current browser. Changing typography keeps the current paragraph in view. Desktop reading settings appear above the article; mobile settings use the “字” control.

See [Validation Before Committing](#validation-before-committing) for the regression-test commands.

## Site Configuration

The main settings live in [hugo.toml](hugo.toml):

| Setting | Purpose |
| --- | --- |
| `params.BookMaintenanceDate` | Explicit maintenance date displayed in the footer; update after actual site maintenance rather than on every build. |
| `params.BookServiceWorker` | Offline caching mode; currently `runtime`. |
| `params.features.autoRedirectSections` | Automatically redirect empty section entry pages to their first content page, unless `showChildrenList` is set. |
| `params.features.audioPlayAll` | Enable sequential playback controls on pages with multiple recordings. |
| `params.features.strictShortcodes` | Treat missing book-cover images as build errors rather than warnings. |
| `params.integration.audio.functionBase` | Production audio endpoint. |
| `params.integration.audio.previewFunctionBase` | Audio endpoint used by `hugo server`. |
| `params.integration.audio.cacheVersion` | Cache version forwarded to the audio storage URL. |

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

Audio URLs automatically include the global `params.integration.audio.cacheVersion` value from `hugo.toml`, and the Netlify function forwards it to OSS. After replacing an existing MP3 without changing its filename, increment this value and redeploy the site so browsers request the new recording. Individual audio shortcodes do not need a version parameter.

## Paragraph-Level Audio Highlighting

An audio shortcode can reference generated synchronization data:

```go-html-template
{{< audio src="01/1.mp3" sync="/audio-sync/效法基督/chapter/audio-01.json" >}}
```

While the recording plays, the matching body paragraph receives a visual highlight. Headings are excluded from alignment and highlighting. The timing is intentionally paragraph-level: it is easier to review and maintain than word-perfect subtitles.

Before generating, reviewing, or repairing sync data, read the complete [audio-sync guide](scripts/README-audio-sync.md), starting with the [new-book workflow](scripts/README-audio-sync.md#新书与新增音频的固定工作流). It covers setup, transcript reuse, generation, audit, partial repair, recording-version checks, and acceptance against the rendered HTML and audio.

Work one book at a time: **generate → review → repair only when needed → validate locally → confirm → commit**. Locate each paragraph by its opening and closing phrases. Unverified candidates stay local by default; `--repair` is only for existing sync files. A successful command or build does not establish that audio boundaries are correct.

Generated JSON under `static/audio-sync/` belongs in Git. MP3 files, models, transcripts, `.audio-sync-cache/`, virtual environments, and temporary reports stay local; reusable transcripts must be handed over separately when moving to another machine. [AGENTS.md](AGENTS.md) contains the project working agreements. Commit requires explicit user confirmation; push and deployment require their own authorization.

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

Run commands from the repository root. Build the site with:

```bash
hugo --minify
```

Run the browser-behavior regression tests in PowerShell (no browser, audio files, or Whisper model required):

```powershell
$tests = Get-ChildItem scripts -Filter '*.test.cjs'
node --test $tests.FullName
```

These cover reading progress, font/size preferences, mobile reading controls, audio-sync playback and lazy loading, and service-worker navigation. For changes to audio alignment, also run the Python regressions and follow the acceptance steps in the [audio-sync guide](scripts/README-audio-sync.md):

```powershell
.\.venv-audio-sync\Scripts\python.exe scripts\test_generate_audio_sync.py
```

For interface changes, also check representative pages at approximately 320 px, 390 px, 768 px, and desktop widths. Confirm that there is no horizontal scrolling, navigation controls remain visible, chapter pagination is correct, and audio behavior works on both single- and multi-audio pages.

## Purpose

Xiangcaoshan exists to make Christian writings and music easier to access, read, and listen to. The site is designed for slow, attentive reading, peaceful listening, and simple discovery across authors, books, chapters, and songs.
