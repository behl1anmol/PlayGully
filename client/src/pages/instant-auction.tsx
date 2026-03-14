import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  CheckCircle2,
  Gavel,
  Lock,
  LogOut,
  RotateCcw,
  Unlock,
} from "lucide-react";
import type { Player, Team } from "@shared/schema";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

interface InstantLockRow {
  id: number;
  playerId: number;
  teamId: number;
  expiresAt: string;
  createdAt: string;
}

interface InstantState {
  mode: "instant";
  phase: "setup" | "auction" | "paused" | "completed";
  lockDurationSeconds: number;
  locks: InstantLockRow[];
  teams: (Team & { players: Player[] })[];
  players: Player[];
  availablePlayers: Player[];
  settings?: {
    maxPlayersPerTeam: number;
  };
}

interface PlayerStatusRule {
  validatePlayerStatusId: number;
  description: string;
  basePrice: number;
  maxPerTeam: number | null;
}

function formatRemainingTime(expiresAt: string) {
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function InstantAuctionPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { session, sessionRef, logout } = useAuth();
  const activeSession = session || sessionRef.current;
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);

  const isAllowedRole = !!activeSession && (activeSession.role === "admin" || activeSession.role === "captain");
  const isAdmin = activeSession?.role === "admin";
  const isCaptain = activeSession?.role === "captain";
  const myTeamId = activeSession?.teamId;

  useEffect(() => {
    if (!isAllowedRole) {
      navigate("/");
    }
  }, [isAllowedRole, navigate]);

  const { data: state, isLoading, isError, error } = useQuery<InstantState>({
    queryKey: ["/api/instant-auction/state"],
    enabled: isAllowedRole,
    refetchInterval: isAllowedRole ? 1500 : false,
  });

  const { data: playerStatusRules = [] } = useQuery<PlayerStatusRule[]>({
    queryKey: ["/api/player-statuses"],
    enabled: isAllowedRole,
  });

  useEffect(() => {
    if (isAdmin && state && state.phase !== "auction") {
      navigate("/admin");
    }
  }, [isAdmin, state?.phase, navigate]);

  const lockMutation = useMutation({
    mutationFn: async (playerIds: number[]) => {
      const res = await apiRequest("POST", "/api/instant-auction/lock", { playerIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instant-auction/state"] });
      toast({ title: "Players locked", description: "Selected players are reserved for 3 minutes." });
    },
    onError: (err: Error) => {
      toast({ title: "Lock failed", description: err.message, variant: "destructive" });
    },
  });

  const unlockMutation = useMutation({
    mutationFn: async (playerIds: number[]) => {
      await apiRequest("POST", "/api/instant-auction/unlock", { playerIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instant-auction/state"] });
      setSelectedPlayerIds([]);
    },
    onError: (err: Error) => {
      toast({ title: "Unlock failed", description: err.message, variant: "destructive" });
    },
  });

  const bookMutation = useMutation({
    mutationFn: async (playerIds: number[]) => {
      const res = await apiRequest("POST", "/api/instant-auction/book", { playerIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instant-auction/state"] });
      setSelectedPlayerIds([]);
      toast({ title: "Booking complete" });
    },
    onError: (err: Error) => {
      toast({ title: "Booking failed", description: err.message, variant: "destructive" });
    },
  });

  const releaseBookedMutation = useMutation({
    mutationFn: async (playerIds: number[]) => {
      const res = await apiRequest("POST", "/api/instant-auction/release-booked", { playerIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/instant-auction/state"] });
      toast({ title: "Players released", description: "Players are back in the pool and budget refunded." });
    },
    onError: (err: Error) => {
      toast({ title: "Release failed", description: err.message, variant: "destructive" });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/instant-auction/stop");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auction-mode"] });
      navigate("/admin");
      toast({ title: "Instant auction stopped" });
    },
    onError: (err: Error) => {
      toast({ title: "Stop failed", description: err.message, variant: "destructive" });
    },
  });

  if (!isAllowedRole) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Redirecting to login...</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading instant auction...</div>
      </div>
    );
  }

  if (isError || !state) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="py-10 space-y-3">
            <Gavel className="w-10 h-10 mx-auto text-muted-foreground" />
            <h2 className="text-lg font-semibold">Instant Auction Unavailable</h2>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Unable to load instant auction state."}
            </p>
            <div className="flex items-center justify-center gap-2">
              {isAdmin && (
                <Button variant="outline" onClick={() => navigate("/admin")}>
                  Go to Admin Panel
                </Button>
              )}
              {!isAdmin && (
                <Button variant="outline" onClick={() => navigate("/")}>Back to Login</Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.phase !== "auction") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="py-10 space-y-3">
            <Gavel className="w-10 h-10 mx-auto text-muted-foreground" />
            <h2 className="text-lg font-semibold">Instant Auction Not Active</h2>
            <p className="text-sm text-muted-foreground">
              {isAdmin ? "Returning to admin panel..." : "Wait for admin to start Instant Auction."}
            </p>
            {!isAdmin && (
              <Button variant="outline" onClick={() => navigate("/")}>Back to Login</Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const lockByPlayerId = new Map<number, InstantLockRow>();
  for (const lock of state.locks) {
    lockByPlayerId.set(lock.playerId, lock);
  }

  const selectedSet = new Set(selectedPlayerIds);
  const myLockedPlayers = state.availablePlayers.filter((player) => {
    const lock = lockByPlayerId.get(player.id);
    return lock && lock.teamId === myTeamId;
  });

  const selectedLockedPlayerIds = selectedPlayerIds.filter((playerId) => {
    const lock = lockByPlayerId.get(playerId);
    return lock && lock.teamId === myTeamId;
  });

  const myTeam = Number.isInteger(myTeamId)
    ? state.teams.find((team) => team.id === Number(myTeamId)) ?? null
    : null;
  const captainRemainingBudget = myTeam ? (myTeam.budget ?? 0) - (myTeam.spent ?? 0) : 0;

  const availablePlayerById = new Map(state.availablePlayers.map((player) => [player.id, player]));
  const selectedLockedTotal = selectedLockedPlayerIds.reduce((sum, playerId) => {
    const player = availablePlayerById.get(playerId);
    return sum + (player?.basePrice ?? 0);
  }, 0);
  const remainingAfterSelectedBooking = captainRemainingBudget - selectedLockedTotal;
  const wouldBeNegativeBalance = remainingAfterSelectedBooking < 0;

  const soldPlayerIds = new Set(
    state.players.filter((player) => player.teamId != null).map((player) => player.id),
  );

  const findStatusRule = (statusNames: string[]) => {
    const normalizedStatusNames = new Set(statusNames.map((statusName) => statusName.trim().toLowerCase()));
    return playerStatusRules.find((statusRule) => normalizedStatusNames.has(statusRule.description.trim().toLowerCase())) ?? null;
  };

  const diamondRule = findStatusRule(["diamond", "diamin"]);
  const goldRule = findStatusRule(["gold"]);

  const sortedPoolPlayers = [...state.availablePlayers].sort((firstPlayer, secondPlayer) =>
    firstPlayer.name.localeCompare(secondPlayer.name),
  );

  const canReleasePlayer = (player: Player) => {
    if (isAdmin) return true;
    if (!isCaptain || !Number.isInteger(myTeamId)) return false;
    return player.teamId === myTeamId;
  };

  const toggleSelection = (playerId: number) => {
    setSelectedPlayerIds((previousSelection) => {
      if (previousSelection.includes(playerId)) {
        return previousSelection.filter((id) => id !== playerId);
      }
      return [...previousSelection, playerId];
    });
  };

  const handleBookSelected = () => {
    if (selectedLockedPlayerIds.length === 0 || bookMutation.isPending) {
      return;
    }

    if (wouldBeNegativeBalance) {
      toast({
        title: "Booking failed",
        description: "Booking would make remaining amount negative. Remove players and try again.",
        variant: "destructive",
      });
      return;
    }

    bookMutation.mutate(selectedLockedPlayerIds);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <Gavel className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">APPL Instant Auction</h1>
                <p className="text-xs text-muted-foreground">
                  {isAdmin ? "Admin Control" : `Captain: ${activeSession.teamName ?? "Team"}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="secondary">Instant Mode</Badge>
              <Badge variant="outline">Lock: 3 min</Badge>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => stopMutation.mutate()}
                  disabled={stopMutation.isPending}
                  data-testid="button-stop-instant-auction"
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Stop Instant Auction
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  logout();
                  navigate("/");
                }}
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto w-full px-4 py-6 space-y-6 flex-1">
        <Card>
          <CardContent className="py-2">
            <Accordion type="single" collapsible>
              <AccordionItem value="instant-auction-rules" className="border-b-0">
                <AccordionTrigger className="py-3 text-sm font-semibold">
                  Auction Rules
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                    <li>Each lock is exclusive to one captain and expires in {state.lockDurationSeconds} seconds.</li>
                    <li>Only players locked by your team can be booked.</li>
                    <li>Each team can buy at most {state.settings?.maxPlayersPerTeam ?? 11} players.</li>
                    <li>Each team must finish with exactly {diamondRule?.maxPerTeam ?? "-"} Diamond players.</li>
                    <li>Each team must finish with exactly {goldRule?.maxPerTeam ?? "-"} Gold players.</li>
                    <li>Instant auction cannot be stopped until all teams satisfy exact Diamond/Gold counts.</li>
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />
              Player Pool
              <Badge variant="secondary" className="ml-auto font-normal">
                {sortedPoolPlayers.length} available
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isCaptain && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => lockMutation.mutate(selectedPlayerIds)}
                    disabled={selectedPlayerIds.length === 0 || lockMutation.isPending}
                    data-testid="button-lock-selected"
                  >
                    <Lock className="w-4 h-4 mr-1" />
                    Lock Selected ({selectedPlayerIds.length})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBookSelected}
                    disabled={selectedLockedPlayerIds.length === 0 || bookMutation.isPending || wouldBeNegativeBalance}
                    data-testid="button-book-selected"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Book Locked ({selectedLockedPlayerIds.length})
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => unlockMutation.mutate(selectedLockedPlayerIds)}
                    disabled={selectedLockedPlayerIds.length === 0 || unlockMutation.isPending}
                    data-testid="button-unlock-selected"
                  >
                    <Unlock className="w-4 h-4 mr-1" />
                    Unlock Selected
                  </Button>
                </div>

                <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span data-testid="text-current-remaining-budget">Current remaining: ₹{captainRemainingBudget}</span>
                    <span data-testid="text-selected-locked-total">Selected locked total: ₹{selectedLockedTotal}</span>
                    <span
                      data-testid="text-remaining-after-booking"
                      className={wouldBeNegativeBalance ? "font-medium text-destructive" : "font-medium"}
                    >
                      Remaining after booking: ₹{remainingAfterSelectedBooking >= 0 ? "+" : ""}
                      {remainingAfterSelectedBooking}
                    </span>
                  </div>
                  {wouldBeNegativeBalance && selectedLockedPlayerIds.length > 0 && (
                    <p className="mt-1 text-xs text-destructive">
                      Booking is blocked because remaining amount would become negative.
                    </p>
                  )}
                </div>
              </div>
            )}

            {sortedPoolPlayers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No available players in pool.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {sortedPoolPlayers.map((player) => {
                  const lock = lockByPlayerId.get(player.id);
                  const isLockedByMe = !!lock && lock.teamId === myTeamId;
                  const isLockedByOther = !!lock && lock.teamId !== myTeamId;
                  const isBooked = soldPlayerIds.has(player.id);
                  const isSelected = selectedSet.has(player.id);

                  return (
                    <div
                      key={player.id}
                      className="rounded-md border border-border bg-accent/30 px-3 py-2"
                      data-testid={`instant-pool-player-${player.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{player.name}</p>
                          <div className="flex items-center gap-1 mt-1">
                            {player.playerStatusDescription && (
                              <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0">
                                {player.playerStatusDescription}
                              </Badge>
                            )}
                            <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0">
                              ₹{player.basePrice}
                            </Badge>
                            {isLockedByMe && lock && (
                              <Badge variant="secondary" className="text-[10px] font-normal px-1.5 py-0">
                                Locked {formatRemainingTime(lock.expiresAt)}
                              </Badge>
                            )}
                            {isLockedByOther && (
                              <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0">
                                Locked by other captain
                              </Badge>
                            )}
                          </div>
                        </div>

                        {isCaptain && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelection(player.id)}
                            disabled={isBooked || isLockedByOther}
                            className="h-4 w-4"
                            data-testid={`checkbox-select-player-${player.id}`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {isCaptain && myLockedPlayers.length > 0 && (
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground mb-2">My currently locked players</p>
                <div className="flex flex-wrap gap-2">
                  {myLockedPlayers.map((player) => {
                    const lock = lockByPlayerId.get(player.id);
                    return (
                      <Badge key={player.id} variant="secondary" className="font-normal">
                        {player.name} · {lock ? formatRemainingTime(lock.expiresAt) : "00:00"}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {state.teams.map((team, index) => {
            const teamBudget = team.budget ?? team.remainingBudget ?? 0;
            const teamSpent = team.spent ?? 0;
            const remaining = teamBudget - teamSpent;
            return (
              <Card key={team.id} data-testid={`instant-team-${team.id}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: `hsl(var(--chart-${index + 1}))` }}
                    />
                    {team.name}
                    <Badge variant="outline" className="ml-auto font-normal text-xs">
                      {team.players.length} booked
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-xs text-muted-foreground flex justify-between">
                    <span>Spent: ₹{teamSpent}</span>
                    <span>Remaining: ₹{remaining}</span>
                  </div>

                  {team.players.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">No booked players</p>
                  ) : (
                    <div className="space-y-1">
                      {team.players.map((player) => (
                        <div
                          key={player.id}
                          className="flex items-center justify-between rounded-md bg-accent/30 px-2 py-1.5 text-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate">{player.name}</span>
                            {player.playerStatusDescription && (
                              <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0">
                                {player.playerStatusDescription}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs font-normal">
                              ₹{player.soldPrice}
                            </Badge>
                            {canReleasePlayer(player) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => releaseBookedMutation.mutate([player.id])}
                                disabled={releaseBookedMutation.isPending}
                                data-testid={`button-release-player-${player.id}`}
                              >
                                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                                Release
                              </Button>
                            )}
                          </div>
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
