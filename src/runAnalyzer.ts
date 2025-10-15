import * as cp from "child_process";
import * as path from "path";
import * as vscode from "vscode";
import { LogicFLItem } from "./models/logicFLItem";
import { generateConfig } from "./generateConfig";

export function runAnalyzer(
  testItem: LogicFLItem,
  context: vscode.ExtensionContext,
  analyzerName:
    | "CoverageAnalyzer"
    | "StaticAnalyzer"
    | "DynamicAnalyzer"
    | "FaultLocalizer"
) {
  return new Promise<void>((resolve, reject) => {
    const fqcn = testItem.id!.split("@").pop()?.split("#")[0] ?? "UnknownTest";
    let className = fqcn.split(".").pop() ?? fqcn;
    className = className.replace(/Test$/i, "");

    const extensionPath = context.extensionPath;

    const workspacePath =
      vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? "";
    const configObj = generateConfig(testItem, workspacePath, context);

    const configJson = JSON.stringify(configObj);

    const configFilePath = path.join(
      extensionPath,
      "resources",
      `config.${className}.properties`
    );

    const jarPath = path.join(
      extensionPath,
      "logic-fl",
      "build",
      "libs",
      "logicfl-all.jar"
    );

    const isCoverage = analyzerName === "CoverageAnalyzer";
    const packageName = isCoverage
      ? `logicfl.coverage.${analyzerName}`
      : `logicfl.analyzer.${analyzerName}`;

    const javaArgs = ["-cp", jarPath, packageName, "--json", configJson];

    const child = cp.spawn("java", javaArgs, {
      cwd: extensionPath,
      shell: false,
    });

    const outputChannel = vscode.window.createOutputChannel(analyzerName);
    outputChannel.show(true);

    child.stdout.on("data", (data) => {
      outputChannel.append(data.toString());
    });

    child.stderr.on("data", (data) => {
      outputChannel.append(`[stderr] ${data}`);
    });

    child.on("error", (err) => {
      vscode.window.showErrorMessage(
        `${analyzerName} 실행 중 오류: ${err.message}`
      );
      reject(err);
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`${analyzerName} 실행 완료`);
        vscode.window.showInformationMessage(`${analyzerName} 실행 완료`);
        resolve();
        console.log(`${analyzerName} 실행 완료 resolve`);
      } else {
        const msg = `${analyzerName} 비정상 종료 (코드 ${code})`;
        vscode.window.showErrorMessage(msg);
        reject(new Error(msg));
      }
    });
  });
}
