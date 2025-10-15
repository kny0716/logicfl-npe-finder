import * as fs from "fs";
import * as path from "path";
import { LogicFLItem } from "./models/logicFLItem";
import * as vscode from "vscode";

interface PropagationGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  summary: {
    fileName: string;
    npeLine: number;
    npeVariable: string;
  };
}

interface GraphNode {
  id: string;
  label: string;
  color?: object;
  font?: object;
}

interface GraphEdge {
  from: string;
  to: string;
  label?: string;
  arrows?: string;
}

interface CodeInfo {
  name?: string;
  code?: string;
  line: number;
}

function mapIdToName(id: string, facts: string): string | null {
  // literal
  if (id.includes("literal")) return "null";

  // name(...)
  const nameRegex = new RegExp(
    `name\\(${id}, [^,]+, [^,]+, [^,]+, range\\([^)]*\\), '([^']+)'\\)`
  );
  const m1 = facts.match(nameRegex);
  if (m1) return m1[1];

  // expr(...)
  const exprRegex = new RegExp(
    `expr\\(${id}, [^,]+, [^,]+, [^,]+, range\\([^)]*\\), "([^"]+)"\\)`
  );
  const m2 = facts.match(exprRegex);
  if (m2) return m2[1];

  const nameRefRegex = new RegExp(
    `name_ref\\(${id}, [^,]+, '([^']+)',[^)]*\\)`
  );
  const m3 = facts.match(nameRefRegex);
  if (m3) return m3[1];

  return null;
}

export function buildPropagationGraph(
  testItem: LogicFLItem,
  context: vscode.ExtensionContext
): PropagationGraphData {
  const extensionPath = context.extensionPath;
  const fqcn = testItem.id!.split("@").pop()?.split("#")[0] ?? "UnknownTest";
  const classNameTag = fqcn.split(".").pop()?.replace(/Test$/i, "") ?? fqcn;

  const rootCausePath = path.join(
    extensionPath,
    "result",
    classNameTag,
    "root_cause.txt"
  );
  const logicFlPath = path.join(
    extensionPath,
    "result",
    classNameTag,
    "logic-fl.pl"
  );
  const codeFactsPath = path.join(
    extensionPath,
    "result",
    classNameTag,
    "code.facts.pl"
  );
  const emptyResult = {
    nodes: [],
    edges: [],
    summary: { fileName: "N/A", npeLine: 0, npeVariable: "N/A" },
  };

  if (!fs.existsSync(logicFlPath) || !fs.existsSync(codeFactsPath)) {
    console.error("LogicFL 결과 파일이 존재하지 않습니다.");
    vscode.window.showErrorMessage("LogicFL 결과 파일이 존재하지 않습니다.");
    return emptyResult;
  }

  const logicContent = fs.readFileSync(logicFlPath, "utf-8");
  const codeFactsContent = fs.readFileSync(codeFactsPath, "utf-8");

  const assignsByDst = new Map<string, Array<{ src: string; line: number }>>();
  for (const m of logicContent.matchAll(
    /assign\(([^,]+),\s*([^,]+),\s*line\([^,]+,\s*(\d+)\)\)/g
  )) {
    const [_, dst, src, lineStr] = m;
    if (!assignsByDst.has(dst)) assignsByDst.set(dst, []);
    assignsByDst.get(dst)!.push({ src, line: parseInt(lineStr, 10) });
  }

  const codeInfoMap = new Map<string, CodeInfo>();

  for (const m of codeFactsContent.matchAll(
    /name\(([^,]+),.*?,range\([^,]+,\s*\d+,\s*\d+,\s*(\d+),.*?\),\s*'([^']+)'\)/g
  )) {
    const [_, id, lineStr, name] = m;
    codeInfoMap.set(id, { name, line: parseInt(lineStr, 10) });
  }

  for (const m of codeFactsContent.matchAll(
    /expr\(([^,]+),.*?,range\([^,]+,\s*\d+,\s*\d+,\s*(\d+),.*?\),\s*"([^"]+)"\)/g
  )) {
    const [_, id, lineStr, code] = m;
    codeInfoMap.set(id, { code, line: parseInt(lineStr, 10) });
  }

  for (const m of codeFactsContent.matchAll(
    /literal\(([^,]+),.*?,range\([^,]+,\s*\d+,\s*\d+,\s*(\d+),.*?\),\s*(null|true|false|\d+|'[^']*')\)/g
  )) {
    const [_, id, lineStr, value] = m;
    codeInfoMap.set(id, { code: value, line: parseInt(lineStr, 10) });
  }

  const rcMatch =
    /NPE at line\([^,]+,\s*(\d+)\) \/ Null Expression - ([a-zA-Z0-9_]+)\[/g.exec(
      fs.readFileSync(rootCausePath, "utf-8")
    );
  if (!rcMatch) {
    console.error("root_cause.txt에서 NPE 시작점을 찾을 수 없습니다.");
    vscode.window.showErrorMessage(
      "root_cause.txt에서 NPE 시작점을 찾을 수 없습니다."
    );
    return emptyResult;
  }
  const [_, npeLineStr, npeVarId] = rcMatch;
  const startTarget = { id: npeVarId, line: parseInt(npeLineStr, 10) };

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  const traceQueue = [startTarget];
  const visited = new Set<string>();

  const addNode = (id: string, line: number): string => {
    const key = `${id}@${line}`;
    if (!nodes.has(key)) {
      const info = codeInfoMap.get(id);
      let label = `${mapIdToName(
        info?.name || info?.code || id,
        codeFactsContent
      )} (line ${line})`;
      let nodeStyle = {
        color: { background: "#ffffff", border: "#2c3e50" },
        font: { color: "#2c3e50" },
      };

      if (id === startTarget.id && line === startTarget.line) {
        label = `${mapIdToName(
          info?.name || id,
          codeFactsContent
        )} (line ${line})`;
        nodeStyle = {
          color: { background: "#e74c3c", border: "#c0392b" },
          font: { color: "#ffffff" },
        };
      } else if (info && info.code === "null") {
        label = `null\nline ${line}`;
        nodeStyle = {
          color: { background: "#ecf0f1", border: "#bdc3c7" },
          font: { color: "#2c3e50" },
        };
      }

      nodes.set(key, { id: key, label: label, ...nodeStyle });
    }
    return key;
  };

  while (traceQueue.length > 0) {
    const currentTarget = traceQueue.shift()!;
    const { id, line } = currentTarget;

    const currentKey = addNode(id, line);
    if (visited.has(currentKey)) continue;
    visited.add(currentKey);

    const allAssigns = assignsByDst.get(id) || [];
    const relevantAssigns = allAssigns.filter((as) => as.line < line);

    if (relevantAssigns.length > 0) {
      const predecessor = relevantAssigns.reduce((latest, current) =>
        latest.line > current.line ? latest : current
      );

      const predecessorKey = addNode(predecessor.src, predecessor.line);
      edges.push({
        from: predecessorKey,
        to: currentKey,
        arrows: "to",
      });

      if (!visited.has(predecessorKey)) {
        traceQueue.push({ id: predecessor.src, line: predecessor.line });
      }
    }
  }

  const summary = {
    fileName: `${classNameTag}.java`,
    npeLine: startTarget.line,
    npeVariable: mapIdToName(npeVarId, codeFactsContent) || npeVarId,
  };
  return { nodes: Array.from(nodes.values()), edges, summary };
}
