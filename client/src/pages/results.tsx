import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { RotateCcw, Trophy, LogOut, IndianRupee, Gavel } from "lucide-react";
import type { Player, Team, AuctionState } from "@shared/schema";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

interface FullState {
  teams: (Team & { players: Player[] })[];
  players: Player[];
  availablePlayers: Player[];
  auction: AuctionState;
  currentPlayer: Player | null;
}

export default function ResultsPage() {
  const [, navigate] = useLocation();
  const { session, sessionRef, logout } = useAuth();
  const activeSession = session || sessionRef.current;

  if (!activeSession) {
    navigate("/");
    return null;
  }

  const { data: state, isLoading } = useQuery<FullState>({
    queryKey: ["/api/state"],
    refetchInterval: 3000,
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

  if (isLoading || !state) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  const isAdmin = activeSession.role === "admin";
  const isGuest = activeSession.role === "guest";
  const isCompleted = state.auction.phase === "completed";
  const isAuctionLive = state.auction.phase === "auction";
  const unsoldPlayers = state.players.filter(
    (p) => !p.teamId && state.auction.phase === "completed"
  );
  const captainNameSet = new Set(
    state.teams
      .map((team) => (team.captainUsername ?? "").trim().toLowerCase())
      .filter((value) => value.length > 0),
  );
  const guestPoolPlayers = state.availablePlayers
    .filter((player) => {
      const playerName = player.name.trim().toLowerCase();
      const isCaptainByName = captainNameSet.has(playerName);
      const isCaptainByEliteStatus =
        (player.playerStatusDescription ?? "").trim().toLowerCase() === "elite";
      return !isCaptainByName && !isCaptainByEliteStatus;
    })
    .sort((firstPlayer, secondPlayer) => firstPlayer.name.localeCompare(secondPlayer.name));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-label="APPL">
                  <circle cx="12" cy="12" r="6" stroke="white" strokeWidth="2" />
                  <line x1="12" y1="2" x2="12" y2="6" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  <line x1="12" y1="18" x2="12" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  <line x1="6" y1="12" x2="2" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  <line x1="22" y1="12" x2="18" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">
                  Apna Park Premiere League
                </h1>
                <p className="text-xs text-muted-foreground">
                  {isCompleted ? "Final Teams" : isAuctionLive ? "Auction Live" : "Results"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && isCompleted && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resetMutation.mutate()}
                  className="text-muted-foreground"
                  data-testid="button-new-auction"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  New Auction
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  logout();
                  navigate("/");
                }}
                className="text-muted-foreground"
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4 mr-1" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Status banner */}
        {isCompleted && (
          <div className="rounded-xl p-6 text-center bg-primary/8 border border-primary/15">
            <Trophy className="w-10 h-10 mx-auto text-primary mb-2" />
            <h2
              className="text-xl font-bold"
              data-testid="text-auction-complete"
            >
              Auction Complete
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {state.players.filter((p) => p.teamId).length} of{" "}
              {state.players.length} players sold.
            </p>
          </div>
        )}

        {isAuctionLive && (
          <div className="rounded-xl p-5 text-center bg-chart-4/10 border border-chart-4/20">
            <Gavel className="w-8 h-8 mx-auto text-chart-4 mb-2" />
            <h2 className="text-lg font-bold">Auction In Progress</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Teams are being built live. Check back for final results.
            </p>
          </div>
        )}

        {state.auction.phase === "setup" && (
          <div className="rounded-xl p-5 text-center bg-muted border border-border">
            <Gavel className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <h2 className="text-lg font-bold">Auction Not Started</h2>
            <p className="text-sm text-muted-foreground mt-1">
              The admin hasn't started the auction yet.
            </p>
          </div>
        )}

        {/* Guest pool view */}
        {isGuest && (
          <Card data-testid="card-guest-player-pool">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Gavel className="w-4 h-4 text-primary" />
                Player Pool (Non-Captains)
                <Badge variant="secondary" className="ml-auto font-normal">
                  {guestPoolPlayers.length} players
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {guestPoolPlayers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2">
                  No non-captain players currently available in the pool.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {guestPoolPlayers.map((player) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between rounded-md border border-border bg-accent/30 px-3 py-2"
                      data-testid={`guest-pool-player-${player.id}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">{player.name}</span>
                        {player.playerStatusDescription && (
                          <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0">
                            {player.playerStatusDescription}
                          </Badge>
                        )}
                      </div>
                      <Badge variant="secondary" className="font-normal whitespace-nowrap">
                        ₹{player.basePrice}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Team cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {state.teams.map((team, i) => {
            const remaining = team.budget - team.spent;
            const totalSpent = team.players.reduce(
              (sum, p) => sum + (p.soldPrice || 0),
              0
            );

            return (
              <Card key={team.id} data-testid={`card-final-team-${team.id}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{
                        backgroundColor: `hsl(var(--chart-${i + 1}))`,
                      }}
                    />
                    {team.name}
                    <Badge
                      variant="secondary"
                      className="ml-auto font-normal"
                    >
                      {team.players.length} players
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Budget summary */}
                  <div className="flex justify-between text-xs text-muted-foreground px-1">
                    <span>
                      Spent: ₹{totalSpent} / ₹{team.budget}
                    </span>
                    <span>Remaining: ₹{remaining}</span>
                  </div>

                  {/* Roster */}
                  {team.players.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No players bought
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {team.players.map((player, j) => (
                        <div
                          key={player.id}
                          className="flex items-center justify-between text-sm py-2 px-3 rounded-md bg-accent/40"
                          data-testid={`text-final-player-${player.id}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-mono w-4 text-right">
                              {j + 1}.
                            </span>
                            <span className="font-medium">{player.name}</span>
                          </div>
                          <Badge variant="outline" className="text-xs font-normal">
                            ₹{player.soldPrice}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Unsold players */}
        {isCompleted && unsoldPlayers.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-muted-foreground">
                Unsold Players
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {unsoldPlayers.map((p) => (
                  <Badge
                    key={p.id}
                    variant="outline"
                    className="font-normal text-muted-foreground"
                  >
                    {p.name} (₹{p.basePrice})
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Admin actions */}
        {isAdmin && isCompleted && (
          <div className="flex justify-center pt-2 pb-8">
            <Button
              variant="outline"
              onClick={() => resetMutation.mutate()}
              data-testid="button-start-over"
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              Start New Auction
            </Button>
          </div>
        )}
      </main>

      <footer className="border-t border-border mt-auto py-4 text-center">
        <PerplexityAttribution />
      </footer>
    </div>
  );
}
