import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertPlayerSchema,
  insertTeamSchema,
  loginSchema,
} from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ── Auth ──
  app.post("/api/auth/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Username and password required" });
    }
    const session = await storage.authenticate(
      parsed.data.username,
      parsed.data.password
    );
    if (!session) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    res.json(session);
  });

  // ── Players ──
  app.get("/api/players", async (_req, res) => {
    const players = await storage.getPlayers();
    res.json(players);
  });

  app.get("/api/players/available", async (_req, res) => {
    const players = await storage.getAvailablePlayers();
    res.json(players);
  });

  app.post("/api/players", async (req, res) => {
    const parsed = insertPlayerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const player = await storage.addPlayer(parsed.data);
    res.status(201).json(player);
  });

  app.post("/api/players/bulk", async (req, res) => {
    const { players: playerList } = req.body;
    if (!Array.isArray(playerList) || playerList.length === 0) {
      return res
        .status(400)
        .json({ error: "players must be a non-empty array" });
    }
    const added = [];
    for (const p of playerList) {
      const parsed = insertPlayerSchema.safeParse({
        name: (p.name || "").trim(),
        basePrice: p.basePrice ?? 10,
      });
      if (parsed.success && parsed.data.name) {
        const player = await storage.addPlayer(parsed.data);
        added.push(player);
      }
    }
    res.status(201).json(added);
  });

  app.delete("/api/players/:id", async (req, res) => {
    await storage.removePlayer(req.params.id);
    res.json({ deleted: true });
  });

  app.delete("/api/players", async (_req, res) => {
    await storage.clearPlayers();
    res.json({ cleared: true });
  });

  // ── Teams ──
  app.get("/api/teams", async (_req, res) => {
    const teams = await storage.getTeams();
    // Don't expose passwords
    const safe = teams.map((t) => ({
      ...t,
      captainPassword: undefined,
    }));
    res.json(safe);
  });

  app.get("/api/teams/:id/players", async (req, res) => {
    const players = await storage.getTeamPlayers(req.params.id);
    res.json(players);
  });

  app.post("/api/teams", async (req, res) => {
    const parsed = insertTeamSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.message });
    }
    const team = await storage.addTeam(parsed.data);
    res.status(201).json({ ...team, captainPassword: undefined });
  });

  app.patch("/api/teams/:id", async (req, res) => {
    try {
      const team = await storage.updateTeam(req.params.id, req.body);
      res.json({ ...team, captainPassword: undefined });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.delete("/api/teams/:id", async (req, res) => {
    await storage.removeTeam(req.params.id);
    res.json({ deleted: true });
  });

  app.delete("/api/teams", async (_req, res) => {
    await storage.clearTeams();
    res.json({ cleared: true });
  });

  // ── Auction ──
  app.get("/api/auction", async (_req, res) => {
    const state = await storage.getAuctionState();
    res.json(state);
  });

  // Admin starts the auction — shuffles players, opens bidding on first
  app.post("/api/auction/start", async (_req, res) => {
    const teams = await storage.getTeams();
    const players = await storage.getPlayers();
    if (teams.length < 2) {
      return res.status(400).json({ error: "Need at least 2 teams" });
    }
    if (players.length < 1) {
      return res.status(400).json({ error: "Need at least 1 player" });
    }
    // Check all teams have captain credentials
    for (const t of teams) {
      if (!t.captainUsername || !t.captainPassword) {
        return res
          .status(400)
          .json({ error: `Team "${t.name}" needs captain credentials` });
      }
    }

    // Shuffle player order
    const ids = players.map((p) => p.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }

    const firstPlayer = players.find((p) => p.id === ids[0])!;
    const state = await storage.updateAuctionState({
      phase: "auction",
      currentPlayerIndex: 0,
      playerOrder: ids,
      currentBid: firstPlayer.basePrice,
      currentBidderId: null,
      biddingOpen: true,
    });
    res.json(state);
  });

  // Captain places a bid on the current player
  app.post("/api/auction/bid", async (req, res) => {
    const { teamId, amount } = req.body;
    if (!teamId || amount === undefined) {
      return res.status(400).json({ error: "teamId and amount required" });
    }

    const state = await storage.getAuctionState();
    if (state.phase !== "auction" || !state.biddingOpen) {
      return res.status(400).json({ error: "Bidding is not open" });
    }

    const team = await storage.getTeam(teamId);
    if (!team) return res.status(400).json({ error: "Team not found" });

    const remaining = team.budget - team.spent;
    if (amount > remaining) {
      return res.status(400).json({ error: "Insufficient budget" });
    }
    if (amount <= state.currentBid) {
      return res
        .status(400)
        .json({ error: `Bid must be higher than ₹${state.currentBid}` });
    }
    if (amount < 1 || amount > 100) {
      return res
        .status(400)
        .json({ error: "Bid must be between ₹1 and ₹100" });
    }

    // Can't outbid yourself
    if (state.currentBidderId === teamId) {
      return res.status(400).json({ error: "You already have the highest bid" });
    }

    const updated = await storage.updateAuctionState({
      currentBid: amount,
      currentBidderId: teamId,
    });
    res.json(updated);
  });

  // Admin confirms the sale of current player to highest bidder
  app.post("/api/auction/sell", async (_req, res) => {
    const state = await storage.getAuctionState();
    if (state.phase !== "auction") {
      return res.status(400).json({ error: "Auction not in progress" });
    }
    if (!state.currentBidderId) {
      return res.status(400).json({ error: "No bids placed yet" });
    }

    const playerId = state.playerOrder[state.currentPlayerIndex];
    try {
      const player = await storage.sellPlayer(
        playerId,
        state.currentBidderId,
        state.currentBid
      );

      // Move to next player
      const nextIndex = state.currentPlayerIndex + 1;
      if (nextIndex >= state.playerOrder.length) {
        // All players done
        await storage.updateAuctionState({
          phase: "completed",
          biddingOpen: false,
          currentPlayerIndex: nextIndex,
        });
      } else {
        const nextPlayerId = state.playerOrder[nextIndex];
        const allPlayers = await storage.getPlayers();
        const nextPlayer = allPlayers.find((p) => p.id === nextPlayerId);
        await storage.updateAuctionState({
          currentPlayerIndex: nextIndex,
          currentBid: nextPlayer?.basePrice ?? 10,
          currentBidderId: null,
          biddingOpen: true,
        });
      }

      const updatedState = await storage.getAuctionState();
      res.json({ player, state: updatedState });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Admin skips current player (unsold)
  app.post("/api/auction/skip", async (_req, res) => {
    const state = await storage.getAuctionState();
    if (state.phase !== "auction") {
      return res.status(400).json({ error: "Auction not in progress" });
    }

    const nextIndex = state.currentPlayerIndex + 1;
    if (nextIndex >= state.playerOrder.length) {
      await storage.updateAuctionState({
        phase: "completed",
        biddingOpen: false,
        currentPlayerIndex: nextIndex,
      });
    } else {
      const nextPlayerId = state.playerOrder[nextIndex];
      const allPlayers = await storage.getPlayers();
      const nextPlayer = allPlayers.find((p) => p.id === nextPlayerId);
      await storage.updateAuctionState({
        currentPlayerIndex: nextIndex,
        currentBid: nextPlayer?.basePrice ?? 10,
        currentBidderId: null,
        biddingOpen: true,
      });
    }

    const updatedState = await storage.getAuctionState();
    res.json(updatedState);
  });

  app.post("/api/auction/reset", async (_req, res) => {
    await storage.resetAuction();
    const state = await storage.getAuctionState();
    res.json(state);
  });

  // ── Full state endpoint ──
  app.get("/api/state", async (_req, res) => {
    const teams = await storage.getTeams();
    const players = await storage.getPlayers();
    const auction = await storage.getAuctionState();
    const teamsWithPlayers = await Promise.all(
      teams.map(async (team) => ({
        ...team,
        captainPassword: undefined,
        players: await storage.getTeamPlayers(team.id),
      }))
    );

    // Get current player on block
    let currentPlayer: any = null;
    if (
      auction.phase === "auction" &&
      auction.currentPlayerIndex < auction.playerOrder.length
    ) {
      const pid = auction.playerOrder[auction.currentPlayerIndex];
      currentPlayer = players.find((p) => p.id === pid) ?? null;
    }

    res.json({
      teams: teamsWithPlayers,
      players,
      availablePlayers: players.filter((p) => !p.teamId),
      auction,
      currentPlayer,
    });
  });

  return httpServer;
}
