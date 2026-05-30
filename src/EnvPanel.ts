import * as vscode from "vscode";
import { findEnvFiles, writeEnvFile, EnvFile } from "./EnvParser";

export class EnvPanel {
  public static currentPanel: EnvPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    if (EnvPanel.currentPanel) {
      EnvPanel.currentPanel._panel.reveal();
      EnvPanel.currentPanel._update();
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
    this._update();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg) => {
        if (msg.command === "save") {
          try {
            writeEnvFile(msg.filePath, msg.variables);
            vscode.window.showInformationMessage(`✅ Saved ${msg.fileName}`);
          } catch (e) {
            vscode.window.showErrorMessage(`Failed to save ${msg.fileName}`);
          }
        }
        if (msg.command === "refresh") {
          this._update();
        }
      },
      null,
      this._disposables,
    );
  }

  private _update() {
    const envFiles = findEnvFiles();
    this._panel.webview.html = this._getHtml(envFiles);
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

  private _getHtml(envFiles: EnvFile[]): string {
    const filesJson = JSON.stringify(envFiles);
    const colors = envFiles.map((f) => this._getBadgeColor(f.fileName));
    const colorsJson = JSON.stringify(colors);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: 13px;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  /* Toolbar */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
  }
  .toolbar-title {
    font-size: 14px;
    font-weight: 500;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .active-badge {
    font-size: 10px;
    padding: 2px 8px;
    border-radius: 20px;
    font-weight: 500;
    color: white;
  }
  .unsaved-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #EF9F27;
    display: none;
  }
  .unsaved-dot.visible { display: block; }
  .toolbar-btn {
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-panel-border);
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all .15s;
  }
  .toolbar-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
  .toolbar-btn.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-color: var(--vscode-button-background);
  }
  .toolbar-btn.primary:hover { background: var(--vscode-button-hoverBackground); }

  /* Profile tabs */
  .profiles {
    display: flex;
    gap: 2px;
    padding: 8px 16px 0;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
    overflow-x: auto;
  }
  .profile-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    cursor: pointer;
    border-radius: 6px 6px 0 0;
    font-size: 12px;
    border: 1px solid transparent;
    border-bottom: none;
    color: var(--vscode-foreground);
    opacity: 0.55;
    transition: all .15s;
    white-space: nowrap;
    background: transparent;
  }
  .profile-tab:hover { opacity: 0.8; background: var(--vscode-toolbar-hoverBackground); }
  .profile-tab.active {
    opacity: 1;
    background: var(--vscode-editor-background);
    border-color: var(--vscode-panel-border);
    margin-bottom: -1px;
    padding-bottom: 7px;
  }
  .profile-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .var-count {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
  }

  /* Empty state */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    opacity: 0.5;
    padding: 40px;
    text-align: center;
  }
  .empty-icon { font-size: 40px; }

  /* Search bar */
  .searchbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--vscode-panel-border);
    flex-shrink: 0;
  }
  .searchbar input {
    flex: 1;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border);
    color: var(--vscode-input-foreground);
    padding: 5px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--vscode-font-family);
  }
  .searchbar input:focus { outline: 1px solid var(--vscode-focusBorder); }
  .filter-btn {
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 20px;
    border: 1px solid var(--vscode-panel-border);
    background: transparent;
    color: var(--vscode-foreground);
    cursor: pointer;
    opacity: 0.6;
    transition: all .15s;
  }
  .filter-btn.on { opacity: 1; background: var(--vscode-toolbar-hoverBackground); border-color: var(--vscode-focusBorder); }

  /* Variables table */
  .vars-wrap { flex: 1; overflow-y: auto; }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    text-align: left;
    padding: 6px 16px;
    font-size: 10px;
    font-weight: 500;
    color: var(--vscode-descriptionForeground);
    border-bottom: 1px solid var(--vscode-panel-border);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    position: sticky;
    top: 0;
    background: var(--vscode-editor-background);
    z-index: 1;
  }
  tbody tr {
    border-bottom: 1px solid var(--vscode-panel-border);
    transition: background .1s;
  }
  tbody tr:hover { background: var(--vscode-list-hoverBackground); }
  td { padding: 0 16px; height: 38px; vertical-align: middle; }
  .key-col { width: 220px; }
  .key-cell {
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .lock-icon { opacity: 0.4; font-size: 11px; }
  .val-input {
    width: 100%;
    background: transparent;
    border: none;
    color: var(--vscode-foreground);
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    padding: 4px 6px;
    border-radius: 3px;
  }
  .val-input:focus { outline: 1px solid var(--vscode-focusBorder); background: var(--vscode-input-background); }
  .secret-mask {
    font-family: var(--vscode-editor-font-family);
    font-size: 13px;
    letter-spacing: 3px;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 3px;
    display: block;
  }
  .secret-mask:hover { background: var(--vscode-toolbar-hoverBackground); }
  .action-col { width: 40px; text-align: center; }
  .del-btn {
    background: transparent;
    border: none;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    font-size: 14px;
    padding: 4px;
    border-radius: 3px;
    opacity: 0;
    transition: all .15s;
  }
  tbody tr:hover .del-btn { opacity: 1; }
  .del-btn:hover { color: var(--vscode-errorForeground); background: var(--vscode-inputValidation-errorBackground); }

  /* Add variable button */
  .add-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    cursor: pointer;
    color: var(--vscode-descriptionForeground);
    font-size: 12px;
    border-bottom: 1px solid var(--vscode-panel-border);
    transition: all .15s;
  }
  .add-row:hover { background: var(--vscode-list-hoverBackground); color: var(--vscode-foreground); }

  /* Status bar */
  .statusbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 5px 16px;
    border-top: 1px solid var(--vscode-panel-border);
    background: var(--vscode-statusBar-background);
    color: var(--vscode-statusBar-foreground);
    font-size: 11px;
    flex-shrink: 0;
  }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; }
