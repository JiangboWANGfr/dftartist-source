// 把一个连接文件解析成规范 AST，用于"语义比对"（对行尾空格 / 缩进 / 空行不敏感）。

export interface InstanceAST {
  name: string;
  sources: string[];
}
export interface ChildBlockAST {
  name: string;
  file: string;
  inputPorts: string[];
  outputPorts: string[];
  instances: InstanceAST[];
}
export interface ConnFileAST {
  top: string;
  blocks: ChildBlockAST[];
}

function splitList(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

/** 给定 '{' 的下标，返回与之匹配的 '}' 下标。 */
function matchBrace(text: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new Error("unbalanced braces");
}

export function parseConn(text: string): ConnFileAST {
  const topM = text.match(/TopModuleConnections\s*\(\s*([^)\s]+)\s*\)/);
  if (!topM) throw new Error("no TopModuleConnections(...) found");
  const top = topM[1];

  const blocks: ChildBlockAST[] = [];
  const reBlock = /ChildBlock\s*\(\s*([^)\s]+)\s*\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = reBlock.exec(text)) !== null) {
    const name = m[1];
    const open = text.indexOf("{", m.index);
    const close = matchBrace(text, open);
    const body = text.slice(open + 1, close);
    reBlock.lastIndex = close; // 跳过整个 block 体，避免把内部 Instance 误当 block

    const instPos = body.search(/Instance\s*\(/);
    const header = instPos >= 0 ? body.slice(0, instPos) : body;

    const fileM = header.match(/file_name\s*:\s*([^;]+);/);
    const inM = header.match(/input_ports\s*:\s*([^;]+);/);
    const outM = header.match(/output_ports\s*:\s*([^;]+);/);

    const instances: InstanceAST[] = [];
    const reInst = /Instance\s*\(\s*([^)\s]+)\s*\)\s*\{/g;
    let im: RegExpExecArray | null;
    while ((im = reInst.exec(body)) !== null) {
      const iname = im[1];
      const iopen = body.indexOf("{", im.index);
      const iclose = matchBrace(body, iopen);
      const ibody = body.slice(iopen + 1, iclose);
      reInst.lastIndex = iclose;
      const srcM = ibody.match(/input_port_sources\s*:\s*([^;]+);/);
      instances.push({ name: iname, sources: srcM ? splitList(srcM[1]) : [] });
    }

    blocks.push({
      name,
      file: fileM ? fileM[1].trim() : "",
      inputPorts: inM ? splitList(inM[1]) : [],
      outputPorts: outM ? splitList(outM[1]) : [],
      instances,
    });
  }
  return { top, blocks };
}
