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
      // Placeholder for API orchestration
      // TODO: Implement parser and intent orchestration with n8n
      
      // Simulated response for demo
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      const assistantMessage: Message = {
        role: "assistant",
        content: "I've received your request. The API orchestration with n8n will be implemented to handle your Jira operations.",
      };
      
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
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
            <p className="text-sm text-muted-foreground">
              Ask me to create, fetch, or update Jira tickets...
            </p>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3 max-w-md">
                <div className="text-6xl mb-4">👋</div>
                <h2 className="text-2xl font-semibold">Welcome to Nesora</h2>
                <p className="text-muted-foreground">
                  I'm your AI-powered Jira assistant. Ask me to create, update, or manage your Jira tickets using natural language.
                </p>
                {!jiraConnected && (
                  <Button
                    onClick={() => setShowJiraModal(true)}
                    className="mt-4 bg-gradient-to-r from-primary to-primary/90"
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
