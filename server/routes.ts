import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPlayerSchema, insertTeamSchema } from "@shared/schema";
import { z } from "zod";

type AuctionPhase = "setup" | "auction" | "completed";
type PlayerStatusRule = {
  validatePlayerStatusId: number;
  description: string;
  basePrice: number;
  maxPerTeam: number | null;
};

function normalizeStatusName(statusDescription: string) {
  return statusDescription.trim().toLowerCase();
}

function requiresManualPlayerPrice(statusDescription: string) {
  const normalizedStatusDescription = normalizeStatusName(statusDescription);
  return normalizedStatusDescription === "silver" || normalizedStatusDescription === "bronze";
}

function parsePositiveWholeNumber(value: unknown) {
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}

function findStatusRuleByNames(statusRules: PlayerStatusRule[], names: string[]) {
  const targetNames = new Set(names.map((name) => normalizeStatusName(name)));
  return statusRules.find((statusRule) => targetNames.has(normalizeStatusName(statusRule.description))) ?? null;
}

function toAuctionPhase(status?: string | null): AuctionPhase {
  if (status === "active") return "auction";
  if (status === "completed") return "completed";
  return "setup";
}

function toStatusMap(playerStatuses: Array<{ validatePlayerStatusId: number; description: string }>) {
  return Object.fromEntries(
    playerStatuses.map((playerStatus) => [playerStatus.validatePlayerStatusId, playerStatus.description]),
  ) as Record<number, string>;
}

function toUiPlayer(player: any, statusMap: Record<number, string> = {}) {
  const validatePlayerStatusId = player.validatePlayerStatusId ?? null;

  return {
    ...player,
    teamId: player.soldTo ?? null,
    soldPrice: player.soldAmount ?? null,
    playerStatusDescription: validatePlayerStatusId ? (statusMap[validatePlayerStatusId] ?? null) : null,
  };
}

async function getUiState() {
  const [setup, teamsRaw, playersRaw, auctionState, playerStatuses] = await Promise.all([
    storage.getSetup(),
    storage.getTeams(),
    storage.getPlayers(),
    storage.getAuctionState(),
    storage.getPlayerStatusRules(),
  ]);

  const statusMap = toStatusMap(playerStatuses);
  const players = playersRaw.map((player) => toUiPlayer(player, statusMap));
  const defaultBudget = setup?.budgetPerTeam ?? 500;

  const teams = teamsRaw.map((team) => {
    const teamPlayers = players.filter((player) => player.teamId === team.id);
    const spent = teamPlayers.reduce((sum, player) => sum + (player.soldPrice ?? 0), 0);
    const budget = (team.remainingBudget ?? defaultBudget) + spent;

    return {
      ...team,
      budget,
      spent,
      captainUsername: team.ownerName,
      players: teamPlayers,
    };
  });

  const currentPlayer = auctionState?.currentPlayerId
    ? players.find((player) => player.id === auctionState.currentPlayerId) ?? null
    : null;

  const auction = {
    phase: toAuctionPhase(auctionState?.status),
    currentPlayerIndex: auctionState?.currentPlayerIndex ?? 0,
    currentBid: auctionState?.currentBid ?? currentPlayer?.basePrice ?? 0,
    currentBidderId: auctionState?.currentBidTeamId ?? null,
    playerOrder: auctionState?.playerQueue ?? players.map((player) => player.id),
  };

  return {
    teams,
    players,
    availablePlayers: players.filter((player) => player.teamId == null),
    auction,
    currentPlayer,
  };
}

