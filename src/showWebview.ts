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
  console.log("Sorted Line Pairs:", sortedLinePairs);
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

          // 노드와 링크 데이터 생성
          const nodes = {};
          const links = [];
          linePairs.forEach(pair => {
              const causeId = 'line-' + pair.cause;
              const resultId = 'line-' + pair.result;

              if (!nodes[causeId]) { nodes[causeId] = { id: causeId, line: pair.cause, type: 'cause', incoming: 0, outgoing: 0 }; }
              if (!nodes[resultId]) { nodes[resultId] = { id: resultId, line: pair.result, type: 'result', incoming: 0, outgoing: 0 }; }
              links.push({ source: causeId, target: resultId });
              nodes[causeId].outgoing++;
              nodes[resultId].incoming++;
          });

          // 노드 타입 및 색상 결정
          Object.values(nodes).forEach(d => {
              if (d.incoming === 0) {
                  d.type = 'root-cause'; // 외부로부터의 연결이 없으면 'root-cause'
                  d.color = '#e74c3c'; // 빨간색
              } else if (d.outgoing > 1) {
                  d.type = 'propagation'; // 외부로 연결되면 'propagation'
                  d.color = '#f39c12'; // 주황색
              } else {
                  d.type = 'result'; // 외부로 연결되지 않으면 'result'
                  d.color = '#bdc3c7'; // 회색
              }
          });

          const graphData = {
              nodes: Object.values(nodes),
              links: links
          };
        
          const width = 800;
          const height = 600;
          const svg = d3.select("#rootCauseGraph")
              .attr("width", width)
              .attr("height", height);

          // 화살표 마커 정의
          svg.append("defs").append("marker")
              .attr("id", "arrowhead")
              .attr("viewBox", "-0 -5 10 10")
              .attr("refX", 25)
              .attr("refY", 0)
              .attr("orient", "auto")
              .attr("markerWidth", 8)
              .attr("markerHeight", 8)
              .attr("xoverflow", "visible")
              .append("svg:path")
              .attr("d", "M 0,-5 L 10 ,0 L 0,5")
              .attr("fill", "#999");

          const simulation = d3.forceSimulation(graphData.nodes)
              .force("link", d3.forceLink(graphData.links).id(d => d.id).distance(100))
              .force("charge", d3.forceManyBody().strength(-300))
              .force("center", d3.forceCenter(width / 2, height / 2))
              .force("y", d3.forceY(d => {
                  if (d.type === 'root-cause') return height * 0.2;
                  if (d.type === 'propagation') return height * 0.5;
                  return height * 0.8;
              }).strength(0.5)); 

          const link = svg.append("g")
              .attr("class", "links")
              .selectAll("line")
              .data(graphData.links)
              .enter().append("line")
              .attr("class", "link")
              .attr("marker-end", d => d.source.line !== d.target.line ? "url(#arrowhead)" : null);
          
          const node = svg.append("g")
              .attr("class", "nodes")
              .selectAll(".node")
              .data(graphData.nodes)
              .enter().append("g")
              .attr("class", "node")
              .on("mouseover", (event, d) => {
                  tooltip.style("opacity", 1);
                  tooltip.html("클릭 시 해당 라인으로 이동합니다.");
              })
              .on("mousemove", (event) => {
                  tooltip.style("left", (event.pageX + 10) + "px")
                         .style("top", (event.pageY - 10) + "px");
              })
              .on("mouseout", () => {
                  tooltip.style("opacity", 0);
              })
              .call(d3.drag()
                  .on("start", (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
                  .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
                  .on("end", (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }))
              .on("click", (event, d) => {
                  vscode.postMessage({
                      command: 'jumpToLine',
                      line: d.line
                  });
              });

          node.append("circle")
              .attr("r", 15)
              .attr("fill", d => d.color);

          node.append("text")
              .attr("dy", "0.35em")
              .attr("text-anchor", "middle")
              .text(d => d.line)
              .style("fill", "#fff");

          simulation.on("tick", () => {
              link.attr("x1", d => d.source.x)
                  .attr("y1", d => d.source.y)
                  .attr("x2", d => d.target.x)
                  .attr("y2", d => d.target.y);

              node.attr("transform", (d) => "translate(" + d.x + "," + d.y + ")");
          });
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
