import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { generateConfig } from "./generateConfig";
import { runAnalyzer } from "./runAnalyzer";
import { highlightNulls } from "./highlightResult";
import { generateTestInfo } from "./generateTestInfo";
import { runTest } from "./runTest";
import { LogicFLTreeViewProvider } from "./views/logicFLTreeView";
import { LogicFLItem } from "./models/logicFLItem";
import { console } from "inspector";
import { showPropagationGraph } from "./showPropagationGraph";

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

  const settings = vscode.workspace.getConfiguration("logicfl");
  const sourcePath = settings.get<string>("sourcePath", "src/main/java");
  const sourcePathParts = sourcePath.split(/[/\\]/);

  const filePath = path.join(
    vscode.workspace.workspaceFolders?.[0].uri.fsPath!,
    ...sourcePathParts,
    ...parts,
    ClassName + ".java"
  );

  if (fs.existsSync(filePath)) {
    const document = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(document);
    return document;
  } else {
    vscode.window.showErrorMessage(`파일을 찾을 수 없습니다: ${filePath} `);
    return undefined;
  }
}

function checkPrologInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    exec("swipl --version", (error, stdout, stderr) => {
      if (error) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

function checkJdkInstalled(): Promise<boolean> {
  return new Promise((resolve) => {
    const settings = vscode.workspace.getConfiguration("logicfl");
    const userJvmPath = settings.get<string>("jvmPath");

    const jvmPath =
      userJvmPath && userJvmPath.trim() !== ""
        ? userJvmPath
        : process.platform === "win32"
        ? "java"
        : "/usr/bin/java";

    exec(`"${jvmPath}" -version`, (error) => {
      if (error) {
        console.error(`JDK check failed for path: "${jvmPath}"`, error);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}
function checkProjectBuilt(): { isBuilt: boolean; checkedPath: string | null } {
  const settings = vscode.workspace.getConfiguration("logicfl");
  const classPaths = settings.get<string[]>("classPaths", []);

  if (classPaths.length === 0) {
    return { isBuilt: true, checkedPath: null };
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!workspaceRoot) {
    return { isBuilt: false, checkedPath: null };
  }

  const representativePath = classPaths.find((p) => !p.includes("*"));

  if (!representativePath) {
    return { isBuilt: true, checkedPath: null };
  }

  const fullPath = path.join(workspaceRoot, representativePath);

  if (fs.existsSync(fullPath)) {
    return { isBuilt: true, checkedPath: fullPath };
  } else {
    return { isBuilt: false, checkedPath: fullPath };
  }
}

async function checkPrefixCheck(testItem: LogicFLItem): Promise<boolean> {
  const settings = vscode.workspace.getConfiguration("logicfl");
  const targetPrefix = settings.get<string>("targetPrefix");

  if (!targetPrefix || targetPrefix.trim() === "") {
    vscode.window.showErrorMessage(
      "logicfl.targetPrefix 설정이 누락되었습니다. settings.json 파일에서 분석할 소스코드의 패키지 경로를 지정해주세요."
    );
    return false;
  }

  const document = await openJavaFile(testItem);
  if (!document) {
    return false;
  }

  const fileContent = document.getText();
  const packageMatch = fileContent.match(/^\s*package\s+([a-zA-Z0-9_.]+);/m);

  if (!packageMatch || packageMatch.length < 2) {
    vscode.window.showWarningMessage(
      `'${path.basename(
        document.uri.fsPath
      )}' 파일에서 패키지 선언을 찾을 수 없습니다`
    );
    return false;
  } else {
    const actualPackage = packageMatch[1];
    if (actualPackage !== targetPrefix) {
      return false;
    }
  }

  return true;
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

      const isPrologInstalled = await checkPrologInstalled();
      if (!isPrologInstalled) {
        vscode.window
          .showWarningMessage(
            "LogicFL 분석을 위해서는 Prolog가 필요합니다. 설치 후 다시 시도해주세요.",
            "설치 안내 보기"
          )
          .then((selection) => {
            if (selection === "설치 안내 보기") {
              vscode.env.openExternal(
                vscode.Uri.parse("https://www.swi-prolog.org/download/stable")
              );
            }
          });
        return;
      }

      const isJdkInstalled = await checkJdkInstalled();
      if (!isJdkInstalled) {
        vscode.window.showErrorMessage(
          "Java(JDK)를 찾을 수 없습니다. JDK를 설치하거나 VS Code 설정에서 'logicfl.jvmPath'를 올바르게 지정해주세요."
        );
        return;
      }

      const buildCheck = checkProjectBuilt();
      if (!buildCheck.isBuilt) {
        vscode.window.showErrorMessage(
          `프로젝트가 빌드되었는지, logicfl.classPaths 설정이 올바른지 확인하시고 다시 시도해주세요: ${buildCheck.checkedPath}`
        );
        return;
      }

      const isPrefixValid = await checkPrefixCheck(testItem);
      if (!isPrefixValid) {
        vscode.window.showErrorMessage(
          "패키지 경로 설정 오류로 인해 분석을 진행할 수 없습니다. logicfl.targetPrefix 설정을 확인해주세요."
        );
        return;
      }

      try {
        testItem.setLoading(true);
        logicFLTreeViewProvider.refresh();

        generateTestInfo(testItem, context);

        const configObj = generateConfig(
          testItem,
          vscode.workspace.workspaceFolders?.[0].uri.fsPath!,
          context
        );

        const configJson = JSON.stringify(configObj);
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

            const foundLine = lines.find((line) =>
              /^(Tests? (found|executed))/i.test(line)
            );
            const foundCount = foundLine
              ? parseInt(foundLine.split("-")[1].trim())
              : 0;

            const hasNPE = lines.some((line) =>
              line.includes("NullPointerException")
            );
            if (foundCount === 0) {
              vscode.window.showInformationMessage(
                "테스트가 발견되지 않았습니다. classPaths와 Junit Version 설정을 확인해주세요."
              );
              testItem.setOriginalIcon();
              logicFLTreeViewProvider.refresh();
              return;
            } else if (failureCount === 0) {
              vscode.window.showInformationMessage("성공한 테스트입니다.");
              testItem.setOriginalIcon();
              logicFLTreeViewProvider.refresh();
              return;
            } else {
              if (!hasNPE) {
                vscode.window.showInformationMessage(
                  "NullPointerException이 발생하지 않았습니다."
                );
                testItem.setOriginalIcon();
                logicFLTreeViewProvider.refresh();
                return;
              }
            }

            await runAnalyzer(testItem, context, "CoverageAnalyzer");
            await runAnalyzer(testItem, context, "StaticAnalyzer");
            await runAnalyzer(testItem, context, "DynamicAnalyzer");
            await runAnalyzer(testItem, context, "FaultLocalizer");

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

              const document = await openJavaFile(testItem);
              if (document) {
                await highlightNulls(testItem, context);
                showPropagationGraph(testItem, context);
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
