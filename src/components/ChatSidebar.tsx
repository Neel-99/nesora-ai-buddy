import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Link2, LogOut, Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

interface ChatSidebarProps {
  onConnectJira: () => void;
  jiraConnected: boolean;
  jiraDomain?: string;
}

const ChatSidebar = ({ onConnectJira, jiraConnected, jiraDomain }: ChatSidebarProps) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState<string>("");

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        setUserEmail(user.email);
      }
    };
    fetchUser();
  }, []);

  const handleSignOut = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log("🔵 Sign Out: Button clicked");
    
    try {
      console.log("🔵 Sign Out: Calling supabase.auth.signOut()");
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error("🔴 Sign Out: Error from Supabase", error);
        throw error;
      }
      
      console.log("✅ Sign Out: Successfully signed out");
      
      // Clear any local state
      localStorage.clear();
      
      toast({
        title: "Signed out successfully",
      });
      
      // Force navigation to auth page
      console.log("🔵 Sign Out: Navigating to /auth");
      navigate("/auth", { replace: true });
      
      // Force reload after a short delay to ensure clean state
      setTimeout(() => {
        console.log("🔵 Sign Out: Reloading page");
        window.location.href = "/auth";
      }, 100);
      
    } catch (error) {
      console.error("🔴 Sign Out: Caught error", error);
      
      // Even if there's an error, try to clear local state and redirect
      localStorage.clear();
      
      toast({
        title: "Signed out",
        description: "You have been signed out",
        variant: "default",
      });
      
      window.location.href = "/auth";
    }
  };

  return (
    <div className="w-80 border-r border-border bg-card h-screen flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-brand">
            <Sparkles className="w-5 h-5 text-primary-foreground" />
          </div>
          <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Nesora
          </h2>
        </div>
        
        {/* User info */}
        <div className="bg-muted/50 rounded-lg p-3 mb-4">
          <p className="text-xs text-muted-foreground mb-1">Signed in as</p>
          <p className="text-sm font-medium truncate">{userEmail}</p>
        </div>

        {/* Jira Status */}
        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Jira Status</span>
            {jiraConnected ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          {jiraConnected && jiraDomain ? (
            <p className="text-sm font-medium">{jiraDomain}.atlassian.net</p>
          ) : (
            <p className="text-sm text-muted-foreground">Not connected</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="p-6 space-y-3">
        <Button
          onClick={onConnectJira}
          className="w-full justify-start bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-soft"
        >
          <Link2 className="mr-2 h-4 w-4" />
          {jiraConnected ? "Update Jira" : "Connect Jira"}
        </Button>
      </div>

      {/* Recent Activity - placeholder for future */}
      <div className="flex-1 p-6 overflow-y-auto">
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Recent Activity</h3>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">No recent activity yet</p>
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-border space-y-3">
        <Button
          variant="outline"
          onClick={handleSignOut}
          className="w-full justify-start"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
        
        <p className="text-xs text-center text-muted-foreground">
          Powered by Nesora © 2025
        </p>
      </div>
    </div>
  );
};

export default ChatSidebar;
