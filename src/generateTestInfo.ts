import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { LogicFLItem } from "./models/logicFLItem";

export function generateTestInfo(
  testItem: LogicFLItem,
  context: vscode.ExtensionContext
): void {
  const fqcn = testItem.id!.split("@").pop()?.split("#")[0] ?? "UnknownTest";
  const testName =
    testItem.id!.split("@").pop()?.split("#")[1] ?? "UnknownTest";
  const classNameTag = fqcn.split(".").pop() ?? fqcn;
  let className = fqcn.split(".").pop() ?? fqcn;
  className = className.replace(/Test$/i, "");

  const testResults: {
    "passed.classes": string[];
    "failed.classes": string[];
    "failed.tests": Array<{ class: string; name: string }>;
  } = { "passed.classes": [], "failed.classes": [], "failed.tests": [] };

  testResults["failed.classes"].push(fqcn);
  testResults["failed.tests"].push({
    class: fqcn,
    name: testName.replace(/\(\)$/, ""),
  });

  const outputPath = path.join(context.extensionPath, "result", className);
  if (outputPath) {
    try {
      fs.mkdirSync(outputPath, { recursive: true });
    } catch (err) {
      console.error("디렉토리 생성 실패:", err);
    }
  }

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
