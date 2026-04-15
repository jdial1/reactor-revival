import os
import re
import subprocess
import sys
import json
from datetime import datetime
from flask import Flask, render_template_string, request, jsonify

app = Flask(__name__)

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIFF_FILE = os.path.join(BASE_DIR, "diffChanges.txt")
APPLY_SCRIPT = os.path.join(BASE_DIR, "scripts", "apply_diff_changes.py")
HISTORY_FILE = os.path.join(BASE_DIR, "change_history.json")

def strip_ansi(text):
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)

def parse_summary(stdout):
    summary = []
    lines = stdout.splitlines()
    in_summary = False
    for line in lines:
        line = strip_ansi(line)
        if "FINAL SUMMARY OF CHANGES" in line:
            in_summary = True
            continue
        if in_summary and "====" in line and len(summary) > 0:
            in_summary = False
            break
        if in_summary and re.match(r'^\d+\.', line):
            # Format: 1. Title... [Status]
            match = re.match(r'^(\d+)\.\s+(.*?)\s+\[(.*)\]$', line)
            if match:
                summary.append({
                    "id": match.group(1),
                    "title": match.group(2).strip(),
                    "status": match.group(3).strip(),
                    "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                })
    return summary

def save_history(new_changes):
    history = []
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r') as f:
                history = json.load(f)
        except Exception:
            history = []
            
    # Prepend new changes to show latest first
    history = new_changes + history
    
    with open(HISTORY_FILE, 'w') as f:
        json.dump(history, f, indent=2)

def get_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            return []
    return []

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Diff Applier UI</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
    <style>
        body {
            background-color: #121212;
            color: #e0e0e0;
            font-family: 'Roboto', sans-serif;
        }
        .md-card {
            background-color: #1e1e1e;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            border: 1px solid #333;
        }
        .btn-primary {
            background-color: #bb86fc;
            color: #000;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }
        .btn-primary:hover {
            background-color: #d7b7fd;
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(187, 134, 252, 0.3);
        }
        .btn-primary:active {
            transform: translateY(0);
        }
        pre {
            background-color: #0a0a0a;
            border-radius: 8px;
            padding: 1rem;
            overflow-x: auto;
            border: 1px solid #222;
            color: #a5d6a7;
        }
        table {
            border-collapse: separate;
            border-spacing: 0 4px;
        }
        tr {
            background-color: #242424;
            transition: background-color 0.15s;
        }
        tr:hover {
            background-color: #2d2d2d;
        }
        td {
            padding: 16px;
            border-top: 1px solid #333;
            border-bottom: 1px solid #333;
        }
        td:first-child { border-left: 1px solid #333; border-top-left-radius: 8px; border-bottom-left-radius: 8px; }
        td:last-child { border-right: 1px solid #333; border-top-right-radius: 8px; border-bottom-right-radius: 8px; }
        
        th {
            text-align: left;
            color: #bb86fc;
            text-transform: uppercase;
            font-size: 0.75rem;
            letter-spacing: 1.5px;
            padding: 12px 16px;
            font-weight: 700;
        }
        .status-applied { background: rgba(129, 199, 132, 0.1); color: #81c784; padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(129, 199, 132, 0.2); }
        .status-failed { background: rgba(229, 115, 115, 0.1); color: #e57373; padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(229, 115, 115, 0.2); }
        .status-already { background: rgba(100, 181, 246, 0.1); color: #64b5f6; padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(100, 181, 246, 0.2); }
        
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #121212; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #444; }
    </style>
</head>
<body class="p-6 md:p-12 min-h-screen bg-[#121212]">
    <div class="max-w-7xl mx-auto">
        <header class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
            <div class="flex items-center gap-4">
                <div class="w-14 h-14 bg-purple-900/30 rounded-2xl flex items-center justify-center border border-purple-500/30">
                    <span class="material-icons text-3xl text-purple-400">terminal</span>
                </div>
                <div>
                    <h1 class="text-3xl font-black tracking-tight text-white">REACTOR REVIVAL</h1>
                    <p class="text-zinc-500 font-medium">Diff Application & Change Management</p>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <span id="statusIndicator" class="flex items-center gap-2 text-sm text-zinc-500 bg-zinc-900 px-4 py-2 rounded-full border border-zinc-800">
                    <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    System Online
                </span>
            </div>
        </header>

        <div class="grid grid-cols-1 xl:grid-cols-5 gap-8 mb-10">
            <!-- Left: Input -->
            <div class="xl:col-span-3 flex flex-col gap-6">
                <div class="md-card p-6 flex flex-col gap-4">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                            <span class="material-icons text-purple-400">post_add</span>
                            <h2 class="text-lg font-bold">STAGING AREA</h2>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="clearInput()" class="text-zinc-500 hover:text-zinc-300 transition-colors">
                                <span class="material-icons text-xl">delete_sweep</span>
                            </button>
                        </div>
                    </div>
                    <textarea id="diffInput" 
                        class="w-full h-96 bg-[#0a0a0a] border border-zinc-800 rounded-xl p-6 font-mono text-sm text-zinc-300 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all resize-none shadow-inner"
                        placeholder="Paste your diff changes here..."></textarea>
                    <div class="flex items-center justify-between mt-2">
                        <div class="text-xs text-zinc-500">
                            Supported: Multi-file diffs with ### headers
                        </div>
                        <button onclick="applyDiff()" id="applyBtn" class="btn-primary px-8 py-3 rounded-xl font-bold flex items-center gap-3">
                            <span class="material-icons">bolt</span>
                            PROCESS CHANGES
                        </button>
                    </div>
                </div>
            </div>

            <!-- Right: Live Output -->
            <div class="xl:col-span-2 flex flex-col gap-6">
                <div class="md-card p-6 flex flex-col h-full gap-4">
                    <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                            <span class="material-icons text-green-400">wysiwyg</span>
                            <h2 class="text-lg font-bold">LOG OUTPUT</h2>
                        </div>
                        <button onclick="copyOutput()" class="text-zinc-500 hover:text-purple-400 transition-colors flex items-center gap-1 text-sm font-bold">
                            <span class="material-icons text-lg">content_copy</span>
                            COPY
                        </button>
                    </div>
                    <pre id="outputContent" class="flex-grow text-xs leading-relaxed font-mono overflow-y-auto max-h-[480px]">Ready to process...</pre>
                </div>
            </div>
        </div>

        <!-- Bottom: History -->
        <div class="md-card p-8">
            <div class="flex items-center justify-between mb-8">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
                        <span class="material-icons text-purple-400">history</span>
                    </div>
                    <div>
                        <h2 class="text-xl font-black text-white">AUDIT TRAIL</h2>
                        <p class="text-xs text-zinc-500 uppercase tracking-widest font-bold">Historical Application Log</p>
                    </div>
                </div>
                <button onclick="loadHistory()" class="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm font-bold bg-zinc-800 px-4 py-2 rounded-lg">
                    <span class="material-icons text-lg">refresh</span>
                    REFRESH
                </button>
            </div>
            
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead>
                        <tr>
                            <th class="w-16">ID</th>
                            <th>Timestamp</th>
                            <th>Change Title</th>
                            <th>Status</th>
                            <th class="text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody id="historyBody">
                        <!-- Rows populated by JS -->
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        async function applyDiff() {
            const input = document.getElementById('diffInput').value;
            if (!input.trim()) return;

            const btn = document.getElementById('applyBtn');
            const output = document.getElementById('outputContent');
            
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            btn.innerHTML = '<span class="material-icons animate-spin">sync</span> PROCESSING...';
            output.textContent = 'Initializing sequence...';
            output.scrollTop = 0;

            try {
                const response = await fetch('/apply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ diff: input })
                });
                const data = await response.json();
                output.textContent = data.output;
                output.scrollTop = output.scrollHeight;
                loadHistory();
            } catch (err) {
                output.textContent = 'CRITICAL ERROR: ' + err;
            } finally {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
                btn.innerHTML = '<span class="material-icons">bolt</span> PROCESS CHANGES';
            }
        }

        async function loadHistory() {
            try {
                const response = await fetch('/history');
                const data = await response.json();
                const body = document.getElementById('historyBody');
                body.innerHTML = '';

                if (data.length === 0) {
                    body.innerHTML = '<tr><td colspan="5" class="text-center text-zinc-600 py-12 italic">No history available</td></tr>';
                    return;
                }

                data.forEach(item => {
                    const tr = document.createElement('tr');
                    const statusClass = item.status.includes('Applied') && !item.status.includes('Already') ? 'status-applied' : 
                                      (item.status.includes('Already') ? 'status-already' : 'status-failed');
                    
                    tr.innerHTML = `
                        <td class="font-mono text-zinc-600">#${item.id}</td>
                        <td class="text-zinc-500 text-xs font-mono">${item.timestamp}</td>
                        <td class="font-bold text-zinc-200">${item.title}</td>
                        <td><span class="${statusClass} text-[10px] font-black tracking-tighter uppercase">${item.status}</span></td>
                        <td class="text-right">
                            <button onclick="alert('Change Details:\\nID: ${item.id}\\nTitle: ${item.title}\\nStatus: ${item.status}\\nTime: ${item.timestamp}')" 
                                    class="w-8 h-8 rounded-full hover:bg-zinc-700 transition-colors text-zinc-500 hover:text-zinc-200 inline-flex items-center justify-center">
                                <span class="material-icons text-lg">visibility</span>
                            </button>
                        </td>
                    `;
                    body.appendChild(tr);
                });
            } catch (err) {
                console.error('Failed to load history:', err);
            }
        }

        function clearInput() {
            document.getElementById('diffInput').value = '';
        }

        function copyOutput() {
            const content = document.getElementById('outputContent').textContent;
            const header = 'Review output logs, warnings/errors should be the first importance on next set of changes, provide the next set of changes in condensed diff format\\n\\n';
            navigator.clipboard.writeText(header + content).then(() => {
                const btn = event.currentTarget;
                const originalContent = btn.innerHTML;
                btn.innerHTML = '<span class="material-icons text-lg">check_circle</span> COPIED';
                btn.classList.add('text-green-400');
                setTimeout(() => {
                    btn.innerHTML = originalContent;
                    btn.classList.remove('text-green-400');
                }, 2000);
            });
        }

        // Initial load
        loadHistory();
    </script>
</body>
</html>
"""

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/apply', methods=['POST'])
def apply():
    diff_content = request.json.get('diff', '')
    if not diff_content:
        return jsonify({"output": "Error: No diff content provided."}), 400
    
    with open(DIFF_FILE, 'w', encoding='utf-8') as f:
        f.write(diff_content)
    
    try:
        result = subprocess.run([sys.executable, APPLY_SCRIPT, DIFF_FILE], 
                               capture_output=True, text=True, cwd=BASE_DIR)
        
        output = result.stdout
        if result.stderr:
            output += "\n\n--- STDERR ---\n" + result.stderr
            
        # Parse summary and update history
        new_changes = parse_summary(output)
        if new_changes:
            save_history(new_changes)
            
        return jsonify({"output": strip_ansi(output)})
    except Exception as e:
        return jsonify({"output": f"CRITICAL SCRIPT ERROR: {str(e)}"}), 500

@app.route('/history')
def history():
    return jsonify(get_history())

if __name__ == '__main__':
    port = 5000
    print(f"Starting Reactor Revival UI on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)
