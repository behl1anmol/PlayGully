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
  Trash2,
  Plus,
  Users,
  UserPlus,
  Gavel,
  RotateCcw,
  LogOut,
  IndianRupee,
  ShieldCheck,
} from "lucide-react";
import type { Player, Team } from "@shared/schema";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

export default function SetupPage() {
  const [teamName, setTeamName] = useState("");
  const [teamBudget, setTeamBudget] = useState("500");
  const [captainUser, setCaptainUser] = useState("");
  const [captainPass, setCaptainPass] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [playerPrice, setPlayerPrice] = useState("10");
  const [bulkText, setBulkText] = useState("");
  const [defaultPrice, setDefaultPrice] = useState("10");
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { session, sessionRef, logout } = useAuth();
  const activeSession = session || sessionRef.current;

  // Redirect if not admin
  if (!activeSession || activeSession.role !== "admin") {
    navigate("/");
    return null;
  }

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: players = [] } = useQuery<Player[]>({
    queryKey: ["/api/players"],
  });

  // ── Team mutations ──
  const addTeamMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      budget: number;
      captainUsername: string;
      captainPassword: string;
    }) => {
      const res = await apiRequest("POST", "/api/teams", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setTeamName("");
      setTeamBudget("500");
      setCaptainUser("");
      setCaptainPass("");
    },
    onError: (err: Error) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const removeTeamMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/teams/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
    },
  });

  // ── Player mutations ──
  const addPlayerMutation = useMutation({
    mutationFn: async (data: { name: string; basePrice: number }) => {
      const res = await apiRequest("POST", "/api/players", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setPlayerName("");
      setPlayerPrice("10");
    },
  });

  const bulkAddMutation = useMutation({
    mutationFn: async (playersList: { name: string; basePrice: number }[]) => {
      const res = await apiRequest("POST", "/api/players/bulk", {
        players: playersList,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setBulkText("");
      toast({
        title: "Players added",
        description: "All players have been added to the pool.",
      });
    },
  });

  const removePlayerMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/players/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
    },
  });

  const startAuctionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auction/start");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auction"] });
      navigate("/auction");
    },
    onError: (err: Error) => {
      toast({
        title: "Cannot start auction",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auction/reset");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auction"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Reset complete" });
    },
  });

  const handleAddTeam = () => {
    const name = teamName.trim();
    const budget = parseInt(teamBudget) || 500;
    const cu = captainUser.trim();
    const cp = captainPass.trim();
    if (!name || !cu || !cp) {
      toast({
        title: "Missing fields",
        description: "Team name, captain username, and password are required.",
        variant: "destructive",
      });
      return;
    }
    if (teams.length >= 2) {
      toast({
        title: "Limit reached",
        description: "Maximum 2 teams.",
        variant: "destructive",
      });
      return;
    }
    addTeamMutation.mutate({
      name,
      budget,
      captainUsername: cu,
      captainPassword: cp,
    });
  };

  const handleAddPlayer = () => {
    const name = playerName.trim();
    const basePrice = Math.min(100, Math.max(1, parseInt(playerPrice) || 10));
    if (!name) return;
    addPlayerMutation.mutate({ name, basePrice });
  };

  const handleBulkAdd = () => {
    const bp = Math.min(100, Math.max(1, parseInt(defaultPrice) || 10));
    const list = bulkText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((name) => ({ name, basePrice: bp }));
    if (list.length === 0) return;
    bulkAddMutation.mutate(list);
  };

  const canStart =
    teams.length === 2 &&
    players.length >= 1 &&
    teams.every((t: any) => t.captainUsername);

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
                <h1 className="text-lg font-bold tracking-tight">
                  Apna Park Premiere League
                </h1>
                <p className="text-xs text-muted-foreground">
                  Admin Setup
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => resetMutation.mutate()}
                className="text-muted-foreground"
                data-testid="button-reset"
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Reset
              </Button>
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
        {/* ── Teams Section ── */}
        <Card data-testid="card-teams">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Teams &amp; Captains
              <Badge variant="secondary" className="ml-auto font-normal">
                {teams.length}/2
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {teams.length < 2 && (
              <div className="space-y-3 p-4 rounded-lg border border-dashed border-border bg-accent/20">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Team name"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    data-testid="input-team-name"
                  />
                  <div className="relative">
                    <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      type="number"
                      placeholder="Budget"
                      value={teamBudget}
                      onChange={(e) => setTeamBudget(e.target.value)}
                      className="pl-7"
                      data-testid="input-team-budget"
                      min={100}
                      max={10000}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Captain username"
                    value={captainUser}
                    onChange={(e) => setCaptainUser(e.target.value)}
                    data-testid="input-captain-username"
                    autoComplete="off"
                  />
                  <Input
                    placeholder="Captain password"
                    value={captainPass}
                    onChange={(e) => setCaptainPass(e.target.value)}
                    data-testid="input-captain-password"
                    autoComplete="off"
                  />
                </div>
                <Button
                  onClick={handleAddTeam}
                  disabled={addTeamMutation.isPending}
                  size="sm"
                  data-testid="button-add-team"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Team
                </Button>
              </div>
            )}

            {teams.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">
                Add two teams with captain credentials to get started
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {teams.map((team: any, i: number) => (
                  <div
                    key={team.id}
                    className="p-3 rounded-lg bg-accent/40 border border-border space-y-2"
                    data-testid={`team-card-${team.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{
                            backgroundColor: `hsl(var(--chart-${i + 1}))`,
                          }}
                        />
                        <span className="font-semibold text-sm">
                          {team.name}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTeamMutation.mutate(team.id)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        data-testid={`button-remove-team-${team.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <IndianRupee className="w-3 h-3" />
                        Budget: ₹{team.budget}
                      </span>
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        Captain: {team.captainUsername}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Players Section ── */}
        <Card data-testid="card-players">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-primary" />
              Player Pool
              <Badge variant="secondary" className="ml-auto font-normal">
                {players.length} players
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Single add */}
            <div className="flex gap-2">
              <Input
                placeholder="Player name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddPlayer()}
                data-testid="input-player-name"
                className="flex-1"
              />
              <div className="relative w-24">
                <IndianRupee className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="Price"
                  value={playerPrice}
                  onChange={(e) => setPlayerPrice(e.target.value)}
                  className="pl-6"
                  data-testid="input-player-price"
                  min={1}
                  max={100}
                />
              </div>
              <Button
                onClick={handleAddPlayer}
                disabled={!playerName.trim() || addPlayerMutation.isPending}
                size="sm"
                data-testid="button-add-player"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>

            {/* Bulk add */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Add multiple players (one name per line)
              </label>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder={"Virat\nRohit\nDhoni\nBumrah"}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                data-testid="textarea-bulk-players"
              />
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground whitespace-nowrap">
                  Default base price:
                </label>
                <div className="relative w-20">
                  <IndianRupee className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <Input
                    type="number"
                    value={defaultPrice}
                    onChange={(e) => setDefaultPrice(e.target.value)}
                    className="pl-5 h-8 text-xs"
                    min={1}
                    max={100}
                    data-testid="input-default-price"
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleBulkAdd}
                  disabled={!bulkText.trim() || bulkAddMutation.isPending}
                  data-testid="button-bulk-add"
                >
                  Add All
                </Button>
              </div>
            </div>

            {/* Player list */}
            {players.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {players.map((player: any) => (
                  <div
                    key={player.id}
                    className="flex items-center gap-1.5 bg-accent/50 border border-border rounded-full px-3 py-1 text-sm"
                    data-testid={`player-chip-${player.id}`}
                  >
                    <span>{player.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ₹{player.basePrice}
                    </span>
                    <button
                      onClick={() => removePlayerMutation.mutate(player.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                      data-testid={`button-remove-player-${player.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-3 text-center">
                No players yet. Add them above.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Start Auction */}
        <div className="flex flex-col items-center gap-2 pt-2 pb-8">
          <Button
            size="lg"
            onClick={() => startAuctionMutation.mutate()}
            disabled={!canStart || startAuctionMutation.isPending}
            data-testid="button-start-auction"
            className="text-base px-8"
          >
            <Gavel className="w-5 h-5 mr-2" />
            Start Auction
          </Button>
          {!canStart && (
            <p className="text-sm text-muted-foreground text-center">
              {teams.length < 2 ? "Add 2 teams with captain credentials" : ""}
              {teams.length < 2 && players.length < 1 ? " and " : ""}
              {players.length < 1 ? "Add at least 1 player" : ""}
              {" "}to start.
            </p>
          )}
        </div>
      </main>

      <footer className="border-t border-border mt-auto py-4 text-center">
        <PerplexityAttribution />
      </footer>
    </div>
  );
}