</style>
</head>
<body>

<div class="toolbar">
  <div class="toolbar-title">
    🔐 ENV Manager
    <span id="activeBadge" class="active-badge"></span>
    <div class="unsaved-dot" id="unsavedDot"></div>
  </div>
  <button class="toolbar-btn" onclick="refresh()">↺ Refresh</button>
  <button class="toolbar-btn primary" onclick="saveFile()">Save</button>
</div>

<div class="profiles" id="profiles"></div>

<div id="emptyState" class="empty-state" style="display:none">
  <div class="empty-icon">📭</div>
  <div>No .env files found in this workspace</div>
  <div style="font-size:11px;margin-top:4px">Create a .env file in your project root to get started</div>
</div>

<div id="mainContent" style="display:flex;flex-direction:column;flex:1;overflow:hidden">
  <div class="searchbar">
    <input type="text" placeholder="Search variables..." oninput="filterVars(this.value)" id="searchInput">
    <button class="filter-btn on" id="filterAll" onclick="setFilter('all',this)">All</button>
    <button class="filter-btn" id="filterSecret" onclick="setFilter('secret',this)">🔒 Secrets</button>
    <button class="filter-btn" id="filterPublic" onclick="setFilter('public',this)">Public</button>
  </div>

  <div class="vars-wrap">
    <table>
      <thead>
        <tr>
          <th class="key-col">Key</th>
          <th>Value</th>
          <th class="action-col"></th>
        </tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table>
    <div class="add-row" onclick="addRow()">＋ Add variable</div>
  </div>
</div>

<div class="statusbar">
  <div class="status-dot" id="statusDot" style="background:#1D9E75"></div>
  <span id="statusText">Ready</span>
</div>

