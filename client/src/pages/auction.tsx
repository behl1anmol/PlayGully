import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  Gavel,
  IndianRupee,
  User,
  SkipForward,
  CheckCircle2,
  LogOut,
  Trophy,
} from "lucide-react";
import type { Player, Team, AuctionState } from "@shared/schema";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

interface FullState {
  teams: (Team & { players: Player[] })[];
  players: Player[];
  availablePlayers: Player[];
  auction: AuctionState;
  currentPlayer: Player | null;
}

export default function AuctionPage() {
  const [bidAmount, setBidAmount] = useState("");
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { session, sessionRef, logout } = useAuth();
  const activeSession = session || sessionRef.current;

  if (!activeSession || (activeSession.role !== "admin" && activeSession.role !== "captain")) {
    navigate("/");
    return null;
  }

  const { data: state, isLoading } = useQuery<FullState>({
    queryKey: ["/api/state"],
    refetchInterval: 1500,
  });

  const bidMutation = useMutation({
    mutationFn: async (data: { teamId: string; amount: number }) => {
      const res = await apiRequest("POST", "/api/auction/bid", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/state"] });
      setBidAmount("");
    },
    onError: (err: Error) => {
      toast({
        title: "Bid failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const sellMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auction/sell");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/state"] });
      if (data.state?.phase === "completed") {
        navigate("/results");
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auction/skip");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/state"] });
      if (data.phase === "completed") {
        navigate("/results");
      }
    },
  });

  if (isLoading || !state) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading auction...</div>
      </div>
    );
  }

  if (state.auction.phase === "setup") {
    if (activeSession.role === "admin") {
      navigate("/admin");
    } else {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center px-4">
          <Card className="max-w-sm w-full text-center">
            <CardContent className="py-10 space-y-3">
              <Gavel className="w-10 h-10 mx-auto text-muted-foreground" />
              <h2 className="text-lg font-semibold">Auction Not Started</h2>
              <p className="text-sm text-muted-foreground">
                Wait for the admin to start the auction.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/state"] })}
              >
                Refresh
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return null;
  }

  if (state.auction.phase === "completed") {
    navigate("/results");
    return null;
  }

  const isAdmin = activeSession.role === "admin";
  const isCaptain = activeSession.role === "captain";
  const myTeamId = activeSession.teamId;
  const myTeam = state.teams.find((t) => t.id === myTeamId);
  const currentPlayer = state.currentPlayer;
  const currentBidder = state.teams.find(
    (t) => t.id === state.auction.currentBidderId
  );

  const playersDone =
    state.auction.currentPlayerIndex + 1;
  const playersTotal = state.auction.playerOrder.length;

  const handleBid = () => {
    if (!myTeamId) return;
    const amount = parseInt(bidAmount);
    if (!amount || amount < 1) return;
    bidMutation.mutate({ teamId: myTeamId, amount });
  };

  const quickBids = currentPlayer
    ? [
        state.auction.currentBid + 1,
        state.auction.currentBid + 5,
        state.auction.currentBid + 10,
      ].filter((b) => b <= 100 && (myTeam ? b <= myTeam.budget - myTeam.spent : true))
    : [];

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
                <h1 className="text-lg font-bold tracking-tight">APPL Auction</h1>
                <p className="text-xs text-muted-foreground">
                  {isAdmin ? "Admin Control" : `Captain: ${myTeam?.name}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                Player {playersDone}/{playersTotal}
              </Badge>
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
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Current Player On Block */}
        {currentPlayer && (
          <Card className="overflow-hidden" data-testid="card-current-player">
            <div className="bg-primary/8 border-b border-primary/10 px-5 py-4 text-center">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Now on the block
              </p>
              <h2 className="text-xl font-bold" data-testid="text-current-player-name">
                {currentPlayer.name}
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Base price: ₹{currentPlayer.basePrice}
              </p>
            </div>
            <CardContent className="py-5">
              <div className="text-center space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Current bid
                </p>
                <div className="flex items-center justify-center gap-1">
                  <IndianRupee className="w-6 h-6 text-primary" />
                  <span
                    className="text-3xl font-bold tabular-nums"
                    data-testid="text-current-bid"
                  >
                    {state.auction.currentBid}
                  </span>
                </div>
                {currentBidder ? (
                  <p className="text-sm font-medium" data-testid="text-current-bidder">
                    by {currentBidder.name}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No bids yet
                  </p>
                )}
              </div>

              {/* Captain bidding controls */}
              {isCaptain && myTeamId && state.auction.currentBidderId !== myTeamId && (
                <div className="mt-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        type="number"
                        placeholder={`Min ₹${state.auction.currentBid + 1}`}
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleBid()}
                        className="pl-8"
                        data-testid="input-bid-amount"
                        min={state.auction.currentBid + 1}
                        max={100}
                      />
                    </div>
                    <Button
                      onClick={handleBid}
                      disabled={
                        bidMutation.isPending ||
                        !bidAmount ||
                        parseInt(bidAmount) <= state.auction.currentBid
                      }
                      data-testid="button-place-bid"
                    >
                      <Gavel className="w-4 h-4 mr-1" />
                      Bid
                    </Button>
                  </div>
                  {/* Quick bid buttons */}
                  {quickBids.length > 0 && (
                    <div className="flex gap-2 justify-center">
                      {quickBids.map((amt) => (
                        <Button
                          key={amt}
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            bidMutation.mutate({
                              teamId: myTeamId,
                              amount: amt,
                            })
                          }
                          disabled={bidMutation.isPending}
                          data-testid={`button-quick-bid-${amt}`}
                        >
                          ₹{amt}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Captain has highest bid message */}
              {isCaptain && myTeamId && state.auction.currentBidderId === myTeamId && (
                <div className="mt-5 text-center">
                  <Badge className="bg-primary/10 text-primary border-primary/20">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    You have the highest bid
                  </Badge>
                </div>
              )}

              {/* Admin controls: Sell / Skip */}
              {isAdmin && (
                <div className="mt-5 flex justify-center gap-3">
                  <Button
                    onClick={() => sellMutation.mutate()}
                    disabled={
                      !state.auction.currentBidderId || sellMutation.isPending
                    }
                    data-testid="button-sell"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Sold!
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => skipMutation.mutate()}
                    disabled={skipMutation.isPending}
                    data-testid="button-skip"
                  >
                    <SkipForward className="w-4 h-4 mr-1" />
                    Unsold / Skip
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Team budgets + rosters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {state.teams.map((team, i) => {
            const remaining = team.budget - team.spent;
            const pct = team.budget > 0 ? (team.spent / team.budget) * 100 : 0;
            const isHighBidder = state.auction.currentBidderId === team.id;

            return (
              <Card
                key={team.id}
                className={isHighBidder ? "ring-2 ring-primary/40 ring-offset-2 ring-offset-background" : ""}
                data-testid={`card-team-${team.id}`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: `hsl(var(--chart-${i + 1}))`,
                      }}
                    />
                    {team.name}
                    {isHighBidder && (
                      <Badge variant="secondary" className="text-xs ml-1">
                        Highest bidder
                      </Badge>
                    )}
                    <Badge variant="outline" className="ml-auto font-normal text-xs">
                      {team.players.length} bought
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Budget bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Spent: ₹{team.spent}</span>
                      <span>Remaining: ₹{remaining}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: `hsl(var(--chart-${i + 1}))`,
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-right">
                      Budget: ₹{team.budget}
                    </p>
                  </div>

                  {/* Roster */}
                  {team.players.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      No players yet
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {team.players.map((player, j) => (
                        <div
                          key={player.id}
                          className="flex items-center justify-between text-sm py-1.5 px-2 rounded-md bg-accent/30"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-mono w-4 text-right">
                              {j + 1}.
                            </span>
                            <span>{player.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            ₹{player.soldPrice}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>

      <footer className="border-t border-border mt-auto py-4 text-center">
        <PerplexityAttribution />
      </footer>
    </div>
  );
}
