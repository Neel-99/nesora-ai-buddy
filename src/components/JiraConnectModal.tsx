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
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    jiraDomain: "",
    jiraEmail: "",
    jiraToken: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Normalize domain - remove .atlassian.net if user included it
      let normalizedDomain = formData.jiraDomain.trim();
      normalizedDomain = normalizedDomain.replace(/\.atlassian\.net\/?$/, "");
      normalizedDomain = normalizedDomain.replace(/^https?:\/\//, "");
      normalizedDomain = normalizedDomain.split("/")[0]; // Take only domain part

      const jiraBaseUrl = `https://${normalizedDomain}.atlassian.net`;

      // Call WF6 Connect workflow
      const connectResponse = await fetch("https://registry-walking-runner-bronze.trycloudflare.com/webhook/mcp/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          jira_domain: jiraBaseUrl,
          jira_email: formData.jiraEmail,
          jira_token: formData.jiraToken,
        }),
      });

      if (!connectResponse.ok) {
        const errorText = await connectResponse.text();
        console.error("Connect response error:", errorText);
        throw new Error("Failed to connect to Jira. Please verify your credentials.");
      }

      const connectResult = await connectResponse.json();
      console.log("Connect result:", connectResult);
      
      // Handle array response from n8n
      const result = Array.isArray(connectResult) ? connectResult[0] : connectResult;
      if (result?.json?.status === "error" || result?.status === "error") {
        throw new Error(result?.json?.message || result?.message || "Connection verification failed");
      }

      // Store in database after successful connection
      const { error: dbError } = await supabase
        .from("jira_connections")
        .upsert({
          user_id: user.id,
          jira_domain: normalizedDomain,
          jira_email: formData.jiraEmail,
          jira_token: formData.jiraToken,
          jira_base_url: jiraBaseUrl,
          verified: true,
        });

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: "Jira connected successfully",
      });

      onConnected();
      onOpenChange(false);
      
      // Reset form
      setFormData({
        jiraDomain: "",
        jiraEmail: "",
        jiraToken: "",
      });
    } catch (error: any) {
      toast({
        title: "Connection Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
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