<script>
  const vscode = acquireVsCodeApi();
  const files = ${filesJson};
  const colors = ${colorsJson};
  let activeIndex = 0;
  let filterMode = 'all';
  let changed = false;

  function init() {
    if (!files.length) {
      document.getElementById('emptyState').style.display = 'flex';
      document.getElementById('mainContent').style.display = 'none';
      document.getElementById('profiles').style.display = 'none';
      return;
    }
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

    const filtered = vars.filter((v, i) => {
      const matchSearch = v.key.toLowerCase().includes(q);
      const matchFilter = filterMode === 'all' || (filterMode === 'secret' && v.isSecret) || (filterMode === 'public' && !v.isSecret);
      return matchSearch && matchFilter;
    });

    tbody.innerHTML = filtered.map((v, fi) => {
      const i = vars.indexOf(v);
      return '<tr>' +
        '<td class="key-col"><div class="key-cell">' +
        (v.isSecret ? '<span class="lock-icon">🔒</span>' : '') +
        '<input class="val-input" style="font-family:var(--vscode-editor-font-family);font-size:12px;font-weight:500;" value="' + escHtml(v.key) + '" oninput="updateKey(' + i + ',this.value)" placeholder="KEY_NAME">' +
        '</div></td>' +
        '<td>' + (v.isSecret
          ? '<span class="secret-mask" onclick="revealSecret(this,' + i + ')" title="Click to reveal">••••••••••••••••</span>'
          : '<input class="val-input" value="' + escHtml(v.value) + '" oninput="updateVal(' + i + ',this.value)">') +
        '</td>' +
        '<td class="action-col"><button class="del-btn" onclick="deleteRow(' + i + ')" title="Delete">✕</button></td>' +
        '</tr>';
    }).join('');

    document.getElementById('statusText').textContent =
      vars.length + ' variable' + (vars.length !== 1 ? 's' : '') +
      ' · ' + vars.filter(v => v.isSecret).length + ' secret' +
      (filtered.length !== vars.length ? ' · ' + filtered.length + ' shown' : '');
  }

  function switchProfile(i) {
    if (changed && !confirm('You have unsaved changes. Switch anyway?')) { return; }
    activeIndex = i;
    changed = false;
    document.getElementById('unsavedDot').classList.remove('visible');
    document.getElementById('searchInput').value = '';
    filterMode = 'all';
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('on'));
    document.getElementById('filterAll').classList.add('on');
    renderProfiles();
    renderTable();
  }

  function revealSecret(el, i) {
    const v = files[activeIndex].variables[i];
    const input = document.createElement('input');
    input.className = 'val-input';
    input.value = v.value;
    input.oninput = () => updateVal(i, input.value);
    el.replaceWith(input);
    input.focus();
  }

  function updateVal(i, val) {
    files[activeIndex].variables[i].value = val;
    markChanged();
  }

  function deleteRow(i) {
    files[activeIndex].variables.splice(i, 1);
    markChanged();
    renderTable();
  }

  function addRow() {
    files[activeIndex].variables.push({ key: 'NEW_KEY', value: '', isSecret: false });
    markChanged();
    renderTable();
    const inputs = document.querySelectorAll('.val-input, .key-cell span');
    const lastRow = document.querySelector('#tbody tr:last-child');
    if (lastRow) { lastRow.scrollIntoView({ behavior: 'smooth' }); }
  }

  function markChanged() {
    changed = true;
    document.getElementById('unsavedDot').classList.add('visible');
  }

  function saveFile() {
    const f = files[activeIndex];
    vscode.postMessage({ command: 'save', filePath: f.filePath, fileName: f.fileName, variables: f.variables });
    changed = false;
    document.getElementById('unsavedDot').classList.remove('visible');
  }

  function refresh() {
    vscode.postMessage({ command: 'refresh' });
  }

  function filterVars(q) { renderTable(); }

  function setFilter(mode, btn) {
    filterMode = mode;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    renderTable();
  }

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function updateKey(i, key) {
    files[activeIndex].variables[i].key = key;
    files[activeIndex].variables[i].isSecret = isSecretKey(key);
    markChanged();
  }

   function isSecretKey(key) {
    return /secret|password|passwd|token|api_key|apikey|private|auth|credential/i.test(key);
   }

  init();
</script>
</body></html>`;
  }

  public dispose() {
    EnvPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach((d) => d.dispose());
  }
}
