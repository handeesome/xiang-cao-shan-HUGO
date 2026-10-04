#!/usr/bin/env python3
"""Generate paragraph-level audio synchronization data for Hugo book pages.

The expected audio layout is:

    <audio-root>/<book-directory>/<audio shortcode src path>

For example, ``audio/效法基督/01/1.mp3`` matches a shortcode inside
``content/books/效法基督`` with ``src="01/1.mp3"``.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path, PurePosixPath
from typing import Any, Iterable
from urllib.parse import unquote, urlsplit


AUDIO_SHORTCODE_RE = re.compile(
    r"\{\{<\s*audio\b(?P<args>.*?)>\}\}", re.IGNORECASE | re.DOTALL
)
ATTRIBUTE_RE = re.compile(r"([\w-]+)\s*=\s*([\"'])(.*?)\2", re.DOTALL)
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*#*\s*$")
LIST_ITEM_RE = re.compile(r"^\s*(?:[-+*]|\d+[.)])\s+(.+)$")
FENCE_RE = re.compile(r"^\s*(```|~~~)")
HAN_OR_ALNUM_RE = re.compile(r"[\u3400-\u9fffA-Za-z0-9]")
INVALID_WINDOWS_CHARS_RE = re.compile(r"[<>:\"/\\|?*]")


@dataclass
class TextUnit:
    start: int
    end: int
    kind: str
    text: str
    target_index: int

    @property
    def normalized(self) -> str:
        return normalize_text(self.text)


@dataclass
class AudioJob:
    page: Path
    page_relative: Path
    book: str
    ordinal: int
    src: str
    audio_path: Path
    sync_url: str
    output_path: Path
    shortcode_start: int
    shortcode_end: int
    shortcode: str
    units: list[TextUnit] = field(default_factory=list)


@dataclass
class TimelineToken:
    start: float
    end: float
    text: str


def normalize_text(value: str) -> str:
    value = html.unescape(value).replace("神", "上帝").lower()
    return "".join(HAN_OR_ALNUM_RE.findall(value))


def clean_markdown(value: str) -> str:
    value = re.sub(r"!\[([^]]*)]\([^)]*\)", r"\1", value)
    value = re.sub(r"\[([^]]+)]\([^)]*\)", r"\1", value)
    value = re.sub(r"\{\{[<%].*?[>%]\}\}", " ", value)
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"[`*_~]", "", value)
    value = re.sub(r"\\([#>*_`])", r"\1", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def body_offset(markdown: str) -> int:
    if not markdown.startswith("---"):
        return 0
    closing = re.search(r"\r?\n---\s*(?:\r?\n|$)", markdown[3:])
    return 3 + closing.end() if closing else 0


def parse_text_units(markdown: str) -> list[TextUnit]:
    offset = body_offset(markdown)
    lines = markdown[offset:].splitlines(keepends=True)
    units: list[TextUnit] = []
    paragraph_lines: list[str] = []
    paragraph_start = 0
    position = offset
    in_fence = False
    candidate_index = 0

    def append_unit(start: int, end: int, kind: str, value: str) -> None:
        nonlocal candidate_index
        cleaned = clean_markdown(value)
        if not cleaned or not normalize_text(cleaned):
            return
        units.append(TextUnit(start, end, kind, cleaned, candidate_index))
        candidate_index += 1

    def flush_paragraph(end: int) -> None:
        nonlocal paragraph_lines
        if paragraph_lines:
            append_unit(
                paragraph_start,
                end,
                "paragraph",
                " ".join(line.strip() for line in paragraph_lines),
            )
            paragraph_lines = []

    for line in lines:
        line_start = position
        position += len(line)
        stripped = line.strip()

        if FENCE_RE.match(line):
            flush_paragraph(line_start)
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        if not stripped:
            flush_paragraph(line_start)
            continue
        if re.match(r"^\s*>\s*$", line):
            flush_paragraph(line_start)
            continue
        if AUDIO_SHORTCODE_RE.search(line):
            flush_paragraph(line_start)
            continue

        heading = HEADING_RE.match(stripped)
        if heading:
            flush_paragraph(line_start)
            level = len(heading.group(1))
            if level <= 3:
                append_unit(line_start, position, "heading", heading.group(2))
            continue

        list_item = LIST_ITEM_RE.match(line)
        if list_item:
            flush_paragraph(line_start)
            append_unit(line_start, position, "list-item", list_item.group(1))
            continue

        quote_text = re.sub(r"^\s*>\s?", "", line).strip()
        if not paragraph_lines:
            paragraph_start = line_start
        paragraph_lines.append(quote_text)

    flush_paragraph(position)
    return units


def parse_attributes(argument_text: str) -> dict[str, str]:
    return {
        match.group(1): match.group(3)
        for match in ATTRIBUTE_RE.finditer(argument_text)
    }


def safe_component(value: str) -> str:
    cleaned = INVALID_WINDOWS_CHARS_RE.sub("_", value).rstrip(" .")
    return cleaned or "untitled"


def safe_relative_path(path: Path) -> Path:
    return Path(*(safe_component(part) for part in path.parts))


def audio_source_path(src: str) -> PurePosixPath:
    decoded = unquote(urlsplit(src).path).lstrip("/")
    relative = PurePosixPath(decoded)
    if not decoded or relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"unsafe audio src: {src}")
    return relative


def default_sync_location(
    output_root: Path, book: str, page_relative: Path, ordinal: int
) -> tuple[str, Path]:
    page_without_suffix = page_relative.with_suffix("")
    relative = safe_relative_path(Path(book) / page_without_suffix)
    relative = relative / f"audio-{ordinal:02d}.json"
    return "/audio-sync/" + relative.as_posix(), output_root / relative


def page_matches(selector: str, page_relative: Path) -> bool:
    selector = selector.replace("\\", "/").removesuffix(".md").strip("/")
    page_without_suffix = page_relative.with_suffix("").as_posix()
    if "/" in selector:
        return page_without_suffix.startswith(selector)
    return page_relative.stem.startswith(selector)


def units_for_audio(
    units: list[TextUnit],
    audio_matches: list[re.Match[str]],
    audio_index: int,
) -> list[TextUnit]:
    current = audio_matches[audio_index]
    start = current.end()
    preceding = [unit for unit in units if unit.end <= current.start()]
    if preceding and preceding[-1].kind == "heading":
        between = current.string[preceding[-1].end : current.start()]
        if not between.strip():
            start = preceding[-1].start

    if audio_index + 1 >= len(audio_matches):
        end = len(current.string)
    else:
        following_audio = audio_matches[audio_index + 1]
        end = following_audio.start()
        between_units = [
            unit
            for unit in units
            if unit.start >= current.end() and unit.end <= following_audio.start()
        ]
        if between_units and between_units[-1].kind == "heading":
            after_heading = current.string[
                between_units[-1].end : following_audio.start()
            ]
            if not after_heading.strip():
                end = between_units[-1].start

    return [unit for unit in units if unit.start >= start and unit.start < end]


def discover_jobs(args: argparse.Namespace) -> list[AudioJob]:
    jobs: list[AudioJob] = []
    content_root = args.content_root.resolve()
    output_root = args.output_root.resolve()

    for page in sorted(content_root.rglob("*.md")):
        page_relative_from_books = page.relative_to(content_root)
        if len(page_relative_from_books.parts) < 2:
            continue
        book = page_relative_from_books.parts[0]
        page_relative = Path(*page_relative_from_books.parts[1:])
        if args.book and book != args.book:
            continue
        if args.page and not page_matches(args.page, page_relative):
            continue

        with page.open("r", encoding="utf-8", newline="") as source:
            markdown = source.read()
        audio_matches = list(AUDIO_SHORTCODE_RE.finditer(markdown))
        if not audio_matches:
            continue
        units = parse_text_units(markdown)

        for index, match in enumerate(audio_matches):
            attributes = parse_attributes(match.group("args"))
            src = attributes.get("src")
            if not src:
                continue
            try:
                source_path = audio_source_path(src)
            except ValueError as error:
                print(f"WARN {page}: {error}", file=sys.stderr)
                continue

            audio_path = args.audio_root.resolve() / safe_component(book)
            audio_path = audio_path.joinpath(*source_path.parts).resolve()
            try:
                audio_path.relative_to(args.audio_root.resolve())
            except ValueError:
                print(f"WARN {page}: audio path escaped the audio root", file=sys.stderr)
                continue

            sync_url, output_path = default_sync_location(
                output_root, book, page_relative, index + 1
            )
            jobs.append(
                AudioJob(
                    page=page,
                    page_relative=page_relative,
                    book=book,
                    ordinal=index + 1,
                    src=src,
                    audio_path=audio_path,
                    sync_url=sync_url,
                    output_path=output_path,
                    shortcode_start=match.start(),
                    shortcode_end=match.end(),
                    shortcode=match.group(0),
                    units=units_for_audio(units, audio_matches, index),
                )
            )

    if args.limit:
        jobs = jobs[: args.limit]
    return jobs


def resolve_device(args: argparse.Namespace) -> tuple[str, str]:
    if args.device != "auto":
        device = args.device
    else:
        try:
            import ctranslate2

            device = "cuda" if ctranslate2.get_cuda_device_count() else "cpu"
        except Exception:
            device = "cpu"
    compute_type = args.compute_type
    if compute_type == "auto":
        compute_type = "float16" if device == "cuda" else "int8"
    return device, compute_type


def cache_path_for_job(cache_root: Path, job: AudioJob) -> Path:
    source_path = audio_source_path(job.src)
    query = urlsplit(job.src).query
    suffix = f"-{hashlib.sha1(query.encode()).hexdigest()[:8]}" if query else ""
    filename = source_path.name + suffix + ".json"
    parent = safe_relative_path(Path(job.book).joinpath(*source_path.parent.parts))
    return cache_root / "transcripts" / parent / filename


def load_or_transcribe(
    job: AudioJob,
    args: argparse.Namespace,
    model_holder: dict[str, Any],
) -> dict[str, Any]:
    cache_path = cache_path_for_job(args.cache_root, job)
    if cache_path.exists() and not args.force_transcribe:
        return json.loads(cache_path.read_text(encoding="utf-8"))

    if not job.audio_path.is_file():
        raise FileNotFoundError(job.audio_path)

    if "model" not in model_holder:
        try:
            from faster_whisper import WhisperModel
        except ImportError as error:
            raise RuntimeError(
                "faster-whisper is not installed; run: "
                "pip install -r scripts/requirements-audio-sync.txt"
            ) from error
        device, compute_type = resolve_device(args)
        print(
            f"Loading Whisper model {args.model!r} on {device} ({compute_type})...",
            flush=True,
        )
        args.model_cache.mkdir(parents=True, exist_ok=True)
        model_holder["model"] = WhisperModel(
            args.model,
            device=device,
            compute_type=compute_type,
            download_root=str(args.model_cache),
        )

    print(f"Transcribing {job.audio_path}", flush=True)
    segments_iterator, info = model_holder["model"].transcribe(
        str(job.audio_path),
        language=args.language,
        beam_size=args.beam_size,
        vad_filter=True,
        word_timestamps=True,
        condition_on_previous_text=False,
    )
    segments: list[dict[str, Any]] = []
    for segment in segments_iterator:
        segments.append(
            {
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip(),
                "words": [
                    {
                        "start": word.start,
                        "end": word.end,
                        "text": word.word,
                        "probability": word.probability,
                    }
                    for word in (segment.words or [])
                    if word.start is not None and word.end is not None
                ],
            }
        )

    transcript = {
        "version": 1,
        "model": args.model,
        "language": info.language,
        "duration": info.duration,
        "segments": segments,
    }
    write_json(cache_path, transcript)
    return transcript


def deduplicate_segments(segments: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    ordered = sorted(segments, key=lambda item: (item["start"], item["end"]))
    result: list[dict[str, Any]] = []
    for segment in ordered:
        if result and segment["start"] < result[-1]["end"] - 1:
            similarity = SequenceMatcher(
                None,
                normalize_text(segment.get("text", "")),
                normalize_text(result[-1].get("text", "")),
                autojunk=False,
            ).ratio()
            if similarity > 0.55:
                if segment["start"] >= result[-1]["start"]:
                    result[-1] = segment
                continue
        result.append(segment)
    return result


def transcript_tokens(transcript: dict[str, Any]) -> list[TimelineToken]:
    tokens: list[TimelineToken] = []
    for segment in deduplicate_segments(transcript.get("segments", [])):
        words = segment.get("words") or []
        if words:
            for word in words:
                normalized = normalize_text(word.get("text", ""))
                start = float(word["start"])
                end = float(word["end"])
                # Whisper occasionally emits a repeated title during an intro
                # with most word timestamps collapsed to one instant. Those
                # hallucinated zero-length words must not win the first match.
                if normalized and end - start >= 0.01:
                    tokens.append(
                        TimelineToken(start, end, normalized)
                    )
        else:
            normalized = normalize_text(segment.get("text", ""))
            if normalized:
                tokens.append(
                    TimelineToken(
                        float(segment["start"]), float(segment["end"]), normalized
                    )
                )
    return tokens


def best_token_span(
    source_text: str,
    tokens: list[TimelineToken],
    cursor: int,
    first_unit: bool,
) -> tuple[float, int, int] | None:
    if not source_text or cursor >= len(tokens):
        return None
    maximum_chars = len(source_text) * 1.85 + 24
    minimum_chars = max(1, int(len(source_text) * 0.28))

    def search(max_skip: int, skip_rate: float) -> tuple[float, int, int] | None:
        max_start = min(len(tokens), cursor + max_skip + 1)
        best: tuple[float, float, int, int] | None = None
        for start_index in range(cursor, max_start):
            combined = ""
            for end_index in range(start_index, len(tokens)):
                combined += tokens[end_index].text
                if len(combined) > maximum_chars:
                    break
                if len(combined) < minimum_chars:
                    continue
                ratio = SequenceMatcher(
                    None, source_text, combined, autojunk=False
                ).ratio()
                length_penalty = 0.12 * abs(
                    math.log(max(len(combined), 1) / len(source_text))
                )
                score = ratio - length_penalty - skip_rate * (start_index - cursor)
                candidate = (score, ratio, start_index, end_index)
                if best is None or candidate > best:
                    best = candidate
        if best is None:
            return None
        _, ratio, start_index, end_index = best
        return ratio, start_index, end_index

    nearby = search(80 if first_unit else 14, 0.003 if first_unit else 0.015)
    if first_unit or (nearby and nearby[0] >= 0.55):
        return nearby

    # Some recordings contain paragraphs that are absent from the published
    # Markdown. Only widen the search after the normal local match fails, so
    # ordinary chapters retain the more conservative sequential behaviour.
    extended = search(160, 0.0015)
    if extended and extended[0] >= 0.45:
        if nearby is None or extended[0] >= nearby[0] + 0.08:
            return extended
    return nearby


def align_units(
    units: list[TextUnit], transcript: dict[str, Any], low_confidence: float
) -> tuple[list[dict[str, Any]], list[str]]:
    tokens = transcript_tokens(transcript)
    cues: list[dict[str, Any]] = []
    warnings: list[str] = []
    cursor = 0

    for unit in units:
        span = best_token_span(unit.normalized, tokens, cursor, not cues)
        if span is None:
            warnings.append(f"unmatched: {unit.text[:48]}")
            continue
        confidence, start_index, end_index = span
        if confidence < 0.24:
            warnings.append(
                f"unmatched ({confidence:.3f}): {unit.text[:48]}"
            )
            continue

        cue = {
            "start": round(tokens[start_index].start, 2),
            "end": round(tokens[end_index].end, 2),
            "kind": unit.kind,
            "targetIndex": unit.target_index,
            "targetText": unit.normalized[:48],
            "confidence": round(confidence, 3),
        }
        if confidence < low_confidence:
            warnings.append(
                f"low confidence ({confidence:.3f}) at {cue['start']:.2f}s: "
                f"{unit.text[:48]}"
            )
        cues.append(cue)
        cursor = end_index + 1

    for index in range(len(cues) - 1):
        if cues[index + 1]["start"] >= cues[index]["start"]:
            cues[index]["end"] = cues[index + 1]["start"]
    return cues, warnings


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    os.replace(temporary, path)


def shortcode_with_sync(shortcode: str, sync_url: str) -> str:
    if re.search(r"\bsync\s*=", shortcode):
        return re.sub(
            r"\bsync\s*=\s*([\"']).*?\1",
            f'sync="{sync_url}"',
            shortcode,
            count=1,
        )
    marker = shortcode.rfind(">}}")
    if marker < 0:
        raise ValueError(f"unsupported audio shortcode: {shortcode}")
    return shortcode[:marker].rstrip() + f' sync="{sync_url}" ' + shortcode[marker:]


def update_markdown(jobs: list[AudioJob]) -> int:
    by_page: dict[Path, list[AudioJob]] = {}
    for job in jobs:
        by_page.setdefault(job.page, []).append(job)
    changed = 0

    for page, page_jobs in by_page.items():
        with page.open("r", encoding="utf-8", newline="") as source:
            markdown = source.read()
        updated = markdown
        for job in sorted(page_jobs, key=lambda item: item.shortcode_start, reverse=True):
            replacement = shortcode_with_sync(job.shortcode, job.sync_url)
            updated = (
                updated[: job.shortcode_start]
                + replacement
                + updated[job.shortcode_end :]
            )
        if updated == markdown:
            continue
        temporary = page.with_suffix(page.suffix + ".audio-sync.tmp")
        with temporary.open("w", encoding="utf-8", newline="") as destination:
            destination.write(updated)
        os.replace(temporary, page)
        changed += 1
    return changed


def build_parser(project_root: Path) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate paragraph-level audio highlight data with faster-whisper."
    )
    parser.add_argument("--audio-root", type=Path, required=True)
    parser.add_argument(
        "--content-root", type=Path, default=project_root / "content/books"
    )
    parser.add_argument(
        "--output-root", type=Path, default=project_root / "static/audio-sync"
    )
    parser.add_argument(
        "--cache-root", type=Path, default=project_root / ".audio-sync-cache"
    )
    parser.add_argument("--model-cache", type=Path)
    parser.add_argument("--model", default="base")
    parser.add_argument("--language", default="zh")
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--compute-type", default="auto")
    parser.add_argument("--beam-size", type=int, default=5)
    parser.add_argument("--book")
    parser.add_argument(
        "--page", help="Markdown path or filename prefix inside a book"
    )
    parser.add_argument("--limit", type=int)
    parser.add_argument("--all", action="store_true", help="Allow processing every book")
    parser.add_argument("--scan", action="store_true", help="Only list matching jobs")
    parser.add_argument("--write", action="store_true", help="Update Markdown shortcodes")
    parser.add_argument("--force", action="store_true", help="Regenerate existing sync JSON")
    parser.add_argument(
        "--force-transcribe", action="store_true", help="Ignore transcript cache"
    )
    parser.add_argument("--low-confidence", type=float, default=0.55)
    return parser


def main() -> int:
    project_root = Path(__file__).resolve().parent.parent
    parser = build_parser(project_root)
    args = parser.parse_args()
    if not args.all and not args.book and not args.page:
        parser.error("choose --book/--page, or explicitly pass --all")
    if args.model_cache is None:
        args.model_cache = args.cache_root / "models"

    jobs = discover_jobs(args)
    if not jobs:
        print("No matching audio shortcodes found.")
        return 1

    missing = [job for job in jobs if not job.audio_path.is_file()]
    print(
        f"Found {len(jobs)} audio job(s); {len(missing)} local audio file(s) missing."
    )
    if args.scan:
        for job in jobs:
            state = "OK" if job.audio_path.is_file() else "MISSING"
            print(f"{state:7} {job.book}/{job.page_relative} :: {job.src}")
        return 1 if missing else 0

    model_holder: dict[str, Any] = {}
    report: list[dict[str, Any]] = []
    successful_jobs: list[AudioJob] = []
    failures = 0

    for number, job in enumerate(jobs, start=1):
        label = f"[{number}/{len(jobs)}] {job.book}/{job.page_relative} :: {job.src}"
        print(label, flush=True)
        try:
            if job.output_path.exists() and not args.force:
                payload = json.loads(job.output_path.read_text(encoding="utf-8"))
                warnings = []
                status = "cached"
            else:
                transcript = load_or_transcribe(job, args, model_holder)
                cues, warnings = align_units(
                    job.units, transcript, args.low_confidence
                )
                if not cues:
                    raise RuntimeError("no text cues could be aligned")
                payload = {
                    "version": 1,
                    "model": args.model,
                    "source": {
                        "page": (Path(job.book) / job.page_relative).as_posix(),
                        "audio": job.src,
                    },
                    "audioDuration": transcript.get("duration"),
                    "cues": cues,
                }
                write_json(job.output_path, payload)
                status = "generated"
            successful_jobs.append(job)
            report.append(
                {
                    "status": status,
                    "page": (Path(job.book) / job.page_relative).as_posix(),
                    "audio": job.src,
                    "audioPath": str(job.audio_path),
                    "sync": job.sync_url,
                    "cueCount": len(payload.get("cues", [])),
                    "warnings": warnings,
                }
            )
            print(
                f"  {status}: {len(payload.get('cues', []))} cue(s), "
                f"{len(warnings)} warning(s)"
            )
        except Exception as error:
            failures += 1
            report.append(
                {
                    "status": "error",
                    "page": (Path(job.book) / job.page_relative).as_posix(),
                    "audio": job.src,
                    "error": str(error),
                }
            )
            print(f"  ERROR: {error}", file=sys.stderr)

    changed_pages = update_markdown(successful_jobs) if args.write else 0
    report_payload = {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "jobCount": len(jobs),
        "failureCount": failures,
        "markdownPagesChanged": changed_pages,
        "jobs": report,
    }
    report_path = args.cache_root / "last-report.json"
    write_json(report_path, report_payload)
    print(f"Report: {report_path}")
    if args.write:
        print(f"Markdown pages changed: {changed_pages}")
    else:
        print("Markdown was not changed; pass --write after reviewing the report.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
