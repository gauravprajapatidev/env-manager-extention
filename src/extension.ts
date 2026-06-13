import * as vscode from "vscode";
import { EnvPanel } from "./EnvPanel";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("env-profile-manager.open", () => {
      EnvPanel.createOrShow(context.extensionUri);
    }),
  );

  // Auto-open when workspace has .env files
  const watcher = vscode.workspace.createFileSystemWatcher("**/.env*");
  watcher.onDidCreate(() => EnvPanel.createOrShow(context.extensionUri));
  context.subscriptions.push(watcher);
}

export function deactivate() {}
