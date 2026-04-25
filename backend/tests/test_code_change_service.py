from app.services.code_change_service import (
    apply_ai_code_change,
    extract_fenced_code,
    parse_search_replace_blocks,
)


def test_parse_search_replace_blocks_single() -> None:
    text = "<<<REPLACE\ncube(10);\n===\ncube(20);\n>>>"
    pairs = parse_search_replace_blocks(text)
    assert pairs == [("cube(10);", "cube(20);")]


def test_apply_search_replace_unique_match() -> None:
    current = "cube(10);\nsphere(5);"
    text = "<<<REPLACE\ncube(10);\n===\ncube(20);\n>>>"
    result = apply_ai_code_change(current, text)
    assert result.applied is True
    assert result.mode == "search_replace"
    assert result.updated_code == "cube(20);\nsphere(5);"
    assert result.replacement_count == 1


def test_apply_search_replace_ambiguous_errors() -> None:
    current = "cube(10);\ncube(10);"
    text = "<<<REPLACE\ncube(10);\n===\ncube(20);\n>>>"
    result = apply_ai_code_change(current, text)
    assert result.applied is False
    assert result.mode == "search_replace"
    assert result.error is not None
    assert "appears 2 times" in result.error


def test_extract_fenced_code_and_apply_full_replace() -> None:
    current = "cube(10);"
    text = "```synapscad\nsphere(12);\n```"
    assert extract_fenced_code(text) == "sphere(12);"
    result = apply_ai_code_change(current, text)
    assert result.applied is True
    assert result.mode == "full_replace"
    assert result.updated_code == "sphere(12);"


def test_replace_failure_falls_back_to_full_replace() -> None:
    current = "cube(10);"
    text = (
        "<<<REPLACE\nmissing(1);\n===\nmissing(2);\n>>>\n\n"
        "```openscad\ntranslate([1,0,0]) cube(5);\n```"
    )
    result = apply_ai_code_change(current, text)
    assert result.applied is False
    assert result.mode == "search_replace"
    assert result.updated_code == current
    assert result.error is not None


def test_markdown_find_replace_format_applies() -> None:
    current = "cube(10);"
    text = (
        "**Find:**\n```openscad\ncube(10);\n```\n\n"
        "**Replace with:**\n```openscad\ncube(20);\n```"
    )
    result = apply_ai_code_change(current, text)
    assert result.applied is True
    assert result.mode == "search_replace"
    assert result.updated_code == "cube(20);"
