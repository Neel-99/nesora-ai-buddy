import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

/** ---------------- C O N F I G ---------------- **/
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const N8N_BASE_URL = "https://cognitive-beings-collecting-specializing.trycloudflare.com";
const N8N_ENDPOINTS = {
  parser: `${N8N_BASE_URL}/webhook/mcp/parser`, // WF7
  create_ticket: `${N8N_BASE_URL}/webhook/mcp/create`, // WF1
  fetch_ticket: `${N8N_BASE_URL}/webhook/mcp/fetch`, // WF2
  update_ticket: `${N8N_BASE_URL}/webhook/mcp/update`, // WF3
  comment_ticket: `${N8N_BASE_URL}/webhook/mcp/comment`, // WF4
  delete_ticket: `${N8N_BASE_URL}/webhook/mcp/delete`, // WF5
};

/** ------------- U T I L S ------------------- **/
function jsonResponse(body: unknown, init: number | ResponseInit = 200) {
  const status = typeof init === "number" ? init : ((init as ResponseInit).status ?? 200);
  const headers = typeof init === "number" ? {} : ((init as ResponseInit).headers ?? {});
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...headers },
  });
}

// Try to pull the first JSON object from a text blob (LLM often wraps JSON in prose)
function extractJsonFromText(text: string): any | null {
  try {
    // Fast path: whole string is JSON
    return JSON.parse(text);
  } catch {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = text.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  return null;
}

// Resolve "a.b.c" from object safely
function resolvePath(obj: any, path: string): any {
  if (!obj || typeof obj !== "object") return undefined;
  return path.split(".").reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), obj);
}

// Normalize fetch-like results into a canonical items array
function normalizeItems(data: any): any[] {
  if (!data) return [];
  // Common shapes we’ve seen across WFs:
  // { data: { fetched: [] } }, { data: { issues: [] } }, { tickets: [] }, []
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.tickets)) return data.tickets;
  if (data.data) {
    if (Array.isArray(data.data.fetched)) return data.data.fetched;
    if (Array.isArray(data.data.issues)) return data.data.issues;
  }
  if (Array.isArray(data.fetched)) return data.fetched;
  if (Array.isArray(data.issues)) return data.issues;
  return [];
}

// Ensure a result object also exposes a unified `.data.items`
function attachUnifiedItems(result: any) {
  const items = normalizeItems(result);
  if (!result.data) result.data = {};
  result.data.items = items;
}

/** ------------- M A I N ------------------- **/
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages = [], userId, jiraDomain } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return jsonResponse({ error: "LOVABLE_API_KEY is not configured" }, 500);

    // Build a strict system prompt (same as yours, unchanged for brevity) but REQUIRE the JSON contract
    const systemPrompt = `
You are Nesora, an AI-powered Jira Execution Assistant. Return **ONLY** valid JSON per the schemas below.
If you need to respond in natural language, put it in the "message" field. Never include extra text outside JSON.

When executing Jira operations (preferred when the user asks to do something):
{
  "needsClarification": false,
  "message": "✅ ...human-friendly summary...",
  "action": {
    "query": "<user-intent in natural language>",
    "context": {
      "source": "lovable",
      "project_key": "NT"
    }
  }
}

When needing clarification:
{
  "needsClarification": true,
  "message": "One question to unblock execution"
}

When only chatting:
{
  "needsClarification": false,
  "message": "short helpful text"
}
`.trim();

    // Call Lovable AI
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text().catch(() => "");
      if (aiRes.status === 429)
        return jsonResponse({ error: "Rate limit exceeded. Please try again in a moment." }, 429);
      if (aiRes.status === 402) return jsonResponse({ error: "AI service requires payment. Please add credits." }, 402);
      console.error("AI gateway error:", aiRes.status, txt);
      return jsonResponse({ error: "AI service error" }, 500);
    }

    const aiData = await aiRes.json();
    const aiMessage: string = aiData?.choices?.[0]?.message?.content ?? "";

    // Parse JSON output (robust)
    let parsed = extractJsonFromText(aiMessage) ?? { needsClarification: false, message: aiMessage };

    // If LLM didn’t propose an action but last user msg is imperative, fallback to Parser directly
    const lastUserMsg =
      [...messages]
        .reverse()
        .find((m: any) => m.role === "user")
        ?.content?.trim() ?? "";
    const shouldFallbackToParser = !parsed?.needsClarification && !parsed?.action && lastUserMsg.length > 3;

    if (shouldFallbackToParser) {
      // Build a default "action" so the pipeline proceeds
      parsed = {
        needsClarification: false,
        message: parsed.message ?? `🎯 Working on your request: ${lastUserMsg}`,
        action: {
          query: lastUserMsg,
          context: { source: "lovable", project_key: "NT" },
        },
      };
    }

    // If there’s something to do — route to n8n
    if (parsed.action && !parsed.needsClarification) {
      const context = {
        source: "lovable",
        project_key: "NT",
        ...parsed.action.context,
      };

      // 1) Call WF7 (Parser) to turn NL into structured intents
      const parserRes = await fetch(N8N_ENDPOINTS.parser, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, query: parsed.action.query, context }),
      });

      if (!parserRes.ok) {
        const txt = await parserRes.text().catch(() => "");
        return jsonResponse(
          {
            message: parsed.message + "\n\n⚠️ Parser failed.",
            error: `HTTP ${parserRes.status} ${parserRes.statusText}`,
            body: txt,
          },
          502,
        );
      }

      const parserRaw = await parserRes.json();
      const parser = Array.isArray(parserRaw) ? parserRaw[0] : parserRaw;

      if (parser.status === "error" || !Array.isArray(parser.intents) || parser.intents.length === 0) {
        return jsonResponse({
          message:
            parsed.message + "\n\n⚠️ I couldn't determine the specific actions to take. Please add a bit more detail.",
          parser,
        });
      }

      // 2) Execute intents with dependency handling (waves)
      const workflowResult = await executeIntents(parser.intents, userId, jiraDomain);

      return jsonResponse({
        message: parsed.message,
        workflowResult,
        formattedResult: formatWorkflowResult(workflowResult),
      });
    }

    // Else: clarification or plain chat
    return jsonResponse(parsed);
  } catch (err: any) {
    console.error("Edge error:", err);
    return jsonResponse({ error: err?.message ?? "Failed to process request" }, 500);
  }
});

