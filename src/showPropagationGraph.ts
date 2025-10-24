import * as vscode from "vscode";
import { LogicFLItem } from "./models/logicFLItem";
import { buildPropagationGraph } from "./buildPropagationGraph";

function revealLineInEditor(line: number) {
  const editors = vscode.window.visibleTextEditors;
  const editor = editors.find((e) => e.document.languageId === "java");
  if (!editor) {
    vscode.window.showInformationMessage("활성화된 Java 에디터가 없습니다.");
    return;
  }

  const position = new vscode.Position(line - 1, 0);
  const range = new vscode.Range(position, position);

  editor.revealRange(
    range,
    vscode.TextEditorRevealType.InCenterIfOutsideViewport
  );
  editor.selection = new vscode.Selection(position, position);
}

export function showPropagationGraph(
  testItem: LogicFLItem,
  context: vscode.ExtensionContext
) {
  const column = vscode.window.activeTextEditor
    ? vscode.window.activeTextEditor.viewColumn
    : undefined;

  const panel = vscode.window.createWebviewPanel(
    "logicfl.resultView",
    "LogicFL ResultView",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
    }
  );

  const graphData = buildPropagationGraph(testItem, context);

  if (!graphData || graphData.nodes.length === 0) {
    vscode.window.showErrorMessage(
      "전파 그래프 생성에 오류가 발생했습니다. 다시 시도해주세요."
    );
    return;
  }
  panel.webview.html = getWebviewContent(panel.webview, context);

  panel.webview.onDidReceiveMessage(
    (message) => {
      switch (message.command) {
        case "revealLine":
          revealLineInEditor(message.line);
          return;
      }
    },
    undefined,
    context.subscriptions
  );

  panel.webview.postMessage({ command: "renderGraph", data: graphData });
}

function getWebviewContent(
  webview: vscode.Webview,
  context: vscode.ExtensionContext
): string {
  return `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>NPE Propagation Graph</title>
        <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
        <style>
            html, body {
                width: 100%;
                height: 100%;
                margin: 0;
                padding: 0;
                overflow: hidden;
                background-color: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
                font-family: var(--vscode-font-family);
            }
            h1 {
                text-align: center;
                margin: 10px 0;
                }
            h2 { margin: 7px 0; }
            #summary-panel {
              background-color: #f0f0f0;
              border: 1px solid #ddd;
              padding: 15px;
              margin: 20px;
              border-radius: 8px;
              width: 80%;
              max-width: 700px;
              line-height: 1.5;
              color:  #000;
            }
            #summary-panel div {
                font-size: 13px;
                color: #000;
            }
            #npe-graph {
                width: 100%;
                height: 100vh;
            }
        </style>
    </head>
    <body>
        <div id="summary-panel"></div>
        <h1>NPE 원인-결과 관계 그래프</h1>
        <div id="npe-graph"></div>
        <script type="text/javascript">
            const vscode = acquireVsCodeApi();
            const container = document.getElementById('npe-graph');
            const nodes = new vis.DataSet([]);
            const edges = new vis.DataSet([]);
            const data = { nodes, edges };
            
            const options = {
                layout: {
                    hierarchical: {
                        direction: "UD",
                        sortMethod: "directed",
                        levelSeparation: 100,
                        nodeSpacing: 150,
                    },
                },
                edges: {
                    smooth: true,
                    color: { color: 'var(--vscode-editor-foreground)', highlight: 'var(--vscode-list-activeSelection-background)' },
                    arrows: { to: { enabled: true, scaleFactor: 1 } },
                },
                nodes: { 
                    shape: 'box',
                    margin: 10,
                    widthConstraint: { maximum: 250 },
                    font: { multi: 'html' } ,
                },
                physics: { enabled: false },
                interaction: { dragNodes: true, dragView: true, zoomView: true, hover: true  }
            };

            const network = new vis.Network(container, data, options);
            
            network.on('click', function (params) {
                if (params.nodes.length > 0) {
                    const clickedNodeId = params.nodes[0]; 
                    const line = parseInt(clickedNodeId.split('@')[1], 10); 

                    if (!isNaN(line)) {
                        vscode.postMessage({
                            command: 'revealLine',
                            line: line
                        });
                    }
                }
            });

            window.addEventListener('message', event => {
                const message = event.data;
                if (message.command === 'renderGraph') {
                    nodes.clear();
                    edges.clear();
                    nodes.add(message.data.nodes);
                    edges.add(message.data.edges);
                    network.fit();

                  const summary = message.data.summary;
                    const summaryPanel = document.getElementById('summary-panel');
                    if (summary && summaryPanel) {
                       summaryPanel.innerHTML =
                          '<h2>분석 결과 요약</h2>' +
                          '<div><strong>NPE 발생 File:</strong> ' + summary.fileName + '</div>' +
                          '<div><strong>NPE 발생 위치: </strong> ' + summary.npeVariable + ' (Line ' + summary.npeLine + ')</div>';
                    }
                }
            });
        </script>
    </body>
    </html>`;
}
