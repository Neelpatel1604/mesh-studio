from dataclasses import dataclass
import re


@dataclass
class CodeChangeResult:
    updated_code: str
    applied: bool
    mode: str
    replacement_count: int
    error: str | None = None


def parse_search_replace_blocks(text: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    remaining = text

    while True:
        marker_pos = remaining.find("<<<REPLACE")
        if marker_pos == -1:
            break

        after_marker = remaining[marker_pos + len("<<<REPLACE") :]
        newline_idx = after_marker.find("\n")
        if newline_idx == -1:
            break
        after_newline = after_marker[newline_idx + 1 :]

        sep = after_newline.find("\n===\n")
        if sep == -1:
            break
        old_text = after_newline[:sep]

        after_sep = after_newline[sep + len("\n===\n") :]
        end = after_sep.find("\n>>>")
        if end == -1:
            break
        new_text = after_sep[:end]

        if old_text:
            pairs.append((old_text, new_text))

        remaining = after_sep[end + len("\n>>>") :]

    return pairs


def parse_markdown_find_replace_blocks(text: str) -> list[tuple[str, str]]:
    pattern = re.compile(
        r"\*\*Find:\*\*\s*```(?:synapscad|openscad|scad)?\n(.*?)\n```"
        r"\s*\*\*Replace with:\*\*\s*```(?:synapscad|openscad|scad)?\n(.*?)\n```",
        re.IGNORECASE | re.DOTALL,
    )
    matches = pattern.findall(text)
    return [(old.strip("\n"), new.strip("\n")) for old, new in matches if old]


def has_find_replace_intent(text: str) -> bool:
    lowered = text.lower()
    return ("**find:**" in lowered and "**replace with:**" in lowered) or (
        "<<<replace" in lowered
    )


def extract_fenced_code(text: str) -> str | None:
    markers = ("```synapscad", "```openscad")
    found_idx = -1
    found_marker = ""
    for marker in markers:
        idx = text.find(marker)
        if idx != -1 and (found_idx == -1 or idx < found_idx):
            found_idx = idx
            found_marker = marker

    if found_idx == -1:
        return None

    rest = text[found_idx + len(found_marker) :]
    newline_idx = rest.find("\n")
    if newline_idx == -1:
        return None

    code_rest = rest[newline_idx + 1 :]
    end = code_rest.find("```")
    if end == -1:
        return None

    code = code_rest[:end].strip()
    return code or None


def apply_search_replace(
    current_code: str,
    replacements: list[tuple[str, str]],
) -> tuple[str, int] | tuple[None, str]:
    result = current_code
    applied_count = 0
    for idx, (old_text, new_text) in enumerate(replacements, start=1):
        matches = result.count(old_text)
        if matches == 0:
            return None, (
                f"Search-and-replace #{idx}: could not find target text in current code"
            )
        if matches > 1:
            return None, (
                f"Search-and-replace #{idx}: target appears {matches} times; "
                "it must match exactly once"
            )
        result = result.replace(old_text, new_text, 1)
        applied_count += 1

    return result, applied_count


def apply_ai_code_change(current_code: str, ai_text: str) -> CodeChangeResult:
    replacements = parse_search_replace_blocks(ai_text)
    if not replacements:
        replacements = parse_markdown_find_replace_blocks(ai_text)

    if replacements:
        apply_result = apply_search_replace(current_code, replacements)
        if apply_result[0] is None:
            return CodeChangeResult(
                updated_code=current_code,
                applied=False,
                mode="search_replace",
                replacement_count=0,
                error=apply_result[1],
            )
        updated_code, count = apply_result
        return CodeChangeResult(
            updated_code=updated_code,
            applied=updated_code != current_code,
            mode="search_replace",
            replacement_count=count,
        )

    if has_find_replace_intent(ai_text):
        return CodeChangeResult(
            updated_code=current_code,
            applied=False,
            mode="search_replace",
            replacement_count=0,
            error="Model returned find/replace format, but no valid unique replacement could be applied.",
        )

    fenced = extract_fenced_code(ai_text)
    if fenced is not None:
        return CodeChangeResult(
            updated_code=fenced,
            applied=fenced != current_code,
            mode="full_replace",
            replacement_count=0,
        )

    return CodeChangeResult(
        updated_code=current_code,
        applied=False,
        mode="none",
        replacement_count=0,
    )