/** ---------------- E X E C U T O R ---------------- **/
async function executeIntents(intents: any[], userId: string, jiraDomain: string) {
  const ctx: Record<string, any> = {};
  const results: any[] = [];
  const done = new Set<string>();

  while (done.size < intents.length) {
    const ready = intents.filter((it) => {
      const id = it.id || it.intent;
      if (done.has(id)) return false;
      const deps = it.depends_on || [];
      return deps.every((d: string) => done.has(d));
    });

    if (ready.length === 0) {
      // circular or unresolved deps
      break;
    }

    await Promise.all(ready.map((it) => executeOne(it, ctx, done, results, userId, jiraDomain)));
  }

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  const status = errorCount === 0 ? "success" : successCount > 0 ? "partial" : "failed";

  return {
    status,
    intents_executed: done.size,
    results,
    context: ctx,
    meta: { timestamp: new Date().toISOString() },
  };
}

async function executeOne(
  intent: any,
  context: Record<string, any>,
  done: Set<string>,
  results: any[],
  userId: string,
  jiraDomain: string,
) {
  const id = intent.id || intent.intent;
  const name = intent.intent;
  const endpoint = (N8N_ENDPOINTS as any)[name];

  if (!endpoint) {
    const error = { intent: name, id, status: "error", error: `Unknown intent: ${name}` };
    context[id] = error;
    results.push(error);
    done.add(id);
    return;
  }

  try {
    // Base payload
    let payload: any = {
      user_id: userId,
      project_key: intent.payload?.project_key || "NT",
      jira_domain: jiraDomain,
      ...intent.payload,
    };
    if (!payload.project_id && payload.project_key) payload.project_id = payload.project_key;

    // Build payload from prior context if needed
    if (intent.build) payload = await buildPayloadFromContext(intent.build, context, payload);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    const raw = await res.json();
    const out = Array.isArray(raw) ? raw[0] : raw;

    // Normalize for downstream deps
    attachUnifiedItems(out);

    context[id] = out;
    results.push({ intent: name, id, status: "success", data: out });
    done.add(id);
  } catch (e: any) {
    const error = { intent: name, id, status: "error", error: e?.message ?? String(e) };
    context[id] = error;
    results.push(error);
    done.add(id);
  }
}

