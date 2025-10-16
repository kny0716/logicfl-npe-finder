import * as cp from "child_process";
import * as path from "path";
import * as vscode from "vscode";
import { LogicFLItem } from "./models/logicFLItem";
import * as fs from "fs";

export function runTest(
  testItem: LogicFLItem,
  context: vscode.ExtensionContext,
  workspacePath: string,
  configJson: any
): Promise<string> {
  return new Promise((resolve, reject) => {
    const extensionPath = context.extensionPath;
    const baseDir = workspacePath;

    const settings = vscode.workspace.getConfiguration("logicfl");
    let userClassPaths = settings.get<string[]>("classPaths");

    if (!userClassPaths || userClassPaths.length === 0) {
      console.log("userclasspath is empty");
      const isMaven = fs.existsSync(path.join(workspacePath, "pom.xml"));
      const isGradle = fs.existsSync(path.join(workspacePath, "build.gradle"));

      if (isMaven) {
        console.log("Maven project detected. Using default Maven class paths.");
        userClassPaths = ["target/classes", "target/test-classes"];
      } else if (isGradle) {
        console.log(
          "Gradle project detected. Using default Gradle class paths."
        );
        userClassPaths = [
          "build/classes/java/main",
          "build/classes/java/test",
          "build/libs/*",
        ];
      } else {
        console.log(
          "Simple project detected. Using workspace root as class path."
        );
        userClassPaths = ["."];
      }
    }

    const jarPath = [
      ...userClassPaths.map((p) => path.join(baseDir, p)),
      path.join(extensionPath, "logic-fl", "build", "classes", "java", "main"),
      path.join(extensionPath, "logic-fl", "build", "libs", "*"),
    ].join(path.delimiter);

    const fqcn = testItem.id!.split("@").pop()?.split("#")[0] ?? "UnknownTest";
    const classNameTag = fqcn.split(".").pop()?.replace(/Test$/i, "") ?? fqcn;

    const configFilePath = path.join(
      extensionPath,
      "resources",
      `config.${classNameTag}.properties`
    );

    const junitVersion = settings.get("junitVersion", "junit5");
    const junitRunner =
      junitVersion === "junit5"
        ? "logicfl.coverage.JUnit5TestRunner"
        : "logicfl.coverage.JUnit4TestRunner";
    const javaArgs = ["-cp", jarPath, junitRunner, configJson];

    const child = cp.spawn("java", javaArgs, {
      cwd: extensionPath,
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
          `테스트 정보 가져오기 실패, Class Paths를 다시 한번 확인해주세요. ${jarPath}`
        );
      }
    });
  });
}
