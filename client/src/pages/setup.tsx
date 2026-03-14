import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  Trash2,
  Plus,
  Pencil,
  Check,
  X,
  Users,
  UserPlus,
  Gavel,
  RotateCcw,
  LogOut,
  IndianRupee,
  ShieldCheck,
} from "lucide-react";
import type { Player, Setup, Team } from "@shared/schema";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";

interface PlayerStatus {
  validatePlayerStatusId: number;
  description: string;
  basePrice: number;
  maxPerTeam: number | null;
}

function requiresManualPlayerPrice(statusDescription?: string | null) {
  const normalizedStatusDescription = statusDescription?.trim().toLowerCase();
  return normalizedStatusDescription === "silver" || normalizedStatusDescription === "bronze";
}

export default function SetupPage() {
  const [teamName, setTeamName] = useState("");
  const [teamBudget, setTeamBudget] = useState("500");
  const [captainUser, setCaptainUser] = useState("");
  const [captainPass, setCaptainPass] = useState("");
  const [editingTeamId, setEditingTeamId] = useState<number | null>(null);
  const [editingTeamDraft, setEditingTeamDraft] = useState<{
    name: string;
    budget: string;
    captainUsername: string;
  } | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [playerStatusId, setPlayerStatusId] = useState("");
  const [manualPlayerPrice, setManualPlayerPrice] = useState("");
  const [editingPlayerId, setEditingPlayerId] = useState<number | null>(null);
  const [editingPlayerDraft, setEditingPlayerDraft] = useState<{
    name: string;
    validatePlayerStatusId: string;
    basePrice: string;
  } | null>(null);
  const [maxPlayersPerTeamDraft, setMaxPlayersPerTeamDraft] = useState("11");
  const [bulkText, setBulkText] = useState("");
  const [defaultStatusId, setDefaultStatusId] = useState("");
  const [statusConfigDraft, setStatusConfigDraft] = useState<{
    prices: { diamond: string; gold: string };
    limits: { diamond: string; elite: string; gold: string };
  } | null>(null);
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

  const { data: playerStatuses = [] } = useQuery<PlayerStatus[]>({
    queryKey: ["/api/player-statuses"],
  });

  const { data: setupConfig } = useQuery<Setup>({
    queryKey: ["/api/setup"],
  });

  const buildStatusConfigDraft = (statuses: PlayerStatus[]) => {
    const getStatus = (names: string[]) => {
      const targetNames = new Set(names.map((name) => name.trim().toLowerCase()));
      return statuses.find((status) => targetNames.has(status.description.trim().toLowerCase())) ?? null;
    };

    const diamond = getStatus(["diamond", "diamin"]);
    const gold = getStatus(["gold"]);
    const elite = getStatus(["elite"]);

    return {
      prices: {
        diamond: String(diamond?.basePrice ?? ""),
        gold: String(gold?.basePrice ?? ""),
      },
      limits: {
        diamond: String(diamond?.maxPerTeam ?? 1),
        elite: String(elite?.maxPerTeam ?? 1),
        gold: String(gold?.maxPerTeam ?? 2),
      },
    };
  };

  const selectableStatuses = useMemo(
    () => playerStatuses.filter((playerStatus) => playerStatus.description.trim().toLowerCase() !== "elite"),
    [playerStatuses],
  );

  const selectedSingleStatus = useMemo(
    () =>
      selectableStatuses.find(
        (playerStatus) => playerStatus.validatePlayerStatusId === Number(playerStatusId),
      ) ?? selectableStatuses[0] ?? null,
    [selectableStatuses, playerStatusId],
  );

  const selectedBulkStatus = useMemo(
    () =>
      selectableStatuses.find(
        (playerStatus) => playerStatus.validatePlayerStatusId === Number(defaultStatusId),
      ) ?? selectableStatuses[0] ?? null,
    [selectableStatuses, defaultStatusId],
  );

  const soldPlayersCountByTeamId = useMemo(() => {
    const counts = new Map<number, number>();
    for (const player of players) {
      const teamId = Number(player.teamId ?? player.soldTo);
      if (!Number.isInteger(teamId)) continue;
      counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
    }
    return counts;
  }, [players]);

  const maxPlayersPerTeam = Number(setupConfig?.maxPlayersPerTeam ?? 11);

  const isSingleManualPriceRequired = requiresManualPlayerPrice(selectedSingleStatus?.description);
  const isBulkManualPriceRequired = requiresManualPlayerPrice(selectedBulkStatus?.description);
  const editingPlayerStatus = useMemo(() => {
    if (!editingPlayerDraft) return null;
    return selectableStatuses.find(
      (playerStatus) => playerStatus.validatePlayerStatusId === Number(editingPlayerDraft.validatePlayerStatusId),
    ) ?? null;
  }, [editingPlayerDraft, selectableStatuses]);
  const isEditingPlayerManualPriceRequired = requiresManualPlayerPrice(editingPlayerStatus?.description);

  useEffect(() => {
    if (!statusConfigDraft && playerStatuses.length > 0) {
      setStatusConfigDraft(buildStatusConfigDraft(playerStatuses));
    }
  }, [playerStatuses, statusConfigDraft]);

  useEffect(() => {
    if (setupConfig?.maxPlayersPerTeam !== undefined && setupConfig?.maxPlayersPerTeam !== null) {
      setMaxPlayersPerTeamDraft(String(setupConfig.maxPlayersPerTeam));
    }
  }, [setupConfig?.maxPlayersPerTeam]);

  useEffect(() => {
    if (selectableStatuses.length === 0) return;
    if (!playerStatusId) {
      setPlayerStatusId(String(selectableStatuses[0].validatePlayerStatusId));
    }
    if (!defaultStatusId) {
      setDefaultStatusId(String(selectableStatuses[0].validatePlayerStatusId));
    }
  }, [selectableStatuses, playerStatusId, defaultStatusId]);

  useEffect(() => {
    if (!isSingleManualPriceRequired) {
      setManualPlayerPrice("");
    }
  }, [isSingleManualPriceRequired]);

  useEffect(() => {
    if (!editingPlayerDraft || !editingPlayerStatus) return;
    if (requiresManualPlayerPrice(editingPlayerStatus.description)) return;

    const statusBasePrice = String(editingPlayerStatus.basePrice ?? "");
    if (editingPlayerDraft.basePrice !== statusBasePrice) {
      setEditingPlayerDraft((previous) => (
        previous
          ? {
              ...previous,
              basePrice: statusBasePrice,
            }
          : previous
      ));
    }
  }, [editingPlayerDraft, editingPlayerStatus]);

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

  const updateTeamMutation = useMutation({
    mutationFn: async (payload: {
      id: number;
      data: { name: string; budget: number; captainUsername: string };
    }) => {
      const res = await apiRequest("PUT", `/api/teams/${payload.id}`, payload.data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setEditingTeamId(null);
      setEditingTeamDraft(null);
      toast({
        title: "Team updated",
        description: "Team details have been saved.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to update team",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // ── Player mutations ──
  const addPlayerMutation = useMutation({
    mutationFn: async (data: { name: string; validatePlayerStatusId: number; basePrice?: number }) => {
      const res = await apiRequest("POST", "/api/players", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setPlayerName("");
      setManualPlayerPrice("");
    },
  });

  const bulkAddMutation = useMutation({
    mutationFn: async (playersList: { name: string; validatePlayerStatusId: number; basePrice?: number }[]) => {
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

  const saveStatusConfigMutation = useMutation({
    mutationFn: async (data: {
      prices: { diamond: number; gold: number };
      limits: { diamond: number; elite: number; gold: number };
    }) => {
      const res = await apiRequest("POST", "/api/player-statuses/config", data);
      return res.json();
    },
    onSuccess: (updatedStatuses: PlayerStatus[]) => {
      queryClient.invalidateQueries({ queryKey: ["/api/player-statuses"] });
      setStatusConfigDraft(buildStatusConfigDraft(updatedStatuses));
      toast({
        title: "Rules saved",
        description: "Player prices and team limits updated successfully.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to save rules",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const saveMaxPlayersMutation = useMutation({
    mutationFn: async (maxPlayersPerTeamValue: number) => {
      const res = await apiRequest("POST", "/api/setup/max-players", {
        maxPlayersPerTeam: maxPlayersPerTeamValue,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/setup"] });
      toast({
        title: "Team size updated",
        description: "Maximum players per team has been saved.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to update team size",
        description: err.message,
        variant: "destructive",
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

  const updatePlayerMutation = useMutation({
    mutationFn: async (payload: {
      id: number;
      data: { name: string; validatePlayerStatusId: number; basePrice?: number };
    }) => {
      const res = await apiRequest("PUT", `/api/players/${payload.id}`, payload.data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setEditingPlayerId(null);
      setEditingPlayerDraft(null);
      toast({
        title: "Player updated",
        description: "Player details have been saved.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to update player",
        description: err.message,
        variant: "destructive",
      });
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
    const validatePlayerStatusId = Number(playerStatusId || selectedSingleStatus?.validatePlayerStatusId);

    if (!name) return;
    if (!validatePlayerStatusId) {
      toast({
        title: "Missing status",
        description: "Select a player status before adding.",
        variant: "destructive",
      });
      return;
    }

    let basePrice: number | undefined;
    if (isSingleManualPriceRequired) {
      const parsedBasePrice = Number(manualPlayerPrice);
      if (!Number.isInteger(parsedBasePrice) || parsedBasePrice <= 0) {
        toast({
          title: "Missing price",
          description: "Enter a valid base price for Silver/Bronze player.",
          variant: "destructive",
        });
        return;
      }
      basePrice = parsedBasePrice;
    }

    addPlayerMutation.mutate({ name, validatePlayerStatusId, basePrice });
  };

  const handleBulkAdd = () => {
    const validatePlayerStatusId = Number(defaultStatusId || selectedBulkStatus?.validatePlayerStatusId);
    if (!validatePlayerStatusId) {
      toast({
        title: "Missing status",
        description: "Select a default status for bulk add.",
        variant: "destructive",
      });
      return;
    }

    const lines = bulkText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const list: { name: string; validatePlayerStatusId: number; basePrice?: number }[] = isBulkManualPriceRequired
      ? lines.map((line) => {
          const [namePart, pricePart] = line.split(",").map((part) => part.trim());
          const parsedBasePrice = Number(pricePart);

          return {
            name: namePart,
            validatePlayerStatusId,
            basePrice: parsedBasePrice,
          };
        })
      : lines.map((name) => ({ name, validatePlayerStatusId }));

    if (isBulkManualPriceRequired) {
      const hasInvalidLine = list.some(
        (player) =>
          !player.name ||
          !Number.isInteger(player.basePrice as number) ||
          (player.basePrice as number) <= 0,
      );

      if (hasInvalidLine) {
        toast({
          title: "Invalid bulk format",
          description: "For Silver/Bronze bulk add, use one player per line as Name,Price",
          variant: "destructive",
        });
        return;
      }
    }

    if (list.length === 0) return;
    bulkAddMutation.mutate(list);
  };

  const handleSaveStatusConfig = () => {
    if (!statusConfigDraft) return;

    const diamondPrice = Number(statusConfigDraft.prices.diamond);
    const goldPrice = Number(statusConfigDraft.prices.gold);

    const diamondLimit = Number(statusConfigDraft.limits.diamond);
    const eliteLimit = Number(statusConfigDraft.limits.elite);
    const goldLimit = Number(statusConfigDraft.limits.gold);

    const invalidPrice = [diamondPrice, goldPrice].some(
      (value) => !Number.isInteger(value) || value <= 0,
    );
    if (invalidPrice) {
      toast({
        title: "Invalid prices",
        description: "Diamond and Gold prices must be positive whole numbers.",
        variant: "destructive",
      });
      return;
    }

    if (!(diamondPrice > goldPrice)) {
      toast({
        title: "Invalid price order",
        description: "Set prices so Diamond > Gold.",
        variant: "destructive",
      });
      return;
    }

    const invalidLimit = [diamondLimit, eliteLimit, goldLimit].some(
      (value) => !Number.isInteger(value) || value < 1,
    );
    if (invalidLimit) {
      toast({
        title: "Invalid limits",
        description: "Diamond, Elite and Gold limits must be whole numbers >= 1.",
        variant: "destructive",
      });
      return;
    }

    saveStatusConfigMutation.mutate({
      prices: {
        diamond: diamondPrice,
        gold: goldPrice,
      },
      limits: {
        diamond: diamondLimit,
        elite: eliteLimit,
        gold: goldLimit,
      },
    });
  };

  const handleSaveMaxPlayersPerTeam = () => {
    const parsedMaxPlayersPerTeam = Number(maxPlayersPerTeamDraft);
    if (!Number.isInteger(parsedMaxPlayersPerTeam) || parsedMaxPlayersPerTeam < 1) {
      toast({
        title: "Invalid team size",
        description: "Max players per team must be a whole number >= 1.",
        variant: "destructive",
      });
      return;
    }

    saveMaxPlayersMutation.mutate(parsedMaxPlayersPerTeam);
  };

  const handleStartEditTeam = (team: any) => {
    setEditingTeamId(team.id);
    setEditingTeamDraft({
      name: String(team.name ?? ""),
      budget: String(team.budget ?? team.remainingBudget ?? ""),
      captainUsername: String(team.captainUsername ?? team.ownerName ?? ""),
    });
  };

  const handleCancelEditTeam = () => {
    setEditingTeamId(null);
    setEditingTeamDraft(null);
  };

  const handleSaveEditTeam = () => {
    if (editingTeamId === null || !editingTeamDraft) return;

    const teamNameValue = editingTeamDraft.name.trim();
    const captainUsernameValue = editingTeamDraft.captainUsername.trim();
    const budgetValue = Number(editingTeamDraft.budget);

    if (!teamNameValue || !captainUsernameValue) {
      toast({
        title: "Missing fields",
        description: "Team name and captain username are required.",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isInteger(budgetValue) || budgetValue <= 0) {
      toast({
        title: "Invalid budget",
        description: "Team budget must be a whole number greater than 0.",
        variant: "destructive",
      });
      return;
    }

    updateTeamMutation.mutate({
      id: editingTeamId,
      data: {
        name: teamNameValue,
        budget: budgetValue,
        captainUsername: captainUsernameValue,
      },
    });
  };

  const handleStartEditPlayer = (player: any) => {
    const fallbackStatusId = Number(
      player.validatePlayerStatusId ?? selectableStatuses[0]?.validatePlayerStatusId,
    );
    if (!Number.isInteger(fallbackStatusId)) {
      toast({
        title: "Missing status",
        description: "Player status data is unavailable. Refresh and try again.",
        variant: "destructive",
      });
      return;
    }

    setEditingPlayerId(player.id);
    setEditingPlayerDraft({
      name: String(player.name ?? ""),
      validatePlayerStatusId: String(fallbackStatusId),
      basePrice: String(player.basePrice ?? ""),
    });
  };

  const handleCancelEditPlayer = () => {
    setEditingPlayerId(null);
    setEditingPlayerDraft(null);
  };

  const handleSaveEditPlayer = () => {
    if (editingPlayerId === null || !editingPlayerDraft) return;

    const playerNameValue = editingPlayerDraft.name.trim();
    const validatePlayerStatusIdValue = Number(editingPlayerDraft.validatePlayerStatusId);

    if (!playerNameValue) {
      toast({
        title: "Missing name",
        description: "Player name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!Number.isInteger(validatePlayerStatusIdValue)) {
      toast({
        title: "Invalid status",
        description: "Select a valid player status.",
        variant: "destructive",
      });
      return;
    }

    const payload: { name: string; validatePlayerStatusId: number; basePrice?: number } = {
      name: playerNameValue,
      validatePlayerStatusId: validatePlayerStatusIdValue,
    };

    if (isEditingPlayerManualPriceRequired) {
      const basePriceValue = Number(editingPlayerDraft.basePrice);
      if (!Number.isInteger(basePriceValue) || basePriceValue <= 0) {
        toast({
          title: "Invalid price",
          description: "Silver/Bronze players require a whole-number base price > 0.",
          variant: "destructive",
        });
        return;
      }
      payload.basePrice = basePriceValue;
    }

    updatePlayerMutation.mutate({
      id: editingPlayerId,
      data: payload,
    });
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
            <div className="flex items-end gap-2 p-3 rounded-lg border border-border bg-accent/20">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Max players per team</label>
                <Input
                  type="number"
                  min={1}
                  value={maxPlayersPerTeamDraft}
                  onChange={(e) => setMaxPlayersPerTeamDraft(e.target.value)}
                  className="w-36"
                  data-testid="input-max-players-per-team"
                />
              </div>
              <Button
                size="sm"
                onClick={handleSaveMaxPlayersPerTeam}
                disabled={saveMaxPlayersMutation.isPending}
                data-testid="button-save-max-players-per-team"
              >
                Save Team Size
              </Button>
            </div>

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
                        <span className="font-semibold text-sm">{team.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            editingTeamId === team.id ? handleCancelEditTeam() : handleStartEditTeam(team)
                          }
                          className="h-7 w-7 p-0 text-muted-foreground"
                          data-testid={`button-edit-team-${team.id}`}
                        >
                          {editingTeamId === team.id ? (
                            <X className="w-3.5 h-3.5" />
                          ) : (
                            <Pencil className="w-3.5 h-3.5" />
                          )}
                        </Button>
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
                    </div>

                    {editingTeamId === team.id && editingTeamDraft ? (
                      <div className="space-y-2 rounded-md border border-border bg-background/70 p-2">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          <Input
                            value={editingTeamDraft.name}
                            onChange={(event) =>
                              setEditingTeamDraft((previous) =>
                                previous
                                  ? {
                                      ...previous,
                                      name: event.target.value,
                                    }
                                  : previous,
                              )
                            }
                            placeholder="Team name"
                            data-testid={`input-edit-team-name-${team.id}`}
                          />
                          <Input
                            value={editingTeamDraft.captainUsername}
                            onChange={(event) =>
                              setEditingTeamDraft((previous) =>
                                previous
                                  ? {
                                      ...previous,
                                      captainUsername: event.target.value,
                                    }
                                  : previous,
                              )
                            }
                            placeholder="Captain username"
                            data-testid={`input-edit-team-captain-${team.id}`}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            value={editingTeamDraft.budget}
                            onChange={(event) =>
                              setEditingTeamDraft((previous) =>
                                previous
                                  ? {
                                      ...previous,
                                      budget: event.target.value,
                                    }
                                  : previous,
                              )
                            }
                            placeholder="Team budget"
                            className="w-40"
                            data-testid={`input-edit-team-budget-${team.id}`}
                          />
                          <Button
                            size="sm"
                            onClick={handleSaveEditTeam}
                            disabled={updateTeamMutation.isPending}
                            data-testid={`button-save-team-${team.id}`}
                          >
                            <Check className="w-3.5 h-3.5 mr-1" />
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <IndianRupee className="w-3 h-3" />
                          Budget: ₹{team.budget}
                        </span>
                        <span>
                          Players: {soldPlayersCountByTeamId.get(team.id) ?? 0}/{maxPlayersPerTeam}
                        </span>
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          Captain: {team.captainUsername}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Status Pricing & Rules Section ── */}
        <Card data-testid="card-status-rules">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              Status Pricing & Team Limits
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {statusConfigDraft ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Diamond price</label>
                    <Input
                      type="number"
                      value={statusConfigDraft.prices.diamond}
                      onChange={(e) =>
                        setStatusConfigDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                prices: { ...prev.prices, diamond: e.target.value },
                              }
                            : prev,
                        )
                      }
                      min={1}
                      data-testid="input-price-diamond"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Gold price</label>
                    <Input
                      type="number"
                      value={statusConfigDraft.prices.gold}
                      onChange={(e) =>
                        setStatusConfigDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                prices: { ...prev.prices, gold: e.target.value },
                              }
                            : prev,
                        )
                      }
                      min={1}
                      data-testid="input-price-gold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Max Diamond per team</label>
                    <Input
                      type="number"
                      value={statusConfigDraft.limits.diamond}
                      onChange={(e) =>
                        setStatusConfigDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                limits: { ...prev.limits, diamond: e.target.value },
                              }
                            : prev,
                        )
                      }
                      min={1}
                      data-testid="input-limit-diamond"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Max Elite per team</label>
                    <Input
                      type="number"
                      value={statusConfigDraft.limits.elite}
                      onChange={(e) =>
                        setStatusConfigDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                limits: { ...prev.limits, elite: e.target.value },
                              }
                            : prev,
                        )
                      }
                      min={1}
                      data-testid="input-limit-elite"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Max Gold per team</label>
                    <Input
                      type="number"
                      value={statusConfigDraft.limits.gold}
                      onChange={(e) =>
                        setStatusConfigDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                limits: { ...prev.limits, gold: e.target.value },
                              }
                            : prev,
                        )
                      }
                      min={1}
                      data-testid="input-limit-gold"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Diamond and Gold use default status pricing. Silver and Bronze pricing is set per player. Captain is Elite.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleSaveStatusConfig}
                    disabled={saveStatusConfigMutation.isPending}
                    data-testid="button-save-status-rules"
                  >
                    Save Rules
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading status config…</p>
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
              <Select
                value={playerStatusId || String(selectableStatuses[0]?.validatePlayerStatusId ?? "")}
                onValueChange={setPlayerStatusId}
              >
                <SelectTrigger className="w-32" data-testid="select-player-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {selectableStatuses.map((playerStatus) => (
                    <SelectItem
                      key={playerStatus.validatePlayerStatusId}
                      value={String(playerStatus.validatePlayerStatusId)}
                    >
                      {playerStatus.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isSingleManualPriceRequired ? (
                <Input
                  type="number"
                  min={1}
                  placeholder="Price"
                  value={manualPlayerPrice}
                  onChange={(e) => setManualPlayerPrice(e.target.value)}
                  className="w-28"
                  data-testid="input-player-manual-price"
                />
              ) : (
                <div className="h-9 min-w-24 rounded-md border border-input bg-muted/40 px-3 text-sm flex items-center justify-center whitespace-nowrap">
                  ₹{selectedSingleStatus?.basePrice ?? "-"}
                </div>
              )}
              <Button
                onClick={handleAddPlayer}
                disabled={
                  !playerName.trim() ||
                  addPlayerMutation.isPending ||
                  selectableStatuses.length === 0 ||
                  (isSingleManualPriceRequired && !manualPlayerPrice.trim())
                }
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
                placeholder={
                  isBulkManualPriceRequired
                    ? "Virat,45\nRohit,35\nDhoni,30"
                    : "Virat\nRohit\nDhoni\nBumrah"
                }
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                data-testid="textarea-bulk-players"
              />
              {isBulkManualPriceRequired && (
                <p className="text-xs text-muted-foreground">
                  For Silver/Bronze, enter one player per line as Name,Price.
                </p>
              )}
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground whitespace-nowrap">
                  Default status:
                </label>
                <Select
                  value={defaultStatusId || String(selectableStatuses[0]?.validatePlayerStatusId ?? "")}
                  onValueChange={setDefaultStatusId}
                >
                  <SelectTrigger className="w-32 h-8 text-xs" data-testid="select-default-status">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableStatuses.map((playerStatus) => (
                      <SelectItem
                        key={playerStatus.validatePlayerStatusId}
                        value={String(playerStatus.validatePlayerStatusId)}
                      >
                        {playerStatus.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!isBulkManualPriceRequired && (
                  <div className="h-8 min-w-20 rounded-md border border-input bg-muted/40 px-2 text-xs flex items-center justify-center whitespace-nowrap">
                    ₹{selectedBulkStatus?.basePrice ?? "-"}
                  </div>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleBulkAdd}
                  disabled={!bulkText.trim() || bulkAddMutation.isPending || selectableStatuses.length === 0}
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
                  editingPlayerId === player.id && editingPlayerDraft ? (
                    <div
                      key={player.id}
                      className="flex flex-wrap items-center gap-2 bg-accent/50 border border-border rounded-md px-2 py-2 text-sm"
                      data-testid={`player-edit-${player.id}`}
                    >
                      <Input
                        value={editingPlayerDraft.name}
                        onChange={(event) =>
                          setEditingPlayerDraft((previous) =>
                            previous
                              ? {
                                  ...previous,
                                  name: event.target.value,
                                }
                              : previous,
                          )
                        }
                        className="h-8 w-36"
                        placeholder="Player name"
                        data-testid={`input-edit-player-name-${player.id}`}
                      />
                      <Select
                        value={editingPlayerDraft.validatePlayerStatusId}
                        onValueChange={(value) =>
                          setEditingPlayerDraft((previous) =>
                            previous
                              ? {
                                  ...previous,
                                  validatePlayerStatusId: value,
                                }
                              : previous,
                          )
                        }
                      >
                        <SelectTrigger className="h-8 w-28" data-testid={`select-edit-player-status-${player.id}`}>
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          {selectableStatuses.map((playerStatus) => (
                            <SelectItem
                              key={playerStatus.validatePlayerStatusId}
                              value={String(playerStatus.validatePlayerStatusId)}
                            >
                              {playerStatus.description}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {isEditingPlayerManualPriceRequired ? (
                        <Input
                          type="number"
                          min={1}
                          value={editingPlayerDraft.basePrice}
                          onChange={(event) =>
                            setEditingPlayerDraft((previous) =>
                              previous
                                ? {
                                    ...previous,
                                    basePrice: event.target.value,
                                  }
                                : previous,
                            )
                          }
                          className="h-8 w-24"
                          placeholder="Price"
                          data-testid={`input-edit-player-price-${player.id}`}
                        />
                      ) : (
                        <div className="h-8 min-w-20 rounded-md border border-input bg-muted/40 px-2 text-xs flex items-center justify-center whitespace-nowrap">
                          ₹{editingPlayerStatus?.basePrice ?? "-"}
                        </div>
                      )}

                      <Button
                        size="sm"
                        className="h-8"
                        onClick={handleSaveEditPlayer}
                        disabled={updatePlayerMutation.isPending}
                        data-testid={`button-save-player-${player.id}`}
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={handleCancelEditPlayer}
                        data-testid={`button-cancel-player-${player.id}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div
                      key={player.id}
                      className="flex items-center gap-1.5 bg-accent/50 border border-border rounded-full px-3 py-1 text-sm"
                      data-testid={`player-chip-${player.id}`}
                    >
                      <span>{player.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ₹{player.basePrice}
                      </span>
                      {player.playerStatusDescription && (
                        <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0">
                          {player.playerStatusDescription}
                        </Badge>
                      )}
                      <button
                        onClick={() => handleStartEditPlayer(player)}
                        className="text-muted-foreground hover:text-foreground transition-colors ml-0.5"
                        data-testid={`button-edit-player-${player.id}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => removePlayerMutation.mutate(player.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                        data-testid={`button-remove-player-${player.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )
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
