import * as vscode from "vscode";
import { findEnvFiles, writeEnvFile, EnvFile } from "./EnvParser";

export class EnvPanel {
  public static currentPanel: EnvPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    if (EnvPanel.currentPanel) {
      EnvPanel.currentPanel._panel.reveal();
      EnvPanel.currentPanel._refresh();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "envProfileManager",
      "ENV Profile Manager",
      vscode.ViewColumn.One,
      { enableScripts: true },
    );
    panel.iconPath = new vscode.ThemeIcon("layers");
    EnvPanel.currentPanel = new EnvPanel(panel);
  }

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      (msg) => {
        if (msg.command === "ready") {
          this._refresh();
        }
        if (msg.command === "save") {
          try {
            writeEnvFile(msg.filePath, msg.variables);
            vscode.window.showInformationMessage(`Saved ${msg.fileName}`);
          } catch (e) {
            vscode.window.showErrorMessage(`Failed to save ${msg.fileName}`);
          }
        }
        if (msg.command === "refresh") {
          this._refresh();
        }
        if (msg.command === "export") {
          const folders = vscode.workspace.workspaceFolders;
          if (!folders) {
            return;
          }
          const exportPath = vscode.Uri.joinPath(
            folders[0].uri,
            ".env.example",
          );
          vscode.workspace.fs.writeFile(
            exportPath,
            Buffer.from(msg.content, "utf-8"),
          );
          vscode.window.showInformationMessage("Exported .env.example");
        }
        if (msg.command === "duplicate") {
          const folders = vscode.workspace.workspaceFolders;
          if (!folders) {
            vscode.window.showErrorMessage("No workspace folder found");
            return;
          }
          try {
            const targetName = msg.targetName.trim();
            if (!targetName || !targetName.startsWith(".env")) {
              vscode.window.showErrorMessage("File name must start with .env");
              return;
            }
            if (
              targetName.includes("..") ||
              targetName.includes("/") ||
              targetName.includes("\\")
            ) {
              vscode.window.showErrorMessage("Invalid file name");
              return;
            }
            const targetPath = vscode.Uri.joinPath(folders[0].uri, targetName);
            writeEnvFile(targetPath.fsPath, msg.variables);
            vscode.window.showInformationMessage(`✅ Created ${targetName}`);
            setTimeout(() => this._refresh(), 500);
          } catch (e) {
            vscode.window.showErrorMessage(
              `Failed to create ${msg.targetName}: ${e}`,
            );
          }
        }
      },
      null,
      this._disposables,
    );
  }

  private _refresh() {
    const envFiles = findEnvFiles();
    this._panel.webview.postMessage({ command: "load", files: envFiles });
  }

  private _getBadgeColor(fileName: string): string {
    if (fileName.includes("prod")) {
      return "#E24B4A";
    }
    if (fileName.includes("staging")) {
      return "#EF9F27";
    }
    if (fileName.includes("test")) {
      return "#888780";
    }
    if (fileName.includes("dev")) {
      return "#378ADD";
    }
    return "#1D9E75";
  }

  private _getHtml(): string {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    font-size: 13px;
    color: var(--vscode-foreground);
    background: linear-gradient(135deg, rgba(20,20,30,0.4) 0%, rgba(40,40,60,0.4) 100%);
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 20px;
    background: rgba(255, 255, 255, 0.07);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }
  .toolbar-title {
    font-size: 15px;
    font-weight: 600;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .active-badge {
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 20px;
    font-weight: 600;
    color: white;
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  .unsaved-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #fbbf24;
    display: none;
    box-shadow: 0 0 8px rgba(251, 191, 36, 0.6);
  }
  .unsaved-dot.visible { display: block; }
  .toolbar-btn {
    background: rgba(255, 255, 255, 0.1);
    color: var(--vscode-foreground);
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 6px 14px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.3s ease;
  }
  .toolbar-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }
  .toolbar-btn.primary {
    background: linear-gradient(135deg, #60a5fa, #a78bfa);
    color: white;
    border-color: transparent;
  }
  .toolbar-btn.primary:hover {
    background: linear-gradient(135deg, #3b82f6, #8b5cf6);
    box-shadow: 0 4px 20px rgba(96, 165, 250, 0.4);
  }
  .profiles {
    display: flex;
    gap: 4px;
    padding: 10px 16px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
    overflow-x: auto;
    overflow-y: hidden;
    background: rgba(255, 255, 255, 0.03);
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
  }
  .profiles::-webkit-scrollbar {
    height: 4px;
  }
  .profiles::-webkit-scrollbar-track {
    background: transparent;
  }
  .profiles::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }
  .profiles::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.2);
  }
  .profile-tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    cursor: pointer;
    border-radius: 10px 10px 0 0;
    font-size: 12px;
    font-weight: 500;
    border: 1px solid transparent;
    border-bottom: none;
    opacity: 0.6;
    transition: all 0.3s ease;
    white-space: nowrap;
    background: rgba(255, 255, 255, 0.05);
    color: var(--vscode-foreground);
    flex-shrink: 0;
  }
  .profile-tab:hover {
    opacity: 0.85;
    background: rgba(255, 255, 255, 0.1);
  }
  .profile-tab.active {
    opacity: 1;
    background: rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(10px);
    border-color: rgba(255, 255, 255, 0.2);
    margin-bottom: -1px;
    padding-bottom: 9px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
  .profile-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 6px currentColor;
  }
  .var-count {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.2);
    color: var(--vscode-foreground);
    font-weight: 600;
  }
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    opacity: 0.5;
    padding: 40px;
    text-align: center;
    font-size: 14px;
  }
  .searchbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.04);
  }
  .searchbar input {
    flex: 1;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: var(--vscode-input-foreground);
    padding: 7px 12px;
    border-radius: 8px;
    font-size: 12px;
    transition: all 0.3s ease;
  }
  .searchbar input::placeholder { color: rgba(255, 255, 255, 0.5); }
  .searchbar input:focus {
    outline: none;
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.3);
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.1);
  }
  .filter-btn {
    font-size: 11px;
    padding: 5px 12px;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
    color: var(--vscode-foreground);
    cursor: pointer;
    opacity: 0.6;
    transition: all 0.3s ease;
  }
  .filter-btn:hover { opacity: 0.8; }
  .filter-btn.on {
    opacity: 1;
    background: rgba(96, 165, 250, 0.3);
    border-color: rgba(96, 165, 250, 0.5);
    color: #60a5fa;
  }
  .vars-wrap {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-width: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }
  .vars-wrap::-webkit-scrollbar {
    width: 8px;
  }
  .vars-wrap::-webkit-scrollbar-track {
    background: transparent;
  }
  .vars-wrap::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }
  .vars-wrap::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.2);
  }
  table { width: 100%; border-collapse: collapse; table-layout: auto; }
  thead th {
    text-align: left;
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    position: sticky;
    top: 0;
    background: rgba(255, 255, 255, 0.08);
    z-index: 10;
    backdrop-filter: blur(10px);
  }
  thead th:first-child { width: 180px; min-width: 180px; }
  thead th:last-child { width: 100px; min-width: 100px; }
  tbody tr {
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    transition: background 0.2s ease;
  }
  tbody tr:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  td {
    padding: 0 12px;
    height: 40px;
    vertical-align: middle;
  }
  td:first-child { width: 180px; min-width: 180px; }
  td:last-child { width: 100px; min-width: 100px; }
  .key-col { width: 180px; min-width: 180px; }
  .value-col { width: 100%; min-width: 100px; }
  .val-input {
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--vscode-foreground);
    font-family: 'Monaco', 'Courier New', monospace;
    font-size: 12px;
    padding: 6px 8px;
    border-radius: 6px;
    transition: all 0.3s ease;
  }
  .val-input:focus {
    outline: none;
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(96, 165, 250, 0.5);
    box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.1);
  }
  .secret-mask {
    font-family: 'Monaco', 'Courier New', monospace;
    font-size: 13px;
    letter-spacing: 3px;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    padding: 6px 8px;
    border-radius: 6px;
    display: block;
    transition: all 0.3s ease;
  }
  .secret-mask:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.9);
  }
  .action-col {
    width: 75px;
    text-align: center;
    gap: 4px;
    height: 100%;
  }
  .action-col-cell{
    display:flex;
    align-items:center;
    justify-content:center;
    gap: 4px;
    width: 75px;
    text-align: center;
  }
  .del-btn {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    font-size: 13px;
    padding: 6px 8px;
    border-radius: 6px;
    opacity: 0;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  tbody tr:hover .del-btn {
    opacity: 1;
  }
  .del-btn:hover {
    color: white;
    background: rgba(96, 165, 250, 0.2);
    border-color: rgba(96, 165, 250, 0.4);
  }
  .del-btn.copy:hover {
    background: rgba(34, 197, 94, 0.2);
    border-color: rgba(34, 197, 94, 0.4);
  }
  .del-btn.delete:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.4);
  }
  .add-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
    border-bottom: none;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    transition: all 0.3s ease;
    background: rgba(255, 255, 255, 0.05);
    flex-shrink: 0;
  }
  .add-row:hover {
    background: rgba(96, 165, 250, 0.15);
    color: #60a5fa;
  }
  .statusbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.7);
    font-size: 11px;
    flex-shrink: 0;
  }
  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    box-shadow: 0 0 4px currentColor;
  }
