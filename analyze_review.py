import os
import re
import json
import subprocess
import datetime
import hashlib
from pathlib import Path
from collections import defaultdict

PROJECT_ROOT = Path("public/src")
REPORT_OUTPUT = Path("code_smell_report.md")
HISTORY_FILE = Path("smell_history.json")
RESOLVED_FILE = Path("smell_resolved.json")
BASELINE_FILE = Path("smell_baseline.json")

THRESHOLDS = {
    "GOD_FILE_LOC": 300,
    "GOD_FILE_FUNCS": 15,
    "FRAGMENT_LOC": 30,
    "MIN_DUPLICATE_FRAGMENTS": 2,
    "LONG_METHOD": 40,
    "DEEP_NESTING": 3,
    "COMPLEXITY": 10,
    "COGNITIVE_COMPLEXITY": 15,
    "MAX_PARAMS": 4,
    "MAGIC_NUMBERS": 5,
    "DATA_CLUMP_PREFIX_COUNT": 3,
    "MAX_SWITCH_CASES": 5,
    "MAX_ELSE_COUNT": 5,
    "CROSS_FILE_DATA_CLUMP": 2,
    "SWITCH_OVERLOAD_COUNT": 3,
    "NULL_CHECK_CHAIN_MIN": 3,
    "SEQUENTIAL_AWAIT_MIN": 1,
    "MIDDLE_MAN_METHODS": 3,
    "FEATURE_ENVY_CALLS": 5,
    "DIVERGENT_CHANGE_OBSTRUCTIONS": 3,
    "TEMP_FIELD_MIN": 2,
    "SPECULATIVE_UNUSED_PARAMS": 3,
    "UNBOUNDED_CONCURRENCY_MIN": 1,
    "N_PLUS_ONE_MIN": 1,
    "PARAM_DRILLING_MIN_PARAMS": 5,
    "VOCAB_VARIANT_MIN": 2,
    "VENDOR_IMPORTS_MIN": 1,
    "MAX_EXAMPLES_PER_SMELL": 5,
}

TAXONOMY = {
    "God File": {"Obstruction": "Bloater", "Expanse": "Within", "Occurrence": "Measured Smells", "Effort": "High", "Risk": "High"},
    "Low Cohesion": {"Obstruction": "Bloater", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "High", "Risk": "High"},
    "Long Method": {"Obstruction": "Bloater", "Expanse": "Within", "Occurrence": "Measured Smells", "Effort": "Medium", "Risk": "Low"},
    "Long Parameter List": {"Obstruction": "Bloater", "Expanse": "Within", "Occurrence": "Measured Smells", "Effort": "Medium", "Risk": "Low"},
    "Primitive Obsession": {"Obstruction": "Bloater", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "Medium", "Risk": "Medium"},
    "Data Clump": {"Obstruction": "Bloater", "Expanse": "Between", "Occurrence": "Responsibility", "Effort": "Medium", "Risk": "Low"},
    "High Complexity": {"Obstruction": "Change Preventer", "Expanse": "Within", "Occurrence": "Conditional Logic", "Effort": "Medium", "Risk": "Medium"},
    "Cognitive Complexity": {"Obstruction": "Change Preventer", "Expanse": "Within", "Occurrence": "Conditional Logic", "Effort": "Medium", "Risk": "Medium"},
    "Else Obsession": {"Obstruction": "Change Preventer", "Expanse": "Within", "Occurrence": "Conditional Logic", "Effort": "Low", "Risk": "Low"},
    "Sequential Async": {"Obstruction": "Change Preventer", "Expanse": "Within", "Occurrence": "Conditional Logic", "Effort": "Low", "Risk": "Medium"},
    "Null-Check Hell": {"Obstruction": "Change Preventer", "Expanse": "Within", "Occurrence": "Conditional Logic", "Effort": "Low", "Risk": "Low"},
    "Swiss Army Knife": {"Obstruction": "OO Abuser", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "Medium", "Risk": "Low"},
    "Switch Statements": {"Obstruction": "OO Abuser", "Expanse": "Within", "Occurrence": "Conditional Logic", "Effort": "Medium", "Risk": "Medium"},
    "Switch Statement Overload": {"Obstruction": "OO Abuser", "Expanse": "Between", "Occurrence": "Conditional Logic", "Effort": "Medium", "Risk": "Medium"},
    "Refused Bequest": {"Obstruction": "OO Abuser", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "Medium", "Risk": "Medium"},
    "Temporary Field": {"Obstruction": "OO Abuser", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "Medium", "Risk": "Low"},
    "Divergent Change": {"Obstruction": "Change Preventer", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "High", "Risk": "High"},
    "N+1 Problem": {"Obstruction": "Change Preventer", "Expanse": "Within", "Occurrence": "Conditional Logic", "Effort": "Medium", "Risk": "High"},
    "Memory Leaks": {"Obstruction": "Change Preventer", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "Low", "Risk": "High"},
    "Unbounded Concurrency": {"Obstruction": "Change Preventer", "Expanse": "Within", "Occurrence": "Conditional Logic", "Effort": "Low", "Risk": "High"},
    "Fragment": {"Obstruction": "Dispensable", "Expanse": "Between", "Occurrence": "Unnecessary Complexity", "Effort": "Low", "Risk": "Very Low"},
    "Semantic Duplication": {"Obstruction": "Dispensable", "Expanse": "Between", "Occurrence": "Unnecessary Complexity", "Effort": "Medium", "Risk": "Low"},
    "Speculative Generality": {"Obstruction": "Dispensable", "Expanse": "Within", "Occurrence": "Unnecessary Complexity", "Effort": "Low", "Risk": "Very Low"},
    "Lazy/Data Class": {"Obstruction": "Dispensable", "Expanse": "Within", "Occurrence": "Unnecessary Complexity", "Effort": "Low", "Risk": "Low"},
    "Magic Numbers": {"Obstruction": "Dispensable", "Expanse": "Within", "Occurrence": "Unnecessary Complexity", "Effort": "Low", "Risk": "Low"},
    "Dead Code": {"Obstruction": "Dispensable", "Expanse": "Within", "Occurrence": "Unnecessary Complexity", "Effort": "Low", "Risk": "Very Low"},
    "Binary Operator in Name": {"Obstruction": "Dispensable", "Expanse": "Within", "Occurrence": "Names", "Effort": "Low", "Risk": "Low"},
    "What Comment": {"Obstruction": "Dispensable", "Expanse": "Within", "Occurrence": "Unnecessary Complexity", "Effort": "Low", "Risk": "Very Low"},
    "Boolean Overload": {"Obstruction": "Dispensable", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "Medium", "Risk": "Low"},
    "Callback Hell": {"Obstruction": "Change Preventer", "Expanse": "Within", "Occurrence": "Conditional Logic", "Effort": "Medium", "Risk": "Medium"},
    "Message Chains": {"Obstruction": "Coupler", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "Medium", "Risk": "Low"},
    "Shotgun Surgery": {"Obstruction": "Coupler", "Expanse": "Between", "Occurrence": "Responsibility", "Effort": "High", "Risk": "High"},
    "Feature Envy": {"Obstruction": "Coupler", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "Medium", "Risk": "Low"},
    "Inappropriate Intimacy": {"Obstruction": "Coupler", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "Medium", "Risk": "Medium"},
    "Middle Man": {"Obstruction": "Coupler", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "Low", "Risk": "Low"},
    "Global Insecurity": {"Obstruction": "Coupler", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "Medium", "Risk": "Medium"},
    "Parallel Inheritance Hierarchies": {"Obstruction": "Change Preventer", "Expanse": "Between", "Occurrence": "Responsibility", "Effort": "High", "Risk": "High"},
    "Mutant Arguments": {"Obstruction": "Functional Abuser", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "Low", "Risk": "Medium"},
    "Ghost State": {"Obstruction": "Functional Abuser", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "Medium", "Risk": "Medium"},
    "Parameter Drilling": {"Obstruction": "Coupler", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "Medium", "Risk": "Low"},
    "Vague Name": {"Obstruction": "Dispensable", "Expanse": "Within", "Occurrence": "Names", "Effort": "Low", "Risk": "Low"},
    "Inconsistent Vocabulary": {"Obstruction": "Dispensable", "Expanse": "Between", "Occurrence": "Names", "Effort": "Low", "Risk": "Low"},
    "Boolean Negation": {"Obstruction": "Dispensable", "Expanse": "Within", "Occurrence": "Names", "Effort": "Low", "Risk": "Low"},
    "Layer Violation": {"Obstruction": "Coupler", "Expanse": "Between", "Occurrence": "Responsibility", "Effort": "High", "Risk": "High"},
    "Anemic Domain Model": {"Obstruction": "OO Abuser", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "Medium", "Risk": "Medium"},
    "Vendor Lock-in": {"Obstruction": "Coupler", "Expanse": "Between", "Occurrence": "Responsibility", "Effort": "Medium", "Risk": "Medium"},
    "Side Effects": {"Obstruction": "Functional Abuser", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "Medium", "Risk": "Medium"},
    "Imperative Loops": {"Obstruction": "Functional Abuser", "Expanse": "Within", "Occurrence": "Unnecessary Complexity", "Effort": "Low", "Risk": "Low"},
    "Afraid to Fail": {"Obstruction": "Coupler", "Expanse": "Within", "Occurrence": "Responsibility", "Effort": "Medium", "Risk": "Low"},
}

