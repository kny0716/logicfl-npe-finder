import * as vscode from "vscode";

const decorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: "rgba(208, 243, 10, 0.3)",
  borderRadius: "5px",
});

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
  console.log("1");
  if (!editor) {
    return;
  }
  console.log("2");
  const position = new vscode.Position(line - 1, 0);
  const range = new vscode.Range(position, position);
  editor.revealRange(
    range,
    vscode.TextEditorRevealType.InCenterIfOutsideViewport
  );
  editor.selection = new vscode.Selection(position, position); // 선택(커서 이동)
}

export function activate(context: vscode.ExtensionContext) {
  // 문서가 열릴 때마다 logicFL에게 필요한 정보를 보내고 결과 받아와서 하이라이팅해야함.
  // 일단 결과를 받아서 파싱한다음 하이라이팅하는것만 구현
  // 이 extension이 실행되는 시점이 (1) 입력되고 있을 때? (2) 저장할 때? (3) 파일을 열 때? (4) 에디터 active될 때? 등이 중요할 듯

  // Fault Localization 결과 (예제 데이터, 실제로는 logicFL에서 받아와야 함)
  const faultLocalizationResults = `
        NPE at line(type_utils_1, 805) / Null Expression - v_raw_component_type_1201[rawComponentType]
                 can be caused by
        v_raw_component_type_1201[rawComponentType] - line(type_utils_1, 8).

        NPE at line(type_utils_1, 805) / Null Expression - v_raw_component_type_1201[rawComponentType]
                 can be caused by
        type_utils_1_literal3[null] - line(type_utils_1, 10).

        NPE at line(type_utils_1, 805) / Null Expression - v_raw_component_type_1201[rawComponentType]
                 can be caused by
        type_utils_1_expr28['getRawType(((GenericArrayType)type).getGenericComponentType(),assigningType)'] - line(type_utils_1, 18).`;

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
  console.log(lineNumbers);
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