</style>
</head>
<body>
<div class="toolbar">
  <div class="toolbar-title">🔐 ENV Profile Manager <span id="activeBadge" class="active-badge"></span><div class="unsaved-dot" id="unsavedDot"></div></div>
  <button class="toolbar-btn" onclick="doRefresh()">↺ Refresh</button>
  <button class="toolbar-btn" onclick="duplicateProfile()">⧉ Duplicate</button>
  <button class="toolbar-btn" onclick="exportExample()">⬇ Export</button>
  <button class="toolbar-btn primary" onclick="saveFile()">💾 Save</button>
</div>
<div class="profiles" id="profiles"></div>
<div id="emptyState" class="empty-state" style="display:none">📭 No .env files found in workspace</div>
<div id="mainContent" style="display:flex;flex-direction:column;flex:1;overflow:hidden">
  <div class="searchbar">
    <input type="text" placeholder="Search variables..." oninput="renderTable()" id="searchInput">
    <button class="filter-btn on" onclick="setFilter('all',this)">All</button>
    <button class="filter-btn" onclick="setFilter('secret',this)">🔒 Secrets</button>
    <button class="filter-btn" onclick="setFilter('public',this)">🌐 Public</button>
  </div>
  <div class="vars-wrap">
    <table><thead><tr><th class="key-col">Key</th><th class="value-col">Value</th><th class="action-col"></th></tr></thead>
    <tbody id="tbody"></tbody></table>
  </div>
  <div class="add-row" onclick="addRow()">＋ Add variable</div>