REFACTORING_CATALOG = {
    "God File": ["Extract Class", "Extract Subclass"],
    "Low Cohesion": ["Extract Module", "Extract Class"],
    "Long Method": ["Extract Method", "Decompose Conditional", "Replace Temp with Query"],
    "Long Parameter List": ["Introduce Parameter Object", "Preserve Whole Object"],
    "Primitive Obsession": ["Replace Data Value with Object", "Encapsulate Record"],
    "Magic Numbers": ["Replace Magic Number with Symbolic Constant"],
    "Data Clump": ["Extract Class", "Introduce Parameter Object"],
    "High Complexity": ["Extract Method", "Decompose Conditional", "Replace Conditional with Polymorphism"],
    "Cognitive Complexity": ["Extract Method", "Replace Nested Conditional with Guard Clauses"],
    "Else Obsession": ["Replace Nested Conditional with Guard Clauses"],
    "Sequential Async": ["Substitute Algorithm (Promise.all)", "Extract Method"],
    "Null-Check Hell": ["Introduce Null Object", "Replace Conditional with Optional Chaining"],
    "Swiss Army Knife": ["Replace Parameter with Explicit Methods", "Split Method"],
    "Switch Statements": ["Replace Conditional with Polymorphism", "Replace Type Code with State/Strategy"],
    "Switch Statement Overload": ["Replace Conditional with Polymorphism", "Introduce Factory Method"],
    "Refused Bequest": ["Replace Inheritance with Delegation"],
    "Temporary Field": ["Extract Class"],
    "Divergent Change": ["Extract Module", "Extract Class"],
    "N+1 Problem": ["Substitute Algorithm (Batching)", "Introduce Data Loader"],
    "Memory Leaks": ["Introduce Lifecycle Cleanup", "Encapsulate Resource Management"],
    "Unbounded Concurrency": ["Substitute Algorithm (Concurrency Limit)", "Introduce Queue"],
    "Parallel Inheritance Hierarchies": ["Replace Inheritance with Composition", "Collapse Hierarchy"],
    "Fragment": ["Inline Class", "Move Method"],
    "Semantic Duplication": ["Consolidate into Utility", "Extract Module"],
    "Speculative Generality": ["Remove Dead Code", "Collapse Hierarchy"],
    "Lazy/Data Class": ["Collapse Hierarchy", "Move Method"],
    "Dead Code": ["Remove Dead Code", "Delete Commented-Out Code"],
    "Boolean Overload": ["Replace Parameter with Explicit Methods", "Introduce Parameter Object"],
    "Binary Operator in Name": ["Split Temporary Variable", "Extract Method"],
    "What Comment": ["Rename Method", "Introduce Assertion"],
    "Callback Hell": ["Extract Method", "Replace Nested Conditional with Guard Clauses"],
    "Message Chains": ["Hide Delegate", "Extract Method"],
    "Shotgun Surgery": ["Move Method", "Inline Class"],
    "Feature Envy": ["Move Method"],
    "Inappropriate Intimacy": ["Hide Delegate", "Extract Class"],
    "Middle Man": ["Remove Middle Man", "Inline Class"],
    "Global Insecurity": ["Dependency Injection", "Encapsulate Variable"],
    "Mutant Arguments": ["Separate Query from Modifier", "Return Modified Copy"],
    "Ghost State": ["Remove Redundant State", "Introduce Derived Value"],
    "Parameter Drilling": ["Introduce Parameter Object", "Dependency Injection"],
    "Vague Name": ["Rename Method", "Rename Class"],
    "Inconsistent Vocabulary": ["Rename Method", "Introduce Ubiquitous Language"],
    "Boolean Negation": ["Rename Variable", "Replace Negated Conditional with Guard Clause"],
    "Layer Violation": ["Extract Service", "Enforce Layering Boundaries"],
    "Anemic Domain Model": ["Move Method", "Encapsulate Collection"],
    "Vendor Lock-in": ["Introduce Adapter", "Encapsulate Third-Party API"],
    "Side Effects": ["Separate Query from Modifier"],
    "Imperative Loops": ["Substitute Algorithm (use Map/Filter/Reduce)"],
    "Afraid to Fail": ["Replace Nested Conditional with Guard Clauses", "Replace Error Code with Exception"],
}

ARCHITECTURE_GUARDRAILS = {
    "philosophy": [
        "Core is blind; UI is an observer.",
        "Core logic (`/src/core`) must not reference `ui`, `document`, or `window`; it mutates Store and emits events.",
        "UI (`/src/components/ui`) observes Store changes and EventBus triggers.",
        "Services (`/src/services`) expose pure data/external API boundaries consumable by core and UI.",
    ],
    "store_state": [
        "Use `store.js` for persistent or cross-view state (`money`, `heat`, `power`, toggles).",
        "Core mutates via `game.state` only; do not call `ui.update()` manually.",
        "UI subscribes via `game.state.subscribe(key, callback)` during initialization.",
        "UI must invoke returned `unsubscribe` callbacks during teardown.",
        "`runUpdateInterfaceLoop` remains the central sync point for batched dirty-key UI updates.",
    ],
    "event_bus": [
        "Use `game.on()`/`game.emit()` for ephemeral events that do not belong in Store.",
        "Domain events include `partPlaced`, `componentExploded`, `objectiveClaimed`.",
        "Audio/FX listeners (for example, `AudioController`, `ParticleEffectsUI`) should react to emitted events.",
        "Do not hardcode `game.audio.play()` calls inside Tile/Engine/domain classes.",
    ],
    "command_pattern": [
        "UI invokes high-level game actions (for example, `game.sell_action()`) instead of mutating core values directly.",
        "UI must change settings through action methods, not direct state/field writes.",
    ],
    "dependency_injection": [
        "Inject Store/EventEmitter through constructors.",
        "Avoid `window.game` inside class logic to preserve testability and runtime isolation.",
    ],
}

