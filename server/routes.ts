import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPlayerSchema, insertTeamSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ message: "Password required" });
      }

      const isValid = await storage.validatePassword(password);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid password" });
      }

      // Set a simple session cookie
      res.cookie("auth", "authenticated", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });

      res.json({ success: true });
    } catch (error) {
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

  // Player routes
  app.get("/api/players", async (req, res) => {
    try {
      const players = await storage.getPlayers();
      res.json(players);
    } catch (error) {
      res.status(500).json({ message: "Failed to get players" });
    }
  });

  app.post("/api/players", async (req, res) => {
    try {
      const playerData = insertPlayerSchema.parse(req.body);
      const player = await storage.createPlayer(playerData);
      res.json(player);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid player data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create player" });
    }
  });

  app.put("/api/players/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const player = await storage.updatePlayer(id, updates);
      if (!player) {
        return res.status(404).json({ message: "Player not found" });
      }
      res.json(player);
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
      const teams = await storage.getTeams();
      res.json(teams);
    } catch (error) {
      res.status(500).json({ message: "Failed to get teams" });
    }
  });

  app.post("/api/teams", async (req, res) => {
    try {
      const teamData = insertTeamSchema.parse(req.body);
      const team = await storage.createTeam(teamData);
      res.json(team);
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
      const updates = req.body;
      const team = await storage.updateTeam(id, updates);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      res.json(team);
    } catch (error) {
      res.status(500).json({ message: "Failed to update team" });
    }
  });

  // Auction routes
  app.get("/api/auction/current", async (req, res) => {
    try {
      const state = await storage.getAuctionState();
      res.json(state);
    } catch (error) {
      res.status(500).json({ message: "Failed to get auction state" });
    }
  });

  app.post("/api/auction/start", async (req, res) => {
    try {
      const state = await storage.startAuction();
      res.json(state);
    } catch (error) {
      res.status(500).json({ message: "Failed to start auction" });
    }
  });

  app.post("/api/auction/next", async (req, res) => {
    try {
      const state = await storage.nextPlayer();
      res.json(state);
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
      const state = await storage.placeBid(teamId, amount);
      res.json(state);
    } catch (error) {
      res.status(500).json({ message: "Failed to place bid" });
    }
  });

  app.post("/api/auction/sell", async (req, res) => {
    try {
      const state = await storage.sellPlayer();
      res.json(state);
    } catch (error) {
      res.status(500).json({ message: "Failed to sell player" });
    }
  });

  app.post("/api/auction/unsold", async (req, res) => {
    try {
      const state = await storage.markPlayerUnsold();
      res.json(state);
    } catch (error) {
      res.status(500).json({ message: "Failed to mark player as unsold" });
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
      const results = await storage.getResults();
      res.json(results);
    } catch (error) {
      res.status(500).json({ message: "Failed to get results" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