</div>
<div class="statusbar"><div class="status-dot" id="statusDot" style="background:#1D9E75"></div><span id="statusText">Loading...</span></div>

<script>
const vscode = acquireVsCodeApi();
let files = [];
let colors = [];
let activeIndex = 0;
let filterMode = 'all';
let changed = false;

const COLORS = {
  prod: '#E24B4A', staging: '#EF9F27', test: '#888780', dev: '#378ADD', default: '#1D9E75'
};

function getColor(name) {
  if (name.includes('prod')) return COLORS.prod;
  if (name.includes('staging')) return COLORS.staging;
  if (name.includes('test')) return COLORS.test;
  if (name.includes('dev')) return COLORS.dev;
  return COLORS.default;
}

window.addEventListener('message', event => {
  const msg = event.data;
  if (msg.command === 'load') {
    files = msg.files;
    colors = files.map(f => getColor(f.fileName));
    activeIndex = 0;
    changed = false;
    render();
  }
});

function render() {
  if (!files.length) {
    document.getElementById('emptyState').style.display = 'flex';
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('profiles').style.display = 'none';
    document.getElementById('statusText').textContent = 'No .env files found';
    return;
  }
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('mainContent').style.display = 'flex';
  document.getElementById('profiles').style.display = 'flex';
  renderProfiles();
  renderTable();
}

