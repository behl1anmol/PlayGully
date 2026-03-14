import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { LogIn, Eye, EyeOff } from "lucide-react";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/login", {
        username: username.trim(),
        password: password.trim(),
      });
      const session = await res.json();
      login(session);

      if (session.role === "admin") {
        // Check auction state to route admin correctly
        try {
          const stateRes = await fetch("/api/auction");
          const auctionState = await stateRes.json();
          if (auctionState.phase === "auction") {
            navigate("/auction");
          } else if (auctionState.phase === "completed") {
            navigate("/results");
          } else {
            navigate("/admin");
          }
        } catch {
          navigate("/admin");
        }
      } else if (session.role === "captain") {
        navigate("/auction");
      } else {
        navigate("/results");
      }
    } catch (err: any) {
      toast({
        title: "Login failed",
        description: "Invalid username or password",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGuestView = async () => {
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/login", {
        username: "guest",
        password: "guest",
      });
      const session = await res.json();
      login(session);
      navigate("/results");
    } catch {
      toast({
        title: "Error",
        description: "Could not access as guest",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          {/* Logo / Brand */}
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mx-auto">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                aria-label="APPL Logo"
              >
                <circle cx="12" cy="12" r="6" stroke="white" strokeWidth="2" />
                <line x1="12" y1="2" x2="12" y2="6" stroke="white" strokeWidth="2" strokeLinecap="round" />
                <line x1="12" y1="18" x2="12" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round" />
                <line x1="6" y1="12" x2="2" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round" />
                <line x1="22" y1="12" x2="18" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-title">
              Apna Park Premiere League
            </h1>
            <p className="text-sm text-muted-foreground">
              Gully Cricket Auction
            </p>
          </div>

          {/* Login Card */}
          <Card data-testid="card-login">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Sign In</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Input
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  data-testid="input-username"
                  autoComplete="off"
                />
              </div>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  data-testid="input-password"
                  className="pr-10"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="button-toggle-password"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <Button
                className="w-full"
                onClick={handleLogin}
                disabled={loading || !username.trim() || !password.trim()}
                data-testid="button-login"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Sign In
              </Button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>

              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={handleGuestView}
                disabled={loading}
                data-testid="button-guest"
              >
                View as Guest
              </Button>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-center">
            Admin, captains, and guests have different access levels.
          </p>
        </div>
      </div>

      <footer className="border-t border-border py-4 text-center">
        <PerplexityAttribution />
      </footer>
    </div>
  );
}
