import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

COMMIT_LINE_RE = re.compile(r"^([0-9a-f]{40})\t(.*)$")

SKIP_JS_DIR_PARTS = frozenset(
    {"node_modules", "tests", "test", "__tests__", ".git"}
)


def repo_root() -> Path:
    p = Path(__file__).resolve().parent
    for d in (p, *p.parents):
        if (d / ".git").is_dir():
            return d
    c = Path.cwd()
    if (c / ".git").is_dir():
        return c
    print("error: not inside a git repository", file=sys.stderr)
    sys.exit(1)


def git_numstat(root: Path, branch: str, count: int) -> str:
    r = subprocess.run(
        [
            "git",
            "-C",
            str(root),
            "log",
            branch,
            f"-{count}",
            "--numstat",
            "--pretty=format:%H%x09%s",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if r.returncode != 0:
        print(r.stderr or r.stdout, file=sys.stderr)
        sys.exit(r.returncode)
    return r.stdout


def basename_norm(path: str) -> str:
    return os.path.basename(path.replace("\\", "/"))


def is_repo_tools_path(path: str) -> bool:
    p = path.replace("\\", "/")
    return p == "tools" or p.startswith("tools/")


def parse_numstat_line(line: str):
    parts = line.split("\t")
    if len(parts) < 3:
        return None
    add_s, del_s = parts[0], parts[1]
    path = "\t".join(parts[2:])
    if not add_s.isdigit() or not del_s.isdigit():
        return None
    return int(add_s), int(del_s), path


def top_grew_shrank(
    file_stats: dict[str, tuple[int, int]], limit: int
) -> tuple[
    list[tuple[str, int, int, int]],
    list[tuple[str, int, int, int]],
]:
    items = [(path, a, d, a - d) for path, (a, d) in file_stats.items()]
    pos = [(p, a, d, n) for p, a, d, n in items if n > 0]
    pos.sort(key=lambda t: t[3], reverse=True)
    neg = [(p, a, d, n) for p, a, d, n in items if n < 0]
    neg.sort(key=lambda t: t[3])
    return pos[:limit], neg[:limit]


def trunc_path(path: str, max_len: int) -> str:
    if len(path) <= max_len:
        return path
    return path[: max_len - 1] + "..."


def count_js_lines(root: Path) -> tuple[int, int]:
    total = 0
    n_files = 0
    for path in root.rglob("*.js"):
        try:
            rel = path.relative_to(root)
        except ValueError:
            continue
        if any(p in SKIP_JS_DIR_PARTS for p in rel.parts[:-1]):
            continue
        try:
            data = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        n_files += 1
        if data:
            total += data.count("\n") + (0 if data.endswith("\n") else 1)
    return total, n_files



def main() -> None:
    ap = argparse.ArgumentParser(
        description="Git numstat table (excl. core_principles.txt, tools/) plus total .js lines in repo (excl. node_modules, tests, test, __tests__).",
    )
    ap.add_argument("--branch", default="master")
    ap.add_argument("-n", "--count", type=int, default=5)
    ap.add_argument(
        "--top",
        type=int,
        default=5,
        metavar="N",
        help="Top N files by net lines gained/lost per commit (default: 5).",
    )
    ap.add_argument(
        "--exclude",
        action="append",
        default=[],
        metavar="BASENAME",
        help="Basename to exclude (default: core_principles.txt). Repeatable.",
    )
    ap.add_argument(
        "--no-color",
        action="store_true",
        help="Disable ANSI colors (NO_COLOR env also disables).",
    )
    args = ap.parse_args()
    excluded = {"core_principles.txt"}
    excluded.update(basename_norm(x) for x in args.exclude)

    root = repo_root()
    text = git_numstat(root, args.branch, args.count)
    rows = []
    cur_hash = None
    cur_subject = None
    file_stats: dict[str, tuple[int, int]] = {}
    top_n = max(1, args.top)

    def flush():
        nonlocal file_stats, cur_hash, cur_subject
        if cur_hash is None:
            return
        add_sum = sum(a for a, _ in file_stats.values())
        del_sum = sum(d for _, d in file_stats.values())
        files = len(file_stats)
        net = add_sum - del_sum
        churn = add_sum + del_sum
        grew, shrank = top_grew_shrank(file_stats, top_n)
        rows.append(
            {
                "hash": cur_hash,
                "subject": cur_subject or "",
                "add": add_sum,
                "del": del_sum,
                "net": net,
                "churn": churn,
                "files": files,
                "top_grew": grew,
                "top_shrank": shrank,
            }
        )
        file_stats = {}

    for raw in text.splitlines():
        line = raw.rstrip("\r")
        m = COMMIT_LINE_RE.match(line)
        if m:
            flush()
            cur_hash, cur_subject = m.group(1), m.group(2)
            continue
        stat = parse_numstat_line(line)
        if stat is None:
            continue
        a, d, path = stat
        if is_repo_tools_path(path):
            continue
        if basename_norm(path) in excluded:
            continue
        pa, pd = file_stats.get(path, (0, 0))
        file_stats[path] = (pa + a, pd + d)

    flush()

    short = 8
    w_subj = max((len(r["subject"]) for r in rows), default=0)
    w_subj = min(w_subj, 72)

    use_color = (
        not args.no_color
        and sys.stdout.isatty()
        and os.environ.get("NO_COLOR") is None
    )

    def sty(text: str, *codes: str) -> str:
        if not use_color or not codes:
            return text
        return f"\033[{';'.join(codes)}m{text}\033[0m"

    col_commit = f"{'commit':<{short}}"
    col_plus = f"{'+':>8}"
    col_minus = f"{'-':>8}"
    col_net = f"{'net':>8}"
    col_churn = f"{'churn':>8}"
    col_files = f"{'files':>5}"
    print(
        f"{sty(col_commit, '1', '36')}  "
        f"{sty(col_plus, '1', '32')}  "
        f"{sty(col_minus, '1', '31')}  "
        f"{sty(col_net, '1', '36')}  "
        f"{sty(col_churn, '1', '35')}  "
        f"{sty(col_files, '1', '36')}  "
        f"{sty('subject', '1', '36')}"
    )
    print(
        sty(
            f"{'-' * short}  {'-' * 8}  {'-' * 8}  {'-' * 8}  {'-' * 8}  {'-' * 5}  {'-' * w_subj}",
            "2",
        )
    )

    tot_add = tot_del = tot_files = 0
    for r in rows:
        tot_add += r["add"]
        tot_del += r["del"]
        tot_files += r["files"]
        subj = r["subject"]
        if len(subj) > w_subj:
            subj = subj[: w_subj - 1] + "..."
        net = r["net"]
        net_codes = ("1", "32") if net > 0 else ("1", "31") if net < 0 else ("2", "33")
        rh = r["hash"][:short]
        ra, rd, rch, rfi = r["add"], r["del"], r["churn"], r["files"]
        print(
            f"{sty(f'{rh:<{short}}', '2', '37')}  "
            f"{sty(f'{ra:>8}', '32')}  "
            f"{sty(f'{rd:>8}', '31')}  "
            f"{sty(f'{net:>8}', *net_codes)}  "
            f"{sty(f'{rch:>8}', '36')}  "
            f"{sty(f'{rfi:>5}', '2', '37')}  "
            f"{subj}"
        )

    if rows:
        tnet = tot_add - tot_del
        tnet_codes = ("1", "32") if tnet > 0 else ("1", "31") if tnet < 0 else ("2", "33")
        tot_lbl = f"{'TOTAL':<{short}}"
        tsum = tot_add + tot_del
        print(
            f"{sty(tot_lbl, '1', '97')}  "
            f"{sty(f'{tot_add:>8}', '1', '32')}  "
            f"{sty(f'{tot_del:>8}', '1', '31')}  "
            f"{sty(f'{tnet:>8}', *tnet_codes)}  "
            f"{sty(f'{tsum:>8}', '1', '35')}  "
            f"{sty(f'{tot_files:>5}', '1', '37')}"
        )

    path_w = 88
    print(
        sty(
            f"\nPer commit: top {top_n} files by net lines (+/- numstat; same exclusions as table)",
            "1",
            "36",
        )
    )
    for r in rows:
        subj_full = r["subject"]
        print(sty(f"\n{r['hash'][:short]}  {subj_full}", "1", "37"))
        print(sty(f"  grew (net +, top {top_n}):", "1", "32"))
        if r["top_grew"]:
            for pth, a, d, n in r["top_grew"]:
                tail = trunc_path(pth, path_w)
                net_s = sty(f"{n:+d}", "1", "32")
                ad_s = sty(f"+{a}/-{d}", "2", "37")
                print(f"    {net_s}  ({ad_s})  {tail}")
        else:
            print(sty("    (none)", "2", "37"))
        print(sty(f"  shrank (net -, top {top_n}):", "1", "31"))
        if r["top_shrank"]:
            for pth, a, d, n in r["top_shrank"]:
                tail = trunc_path(pth, path_w)
                net_s = sty(f"{n:+d}", "1", "31")
                ad_s = sty(f"+{a}/-{d}", "2", "37")
                print(f"    {net_s}  ({ad_s})  {tail}")
        else:
            print(sty("    (none)", "2", "37"))

    print(sty(f"\nexcluded basenames: {', '.join(sorted(excluded))}", "2", "37"))
    print(sty("ignored path prefix: tools/ (repo root only)", "2", "37"))

    js_lines, js_files = count_js_lines(root)
    js_note = (
        ".js in working tree: "
        f"{js_lines:,} lines in {js_files:,} files "
        "(excl. path segments: node_modules, tests, test, __tests__, .git)"
    )
    print(sty(f"\n{js_note}", "1", "36"))


if __name__ == "__main__":
    main()