function renderProfiles() {
  const el = document.getElementById('profiles');
  el.innerHTML = files.map((f, i) =>
    '<div class="profile-tab' + (i === activeIndex ? ' active' : '') + '" onclick="switchProfile(' + i + ')">' +
    '<div class="profile-dot" style="background:' + colors[i] + '"></div>' +
    esc(f.fileName) +
    '<span class="var-count">' + f.variables.length + '</span>' +
    '</div>'
  ).join('');
  const badge = document.getElementById('activeBadge');
  badge.textContent = files[activeIndex].fileName;
  badge.style.background = colors[activeIndex];
  document.getElementById('statusDot').style.background = colors[activeIndex];
}

function renderTable() {
  const vars = files[activeIndex].variables;
  const q = document.getElementById('searchInput').value.toLowerCase();
  const tbody = document.getElementById('tbody');
  const filtered = vars.filter(v => {
    const matchSearch = v.key.toLowerCase().includes(q);
    const matchFilter = filterMode === 'all' || (filterMode === 'secret' && v.isSecret) || (filterMode === 'public' && !v.isSecret);
    return matchSearch && matchFilter;
  });
  tbody.innerHTML = filtered.map(v => {
    const i = vars.indexOf(v);
    return '<tr>' +
      '<td class="key-col"><input class="val-input" style="font-weight:500" value="' + esc(v.key) + '" oninput="updateKey(' + i + ',this.value)" placeholder="KEY_NAME"></td>' +
      '<td>' + (v.isSecret
        ? '<span class="secret-mask" onclick="reveal(this,' + i + ')">••••••••••••••••</span>'
        : '<input class="val-input" value="' + esc(v.value) + '" oninput="updateVal(' + i + ',this.value)">') +
      '</td>' +
      '<td class="action-col-cell" style="width:70px">' +
      '<button class="del-btn copy" onclick="copyVal(' + i + ')" title="Copy value">📋</button>' +
      '<button class="del-btn delete" onclick="delRow(' + i + ')">✕</button>' +
      '</td>' +
      '</tr>';
  }).join('');
  document.getElementById('statusText').textContent =
    vars.length + ' vars · ' + vars.filter(v => v.isSecret).length + ' secrets' +
    (filtered.length !== vars.length ? ' · ' + filtered.length + ' shown' : '');
}

function switchProfile(i) {
  if (changed && !confirm('Unsaved changes. Switch anyway?')) return;
  activeIndex = i; changed = false;
  document.getElementById('unsavedDot').classList.remove('visible');
  document.getElementById('searchInput').value = '';
  filterMode = 'all';
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('.filter-btn')[0].classList.add('on');
  renderProfiles(); renderTable();
}

function reveal(el, i) {
  const v = files[activeIndex].variables[i];
  const inp = document.createElement('input');
  inp.className = 'val-input';
  inp.value = v.value;
  inp.oninput = () => updateVal(i, inp.value);
  inp.onblur = () => mask(inp, i);
  el.replaceWith(inp); inp.focus();
}

function mask(el, i) {
  const v = files[activeIndex].variables[i];
  const span = document.createElement('span');
  span.className = 'secret-mask';
  span.textContent = '••••••••••••••••';
  span.onclick = () => reveal(span, i);
  el.replaceWith(span);
}

