import os
import re
import logging
import subprocess
import sys
from datetime import datetime

VALIDATION_LOG = "change_validation_log.md"

class ColorFormatter(logging.Formatter):
    GREY = "\x1b[38;21m"
    GREEN = "\x1b[32;21m"
    YELLOW = "\x1b[33;21m"
    RED = "\x1b[31;21m"
    BOLD_RED = "\x1b[31;1m"
    RESET = "\x1b[0m"
    FORMAT = "%(asctime)s - %(levelname)s - %(message)s"

    FORMATS = {
        logging.DEBUG: GREY + FORMAT + RESET,
        logging.INFO: GREEN + FORMAT + RESET,
        logging.WARNING: YELLOW + FORMAT + RESET,
        logging.ERROR: RED + FORMAT + RESET,
        logging.CRITICAL: BOLD_RED + FORMAT + RESET
    }

    def format(self, record):
        log_fmt = self.FORMATS.get(record.levelno)
        formatter = logging.Formatter(log_fmt)
        return formatter.format(record)

# Setup logger with ColorFormatter
logger = logging.getLogger("apply_diff")
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(ColorFormatter())
logger.addHandler(handler)

def check_file_duplicates(file_path, file_lines):
    # Check for identical multi-line blocks (3+ lines)
    min_lines = 3
    blocks = {}
    duplicates = []
    
    # Pre-clean lines to avoid trivial mismatches (indentation, etc)
    clean_lines = [l.strip() for l in file_lines]
    
    for i in range(len(clean_lines) - min_lines + 1):
        # Only check blocks with significant content (avoid 3 empty lines or single-char lines)
        block = tuple(clean_lines[i : i + min_lines])
        block_text = "".join(block)
        if len(block_text) < 30 or all(not l for l in block):
            continue
            
        if block in blocks:
            duplicates.append((blocks[block] + 1, i + 1, block))
        else:
            blocks[block] = i
            
    if duplicates:
        for first, second, block in duplicates[:5]: # Show first 5
            snippet = " | ".join(block)
            logger.warning(f"DUPLICATE BLOCK: Line {first} and {second} are identical for {min_lines} lines: {snippet[:100]}...")
        if len(duplicates) > 5:
            logger.warning(f"... and {len(duplicates)-5} more duplicates found in {file_path}")

def check_syntax(file_path):
    if not file_path.endswith('.js'):
        return True
    
    logger.info(f"Checking syntax for {file_path}...")
    try:
        # node --check validates syntax without executing
        result = subprocess.run(['node', '--check', file_path], capture_output=True, text=True)
        if result.returncode == 0:
            logger.info(f"Syntax check passed for {file_path}")
            return True
        else:
            logger.error(f"SYNTAX ERROR in {file_path}:\n{result.stderr}")
            return False
    except Exception as e:
        logger.error(f"Failed to run syntax check on {file_path}: {e}")
        return False

def run_linter(file_path):
    success = True
    lint_output = ""
    
    # 1. Check Syntax First for JS
    if file_path.endswith('.js'):
        if not check_syntax(file_path):
            success = False

    logger.info(f"Linting {file_path}...")
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        check_file_duplicates(file_path, lines)
        
        is_windows = sys.platform == "win32"
        npm_cmd = 'npm.cmd' if is_windows else 'npm'
        
        # Run JS linter if it's a JS file
        if file_path.endswith('.js'):
            logger.info(f"Running npm run lint:js for {file_path}...")
            result = subprocess.run([npm_cmd, 'run', 'lint:js'], capture_output=True, text=True)
            if result.returncode != 0:
                output = f"JS Linter reported issues:\n{result.stdout}\n{result.stderr}"
                logger.warning(output)
                lint_output += output
            else:
                logger.info("JS Linter passed.")
                lint_output += "JS Linter passed.\n"

        # Run CSS linter if it's a CSS file
        if file_path.endswith('.css'):
            logger.info(f"Running npm run lint:css for {file_path}...")
            result = subprocess.run([npm_cmd, 'run', 'lint:css'], capture_output=True, text=True)
            if result.returncode != 0:
                output = f"CSS Linter reported issues:\n{result.stdout}\n{result.stderr}"
                logger.warning(output)
                lint_output += output
            else:
                logger.info("CSS Linter passed.")
                lint_output += "CSS Linter passed.\n"

    except Exception as e:
        logger.error(f"Failed to run linter on {file_path}: {e}")
        success = False
    
    return success, lint_output

