import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

serve(async (req) => {
  console.log("📨 jira-connect received request:", req.method);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, jira_domain, jira_email, jira_token } = await req.json();
    
    console.log("📨 Request body:", { user_id, jira_domain, jira_email: jira_email?.slice(0, 5) + "..." });
    
    if (!user_id || !jira_domain || !jira_email || !jira_token) {
      return new Response(
        JSON.stringify({ status: "error", message: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get n8n base URL from env
    const N8N_BASE_URL = Deno.env.get("N8N_BASE_URL");
    
    if (!N8N_BASE_URL) {
      console.error("❌ N8N_BASE_URL not configured");
      return new Response(
        JSON.stringify({ status: "error", message: "N8N_BASE_URL is not configured in secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const webhookUrl = `${N8N_BASE_URL}/webhook/mcp/connect`;
    console.log("📤 Calling n8n webhook:", webhookUrl);

    const connectResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id,
        jira_domain,
        jira_email,
        jira_token,
      }),
    });

    console.log("📥 n8n response status:", connectResponse.status);

    if (!connectResponse.ok) {
      const errorText = await connectResponse.text();
      console.error("❌ n8n error:", errorText);
      return new Response(
        JSON.stringify({ 
          status: "error", 
          message: `Connection failed (${connectResponse.status}): ${errorText}` 
        }),
        { status: connectResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawResult = await connectResponse.json();
    console.log("📥 n8n raw result:", JSON.stringify(rawResult).slice(0, 300));
    
    // Unwrap n8n response format (often returns [{ json: {...} }])
    let result = rawResult;
    if (Array.isArray(rawResult)) {
      result = rawResult[0];
      if (result && typeof result === "object" && "json" in result) {
        result = result.json;
      }
    } else if (typeof rawResult === "object" && "json" in rawResult) {
      result = rawResult.json;
    }

    console.log("✅ Connection result:", JSON.stringify(result).slice(0, 200));

    // Check for error status in response
    if (result?.status === "error") {
      return new Response(
        JSON.stringify(result),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ status: "success", ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("❌ Edge function error:", err);
    return new Response(
      JSON.stringify({ status: "error", message: err?.message ?? "Failed to connect" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
