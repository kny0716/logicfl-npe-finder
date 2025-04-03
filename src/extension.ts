import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as cp from "child_process";
import { XMLParser } from "fast-xml-parser";
import { PrologFactsHandler } from "./ast-to-facts.js";

const decorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: "rgba(208, 243, 10, 0.3)",
  borderRadius: "5px",
});

function getResult(): string | undefined {
  const outputDir = path.join(__dirname, "..", "output");
  const filePath = path.join(outputDir, "result.txt");
  try {
    const faultLocalizationResults = fs.readFileSync(filePath, "utf-8");
    return faultLocalizationResults;
  } catch (err) {
    console.error(err);
  }
}

function highlightLines(lineNumbers: number[]) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const decorations: vscode.DecorationOptions[] = [];

  lineNumbers.forEach((lineNumber) => {
    const line = editor.document.lineAt(lineNumber - 1);
    const start = line.text.search(/\S/);
    if (start === -1) {
      return;
    }
    const startpos = new vscode.Position(lineNumber - 1, start);
    const range = new vscode.Range(startpos, line.range.end);
    const decoration = {
      range: range,
      hoverMessage: "NPE 발생의 원인으로 추정됨",
    };
    decorations.push(decoration);
  });
  editor.setDecorations(decorationType, decorations);
}

// 웹 패널
function getWebviewContent(lineNumbers: number[]): string {
  const listItems = lineNumbers
    .map(
      (line) =>
        `<li><a href="#" onclick="jumpToLine(${line})"> Line ${line}</a></li>`
    )
    .join("");

  return `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>My Panel</title>
  </head>
  <body>
      <h1>npe 발생 원인으로 추정되는 라인</h1>
      <ul>${listItems}</ul>
      <script>
          const vscode = acquireVsCodeApi();
          function jumpToLine(line) {
              vscode.postMessage({
                  command: 'jumpToLine',
                  line: line
              });
          }
      </script>
  </body>
  </html>`;
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
  editor.selection = new vscode.Selection(position, position); // 선택(커서 이동)
}

async function getAST(): Promise<any> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const document = editor.document;
  const text = document.getText();
  try {
    const { parse } = await import("java-parser");
    const ast = parse(text);
    return ast;
  } catch (err) {
    console.error(err);
  }
}

