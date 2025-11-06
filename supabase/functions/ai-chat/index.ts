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

    const systemPrompt = `You are Nesora, an AI-powered Jira Execution Assistant. You help users manage their Jira tickets through natural conversation.

CAPABILITIES:
- Create Jira tickets (issues)
- Fetch/search tickets by filters (status, assignee, labels, etc.)
- Update ticket fields (status, assignee, priority, labels, description)
- Add comments to tickets
- Delete tickets

WORKFLOW INTEGRATION:
You have access to these n8n workflows:
- WF7 (Parser): Parses user queries into structured intents
- WF8 (Router): Routes intents to appropriate Jira workflows

CONVERSATION STYLE:
- Be conversational and friendly
- When requests are CLEAR and unambiguous, acknowledge what you'll do and execute immediately
- When requests are AMBIGUOUS or missing critical info, ask clarifying questions:
  * Missing ticket ID/key when updating specific tickets
  * Unclear status values (e.g., "move to done" vs specific status name)
  * Missing required fields for creation (summary, issue type)
  * Ambiguous filters that could match many tickets
- Format responses beautifully using markdown:
  * Use tables for multiple tickets
  * Use bullet points for lists
  * Use code blocks for IDs/keys
  * Use emojis sparingly for visual appeal
- After executing actions, provide clear confirmation and relevant details
- If errors occur, explain them clearly and suggest solutions

USER CONTEXT:
- User ID: ${userId}
- Jira Domain: ${jiraDomain}

RESPONSE FORMAT:
When you need to execute Jira operations, respond with JSON in this exact format:
{
  "needsClarification": false,
  "message": "I'll create a new bug ticket for you...",
  "action": {
    "query": "create a bug ticket for login issue",
    "context": {
      "source": "lovable",
      "project_key": "NT"
    }
  }
}

When you need clarification:
{
  "needsClarification": true,
  "message": "I need a bit more information. Which ticket would you like me to update? Please provide the ticket key (e.g., NT-123)."
}

When just having a conversation:
{
  "needsClarification": false,
  "message": "Hello! I'm Nesora, your Jira assistant. How can I help you today?"
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
        const parserResponse = await fetch("http://localhost:5678/webhook/mcp/parser", {
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
        const routerResponse = await fetch("http://localhost:5678/webhook/mcp/router", {
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

  // If there's a summary, use it
  if (data.summary) {
    let formatted = `\n\n**Result:**\n${data.summary}`;

    // Add detailed results if available
    if (data.results && Array.isArray(data.results)) {
      formatted += "\n\n**Details:**\n";
      data.results.forEach((result: any, index: number) => {
        if (result.success) {
          formatted += `\n✅ Step ${index + 1}: ${result.intent || 'Completed'}`;
          if (result.data) {
            if (Array.isArray(result.data) && result.data.length > 0) {
              formatted += `\n   Found ${result.data.length} item(s)`;
            } else if (result.data.key) {
              formatted += `\n   Ticket: \`${result.data.key}\``;
            }
          }
        } else {
          formatted += `\n❌ Step ${index + 1}: ${result.error || 'Failed'}`;
        }
      });
    }

    return formatted;
  }

  return "\n\n✅ Operation completed successfully.";
}
