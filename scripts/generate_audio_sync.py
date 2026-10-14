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
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path, PurePosixPath
from typing import Any, Iterable
from urllib.parse import unquote, urlsplit

from opencc import OpenCC


ALIGNMENT_METHOD = "body-global-v4-context-and-partial-repair"
SIMPLIFY_CHINESE = OpenCC("t2s")


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
    legacy_text: str | None = None

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
    precision: str = "word"


def normalize_text(value: str) -> str:
    value = html.unescape(value).replace("神", "上帝").lower()
    return "".join(HAN_OR_ALNUM_RE.findall(value))


def alignment_text(value: str) -> str:
    # Keep targetText in the page's spelling for the browser. Only the matching
    # representation converts traditional Chinese and full-width characters.
    return normalize_text(SIMPLIFY_CHINESE.convert(unicodedata.normalize("NFKC", value)))


def clean_markdown(value: str) -> str:
    value = re.sub(r"!\[([^]]*)]\([^)]*\)", r"\1", value)
    value = re.sub(r"\[([^]]+)]\([^)]*\)", r"\1", value)
    value = re.sub(r"\{\{[<%].*?[>%]\}\}", " ", value)
    # Goldmark treats <<book/song title>> as guillemets, not an HTML tag.
    value = re.sub(r"<<([^<>]+)>>", r"«\1»", value)
    value = re.sub(r"<\s*/?[A-Za-z][\w:-]*(?:\s[^<>]*)?\s*/?>", " ", value)
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
        legacy = clean_markdown(re.sub(r"<[^>]+>", " ", value))
        units.append(TextUnit(start, end, kind, cleaned, candidate_index, legacy))
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
                alignment_text(segment.get("text", "")),
                alignment_text(result[-1].get("text", "")),
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
                normalized = alignment_text(word.get("text", ""))
                start = float(word["start"])
                end = float(word["end"])
                # Whisper occasionally emits a repeated title during an intro
                # with most word timestamps collapsed to one instant. Those
                # hallucinated zero-length words must not win the first match.
                if normalized and math.isfinite(start) and math.isfinite(end) and start >= 0 and end - start >= 0.01:
                    tokens.append(
                        TimelineToken(start, end, normalized)
                    )
        else:
            normalized = alignment_text(segment.get("text", ""))
            start, end = float(segment["start"]), float(segment["end"])
            if normalized and math.isfinite(start) and math.isfinite(end) and start >= 0 and end > start:
                tokens.append(
                    TimelineToken(
                        start, end, normalized, "segment"
                    )
                )
    return tokens


def matching_runs(aligned: list[tuple[int, int]]) -> list[list[tuple[int, int]]]:
    """Exact phrases, rather than scattered characters borrowed from an intro."""
    runs: list[list[tuple[int, int]]] = []
    for pair in aligned:
        if runs and pair[0] == runs[-1][-1][0] + 1 and pair[1] == runs[-1][-1][1] + 1:
            runs[-1].append(pair)
        else:
            runs.append([pair])
    return runs


def anchored_matches(
    aligned: list[tuple[int, int]], size: int,
    timeline: list[TimelineToken],
) -> tuple[list[tuple[int, int]], list[str]]:
    """Trim detached weak edge matches; never search elsewhere in the recording.

    A contiguous phrase anchors the boundary to the globally aligned occurrence.
    Nearby shorter matches are kept, including ASR substitutions between words.
    If no phrase supports a boundary, keep the provisional match for review.
    """
    runs = matching_runs(aligned)
    minimum = min(4, size)
    anchors = [run for run in runs if len(run) >= minimum]
    if not anchors:
        return aligned, []
    start = aligned.index(anchors[0][0])
    end = aligned.index(anchors[-1][-1])

    def connected(left: tuple[int, int], right: tuple[int, int]) -> bool:
        source_gap, spoken_gap = right[0] - left[0] - 1, right[1] - left[1] - 1
        # Unmatched speech and a long delay are evidence of a detached island.
        # A pause between consecutive matched words alone is not evidence.
        time_gap = timeline[right[1]].start - timeline[left[1]].end
        return source_gap <= 8 and spoken_gap <= 8 and (spoken_gap == 0 or time_gap <= 3)

    while start and connected(aligned[start-1], aligned[start]):
        start -= 1
    while end + 1 < len(aligned) and connected(aligned[end], aligned[end+1]):
        end += 1
    adjustments = []
    if start:
        adjustments.append("discarded detached start matches")
    if end + 1 < len(aligned):
        adjustments.append("discarded detached end matches")
    return aligned[start:end+1], adjustments


