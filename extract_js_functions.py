#!/usr/bin/env python3
"""Recursively extract all function definitions from .js files, excluding node_modules."""

import re
from pathlib import Path

KEYWORDS = frozenset({
    "if", "for", "while", "switch", "catch", "with", "function", "super",
    "media", "return", "typeof", "instanceof", "new", "default", "export",
    "import", "from", "of", "in", "as", "const", "let", "var", "class",
    "extends", "try", "throw", "else", "case", "break", "continue",
})

SKIP_NAMES = frozenset({
    "constructor", "get", "set", "main", "init", "flush",
    "onclick", "onerror", "onload", "onmessage", "onchange", "oninput",
})

EXCLUDE_PATH_PATTERNS = (
    "/lib/",
    "decimal.js",
    "break_infinity",
    "break_eternity",
    "pako.min.js",
    "zip.min.js",
)

MAX_PARAM_LEN = 100
INVALID_PARAM_CHARS = frozenset("{};")


def _params_valid(params: str) -> bool:
    if len(params) > MAX_PARAM_LEN:
        return False
    if any(c in params for c in INVALID_PARAM_CHARS):
        return False
    if "=>" in params:
        return False
    return True


def extract_functions(content: str, filepath: str) -> list[tuple[str, str, str]]:
    """Extract (name, params, filepath) from JS content."""
    results = []
    normalized = content.replace("\r\n", "\n").replace("\r", "\n")

    patterns = [
        (r"function\s+(\w+)\s*\(([^)]*)\)", "function"),
        (r"async\s+function\s+(\w+)\s*\(([^)]*)\)", "async function"),
        (r"(\w+)\s*=\s*function\s*\(([^)]*)\)", "function expr"),
        (r"(\w+)\s*=\s*async\s+function\s*\(([^)]*)\)", "async function expr"),
        (r"(\w+)\s*=\s*\((.*?)\)\s*=>", "arrow"),
        (r"(\w+)\s*=\s*async\s*\((.*?)\)\s*=>", "async arrow"),
        (r"(\w+)\s*:\s*function\s*\(([^)]*)\)", "method"),
        (r"(\w+)\s*\(([^)]*)\)\s*\{", "method shorthand"),
        (r"get\s+(\w+)\s*\(([^)]*)\)", "getter"),
        (r"set\s+(\w+)\s*\(([^)]*)\)", "setter"),
        (r"\*\s*(\w+)\s*\(([^)]*)\)", "generator"),
        (r"async\s*\*\s*(\w+)\s*\(([^)]*)\)", "async generator"),
    ]

    for pattern, _ in patterns:
        for m in re.finditer(pattern, normalized, re.DOTALL):
            name, params = m.group(1), m.group(2)
            if name in KEYWORDS or name in SKIP_NAMES:
                continue
            if len(name) <= 1:
                continue
            params_clean = " ".join(params.split())
            if not _params_valid(params_clean):
                continue
            results.append((name, params_clean, filepath))

    return results


def _is_library_path(path: Path) -> bool:
    path_str = path.as_posix()
    return any(p in path_str for p in EXCLUDE_PATH_PATTERNS)


def scan_directory(root: Path, exclude_dirs: set[str]) -> list[tuple[str, str, str]]:
    """Walk directory and collect all function definitions."""
    all_funcs = []
    for path in root.rglob("*.js"):
        if any(part in path.parts for part in exclude_dirs):
            continue
        if _is_library_path(path):
            continue
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
            rel = path.relative_to(root)
            all_funcs.extend(extract_functions(content, str(rel)))
        except Exception:
            pass
    return all_funcs


def main():
    root = Path(__file__).resolve().parent
    exclude = {"node_modules"}
    funcs = scan_directory(root, exclude)

    sig_data = {}
    for name, params, filepath in funcs:
        sig = f"{name}({params})" if params else f"{name}()"
        if sig not in sig_data:
            sig_data[sig] = {"count": 0, "files": set()}
        sig_data[sig]["count"] += 1
        sig_data[sig]["files"].add(filepath)

    sorted_sigs = sorted(
        sig_data.items(),
        key=lambda x: (-x[1]["count"], x[0].lower()),
    )

    out_path = root / "js_functions_list.txt"
    with open(out_path, "w", encoding="utf-8") as f:
        for sig, data in sorted_sigs:
            files_str = ", ".join(sorted(data["files"]))
            f.write(f"{sig} ({data['count']}) ({files_str})\n")

    print(f"Wrote {len(sorted_sigs)} unique functions ({len(funcs)} total) to {out_path}")


if __name__ == "__main__":
    main()
