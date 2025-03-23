import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
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
      <h1>npe 발생 원인으로 추정되는 라인인</h1>
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
      console.log(facts);
    })
    .catch((err) => {
      console.error(err);
    });
}

export function activate(context: vscode.ExtensionContext) {
  // 지금은 결과가 이미 있다고 가정 - 원래 순서는 extension 실행 후 분석 결과 받고 result.txt 생성 후 받아와서 하이라이팅함
  const faultLocalizationResults = getResult();
  if (!faultLocalizationResults) {
    console.error("Failed to get results");
    return;
  }
  // const editor = vscode.window.activeTextEditor;
  // if (!editor) {
  //   return;
  // }

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

  const ast = getAST();
  if (!ast) {
    console.error("Failed to get AST");
    return;
  }

  getFacts(ast);

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
