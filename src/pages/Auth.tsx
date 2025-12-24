import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [supabaseReachable, setSupabaseReachable] = useState<boolean | null>(null);

  const supabaseUrl = useMemo(() => {
    // supabase-js exposes the URL on the client instance
    return (supabase as any).supabaseUrl as string | undefined;
  }, []);

  useEffect(() => {
    // Basic SEO (SPA): set title/description/canonical for the auth route
    document.title = "Nesora Login | AI Jira Assistant";

    const description = "Sign in to Nesora, your AI-powered Jira assistant for creating, fetching, and updating tickets.";
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = description;

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `${window.location.origin}/auth`;
  }, []);

  useEffect(() => {
    // Detect DNS/network issues to Supabase before redirecting to OAuth
    if (!supabaseUrl) {
      setSupabaseReachable(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6000);

    // no-cors so we only care about "can the browser resolve/connect" (DNS/TLS)
    fetch(`${supabaseUrl}/auth/v1/health`, { mode: "no-cors", signal: controller.signal })
      .then(() => setSupabaseReachable(true))
      .catch(() => setSupabaseReachable(false))
      .finally(() => window.clearTimeout(timeout));

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [supabaseUrl]);

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/");
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        navigate("/");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleGoogleSignIn = async () => {
    try {
      if (supabaseReachable === false) {
        toast({
          title: "Supabase is unreachable",
          description: `Your network/DNS can’t reach ${supabaseUrl ?? "your Supabase URL"}. Please fix DNS/VPN/firewall and try again.`,
          variant: "destructive",
        });
        return;
      }

      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });

      if (error) {
        toast({
          title: "Authentication Error",
          description: error.message,
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-secondary/5 to-accent p-4">
      <section className="max-w-md w-full">
        <article className="bg-card rounded-3xl shadow-brand border border-border/50 p-8 space-y-6 backdrop-blur-sm">
          {/* Logo & Title */}
          <header className="text-center space-y-3">
            <div className="inline-block p-3 bg-gradient-primary rounded-2xl shadow-soft mb-2" aria-hidden="true">
              <svg className="w-12 h-12 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent">Nesora</h1>
            <p className="text-2xl font-semibold text-foreground">Your AI-Powered Jira Assistant</p>
            <p className="text-muted-foreground text-sm">Connect Jira. Chat Naturally. Automate Everything.</p>

            {supabaseReachable === false && (
              <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-left">
                <p className="text-sm font-semibold text-foreground">Supabase domain not reachable</p>
                <p className="text-xs text-muted-foreground mt-1">
                  DNS_PROBE_FINISHED_NXDOMAIN usually means your network can’t resolve the Supabase host.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try disabling VPN/adblock, switching networks, or changing DNS to 1.1.1.1 / 8.8.8.8.
                </p>
              </div>
            )}
          </header>

          {/* Benefits */}
          <section className="space-y-3 pt-4" aria-label="Benefits">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/10 hover:border-primary/30 transition-all">
              <div className="text-3xl" aria-hidden="true">🚀</div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-foreground">Direct Ticket Management</p>
                <p className="text-xs text-muted-foreground mt-1">Create and manage Jira tickets directly from chat</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-xl bg-secondary/5 border border-secondary/10 hover:border-secondary/30 transition-all">
              <div className="text-3xl" aria-hidden="true">🤖</div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-foreground">AI-Powered Intelligence</p>
                <p className="text-xs text-muted-foreground mt-1">Understands natural language and learns from context</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-xl bg-accent/30 border border-accent-foreground/10 hover:border-accent-foreground/30 transition-all">
              <div className="text-3xl" aria-hidden="true">🔒</div>
              <div className="flex-1">
                <p className="font-semibold text-sm text-foreground">Secure Integration</p>
                <p className="text-xs text-muted-foreground mt-1">Enterprise-grade security via Supabase & Atlassian Cloud</p>
              </div>
            </div>
          </section>

          {/* Sign In Button */}
          <Button
            onClick={handleGoogleSignIn}
            disabled={loading || supabaseReachable === false}
            className="w-full bg-gradient-primary hover:shadow-brand text-primary-foreground font-semibold transition-all"
            size="lg"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Signing in...
              </span>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </>
            )}
          </Button>

          {/* Footer */}
          <footer>
            <p className="text-center text-xs text-muted-foreground pt-4">
              Powered by <span className="font-semibold bg-gradient-primary bg-clip-text text-transparent">Nesora</span> © 2025
            </p>
          </footer>
        </article>
      </section>
    </main>
  );
};

export default Auth;