function updateKey(i, key) {
  files[activeIndex].variables[i].key = key;
  files[activeIndex].variables[i].isSecret = /secret|password|passwd|token|api_key|apikey|private|auth|credential/i.test(key);
  markChanged();
}

function updateVal(i, val) { files[activeIndex].variables[i].value = val; markChanged(); }

function delRow(i) { files[activeIndex].variables.splice(i, 1); markChanged(); renderTable(); }

function addRow() {
  files[activeIndex].variables.push({ key: '', value: '', isSecret: false });
  markChanged(); renderTable();
  document.querySelector('#tbody tr:last-child input').focus();
}

function markChanged() { changed = true; document.getElementById('unsavedDot').classList.add('visible'); }

function saveFile() {
  const f = files[activeIndex];
  vscode.postMessage({ command: 'save', filePath: f.filePath, fileName: f.fileName, variables: f.variables });
  changed = false; document.getElementById('unsavedDot').classList.remove('visible');
}

function doRefresh() { vscode.postMessage({ command: 'refresh' }); }

function exportExample() {
  const f = files[activeIndex];
  vscode.postMessage({ command: 'export', content: f.variables.map(v => v.key + '=').join('\\n'), fileName: '.env.example' });
}

function duplicateProfile() {
  const modal = document.createElement('div');
  modal.id = 'dupModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:1000';

  const box = document.createElement('div');
  box.style.cssText = 'background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);backdrop-filter:blur(20px);border-radius:16px;padding:24px;width:340px;display:flex;flex-direction:column;gap:14px;box-shadow:0 8px 32px rgba(0,0,0,0.2)';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:14px;font-weight:600;color:#60a5fa';
  title.textContent = 'Duplicate Profile';

  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.7)';
  subtitle.textContent = 'Copying from: ' + files[activeIndex].fileName;

  const inp = document.createElement('input');
  inp.id = 'dupInput';
  inp.className = 'val-input';
  inp.style.cssText = 'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);padding:8px 12px;border-radius:8px;color:var(--vscode-foreground)';
  inp.placeholder = '.env.staging';
  inp.value = '.env.staging';

  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'toolbar-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = () => document.getElementById('dupModal').remove();

  const createBtn = document.createElement('button');
  createBtn.className = 'toolbar-btn primary';
  createBtn.textContent = 'Create';
  createBtn.onclick = () => confirmDuplicate();

  btns.appendChild(cancelBtn);
  btns.appendChild(createBtn);
  box.appendChild(title);
  box.appendChild(subtitle);
  box.appendChild(inp);
  box.appendChild(btns);
  modal.appendChild(box);
  document.body.appendChild(modal);
  inp.focus();
  inp.select();
}

function confirmDuplicate() {
  const inp = document.getElementById('dupInput');
  const name = inp ? inp.value.trim() : '';
  const modal = document.getElementById('dupModal');
  if (modal) { modal.remove(); }
  if (!name || !name.startsWith('.env')) {
    showToast('Name must start with .env');
    return;
  }
  vscode.postMessage({
    command: 'duplicate',
    sourcePath: files[activeIndex].filePath,
    targetName: name,
    variables: files[activeIndex].variables
  });
}

function setFilter(mode, btn) {
  filterMode = mode;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  renderTable();
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function copyVal(i) {
  const v = files[activeIndex].variables[i];
  navigator.clipboard.writeText(v.value).then(() => {
    showToast('Copied ' + v.key);
  });
}

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);background:rgba(96,165,250,0.9);backdrop-filter:blur(10px);color:white;padding:8px 18px;border-radius:24px;font-size:12px;z-index:999;transition:opacity .3s;border:1px solid rgba(255,255,255,0.2);box-shadow:0 4px 16px rgba(96,165,250,0.3)';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.style.opacity = '0', 1500);
}

vscode.postMessage({ command: 'ready' });
</script>
</body></html>`;
    return html;
  }

  public dispose() {
    EnvPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
}
