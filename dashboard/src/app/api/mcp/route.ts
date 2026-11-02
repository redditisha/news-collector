import { NextResponse, type NextRequest } from "next/server";
import { TOOLS } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * News Monitor MCP server (Model Context Protocol, Streamable HTTP, stateless,
 * JSON responses). Read-only tools over the app's data — online: the Google
 * Sheet; on the PC: the full archive. Add the URL as a custom connector in
 * Claude (claude.ai -> Settings -> Connectors), then use it from the app.
 *
 * Optional MCP_KEY: if set, the URL must carry ?key=<MCP_KEY>.
 */

const SERVER = { name: "news-monitor", version: "1.0.0" };
const PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_TEXT = 90_000;

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any };

const ok = (id: RpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: RpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

function authorized(request: NextRequest) {
  const key = process.env.MCP_KEY;
  return !key || request.nextUrl.searchParams.get("key") === key;
}

async function handle(req: RpcRequest) {
  switch (req.method) {
    case "initialize": {
      const asked = req.params?.protocolVersion;
      return ok(req.id, {
        protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions:
          "News Monitor: Indian and world news from 131 outlets in English, Kannada, Hindi, Tamil and Telugu, " +
          "collected every 15 minutes, with English translations and stories (the same event across outlets). " +
          "Call overview first to see what the data covers. Read-only.",
      });
    }
    case "ping":
      return ok(req.id, {});
    case "tools/list":
      return ok(req.id, {
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: { readOnlyHint: true } })),
      });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === req.params?.name);
      if (!tool) return fail(req.id, -32602, `Unknown tool: ${req.params?.name}`);
      try {
        const result = await tool.run(req.params?.arguments ?? {});
        let text = JSON.stringify(result);
        if (text.length > MAX_TEXT) text = `${text.slice(0, MAX_TEXT)}… [truncated — ask for fewer results or a narrower filter]`;
        return ok(req.id, { content: [{ type: "text", text }], isError: false });
      } catch (e: any) {
        return ok(req.id, { content: [{ type: "text", text: `Error: ${e?.message || String(e)}` }], isError: true });
      }
    }
    default:
      if (req.method?.startsWith("notifications/")) return null; // no reply to notifications
      return fail(req.id, -32601, `Method not found: ${req.method}`);
  }
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json(fail(null, -32001, "Unauthorized"), { status: 401 });
  let body: RpcRequest | RpcRequest[];
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(fail(null, -32700, "Parse error"), { status: 400 });
  }
  const batch = Array.isArray(body) ? body : [body];
  const replies = (await Promise.all(batch.map(handle))).filter(Boolean);
  if (!replies.length) return new NextResponse(null, { status: 202 });
  return NextResponse.json(Array.isArray(body) ? replies : replies[0]);
}

/** No server-initiated stream: the server only answers requests. */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return new NextResponse("Unauthorized", { status: 401 });
  return new NextResponse("News Monitor MCP server — POST JSON-RPC here (MCP Streamable HTTP).", {
    status: 405,
    headers: { Allow: "POST" },
  });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
