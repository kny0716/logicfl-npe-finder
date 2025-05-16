import * as vscode from "vscode";

export function showWebview(
  context: vscode.ExtensionContext,
  lineNumbers: number[],
  onLineJump: (line: number) => void
) {
  const panel = vscode.window.createWebviewPanel(
    "myPanel",
    "My Panel",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
    }
  );

  const listItems = lineNumbers
    .map(
      (line) =>
        `<li><a href="#" onclick="jumpToLine(${line})"> Line ${line}</a></li>`
    )
    .join("");
  panel.webview.html = `<!DOCTYPE html>
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

  panel.webview.onDidReceiveMessage(
    (message) => {
      if (message.command === "jumpToLine") {
        onLineJump(message.line);
      }
    },
    undefined,
    context.subscriptions
  );
}