def boundary_evidence(
    part: str, spoken: str, timeline: list[TimelineToken], index: int,
    edge: str, aligned: list[tuple[int, int]] | None = None,
) -> dict[str, Any]:
    """Independent, local evidence for a proposed boundary, not its global score."""
    window = min(12, len(part))
    prefix = edge == "start"
    source = part[:window] if prefix else part[-window:]
    token = timeline[index]
    # Bound both character distance and time. Long segment-only tokens cannot
    # provide word-level timing; explicitly detect boundaries inside a segment.
    if prefix:
        limit = index
        while limit < len(spoken) and limit-index < max(24, window*3) and timeline[limit].start <= token.start+12:
            limit += 1
        local = spoken[index:limit]
        base = index
    else:
        base = index
        while base >= 0 and index-base < max(24, window*3) and timeline[base].end >= token.end-12:
            base -= 1
        base += 1
        local = spoken[base:index+1]
    blocks = [block for block in SequenceMatcher(None, source, local, autojunk=False).get_matching_blocks() if block.size]
    coverage = sum(block.size for block in blocks) / max(1, window)
    minimum = min(4, window)
    if prefix:
        anchor = any(block.size >= minimum and block.a <= 3
                     and timeline[base+block.b].start <= token.start+3 for block in blocks)
        inside_segment = token.precision == "segment" and index > 0 and timeline[index-1] is token
    else:
        anchor = any(block.size >= minimum and window-block.a-block.size <= 3
                     and timeline[base+block.b+block.size-1].end >= token.end-3 for block in blocks)
        inside_segment = token.precision == "segment" and index+1 < len(timeline) and timeline[index+1] is token
    detached_context = False
    pairs = aligned or []
    for position, (left, right) in enumerate(zip(pairs, pairs[1:])):
        source_gap = right[0]-left[0]-1
        spoken_gap = right[1]-left[1]-1
        time_gap = timeline[right[1]].start-timeline[left[1]].end
        if source_gap > 8 or spoken_gap <= 12 or time_gap <= 3:
            continue
        edge_matches = position+1 if prefix else len(pairs)-position-1
        edge_span = left[0]+1 if prefix else len(part)-right[0]
        # Even a familiar phrase in an intro is insufficient when detached
        # from most of this paragraph. A silence without extra words is fine.
        if edge_span <= 20 and edge_matches*2 < len(pairs)-edge_matches:
            detached_context = True
            break
    return dict(verified=coverage >= .6 and anchor and not inside_segment and not detached_context,
                coverage=round(coverage, 3), continuousAnchor=anchor,
                timingPrecision=token.precision, insideSegment=inside_segment,
                detachedContext=detached_context)


