import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { generateConfigurationArgs } from "./generateConfiguration";
import { runAnalyzer } from "./runAnalyzer";
import { highlightLines } from "./highlightResult";
import { showWebview } from "./showWebview";
import { generateTestInfo } from "./generateTestInfo";
import { runTest } from "./runTest";
import { LogicFLTreeViewProvider } from "./views/logicFLTreeView";
import { LogicFLItem } from "./models/logicFLItem";
import { console } from "inspector";

async function getResult(
  testItem: LogicFLItem,
  context: vscode.ExtensionContext
): Promise<{ cause: number; result: number }[] | undefined> {
  const fqcn = testItem.id!.split("@").pop()?.split("#")[0] ?? "UnknownTest";
  let className = fqcn.split(".").pop() ?? fqcn;
  className = className.replace(/Test$/i, "");

  const outputDir = path.join(context.extensionPath, "result", className);
  const filePath = path.join(outputDir, "root_cause.txt");
  try {
    const content = await fs.readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "");
    const results: { cause: number; result: number }[] = [];
    let currentResultLine: number | null = null;
    for (const line of lines) {
      if (line.includes("NPE at line")) {
        const match = line.match(/line\(\S+,\s*(\d+)\)/);
        if (match) {
          currentResultLine = parseInt(match[1], 10);
        }
      } else if (line.includes("can be caused by")) {
        continue;
      } else if (currentResultLine !== null) {
        const match = line.match(/line\(\S+,\s*(\d+)\)/);
        if (match) {
          const causeLine = parseInt(match[1], 10);
          results.push({ cause: causeLine, result: currentResultLine });
        }
      }
    }
    return results;
  } catch (err) {
    console.error(`Error reading file ${filePath}:`, err);
    return undefined;
  }
}

async function openJavaFile(
  testItem: LogicFLItem
): Promise<vscode.TextDocument | undefined> {
  const fqcn = testItem.id!.split("@").pop()?.split("#")[0] ?? "UnknownTest";
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
  const controller = vscode.tests.createTestController(
    "logicfl",
    "LogicFL Tests"
  );
  context.subscriptions.push(controller);

  const logicFLTreeViewProvider = new LogicFLTreeViewProvider();
  vscode.window.registerTreeDataProvider(
    "logicfl.treeView",
    logicFLTreeViewProvider
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("logicfl.treeView.refresh", () => {
      logicFLTreeViewProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "logicfl.addTest",
      (testItem: vscode.TestItem) => {
        if (testItem.children.size === 0 && testItem.canResolveChildren) {
          vscode.window.showWarningMessage(
            "이 항목은 아직 Test Explorer에서 확장되지 않았습니다.\n트리를 한 번 펼쳐서 테스트 메서드들을 로딩해주세요."
          );
          return;
        }
        vscode.window.showInformationMessage(
          `LogicFL View에 테스트를 추가했습니다.`
        );
        logicFLTreeViewProvider.addItem(testItem);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "logicfl.removeTest",
      (item: LogicFLItem) => {
        logicFLTreeViewProvider.removeItem(item);
      }
    )
  );

  const disposable = vscode.commands.registerCommand(
    "logicfl.startAnalysis",
    async (testItem: LogicFLItem) => {
      if (!testItem) {
        vscode.window.showErrorMessage("No test item selected");
        return;
      }

      try {
        console.log("테스트 아이템:", testItem);
        testItem.setLoading(true);
        logicFLTreeViewProvider.refresh();

        generateTestInfo(testItem, context);

        const configObj = generateConfigurationArgs(
          testItem,
          vscode.workspace.workspaceFolders?.[0].uri.fsPath!,
          context
        );

        const configJson = JSON.stringify(configObj);
        // generateConfigurationArgs(
        //   testItem,
        //   vscode.workspace.workspaceFolders?.[0].uri.fsPath!,
        //   context
        // );
        runTest(
          testItem,
          context,
          vscode.workspace.workspaceFolders?.[0].uri.fsPath!,
          configJson
        )
          .then(async (result) => {
            console.log("테스트 결과:\n", result);
            const lines = result.split("\n").map((line) => line.trim());

            const failureLine = lines.find((line) =>
              line.startsWith("Tests failed")
            );
            const failureCount = failureLine
              ? parseInt(failureLine.split("-")[1].trim())
              : 0;

            const hasNPE = lines.some((line) =>
              line.includes("NullPointerException")
            );
            if (failureCount === 0) {
              vscode.window.showInformationMessage("성공한 테스트입니다.");
              testItem.setLoading(false);
              logicFLTreeViewProvider.refresh();
              return;
            } else {
              if (!hasNPE) {
                vscode.window.showInformationMessage(
                  "NullPointerException이 발생하지 않았습니다."
                );
                testItem.setLoading(false);
                logicFLTreeViewProvider.refresh();
                return;
              }
            }

            await runAnalyzer(testItem, context, "CoverageAnalyzer");
            await runAnalyzer(testItem, context, "StaticAnalyzer");
            await runAnalyzer(testItem, context, "DynamicAnalyzer");
            // await runAnalyzer(testItem, context, "FaultLocalizer");

            testItem.setLoading(false);
            logicFLTreeViewProvider.refresh();

            try {
              const faultLocalizationResults = await getResult(
                testItem,
                context
              );
              if (
                !faultLocalizationResults ||
                faultLocalizationResults.length === 0
              ) {
                console.error("Failed to get results");
                return;
              }
              const allLinesToHighlight = faultLocalizationResults.flatMap(
                (pair) => [pair.cause, pair.result]
              );
              const uniqueLines = Array.from(new Set(allLinesToHighlight)).sort(
                (a, b) => a - b
              );

              const document = await openJavaFile(testItem);
              if (document) {
                highlightLines(uniqueLines);
                showWebview(
                  context,
                  faultLocalizationResults,
                  revealLineInEditor
                );
              }
            } catch (error) {
              console.log("Error in getResult: " + error);
            }
          })
          .catch((err) => {
            console.error("테스트 실행 실패:\n", err);
          });
      } catch (error) {
        console.log("Error in analyzeTestInfo: " + error);
      }
    }
  );
  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
