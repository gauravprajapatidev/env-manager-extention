import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export interface EnvVariable {
  key: string;
  value: string;
  isSecret: boolean;
}

export interface EnvFile {
  fileName: string;
  filePath: string;
  variables: EnvVariable[];
}

const SECRET_PATTERNS = [
  /secret/i,
  /password/i,
  /passwd/i,
  /token/i,
  /api_key/i,
  /apikey/i,
  /private/i,
  /auth/i,
  /credential/i,
];

function isSecret(key: string): boolean {
  return SECRET_PATTERNS.some((p) => p.test(key));
}

export function parseEnvFile(filePath: string): EnvVariable[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const variables: EnvVariable[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.substring(0, eqIndex).trim();
    const value = trimmed
      .substring(eqIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    variables.push({ key, value, isSecret: isSecret(key) });
  }

  return variables;
}

export function writeEnvFile(filePath: string, variables: EnvVariable[]): void {
  const lines = variables.map((v) => {
    const val = v.value.includes(" ") ? `"${v.value}"` : v.value;
    return `${v.key}=${val}`;
  });
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
}

export function findEnvFiles(): EnvFile[] {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return [];
  }

  const results: EnvFile[] = [];

  for (const folder of workspaceFolders) {
    const folderPath = folder.uri.fsPath;
    const files = fs
      .readdirSync(folderPath)
      .filter((f) => f.startsWith(".env") && !f.endsWith(".example"));

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      try {
        results.push({
          fileName: file,
          filePath,
          variables: parseEnvFile(filePath),
        });
      } catch (e) {
        console.error(`Failed to parse ${file}:`, e);
      }
    }
  }

  return results;
}