function getFacts(ast: any) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const handler = new PrologFactsHandler();
  handler
    .processAST(ast, editor.document.getText())
    .then((facts) => {
      fs.writeFileSync(path.join(__dirname, "..", "output", "facts.pl"), facts);
    })
    .catch((err) => {
      console.error(err);
    });
}
// maven 프로젝트 생성, 코드 복사, 빌드, 테스트 실행
function runTest(context: vscode.ExtensionContext) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  // Maven 프로젝트를 생성할 디렉토리 결정
  const mavenProjectPath = context.globalStorageUri.fsPath;
  if (!fs.existsSync(mavenProjectPath)) {
    fs.mkdirSync(mavenProjectPath, { recursive: true });
  }

  // 기본 Maven 프로젝트 파일 준비 (pom.xml)
  const pomPath = path.join(mavenProjectPath, "pom.xml");
  if (!fs.existsSync(pomPath)) {
    const pomContent = `
<project xmlns="http://maven.apache.org/POM/4.0.0" 
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
         http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.example</groupId>
    <artifactId>test-project</artifactId>
    <version>1.0-SNAPSHOT</version>
    <dependencies>
        <!-- JUnit 5 의존성 -->
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>5.8.2</version>
            <scope>test</scope>
        </dependency>
    </dependencies>
    <build>
        <plugins>
            <!-- Maven Surefire Plugin: 테스트 실행 -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>3.0.0-M5</version>
            </plugin>
            <!-- JaCoCo Maven Plugin: 코드 커버리지 -->
            <plugin>
                <groupId>org.jacoco</groupId>
                <artifactId>jacoco-maven-plugin</artifactId>
                <version>0.8.8</version>
                <executions>
                    <execution>
                        <id>prepare-agent</id>
                        <goals>
                            <goal>prepare-agent</goal>
                        </goals>
                    </execution>
                    <execution>
                        <id>report</id>
                        <phase>test</phase>
                        <goals>
                            <goal>report</goal>
                        </goals>
                    </execution>
                </executions>
            </plugin>
        </plugins>
    </build>
    <properties>
        <maven.compiler.source>1.8</maven.compiler.source>
        <maven.compiler.target>1.8</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>
</project>
            `;
    fs.writeFileSync(pomPath, pomContent);
  }

  // src/main/java 와 src/test/java 폴더 생성
  const srcMainDir = path.join(mavenProjectPath, "src", "main", "java");
  const srcTestDir = path.join(mavenProjectPath, "src", "test", "java");
  [srcMainDir, srcTestDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // 현재 열려있는 자바 파일을 src/main/java에 복사
  const sourceFilePath = editor.document.fileName;
  const fileName = path.basename(sourceFilePath);
  const targetFilePath = path.join(srcMainDir, fileName);
  fs.copyFile(sourceFilePath, targetFilePath, (err) => {
    if (err) {
      vscode.window.showErrorMessage("파일 복사 실패: " + err.message);
      return;
    }
    vscode.window.showInformationMessage(
      `자바 파일이 Maven 프로젝트로 복사됨: ${targetFilePath}`
    );
  });

  // 테스트 클래스 생성 (npe가 발생하는지)
  const testClassPath = path.join(
    mavenProjectPath,
    "src",
    "test",
    "java",
    fileName.replace(".java", "Test.java")
  );
  const testClassContent = `
import static org.junit.jupiter.api.Assertions.assertThrows;
import org.junit.jupiter.api.Test;

public class ${fileName.replace(".java", "Test")} {
    
    @Test
    public void testNullPointerException() {
        ${fileName.replace(".java", "")} sample = new ${fileName.replace(
    ".java",
    ""
  )}();
        
        assertThrows(NullPointerException.class, () -> {
            sample.run();
        });
    }
}
`; // 이걸 수정해야하는 데, npe할 만한 메소드를 가져와야 함 (code coverage가 unit test에서 하는건가 아니면 전체인가?)

  fs.writeFileSync(testClassPath, testClassContent);
  vscode.window.showInformationMessage(
    `테스트 클래스가 생성됨: ${testClassPath}`
  );

  // Maven 테스트 실행 (NPE 테스트와 코드 커버리지 리포트 생성)
  const mvnCommand = `mvn clean test`;
  cp.exec(mvnCommand, { cwd: mavenProjectPath }, (error, stdout, stderr) => {
    console.log(error);
    if (error) {
      vscode.window.showErrorMessage(
        "Maven 테스트 실행 오류: " + error.message
      );
      return;
    }
    vscode.window.showInformationMessage(
      "Maven 테스트와 코드 커버리지 추출 완료."
    );

    const testReportPath = path.join(
      mavenProjectPath,
      "target",
      "surefire-reports"
    );
    const coverageReportPath = path.join(
      mavenProjectPath,
      "target",
      "site",
      "jacoco",
      "jacoco.xml"
    );

    // test정보와 code coverage가 저장될 디렉토리
    const resourcePath = path.join(__dirname, "..", "resources");

    // surefire-reports에서 test.(java프로젝트이름).json 파일 생성 및 저장
    const testResults: {
      "passed.classes": string[];
      "failed.classes": string[];
      "failed.tests": Array<{ class: string; name: string; message: string }>;
    } = { "passed.classes": [], "failed.classes": [], "failed.tests": [] };

    fs.readdirSync(testReportPath).forEach((file) => {
      if (file.endsWith(".xml")) {
        const xml = fs.readFileSync(path.join(testReportPath, file), "utf-8");
        const parser = new XMLParser({ ignoreAttributes: false });
        const jsonObj = parser.parse(xml);

        if (jsonObj.testsuite && jsonObj.testsuite.testcase) {
          const testCases = jsonObj.testsuite.testcase;
          for (const testCase of Array.isArray(testCases)
            ? testCases
            : [testCases]) {
            const testName = testCase["@_name"];
            const className = testCase["@_classname"];
            const failure = testCase.failure;

            if (testName && className) {
              if (failure) {
                testResults["failed.classes"].push(className);
                testResults["failed.tests"].push({
                  class: className,
                  name: testName,
                  message: failure["@_message"] || "Unknown Failure",
                });
              } else {
                testResults["passed.classes"].push(className);
              }
            }
          }
        }

        // const testCases = xmlDoc.getElementsByTagName("testcase");
        // for (let i = 0; i < testCases.length; i++) {
        //   const testCase = testCases[i];
        //   const testName = testCase.getAttribute("name");
        //   const className = testCase.getAttribute("classname");
        //   const failureElement = testCase.getElementsByTagName("failure")[0];
        //   if (testName && className) {
        //     if (failureElement) {
        //       const failureMessage =
        //         failureElement.getAttribute("message") ||
        //         failureElement.textContent ||
        //         "Unknown Failure";
        //       testResults["failed.classes"].push(className);
        //       testResults["failed.tests"].push({
        //         class: className,
        //         name: testName,
        //         message: failureMessage,
        //       });
        //     } else {
        //       testResults["passed.classes"].push(className);
        //     }
        //   }
        // }
      }
    });

    fs.writeFileSync(
      path.join(resourcePath, `tests.${fileName.replace(".java", "")}.json`),
      JSON.stringify(testResults, null, 2)
    );

    // jacoco.xml에서 (java프로젝트이름).coverage.json 파일 생성 및 저장
    const coverageData: {
      coverage: { className: string; covered: number[] }[];
      classes: string[];
    } = { coverage: [], classes: [] };

    fs.readFile(coverageReportPath, "utf-8", (err, xml) => {
      if (!err) {
        const parser = new XMLParser({ ignoreAttributes: false });
        const xmlDoc = parser.parse(xml);

        const packageData = xmlDoc.report.package;
        if (!packageData) {
          console.error("올바른 데이터 구조가 아닙니다.");
        } else {
          const classes = Array.isArray(xmlDoc.report.package.class)
            ? xmlDoc.report.package.class
            : [xmlDoc.report.package.class];
          const fileList = Array.isArray(packageData.sourcefile)
            ? packageData.sourcefile
            : [packageData.sourcefile];
          const coveredLines: number[] = [];
          classes.forEach((cls: any) => {
            const className = cls["@_name"] || "";

            fileList.forEach((file: any) => {
              const lines = file.line;
              if (Array.isArray(lines)) {
                lines.forEach((line: any) => {
                  const lineNumber = parseInt(line["@_nr"], 10);
                  const covered = parseInt(line["@_ci"], 10);
                  if (!isNaN(lineNumber) && !isNaN(covered) && covered > 0) {
                    coveredLines.push(lineNumber);
                  }
                });
              }
            });
            coverageData.coverage.push({ className, covered: coveredLines });
            coverageData.classes.push(className);
          });
        }

        fs.writeFileSync(
          path.join(
            resourcePath,
            `${fileName.replace(".java", "")}.coverage.json`
          ),
          JSON.stringify(coverageData, null, 2)
        );
        vscode.window.showInformationMessage(
          "테스트 및 코드 커버리지 파일 저장 완료."
        );
      }
    });

    // stacktrace.log 파일 저장
    const stacktracePath = path.join(resourcePath, "stacktrace.log");
    fs.writeFileSync(stacktracePath, stderr || stdout);

    // 커버리지 리포트는 기본적으로 target/site/jacoco 폴더에 생성됨
    const reportPath = path.join(
      mavenProjectPath,
      "target",
      "site",
      "jacoco",
      "index.html"
    );
    vscode.window.showInformationMessage(
      `코드 커버리지 리포트를 확인하세요: ${reportPath}`
    );
  });
}

