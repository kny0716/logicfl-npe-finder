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
  if (id.includes("literal")) {
    const literalRegex = new RegExp(
      `literal\\(${id},[^,]+,range\\([^)]*\\),([^)]+)\\)`
    );
    const m = facts.match(literalRegex);
    if (m) {
      return m[1].trim().replace(/'/g, "");
    }
    return "null";
  }

  const nameRegex = new RegExp(
    `name\\(${id}, [^,]+, [^,]+, [^,]+, range\\([^)]*\\), '([^']+)'\\)`
  );
  const m1 = facts.match(nameRegex);
  if (m1) {
    return m1[1];
  }

  const exprRegex = new RegExp(
    `expr\\(${id}, [^,]+, [^,]+, [^,]+, range\\([^)]*\\), "([^"]+)"\\)`
  );
  const m2 = facts.match(exprRegex);
  if (m2) {
    return m2[1];
  }

  const nameRefRegex = new RegExp(
    `name_ref\\(${id}, [^,]+, '([^']+)',[^)]*\\)`
  );
  const m3 = facts.match(nameRefRegex);
  if (m3) {
    return m3[1];
  }

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

  const methodInvocations = new Map<string, string>();
  for (const m of logicContent.matchAll(
    /method_invoc\(([^,]+),\s*([^,]+),\s*line\([^,]+,\s*\d+\)\)/g
  )) {
    const [_, invocId, methodId] = m;
    methodInvocations.set(invocId, methodId);
  }

  const returnsByMethod = new Map<
    string,
    Array<{ src: string; line: number }>
  >();
  for (const m of logicContent.matchAll(
    /return\(([^,]+),\s*([^,]+),\s*line\([^,]+,\s*(\d+)\)\)/g
  )) {
    const [_, src, methodId, lineStr] = m;
    if (!returnsByMethod.has(methodId)) {
      returnsByMethod.set(methodId, []);
    }
    returnsByMethod.get(methodId)!.push({ src, line: parseInt(lineStr, 10) });
  }

  const assignsByDst = new Map<string, Array<{ src: string; line: number }>>();
  for (const m of logicContent.matchAll(
    /assign\(([^,]+),\s*([^,]+),\s*line\([^,]+,\s*(\d+)\)\)/g
  )) {
    const [_, dst, src, lineStr] = m;
    if (!assignsByDst.has(dst)) {
      assignsByDst.set(dst, []);
    }
    assignsByDst.get(dst)!.push({ src, line: parseInt(lineStr, 10) });
  }

  const paramInfoMap = new Map<string, { methodId: string; index: number }>();
  for (const m of logicContent.matchAll(
    /param\(([^,]+),\s*(\d+),\s*([^)]+)\)/g
  )) {
    const [_, paramId, indexStr, methodId] = m;
    paramInfoMap.set(paramId, { methodId, index: parseInt(indexStr, 10) });
  }

  const argumentMap = new Map<string, Map<number, string>>();
  for (const m of logicContent.matchAll(
    /argument\(([^,]+),\s*(\d+),\s*([^)]+)\)/g
  )) {
    const [_, argId, indexStr, invocId] = m;
    if (!argumentMap.has(invocId)) {
      argumentMap.set(invocId, new Map<number, string>());
    }
    argumentMap.get(invocId)!.set(parseInt(indexStr, 10), argId);
  }

  const invocationsByMethodId = new Map<
    string,
    Array<{ invocId: string; line: number }>
  >();
  for (const m of logicContent.matchAll(
    /method_invoc\(([^,]+),\s*([^,]+),\s*line\([^,]+,\s*(\d+)\)\)/g
  )) {
    const [_, invocId, methodId, lineStr] = m;
    if (!invocationsByMethodId.has(methodId)) {
      invocationsByMethodId.set(methodId, []);
    }
    invocationsByMethodId
      .get(methodId)!
      .push({ invocId, line: parseInt(lineStr, 10) });
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
    if (visited.has(currentKey)) {
      continue;
    }
    visited.add(currentKey);

    let foundPredecessor = false;

    const allAssigns = assignsByDst.get(id) || [];
    const relevantAssigns = allAssigns.filter((as) => as.line <= line);

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
      foundPredecessor = true;
    }

    if (paramInfoMap.has(id)) {
      const { methodId, index } = paramInfoMap.get(id)!;
      const invocations = invocationsByMethodId.get(methodId) || [];

      for (const invoc of invocations) {
        if (invoc.line > line) {
          continue;
        }

        const args = argumentMap.get(invoc.invocId);
        if (args && args.has(index)) {
          const argId = args.get(index)!;
          const predecessorKey = addNode(argId, invoc.line);
          edges.push({
            from: predecessorKey,
            to: currentKey,
            arrows: "to",
          });

          if (!visited.has(predecessorKey)) {
            traceQueue.push({ id: argId, line: invoc.line });
          }
          foundPredecessor = true;
        }
      }
    }

    if (!foundPredecessor && methodInvocations.has(id)) {
      const methodId = methodInvocations.get(id)!;
      const returns = returnsByMethod.get(methodId) || [];

      for (const ret of returns) {
        const predecessorKey = addNode(ret.src, ret.line);
        edges.push({
          from: predecessorKey,
          to: currentKey,
          arrows: "to",
        });

        if (!visited.has(predecessorKey)) {
          traceQueue.push({ id: ret.src, line: ret.line });
        }
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
