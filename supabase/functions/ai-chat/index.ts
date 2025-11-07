import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
        const parserResponse = await fetch("https://loads-donna-lighting-conventions.trycloudflare.com/webhook/mcp/parser", {
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

        // Call WF8 (Router)
        const routerResponse = await fetch("https://loads-donna-lighting-conventions.trycloudflare.com/webhook/mcp/router", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parserData)
        });

        if (!routerResponse.ok) {
          throw new Error(`Router workflow failed: ${routerResponse.statusText}`);
        }

        const routerData = await routerResponse.json();

        // Format the workflow result nicely
        return new Response(JSON.stringify({
          message: parsedResponse.message,
          workflowResult: routerData,
          formattedResult: formatWorkflowResult(routerData)
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      } catch (workflowError: any) {
        console.error("Workflow execution error:", workflowError);
        return new Response(JSON.stringify({
          message: `I encountered an error while executing that action: ${workflowError.message}. Please ensure your n8n workflows are running on localhost:5678.`,
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

function formatWorkflowResult(data: any): string {
  if (!data) return "";

  let formatted = "";

  // If there's a summary, use it as the headline
  if (data.summary) {
    formatted += `\n\n### 📊 Execution Summary\n${data.summary}\n`;
  }

  // Format detailed results if available
  if (data.results && Array.isArray(data.results)) {
    formatted += "\n### 📝 Detailed Results\n";
    
    data.results.forEach((result: any, index: number) => {
      if (result.success) {
        formatted += `\n**✅ Step ${index + 1}: ${result.intent || 'Completed'}**\n`;
        
        // Format ticket data
        if (result.data) {
          if (Array.isArray(result.data) && result.data.length > 0) {
            formatted += `\n📌 Found **${result.data.length}** ticket(s):\n\n`;
            formatted += "| Key | Summary | Status | Priority |\n";
            formatted += "|-----|---------|--------|----------|\n";
            result.data.slice(0, 5).forEach((ticket: any) => {
              formatted += `| \`${ticket.key || 'N/A'}\` | ${ticket.fields?.summary || 'No summary'} | ${ticket.fields?.status?.name || 'Unknown'} | ${ticket.fields?.priority?.name || 'None'} |\n`;
            });
            if (result.data.length > 5) {
              formatted += `\n*...and ${result.data.length - 5} more*\n`;
            }
          } else if (result.data.key) {
            formatted += `\n🎯 **Ticket:** \`${result.data.key}\`\n`;
            if (result.data.fields?.summary) {
              formatted += `**Summary:** ${result.data.fields.summary}\n`;
            }
            if (result.data.fields?.status?.name) {
              formatted += `**Status:** ${result.data.fields.status.name}\n`;
            }
          } else if (typeof result.data === 'object') {
            formatted += `\n${JSON.stringify(result.data, null, 2)}\n`;
          }
        }
      } else {
        formatted += `\n**❌ Step ${index + 1}: ${result.intent || 'Failed'}**\n`;
        formatted += `⚠️ Error: ${result.error || 'Unknown error'}\n`;
      }
    });
  }

  return formatted || "\n\n✅ Operation completed successfully.";
}
