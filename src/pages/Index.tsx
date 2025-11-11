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

  // Auth effect
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!mounted) return;

      if (!session) {
        navigate("/auth", { replace: true });
        return;
      }

      await createOrUpdateProfile(session.user);
      checkJiraConnection();
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === "SIGNED_OUT" || !session) {
        setJiraConnected(false);
        setJiraDomain(undefined);
        navigate("/auth", { replace: true });
      } else if (event === "SIGNED_IN") {
        await createOrUpdateProfile(session.user);
        checkJiraConnection();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  // Scroll effect
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createOrUpdateProfile = async (user: any) => {
    try {
      await supabase.from("profiles").upsert(
        {
          user_id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name,
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    } catch (error) {
      console.error("Profile error:", error);
    }
  };

  const checkJiraConnection = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setJiraConnected(false);
        setJiraDomain(undefined);
        return;
      }

      const { data, error } = await supabase
        .from("jira_connections")
        .select("jira_domain, verified")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error || !data || !data.verified) {
        setJiraConnected(false);
        setJiraDomain(undefined);
      } else {
        setJiraConnected(true);
        setJiraDomain(data.jira_domain);
      }
    } catch (error) {
      console.error("Jira check error:", error);
      setJiraConnected(false);
      setJiraDomain(undefined);
    }
  };

  const handleSend = async () => {
    console.log("🔵 handleSend called", { input: input.trim(), isLoading, jiraConnected });
    
    if (!input.trim() || isLoading) {
      console.log("⚠️ handleSend blocked: empty input or loading");
      return;
    }

    if (!jiraConnected) {
      console.log("⚠️ handleSend blocked: Jira not connected");
      toast({
        title: "Jira not connected",
        description: "Please connect your Jira account first",
        variant: "destructive",
      });
      return;
    }

    const userMessage: Message = { role: "user", content: input };
    console.log("🔵 Adding user message", userMessage);
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      console.log("🔵 Getting user...");
      const { data: { user } } = await supabase.auth.getUser();
      console.log("🔵 User retrieved", { userId: user?.id });
      
      if (!user) throw new Error("Not authenticated");

      const payload = {
        messages: [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        })),
        userId: user.id,
        jiraDomain: jiraDomain,
      };
      
      console.log("🔵 Invoking ai-chat edge function with payload:", payload);

      const { data, error } = await supabase.functions.invoke("ai-chat", {
        body: payload,
      });

      console.log("🔵 Edge function response:", { data, error });

      if (error) {
        console.error("🔴 Edge function error:", error);
        throw error;
      }

      let assistantContent = data.message || "";
      if (data.formattedResult) {
        assistantContent += data.formattedResult;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: assistantContent || "Request processed successfully.",
        },
      ]);

      if (data.workflowResult) {
        console.log("Workflow result:", data.workflowResult);
      }
    } catch (error: any) {
      console.error("Chat error:", error);

      toast({
        title: "Error",
        description: error.message || "Failed to process request",
        variant: "destructive",
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Sorry, I encountered an error: ${error.message}`,
        },
      ]);
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
        <div className="border-b border-border bg-card/80 backdrop-blur-sm shadow-soft">
          <div className="px-6 py-5">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  Nesora Assistant
                </h1>
                {jiraConnected && jiraDomain && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <p className="text-sm text-muted-foreground">
                      Connected to <span className="font-medium text-foreground">{jiraDomain}.atlassian.net</span>
                    </p>
                  </div>
                )}
              </div>
              {jiraConnected && (
                <div className="px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-xs font-medium">
                  ✓ Active
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-6 max-w-2xl px-4">
                <div className="inline-block p-4 bg-gradient-primary rounded-3xl shadow-brand mb-2">
                  <svg className="w-16 h-16 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <h2 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                  Welcome to Nesora
                </h2>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  Your intelligent AI-powered Jira assistant. Just chat naturally—I understand context, learn from our conversation, and execute your requests instantly.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                  <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-soft transition-all">
                    <div className="text-3xl mb-3">🎯</div>
                    <p className="font-semibold mb-2 text-foreground">Smart Execution</p>
                    <p className="text-muted-foreground text-sm">I clarify only when truly ambiguous—otherwise, I act immediately</p>
                  </div>
                  <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-soft transition-all">
                    <div className="text-3xl mb-3">⚡</div>
                    <p className="font-semibold mb-2 text-foreground">Natural Language</p>
                    <p className="text-muted-foreground text-sm">Talk to me like a teammate—no commands needed</p>
                  </div>
                  <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-soft transition-all">
                    <div className="text-3xl mb-3">📊</div>
                    <p className="font-semibold mb-2 text-foreground">Beautiful Results</p>
                    <p className="text-muted-foreground text-sm">Rich formatting with tables, lists, and clear summaries</p>
                  </div>
                  <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-soft transition-all">
                    <div className="text-3xl mb-3">🔄</div>
                    <p className="font-semibold mb-2 text-foreground">Context Aware</p>
                    <p className="text-muted-foreground text-sm">I remember our conversation and learn your preferences</p>
                  </div>
                </div>
                {!jiraConnected && (
                  <Button
                    onClick={() => setShowJiraModal(true)}
                    className="mt-8 bg-gradient-primary hover:shadow-brand text-primary-foreground px-8"
                    size="lg"
                  >
                    <span className="text-lg">Get Started - Connect Jira</span>
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
        <div className="border-t border-border bg-card/80 backdrop-blur-sm p-6 shadow-soft">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-3">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me to create, fetch, or update Jira tickets..."
                className="flex-1 h-12 px-4 bg-background/50 border-border/50 focus:border-primary rounded-xl"
                disabled={isLoading}
              />
              <Button
                onClick={() => {
                  console.log("🔵 SEND BUTTON CLICKED");
                  handleSend();
                }}
                disabled={isLoading || !input.trim()}
                className="bg-gradient-primary hover:shadow-brand text-primary-foreground px-6 h-12 rounded-xl font-medium"
              >
                <Send className="h-5 w-5" />
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