export async function activate(context: vscode.ExtensionContext) {
  // 지금은 결과가 이미 있다고 가정 - 원래 순서는 extension 실행 후 분석 결과 받고 result.txt 생성 후 받아와서 하이라이팅함
  const faultLocalizationResults = getResult();
  if (!faultLocalizationResults) {
    console.error("Failed to get results");
    return;
  }

  // 정규식을 사용하여 "can be caused by" 이후의 NPE가 발생하는 라인 번호만 추출
  const lineNumbers: number[] = [];
  const regex = /can be caused by[\s\S]*?line\(\w+, (\d+)\)/g;
  let match;
  while ((match = regex.exec(faultLocalizationResults)) !== null) {
    const lineNumber = parseInt(match[1], 10);
    if (!isNaN(lineNumber)) {
      lineNumbers.push(lineNumber);
    }
  }

  highlightLines(lineNumbers);

  const panel = vscode.window.createWebviewPanel(
    "myPanel",
    "My Panel",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
    }
  );
  panel.webview.html = getWebviewContent(lineNumbers);

  panel.webview.onDidReceiveMessage(
    (message) => {
      if (message.command === "jumpToLine") {
        revealLineInEditor(message.line);
      }
    },
    undefined,
    context.subscriptions
  );

  // const ast = await getAST();
  // getFacts(ast);
  runTest(context);

  const disposable = vscode.commands.registerCommand(
    "logicfl-npe-finder.find",
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      vscode.window.showInformationMessage(
        "Hello World from logicfl-npe-finder!"
      );
    }
  );

  context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
