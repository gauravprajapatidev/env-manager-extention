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
      "envManager",
      "ENV Manager",
      vscode.ViewColumn.One,
      { enableScripts: true },
    );
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
            const targetPath = vscode.Uri.joinPath(
              folders[0].uri,
              msg.targetName,
            );
            writeEnvFile(targetPath.fsPath, msg.variables);
            vscode.window.showInformationMessage(
              `✅ Created ${msg.targetName}`,
            );
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
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-foreground); background: var(--vscode-editor-background); display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
  .toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--vscode-panel-border); flex-shrink: 0; }
  .toolbar-title { font-size: 14px; font-weight: 500; flex: 1; display: flex; align-items: center; gap: 8px; }
  .active-badge { font-size: 10px; padding: 2px 8px; border-radius: 20px; font-weight: 500; color: white; }
  .unsaved-dot { width: 8px; height: 8px; border-radius: 50%; background: #EF9F27; display: none; }
  .unsaved-dot.visible { display: block; }
  .toolbar-btn { background: transparent; color: var(--vscode-foreground); border: 1px solid var(--vscode-panel-border); padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: all .15s; }
  .toolbar-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
  .toolbar-btn.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: var(--vscode-button-background); }
  .toolbar-btn.primary:hover { background: var(--vscode-button-hoverBackground); }
  .profiles { display: flex; gap: 2px; padding: 8px 16px 0; border-bottom: 1px solid var(--vscode-panel-border); flex-shrink: 0; overflow-x: auto; }
  .profile-tab { display: flex; align-items: center; gap: 6px; padding: 6px 14px; cursor: pointer; border-radius: 6px 6px 0 0; font-size: 12px; border: 1px solid transparent; border-bottom: none; opacity: 0.55; transition: all .15s; white-space: nowrap; background: transparent; color: var(--vscode-foreground); }
  .profile-tab:hover { opacity: 0.8; }
  .profile-tab.active { opacity: 1; background: var(--vscode-editor-background); border-color: var(--vscode-panel-border); margin-bottom: -1px; padding-bottom: 7px; }
  .profile-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .var-count { font-size: 10px; padding: 1px 6px; border-radius: 10px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; opacity: 0.5; padding: 40px; text-align: center; font-size: 14px; }
  .searchbar { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--vscode-panel-border); flex-shrink: 0; }
  .searchbar input { flex: 1; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); color: var(--vscode-input-foreground); padding: 5px 10px; border-radius: 4px; font-size: 12px; }
  .searchbar input:focus { outline: 1px solid var(--vscode-focusBorder); }
  .filter-btn { font-size: 11px; padding: 4px 10px; border-radius: 20px; border: 1px solid var(--vscode-panel-border); background: transparent; color: var(--vscode-foreground); cursor: pointer; opacity: 0.6; transition: all .15s; }
  .filter-btn.on { opacity: 1; background: var(--vscode-toolbar-hoverBackground); border-color: var(--vscode-focusBorder); }
  .vars-wrap { flex: 1; overflow-y: auto; }
  table { width: 100%; border-collapse: collapse; }
  thead th { text-align: left; padding: 6px 16px; font-size: 10px; font-weight: 500; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); text-transform: uppercase; letter-spacing: 0.06em; position: sticky; top: 0; background: var(--vscode-editor-background); z-index: 1; }
  tbody tr { border-bottom: 1px solid var(--vscode-panel-border); transition: background .1s; }
  tbody tr:hover { background: var(--vscode-list-hoverBackground); }
  td { padding: 0 16px; height: 38px; vertical-align: middle; }
  .key-col { width: 220px; }
  .val-input { width: 100%; background: transparent; border: none; color: var(--vscode-foreground); font-family: var(--vscode-editor-font-family); font-size: 12px; padding: 4px 6px; border-radius: 3px; }
  .val-input:focus { outline: 1px solid var(--vscode-focusBorder); background: var(--vscode-input-background); }
  .secret-mask { font-family: var(--vscode-editor-font-family); font-size: 13px; letter-spacing: 3px; color: var(--vscode-descriptionForeground); cursor: pointer; padding: 4px 6px; border-radius: 3px; display: block; }
  .secret-mask:hover { background: var(--vscode-toolbar-hoverBackground); }
  .action-col { width: 40px; text-align: center; }
  .del-btn { background: transparent; border: none; color: var(--vscode-descriptionForeground); cursor: pointer; font-size: 14px; padding: 4px; border-radius: 3px; opacity: 0; transition: all .15s; }
  tbody tr:hover .del-btn { opacity: 1; }
  .del-btn:hover { color: var(--vscode-errorForeground); }
  .add-row { display: flex; align-items: center; gap: 8px; padding: 10px 16px; cursor: pointer; color: var(--vscode-descriptionForeground); font-size: 12px; border-bottom: 1px solid var(--vscode-panel-border); transition: all .15s; }
  .add-row:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); }
  .statusbar { display: flex; align-items: center; gap: 10px; padding: 5px 16px; border-top: 1px solid var(--vscode-panel-border); background: var(--vscode-statusBar-background); color: var(--vscode-statusBar-foreground); font-size: 11px; flex-shrink: 0; }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; }
