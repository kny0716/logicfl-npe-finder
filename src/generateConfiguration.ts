import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { runAnalyzer } from "./runAnalyzer";
import { LogicFLItem } from "./models/logicFLItem";

export function generateConfigurationArgs(
  testItem: LogicFLItem,
  workspacePath: string,
  context: vscode.ExtensionContext
): void {
  const fqcn = testItem.id!.split("@").pop()?.split("#")[0] ?? "UnknownTest";
  const classNameTag = fqcn.split(".").pop() ?? fqcn;
  let className = fqcn.split(".").pop() ?? fqcn;
  className = className.replace(/Test$/i, "");

  const settings = vscode.workspace.getConfiguration("logicfl");

  const baseDir = workspacePath;
  const extensionPath = context.extensionPath;
  const classPathStr = [
    path.join(baseDir, "build", "classes", "java", "main"),
    path.join(baseDir, "build", "classes", "java", "test"),
    path.join(baseDir, "build", "libs", "*"),
    path.join(extensionPath, "logic-fl", "build", "classes", "java", "main"),
    path.join(extensionPath, "logic-fl", "build", "libs", "*"),
  ].join(path.delimiter);

  const jvmPath = process.platform === "win32" ? "java" : "/usr/bin/java";

  const outputDir = path.join(extensionPath, "result", className);
  if (outputDir) {
    try {
      fs.mkdirSync(outputDir, { recursive: true });
    } catch (err) {
      console.error("디렉토리 생성 실패:", err);
    }
  }
  // fs.mkdirSync(outputDir, { recursive: true });
  const jacocoPath = path.join(extensionPath, "resources", "jacocoagent.jar");
  const rulesPath = path.join(extensionPath, "resources", "npe-rules.pl");

  const testsInfo = path.join(outputDir, `tests.${classNameTag}.json`);
  const coverageInfo = path.join(outputDir, `coverage.${classNameTag}.json`);

  const jacocoExecPath = path.join(outputDir, "jacoco.exec");
  const npeInfoPath = path.join(outputDir, `npe.traces.${classNameTag}.json`);
  const factsPath = path.join(outputDir, "logic-fl.pl");
  const codeFactsPath = path.join(outputDir, "code.facts.pl");
  const rootCausePath = path.join(outputDir, "root_cause.txt");
  const faultLocPath = path.join(outputDir, "fault_locs.txt");
  const lineInfoPath = path.join(outputDir, "line.info.json");
  const monitorTargetPath = path.join(outputDir, "monitor.targets.json");
  const execTimePath = path.join(outputDir, "exec.time.json");

  const fixSlashes = (str: string) => str.replace(/\\/g, "/");

  const props = [
    `base.dir=${fixSlashes(baseDir)}`,
    `source.path=src/main/java`,
    `class.path=${fixSlashes(classPathStr)}`,
    `jvm=${fixSlashes(jvmPath)}`,
    `jacoco.path=${fixSlashes(jacocoPath)}`,
    `rules.pl=${fixSlashes(rulesPath)}`,
    `coverage.info=${fixSlashes(coverageInfo)}`,
    `tests.info=${fixSlashes(testsInfo)}`,
    `junit.version=${settings.get("junitVersion", "junit5")}`,
    `target.prefix=${settings.get("targetPrefix", "sample")}`,
    `monitor.target=${settings.get("monitorTarget", "coverage")}`,
    `monitor.value=${settings.get("monitorValue", "null_only")}`,
    `monitor.method=${settings.get("monitorMethod", "all_visible")}`,
    `covered.only=${settings.get("coveredOnly", true)}`,
    `print.debug.info=${settings.get("debugInfo", true)}`,
    `output.dir=${fixSlashes(outputDir)}`,
    `jacoco.exec=${fixSlashes(jacocoExecPath)}`,
    `npe.info.path=${fixSlashes(npeInfoPath)}`,
    `facts.pl=${fixSlashes(factsPath)}`,
    `code.facts.pl=${fixSlashes(codeFactsPath)}`,
    `root.cause=${fixSlashes(rootCausePath)}`,
    `fault.loc=${fixSlashes(faultLocPath)}`,
    `line.info=${fixSlashes(lineInfoPath)}`,
    `monitor.target.path=${fixSlashes(monitorTargetPath)}`,
    `exec.time.path=${fixSlashes(execTimePath)}`,
  ];
  const normalizedProps =
    props
      .map((line) => line.replace(/\r/g, "").replace(/\n/g, "").trim())
      .join("\n") + "\n";
  if (normalizedProps.includes("\r")) {
    console.log("Warning");
  }
  fs.writeFileSync(
    path.join(extensionPath, "resources", `config.${className}.properties`),
    normalizedProps,
    { encoding: "utf-8", flag: "w" }
  );
  if (!fs.existsSync(testsInfo)) {
    console.log("tests.json 파일이 존재하지 않음.");
  }
}
