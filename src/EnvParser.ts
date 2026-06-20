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

interface EnvLine {
  type: "comment" | "blank" | "variable";
  content: string;
  key?: string;
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

function parseEnvLine(line: string): EnvLine | null {
  const trimmed = line.trim();

  if (!trimmed) {
    return { type: "blank", content: line };
  }

  if (trimmed.startsWith("#")) {
    return { type: "comment", content: line };
  }

  const eqIndex = trimmed.indexOf("=");
  if (eqIndex === -1) {
    return null;
  }

  const key = trimmed.substring(0, eqIndex).trim();
  return { type: "variable", content: line, key };
}

function removeInlineComment(value: string): string {
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    // Handle quotes
    if ((char === '"' || char === "'") && value[i - 1] !== "\\") {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
      }
    }

    // If we find # outside quotes, remove from here to end
    if (char === "#" && !inQuotes) {
      return value.substring(0, i).trim();
    }
  }

  return value.trim();
}

export function parseEnvFile(filePath: string): EnvVariable[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const variables: EnvVariable[] = [];

  for (const line of content.split("\n")) {
    const envLine = parseEnvLine(line);
    if (!envLine || envLine.type !== "variable") {
      continue;
    }

    const trimmed = line.trim();
    const eqIndex = trimmed.indexOf("=");
    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    // Remove inline comments (but not if inside quotes)
    value = removeInlineComment(value);

    // Remove surrounding quotes
    value = value.replace(/^["']|["']$/g, "");

    variables.push({ key, value, isSecret: isSecret(key) });
  }

  return variables;
}

function extractInlineComment(value: string): { cleanValue: string; comment: string } {
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if ((char === '"' || char === "'") && value[i - 1] !== "\\") {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
      }
    }

    if (char === "#" && !inQuotes) {
      return {
        cleanValue: value.substring(0, i).trim(),
        comment: value.substring(i),
      };
    }
  }

  return { cleanValue: value.trim(), comment: "" };
}

export function writeEnvFile(filePath: string, variables: EnvVariable[]): void {
  let content = "";
  let fileExists = false;
  let originalLines: string[] = [];

  try {
    if (fs.existsSync(filePath)) {
      fileExists = true;
      content = fs.readFileSync(filePath, "utf-8");
      originalLines = content.split("\n");
    }
  } catch (e) {
    // File doesn't exist, will create new one
  }

  if (!fileExists) {
    // Create new file with just the variables
    const lines = variables.map((v) => {
      let val = v.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      if (v.value.includes(" ") || v.value.includes("=")) {
        val = `"${val}"`;
      }
      return `${v.key}=${val}`;
    });
    fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
    return;
  }

  // Preserve original file structure and inline comments
  const variableMap = new Map(variables.map((v) => [v.key, v]));
  const processedKeys = new Set<string>();
  const result: string[] = [];

  for (const line of originalLines) {
    const envLine = parseEnvLine(line);

    if (!envLine) {
      // Keep lines that couldn't be parsed as-is
      result.push(line);
      continue;
    }

    if (envLine.type === "comment" || envLine.type === "blank") {
      // Preserve comments and blank lines
      result.push(line);
      continue;
    }

    if (envLine.type === "variable" && envLine.key) {
      processedKeys.add(envLine.key);
      const variable = variableMap.get(envLine.key);
      if (variable) {
        // Extract inline comment from original line
        const trimmed = line.trim();
        const eqIndex = trimmed.indexOf("=");
        const originalValue = trimmed.substring(eqIndex + 1);
        const { comment } = extractInlineComment(originalValue);

        // Format new value
        let val = variable.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        if (variable.value.includes(" ") || variable.value.includes("=")) {
          val = `"${val}"`;
        }

        // Rebuild line with new value and preserved comment
        const newLine = `${variable.key}=${val}${comment ? " " + comment : ""}`;
        result.push(newLine);
      }
    }
  }

  // Add new variables that weren't in the original file
  for (const variable of variables) {
    if (!processedKeys.has(variable.key)) {
      let val = variable.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      if (variable.value.includes(" ") || variable.value.includes("=")) {
        val = `"${val}"`;
      }
      result.push(`${variable.key}=${val}`);
    }
  }

  fs.writeFileSync(filePath, result.join("\n") + "\n", "utf-8");
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
