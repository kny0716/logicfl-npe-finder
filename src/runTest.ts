import * as cp from "child_process";
import * as path from "path";
import * as vscode from "vscode";
import { LogicFLItem } from "./models/logicFLItem";

export function runTest(
  testItem: LogicFLItem,
  context: vscode.ExtensionContext,
  workspacePath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const extensionPath = context.extensionPath;
    const baseDir = workspacePath;

    const jarPath = [
      path.join(baseDir, "build", "classes", "java", "main"),
      path.join(baseDir, "build", "classes", "java", "test"),
      path.join(baseDir, "build", "libs", "*"),
      path.join(extensionPath, "logic-fl", "build", "classes", "java", "main"),
      path.join(extensionPath, "logic-fl", "build", "libs", "*"),
    ].join(path.delimiter);
    // junit5-test-runner.java 가 있는 곳이랑 test resources 가 있는 곳이 다름

    const fqcn = testItem.id!.split("@").pop()?.split("#")[0] ?? "UnknownTest";
    const classNameTag = fqcn.split(".").pop()?.replace(/Test$/i, "") ?? fqcn;

    const configFilePath = path.join(
      extensionPath,
      "resources",
      `config.${classNameTag}.properties`
    );

    const settings = vscode.workspace.getConfiguration("logicfl");
    const junitVersion = settings.get("junitVersion", "junit5");
    const junitRunner =
      junitVersion === "junit5"
        ? "logicfl.coverage.JUnit5TestRunner"
        : "logicfl.coverage.JUnit4TestRunner";
    const javaArgs = ["-cp", jarPath, junitRunner, configFilePath];

    const child = cp.spawn("java", javaArgs, {
      cwd: extensionPath,
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => (stdout += data.toString()));
    child.stderr.on("data", (data) => (stderr += data.toString()));
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(
          `실행 실패 (code ${code}):  [stdout] ${stdout} [stderr] ${stderr}`
        );
      }
    });
  });
}
