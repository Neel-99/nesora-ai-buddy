import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const N8N_BASE_URL = "https://independence-actor-novel-beds.trycloudflare.com";
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

// Execute intents in order, handling dependencies
async function executeIntents(intents: any[], userId: string, jiraDomain: string) {
  const context: any = {};
  const executionOrder: any[] = [];

  // Build execution order respecting dependencies
  const executed = new Set<string>();
  
  while (executed.size < intents.length) {
    let progressMade = false;
    
    for (const intent of intents) {
      const intentId = intent.id || intent.intent;
      
      if (executed.has(intentId)) continue;
      
      // Check if dependencies are met
      const dependencies = intent.depends_on || [];
      const canExecute = dependencies.every((dep: string) => executed.has(dep));
      
      if (canExecute) {
        executionOrder.push(intent);
        executed.add(intentId);
        progressMade = true;
      }
    }
    
    // Prevent infinite loop if dependencies cannot be resolved
    if (!progressMade) {
      console.error("Circular dependency detected or unresolvable dependencies");
      break;
    }
  }

  // Execute intents in order
  for (const intent of executionOrder) {
    const intentId = intent.id || intent.intent;
    const intentName = intent.intent;
    const endpoint = N8N_ENDPOINTS[intentName as keyof typeof N8N_ENDPOINTS];
    
    if (!endpoint) {
      console.error(`Unknown intent: ${intentName}`);
      context[intentId] = { error: `Unknown intent: ${intentName}` };
      continue;
    }

    // Start with base payload
    let payload = {
      user_id: userId,
      project_key: "NT",
      jira_domain: jiraDomain,
      ...intent.payload
    };

    // Handle dynamic build logic if present
    if (intent.build && intent.depends_on && intent.depends_on.length > 0) {
      try {
        // Get source data from context using the 'from' path
        const fromPath = intent.build.from.replace('$ctx.', '');
        const pathParts = fromPath.split('.');
        let sourceData = context;
        
        for (const part of pathParts) {
          if (sourceData && typeof sourceData === 'object') {
            sourceData = sourceData[part];
          }
        }

        // Map over source data to build payload arrays
        if (Array.isArray(sourceData) && intent.build.map) {
          const mapInstructions = intent.build.map;
          
          // Get the target array key (e.g., "updates[]" -> "updates")
          const targetKey = Object.keys(mapInstructions)[0].replace('[]', '');
          const mapTemplate = mapInstructions[Object.keys(mapInstructions)[0]];
          
          // Build the array by mapping over source data
          payload[targetKey] = sourceData.map((item: any) => {
            const mappedItem: any = {};
            
            for (const [key, value] of Object.entries(mapTemplate)) {
              if (typeof value === 'string' && value.startsWith('$it.')) {
                // Replace $it.key with item.key
                const itemKey = value.replace('$it.', '');
                mappedItem[key] = item[itemKey];
              } else {
                // Use literal value
                mappedItem[key] = value;
              }
            }
            
            return mappedItem;
          });
        }
      } catch (buildError: any) {
        console.error(`Error building payload for ${intentId}:`, buildError);
      }
    }

    console.log(`Executing intent: ${intentName} (${intentId})`, JSON.stringify(payload, null, 2));

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`${intentName} failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Store in context using the intent's ID
      context[intentId] = Array.isArray(result) ? result[0] : result;
      
      console.log(`${intentName} (${intentId}) result:`, JSON.stringify(context[intentId], null, 2));
    } catch (error: any) {
      console.error(`Error executing ${intentName} (${intentId}):`, error);
      context[intentId] = { error: error.message };
    }
  }

  return { intents: executionOrder, context };
}

// Format workflow results into a readable message
function formatWorkflowResult(workflowResult: any): string {
  if (!workflowResult || !workflowResult.context) return "";

  let formatted = "\n\n";
  const { intents, context } = workflowResult;

  // Process each intent result
  for (const intent of intents) {
    const intentId = intent.id || intent.intent;
    const intentName = intent.intent;
    const result = context[intentId];

    if (!result || result.error) {
      formatted += `❌ **${intentName}** failed: ${result?.error || "Unknown error"}\n\n`;
      continue;
    }

    // Format based on intent type
    switch (intentName) {
      case "create_ticket":
        if (result.tickets && Array.isArray(result.tickets)) {
          formatted += "### ✅ Created Tickets\n\n";
          result.tickets.forEach((ticket: any) => {
            formatted += `- **${ticket.key}** - ${ticket.summary}\n`;
          });
          formatted += "\n";
        } else if (result.success) {
          formatted += "### ✅ Tickets Created Successfully\n\n";
        }
        break;

      case "fetch_ticket":
        if (result.tickets && Array.isArray(result.tickets)) {
          formatted += "### 📋 Fetched Tickets\n\n";
          if (result.tickets.length === 0) {
            formatted += "No tickets found matching your criteria.\n\n";
          } else {
            formatted += "| Key | Summary | Status | Assignee |\n";
            formatted += "|-----|---------|--------|----------|\n";
            result.tickets.forEach((ticket: any) => {
              const key = ticket.key || "N/A";
              const summary = (ticket.summary || ticket.fields?.summary || "No summary").substring(0, 50);
              const status = ticket.status || ticket.fields?.status?.name || "Unknown";
              const assignee = ticket.assignee || ticket.fields?.assignee?.displayName || "Unassigned";
              formatted += `| \`${key}\` | ${summary} | ${status} | ${assignee} |\n`;
            });
            formatted += "\n";
          }
        }
        break;

      case "update_ticket":
        if (result.updated && Array.isArray(result.updated)) {
          formatted += "### ✏️ Updated Tickets\n\n";
          result.updated.forEach((ticket: any) => {
            formatted += `- **${ticket.key}** updated successfully\n`;
          });
          formatted += "\n";
        } else if (result.success) {
          formatted += "### ✏️ Tickets Updated Successfully\n\n";
        }
        break;

      case "comment_ticket":
        if (result.comments && Array.isArray(result.comments)) {
          formatted += "### 💬 Added Comments\n\n";
          result.comments.forEach((comment: any) => {
            formatted += `- Comment added to **${comment.key}**\n`;
          });
          formatted += "\n";
        } else if (result.success) {
          formatted += "### 💬 Comments Added Successfully\n\n";
        }
        break;

      case "delete_ticket":
        if (result.deleted && Array.isArray(result.deleted)) {
          formatted += "### 🗑️ Deleted Tickets\n\n";
          result.deleted.forEach((ticket: any) => {
            formatted += `- **${ticket.key}** deleted\n`;
          });
          formatted += "\n";
        } else if (result.success) {
          formatted += "### 🗑️ Tickets Deleted Successfully\n\n";
        }
        break;

      default:
        if (result.message) {
          formatted += `${result.message}\n\n`;
        } else if (result.success) {
          formatted += `✅ ${intentName} completed successfully\n\n`;
        }
    }
  }

  return formatted || "\n\n✅ Your request has been processed successfully.";
}
