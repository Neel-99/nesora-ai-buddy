import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Link2 } from "lucide-react";

interface JiraConnectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}

const JiraConnectModal = ({ open, onOpenChange, onConnected }: JiraConnectModalProps) => {
  console.log("🟢 JiraConnectModal rendered", { open });
  
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    jiraDomain: "",
    jiraEmail: "",
    jiraToken: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("🔵 Jira Connect: Form submitted");
    
    if (loading) {
      console.log("🔵 Jira Connect: Already loading, ignoring submit");
      return;
    }
    
    setLoading(true);
    console.log("🔵 Jira Connect: Starting connection process");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      console.log("🔵 Jira Connect: Got user", user?.id);
      
      if (!user) {
        throw new Error("Not authenticated");
      }

      // Normalize domain
      let normalizedDomain = formData.jiraDomain.trim();
      normalizedDomain = normalizedDomain.replace(/\.atlassian\.net\/?$/, "");
      normalizedDomain = normalizedDomain.replace(/^https?:\/\//, "");
      normalizedDomain = normalizedDomain.split("/")[0];

      const jiraBaseUrl = `https://${normalizedDomain}.atlassian.net`;
      console.log("🔵 Jira Connect: Normalized domain", { normalizedDomain, jiraBaseUrl });

      // Call webhook with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log("🔴 Jira Connect: Request timed out after 30s");
        controller.abort();
      }, 30000);

      const webhookUrl = "https://antibodies-concerning-sega-far.trycloudflare.com/webhook/mcp/connect";
      console.log("🔵 Jira Connect: Calling webhook", webhookUrl);

      const connectResponse = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          jira_domain: jiraBaseUrl,
          jira_email: formData.jiraEmail,
          jira_token: formData.jiraToken,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log("🔵 Jira Connect: Got response", connectResponse.status);

      if (!connectResponse.ok) {
        const errorText = await connectResponse.text();
        console.log("🔴 Jira Connect: Error response", errorText);
        throw new Error(`Connection failed (${connectResponse.status}): ${errorText}`);
      }

      const rawResult = await connectResponse.json();
      console.log("🔵 Jira Connect: Raw result", rawResult);
      
      const result = Array.isArray(rawResult) ? rawResult[0] : rawResult;

      if (result?.status === "error" || result?.json?.status === "error") {
        throw new Error(result?.message || result?.json?.message || "Connection failed");
      }

      // Store in database
      console.log("🔵 Jira Connect: Storing in database");
      const { error: dbError } = await supabase
        .from("jira_connections")
        .upsert(
          {
            user_id: user.id,
            jira_domain: normalizedDomain,
            jira_email: formData.jiraEmail,
            jira_token: formData.jiraToken,
            jira_base_url: jiraBaseUrl,
            verified: true,
          },
          { onConflict: "user_id" }
        );

      if (dbError) {
        console.log("🔴 Jira Connect: Database error", dbError);
        throw dbError;
      }

      console.log("✅ Jira Connect: Success!");
      toast({
        title: "Connected successfully",
        description: `Connected to ${normalizedDomain}.atlassian.net`,
      });

      onConnected();
      onOpenChange(false);

      setFormData({
        jiraDomain: "",
        jiraEmail: "",
        jiraToken: "",
      });
    } catch (error: any) {
      console.error("🔴 Jira Connect: Error", error);
      
      let errorMessage = "Failed to connect to Jira";
      
      if (error.name === "AbortError") {
        errorMessage = "Connection timeout - the Jira webhook is not responding. Please check if the service is running.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast({
        title: "Connection failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      console.log("🔵 Jira Connect: Cleanup, setting loading to false");
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center">
              <Link2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <DialogTitle className="text-2xl">Connect Jira</DialogTitle>
          </div>
          <DialogDescription>
            Enter your Jira credentials to enable ticket automation
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="jiraDomain">Jira Domain</Label>
            <Input
              id="jiraDomain"
              placeholder="yourcompany"
              value={formData.jiraDomain}
              onChange={(e) => setFormData({ ...formData, jiraDomain: e.target.value })}
              required
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Enter your domain from yourcompany.atlassian.net
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="jiraEmail">Email</Label>
            <Input
              id="jiraEmail"
              type="email"
              placeholder="you@company.com"
              value={formData.jiraEmail}
              onChange={(e) => setFormData({ ...formData, jiraEmail: e.target.value })}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="jiraToken">API Token</Label>
            <Input
              id="jiraToken"
              type="password"
              placeholder="Your Jira API token"
              value={formData.jiraToken}
              onChange={(e) => setFormData({ ...formData, jiraToken: e.target.value })}
              required
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Generate one at{" "}
              <a
                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                id.atlassian.com
              </a>
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-gradient-to-r from-primary to-primary/90"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default JiraConnectModal;
