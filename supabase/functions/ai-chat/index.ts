import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const N8N_BASE_URL = "https://antibodies-concerning-sega-far.trycloudflare.com";
const N8N_ENDPOINTS = {
  parser: `${N8N_BASE_URL}/webhook/mcp/parser`,
  create_ticket: `${N8N_BASE_URL}/webhook/mcp/create`,
  fetch_ticket: `${N8N_BASE_URL}/webhook/mcp/fetch`,
  update_ticket: `${N8N_BASE_URL}/webhook/mcp/update`,
  comment_ticket: `${N8N_BASE_URL}/webhook/mcp/comment`,
  delete_ticket: `${N8N_BASE_URL}/webhook/mcp/delete`,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, userId, jiraDomain } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

const systemPrompt = `You are Nesora, an AI-powered Jira Execution Assistant. You are intelligent, proactive, and excellent at understanding user intent.

CORE CAPABILITIES:
- **Create** Jira tickets with rich details (summary, description, priority, labels, assignee)
- **Fetch/Search** tickets using smart filters (status, assignee, labels, JQL, date ranges)
- **Update** ticket fields (status transitions, assignee, priority, labels, descriptions)
- **Comment** on tickets with contextual notes
- **Delete** tickets when needed

INTELLIGENCE & REASONING:
- Understand natural language with context awareness
- Infer missing details from conversation history
- Recognize patterns (e.g., "all in-progress tickets" = status filter)
- Suggest related actions (e.g., "Would you also like me to notify the assignee?")
- Learn from user preferences within the session

WHEN TO ASK CLARIFYING QUESTIONS:
Only ask when the request is genuinely ambiguous:
- Missing critical identifiers (e.g., "update the ticket" without specifying which)
- Unclear status names (e.g., "mark as complete" when multiple statuses exist)
- Missing required fields for creation without context clues
- Conflicting instructions (e.g., "assign to John but also to Sarah")

WHEN TO EXECUTE IMMEDIATELY:
- Clear, unambiguous requests (e.g., "create a bug for login issue")
- Requests with sufficient context from conversation history
- Obvious filters (e.g., "all my tickets" = assignee filter)
- Standard operations (e.g., "show open tickets")

RESPONSE FORMATTING:
Use rich markdown for beautiful, scannable responses:
- **Tables** for multiple tickets with columns: Key, Summary, Status, Priority, Assignee
- **Bullet points** for lists of actions or summaries
- **Code blocks** for ticket IDs/keys (\`NT-123\`)
- **Bold** for important info, *italic* for emphasis
- **Emojis** strategically: ✅ success, ⚠️ warnings, 🎯 actions, 📊 data
- **Sections** with headers for complex results

RESULT PRESENTATION:
- Lead with a summary sentence
- Show key details in structured format (tables/lists)
- Highlight important changes or findings
- Suggest next actions when relevant
- Include ticket links when available

ERROR HANDLING:
- Explain errors in plain language
- Provide specific solutions, not generic advice
- Offer alternatives when primary action fails
- Show what succeeded in partial failures

USER CONTEXT:
- User ID: ${userId}
- Jira Domain: ${jiraDomain}

RESPONSE FORMAT:
When executing Jira operations:
{
  "needsClarification": false,
  "message": "✅ I'll create that bug ticket for you right away...",
  "action": {
    "query": "create a high-priority bug ticket for login issue with description about form validation",
    "context": {
      "source": "lovable",
      "project_key": "NT"
    }
  }
}

When needing clarification:
{
  "needsClarification": true,
  "message": "I can help with that! Just to clarify: which specific ticket would you like me to update? Please provide the ticket key (e.g., \`NT-123\`) or describe it (e.g., 'the login bug from yesterday')."
}

When conversing:
{
  "needsClarification": false,
  "message": "👋 Hi! I'm Nesora, your AI-powered Jira assistant. I can help you create, manage, and organize your Jira tickets through natural conversation. What would you like to work on?"
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: "Rate limit exceeded. Please try again in a moment." 
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: "AI service requires payment. Please add credits to your workspace." 
        }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI service error");
    }

    const data = await response.json();
    const aiMessage = data.choices[0].message.content;

    // Try to parse as JSON, if it fails, treat as plain text
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(aiMessage);
    } catch {
      parsedResponse = {
        needsClarification: false,
        message: aiMessage
      };
    }

    // If AI wants to execute an action, call the n8n workflows
    if (parsedResponse.action && !parsedResponse.needsClarification) {
      try {
        // Call WF7 (Parser)
        console.log("Calling parser with query:", parsedResponse.action.query);
        const parserResponse = await fetch(N8N_ENDPOINTS.parser, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            query: parsedResponse.action.query,
            context: parsedResponse.action.context
          })
        });

        if (!parserResponse.ok) {
          throw new Error(`Parser workflow failed: ${parserResponse.statusText}`);
        }

        const parserData = await parserResponse.json();
        console.log("Parser result:", JSON.stringify(parserData, null, 2));

        // Check if parser returned intents
        if (!parserData.intents || parserData.intents.length === 0) {
          return new Response(JSON.stringify({
            message: parsedResponse.message + "\n\n⚠️ I couldn't determine the specific actions to take. Could you please provide more details?"
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Execute intents sequentially, respecting dependencies
        console.log("Executing intents from parser");
        const workflowResult = await executeIntents(parserData.intents, userId, jiraDomain);
        console.log("Workflow result:", JSON.stringify(workflowResult, null, 2));

        // Format the workflow result nicely
        return new Response(JSON.stringify({
          message: parsedResponse.message,
          workflowResult: workflowResult,
          formattedResult: formatWorkflowResult(workflowResult)
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      } catch (workflowError: any) {
        console.error("Workflow execution error:", workflowError);
        return new Response(JSON.stringify({
          message: `Sorry, something went wrong while processing your Jira workflows: ${workflowError.message}`,
          error: workflowError.message
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Return the AI response
    return new Response(JSON.stringify(parsedResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("AI chat error:", error);
    return new Response(JSON.stringify({ 
      error: error.message || "Failed to process your request" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Execute intents with dependency resolution and parallel execution
async function executeIntents(intents: any[], userId: string, jiraDomain: string) {
  const context: any = {};
  const results: any[] = [];
  const executed = new Set<string>();
  
  console.log(`\n🚀 Starting execution of ${intents.length} intents`);

  // Execute in waves: parallel for non-dependent, sequential for dependent
  while (executed.size < intents.length) {
    // Find all intents ready to execute (no unmet dependencies)
    const readyIntents = intents.filter(intent => {
      const intentId = intent.id || intent.intent;
      if (executed.has(intentId)) return false;
      
      const dependencies = intent.depends_on || [];
      return dependencies.every((dep: string) => executed.has(dep));
    });

    if (readyIntents.length === 0) {
      console.error("⚠️ Circular dependency or unresolvable dependencies detected");
      break;
    }

    // Execute all ready intents in parallel
    console.log(`\n📦 Executing batch of ${readyIntents.length} ready intents`);
    await Promise.all(
      readyIntents.map(intent => executeIntent(intent, context, executed, results, userId, jiraDomain))
    );
  }

  // Calculate overall status
  const successCount = results.filter(r => r.status === "success").length;
  const errorCount = results.filter(r => r.status === "error").length;
  let overallStatus = "success";
  if (errorCount === results.length) overallStatus = "failed";
  else if (errorCount > 0) overallStatus = "partial";

  console.log(`\n✅ Execution complete: ${successCount} succeeded, ${errorCount} failed`);

  return {
    status: overallStatus,
    intents_executed: executed.size,
    results,
    context,
    meta: { timestamp: new Date().toISOString() }
  };
}

// Execute a single intent
async function executeIntent(
  intent: any,
  context: any,
  executed: Set<string>,
  results: any[],
  userId: string,
  jiraDomain: string
) {
  const intentId = intent.id || intent.intent;
  const intentName = intent.intent;
  
  console.log(`\n🎯 Executing: ${intentName} (${intentId})`);

  const endpoint = N8N_ENDPOINTS[intentName as keyof typeof N8N_ENDPOINTS];
  if (!endpoint) {
    console.error(`❌ Unknown intent: ${intentName}`);
    const errorResult = { intent: intentName, id: intentId, status: "error", error: `Unknown intent: ${intentName}` };
    context[intentId] = errorResult;
    results.push(errorResult);
    executed.add(intentId);
    return;
  }

  try {
    // Start with base payload
    let payload: any = {
      user_id: userId,
      project_key: intent.payload?.project_key || "NT",
      jira_domain: jiraDomain,
      ...intent.payload
    };

    // Ensure project_id is set if missing
    if (!payload.project_id && payload.project_key) {
      payload.project_id = payload.project_key;
    }

    // Handle dynamic build logic
    if (intent.build) {
      payload = await buildPayloadFromContext(intent.build, context, payload);
    }

    console.log(`📤 Payload:`, JSON.stringify(payload, null, 2));

    // Execute HTTP request
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const rawResult = await response.json();
    const result = Array.isArray(rawResult) ? rawResult[0] : rawResult;

    console.log(`✅ Success:`, JSON.stringify(result, null, 2).substring(0, 200));

    // Store result
    context[intentId] = result;
    results.push({
      intent: intentName,
      id: intentId,
      status: "success",
      data: result
    });
    executed.add(intentId);

  } catch (error: any) {
    console.error(`❌ Error in ${intentName}:`, error.message);
    const errorResult = {
      intent: intentName,
      id: intentId,
      status: "error",
      error: error.message
    };
    context[intentId] = errorResult;
    results.push(errorResult);
    executed.add(intentId);
  }
}

// Build payload dynamically from context using build instructions
async function buildPayloadFromContext(build: any, context: any, basePayload: any): Promise<any> {
  const payload = { ...basePayload };

  if (!build.from || !build.map) {
    console.warn("⚠️ Build block missing 'from' or 'map'");
    return payload;
  }

  try {
    // Resolve source data from context (e.g., "$ctx.fetch_in_progress_tickets.data.issues")
    const fromPath = build.from.replace('$ctx.', '');
    let sourceData = resolveContextPath(context, fromPath);

    if (!Array.isArray(sourceData)) {
      console.warn(`⚠️ Source data is not an array: ${fromPath}`);
      return payload;
    }

    console.log(`🔍 Found ${sourceData.length} items from ${fromPath}`);

    // Apply filter if present
    if (build.filter) {
      const originalLength = sourceData.length;
      sourceData = sourceData.filter((item: any) => {
        return Object.entries(build.filter).every(([key, value]) => item[key] === value);
      });
      console.log(`🔎 Filtered from ${originalLength} to ${sourceData.length} items`);
    }

    // Map data to target array
    const mapInstructions = build.map;
    const targetKey = Object.keys(mapInstructions)[0].replace('[]', ''); // "updates[]" → "updates"
    const mapTemplate = mapInstructions[Object.keys(mapInstructions)[0]];

    payload[targetKey] = sourceData.map((item: any) => {
      const mappedItem: any = {};
      for (const [key, value] of Object.entries(mapTemplate)) {
        if (typeof value === 'string' && value.startsWith('$it.')) {
          // Token replacement: $it.key → item.key
          const itemKey = value.replace('$it.', '');
          mappedItem[key] = resolveContextPath(item, itemKey);
        } else {
          // Literal value
          mappedItem[key] = value;
        }
      }
      return mappedItem;
    });

    console.log(`🔨 Built ${targetKey} array with ${payload[targetKey].length} items`);

  } catch (error: any) {
    console.error(`❌ Error building payload:`, error.message);
  }

  return payload;
}

// Resolve nested paths like "fetch_tickets.data.issues" or "key"
function resolveContextPath(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

// Format workflow results into a readable message
function formatWorkflowResult(workflowResult: any): string {
  if (!workflowResult || !workflowResult.results) return "";

  let formatted = "\n\n";
  const { results, status, intents_executed } = workflowResult;

  // Add overall status header
  if (status === "success") {
    formatted += `✅ **All ${intents_executed} operations completed successfully**\n\n`;
  } else if (status === "partial") {
    formatted += `⚠️ **${intents_executed} operations completed with some errors**\n\n`;
  } else if (status === "failed") {
    formatted += `❌ **Operations failed**\n\n`;
  }

  // Process each result
  for (const result of results) {
    if (result.status === "error") {
      formatted += `❌ **${result.intent}** failed: ${result.error}\n\n`;
      continue;
    }

    const data = result.data;

    // Format based on intent type
    switch (result.intent) {
      case "create_ticket":
        if (data.tickets && Array.isArray(data.tickets)) {
          formatted += "### ✅ Created Tickets\n\n";
          data.tickets.forEach((ticket: any) => {
            formatted += `- **\`${ticket.key}\`** — ${ticket.summary}\n`;
          });
          formatted += "\n";
        } else if (data.created && Array.isArray(data.created)) {
          formatted += "### ✅ Created Tickets\n\n";
          data.created.forEach((key: string) => {
            formatted += `- **\`${key}\`**\n`;
          });
          formatted += "\n";
        } else if (data.success) {
          formatted += "### ✅ Tickets Created Successfully\n\n";
        }
        break;

      case "fetch_ticket":
        const tickets = data.tickets || data.data?.issues || [];
        if (Array.isArray(tickets)) {
          formatted += `### 📋 Fetched ${tickets.length} Ticket${tickets.length !== 1 ? 's' : ''}\n\n`;
          if (tickets.length === 0) {
            formatted += "No tickets found matching your criteria.\n\n";
          } else {
            formatted += "| Key | Summary | Status | Assignee |\n";
            formatted += "|-----|---------|--------|----------|\n";
            tickets.forEach((ticket: any) => {
              const key = ticket.key || "N/A";
              const summary = (ticket.summary || ticket.fields?.summary || "No summary").substring(0, 50);
              const status = ticket.status || ticket.fields?.status?.name || "Unknown";
              const assignee = ticket.assignee || ticket.fields?.assignee?.displayName || ticket.fields?.assignee?.emailAddress || "Unassigned";
              formatted += `| \`${key}\` | ${summary} | ${status} | ${assignee} |\n`;
            });
            formatted += "\n";
          }
        }
        break;

      case "update_ticket":
        if (data.updated && Array.isArray(data.updated)) {
          formatted += `### ✏️ Updated ${data.updated.length} Ticket${data.updated.length !== 1 ? 's' : ''}\n\n`;
          data.updated.forEach((ticket: any) => {
            const key = typeof ticket === 'string' ? ticket : ticket.key;
            formatted += `- **\`${key}\`** updated successfully\n`;
          });
          formatted += "\n";
        } else if (data.success) {
          formatted += "### ✏️ Tickets Updated Successfully\n\n";
        }
        break;

      case "comment_ticket":
        if (data.comments && Array.isArray(data.comments)) {
          formatted += `### 💬 Added ${data.comments.length} Comment${data.comments.length !== 1 ? 's' : ''}\n\n`;
          data.comments.forEach((comment: any) => {
            const key = typeof comment === 'string' ? comment : comment.key;
            formatted += `- Comment added to **\`${key}\`**\n`;
          });
          formatted += "\n";
        } else if (data.commented && Array.isArray(data.commented)) {
          formatted += `### 💬 Added ${data.commented.length} Comment${data.commented.length !== 1 ? 's' : ''}\n\n`;
          data.commented.forEach((key: string) => {
            formatted += `- Comment added to **\`${key}\`**\n`;
          });
          formatted += "\n";
        } else if (data.success) {
          formatted += "### 💬 Comments Added Successfully\n\n";
        }
        break;

      case "delete_ticket":
        if (data.deleted && Array.isArray(data.deleted)) {
          formatted += `### 🗑️ Deleted ${data.deleted.length} Ticket${data.deleted.length !== 1 ? 's' : ''}\n\n`;
          data.deleted.forEach((ticket: any) => {
            const key = typeof ticket === 'string' ? ticket : ticket.key;
            formatted += `- **\`${key}\`** deleted\n`;
          });
          formatted += "\n";
        } else if (data.success) {
          formatted += "### 🗑️ Tickets Deleted Successfully\n\n";
        }
        break;

      default:
        if (data.message) {
          formatted += `${data.message}\n\n`;
        } else if (data.success) {
          formatted += `✅ ${result.intent} completed successfully\n\n`;
        }
    }
  }

  return formatted || "\n\n✅ Your request has been processed successfully.";
}