def clear_validation_log():
    try:
        if os.path.exists(VALIDATION_LOG):
            return # Don't clear, keep history
        with open(VALIDATION_LOG, 'w', encoding='utf-8') as f:
            f.write(f"# Change Validation Log - {datetime.now().strftime('%B %d, %Y')}\n\n")
            f.write("This log captures the context around the changes applied to the codebase.\n\n")
    except Exception as e:
        logger.error(f"Failed to clear validation log: {e}")

def log_change_context(change_id, change_title, change_description, file_path, start_idx, start_old, file_lines):
    try:
        # Calculate offset
        actual_line = start_idx + 1
        offset = actual_line - start_old
        offset_str = f" (Offset: {offset:+d})" if offset != 0 else " (Exact match)"

        # Capture context around the change
        # Adjust start and end to include ±5 lines
        start_context = max(0, start_idx - 5)
        end_context = min(len(file_lines), start_idx + 15) 

        with open(VALIDATION_LOG, 'a', encoding='utf-8') as f:
            f.write(f"## {change_id}. {change_title}\n")
            if change_description:
                f.write(f"{change_description}\n\n")
            f.write(f"**File:** `{file_path}` | **Line:** {actual_line}{offset_str}\n")
            f.write(f"**Mapping:** Expected Line {start_old} -> Found at {actual_line}\n")
            f.write(f"**Context:**\n")
            f.write("```javascript\n")
            for i in range(start_context, end_context):
                line_content = file_lines[i].rstrip('\n\r')
                prefix = "-> " if i == start_idx else "   "
                f.write(f"{prefix}{i+1:4d}: {line_content}\n")
            f.write("```\n\n")
    except Exception as e:
        logger.error(f"Failed to log change context: {e}")

def normalize(line):
    # Remove all whitespace, semicolons, and normalize common patterns
    line = re.sub(r'\s+', '', line.strip())
    line = re.sub(r';', '', line)
    # Normalize arrow functions: (x)=> to x=>
    line = re.sub(r'\((\w+)\)=>', r'\1=>', line)
    # Remove common wrappers that might be added or removed
    line = re.sub(r'toDecimal\(', '', line)
    line = re.sub(r'toNumber\(', '', line)
    line = re.sub(r'\)', '', line) # Note: this might remove too many parens but for fuzzy matching it's often okay
    # Remove quotes
    line = re.sub(r'["\']', '', line)
    return line.lower()