</style>
</head>
<body>
<div class="toolbar">
  <div class="toolbar-title">🔐 ENV Manager <span id="activeBadge" class="active-badge"></span><div class="unsaved-dot" id="unsavedDot"></div></div>
  <button class="toolbar-btn" onclick="doRefresh()">↺ Refresh</button>
  <button class="toolbar-btn" onclick="duplicateProfile()">⧉ Duplicate</button>
  <button class="toolbar-btn" onclick="exportExample()">⬇ Export</button>
  <button class="toolbar-btn primary" onclick="saveFile()">Save</button>
</div>
<div class="profiles" id="profiles"></div>
<div id="emptyState" class="empty-state" style="display:none">📭 No .env files found in workspace</div>
<div id="mainContent" style="display:flex;flex-direction:column;flex:1;overflow:hidden">
  <div class="searchbar">
    <input type="text" placeholder="Search variables..." oninput="renderTable()" id="searchInput">
    <button class="filter-btn on" onclick="setFilter('all',this)">All</button>
    <button class="filter-btn" onclick="setFilter('secret',this)">🔒 Secrets</button>
    <button class="filter-btn" onclick="setFilter('public',this)">Public</button>
  </div>
  <div class="vars-wrap">
    <table><thead><tr><th class="key-col">Key</th><th>Value</th><th class="action-col"></th></tr></thead>
    <tbody id="tbody"></tbody></table>
    <div class="add-row" onclick="addRow()">＋ Add variable</div>
  </div>
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
    f.fileName +
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
      '<td class="action-col" style="width:70px">' +
      '<button class="del-btn" onclick="copyVal(' + i + ')" title="Copy value">⧉</button>' +
      '<button class="del-btn" onclick="delRow(' + i + ')">✕</button>' +
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
  el.replaceWith(inp); inp.focus();
}

function updateKey(i, key) {
  files[activeIndex].variables[i].key = key;
  files[activeIndex].variables[i].isSecret = /secret|password|passwd|token|api_key|apikey|private|auth|credential/i.test(key);
  markChanged();
}

function updateVal(i, val) { files[activeIndex].variables[i].value = val; markChanged(); }

function delRow(i) { files[activeIndex].variables.splice(i, 1); markChanged(); renderTable(); }

function addRow() {
  files[activeIndex].variables.push({ key: 'NEW_KEY', value: '', isSecret: false });
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
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000';
  
  const box = document.createElement('div');
  box.style.cssText = 'background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border);border-radius:8px;padding:20px;width:320px;display:flex;flex-direction:column;gap:12px';
  
  const title = document.createElement('div');
  title.style.cssText = 'font-size:13px;font-weight:500';
  title.textContent = 'Duplicate Profile';
  
  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'font-size:12px;color:var(--vscode-descriptionForeground)';
  subtitle.textContent = 'Copying from: ' + files[activeIndex].fileName;
  
  const inp = document.createElement('input');
  inp.id = 'dupInput';
  inp.className = 'val-input';
  inp.style.cssText = 'background:var(--vscode-input-background);border:1px solid var(--vscode-input-border);padding:6px 10px;border-radius:4px';
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
    t.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);background:var(--vscode-button-background);color:var(--vscode-button-foreground);padding:6px 16px;border-radius:20px;font-size:12px;z-index:999;transition:opacity .3s';
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
  }

  public dispose() {
    EnvPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
}
