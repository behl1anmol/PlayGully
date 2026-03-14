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
        <Card data-testid="section-teams">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="w-4 h-4" />
              Teams ({teams.length}/2)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {teams.length > 0 && (
              <div className="space-y-2">
                {teams.map((team: Team) => (
                  <div
                    key={team.id}
                    className="flex items-center justify-between p-3 rounded-md border border-border bg-card"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: team.color }}
                      />
                      <span className="font-medium text-sm">{team.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        <IndianRupee className="w-3 h-3" />
                        {team.budget}
                      </Badge>
                      {team.captainUsername && (
                        <Badge variant="outline" className="text-xs">
                          <ShieldCheck className="w-3 h-3 mr-1" />
                          {team.captainUsername}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTeamMutation.mutate(team.id)}
                      data-testid={`button-remove-team-${team.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {teams.length < 2 && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Team name"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTeam()}
                    data-testid="input-team-name"
                  />
                  <Input
                    type="number"
                    placeholder="Budget (default 500)"
                    value={teamBudget}
                    onChange={(e) => setTeamBudget(e.target.value)}
                    data-testid="input-team-budget"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Captain username"
                    value={captainUser}
                    onChange={(e) => setCaptainUser(e.target.value)}
                    data-testid="input-captain-user"
                  />
                  <Input
                    type="password"
                    placeholder="Captain password"
                    value={captainPass}
                    onChange={(e) => setCaptainPass(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTeam()}
                    data-testid="input-captain-pass"
                  />
                </div>
                <Button
                  onClick={handleAddTeam}
                  disabled={addTeamMutation.isPending}
                  size="sm"
                  data-testid="button-add-team"
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  Add Team
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Players Section ── */}
        <Card data-testid="section-players">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="w-4 h-4" />
              Player Pool ({players.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Single player add */}
            <div className="flex gap-2">
              <Input
                placeholder="Player name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddPlayer()}
                className="flex-1"
                data-testid="input-player-name"
              />
              <Input
                type="number"
                placeholder="Base price"
                value={playerPrice}
                onChange={(e) => setPlayerPrice(e.target.value)}
                className="w-28"
                data-testid="input-player-price"
              />
              <Button
                onClick={handleAddPlayer}
                disabled={addPlayerMutation.isPending}
                size="sm"
                data-testid="button-add-player"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Bulk add */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Bulk add (one name per line):</p>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-none"
                placeholder="Player 1&#10;Player 2&#10;Player 3"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                data-testid="textarea-bulk-players"
              />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Default base price (10)"
                  value={defaultPrice}
                  onChange={(e) => setDefaultPrice(e.target.value)}
                  className="w-40"
                  data-testid="input-default-price"
                />
                <Button
                  onClick={handleBulkAdd}
                  disabled={bulkAddMutation.isPending || !bulkText.trim()}
                  size="sm"
                  variant="secondary"
                  data-testid="button-bulk-add"
                >
                  <UserPlus className="w-4 h-4 mr-1" />
                  Bulk Add
                </Button>
              </div>
            </div>

            {players.length > 0 && (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {players.map((player: Player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between px-3 py-1.5 rounded border border-border text-sm"
                  >
                    <span>{player.name}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        <IndianRupee className="w-3 h-3" />{player.basePrice}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removePlayerMutation.mutate(player.id)}
                        data-testid={`button-remove-player-${player.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Start Auction \u2500─ */}
        <div className="flex justify-end">
          <Button
            onClick={() => startAuctionMutation.mutate()}
            disabled={!canStart || startAuctionMutation.isPending}
            size="lg"
            data-testid="button-start-auction"
          >
            <Gavel className="w-5 h-5 mr-2" />
            Start Auction
          </Button>
        </div>
      </main>

      <PerplexityAttribution />
    </div>
  );
}
