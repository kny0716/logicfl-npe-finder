import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { analyzeTestInfoFromTestItem } from "./logicflTestAnalyzer";
import { generateConfigurationArgs } from "./generateConfiguration";
import { runAnalyzer } from "./runAnalyzer";
import { highlightLines } from "./highlightResult";
import { showWebview } from "./showWebview";

async function getResult(
  testItem: vscode.TestItem,
  context: vscode.ExtensionContext
): Promise<number[] | undefined> {
  const fqcn = testItem.id.split("@").pop()?.split("#")[0] ?? "UnknownTest";
  let className = fqcn.split(".").pop() ?? fqcn;
  className = className.replace(/Test$/i, "");

  const outputDir = path.join(context.extensionPath, "result", className);
  const filePath = path.join(outputDir, "fault_locs.txt");
  try {
    const content = await fs.readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/);
    const lineNumbers: number[] = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const lineNum = parseInt(parts[1], 10);
      if (!isNaN(lineNum)) {
        lineNumbers.push(lineNum);
      }
    }
    console.log(`결과를 찾았습니다: ${lineNumbers}`);
    return lineNumbers.sort((a, b) => a - b);
  } catch (err) {
    console.error(err);
    return undefined;
  }
}

async function openJavaFile(
  testItem: vscode.TestItem
): Promise<vscode.TextDocument | undefined> {
  const fqcn = testItem.id.split("@").pop()?.split("#")[0] ?? "UnknownTest";
  const parts = fqcn.split(".");
  const testName = parts.pop()!;
  const ClassName = testName.replace(/test/i, "");
  const filePath = path.join(
    vscode.workspace.workspaceFolders?.[0].uri.fsPath!,
    "src",
    "main",
    "java",
    ...parts,
    ClassName + ".java"
  );

  if (fs.existsSync(filePath)) {
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
    console.log(`파일을 열었습니다: ${filePath}`);
    return document;
  } else {
    console.log(`파일을 찾을 수 없습니다: ${filePath}`);
    return undefined;
  }
}

function revealLineInEditor(line: number) {
  const editors = vscode.window.visibleTextEditors;
  const editor = editors.find((e) => e.document.languageId === "java");
  if (!editor) {
    return;
  }
  const position = new vscode.Position(line - 1, 0);
  const range = new vscode.Range(position, position);
  editor.revealRange(
    range,
    vscode.TextEditorRevealType.InCenterIfOutsideViewport
  );
  editor.selection = new vscode.Selection(position, position);
}

export async function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "logicfl.startAnalysis",
    async (testItem: vscode.TestItem) => {
      if (!testItem) {
        vscode.window.showErrorMessage("No test item selected");
        return;
      }
      if (testItem.children.size !== 0) {
        vscode.window.showErrorMessage(
          "테스트 클래스 파일에서는 실행이 불가능합니다. 메서드를 선택해주세요."
        );
        return;
      }
      try {
        const isfailedTest = await analyzeTestInfoFromTestItem(
          testItem,
          context
        );
        if (!isfailedTest) {
          return;
        }
        generateConfigurationArgs(
          testItem,
          vscode.workspace.workspaceFolders?.[0].uri.fsPath!,
          context
        );
        await runAnalyzer(testItem, context, "CoverageAnalyzer");
        await runAnalyzer(testItem, context, "StaticAnalyzer");
        await runAnalyzer(testItem, context, "DynamicAnalyzer");
        await runAnalyzer(testItem, context, "FaultLocalizer");

        try {
          const faultLocalizationResults = await getResult(testItem, context);
          if (!faultLocalizationResults) {
            console.error("Failed to get results");
            return;
          }
          const document = await openJavaFile(testItem);
          if (document) {
            highlightLines(faultLocalizationResults);
            showWebview(context, faultLocalizationResults, revealLineInEditor);
          }
        } catch (error) {
          console.log("Error in getResult: " + error);
        }
      } catch (error) {
        console.log("Error in analyzeTestInfo: " + error);
      }
    }
  );
  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
