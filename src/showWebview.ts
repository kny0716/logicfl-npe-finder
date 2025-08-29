import * as vscode from "vscode";

export function showWebview(
  context: vscode.ExtensionContext,
  linePairs: { cause: number; result: number }[],
  onLineJump: (line: number) => void
) {
  const panel = vscode.window.createWebviewPanel(
    "logicfl.resultView",
    "LogicFL ResultView",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
    }
  );
  const sortedLinePairs = linePairs.sort((a, b) => a.cause - b.cause);
  const data = JSON.stringify(sortedLinePairs);

  const npeLine =
    linePairs.find((pair) => pair.cause === pair.result)?.result ??
    "알 수 없음";

  panel.webview.html = `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>LogicFL ResultView</title>
      <style>
          body { font-family: sans-serif; margin: 0; padding: 0; display: flex; flex-direction: column; align-items: center; }
          .summary-box {
              background-color: #f0f0f0;
              border: 1px solid #ddd;
              padding: 15px;
              margin: 20px 0;
              border-radius: 8px;
              width: 90%;
              max-width: 700px;
              line-height: 1.5;
              color:  #000;
          }
          h1, h2 { margin: 10px 0; }
          .node { cursor: pointer; }
          .node circle { stroke: #fff; stroke-width: 1.5px; }
          .link { stroke: #999; stroke-opacity: 0.6; stroke-width: 2px; }
          text { font-size: 10px; font-weight: bold; }
          .node text { pointer-events: none; }
          .tooltip {
              position: absolute;
              text-align: center;
              padding: 5px;
              font: 12px sans-serif;
              background: #333;
              color: white;
              border: 0px;
              border-radius: 8px;
              pointer-events: none;
              opacity: 0;
              z-index: 10;
          }
      </style>
  </head>
  <body>
      <h1>NPE 원인-결과 관계 그래프</h1>
      <div class="summary-box">
          <h2>분석 결과 요약</h2>
          <p> NPE 발생 라인: Line ${npeLine}</p>
          <p> 발견된 NPE 발생 원인 라인 수 : ${linePairs.length}개 </p>
      </div>
      <svg id="rootCauseGraph"></svg>
      <div id="tooltip" class="tooltip"></div>
      <script src="https://d3js.org/d3.v7.min.js"></script>
      <script>
          const vscode = acquireVsCodeApi();
          const linePairs = ${data};
          const tooltip = d3.select("#tooltip");

          const npeLine = ${npeLine};
          
          // D3 계층 구조 데이터 생성
          const uniqueCauses = Array.from(new Set(linePairs.map(p => p.cause))).filter(c => c !== npeLine);
          
          const rootData = {
              id: "line-" + npeLine,
              line: npeLine,
              type: "result",
              children: uniqueCauses.map(c => ({
                  id: "line-" + c,
                  line: c,
                  type: "cause"
              }))
          };

          const margin = { top: 40, right: 90, bottom: 50, left: 90 };
          const width = 800 - margin.left - margin.right;
          const height = Math.max(600, uniqueCauses.length * 50) - margin.top - margin.bottom;

          const svg = d3.select("#rootCauseGraph")
              .attr("width", width + margin.left + margin.right)
              .attr("height", height + margin.top + margin.bottom)
              .append("g")
              .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

          const root = d3.hierarchy(rootData);
          const treeLayout = d3.tree().size([width, height]);
          const treeData = treeLayout(root);

          // 링크(화살표) 그리기
          svg.selectAll(".link")
              .data(treeData.links())
              .enter()
              .append("path")
              .attr("class", "link")
              .attr("d", d => "M" + d.source.x + "," + (height - d.source.y) + "L" + d.target.x + "," + (height - d.target.y));

          // 노드 그리기
          const node = svg.selectAll(".node")
              .data(treeData.descendants())
              .enter()
              .append("g")
              .attr("class", "node")
              .attr("transform", d => "translate(" + d.x + "," + (height - d.y) + ")")
              .on("mouseover", (event, d) => {
                  tooltip.style("opacity", 1);
                  tooltip.html("클릭 시 해당 라인으로 이동합니다.");
              })
              .on("mousemove", (event) => {
                  tooltip.style("left", (event.pageX + 15) + "px")
                         .style("top", (event.pageY - 20) + "px");
              })
              .on("mouseout", () => {
                  tooltip.style("opacity", 0);
              })
              .on("click", (event, d) => {
                  vscode.postMessage({
                      command: 'jumpToLine',
                      line: d.data.line
                  });
              });

          node.append("circle")
              .attr("r", 15)
              .attr("fill", d => {
                  if (d.data.line === npeLine) {
                      return '#3498db'; // 결과 노드는 파란색
                  } else {
                      return '#e74c3c'; // 원인 노드는 빨간색
                  }
              });

          node.append("text")
              .attr("dy", "0.35em")
              .attr("text-anchor", "middle")
              .text(d => d.data.line)
              .style("fill", "#fff");
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