/** ---- Build payloads from $ctx paths with multiple shapes supported ---- **/
async function buildPayloadFromContext(build: any, ctx: Record<string, any>, base: any) {
  const payload = { ...base };
  if (!build?.from || !build?.map) return payload;

  // Resolve $ctx.<path> to an array
  const fromPath = String(build.from).replace(/^\$ctx\./, "");

  // Try different common locations automatically
  // e.g. "<id>.data.fetched" OR "<id>.data.issues" OR "<id>.data.items"
  let source =
    resolvePath(ctx, fromPath) ??
    resolvePath(ctx, fromPath.replace(/\.data\.issues$/, ".data.fetched")) ??
    resolvePath(ctx, fromPath.replace(/\.data\.fetched$/, ".data.issues")) ??
    resolvePath(ctx, fromPath.replace(/\.data\..+$/, ".data.items")) ??
    resolvePath(ctx, fromPath + ".data.items");

  if (!Array.isArray(source)) {
    // If fromPath points to the whole result, fall back to its normalized items
    const maybeResult = resolvePath(ctx, fromPath.split(".")[0]);
    const fallback = normalizeItems(maybeResult);
    source = Array.isArray(fallback) ? fallback : [];
  }

  // Optional filter (shallow key==value)
  if (build.filter && typeof build.filter === "object") {
    source = source.filter((it: any) => Object.entries(build.filter).every(([k, v]) => resolvePath(it, k) === v));
  }

  // Map to the target array name (we support the "updates[]": {...} pattern)
  const firstKey = Object.keys(build.map)[0]; // e.g. "updates[]"
  const targetName = firstKey.replace(/\[\]$/, ""); // "updates"
  const template = build.map[firstKey];

  payload[targetName] = source.map((item: any) => {
    const m: any = {};
    for (const [k, v] of Object.entries(template)) {
      if (typeof v === "string" && v.startsWith("$it.")) {
        m[k] = resolvePath(item, v.slice(4));
      } else {
        m[k] = v;
      }
    }
    return m;
  });

  return payload;
}

/** ------------- F O R M A T ----------------- **/
function formatWorkflowResult(workflowResult: any): string {
  if (!workflowResult?.results) return "";

  let out = "\n\n";
  const { results, status, intents_executed } = workflowResult;

  out +=
    status === "success"
      ? `✅ **All ${intents_executed} operations completed successfully**\n\n`
      : status === "partial"
        ? `⚠️ **${intents_executed} operations completed with some errors**\n\n`
        : `❌ **Operations failed**\n\n`;

  for (const r of results) {
    if (r.status === "error") {
      out += `❌ **${r.intent}** failed: ${r.error}\n\n`;
      continue;
    }
    const d = r.data ?? {};
    const items = normalizeItems(d);

    switch (r.intent) {
      case "create_ticket": {
        const created = d.created ?? items;
        if (Array.isArray(created) && created.length) {
          out += "### ✅ Created Tickets\n\n";
          created.forEach((x: any) => (out += `- **\`${typeof x === "string" ? x : x.key}\`**\n`));
          out += "\n";
        } else out += "### ✅ Tickets Created Successfully\n\n";
        break;
      }
      case "fetch_ticket": {
        out += `### 📋 Fetched ${items.length} Ticket${items.length !== 1 ? "s" : ""}\n\n`;
        if (items.length) {
          out += "| Key | Summary | Status | Assignee |\n|-----|---------|--------|----------|\n";
          items.forEach((t: any) => {
            const key = t.key ?? "N/A";
            const summary = (t.summary ?? t.fields?.summary ?? "No summary").slice(0, 60);
            const status = t.status ?? t.fields?.status?.name ?? "Unknown";
            const assignee =
              t.assignee ?? t.fields?.assignee?.displayName ?? t.fields?.assignee?.emailAddress ?? "Unassigned";
            out += `| \`${key}\` | ${summary} | ${status} | ${assignee} |\n`;
          });
          out += "\n";
        } else out += "No tickets found.\n\n";
        break;
      }
      case "update_ticket": {
        const updated = d.updated ?? d.updated_tickets ?? items;
        if (Array.isArray(updated) && updated.length) {
          out += `### ✏️ Updated ${updated.length} Ticket${updated.length !== 1 ? "s" : ""}\n\n`;
          updated.forEach((x: any) => (out += `- **\`${typeof x === "string" ? x : x.key}\`** updated\n`));
          out += "\n";
        } else out += "### ✏️ Tickets Updated Successfully\n\n";
        break;
      }
      case "comment_ticket": {
        const commented = d.commented ?? d.comments ?? items;
        if (Array.isArray(commented) && commented.length) {
          out += `### 💬 Added ${commented.length} Comment${commented.length !== 1 ? "s" : ""}\n\n`;
          commented.forEach((x: any) => (out += `- **\`${typeof x === "string" ? x : x.key}\`**\n`));
          out += "\n";
        } else out += "### 💬 Comments Added Successfully\n\n";
        break;
      }
      case "delete_ticket": {
        const deleted = d.deleted ?? items;
        if (Array.isArray(deleted) && deleted.length) {
          out += `### 🗑️ Deleted ${deleted.length} Ticket${deleted.length !== 1 ? "s" : ""}\n\n`;
          deleted.forEach((x: any) => (out += `- **\`${typeof x === "string" ? x : x.key}\`**\n`));
          out += "\n";
        } else out += "### 🗑️ Tickets Deleted Successfully\n\n";
        break;
      }
      default: {
        if (d.message) out += `${d.message}\n\n`;
        else out += `✅ ${r.intent} completed\n\n`;
      }
    }
  }

  return out || "\n\n✅ Your request has been processed successfully.";
}
