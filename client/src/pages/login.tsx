import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import type { AuthSession } from "@shared/schema";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { login, session, sessionRef } = useAuth();

  // Already logged in
  const activeSession = session || sessionRef.current;
  if (activeSession) {
    if (activeSession.role === "admin") navigate("/admin");
    else if (activeSession.role === "captain") navigate("/auction");
    else navigate("/auction");
    return null;
  }

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      toast({ title: "Enter credentials", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/login", { username, password });
      const session = await res.json() as AuthSession;
      login(session);
      if (session.role === "admin") navigate("/admin");
      else navigate("/auction");
    } catch (err: any) {
      toast({ title: "Login failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-primary mx-auto flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-label="APPL Logo">
              <circle cx="12" cy="12" r="6" stroke="white" strokeWidth="2" />
              <line x1="12" y1="2" x2="12" y2="6" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="12" y1="18" x2="12" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="6" y1="12" x2="2" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round" />
              <line x1="22" y1="12" x2="18" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Apna Park Premiere League</h1>
            <p className="text-sm text-muted-foreground">Gully Cricket Player Auction</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sign in</CardTitle>
            <CardDescription className="text-xs">
              Admin: admin / appl2026 &nbsp;&bull;&nbsp; Guest: guest / guest
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              data-testid="input-username"
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              data-testid="input-password"
            />
            <Button
              className="w-full"
              onClick={handleLogin}
              disabled={loading}
              data-testid="button-login"
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <PerplexityAttribution />
    </div>
  );
}
