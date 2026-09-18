# Xiangcaoshan

Xiangcaoshan is a quiet reading and listening site for Christian literature and music. It collects works from many Christian authors, including Watchman Nee, Andrew Murray, T. Austin-Sparks, Jessie Penn-Lewis, John Nelson Darby, and others.

The heart of the project is a bookshelf of spiritual writings. Book chapters are presented as readable web pages, and many texts are paired with playable audio so readers can follow along in a calm, understandable way. The site also includes a Christian music section with browsable audio and video resources.

## Features

- Christian book collection organized by title and author
- Chapter-based reading pages built from Markdown content
- Playable audio support for book texts
- Christian music library with sorting, folders, pagination, and media thumbnails
- Children section for family-friendly Christian learning materials
- Lightweight static site generated with Hugo
- Netlify serverless functions for audio redirects and music library data
- Mobile-friendly layout based on the local `my-book` Hugo theme

## Project Structure

```text
content/                 Site pages and book chapters
content/books/           Christian books and chapter Markdown files
content/music/           Music section page
content/children/        Children section content
layouts/                 Hugo layout overrides and shortcodes
themes/my-book/          Local Hugo theme
static/                  Static files, JavaScript, icons, and images
netlify/functions/       Serverless functions for audio and music data
hugo.toml                Main Hugo configuration
```

## Content and Audio Preparation

The Markdown chapters and audio files published by the site are the results of a preparation workflow that takes place before the Hugo site is built.

### Text preparation

Source material may come from PDF or Word documents. The text is extracted and then cleaned before it is added to `content/`:

1. Extract the text from the source PDF or Word document. Scanned PDFs may require OCR first.
2. Remove page-level artifacts such as repeated headers, footers, page numbers, and other extraction noise.
3. Repair unwanted line breaks, normalize whitespace and punctuation, and restore readable paragraph boundaries.
4. Preserve meaningful structure such as book titles, chapter headings, section headings, quotations, and notes.
5. Split the cleaned text into chapter-based Markdown files and add the front matter required by Hugo.
6. Proofread the result against the source document before publishing it.

### Audio preparation

Audio also goes through preprocessing before it is uploaded and linked from a chapter. FFmpeg is used as needed to:

- Resize or re-encode audio files by adjusting the codec, bitrate, sample rate, channel layout, or output format.
- Combine multiple recordings into one chapter audio file in the correct order.
- Keep filenames and chapter boundaries aligned with the corresponding Markdown content.
- Check the final file's duration, playback, and output size before uploading it to object storage.

These preparation steps are separate from the Hugo build and the Netlify functions used by the published site. The repository currently documents the workflow but does not include the source-extraction, text-cleaning, or FFmpeg preprocessing scripts.

## Local Development

Install dependencies:

```bash
npm install
```

Run the Hugo development server:

```bash
hugo server
```

Then open the local URL printed by Hugo, usually:

```text
http://localhost:1313/
```

## Audio and Music

Book audio is routed through the Netlify function at:

```text
/.netlify/functions/audio
```

The function expects `OSS_BUCKET` and `OSS_ENDPOINT` environment variables and redirects valid book audio requests to the configured object storage location.

The music library is served through:

```text
/.netlify/functions/music-library
```

It reads a remote `videos.json` manifest, groups folders and files, sorts music entries, and returns paginated JSON for the frontend.

## Content Guidelines

Books are stored under `content/books/`, with each book having its own folder. A typical book contains an `_index.md` file plus one Markdown file per chapter.

When adding new content:

- Keep book titles, author names, and chapter names consistent.
- Add cover images under the existing static image structure when available.
- Use readable chapter formatting so text and audio can support each other naturally.
- Confirm that any audio paths match the object storage structure expected by the audio function.

## Purpose

Xiangcaoshan exists to make Christian writings and music easier to access, read, and listen to. The site is meant to support slow, attentive reading, peaceful listening, and simple discovery of spiritual resources across authors, books, chapters, and songs.
