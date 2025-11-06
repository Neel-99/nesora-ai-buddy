import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Send } from "lucide-react";
import ChatMessage from "@/components/ChatMessage";
import TypingIndicator from "@/components/TypingIndicator";
import ChatSidebar from "@/components/ChatSidebar";
import JiraConnectModal from "@/components/JiraConnectModal";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [jiraConnected, setJiraConnected] = useState(false);
  const [jiraDomain, setJiraDomain] = useState<string>();
  const [showJiraModal, setShowJiraModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check authentication
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      }
    });

    // Check Jira connection
    checkJiraConnection();

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const checkJiraConnection = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("jira_connections")
        .select("jira_domain")
        .eq("user_id", user.id)
        .single();

      if (!error && data) {
        setJiraConnected(true);
        setJiraDomain(data.jira_domain);
      }
    } catch (error) {
      console.error("Error checking Jira connection:", error);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    if (!jiraConnected) {
      toast({
        title: "Jira Not Connected",
        description: "Please connect your Jira account first",
        variant: "destructive",
      });
      return;
    }

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Step 1: Call WF7 (Parser) - Parse user query into structured intents
      const parserResponse = await fetch("http://localhost:5678/webhook/mcp/parser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          query: input,
          context: {
            source: "lovable",
            project_key: "NT"
          }
        })
      });

      if (!parserResponse.ok) {
        throw new Error(`Parser failed: ${parserResponse.statusText}`);
      }

      const parserData = await parserResponse.json();

      // Step 2: Call WF8 (Router) - Execute workflows based on parsed intents
      const routerResponse = await fetch("http://localhost:5678/webhook/mcp/router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parserData)
      });

      if (!routerResponse.ok) {
        throw new Error(`Router failed: ${routerResponse.statusText}`);
      }

      const routerData = await routerResponse.json();

      // Display the summary from the router as the assistant's response
      const assistantMessage: Message = {
        role: "assistant",
        content: routerData.summary || "Your request was processed successfully.",
      };
      
      setMessages((prev) => [...prev, assistantMessage]);

      // Log full response for debugging (can be expanded to UI later)
      console.log("Full Router Response:", routerData);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to process your request",
        variant: "destructive",
      });

      // Add error message to chat
      const errorMessage: Message = {
        role: "assistant",
        content: `Sorry, I encountered an error: ${error.message}. Please ensure n8n workflows are running on localhost:5678.`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <ChatSidebar
        onConnectJira={() => setShowJiraModal(true)}
        jiraConnected={jiraConnected}
        jiraDomain={jiraDomain}
      />

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-border bg-card">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Nesora Assistant
            </h1>
            {jiraConnected && jiraDomain && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <span className="text-green-500">✓</span> Connected to: {jiraDomain}.atlassian.net
              </p>
            )}
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-4 max-w-lg">
                <div className="text-6xl mb-4">👋</div>
                <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  Welcome to Nesora
                </h2>
                <p className="text-muted-foreground text-lg">
                  I'm your AI-powered Jira assistant. Ask me to create, update, or manage your Jira tickets using natural language.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 text-sm text-left">
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="font-medium mb-1">✨ Natural Language</p>
                    <p className="text-muted-foreground text-xs">Just type what you need in plain English</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="font-medium mb-1">⚡ Instant Actions</p>
                    <p className="text-muted-foreground text-xs">Create, update, and manage tickets instantly</p>
                  </div>
                </div>
                {!jiraConnected && (
                  <Button
                    onClick={() => setShowJiraModal(true)}
                    className="mt-6 bg-gradient-to-r from-primary to-primary/90 hover:shadow-brand"
                    size="lg"
                  >
                    Get Started - Connect Jira
                  </Button>
                )}
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <ChatMessage key={index} role={message.role} content={message.content} />
          ))}

          {isLoading && <TypingIndicator />}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border bg-card p-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me to create, fetch, or update Jira tickets..."
                className="flex-1"
                disabled={isLoading}
              />
              <Button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <JiraConnectModal
        open={showJiraModal}
        onOpenChange={setShowJiraModal}
        onConnected={checkJiraConnection}
      />
    </div>
  );
};

export default Index;
