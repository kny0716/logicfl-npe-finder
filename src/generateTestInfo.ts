import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { LogicFLItem } from "./models/logicFLItem";

export function generateTestInfo(
  testItem: LogicFLItem,
  context: vscode.ExtensionContext
): void {
  console.log(testItem.id);
  const fqcn = testItem.id!.split("@").pop()?.split("#")[0] ?? "UnknownTest";
  const testName =
    testItem.id!.split("@").pop()?.split("#")[1] ?? "UnknownTest";
  const classNameTag = fqcn.split(".").pop() ?? fqcn; // 파일 이름 저장하기 위함
  let className = fqcn.split(".").pop() ?? fqcn;
  className = className.replace(/Test$/i, "");

  console.log(fqcn, testName, className, classNameTag);
  // sample.Sample2Test Sample2Test Sample2

  const testResults: {
    "passed.classes": string[];
    "failed.classes": string[];
    "failed.tests": Array<{ class: string; name: string }>;
  } = { "passed.classes": [], "failed.classes": [], "failed.tests": [] };

  testResults["failed.classes"].push(fqcn);
  testResults["failed.tests"].push({
    class: fqcn,
    name: testName.replace(/\(\)$/, ""), // 괄호 제거
  });

  const outputPath = path.join(context.extensionPath, "result", className);
  if (outputPath) {
    try {
      fs.mkdirSync(outputPath, { recursive: true });
    } catch (err) {
      console.error("디렉토리 생성 실패:", err);
    }
  }
  // fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  console.log(path.dirname(outputPath));

  fs.writeFileSync(
    path.join(outputPath, `tests.${classNameTag}.json`),
    JSON.stringify(testResults, null, 2)
  );
  console.log(
    `Writing test results to ${path.join(
      outputPath,
      `tests.${classNameTag}.json`
    )}`
  );
}