class AdvancedSmellDetector:
    def __init__(self, root_path, save_baseline=False):
        self.root_path = root_path
        self.save_baseline = save_baseline
        self.findings = []
        self.signatures = defaultdict(lambda: {"count": 0, "files": set()})
        self.switch_signatures = defaultdict(lambda: {"count": 0, "files": set()})
        self.extended_classes = []
        self.file_smell_obstructions = defaultdict(set)
        self.vocab_usage = defaultdict(lambda: {"verbs": set(), "files": set()})
        self.fragment_candidates = defaultdict(list)
        self.history = self._load_history()
        self.resolved = self._load_resolved()
        self.baseline = self._load_baseline()

    def _get_structural_signature(self, content):
        code = re.sub(r'//.*', '', content)
        code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
        code = re.sub(r'["\'`].*?["\'`]', '""', code, flags=re.DOTALL)
        code = re.sub(r'\b[a-zA-Z_]\w*\b', 'ID', code)
        code = re.sub(r'\s+', '', code)
        return hashlib.sha256(code.encode('utf-8')).hexdigest()

    def _load_baseline(self):
        if BASELINE_FILE.exists():
            data = json.loads(BASELINE_FILE.read_text())
            return {self._baseline_key(f) for f in data.get("findings", [])}
        return set()

    def _baseline_key(self, f):
        return (str(f.get("path", "")), f.get("smell", ""), str(f.get("detail", "")))

    def _is_in_baseline(self, finding):
        return self._baseline_key(finding) in self.baseline

    def _load_history(self):
        if HISTORY_FILE.exists():
            return json.loads(HISTORY_FILE.read_text())
        return []

    def _save_history(self, current_stats):
        minimal_findings = [{"path": f["path"], "smell": f["smell"], "func_name": f.get("func_name", "")} for f in self.findings]
        self.history.append({
            "timestamp": datetime.datetime.now().isoformat(),
            "stats": current_stats,
            "findings": minimal_findings
        })
        HISTORY_FILE.write_text(json.dumps(self.history[-10:], indent=4))

    def _load_resolved(self):
        if RESOLVED_FILE.exists():
            return json.loads(RESOLVED_FILE.read_text())
        return {"files": [], "functions": []}

    def _save_baseline(self):
        BASELINE_FILE.write_text(json.dumps({
            "timestamp": datetime.datetime.now().isoformat(),
            "findings": [{"path": f["path"], "smell": f["smell"], "detail": f.get("detail", ""), "line_num": f.get("line_num")} for f in self.findings]
        }, indent=4))

    def _detect_shotgun_surgery(self):
        try:
            cwd = Path.cwd()
            result = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, cwd=cwd)
            if result.returncode != 0:
                return
            repo_root = Path(result.stdout.strip())
            log_result = subprocess.run(["git", "log", "-100", "--name-only", "--pretty=format:"], capture_output=True, text=True, cwd=repo_root)
            if log_result.returncode != 0:
                return
            src_rel = str(self.root_path).replace("\\", "/")
            cochanges = defaultdict(lambda: defaultdict(int))
            current_batch = []
            for line in log_result.stdout.splitlines():
                if not line.strip():
                    if len(current_batch) >= 2:
                        for i, a in enumerate(current_batch):
                            for b in current_batch[i + 1:]:
                                if a != b:
                                    cochanges[a][b] += 1
                                    cochanges[b][a] += 1
                    current_batch = []
                elif line.endswith((".js", ".ts", ".jsx", ".tsx")):
                    norm = line.replace("\\", "/")
                    if norm.startswith(src_rel + "/") or norm == src_rel:
                        rel = norm[len(src_rel):].lstrip("/")
                        if rel and rel not in current_batch:
                            current_batch.append(rel)
            for f1, partners in cochanges.items():
                for f2, count in partners.items():
                    if count >= 5:
                        self._add_finding("Shotgun Surgery", f1, f"Changes frequently require changes to {f2} ({count} co-commits).")
                        break
        except (subprocess.SubprocessError, OSError):
            pass

    def _detect_cross_file_data_clumps(self):
        for sig, data in self.signatures.items():
            if data["count"] > THRESHOLDS["CROSS_FILE_DATA_CLUMP"] and len(data["files"]) >= 2:
                params_str = ", ".join(sig)
                files_list = sorted(data["files"])
                fpath = files_list[0]
                detail = f"Param set ({params_str}) repeated in {len(data['files'])} files: {', '.join(files_list[:4])}{'...' if len(files_list) > 4 else ''}. Consider Introduce Parameter Object."
                self._add_finding("Data Clump", fpath, detail, severity=len(data["files"]))

    def _detect_switch_statement_overload(self):
        for sig, data in self.switch_signatures.items():
            if data["count"] >= THRESHOLDS["SWITCH_OVERLOAD_COUNT"] and len(data["files"]) >= 2:
                files = sorted(data["files"])
                self._add_finding(
                    "Switch Statement Overload",
                    files[0],
                    f"Repeated type-based branching on '{sig}' appears {data['count']} times across {len(files)} files. Consider polymorphism/factory.",
                    severity=data["count"]
                )

    def _detect_divergent_change(self):
        for path, obs in self.file_smell_obstructions.items():
            if len(obs) >= THRESHOLDS["DIVERGENT_CHANGE_OBSTRUCTIONS"]:
                self._add_finding(
                    "Divergent Change",
                    path,
                    f"File accumulates smells across {len(obs)} obstruction categories ({', '.join(sorted(obs))}). Consider splitting responsibilities.",
                    severity=len(obs)
                )

    def _detect_parallel_inheritance_hierarchies(self):
        prefix_to_parents = defaultdict(set)
        prefix_to_files = defaultdict(set)
        for item in self.extended_classes:
            subclass = item["subclass"]
            parent = item["parent"]
            file_path = item["path"]
            parts = re.findall(r'[A-Z][a-z0-9]*', subclass)
            if len(parts) >= 2:
                prefix = parts[0]
                prefix_to_parents[prefix].add(parent)
                prefix_to_files[prefix].add(file_path)
        for prefix, parents in prefix_to_parents.items():
            if len(parents) >= 2:
                files = sorted(prefix_to_files[prefix])
                self._add_finding(
                    "Parallel Inheritance Hierarchies",
                    files[0],
                    f"Prefix '{prefix}' spans subclasses across multiple parent hierarchies ({', '.join(sorted(parents))}).",
                    severity=len(parents)
                )

    def _detect_inconsistent_vocabulary(self):
        for noun, data in self.vocab_usage.items():
            verbs = sorted(data["verbs"])
            if len(verbs) >= THRESHOLDS["VOCAB_VARIANT_MIN"] and len(data["files"]) >= 2:
                files = sorted(data["files"])
                self._add_finding(
                    "Inconsistent Vocabulary",
                    files[0],
                    f"Same domain noun '{noun}' uses multiple verbs ({', '.join(verbs)}). Standardize naming.",
                    severity=len(verbs)
                )

    def _detect_semantic_duplication(self):
        for signature, cluster in self.fragment_candidates.items():
            if len(cluster) >= THRESHOLDS["MIN_DUPLICATE_FRAGMENTS"]:
                paths = sorted([item['path'] for item in cluster])
                detail = f"Found {len(paths)} structurally identical small files: {', '.join(paths)}. Consider consolidation."
                self._add_finding(
                    "Semantic Duplication",
                    paths[0],
                    detail,
                    severity=len(paths),
                    cluster_data=cluster
                )

    def _resolution_key(self, f):
        return (str(f.get("path", "")), f.get("smell", ""), f.get("func_name", ""))

    def _check_resolutions(self):
        if not self.history:
            return
        last = self.history[-1]
        if "findings" not in last:
            return
        last_keys = {self._resolution_key(f) for f in last["findings"]}
        current_keys = {self._resolution_key(f) for f in self.findings}
        fixed = last_keys - current_keys
        if fixed:
            print(f"[OK] Resolved {len(fixed)} smells since last run!")
            resolved = self._load_resolved()
            hall = resolved.get("resolved", [])
            for key in fixed:
                hall.append({"path": key[0], "smell": key[1], "func_name": key[2], "resolved_at": datetime.datetime.now().isoformat()})
            resolved["resolved"] = hall[-50:]
            RESOLVED_FILE.write_text(json.dumps(resolved, indent=4))
            self.resolved = resolved

    def _get_grade(self, count):
        if count == 0: return "A+"
        if count <= 2: return "A"
        if count <= 5: return "B"
        if count <= 10: return "C"
        if count <= 20: return "D"
        return "F"

    def analyze(self):
        print("[*] Scanning Codebase...")
        for root, _, files in os.walk(self.root_path):
            for file in files:
                if file.endswith((".js", ".ts", ".jsx", ".tsx")):
                    self._scan_file(Path(root) / file)

        self._detect_shotgun_surgery()
        self._detect_cross_file_data_clumps()
        self._detect_switch_statement_overload()
        self._detect_divergent_change()
        self._detect_parallel_inheritance_hierarchies()
        self._detect_inconsistent_vocabulary()
        self._detect_semantic_duplication()

        if self.save_baseline:
            self._save_baseline()
            print(f"[OK] Baseline saved: {BASELINE_FILE}")
            return None, None

        self._check_resolutions()

        new_findings = [f for f in self.findings if not self._is_in_baseline(f)]
        baseline_findings = [f for f in self.findings if self._is_in_baseline(f)]
        return self._generate_report(new_findings, baseline_findings)

    def _scan_file(self, file_path):
        rel_path = file_path.relative_to(self.root_path)
        content = file_path.read_text(errors='ignore')
        lines = content.splitlines()
        loc = len(lines)
        rel_path_str = str(rel_path).replace("\\", "/")

        funcs = re.findall(r'(function\s+\w+|\w+\s*=\s*\(.*?\)\s*=>|\w+\s*\(.*?\)\s*\{)', content)
        if loc > THRESHOLDS["GOD_FILE_LOC"] or len(funcs) > THRESHOLDS["GOD_FILE_FUNCS"]:
            excess = max(0, loc - THRESHOLDS["GOD_FILE_LOC"])
            self._add_finding("God File", rel_path, f"Large file: {loc} lines, {len(funcs)} functions.", excess_loc=excess, severity=excess)
            cohesion_signals = {
                "database": len(re.findall(r'\b(db|sql|query|transaction|repository|supabase)\b', content, flags=re.IGNORECASE)),
                "ui": len(re.findall(r'\b(dom|document|element|render|modal|tooltip|classList)\b', content, flags=re.IGNORECASE)),
                "api": len(re.findall(r'\b(fetch|axios|http|api|endpoint|request|response)\b', content, flags=re.IGNORECASE)),
            }
            active_domains = [k for k, v in cohesion_signals.items() if v > 2]
            if len(active_domains) >= 2:
                self._add_finding("Low Cohesion", rel_path, f"Mixed domains in one file: {', '.join(active_domains)}. Consider Extract Module by domain.", severity=len(active_domains))

        if loc < THRESHOLDS["FRAGMENT_LOC"] and "index" not in str(rel_path).lower():
            if "export" in content or "function" in content:
                self._add_finding("Fragment", rel_path, f"Tiny file ({loc} lines). Possible 'Lazy Class'.")
                signature = self._get_structural_signature(content)
                self.fragment_candidates[signature].append({'path': rel_path_str, 'content': content})

        ops = re.findall(r'(?:function|const|let|get|set)\s+([a-zA-Z0-9]*(?:And|Or)[A-Z][a-zA-Z0-9]*)\s*[=|(]', content)
        for op in ops:
            self._add_finding("Binary Operator in Name", rel_path, f"Method '{op}' has multiple responsibilities.")

        max_n = 0
        for l in lines:
            max_n = max(max_n, (len(l) - len(l.lstrip())) // 4)
        if max_n >= THRESHOLDS["DEEP_NESTING"]:
            self._add_finding("Callback Hell", rel_path, f"Nesting depth: {max_n}.")

        loops = len(re.findall(r'\bfor\s*\(\s*(?:let|var|const)?\s*\w+\s*=\s*\d+', content))
        loops += len(re.findall(r'\bfor\s*\(\s*(?:let|var|const)?\s*\w+\s+of\s+', content))
        loops += len(re.findall(r'\bfor\s*\(\s*(?:let|var|const)?\s*\w+\s+in\s+', content))
        if loops > 2:
            self._add_finding("Imperative Loops", rel_path, f"{loops} manual loops found.")

        what_comment = re.compile(
            r'^\s*(?:const|let|var)\s+\w+\s*=\s*[^;]+;\s*//\s*(?:true|false|holds?|stores?|indicates?|whether|when)\s',
            re.IGNORECASE | re.MULTILINE
        )
        for m in what_comment.finditer(content):
            line_num = content[:m.start()].count('\n') + 1
            self._add_finding("What Comment", rel_path, f"Line {line_num}: Unnecessary state description.")

        checks = len(re.findall(r'(if|else if)\s*\(.*?(== null|!= null|== 200|== 0|success)\)', content))
        if checks > 5:
            self._add_finding("Afraid to Fail", rel_path, f"{checks} manual status checks found.", severity=checks)

        else_count = len(re.findall(r'\}\s*else\s*\{', content))
        if else_count > THRESHOLDS["MAX_ELSE_COUNT"]:
            self._add_finding("Else Obsession", rel_path, f"High 'else' usage ({else_count}). Prefer guard clauses.", severity=else_count)

        n_plus_one_hits = 0
        if re.search(r'(await\s+)?(?:fetch|axios\.\w+)\s*\(', content):
            n_plus_one_patterns = [
                r'(?:await\s+)?(?:fetch|axios\.\w+)\s*\([^\)]*\)[\s\S]{0,800}?for\s*\([^)]*\)\s*\{[\s\S]{0,800}?(?:await\s+)?(?:fetch|axios\.\w+)\s*\(',
                r'(?:await\s+)?(?:fetch|axios\.\w+)\s*\([^\)]*\)[\s\S]{0,800}?\.forEach\s*\(\s*(?:async\s*)?\w+\s*=>[\s\S]{0,400}?(?:await\s+)?(?:fetch|axios\.\w+)\s*\('
            ]
            for pattern in n_plus_one_patterns:
                n_plus_one_hits += len(re.findall(pattern, content))
        if n_plus_one_hits >= THRESHOLDS["N_PLUS_ONE_MIN"]:
            self._add_finding("N+1 Problem", rel_path, f"Detected primary request followed by per-item requests ({n_plus_one_hits} pattern(s)). Batch or eager-load.", severity=n_plus_one_hits)

        add_listener = len(re.findall(r'\b(?:window|document|[a-zA-Z_]\w*)\.addEventListener\s*\(', content))
        remove_listener = len(re.findall(r'\b(?:window|document|[a-zA-Z_]\w*)\.removeEventListener\s*\(', content))
        ws_open = len(re.findall(r'new\s+WebSocket\s*\(', content))
        ws_close = len(re.findall(r'\.\s*close\s*\(', content))
        sub_open = len(re.findall(r'\.\s*subscribe\s*\(', content))
        sub_close = len(re.findall(r'\.\s*unsubscribe\s*\(', content))
        leak_score = max(0, add_listener - remove_listener) + max(0, ws_open - ws_close) + max(0, sub_open - sub_close)
        if leak_score > 0:
            self._add_finding("Memory Leaks", rel_path, f"Unbalanced resource lifecycle detected (score: {leak_score}). Add teardown/unsubscribe cleanup.", severity=leak_score)

        unbounded_hits = 0
        unbounded_hits += len(re.findall(r'Promise\.all\s*\(\s*[a-zA-Z_]\w*\.map\s*\(', content))
        unbounded_hits += len(re.findall(r'Promise\.allSettled\s*\(\s*[a-zA-Z_]\w*\.map\s*\(', content))
        if unbounded_hits >= THRESHOLDS["UNBOUNDED_CONCURRENCY_MIN"]:
            self._add_finding("Unbounded Concurrency", rel_path, f"Detected Promise.all over mapped collection ({unbounded_hits} pattern(s)) without explicit limit.", severity=unbounded_hits)

        for m in re.finditer(r'\bswitch\s*\(', content):
            start = m.end()
            depth = 1
            pos = content.find('{', start)
            if pos == -1:
                continue
            pos += 1
            while pos < len(content) and depth > 0:
                if content[pos] == '{':
                    depth += 1
                elif content[pos] == '}':
                    depth -= 1
                pos += 1
            switch_body = content[m.start():pos]
            case_count = len(re.findall(r'\bcase\b', switch_body))
            discriminator_match = re.search(r'\bswitch\s*\(([^)]+)\)', content[m.start():pos])
            if discriminator_match:
                discriminator = re.sub(r'\s+', ' ', discriminator_match.group(1).strip())
                self.switch_signatures[discriminator]["count"] += 1
                self.switch_signatures[discriminator]["files"].add(str(rel_path))
            if case_count > THRESHOLDS["MAX_SWITCH_CASES"]:
                self._add_finding("Switch Statements", rel_path, f"Complex switch found with {case_count} cases. Consider Polymorphism.", severity=case_count)
                break

        debug_elements = re.findall(r'(console\.log|debugger|alert\(|console\.error)', content)
        if debug_elements:
            self._add_finding("Dead Code", rel_path, f"Found {len(debug_elements)} debug statements.", severity=len(debug_elements))

        commented_code = re.findall(r'(?m)^\s*//\s*(?:if|for|while|const|let|var|function)\s', content)
        if len(commented_code) > 2:
            self._add_finding("Dead Code", rel_path, "Potential commented-out logic detected.", severity=len(commented_code))

        bool_param_matches = re.findall(r'(?:function\s+\w+|const\s+\w+\s*=\s*)\s*\(([^)]*(?:is|has|should|can)[A-Z][^)]*)\)', content)
        for match in bool_param_matches:
            flag_count = len(re.findall(r'(?:is|has|should|can)[A-Z]\w*', match))
            if flag_count >= 1:
                self._add_finding("Swiss Army Knife", rel_path, f"Function behavior controlled by {flag_count} flag argument(s). Consider explicit methods.", severity=flag_count)
                break

        params_match = re.findall(r'(?:function\s+\w+|const\s+\w+\s*=\s*)\(([^)]*)\)', content)
        for param_str in params_match:
            params = [p.strip() for p in param_str.split(',') if p.strip()]
            param_count = len(params)
            if param_count > THRESHOLDS["MAX_PARAMS"]:
                self._add_finding("Long Parameter List", rel_path, f"Function has {param_count} parameters.", severity=param_count)
            if param_count >= 3:
                cleaned = tuple(sorted([p.split('=')[0].split(':')[0].strip().replace('...', '') for p in params]))
                if len(cleaned) >= 3:
                    self.signatures[cleaned]["count"] += 1
                    self.signatures[cleaned]["files"].add(str(rel_path))

        for fn in re.finditer(r'(?:function\s+(\w+)\s*\(([^)]*)\)\s*\{|(?:const|let|var)\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>\s*\{)', content):
            params_raw = fn.group(2) if fn.group(2) is not None else fn.group(4)
            params = [p.strip().split('=')[0].split(':')[0].strip().replace('...', '') for p in (params_raw or "").split(',') if p.strip()]
            if not params:
                continue
            body_start = fn.end()
            depth = 1
            body_end = -1
            for i in range(body_start, len(content)):
                if content[i] == '{':
                    depth += 1
                elif content[i] == '}':
                    depth -= 1
                if depth == 0:
                    body_end = i
                    break
            if body_end == -1:
                continue
            body = content[body_start:body_end]
            mutated = 0
            for p in params:
                if not p:
                    continue
                if re.search(r'\b' + re.escape(p) + r'\s*\.\s*\w+\s*=', body):
                    mutated += 1
                elif re.search(r'\b' + re.escape(p) + r'\s*\[\s*[^]]+\s*\]\s*=', body):
                    mutated += 1
                elif re.search(r'\b' + re.escape(p) + r'\s*\.\s*(push|pop|splice|sort|reverse|shift|unshift)\s*\(', body):
                    mutated += 1
            if mutated > 0:
                self._add_finding("Mutant Arguments", rel_path, f"Function mutates {mutated} incoming argument(s). Prefer immutable returns.", severity=mutated)
                break

            if len(params) >= THRESHOLDS["PARAM_DRILLING_MIN_PARAMS"]:
                forward_pattern = r'\b\w+\s*\(\s*' + r'\s*,\s*'.join([re.escape(p) for p in params]) + r'\s*\)'
                if re.search(forward_pattern, body):
                    self._add_finding("Parameter Drilling", rel_path, f"Function forwards {len(params)} parameters down-call unchanged.", severity=len(params))
                    break

        primitive_obsession_hits = 0
        primitive_patterns = [
            r'\b(?:const|let|var)\s+\w*(?:Phone|Email|Price|Amount|Date|Time|Status|Code|Id)\w*\s*=\s*["\'][^"\']+["\']',
            r'\b(?:const|let|var)\s+\w*(?:User|Address|Range|Period)\w*\s*=\s*\[[^\]]+\]',
            r'\b(?:const|let|var)\s+\w*(?:Config|Meta|Options)\w*\s*=\s*\{[^}]*\}',
        ]
        for pattern in primitive_patterns:
            primitive_obsession_hits += len(re.findall(pattern, content))
        if primitive_obsession_hits >= 3:
            self._add_finding("Primitive Obsession", rel_path, f"Detected {primitive_obsession_hits} domain concepts represented as primitives.", severity=primitive_obsession_hits)

        ghost_state_hits = 0
        for m in re.finditer(r'\b(?:const|let|var)\s+([a-zA-Z_]\w*)\s*=\s*([a-zA-Z_]\w*)\.(\w+)\b', content):
            derived_var = m.group(1)
            source_obj = m.group(2)
            source_prop = m.group(3)
            source_updated = re.search(r'\b' + re.escape(source_obj) + r'\.(?:' + re.escape(source_prop) + r')\s*=', content[m.end():]) is not None
            derived_updated = re.search(r'\b' + re.escape(derived_var) + r'\s*=', content[m.end():]) is not None
            if source_updated or derived_updated:
                ghost_state_hits += 1
        if ghost_state_hits > 0:
            self._add_finding("Ghost State", rel_path, f"Detected duplicated/derived state at risk of staleness ({ghost_state_hits} pattern(s)).", severity=ghost_state_hits)

        content_no_comments = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
        content_no_comments = re.sub(r'//.*$', '', content_no_comments, flags=re.MULTILINE)
        content_no_strings = re.sub(r'["\'`].*?["\'`]', '', content_no_comments)
        magic_numbers = re.findall(r'(?<![\w.])\b([2-9]|\d{2,})\b', content_no_strings)
        if len(magic_numbers) > THRESHOLDS["MAGIC_NUMBERS"]:
            self._add_finding("Magic Numbers", rel_path, f"Found {len(magic_numbers)} unnamed numerical constants.", severity=len(magic_numbers))

        var_decls = re.findall(r'(?:const|let|var)\s+([a-z]+[A-Z][a-zA-Z0-9]*)\s*[=:]', content)
        prefix_counts = defaultdict(int)
        for name in var_decls:
            match = re.match(r'^([a-z]+)[A-Z]', name)
            if match:
                prefix = match.group(1).lower()
                if prefix not in ("get", "set", "is", "has", "on", "to"):
                    prefix_counts[prefix] += 1
        for prefix, count in prefix_counts.items():
            if count >= THRESHOLDS["DATA_CLUMP_PREFIX_COUNT"]:
                self._add_finding("Data Clump", rel_path, f"Variables share prefix '{prefix}' ({count} declarations). Consider extracting a class.", severity=count)
                break

        chain_match = re.findall(r'(\.\w+\(\)){3,}', content)
        for _ in chain_match:
            self._add_finding("Message Chains", rel_path, "Method chain of 3+ calls (a.getB().getC().getD()). Consider Hide Delegate.")
            break

        null_chain_pattern = re.compile(r'\b\w+(?:\s*&&\s*\w+\.\w+){' + str(THRESHOLDS["NULL_CHECK_CHAIN_MIN"] - 1) + r',}')
        null_chain_hits = len(null_chain_pattern.findall(content))
        if null_chain_hits > 0:
            self._add_finding("Null-Check Hell", rel_path, f"Found {null_chain_hits} repetitive null-check chain(s). Use optional chaining or Null Object.", severity=null_chain_hits)

        sequential_await_hits = len(re.findall(r'for\s*\([^)]*\)\s*\{[\s\S]{0,600}?await\s+', content))
        sequential_await_hits += len(re.findall(r'for\s+\w+\s+of\s+[^{]+\{[\s\S]{0,600}?await\s+', content))
        if sequential_await_hits >= THRESHOLDS["SEQUENTIAL_AWAIT_MIN"]:
            self._add_finding("Sequential Async", rel_path, f"Detected await-inside-loop patterns ({sequential_await_hits}). Consider Promise.all when ordering is not required.", severity=sequential_await_hits)

        privacy_access_hits = len(re.findall(r'\b\w+\._\w+', content))
        if privacy_access_hits >= 3:
            self._add_finding("Inappropriate Intimacy", rel_path, f"Detected {privacy_access_hits} direct accesses to peer private/internal fields.", severity=privacy_access_hits)

        global_insecurity_hits = 0
        global_insecurity_hits += len(re.findall(r'^\s*export\s+let\s+\w+', content, flags=re.MULTILINE))
        global_insecurity_hits += len(re.findall(r'^\s*let\s+\w+\s*=\s*new\s+\w+', content, flags=re.MULTILINE))
        if global_insecurity_hits > 0:
            self._add_finding("Global Insecurity", rel_path, f"Detected mutable exported/global state patterns ({global_insecurity_hits}). Prefer DI/encapsulation.", severity=global_insecurity_hits)

        vague_names = re.findall(r'\b(?:class|function)\s+([A-Za-z_]\w*(?:Manager|Helper|Utils|Common))\b', content)
        if vague_names:
            unique_names = sorted(set(vague_names))
            self._add_finding("Vague Name", rel_path, f"Vague type/function naming detected: {', '.join(unique_names[:4])}.", severity=len(unique_names))

        bool_negation_hits = len(re.findall(r'\b(?:isNot|hasNo|cannot|isDisabled|not[A-Z])\w*\b', content))
        bool_negation_hits += len(re.findall(r'!\s*isNot[A-Z]\w*', content))
        if bool_negation_hits > 0:
            self._add_finding("Boolean Negation", rel_path, f"Negative boolean naming/double negation patterns detected ({bool_negation_hits}).", severity=bool_negation_hits)

        function_names = re.findall(r'\b(?:function\s+([a-zA-Z_]\w*)|(?:const|let|var)\s+([a-zA-Z_]\w*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)', content)
        for pair in function_names:
            fname = pair[0] or pair[1]
            m = re.match(r'^(get|fetch|retrieve|load|find|read)([A-Z]\w+)$', fname)
            if not m:
                continue
            verb = m.group(1).lower()
            noun = m.group(2)
            self.vocab_usage[noun]["verbs"].add(verb)
            self.vocab_usage[noun]["files"].add(str(rel_path))

        is_ui_file = any(seg in rel_path_str for seg in ("components/", "app/", "views/"))
        is_service_file = any(seg in rel_path_str for seg in ("services/", "api/"))
        is_core_file = any(seg in rel_path_str for seg in ("core/", "domain/"))
        layer_violation_hits = 0
        if is_ui_file and re.search(r'\b(sql|query|repository|supabase|firebase|mongoose)\b', content, flags=re.IGNORECASE):
            layer_violation_hits += 1
        if is_service_file and re.search(r'\b(document|window|HTMLElement|classList|querySelector)\b', content):
            layer_violation_hits += 1
        if layer_violation_hits > 0:
            self._add_finding("Layer Violation", rel_path, f"Layer boundary crossing detected (score: {layer_violation_hits}).", severity=layer_violation_hits)

        vendor_hits = 0
        if is_core_file:
            vendor_hits += len(re.findall(r'^\s*import\s+.*\bfrom\s+[\'"](firebase|stripe|supabase|aws-sdk|@azure|openai)[^\'"]*[\'"]', content, flags=re.MULTILINE))
            vendor_hits += len(re.findall(r'require\(\s*[\'"](firebase|stripe|supabase|aws-sdk|@azure|openai)[^\'"]*[\'"]\s*\)', content))
        if vendor_hits >= THRESHOLDS["VENDOR_IMPORTS_MIN"]:
            self._add_finding("Vendor Lock-in", rel_path, f"Core/domain logic directly depends on vendor SDK imports ({vendor_hits}).", severity=vendor_hits)

        class_decls = re.finditer(r'class\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{', content)
        for c in class_decls:
            subclass = c.group(1)
            parent = c.group(2)
            if parent:
                self.extended_classes.append({"subclass": subclass, "parent": parent, "path": str(rel_path)})
            cls_start = c.end()
            depth = 1
            cls_end = -1
            for i in range(cls_start, len(content)):
                if content[i] == '{':
                    depth += 1
                elif content[i] == '}':
                    depth -= 1
                if depth == 0:
                    cls_end = i
                    break
            if cls_end == -1:
                continue
            cls_body = content[cls_start:cls_end]
            if parent and re.search(r'throw\s+new\s+Error\s*\(\s*["\'](?:not implemented|unsupported|must implement)', cls_body, flags=re.IGNORECASE):
                self._add_finding("Refused Bequest", rel_path, f"Subclass '{subclass}' overrides inherited behavior with not-implemented errors.", severity=1)
            temp_fields = re.findall(r'this\.(\w+)\s*=\s*(?:null|undefined)', cls_body)
            if len(temp_fields) >= THRESHOLDS["TEMP_FIELD_MIN"]:
                self._add_finding("Temporary Field", rel_path, f"Class '{subclass}' initializes {len(temp_fields)} temporary fields as null/undefined.", severity=len(temp_fields))
            method_sigs = re.findall(r'^\s*(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*\{', cls_body, flags=re.MULTILINE)
            if len(method_sigs) <= 1 and len(re.findall(r'this\.\w+\s*=', cls_body)) >= 3:
                self._add_finding("Lazy/Data Class", rel_path, f"Class '{subclass}' mostly stores data with little behavior.", severity=1)
            delegate_methods = re.findall(r'^\s*(?:async\s+)?\w+\s*\([^)]*\)\s*\{\s*(?:return\s+)?this\.\w+\.\w+\([^)]*\);\s*\}', cls_body, flags=re.MULTILINE)
            if len(delegate_methods) >= THRESHOLDS["MIDDLE_MAN_METHODS"]:
                self._add_finding("Middle Man", rel_path, f"Class '{subclass}' contains {len(delegate_methods)} pure delegating methods.", severity=len(delegate_methods))
            if is_core_file and len(method_sigs) <= 1 and len(re.findall(r'this\.\w+\s*=', cls_body)) >= 3:
                self._add_finding("Anemic Domain Model", rel_path, f"Class '{subclass}' stores state but has minimal behavior.", severity=1)

        speculative_generality_hits = 0
        for fn in re.finditer(r'(?:function\s+(\w+)\s*\(([^)]*)\)\s*\{|(?:const|let|var)\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>\s*\{)', content):
            fn_name = fn.group(1) or fn.group(3) or "[anonymous]"
            params_raw = fn.group(2) if fn.group(2) is not None else fn.group(4)
            params = [p.strip().split('=')[0].strip() for p in (params_raw or "").split(',') if p.strip()]
            body_start = fn.end()
            depth = 1
            body_end = -1
            for i in range(body_start, len(content)):
                if content[i] == '{':
                    depth += 1
                elif content[i] == '}':
                    depth -= 1
                if depth == 0:
                    body_end = i
                    break
            if body_end == -1:
                continue
            body = content[body_start:body_end]
            unused = [p for p in params if p and not re.search(r'\b' + re.escape(p) + r'\b', body)]
            if len(unused) >= THRESHOLDS["SPECULATIVE_UNUSED_PARAMS"]:
                speculative_generality_hits += 1
                self._add_finding("Speculative Generality", rel_path, f"Function '{fn_name}' has unused parameters ({', '.join(unused[:4])}).", severity=len(unused))
                break

        foreign_access = re.findall(r'\b([a-zA-Z_]\w*)\.\w+\b', content)
        foreign_counts = defaultdict(int)
        for ident in foreign_access:
            if ident not in ("this", "console", "window", "document", "Math", "JSON"):
                foreign_counts[ident] += 1
        if foreign_counts:
            target, count = max(foreign_counts.items(), key=lambda kv: kv[1])
            if count >= THRESHOLDS["FEATURE_ENVY_CALLS"]:
                self._add_finding("Feature Envy", rel_path, f"Methods heavily interact with '{target}' ({count} member accesses). Consider Move Method.", severity=count)

        func_pattern = re.compile(
            r'(?:function\s+\w+\s*\([^)]*\)\s*\{'
            r'|^\s*\w+\s*:\s*function\s*\([^)]*\)\s*\{'
            r'|(?:const|let|var)\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*\{'
            r'|(?:const|let|var)\s+(\w+)\s*=\s*async\s*\([^)]*\)\s*=>\s*\{'
            r'|async\s+function\s+(\w+)\s*\([^)]*\)\s*\{'
            r'|function\s+(\w+)\s*\([^)]*\)\s*\{)',
            re.MULTILINE
        )
        for match in func_pattern.finditer(content):
            func_name = "[anonymous]"
            for g in match.groups():
                if g and g.strip():
                    func_name = g.strip()
                    break
            if func_name == "[anonymous]":
                func_header = match.group(0)
                if ": function" in func_header:
                    func_name = re.search(r'(\w+)\s*:\s*function', func_header)
                    func_name = func_name.group(1) if func_name else "[anonymous]"
                else:
                    func_name = re.sub(r'\(.*', '', func_header.split('=')[0] if '=' in func_header else func_header)
                    func_name = re.sub(r'^(function|async|const|let|var)\s+', '', func_name).strip() or "[anonymous]"
            start_pos = match.end()
            open_braces = 1
            end_pos = -1
            for i in range(start_pos, len(content)):
                if content[i] == '{':
                    open_braces += 1
                elif content[i] == '}':
                    open_braces -= 1
                if open_braces == 0:
                    end_pos = i
                    break
            if end_pos != -1:
                function_body = content[start_pos:end_pos]
                line_count = function_body.count('\n') + 1
                line_num = content[:match.start()].count('\n') + 1
                full_func_code = content[match.start():end_pos + 1]
                complexity_keywords = ['if ', 'else if', ' for ', ' while ', ' case ', ' catch ', ' ? ', ' && ', ' || ']
                complexity = 1
                body_no_strings = re.sub(r'["\'`].*?["\'`]', '', function_body)
                body_no_strings = re.sub(r'/\*.*?\*/', '', body_no_strings, flags=re.DOTALL)
                body_no_strings = re.sub(r'//.*$', '', body_no_strings, flags=re.MULTILINE)
                for keyword in complexity_keywords:
                    complexity += body_no_strings.count(keyword)
                cognitive = 0
                nesting_level = 0
                for line in body_no_strings.splitlines():
                    stripped = line.strip()
                    if not stripped:
                        continue
                    closes = stripped.count("}")
                    if closes:
                        nesting_level = max(0, nesting_level - closes)
                    if re.search(r'\b(if|else if|for|while|switch|catch)\b', stripped):
                        cognitive += 1 + nesting_level
                    if "?" in stripped and ":" in stripped:
                        cognitive += 1 + nesting_level
                    opens = stripped.count("{")
                    if opens:
                        nesting_level += opens
                if line_count > THRESHOLDS["LONG_METHOD"]:
                    self._add_finding(
                        "Long Method",
                        rel_path,
                        f"Function '{func_name}' is too long ({line_count} lines).",
                        line_num=line_num,
                        severity=line_count - THRESHOLDS["LONG_METHOD"],
                        func_name=func_name,
                        code=full_func_code,
                        line_count=line_count
                    )
                if complexity > THRESHOLDS["COMPLEXITY"]:
                    self._add_finding(
                        "High Complexity",
                        rel_path,
                        f"Function '{func_name}' has high complexity (score: {complexity}).",
                        line_num=line_num,
                        severity=complexity,
                        func_name=func_name,
                        code=full_func_code,
                        complexity=complexity
                    )
                if cognitive > THRESHOLDS["COGNITIVE_COMPLEXITY"]:
                    self._add_finding(
                        "Cognitive Complexity",
                        rel_path,
                        f"Function '{func_name}' has high cognitive complexity (score: {cognitive}).",
                        line_num=line_num,
                        severity=cognitive,
                        func_name=func_name,
                        code=full_func_code,
                        complexity=cognitive
                    )
                if line_count > THRESHOLDS["LONG_METHOD"] and max_n >= THRESHOLDS["DEEP_NESTING"]:
                    self._add_finding(
                        "Long Method",
                        rel_path,
                        f"Function '{func_name}' combines long length ({line_count}) with deep nesting ({max_n}).",
                        line_num=line_num,
                        severity=line_count + max_n,
                        func_name=func_name,
                        code=full_func_code,
                        line_count=line_count
                    )

    def _add_finding(self, smell, path, detail, excess_loc=None, line_num=None, severity=None, func_name=None, code=None, line_count=None, complexity=None, cluster_data=None):
        tax = TAXONOMY.get(smell, {"Obstruction": "Dispensable", "Effort": "Medium", "Risk": "Low"})
        rec = {"smell": smell, "path": str(path), "detail": detail, "tax": tax}
        if excess_loc is not None:
            rec["excess_loc"] = excess_loc
        if line_num is not None:
            rec["line_num"] = line_num
        if severity is not None:
            rec["severity"] = severity
        if func_name is not None:
            rec["func_name"] = func_name
        if code is not None:
            rec["code"] = code
        if line_count is not None:
            rec["line_count"] = line_count
        if complexity is not None:
            rec["complexity"] = complexity
        if cluster_data is not None:
            rec["cluster_data"] = cluster_data
        self.findings.append(rec)
        if "Obstruction" in tax:
            self.file_smell_obstructions[str(path)].add(tax["Obstruction"])

    def _get_priority_findings(self, findings, limit=5):
        priority_smells = {"God File", "Long Method", "High Complexity"}
        with_severity = [f for f in findings if f.get("smell") in priority_smells and f.get("severity") is not None]
        return sorted(with_severity, key=lambda x: x["severity"], reverse=True)[:limit]

    def _get_llm_prompt_findings(self, findings, per_type=3):
        priority_files = {f["path"] for f in self._get_priority_findings(findings, 10)}
        long_method = [f for f in findings if f.get("smell") == "Long Method" and f.get("code")]
        high_complexity = [f for f in findings if f.get("smell") == "High Complexity" and f.get("code")]

        def score(f):
            base = f.get("severity", 0)
            return (base * 2 if f["path"] in priority_files else base, base)

        lm = sorted(long_method, key=score, reverse=True)[:per_type]
        hc = sorted(high_complexity, key=score, reverse=True)[:per_type]
        seen = set()
        resolved_funcs = set(tuple(x) for x in self.resolved.get("functions", []))
        for f in lm + hc:
            key = (f["path"], f.get("func_name"))
            if key in seen or key in resolved_funcs:
                continue
            seen.add(key)
            yield f

    def _get_god_file_prompt_findings(self, findings, limit=2):
        god_files = [f for f in findings if f.get("smell") == "God File" and f.get("excess_loc", 0) > 400]
        return sorted(god_files, key=lambda x: x.get("excess_loc", 0), reverse=True)[:limit]

    def _build_god_file_prompt(self, finding):
        path = finding["path"].replace("\\", "/")
        detail = finding.get("detail", "")
        refactoring = REFACTORING_CATALOG.get("God File", [])[0]
        return f"""You are an expert software engineer specializing in code refactoring. Your task is to reduce a God File by extracting cohesive subsystems into new modules.

Code Smell Analysis:
- Smell Type: God File
- File Path: {path}
- Problem: {detail}
- Recommended Refactoring: "{refactoring}"

Your Task:
1. Read the file {path} and identify 2-4 cohesive subsystems (groups of related functions).
2. For each subsystem, propose a new module path (e.g. core/engine/engineTickHandler.js) and list the functions to move.
3. Provide a concrete extraction plan: which functions move where, what exports are needed, and how call sites should be updated.
4. Preserve the public API; internal callers can be updated to use the new imports.

Do not generate full code. Provide a structured extraction plan that a developer can execute step-by-step.
"""

    def _build_fragment_consolidation_prompt(self, finding):
        prompt = """You are a Senior Software Architect specializing in code consolidation and DRY (Don't Repeat Yourself) principles.

Current Situation:
I have recently refactored several "God Files" by extracting logic into smaller modules. This has resulted in a new anti-pattern: an explosion of "Fragment" files (tiny modules with 1-2 functions) that appear to contain identical or semantically equivalent logic, just with different variable names or formatting.

Your Input:
I will provide a list of file paths and their contents below.

Your Task:
Analyze these files and perform a Semantic Duplication Analysis. You must:
1.  **Identify Clusters:** Group files that perform the exact same logic or highly similar logic (e.g., formatting a number, clamping a value, checking a DOM element).
    *   Note: Ignore minor differences in variable naming or whitespace. Focus on the algorithmic logic.
2.  **Propose Consolidation:** For each cluster, propose a Shared Utility or Service class where this logic belongs.
    *   If the logic is generic (e.g., math), suggest a utils/ file.
    *   If the logic is domain-specific (e.g., reactor heat calc), suggest a core/ file.
3.  **Refactoring Plan:**
    *   Create the code for the new consolidated module.
    *   List the original "Fragment" files that should be deleted.
    *   Show how to update the imports in the consuming code.

Output Format:
**Group: [Name of Functionality]**
Detected Duplicates:
- `path/to/fragmentA.js`
- `path/to/fragmentB.js`

**Proposed Solution:**
Create/Update: `path/to/new/shared/location.js`
```javascript
// The consolidated code
export function consolidatedName(...) { ... }
```

Action Items:
- Delete: fragmentA.js, fragmentB.js
- Update consumers to import consolidatedName from new/shared/location.js.

CODE TO ANALYZE:
"""
        code_blocks = []
        for item in finding.get("cluster_data", []):
            code_blocks.append(f"--- File: {item['path']} ---\n{item['content']}")
        return prompt + "\n\n" + "\n\n".join(code_blocks)

    def _extract_imports(self, content):
        lines = content.splitlines()
        imports = [l for l in lines[:50] if re.match(r'^\s*(?:import\s|require\s*\(|.*\s+from\s+)', l.strip())]
        return "\n".join(imports[:30]) if imports else ""

    def _get_import_context(self, rel_path):
        file_path = self.root_path / rel_path
        if not file_path.exists():
            return ""
        content = file_path.read_text(errors="ignore")
        return self._extract_imports(content)

    def _build_llm_prompt(self, finding):
        path = finding["path"].replace("\\", "/")
        func_name = finding.get("func_name", "[unknown]")
        refactoring = REFACTORING_CATALOG.get(finding["smell"], [])[0] if finding["smell"] in REFACTORING_CATALOG else "Extract Method"
        if finding["smell"] == "Long Method":
            line_count = finding.get("line_count", 0)
            problem = f"The function is {line_count} lines long, violating the {THRESHOLDS['LONG_METHOD']}-line threshold. It handles too many distinct responsibilities."
            goals = [
                "Identify distinct logical blocks within the function.",
                "Extract these blocks into new, well-named private helper functions within the same file/class structure.",
                "The body of the original function should become a clear, high-level sequence of calls to these new helper functions.",
                "Each extracted helper must stay under 40 lines.",
                "Crucially, you must not change the external behavior or the function signature. All existing functionality must be preserved.",
            ]
        else:
            complexity = finding.get("complexity", 0)
            problem = f"The function has cyclomatic complexity of {complexity}, exceeding the threshold of {THRESHOLDS['COMPLEXITY']}. It contains excessive branching and conditional logic."
            goals = [
                "Identify distinct conditional branches and decision points.",
                "Extract complex conditionals into well-named helper functions or use guard clauses.",
                "Consider replacing conditional logic with polymorphism where appropriate.",
                "Each extracted helper must have complexity under 10.",
                "Crucially, you must not change the external behavior or the function signature. All existing functionality must be preserved.",
            ]
        context_note = ""
        if "modal" in finding.get("code", "").lower() or "overlay" in finding.get("code", "").lower():
            context_note = "\nContext: This function may use DOM elements (modal, overlay, buttons) created by a parent. Preserve closure dependencies and pass them as parameters if extracting.\n"
        import_context = self._get_import_context(finding["path"])
        if import_context:
            context_note += f"\nContext - Existing Imports:\n{import_context}\n\nWhen extracting helpers, prefer these utilities over writing raw logic. Do not suggest libraries not already imported.\n"
        architecture_constraints = "\n".join([
            "Architecture Guardrails:",
            "- Core is blind; UI is an observer.",
            "- Core (`/src/core`) must never reference `ui`, `document`, or `window`; it updates `game.state` and emits events.",
            "- UI (`/src/components/ui`) observes state via `game.state.subscribe(...)` and listens for ephemeral events via `game.on(...)`.",
            "- Use `game.emit(...)`/`game.on(...)` for fire-and-forget events (audio/particles/domain triggers).",
            "- UI invokes action methods (for example, `game.sell_action()`), not direct core field mutations.",
            "- Prefer constructor injection for Store/EventEmitter; avoid `window.game` in class logic.",
        ])
        prompt = f"""You are an expert software engineer specializing in code refactoring. Your task is to apply a specific refactoring to the provided code snippet to resolve a documented code smell.

Code Smell Analysis:
- Smell Type: {finding["smell"]}
- File Path: {path}
- Function Name: {func_name}
- Problem: {problem}
- Recommended Refactoring: "{refactoring}"
{context_note}
{architecture_constraints}

Your Task:
Refactor the following code for the {func_name} function. Your goals are:
"""
        for g in goals:
            prompt += f"- {g}\n"
        prompt += f"""
Constraints: Do not add comments. Output only the refactored code.

Original Code to Refactor:

```javascript
{finding["code"]}
```

Provide the complete, refactored code for the {path} file, including the new helper functions and the modified {func_name} function.
"""
        return prompt

    def _generate_report(self, new_findings, baseline_findings):
        stats = {cat: 0 for cat in ["Bloater", "Dispensable", "Change Preventer", "Functional Abuser", "Coupler", "OO Abuser"]}
        for f in new_findings:
            obs = f.get("tax", {}).get("Obstruction")
            if obs in stats:
                stats[obs] += 1

        bloater_excess = sum(f.get("excess_loc", 0) for f in new_findings if f.get("tax", {}).get("Obstruction") == "Bloater" and f.get("smell") == "God File")
        stats["BloaterExcessLoc"] = bloater_excess

        total_new = len(new_findings)
        grade = self._get_grade(total_new)

        prev = self.history[-1]['stats'] if self.history else stats
        prev_5 = self.history[-5:] if self.history else []
        avg_5 = {cat: sum(h['stats'].get(cat, 0) for h in prev_5) / max(len(prev_5), 1) for cat in stats} if prev_5 else stats

        self._save_history(stats)

        md = "# 🔬 Research-Based Code Smell Analysis\n"
        md += f"Generated: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n"
        if baseline_findings:
            md += f"**Grade: {grade}** (based on {total_new} new smells). {len(baseline_findings)} technical debt smells excluded from grade.\n\n"
        else:
            md += f"**Grade: {grade}** ({total_new} smells)\n\n"

        md += "## 📊 Quality Progress Dashboard\n"
        md += "| Taxonomy Area | Current Grade | vs Last Run | vs 5-Run Avg |\n"
        md += "| :--- | :--- | :--- | :--- |\n"

        dashboard_cats = ["Bloater", "Dispensable", "Change Preventer", "OO Abuser", "Functional Abuser", "Coupler"]
        for cat in dashboard_cats:
            grade = self._get_grade(stats[cat])
            diff_last = stats[cat] - prev.get(cat, 0)
            diff_avg = stats[cat] - avg_5[cat]

            last_icon = "✅" if diff_last < 0 else "📈" if diff_last > 0 else "➖"
            avg_icon = "🔥" if diff_avg < 0 else "⚠️" if diff_avg > 0 else "➖"

            md += f"| **{cat}** | `{grade}` ({stats[cat]} smells) | {last_icon} {diff_last:+} | {avg_icon} {diff_avg:+.1f} |\n"

        diff_excess_last = stats["BloaterExcessLoc"] - prev.get("BloaterExcessLoc", stats["BloaterExcessLoc"])
        diff_excess_avg = stats["BloaterExcessLoc"] - avg_5.get("BloaterExcessLoc", stats["BloaterExcessLoc"])
        last_icon_excess = "✅" if diff_excess_last < 0 else "📈" if diff_excess_last > 0 else "➖"
        avg_icon_excess = "🔥" if diff_excess_avg < 0 else "⚠️" if diff_excess_avg > 0 else "➖"
        grade_excess = self._get_grade(min(20, stats["BloaterExcessLoc"] // 500))
        md += f"| **Bloater (excess LOC)** | `{grade_excess}` ({stats['BloaterExcessLoc']} loc) | {last_icon_excess} {diff_excess_last:+} | {avg_icon_excess} {diff_excess_avg:+.0f} |\n"

        md += "\n*Legend: Grading is inverse to smell count. ✅/🔥 means improvement (fewer smells). Excess LOC = sum of (file LOC − 300) for God files; refinement (extracting from large files) reduces it.*\n\n"
        md += "## 🧭 Architecture Guardrails\n\n"
        md += "These constraints define the target architecture and should be treated as review gates for every refactor.\n\n"

        md += "### 1) Philosophy: Core is Blind; UI is an Observer\n"
        for item in ARCHITECTURE_GUARDRAILS["philosophy"]:
            md += f"- {item}\n"
        md += "\n"

        md += "### 2) Global State via `store.js` (Persistent Data)\n"
        for item in ARCHITECTURE_GUARDRAILS["store_state"]:
            md += f"- {item}\n"
        md += "\n"

        md += "### 3) Event Bus (Ephemeral Actions)\n"
        for item in ARCHITECTURE_GUARDRAILS["event_bus"]:
            md += f"- {item}\n"
        md += "\n"

        md += "### 4) Command Pattern (UI -> Core)\n"
        for item in ARCHITECTURE_GUARDRAILS["command_pattern"]:
            md += f"- {item}\n"
        md += "\n"

        md += "### 5) Dependency Injection Requirement\n"
        for item in ARCHITECTURE_GUARDRAILS["dependency_injection"]:
            md += f"- {item}\n"
        md += "\n---\n\n"

        hall = self.resolved.get("resolved", [])[-10:]
        if hall:
            md += "## Hall of Fame (Recently Resolved)\n\n"
            md += "| File | Smell | Resolved |\n| :--- | :--- | :--- |\n"
            for r in reversed(hall):
                md += f"| `{r.get('path', '')}` | {r.get('smell', '')} | {r.get('resolved_at', '')[:10]} |\n"
            md += "\n---\n\n"

        priority = self._get_priority_findings(new_findings, 5)
        if priority:
            md += "---\n\n## 🎯 Priority Refactoring Targets (New Smells)\n\n"
            md += "These are the most severe new smells detected and should be addressed first.\n\n"
            md += "| Severity | Smell Type | File | Detail |\n| :--- | :--- | :--- | :--- |\n"
            for f in priority:
                md += f"| `Score: {f['severity']}` | {f['smell']} | `{f['path']}` | {f['detail']} |\n"
            md += "\n---\n\n"

        low_effort = [f for f in new_findings if f.get("tax", {}).get("Effort") in ("Low", "Very Low") or f.get("tax", {}).get("Obstruction") == "Dispensable"]
        low_effort.sort(key=lambda x: x.get("severity", 0), reverse=True)
        if low_effort:
            md += "## 🌱 Low Hanging Fruit (Easy Wins)\n\n"
            md += "Dispensables or low-effort fixes that can be resolved in minutes.\n\n"
            md += "| Smell Type | Effort | File | Detail |\n| :--- | :--- | :--- | :--- |\n"
            for f in low_effort[:15]:
                effort = f.get("tax", {}).get("Effort", "-")
                md += f"| {f['smell']} | {effort} | `{f['path']}` | {f['detail']} |\n"
            if len(low_effort) > 15:
                md += f"\n*...and {len(low_effort) - 15} more.*\n"
            md += "\n---\n\n"

        if baseline_findings:
            md += "## 📋 Technical Debt (Baseline)\n\n"
            md += f"{len(baseline_findings)} smells in baseline. These do not affect the grade but should be addressed over time.\n\n"
            md += "| Smell Type | File | Detail |\n| :--- | :--- | :--- |\n"
            for f in baseline_findings[:20]:
                md += f"| {f['smell']} | `{f['path']}` | {f['detail']} |\n"
            if len(baseline_findings) > 20:
                md += f"\n*...and {len(baseline_findings) - 20} more.*\n"
            md += "\n---\n\n"

        llm_findings = list(self._get_llm_prompt_findings(new_findings))
        god_file_findings = list(self._get_god_file_prompt_findings(new_findings))
        semantic_duplication_findings = [f for f in new_findings if f['smell'] == "Semantic Duplication"]

        if god_file_findings or llm_findings or semantic_duplication_findings:
            md += "## 🤖 LLM Refactoring Prompts\n\n"
            md += "Copy-paste these prompts into an LLM to get targeted refactoring suggestions.\n\n"
            prompt_idx = 1
            for f in god_file_findings:
                md += f"---\n\n### Prompt {prompt_idx}: God File — `{f['path']}`\n\n"
                md += "````\n" + self._build_god_file_prompt(f) + "\n````\n\n"
                prompt_idx += 1
            for f in llm_findings:
                md += f"---\n\n### Prompt {prompt_idx}: {f['smell']} — `{f.get('func_name', '?')}` in `{f['path']}`\n\n"
                md += "````\n" + self._build_llm_prompt(f) + "\n````\n\n"
                prompt_idx += 1
            for f in semantic_duplication_findings:
                cluster_size = len(f.get('cluster_data', []))
                md += f"---\n\n### Prompt {prompt_idx}: Semantic Duplication — Consolidate {cluster_size} Fragments\n\n"
                md += "````\n" + self._build_fragment_consolidation_prompt(f) + "\n````\n\n"
                prompt_idx += 1

        max_examples = THRESHOLDS["MAX_EXAMPLES_PER_SMELL"]
        obstruction_cats = ["Bloater", "Dispensable", "Change Preventer", "OO Abuser", "Functional Abuser", "Coupler"]
        for cat in obstruction_cats:
            cat_findings = [f for f in self.findings if f.get("tax", {}).get("Obstruction") == cat]
            if not cat_findings:
                continue

            md += f"## 🏗 Taxonomy: {cat}\n\n"
            smell_types = sorted(list({f['smell'] for f in cat_findings}))

            for stype in smell_types:
                stype_findings = [x for x in cat_findings if x['smell'] == stype]
                stype_findings.sort(key=lambda x: x.get("severity", 0), reverse=True)
                tax_info = TAXONOMY[stype]
                md += f"### ❗ {stype} ({len(stype_findings)} occurrences)\n"
                md += f"**Expanse:** {tax_info.get('Expanse', '-')} | **Occurrence:** {tax_info.get('Occurrence', '-')} | **Effort:** {tax_info.get('Effort', '-')}\n\n"
                md += "**Recommended Refactorings:**\n"
                for r in REFACTORING_CATALOG.get(stype, []):
                    md += f"- `{r}`\n"

                shown = stype_findings[:max_examples]
                remaining = len(stype_findings) - len(shown)
                md += "\n| File Path | Detection Detail |\n| :--- | :--- |\n"
                for f in shown:
                    md += f"| `{f['path']}` | {f['detail']} |\n"
                if remaining > 0:
                    md += f"\n*...and {remaining} more below threshold.*\n"
                md += "\n"

        REPORT_OUTPUT.write_text(md, encoding='utf-8')
        print(f"[OK] Report generated: {REPORT_OUTPUT}")
        return new_findings, baseline_findings

    def generate_github_summary(self, new_findings, baseline_findings):
        total_new = len(new_findings)
        grade = self._get_grade(total_new)
        lines = [
            "## Code Smell Analysis",
            "",
            f"**Grade: {grade}** | New smells: {total_new} | Technical debt: {len(baseline_findings)}",
            "",
            "### New Smells (Failing Grade)" if new_findings else "### No new smells",
        ]
        for f in new_findings[:10]:
            lines.append(f"- `{f['path']}`: {f['smell']} — {f['detail']}")
        if len(new_findings) > 10:
            lines.append(f"- *...and {len(new_findings) - 10} more*")
        return "\n".join(lines)

def _grade_order(g):
    return ["A+", "A", "B", "C", "D", "F"].index(g) if g in ["A+", "A", "B", "C", "D", "F"] else -1

if __name__ == "__main__":
    import sys
    save_baseline = "--save-baseline" in sys.argv
    fail_below = None
    for a in sys.argv:
        if a.startswith("--fail-below="):
            fail_below = a.split("=", 1)[1].strip().upper()
            break
    detector = AdvancedSmellDetector(PROJECT_ROOT, save_baseline=save_baseline)
    new_f, base_f = detector.analyze() or (None, None)
    if "--github-summary" in sys.argv and new_f is not None:
        summary = detector.generate_github_summary(new_f, base_f or [])
        summary_path = Path("github_step_summary.md")
        summary_path.write_text(summary, encoding="utf-8")
        print(f"[OK] GitHub summary: {summary_path}")
    if fail_below and new_f is not None:
        total_new = len(new_f)
        grade = detector._get_grade(total_new)
        if _grade_order(grade) > _grade_order(fail_below):
            print(f"[FAIL] Grade {grade} is below required {fail_below} ({total_new} new smells)")
            sys.exit(1)
        print(f"[OK] Grade {grade} meets or exceeds {fail_below}")
