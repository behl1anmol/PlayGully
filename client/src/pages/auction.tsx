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
  SkipForward,
  Trophy,
  IndianRupee,
  LogOut,
  Users,
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

  const { data: state, isLoading } = useQuery<FullState>({
    queryKey: ["/api/state"],
    refetchInterval: 2000,
  });

  const bidMutation = useMutation({
    mutationFn: async ({ teamId, amount }: { teamId: string; amount: number }) => {
      const res = await apiRequest("POST", "/api/auction/bid", { teamId, amount });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/state"] });
      setBidAmount("");
    },
    onError: (err: Error) => {
      toast({ title: "Bid failed", description: err.message, variant: "destructive" });
    },
  });

  const sellMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auction/sell");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/state"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auction/skip");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/state"] });
    },
  });

  if (!activeSession) {
    navigate("/");
    return null;
  }

  if (isLoading || !state) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (state.auction.phase === "completed") {
    navigate("/results");
    return null;
  }

  const { auction, currentPlayer, teams } = state;
  const isAdmin = activeSession.role === "admin";
  const isCaptain = activeSession.role === "captain";
  const myTeam = isCaptain ? teams.find((t) => t.id === activeSession.teamId) : null;
  const myTeamBudgetLeft = myTeam ? myTeam.budget - myTeam.spent : 0;

  const handleBid = () => {
    if (!isCaptain || !myTeam) return;
    const amount = parseInt(bidAmount);
    if (isNaN(amount)) {
      toast({ title: "Invalid bid", description: "Enter a valid number", variant: "destructive" });
      return;
    }
    bidMutation.mutate({ teamId: myTeam.id, amount });
  };

  const totalPlayers = auction.playerOrder.length;
  const donePlayers = auction.currentPlayerIndex;
  const progress = totalPlayers > 0 ? (donePlayers / totalPlayers) * 100 : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-label="APPL Logo">
                  <circle cx="12" cy="12" r="6" stroke="white" strokeWidth="2" />
                  <line x1="12" y1="2" x2="12" y2="6" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  <line x1="12" y1="18" x2="12" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  <line x1="6" y1="12" x2="2" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  <line x1="22" y1="12" x2="18" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">Apna Park Premiere League</h1>
                <p className="text-xs text-muted-foreground">
                  {isAdmin ? "Admin" : `${myTeam?.name ?? ""} — Captain`}
                </p>
              </div>
            </div>
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
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Progress */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Player {donePlayers} of {totalPlayers}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {currentPlayer ? (
          <div className="grid gap-4 md:grid-cols-2">
            {/* Player on block */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Gavel className="w-4 h-4" />
                  On the Block
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-2xl font-bold">{currentPlayer.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Base price: <IndianRupee className="inline w-3 h-3" />{currentPlayer.basePrice}
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-muted/50 p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Current Bid</p>
                  <p className="text-3xl font-bold">
                    <IndianRupee className="inline w-6 h-6" />{auction.currentBid}
                  </p>
                  {auction.currentBidderId && (
                    <p className="text-xs text-muted-foreground mt-1">
                      by {teams.find((t) => t.id === auction.currentBidderId)?.name ?? "Unknown"}
                    </p>
                  )}
                </div>

                {/* Captain bid controls */}
                {isCaptain && auction.biddingOpen && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Your budget left: <IndianRupee className="inline w-3 h-3" />{myTeamBudgetLeft}
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder={`> ₹${auction.currentBid}`}
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleBid()}
                        className="flex-1"
                        data-testid="input-bid-amount"
                      />
                      <Button
                        onClick={handleBid}
                        disabled={bidMutation.isPending}
                        data-testid="button-place-bid"
                      >
                        Bid
                      </Button>
                    </div>
                  </div>
                )}

                {/* Admin controls */}
                {isAdmin && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => sellMutation.mutate()}
                      disabled={!auction.currentBidderId || sellMutation.isPending}
                      className="flex-1"
                      data-testid="button-sell"
                    >
                      <Gavel className="w-4 h-4 mr-1" />
                      Sell
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => skipMutation.mutate()}
                      disabled={skipMutation.isPending}
                      data-testid="button-skip"
                    >
                      <SkipForward className="w-4 h-4 mr-1" />
                      Skip
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Teams panel */}
            <div className="space-y-3">
              {teams.map((team) => (
                <Card key={team.id} className={myTeam?.id === team.id ? "ring-1 ring-primary" : ""}>
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                        <span className="font-semibold text-sm">{team.name}</span>
                        {myTeam?.id === team.id && (
                          <Badge variant="secondary" className="text-xs">You</Badge>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          <IndianRupee className="inline w-3 h-3" />{team.budget - team.spent}
                          <span className="text-muted-foreground text-xs"> left</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {team.players.length} players
                        </p>
                      </div>
                    </div>
                    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${(team.spent / team.budget) * 100}%`,
                          backgroundColor: team.color,
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Trophy className="w-12 h-12 mx-auto text-primary mb-3" />
              <p className="text-lg font-semibold">Auction Complete!</p>
              <Button className="mt-4" onClick={() => navigate("/results")}>
                View Results
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Roster preview */}
        {teams.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {teams.map((team) => (
              <Card key={team.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                    {team.name}
                    <Users className="w-3 h-3 ml-auto" />
                    {team.players.length}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {team.players.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No players yet</p>
                  ) : (
                    team.players.map((p) => (
                      <div key={p.id} className="flex justify-between text-xs">
                        <span>{p.name}</span>
                        <span className="text-muted-foreground">
                          <IndianRupee className="inline w-3 h-3" />{p.soldPrice}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <PerplexityAttribution />
    </div>
  );
}