def align_units(
    units: list[TextUnit], transcript: dict[str, Any], low_confidence: float
) -> tuple[list[dict[str, Any]], list[str]]:
    duration = transcript.get("duration")
    if duration is not None:
        duration = float(duration)
        if not math.isfinite(duration) or duration <= 0:
            raise ValueError("invalid transcript audio duration")
    tokens = transcript_tokens(transcript)
    body = [unit for unit in units if unit.kind != "heading"]
    source_parts = [alignment_text(unit.text) for unit in body]
    source = "".join(source_parts)
    spoken = "".join(token.text for token in tokens)
    character_tokens = [token for token in tokens for _ in token.text]
    matcher = SequenceMatcher(None, source, spoken, autojunk=False)
    replacements = [(a0, a1, b0, b1) for operation, a0, a1, b0, b1
                    in matcher.get_opcodes() if operation == "replace"
                    and 0 < a1 - a0 <= 8 and 0 < b1 - b0 <= 8
                    and 0.33 <= (b1 - b0) / (a1 - a0) <= 3]
    matches = {}
    for block in matcher.get_matching_blocks():
        for offset in range(block.size):
            matches[block.a + offset] = block.b + offset

    cues: list[dict[str, Any]] = []
    warnings: list[str] = []
    source_offset = 0

    for unit, part in zip(body, source_parts):
        unit_start = source_offset
        aligned = [(i, matches[source_offset + i]) for i in range(len(part))
                   if source_offset + i in matches]
        source_offset += len(part)
        label = f"target {unit.target_index}: {unit.text[:48]}"
        if not aligned:
            warnings.append(f"unmatched: {label}")
            continue
        aligned, boundary_adjusted = anchored_matches(aligned, len(part), character_tokens)
        leading = aligned[0][0]
        trailing = len(part) - 1 - aligned[-1][0]
        start_index, end_index = aligned[0][1], aligned[-1][1]
        # A local ASR substitution at a paragraph edge still has timestamps.
        # Recover it only when the edit starts/ends at this paragraph boundary;
        # deletions (text absent from the transcript) supply no timing evidence.
        for a0, a1, b0, b1 in replacements:
            if (leading and a0 == unit_start and a1 == unit_start + aligned[0][0]
                    and b1 == start_index and start_index-b0 <= 8
                    and character_tokens[start_index].start-character_tokens[b0].end <= 3):
                start_index = b0
                boundary_adjusted.append("start substitution")
            if (trailing and a1 == unit_start + len(part) and a0 == unit_start + aligned[-1][0]+1
                    and b0 == end_index+1 and b1-end_index-1 <= 8
                    and character_tokens[b1-1].start-character_tokens[end_index].end <= 3):
                end_index = b1 - 1
                boundary_adjusted.append("end substitution")
        actual = spoken[start_index:end_index + 1]
        confidence = SequenceMatcher(None, part, actual, autojunk=False).ratio()
        coverage = len(aligned) / len(part)
        window = min(20, max(1, len(part) // 2))
        prefix_coverage = sum(i < window for i, _ in aligned) / window
        suffix_coverage = sum(i >= len(part) - window for i, _ in aligned) / window
        start_evidence = boundary_evidence(part, spoken, character_tokens, start_index, "start", aligned)
        end_evidence = boundary_evidence(part, spoken, character_tokens, end_index, "end", aligned)
        coherent_coverage = sum(len(run) for run in matching_runs(aligned) if len(run) >= 4) / len(part)
        # Commentary absent from the page lowers symmetric similarity without
        # erasing clear spoken evidence. Require broad, contiguous source
        # coverage, not just a familiar prefix, to support such a paragraph.
        extra_speech_context = (len(actual) > len(part)*1.25 and coverage >= .8
                                and coherent_coverage >= .5 and confidence >= .4)
        paragraph_supported = (confidence >= max(low_confidence, .55) and coverage >= .55) or extra_speech_context
        for evidence in (start_evidence, end_evidence):
            evidence["paragraphSupported"] = paragraph_supported
            evidence["verified"] = evidence["verified"] and paragraph_supported
        reasons = []
        if duration is not None and character_tokens[end_index].end > duration + .1:
            end_evidence["verified"] = False
            reasons.append("transcript end exceeds audio duration")
        if duration is not None and character_tokens[start_index].start > duration + .1:
            start_evidence["verified"] = False
            reasons.append("transcript start exceeds audio duration")
        if leading > 3 or prefix_coverage < 0.55:
            reasons.append(f"incomplete start ({leading} leading chars, coverage {prefix_coverage:.3f})")
        if trailing > 3 or suffix_coverage < 0.55:
            reasons.append(f"incomplete end ({trailing} trailing chars, coverage {suffix_coverage:.3f})")
        if confidence < low_confidence or coverage < 0.55:
            reasons.append(f"low confidence ({confidence:.3f}, coverage {coverage:.3f})")
        if not start_evidence["verified"]:
            reason = "unverified start anchor"
            if start_evidence["insideSegment"]:
                reason += " (inside transcript segment)"
            if start_evidence["detachedContext"]:
                reason += " (detached boundary context)"
            reasons.append(reason)
        if not end_evidence["verified"]:
            reason = "unverified end anchor"
            if end_evidence["insideSegment"]:
                reason += " (inside transcript segment)"
            if end_evidence["detachedContext"]:
                reason += " (detached boundary context)"
            reasons.append(reason)
        for reason in reasons:
            warnings.append(f"{reason}: {label}")
        # A fragment is not evidence of a complete paragraph. Missing paragraphs
        # never move a greedy cursor or borrow another paragraph's timing.
        if coverage < 0.4 or confidence < 0.4:
            warnings.append(f"unmatched (fragment only): {label}")
            continue

        cue = {
            "start": round(character_tokens[start_index].start, 2),
            "end": round(character_tokens[end_index].end, 2),
            "kind": unit.kind,
            "targetIndex": unit.target_index,
            "targetText": unit.normalized[:48],
            "confidence": round(confidence, 3),
            "quality": {
                "coverage": round(coverage, 3),
                "coherentCoverage": round(coherent_coverage, 3),
                "extraSpeechContext": extra_speech_context,
                "prefixCoverage": round(prefix_coverage, 3),
                "suffixCoverage": round(suffix_coverage, 3),
                "unmatchedLeadingChars": leading,
                "unmatchedTrailingChars": trailing,
                "reviewRequired": bool(reasons),
                "boundaryAdjusted": boundary_adjusted,
                "startVerified": start_evidence["verified"],
                "endVerified": end_evidence["verified"],
                "startEvidence": start_evidence,
                "endEvidence": end_evidence,
            },
        }
        if cue["end"] <= cue["start"]:
            warnings.append(f"unmatched (invalid timestamps): {label}")
            continue
        if cues and cue["start"] < cues[-1]["end"]:
            # Two paragraphs may meet within one Whisper word. Trim that shared
            # word rather than extending highlights through an unspoken gap.
            cues[-1]["end"] = cue["start"]
            cues[-1]["quality"]["endVerified"] = False
            cues[-1]["quality"]["endEvidence"]["verified"] = False
            cues[-1]["quality"]["reviewRequired"] = True
            warnings.append(f"unverified end anchor (shared timestamp): target {cues[-1]['targetIndex']}")
            if cues[-1]["end"] <= cues[-1]["start"]:
                warnings.append(f"unmatched (shared timestamp): target {cues[-1]['targetIndex']}")
                cues.pop()
        cues.append(cue)
    return cues, warnings


def audit_existing_cues(
    units: list[TextUnit], payload: dict[str, Any], transcript: dict[str, Any],
    low_confidence: float, *, alignment: tuple[list[dict[str, Any]], list[str]] | None = None,
) -> list[str]:
    expected, content_warnings = alignment if alignment is not None else align_units(units, transcript, low_confidence)
    warnings = list(content_warnings)
    audio_duration, transcript_duration = payload.get("audioDuration"), transcript.get("duration")
    durations_match = True
    if audio_duration is not None and transcript_duration is not None:
        durations_match = (math.isfinite(float(audio_duration)) and math.isfinite(float(transcript_duration))
                           and abs(float(audio_duration)-float(transcript_duration)) <= 1)
        if not durations_match:
            warnings.append("transcript duration mismatch; boundary time comparisons skipped")
    expected_by_target = {cue["targetIndex"]: cue for cue in expected}
    unit_by_target = {unit.target_index: unit for unit in units}
    seen = set()
    previous_end = 0.0
    for cue in payload.get("cues", []):
        target = cue.get("targetIndex")
        unit = unit_by_target.get(target)
        if unit is None:
            warnings.append(f"unknown target: {target}")
            continue
        if unit.kind == "heading":
            warnings.append(f"legacy heading cue: target {target}; regenerate with --force")
            continue
        if target in seen:
            warnings.append(f"duplicate target: {target}")
        seen.add(target)
        if cue.get("targetText") != unit.normalized[:48]:
            warnings.append(f"target text mismatch: target {target}")
        start, end = float(cue["start"]), float(cue["end"])
        if not math.isfinite(start) or not math.isfinite(end):
            warnings.append(f"invalid timestamps (non-finite): target {target}")
            continue
        if start < 0 or start < previous_end or end <= start:
            warnings.append(f"invalid or overlapping timestamps: target {target}")
        duration = transcript.get("duration")
        if duration is not None and end > float(duration) + 0.1:
            warnings.append(f"cue exceeds audio duration: target {target}")
        previous_end = end
        reference = expected_by_target.get(target)
        if reference is None:
            warnings.append(f"unsupported by transcript: target {target}")
            continue
        if not durations_match:
            continue
        if not reference["quality"]["startVerified"]:
            warnings.append(f"unverified reference start: target {target}; boundary time comparison skipped")
        elif abs(start - reference["start"]) >= 1.5:
            warnings.append(
                f"start differs from transcript: target {target}; "
                f"cue {start:.2f}s, transcript {reference['start']:.2f}s"
            )
        if not reference["quality"]["endVerified"]:
            warnings.append(f"unverified reference end: target {target}; boundary time comparison skipped")
        elif abs(end - reference["end"]) >= 1.5:
            warnings.append(
                f"end differs from transcript: target {target}; "
                f"cue {end:.2f}s, transcript {reference['end']:.2f}s"
            )
    for target in expected_by_target.keys() - seen:
        warnings.append(f"missing body cue: target {target}")
    return warnings


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    os.replace(temporary, path)


def read_transcript_manifest(path: Path) -> dict[tuple[str, str, str], Path]:
    """Explicit input selection; missing transcripts never fall back to Whisper."""
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    result = {}
    for item in payload["jobs"]:
        key = (item["book"], item["page"].replace("\\", "/"), item["audio"])
        if key in result:
            raise ValueError(f"duplicate transcript manifest job: {key}")
        transcript_path = Path(item["transcript"])
        result[key] = (path.parent / transcript_path).resolve()
    return result


def alignment_requires_review(cues: list[dict[str, Any]], warnings: list[str]) -> bool:
    return (any(not cue["quality"]["startVerified"] or not cue["quality"]["endVerified"] for cue in cues)
            or any(cue["quality"]["reviewRequired"] for cue in cues)
            or any(warning.startswith("unmatched") for warning in warnings))


def repair_existing_cues(
    units: list[TextUnit], payload: dict[str, Any], transcript: dict[str, Any],
    low_confidence: float = .55,
    *, remap_targets: bool = False,
) -> dict[str, Any]:
    """Repair supported boundaries only, retaining explicit uncertainty elsewhere.

    Neighboring verified speech can bound an old cue, but that constraint is not
    represented as proof of its actual spoken endpoint. Conflicting replacements
    are withdrawn rather than dropping an existing paragraph or inventing time.
    """
    fingerprint_data = [ALIGNMENT_METHOD, "partial-v1", low_confidence, remap_targets,
        [(u.target_index, u.kind, u.normalized) for u in units], transcript]
    fingerprint = hashlib.sha256(json.dumps(fingerprint_data, sort_keys=True,
        ensure_ascii=False).encode("utf-8")).hexdigest()
    cue_digest = lambda cues: hashlib.sha256(json.dumps(cues, sort_keys=True,
        ensure_ascii=False).encode("utf-8")).hexdigest()
    if (payload.get("repairFingerprint") == fingerprint
            and payload.get("repairCueDigest") == cue_digest(payload.get("cues", []))):
        return payload
    duration = transcript.get("duration")
    previous_duration = payload.get("audioDuration")
    if duration is not None and previous_duration is not None:
        if (not math.isfinite(float(duration)) or not math.isfinite(float(previous_duration))
                or abs(float(duration)-float(previous_duration)) > 1):
            raise ValueError("transcript duration mismatch; existing sync preserved")
    expected, warnings = align_units(units, transcript, low_confidence)
    references = {cue["targetIndex"]: cue for cue in expected}
    body = {u.target_index: u for u in units if u.kind != "heading"}
    old_by_target = {}
    headings = {u.target_index: u for u in units if u.kind == "heading"}
    headings_removed = 0
    target_migrations = []
    for old in payload.get("cues", []):
        target = old.get("targetIndex")
        if (old.get("kind") == "heading" or (old.get("kind") is None and target in headings
                and old.get("targetText") == headings[target].normalized[:48])):
            headings_removed += 1
            continue
        if target not in body or old.get("targetText") != body[target].normalized[:48]:
            # Older parsers merged paragraphs separated by an empty quote line.
            # Do not guess by index or fuzzy text. Only an exact, unique text
            # signature within this audio's body may migrate an existing cue.
            matches = [u for u in body.values() if (u.normalized[:48] == old.get("targetText")
                       or (u.legacy_text is not None and normalize_text(u.legacy_text)[:48] == old.get("targetText")))
                       and u.kind == old.get("kind", "paragraph")] if remap_targets else []
            if len(matches) != 1:
                raise ValueError(f"target identity mismatch: {target}; existing sync preserved")
            migrated = matches[0].target_index
            target_migrations.append(dict(previousTargetIndex=target,targetIndex=migrated,
                previousTargetText=old["targetText"],targetText=matches[0].normalized[:48]))
            old = dict(old,targetIndex=migrated,targetText=matches[0].normalized[:48],
                       targetMigration=target_migrations[-1])
            target = migrated
        if target in old_by_target:
            raise ValueError(f"duplicate target: {target}; existing sync preserved")
        start, end = float(old["start"]), float(old["end"])
        if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
            raise ValueError(f"invalid previous timestamps: {target}; existing sync preserved")
        old_by_target[target] = old

    def supported(reference: dict[str, Any] | None, edge: str) -> bool:
        if reference is None:
            return False
        quality = reference["quality"]
        prefix = edge == "start"
        return (quality[f"{edge}Verified"] and quality["coverage"] >= .65
                and (reference["confidence"] >= max(.55, low_confidence) or quality.get("extraSpeechContext", False))
                and quality["prefixCoverage" if prefix else "suffixCoverage"] >= .7
                and quality["unmatchedLeadingChars" if prefix else "unmatchedTrailingChars"] <= 2)

    decisions = []
    missing = []
    for target, unit in body.items():
        reference, old = references.get(target), old_by_target.get(target)
        start_ok, end_ok = supported(reference, "start"), supported(reference, "end")
        if old is None and not (start_ok and end_ok):
            missing.append(target)
            warnings.append(f"repair missing cue (unverified): target {target}")
            continue
        decision = dict(target=target, old=old, reference=reference,
            start=reference["start"] if start_ok else float(old["start"]),
            end=reference["end"] if end_ok else float(old["end"]),
            start_source="verified-transcript" if start_ok else "previous-sync",
            end_source="verified-transcript" if end_ok else "previous-sync")
        if decision["end"] <= decision["start"]:
            if old is None:
                missing.append(target)
                continue
            decision.update(start=float(old["start"]), end=float(old["end"]),
                start_source="previous-sync", end_source="previous-sync")
            warnings.append(f"repair conflict (invalid interval): target {target}")
        decisions.append(decision)

    # Recordings may read two displayed paragraphs in the opposite order.
    # Preserve the prior chronological order rather than forcing DOM order.
    decisions.sort(key=lambda d: (float(d["old"]["start"]) if d["old"] else d["start"],
                                  d["target"]))
    # Withdraw replacements that would consume an entire neighboring old cue.
    # Limited adjacent constraints are safe only while both cues remain valid.
    for _ in range(len(decisions)*2+1):
        conflict = next(((left, right) for left, right in zip(decisions, decisions[1:])
                         if left["end"] > right["start"]), None)
        if conflict is None:
            break
        left, right = conflict
        if (right["start_source"] == "verified-transcript"
                and left["end_source"] == "previous-sync" and right["start"] > left["start"]):
            left.update(end=right["start"], end_source="next-verified-start")
        elif (left["end_source"] == "verified-transcript"
                and right["start_source"] == "previous-sync" and left["end"] < right["end"]):
            right.update(start=left["end"], start_source="previous-verified-end")
        else:
            warnings.append(f"repair conflict (replacement withheld): targets {left['target']}, {right['target']}")
            changed = False
            for decision in (left, right):
                old = decision["old"]
                if old is None:
                    decisions.remove(decision)
                    missing.append(decision["target"])
                    changed = True
                    continue
                if decision["start"] != old["start"] or decision["end"] != old["end"]:
                    decision.update(start=float(old["start"]), end=float(old["end"]),
                        start_source="previous-sync", end_source="previous-sync")
                    changed = True
            if not changed:
                raise ValueError("previous cues overlap; automatic repair withheld")
    else:
        raise ValueError("could not resolve cue conflicts; existing sync preserved")

    tokens = transcript_tokens(transcript)
    cues = []
    for decision in decisions:
        target, reference, old = decision["target"], decision["reference"], decision["old"]
        start, end = float(decision["start"]), float(decision["end"])
        if duration is not None and end > float(duration)+.1:
            raise ValueError(f"retained cue exceeds duration: {target}; existing sync preserved")
        quality = dict(reference["quality"]) if reference else {}
        for edge in ("start", "end"):
            verified = decision[f"{edge}_source"] == "verified-transcript"
            quality[f"{edge}Verified"] = verified
            evidence = dict(quality.get(f"{edge}Evidence", {})) if verified else {}
            evidence.update(verified=verified, source=decision[f"{edge}_source"])
            quality[f"{edge}Evidence"] = evidence
            if not verified:
                warnings.append(f"repair unverified {edge} ({decision[f'{edge}_source']}): target {target}")
        quality["reviewRequired"] = (not quality["startVerified"] or not quality["endVerified"]
                                      or bool(reference and reference["quality"]["reviewRequired"]))
        actual = "".join(t.text for t in tokens if t.end > start and t.start < end)
        confidence = SequenceMatcher(None, alignment_text(body[target].text), actual, autojunk=False).ratio()
        cue = dict(start=round(start,2),end=round(end,2),kind=body[target].kind,
            targetIndex=target,targetText=body[target].normalized[:48],confidence=round(confidence,3),
            quality=quality,repair=dict(startSource=decision["start_source"],endSource=decision["end_source"],
                previousStart=old["start"] if old else None,previousEnd=old["end"] if old else None))
        if old and old.get("targetMigration"):
            cue["targetMigration"] = old["targetMigration"]
        cues.append(cue)
    summary = dict(updatedStarts=sum(d["old"] is not None and d["start"] != d["old"]["start"] for d in decisions),
        updatedEnds=sum(d["old"] is not None and d["end"] != d["old"]["end"] for d in decisions),
        addedCues=sum(d["old"] is None for d in decisions),headingsRemoved=headings_removed,
        unverifiedStarts=sum(not c["quality"]["startVerified"] for c in cues),
        unverifiedEnds=sum(not c["quality"]["endVerified"] for c in cues),missingTargets=sorted(set(missing)))
    return dict(payload,alignmentMethod=ALIGNMENT_METHOD,highlightHeadings=False,
        alignmentWarnings=list(dict.fromkeys(warnings)),cues=cues,
        repairMode="verified-boundaries-with-previous-fallback",repairSummary=summary,
        targetMigrations=target_migrations,
        repairFingerprint=fingerprint,repairCueDigest=cue_digest(cues))


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
    parser.add_argument(
        "--allow-unverified", action="store_true",
        help="After manual review, allow publishing cues with unverified boundaries",
    )
    parser.add_argument(
        "--transcript-root", type=Path,
        help="Use supplied transcripts at <root>/<src>.json instead of transcribing",
    )
    parser.add_argument(
        "--transcript-manifest", type=Path,
        help="JSON jobs list selecting book/page/audio and an existing transcript path; never transcribes",
    )
    parser.add_argument(
        "--audit", action="store_true",
        help="Compare existing sync JSON with transcripts without changing sync or Markdown",
    )
    parser.add_argument(
        "--repair", action="store_true",
        help="Repair verified boundaries of existing sync, retain uncertain old boundaries with warnings; never transcribes",
    )
    return parser


def main() -> int:
    project_root = Path(__file__).resolve().parent.parent
    parser = build_parser(project_root)
    args = parser.parse_args()
    if args.repair and (args.audit or args.force or args.force_transcribe or args.allow_unverified):
        parser.error("--repair cannot be combined with --audit/--force/--force-transcribe/--allow-unverified")
    if args.audit and (args.write or args.force or args.force_transcribe or args.allow_unverified):
        parser.error("--audit cannot be combined with --write/--force/--force-transcribe/--allow-unverified")
    if args.transcript_root and args.transcript_manifest:
        parser.error("choose --transcript-root or --transcript-manifest, not both")
    if (args.transcript_root or args.transcript_manifest) and args.force_transcribe:
        parser.error("supplied transcripts cannot be combined with --force-transcribe")
    if not args.all and not args.book and not args.page:
        parser.error("choose --book/--page, or explicitly pass --all")
    if args.model_cache is None:
        args.model_cache = args.cache_root / "models"

    jobs = discover_jobs(args)
    transcript_manifest = None
    if args.transcript_manifest:
        try:
            transcript_manifest = read_transcript_manifest(args.transcript_manifest.resolve())
        except (OSError, ValueError, KeyError, TypeError) as error:
            parser.error(f"invalid transcript manifest: {error}")
        matching_keys = {(job.book, job.page_relative.as_posix(), job.src) for job in jobs}
        unknown = transcript_manifest.keys() - matching_keys
        if unknown:
            parser.error(f"manifest jobs not found in selected content: {sorted(unknown)[:5]}")
        jobs = [job for job in jobs if (job.book, job.page_relative.as_posix(), job.src) in transcript_manifest]
    if not jobs:
        print("No matching audio shortcodes found.")
        return 1

    missing = [job for job in jobs if not job.audio_path.is_file()]
    if (args.transcript_root or args.transcript_manifest is not None or args.audit or args.repair) and not args.scan:
        print(f"Found {len(jobs)} audio job(s); using transcripts without reading local audio.")
    else:
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
    review_jobs = 0

    for number, job in enumerate(jobs, start=1):
        label = f"[{number}/{len(jobs)}] {job.book}/{job.page_relative} :: {job.src}"
        print(label, flush=True)
        try:
            proposal_path = None
            if args.audit or args.repair:
                payload = json.loads(job.output_path.read_text(encoding="utf-8"))
                transcript_path = transcript_manifest[(job.book, job.page_relative.as_posix(), job.src)] if transcript_manifest is not None else (
                    args.transcript_root.joinpath(*audio_source_path(job.src).parts)
                    if args.transcript_root else cache_path_for_job(args.cache_root, job)
                )
                if args.transcript_root and transcript_manifest is None:
                    transcript_path = transcript_path.with_name(transcript_path.name + ".json")
                # Audit never starts Whisper or downloads audio/models.
                transcript = json.loads(transcript_path.read_text(encoding="utf-8-sig"))
                if args.audit:
                    warnings = audit_existing_cues(job.units, payload, transcript, args.low_confidence)
                    status = "audited"
                else:
                    repaired = repair_existing_cues(job.units, payload, transcript, args.low_confidence,
                                                   remap_targets=True)
                    status = "repair_cached" if repaired is payload else "repaired"
                    payload = repaired
                    warnings = list(payload.get("alignmentWarnings", []))
                    if status == "repaired":
                        write_json(job.output_path, payload)
            elif job.output_path.exists() and not args.force:
                payload = json.loads(job.output_path.read_text(encoding="utf-8"))
                warnings = list(payload.get("alignmentWarnings", []))
                if payload.get("alignmentMethod") != ALIGNMENT_METHOD:
                    warnings.append("legacy alignment; use --audit with transcripts or --force to regenerate")
                status = "cached"
            else:
                if transcript_manifest is not None:
                    transcript_path = transcript_manifest[(job.book, job.page_relative.as_posix(), job.src)]
                    transcript = json.loads(transcript_path.read_text(encoding="utf-8-sig"))
                    if job.output_path.exists():
                        previous = json.loads(job.output_path.read_text(encoding="utf-8"))
                        old_duration, new_duration = previous.get("audioDuration"), transcript.get("duration")
                        if old_duration is not None and new_duration is not None and abs(float(old_duration)-float(new_duration)) > 1:
                            raise ValueError("transcript duration mismatch; existing sync preserved")
                elif args.transcript_root:
                    relative = audio_source_path(job.src)
                    transcript_path = args.transcript_root.joinpath(*relative.parts)
                    transcript_path = transcript_path.with_name(transcript_path.name + ".json")
                    transcript = json.loads(transcript_path.read_text(encoding="utf-8-sig"))
                else:
                    transcript = load_or_transcribe(job, args, model_holder)
                cues, warnings = align_units(
                    job.units, transcript, args.low_confidence
                )
                if not cues:
                    raise RuntimeError("no text cues could be aligned")
                payload = {
                    "version": 1,
                    "model": transcript.get("model", args.model),
                    "alignmentMethod": ALIGNMENT_METHOD,
                    "highlightHeadings": False,
                    "alignmentWarnings": warnings,
                    "source": {
                        "page": (Path(job.book) / job.page_relative).as_posix(),
                        "audio": job.src,
                    },
                    "audioDuration": transcript.get("duration"),
                    "cues": cues,
                }
                unverified = alignment_requires_review(cues, warnings)
                if unverified and not args.allow_unverified:
                    proposal_path = args.cache_root / "proposals" / job.output_path.relative_to(args.output_root.resolve())
                    write_json(proposal_path, payload)
                    status = "needs_review"
                    review_jobs += 1
                    print(f"  Unverified boundaries; existing sync and Markdown preserved. Proposal: {proposal_path}")
                else:
                    write_json(job.output_path, payload)
                    status = "generated"
            if status != "needs_review":
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
                    "proposal": str(proposal_path) if proposal_path else None,
                    "repairSummary": payload.get("repairSummary") if args.repair else None,
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
        "withheldJobCount": review_jobs,
        "warningCount": sum(len(job.get("warnings", [])) for job in report),
        "jobsRequiringReview": sum(bool(job.get("warnings")) for job in report),
        "markdownPagesChanged": changed_pages,
        "jobs": report,
    }
    report_path = args.cache_root / ("last-audit-report.json" if args.audit else "last-repair-report.json" if args.repair else "last-report.json")
    write_json(report_path, report_payload)
    print(f"Report: {report_path}")
    print(f"Warnings: {report_payload['warningCount']}; "
          f"jobs requiring review: {report_payload['jobsRequiringReview']}")
    if args.audit:
        print("Audit only; sync JSON and Markdown were not changed.")
    elif args.write:
        print(f"Markdown pages changed: {changed_pages}")
    else:
        print("Markdown was not changed; pass --write after reviewing the report.")
    if failures:
        return 1
    return 2 if review_jobs or ((args.audit or args.repair) and report_payload["warningCount"]) else 0


if __name__ == "__main__":
    raise SystemExit(main())
