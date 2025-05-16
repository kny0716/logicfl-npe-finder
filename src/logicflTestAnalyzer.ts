// logicflTestAnalyzer.ts
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import { XMLParser } from "fast-xml-parser";

export async function analyzeTestInfoFromTestItem(
  testItem: vscode.TestItem,
  context: vscode.ExtensionContext
): Promise<boolean> {
  const workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath!;
  const target = extractGradleTestTarget(testItem);
  const fqcn = testItem.id.split("@").pop()?.split("#")[0] ?? "UnknownTest";
  const testName = fqcn.split(".").pop() ?? fqcn;

  const className = testName.replace(/Test$/i, "");
  const outputDir = path.join(context.extensionPath, "result", className);
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    await runGradleTestOnly(workspacePath, target);

    const resultDir = path.join(workspacePath, "build", "test-results", "test");

    await parseJUnitResultsAndWriteTestInfo(resultDir, outputDir);

    const resultFile = path.join(outputDir, `tests.${testName}.json`);
    const resultJson = JSON.parse(fs.readFileSync(resultFile, "utf-8"));

    if (
      resultJson["failed.classes"].length === 0 &&
      resultJson["failed.tests"].length === 0
    ) {
      console.log("실패한 테스트가 없습니다.");
      vscode.window.showWarningMessage("실패한 테스트가 없습니다.");
      return false;
    }

    vscode.window.showInformationMessage("tests.json 생성 완료!");
    console.log("tests.json 생성 완료");
    return true;
  } catch (err: any) {
    vscode.window.showErrorMessage("테스트 분석 실패: " + err.message);
    console.error("테스트 분석 실패:", err.message);
    return false;
  }
}

function extractGradleTestTarget(testItem: vscode.TestItem): string {
  const className = testItem.id.split("@").pop()?.split("#")[0] ?? "";
  const methodName = testItem.id.includes("#")
    ? testItem.id.split("#")[1].replace(/\(\)$/, "")
    : undefined;

  return methodName ? `${className}.${methodName}` : className;
}

async function runGradleTestOnly(
  workspacePath: string,
  target: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const gradleCmd =
      process.platform === "win32" ? "gradlew.bat" : "./gradlew";
    const args = ["test", "--tests", target];

    const proc = cp.spawn(gradleCmd, args, {
      cwd: workspacePath,
      shell: true,
    });

    proc.stdout.on("data", (data) => console.log("[gradle]", data.toString()));
    proc.stderr.on("data", (data) =>
      console.error("[gradle:err]", data.toString())
    );

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error("Gradle test failed with code: " + code));
      }
    });
  });
}

async function parseJUnitResultsAndWriteTestInfo(
  resultDir: string,
  outputPath: string
) {
  const testResults: {
    "passed.classes": string[];
    "failed.classes": string[];
    "failed.tests": Array<{ class: string; name: string; message: string }>;
  } = { "passed.classes": [], "failed.classes": [], "failed.tests": [] };
  let classNameTag: string | undefined = undefined;

  fs.readdirSync(resultDir).forEach((file) => {
    if (file.endsWith(".xml")) {
      const xml = fs.readFileSync(path.join(resultDir, file), "utf-8");
      const parser = new XMLParser({ ignoreAttributes: false });
      const jsonObj = parser.parse(xml);

      if (jsonObj.testsuite && jsonObj.testsuite.testcase) {
        const testCases = jsonObj.testsuite.testcase;
        const systemOut = jsonObj.testsuite["system-out"];

        for (const testCase of Array.isArray(testCases)
          ? testCases
          : [testCases]) {
          const testName = testCase["@_name"].replace(/\(\)$/, "");
          const className = testCase["@_classname"];
          classNameTag = className.split(".").pop() ?? className;
          const failure = testCase.failure;
          const error = testCase.error;

          if (testName && className) {
            // 실패 또는 오류 태그가 존재할 경우
            if (failure || error) {
              testResults["failed.classes"].push(className);
              testResults["failed.tests"].push({
                class: className,
                name: testName,
                message:
                  (failure && failure["@_message"]) ||
                  (error && error["@_message"]) ||
                  "Unknown Failure/Error",
              });
            }
            // 실패/오류 태그는 없지만 system-out 로그에 에러 메시지가 포함된 경우
            else if (
              typeof systemOut === "string" &&
              systemOut.toLowerCase().includes("error")
            ) {
              testResults["failed.classes"].push(className);
              testResults["failed.tests"].push({
                class: className,
                name: testName,
                message: systemOut.trim(),
              });
            }
            // 성공한 경우
            else {
              testResults["passed.classes"].push(className);
            }
          }
        }
      }
    }
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  console.log(
    `Writing test results to ${path.join(
      outputPath,
      `tests.${classNameTag}.json`
    )}`
  );
  fs.writeFileSync(
    path.join(outputPath, `tests.${classNameTag}.json`),
    JSON.stringify(testResults, null, 2)
  );
}