def parse_diff(diff_file_path):
    if not os.path.exists(diff_file_path):
        logger.error(f"Diff file not found: {diff_file_path}")
        return []

    with open(diff_file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    all_changes = []
    current_change = None
    current_diff = None
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        header_match = re.match(r'^#+\s+(?:(\d+)\.)?\s*(.*)', line)
        if header_match:
            change_id = header_match.group(1) or "0"
            change_title = header_match.group(2).strip()
            current_change = {
                'id': change_id,
                'title': change_title,
                'description': '',
                'diffs': [],
                'status': 'Pending'
            }
            all_changes.append(current_change)
            i += 1
            # Capture description lines until we hit a diff header, code block or another ###
            desc_lines = []
            while i < len(lines) and not re.match(r'^#+\s+', lines[i]) and not lines[i].startswith('--- ') and not lines[i].startswith('```diff'):
                l = lines[i].strip()
                if l and not l.startswith('```'):
                    desc_lines.append(l)
                i += 1
            current_change['description'] = ' '.join(desc_lines)
            continue

        file_match = re.match(r'^--- (?:a/)?(.*?)\s*$', line)
        if not file_match:
            # Fallback for common AI format: **File:** `path` or **File:** path
            file_match = re.match(r'^\*\*File:?\*\*\s*[`\'"]?(.*?)[`\'"]?\s*(\*\*)?$', line)
        if not file_match:
            # Fallback for common AI format: File: `path` or File: path
            file_match = re.match(r'^File:\s*[`\'"]?(.*?)[`\'"]?\s*$', line)
            
        if file_match:
            file_path = file_match.group(1).strip()
            # Clean up trailing backticks if they were captured
            file_path = re.sub(r'[`\'"]+$', '', file_path)
            current_diff = {'path': file_path, 'hunks': []}
            if current_change is not None:
                current_change['diffs'].append(current_diff)
            i += 1
            # Skip +++ line if present
            if i < len(lines) and re.match(r'^\+\+\+ (?:b/)?', lines[i]):
                i += 1
            continue
        
        if current_diff and line.startswith('@@'):
            match = re.match(r'@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@', line)
            if match:
                start_old = int(match.group(1))
                hunk = {
                    'start_old': start_old,
                    'lines': []
                }
                i += 1
                while i < len(lines) and (lines[i].startswith('-') or lines[i].startswith('+') or lines[i].startswith(' ')):
                    hunk['lines'].append(lines[i])
                    i += 1
                current_diff['hunks'].append(hunk)
                continue
        i += 1
        
    return all_changes

def find_hunk_in_file(file_lines, hunk_lines):
    original_hunk_lines = [l[1:].rstrip('\n\r') for l in hunk_lines if not l.startswith('+')]
    if not original_hunk_lines:
        return -1
    
    file_lines_clean = [l.rstrip('\n\r') for l in file_lines]
    
    # Pre-calculate normalized versions for fuzzy matching
    h_norm_lines = [normalize(l) for l in original_hunk_lines]
    f_norm_lines = [normalize(l) for l in file_lines_clean]

    def lines_match(f_lines_indices, fuzzy=False):
        if len(f_lines_indices) < len(original_hunk_lines):
            return False
        for idx_f, h_norm in zip(f_lines_indices, h_norm_lines):
            f_norm = f_norm_lines[idx_f]
            if fuzzy:
                if h_norm not in f_norm and f_norm not in h_norm:
                    return False
            else:
                if file_lines_clean[idx_f].strip() != original_hunk_lines[len(matches)].strip(): # This is wrong, let's simplify
                    pass
        return True

    # 1. Try exact match (including leading whitespace)
    for i in range(len(file_lines_clean) - len(original_hunk_lines) + 1):
        match = True
        for j in range(len(original_hunk_lines)):
            if file_lines_clean[i+j].strip() != original_hunk_lines[j].strip():
                match = False
                break
        if match:
            return i

    # 2. Try fuzzy match (normalized lines)
    for i in range(len(file_lines_clean) - len(original_hunk_lines) + 1):
        match = True
        for j in range(len(original_hunk_lines)):
            if f_norm_lines[i+j] != h_norm_lines[j]:
                match = False
                break
        if match:
            logger.info(f"Found fuzzy match at line {i+1}")
            return i

    # 3. Try multiline-aware match (for when single line in diff is multiline in file)
    # Only if hunk is small (1-2 lines)
    if len(original_hunk_lines) <= 2:
        full_file_text = "".join(file_lines)
        full_file_norm = normalize(full_file_text)
        h_norm_combined = "".join(h_norm_lines)
        
        if h_norm_combined in full_file_norm:
            # Try to find the line index
            for i in range(len(file_lines_clean)):
                # If the normalized start of the hunk is in this line or nearby
                if h_norm_lines[0] in f_norm_lines[i] or f_norm_lines[i] in h_norm_lines[0]:
                    logger.info(f"Found multiline-aware match near line {i+1}")
                    return i

    # 4. Try using the first context line as anchor
    if hunk_lines[0].startswith(' '):
        anchor_norm = normalize(hunk_lines[0][1:])
        for i in range(len(file_lines_clean)):
            if f_norm_lines[i] == anchor_norm:
                # Verify subsequent lines match reasonably well
                match_count = 0
                for j in range(min(len(original_hunk_lines), len(file_lines_clean) - i)):
                    if f_norm_lines[i+j] == h_norm_lines[j]:
                        match_count += 1
                if match_count >= len(original_hunk_lines) * 0.5:
                    logger.info(f"Found anchor line match at {i+1}")
                    return i
    
    return -1

def is_hunk_already_applied(file_lines, hunk_lines):
    plus_lines = [l[1:].strip() for l in hunk_lines if l.startswith('+')]
    if not plus_lines:
        return False
        
    # Join all file lines and normalize once for full-file searching
    full_file_norm = normalize("".join(file_lines))
    
    all_plus_present = True
    for p in plus_lines:
        if not p.strip(): continue
        p_norm = normalize(p)
        if p_norm not in full_file_norm:
            all_plus_present = False
            break
            
    return all_plus_present

def apply_diff_changes(diff_file_path):
    clear_validation_log()
    all_changes = parse_diff(diff_file_path)
    if not all_changes:
        logger.warning("No changes found to apply.")
        return

    for change in all_changes:
        print("\n" + "=" * 60)
        logger.info(f"Change {change['id']}: {change['title']}")
        
        any_failed = False
        any_applied = False
        any_already_applied = False

        for diff in change['diffs']:
            file_path = diff['path']
            full_path = os.path.normpath(os.path.join(os.getcwd(), file_path))
            
            if not os.path.exists(full_path):
                logger.error(f"Target file not found: {full_path}")
                any_failed = True
                continue

            logger.info(f"Processing {file_path}...")
            with open(full_path, 'r', encoding='utf-8') as f:
                current_file_lines = f.readlines()

            hunks_applied_to_file = False
            # Sort hunks in reverse order of line number to apply from bottom up
            sorted_hunks = sorted(diff['hunks'], key=lambda x: x['start_old'], reverse=True)

            for hunk in sorted_hunks:
                start_idx = find_hunk_in_file(current_file_lines, hunk['lines'])
                
                if start_idx == -1:
                    if is_hunk_already_applied(current_file_lines, hunk['lines']):
                        logger.info(f"Hunk already applied to {file_path}")
                        any_already_applied = True
                        # Still log context for already applied changes
                        # Need to find where the applied hunk is
                        plus_lines = [l[1:].strip() for l in hunk['lines'] if l.startswith('+')]
                        if plus_lines:
                            for i_file, fl in enumerate(current_file_lines):
                                if normalize(plus_lines[0]) in normalize(fl):
                                    log_change_context(change['id'], change['title'], change['description'], file_path, i_file, hunk['start_old'], current_file_lines)
                                    break
                    else:
                        logger.error(f"Could not find hunk to apply to {file_path}")
                        any_failed = True
                    continue

                logger.info(f"Applying hunk to {file_path}...")
                original_hunk_lines = [l[1:] for l in hunk['lines'] if not l.startswith('+')]
                replacement_hunk_lines = [l[1:] for l in hunk['lines'] if not l.startswith('-')]
                
                current_file_lines[start_idx : start_idx + len(original_hunk_lines)] = replacement_hunk_lines
                hunks_applied_to_file = True
                any_applied = True
                
                # Log context after applying
                log_change_context(change['id'], change['title'], change['description'], file_path, start_idx, hunk['start_old'], current_file_lines)

            if hunks_applied_to_file:
                with open(full_path, 'w', encoding='utf-8', newline='') as f:
                    f.writelines(current_file_lines)
                logger.info(f"Successfully updated {file_path}")
                lint_success, lint_output = run_linter(full_path)
                if not lint_success:
                    any_failed = True
                
                # Update the validation log with linter output if available
                if lint_output:
                    try:
                        with open(VALIDATION_LOG, 'a', encoding='utf-8') as f:
                            f.write(f"### Linter Output for `{file_path}`\n")
                            f.write("```text\n")
                            f.write(lint_output)
                            f.write("\n```\n\n")
                    except Exception as e:
                        logger.error(f"Failed to append linter output to log: {e}")

        if any_failed:
            change['status'] = "Failed"
        elif any_applied:
            change['status'] = "Applied"
        elif any_already_applied:
            change['status'] = "Already Applied"
        else:
            change['status'] = "Skipped"

    # Final Summary Table
    print("\n" + "=" * 60)
    print("FINAL SUMMARY OF CHANGES")
    print("-" * 60)
    for change in all_changes:
        status_color = ColorFormatter.GREEN if change['status'] == "Applied" else \
                       ColorFormatter.YELLOW if change['status'] == "Already Applied" else \
                       ColorFormatter.RED
        print(f"{change['id']}. {change['title'][:40]:<40} [{status_color}{change['status']}{ColorFormatter.RESET}]")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    target_diff = sys.argv[1] if len(sys.argv) > 1 else "diffChanges.txt"
    apply_diff_changes(target_diff)
