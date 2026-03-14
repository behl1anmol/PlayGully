import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Trophy, IndianRupee, RotateCcw, LogOut, Users } from "lucide-react";
import type { Player, Team } from "@shared/schema";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

interface TeamWithPlayers extends Team {
  players: Player[];
}

interface FullState {
  teams: TeamWithPlayers[];
  players: Player[];
  availablePlayers: Player[];
  auction: { phase: string };
  currentPlayer: Player | null;
}

export default function ResultsPage() {
  const [, navigate] = useLocation();
  const { session, sessionRef, logout } = useAuth();
  const activeSession = session || sessionRef.current;

  const { data: state } = useQuery<FullState>({
    queryKey: ["/api/state"],
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auction/reset");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/state"] });
      navigate("/admin");
    },
  });

  if (!activeSession) {
    navigate("/");
    return null;
  }

  if (!state) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  const { teams, availablePlayers } = state;
  const isAdmin = activeSession.role === "admin";

  // Sort teams by players count descending, then by money spent
  const sortedTeams = [...teams].sort((a, b) => {
    if (b.players.length !== a.players.length) return b.players.length - a.players.length;
    return b.spent - a.spent;
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <Trophy className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">Auction Results</h1>
                <p className="text-xs text-muted-foreground">Apna Park Premiere League</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => resetMutation.mutate()}
                  disabled={resetMutation.isPending}
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  New Auction
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { logout(); navigate("/"); }}
                className="text-muted-foreground"
              >
                <LogOut className="w-4 h-4 mr-1" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Team summary cards */}
        <div className="grid gap-4 md:grid-cols-2">
          {sortedTeams.map((team, idx) => (
            <Card key={team.id} className={idx === 0 ? "ring-1 ring-primary" : ""}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: team.color }} />
                  {team.name}
                  {idx === 0 && <Badge className="ml-auto">Most Players</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-lg font-bold">{team.players.length}</p>
                    <p className="text-xs text-muted-foreground">Players</p>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-lg font-bold flex items-center justify-center">
                      <IndianRupee className="w-4 h-4" />{team.spent}
                    </p>
                    <p className="text-xs text-muted-foreground">Spent</p>
                  </div>
                  <div className="rounded-md bg-muted p-2">
                    <p className="text-lg font-bold flex items-center justify-center">
                      <IndianRupee className="w-4 h-4" />{team.budget - team.spent}
                    </p>
                    <p className="text-xs text-muted-foreground">Remaining</p>
                  </div>
                </div>

                {/* Player list */}
                <div className="space-y-1">
                  {team.players.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">No players</p>
                  ) : (
                    team.players.map((p) => (
                      <div key={p.id} className="flex justify-between text-sm px-1">
                        <span>{p.name}</span>
                        <span className="text-muted-foreground flex items-center">
                          <IndianRupee className="w-3 h-3" />{p.soldPrice}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Unsold players */}
        {availablePlayers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                Unsold Players ({availablePlayers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {availablePlayers.map((p) => (
                  <Badge key={p.id} variant="secondary">{p.name}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      <PerplexityAttribution />
    </div>
  );
}
