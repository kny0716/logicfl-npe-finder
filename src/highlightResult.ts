import * as vscode from "vscode";

const decorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: "rgba(208, 243, 10, 0.3)",
  borderRadius: "5px",
});

export function highlightLines(lineNumbers: number[]) {
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
      hoverMessage: "NPE 발생의 원인으로 추정",
    };
    decorations.push(decoration);
  });
  editor.setDecorations(decorationType, decorations);
}