let initialized = false;

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize database on first server start
  if (!initialized) {
    await storage.initialize();
    initialized = true;
  }

  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!password) {
        return res.status(400).json({ message: "Password required" });
      }

      const normalizedUsername = String(username ?? "").trim().toLowerCase();

      // Check for guest access
      if (normalizedUsername === "guest" && password === "guest") {
        const session = { role: "guest" as const };
        res.json(session);
        return;
      }

      // Check for admin access
      if (normalizedUsername === "admin" || normalizedUsername === "") {
        const isValidAdmin = await storage.validatePassword(password);
        if (isValidAdmin) {
          const session = { role: "admin" as const };
          res.json(session);
          return;
        }
      }

      // Check for captain access
      if (normalizedUsername) {
        const team = await storage.getTeamByUsername(normalizedUsername, password);
        if (team) {
          const session = {
            role: "captain" as const,
            teamId: team.id,
            teamName: team.name,
          };
          res.json(session);
          return;
        }
      }

      // Backward-compat: allow password-only admin login
      const isValidAdmin = await storage.validatePassword(password);
      if (isValidAdmin && !normalizedUsername) {
        const session = { role: "admin" as const };
        res.json(session);
        return;
      }

      return res.status(401).json({ message: "Invalid password" });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("auth");
    res.json({ success: true });
  });

  app.get("/api/auth/check", (req, res) => {
    const authCookie = req.cookies?.["auth"];
    res.json({ authenticated: authCookie === "authenticated" });
  });

  // Setup routes
  app.get("/api/setup", async (req, res) => {
    try {
      const setup = await storage.getSetup();
      res.json(setup);
    } catch (error) {
      res.status(500).json({ message: "Failed to get setup" });
    }
  });

  app.post("/api/setup", async (req, res) => {
    try {
      const { teamCount, budgetPerTeam, password } = req.body;
      if (!teamCount || !budgetPerTeam) {
        return res.status(400).json({ message: "Team count and budget required" });
      }
      const setup = await storage.saveSetup({ teamCount, budgetPerTeam, password });
      res.json(setup);
    } catch (error) {
      res.status(500).json({ message: "Failed to save setup" });
    }
  });

  app.get("/api/player-statuses", async (_req, res) => {
    try {
      const playerStatuses = await storage.getPlayerStatusRules();
      res.json(playerStatuses);
    } catch (error) {
      res.status(500).json({ message: "Failed to get player statuses" });
    }
  });

  app.post("/api/player-statuses/config", async (req, res) => {
    try {
      const currentRules = await storage.getPlayerStatusRules();

      const diamondRule = findStatusRuleByNames(currentRules, ["diamond", "diamin"]);
      const goldRule = findStatusRuleByNames(currentRules, ["gold"]);
      const eliteRule = findStatusRuleByNames(currentRules, ["elite"]);

      if (!diamondRule || !goldRule || !eliteRule) {
        return res.status(500).json({ message: "Required player statuses are not configured" });
      }

      const prices = req.body?.prices ?? {};
      const limits = req.body?.limits ?? {};

      const diamondPrice = Number(prices.diamond ?? diamondRule.basePrice);
      const goldPrice = Number(prices.gold ?? goldRule.basePrice);

      const configuredPrices = [diamondPrice, goldPrice];
      const hasInvalidPrice = configuredPrices.some((price) => !Number.isInteger(price) || price <= 0);
      if (hasInvalidPrice) {
        return res.status(400).json({ message: "Diamond and Gold prices must be positive whole numbers" });
      }

      if (!(diamondPrice > goldPrice)) {
        return res.status(400).json({
          message: "Price order must be Diamond > Gold",
        });
      }

      const diamondLimit = Number(limits.diamond ?? diamondRule.maxPerTeam ?? 1);
      const eliteLimit = Number(limits.elite ?? eliteRule.maxPerTeam ?? 1);
      const goldLimit = Number(limits.gold ?? goldRule.maxPerTeam ?? 2);

      const configuredLimits = [diamondLimit, eliteLimit, goldLimit];
      const hasInvalidLimit = configuredLimits.some((limit) => !Number.isInteger(limit) || limit < 1);
      if (hasInvalidLimit) {
        return res.status(400).json({ message: "Diamond, Elite and Gold limits must be whole numbers >= 1" });
      }

      const updatedRules = await storage.updatePlayerStatusRules([
        {
          validatePlayerStatusId: diamondRule.validatePlayerStatusId,
          basePrice: diamondPrice,
          maxPerTeam: diamondLimit,
        },
        {
          validatePlayerStatusId: goldRule.validatePlayerStatusId,
          basePrice: goldPrice,
          maxPerTeam: goldLimit,
        },
        {
          validatePlayerStatusId: eliteRule.validatePlayerStatusId,
          maxPerTeam: eliteLimit,
        },
      ]);

      res.json(updatedRules);
    } catch (error) {
      res.status(500).json({ message: "Failed to save player status config" });
    }
  });

  // Player routes
  app.get("/api/players", async (req, res) => {
    try {
      const [players, playerStatuses] = await Promise.all([
        storage.getPlayers(),
        storage.getPlayerStatusRules(),
      ]);

      const statusMap = toStatusMap(playerStatuses);
      res.json(players.map((player) => toUiPlayer(player, statusMap)));
    } catch (error) {
      res.status(500).json({ message: "Failed to get players" });
    }
  });

  app.post("/api/players", async (req, res) => {
    try {
      const validatePlayerStatusId = Number(req.body.validatePlayerStatusId);
      if (!Number.isInteger(validatePlayerStatusId)) {
        return res.status(400).json({ message: "Player status is required" });
      }

      const statusRules = await storage.getPlayerStatusRules();
      const selectedStatusRule = statusRules.find(
        (statusRule) => statusRule.validatePlayerStatusId === validatePlayerStatusId,
      );
      if (!selectedStatusRule) {
        return res.status(400).json({ message: "Invalid player status" });
      }

      if (normalizeStatusName(selectedStatusRule.description) === "elite") {
        return res.status(400).json({ message: "Elite status is reserved for team captains" });
      }

      let basePrice = selectedStatusRule.basePrice;
      if (requiresManualPlayerPrice(selectedStatusRule.description)) {
        const parsedBasePrice = parsePositiveWholeNumber(req.body.basePrice);
        if (parsedBasePrice === null) {
          return res.status(400).json({
            message: "Base price is required for Silver and Bronze players and must be a whole number > 0",
          });
        }
        basePrice = parsedBasePrice;
      }

      const playerData = insertPlayerSchema.parse({
        ...req.body,
        role: req.body.role ?? "player",
        basePrice,
        validatePlayerStatusId,
      });

      const player = await storage.createPlayer(playerData);
      const statusMap = toStatusMap(statusRules);
      res.json(toUiPlayer(player, statusMap));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid player data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create player" });
    }
  });

  app.post("/api/players/bulk", async (req, res) => {
    try {
      const players = Array.isArray(req.body?.players) ? req.body.players : [];
      if (players.length === 0) {
        return res.status(400).json({ message: "Players list required" });
      }

      const statusRules = await storage.getPlayerStatusRules();
      const statusRuleByStatusId = new Map(
        statusRules.map((statusRule) => [statusRule.validatePlayerStatusId, statusRule]),
      );
      const statusMap = toStatusMap(statusRules);

      const created = [];
      for (const player of players) {
        const validatePlayerStatusId = Number(player.validatePlayerStatusId ?? req.body?.validatePlayerStatusId);
        if (!Number.isInteger(validatePlayerStatusId)) {
          return res.status(400).json({ message: "Player status is required for all players" });
        }

        const selectedStatusRule = statusRuleByStatusId.get(validatePlayerStatusId);
        if (!selectedStatusRule) {
          return res.status(400).json({ message: "Invalid player status" });
        }

        if (normalizeStatusName(selectedStatusRule.description) === "elite") {
          return res.status(400).json({ message: "Elite status is reserved for team captains" });
        }

        let basePrice = selectedStatusRule.basePrice;
        if (requiresManualPlayerPrice(selectedStatusRule.description)) {
          const parsedBasePrice = parsePositiveWholeNumber(player.basePrice);
          if (parsedBasePrice === null) {
            return res.status(400).json({
              message: "Each Silver/Bronze player must include a basePrice as a whole number > 0",
            });
          }
          basePrice = parsedBasePrice;
        }

        const playerData = insertPlayerSchema.parse({
          ...player,
          role: player.role ?? "player",
          basePrice,
          validatePlayerStatusId,
        });
        const inserted = await storage.createPlayer(playerData);
        created.push(toUiPlayer(inserted, statusMap));
      }

      res.json({ players: created });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid player data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create players" });
    }
  });

  app.put("/api/players/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = { ...req.body };
      const existingPlayer = (await storage.getPlayers()).find((player) => player.id === id);
      if (!existingPlayer) {
        return res.status(404).json({ message: "Player not found" });
      }

      const statusRules = await storage.getPlayerStatusRules();
      const statusRuleByStatusId = new Map(
        statusRules.map((statusRule) => [statusRule.validatePlayerStatusId, statusRule]),
      );

      const isStatusChanged = updates.validatePlayerStatusId !== undefined;
      const targetStatusId = isStatusChanged
        ? Number(updates.validatePlayerStatusId)
        : existingPlayer.validatePlayerStatusId;

      if (!Number.isInteger(targetStatusId)) {
        return res.status(400).json({ message: "Invalid player status" });
      }

      const normalizedTargetStatusId = Number(targetStatusId);

      const selectedStatusRule = statusRuleByStatusId.get(normalizedTargetStatusId);
      if (!selectedStatusRule) {
        return res.status(400).json({ message: "Invalid player status" });
      }

      if (normalizeStatusName(selectedStatusRule.description) === "elite") {
        return res.status(400).json({ message: "Elite status is reserved for team captains" });
      }

      if (requiresManualPlayerPrice(selectedStatusRule.description)) {
        if (isStatusChanged || updates.basePrice !== undefined) {
          const parsedBasePrice = parsePositiveWholeNumber(updates.basePrice);
          if (parsedBasePrice === null) {
            return res.status(400).json({
              message: "Base price is required for Silver and Bronze players and must be a whole number > 0",
            });
          }
          updates.basePrice = parsedBasePrice;
        }
      } else {
        updates.basePrice = selectedStatusRule.basePrice;
      }

      if (isStatusChanged) {
        updates.validatePlayerStatusId = normalizedTargetStatusId;
      }

      const player = await storage.updatePlayer(id, updates);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }

      const playerStatuses = await storage.getPlayerStatusRules();
      const statusMap = toStatusMap(playerStatuses);
      res.json(toUiPlayer(player, statusMap));
    } catch (error) {
      res.status(500).json({ message: "Failed to update player" });
    }
  });

  app.delete("/api/players/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePlayer(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete player" });
    }
  });

  // Team routes
  app.get("/api/teams", async (req, res) => {
    try {
      const [setup, teams, players] = await Promise.all([
        storage.getSetup(),
        storage.getTeams(),
        storage.getPlayers(),
      ]);

      const defaultBudget = setup?.budgetPerTeam ?? 500;
      const mappedTeams = teams.map((team) => {
        const spent = players
          .filter((player) => player.soldTo === team.id)
          .reduce((sum, player) => sum + (player.soldAmount ?? 0), 0);
        const budget = (team.remainingBudget ?? defaultBudget) + spent;

        return {
          ...team,
          budget,
          spent,
          captainUsername: team.ownerName,
        };
      });

      res.json(mappedTeams);
    } catch (error) {
      res.status(500).json({ message: "Failed to get teams" });
    }
  });

  app.post("/api/teams", async (req, res) => {
    try {
      const teamData = insertTeamSchema.parse({
        name: req.body.name,
        ownerName: req.body.ownerName ?? req.body.captainUsername,
        remainingBudget: Number(req.body.remainingBudget ?? req.body.budget),
      });
      const team = await storage.createTeam(teamData);
      await storage.assignCaptainEliteStatus(team.ownerName);
      res.json({
        ...team,
        budget: team.remainingBudget,
        spent: 0,
        captainUsername: team.ownerName,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid team data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create team" });
    }
  });

  app.put("/api/teams/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates: Record<string, unknown> = {};

      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.captainUsername !== undefined || req.body.ownerName !== undefined) {
        updates.ownerName = req.body.ownerName ?? req.body.captainUsername;
      }
      if (req.body.remainingBudget !== undefined || req.body.budget !== undefined) {
        updates.remainingBudget = Number(req.body.remainingBudget ?? req.body.budget);
      }

      const team = await storage.updateTeam(id, updates);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }

      if (typeof updates.ownerName === "string") {
        await storage.assignCaptainEliteStatus(updates.ownerName);
      }

      res.json({
        ...team,
        budget: team.remainingBudget,
        captainUsername: team.ownerName,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to update team" });
    }
  });

  app.delete("/api/teams/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteTeam(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete team" });
    }
  });

  // Auction routes
  app.get("/api/auction/current", async (req, res) => {
    try {
      const uiState = await getUiState();
      res.json(uiState.auction);
    } catch (error) {
      res.status(500).json({ message: "Failed to get auction state" });
    }
  });

  app.post("/api/auction/start", async (req, res) => {
    try {
      await storage.startAuction();
      const uiState = await getUiState();
      res.json(uiState.auction);
    } catch (error) {
      res.status(500).json({ message: "Failed to start auction" });
    }
  });

  app.post("/api/auction/next", async (req, res) => {
    try {
      await storage.nextPlayer();
      const uiState = await getUiState();
      res.json(uiState.auction);
    } catch (error) {
      res.status(500).json({ message: "Failed to move to next player" });
    }
  });

  app.post("/api/auction/bid", async (req, res) => {
    try {
      const { teamId, amount } = req.body;
      if (!teamId || !amount) {
        return res.status(400).json({ message: "Team ID and amount required" });
      }
      await storage.placeBid(Number(teamId), Number(amount));
      const uiState = await getUiState();
      res.json(uiState.auction);
    } catch (error) {
      res.status(500).json({ message: "Failed to place bid" });
    }
  });

  app.post("/api/auction/sell", async (req, res) => {
    try {
      const [auctionState, players, teams, statusRules] = await Promise.all([
        storage.getAuctionState(),
        storage.getPlayers(),
        storage.getTeams(),
        storage.getPlayerStatusRules(),
      ]);

      if (!auctionState || !auctionState.currentPlayerId || !auctionState.currentBidTeamId || !auctionState.currentBid) {
        return res.status(400).json({ message: "No active bid to sell" });
      }

      const currentPlayer = players.find((player) => player.id === auctionState.currentPlayerId);
      if (!currentPlayer) {
        return res.status(404).json({ message: "Current player not found" });
      }

      const currentStatusRule = statusRules.find(
        (statusRule) => statusRule.validatePlayerStatusId === currentPlayer.validatePlayerStatusId,
      );

      if (currentStatusRule && currentStatusRule.maxPerTeam !== null) {
        const teamId = auctionState.currentBidTeamId;

        let statusCountForTeam = players.filter(
          (player) =>
            player.soldTo === teamId &&
            player.validatePlayerStatusId === currentStatusRule.validatePlayerStatusId,
        ).length;

        if (normalizeStatusName(currentStatusRule.description) === "elite") {
          const team = teams.find((candidateTeam) => candidateTeam.id === teamId);
          if (team) {
            const captainAlreadyCounted = players.some(
              (player) =>
                player.soldTo === team.id &&
                player.validatePlayerStatusId === currentStatusRule.validatePlayerStatusId &&
                player.name.toLowerCase() === team.ownerName.toLowerCase(),
            );

            if (!captainAlreadyCounted) {
              statusCountForTeam += 1;
            }
          }
        }

        if (statusCountForTeam >= currentStatusRule.maxPerTeam) {
          return res.status(400).json({
            message: `Rule violation: Team already has maximum allowed ${currentStatusRule.description} players (${currentStatusRule.maxPerTeam})`,
          });
        }
      }

      await storage.sellPlayer();
      const uiState = await getUiState();
      res.json({ state: uiState.auction });
    } catch (error) {
      res.status(500).json({ message: "Failed to sell player" });
    }
  });

  app.post("/api/auction/unsold", async (req, res) => {
    try {
      await storage.markPlayerUnsold();
      const uiState = await getUiState();
      res.json(uiState.auction);
    } catch (error) {
      res.status(500).json({ message: "Failed to mark player as unsold" });
    }
  });

  app.post("/api/auction/skip", async (req, res) => {
    try {
      await storage.markPlayerUnsold();
      const uiState = await getUiState();
      res.json(uiState.auction);
    } catch (error) {
      res.status(500).json({ message: "Failed to skip player" });
    }
  });

  app.post("/api/auction/reset", async (req, res) => {
    try {
      await storage.resetAuction();
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to reset auction" });
    }
  });

  // Results routes
  app.get("/api/results", async (req, res) => {
    try {
      const uiState = await getUiState();
      res.json(uiState.teams);
    } catch (error) {
      res.status(500).json({ message: "Failed to get results" });
    }
  });

  // Full state endpoint for UI
  app.get("/api/state", async (req, res) => {
    try {
      const uiState = await getUiState();
      res.json(uiState);
    } catch (error) {
      console.error("Failed to get state:", error);
      res.status(500).json({ message: "Failed to get state" });
    }
  });

  // Auction endpoint for login routing
  app.get("/api/auction", async (req, res) => {
    try {
      const uiState = await getUiState();
      res.json({ phase: uiState.auction.phase });
    } catch (error) {
      res.status(500).json({ message: "Failed to get auction" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
