import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { LogicFLItem } from "./models/logicFLItem";

interface HighlightTarget {
  id: string;
  line: number;
}

const decorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: "rgba(208, 243, 10, 0.3)",
  borderRadius: "5px",
});

function computeLineOffsets(text: string): number[] {
  const lines = text.split("\n");
  const offsets: number[] = [];
  let current = 0;
  for (const line of lines) {
    offsets.push(current);
    current += line.length + 1;
  }
  return offsets;
}

export async function highlightNulls(
  testItem: LogicFLItem,
  context: vscode.ExtensionContext
) {
  const extensionPath = context.extensionPath;
  const fqcn = testItem.id!.split("@").pop()?.split("#")[0] ?? "UnknownTest";
  const classNameTag = fqcn.split(".").pop()?.replace(/Test$/i, "") ?? fqcn;

  const parts = fqcn.split(".");
  const testName = parts.pop()!;
  const ClassName = testName.replace(/test/i, "");

  const rootCausePath = path.join(
    extensionPath,
    "result",
    classNameTag,
    "root_cause.txt"
  );
  const codeFactsPath = path.join(
    extensionPath,
    "result",
    classNameTag,
    "code.facts.pl"
  );

  if (!fs.existsSync(rootCausePath) || !fs.existsSync(codeFactsPath)) {
    vscode.window.showErrorMessage(
      "root_cause.txt 또는 code.facts.pl을 찾을 수 없습니다."
    );
    return;
  }

  const rootCauseContent = fs.readFileSync(rootCausePath, "utf-8");
  const highlightTargets: HighlightTarget[] = [];

  const rcRegex = /([a-zA-Z0-9_]+)\[.*?\]\s*-\s*line\(([^,]+),\s*(\d+)\)/g;
  let match;
  while ((match = rcRegex.exec(rootCauseContent)) !== null) {
    const id = match[1];
    const line = parseInt(match[3]);
    highlightTargets.push({ id, line });
  }

  const codeFactsContent = fs.readFileSync(codeFactsPath, "utf-8");
  const decorations: vscode.DecorationOptions[] = [];

  const settings = vscode.workspace.getConfiguration("logicfl");
  const sourcePath = settings.get<string>("sourcePath", "src/main/java");
  const sourcePathParts = sourcePath.split(/[/\\]/);

  const filePath = path.join(
    vscode.workspace.workspaceFolders?.[0].uri.fsPath!,
    ...sourcePathParts,
    ...parts,
    ClassName + ".java"
  );

  const javaContent = fs.readFileSync(filePath, "utf-8");
  const lineOffsets = computeLineOffsets(javaContent);

  for (const target of highlightTargets) {
    const factRegex = new RegExp(
      `${target.id}.*?range\\([^,]+,\\s*(\\d+),\\s*(\\d+),\\s*${target.line},\\s*${target.line}\\)`,
      "g"
    );
    let factMatch;
    while ((factMatch = factRegex.exec(codeFactsContent)) !== null) {
      const startOffset = parseInt(factMatch[1]);
      const length = parseInt(factMatch[2]);

      const lineStartOffset = lineOffsets[target.line - 1];
      const startCol = startOffset - lineStartOffset;
      const endCol = startCol + length;

      const range = new vscode.Range(
        new vscode.Position(target.line - 1, startCol),
        new vscode.Position(target.line - 1, endCol)
      );
      decorations.push({ range });
    }

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.setDecorations(decorationType, decorations);
    }
  }
}
