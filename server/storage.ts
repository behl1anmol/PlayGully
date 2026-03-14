import { randomUUID } from "crypto";

export interface Player {
  id: string;
  name: string;
  basePrice: number;
  teamId: string | null;
  soldPrice: number | null;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  budget: number;
  spent: number;
  captainUsername: string | null;
  captainPassword: string | null;
}

export interface AuctionState {
  phase: "setup" | "auction" | "completed";
  currentPlayerIndex: number;
  playerOrder: string[];
  currentBid: number;
  currentBidderId: string | null;
  biddingOpen: boolean;
}

interface Session {
  role: "admin" | "captain" | "guest";
  teamId?: string;
  username: string;
}

const ADMIN_USER = "admin";
const ADMIN_PASS = "appl2026";
const GUEST_USER = "guest";
const GUEST_PASS = "guest";

class MemStorage {
  private players: Map<string, Player> = new Map();
  private teams: Map<string, Team> = new Map();
  private auctionState: AuctionState = {
    phase: "setup",
    currentPlayerIndex: 0,
    playerOrder: [],
    currentBid: 0,
    currentBidderId: null,
    biddingOpen: false,
  };

  // ── Auth ──
  async authenticate(username: string, password: string): Promise<Session | null> {
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      return { role: "admin", username };
    }
    if (username === GUEST_USER && password === GUEST_PASS) {
      return { role: "guest", username };
    }
    // Check captain credentials
    for (const team of this.teams.values()) {
      if (
        team.captainUsername === username &&
        team.captainPassword === password
      ) {
        return { role: "captain", teamId: team.id, username };
      }
    }
    return null;
  }

  // ── Players ──
  async getPlayers(): Promise<Player[]> {
    return Array.from(this.players.values());
  }

  async getAvailablePlayers(): Promise<Player[]> {
    return Array.from(this.players.values()).filter((p) => !p.teamId);
  }

  async getPlayer(id: string): Promise<Player | undefined> {
    return this.players.get(id);
  }

  async addPlayer(data: { name: string; basePrice: number }): Promise<Player> {
    const player: Player = {
      id: randomUUID(),
      name: data.name,
      basePrice: data.basePrice,
      teamId: null,
      soldPrice: null,
    };
    this.players.set(player.id, player);
    return player;
  }

  async removePlayer(id: string): Promise<void> {
    this.players.delete(id);
  }

  async clearPlayers(): Promise<void> {
    this.players.clear();
  }

  async sellPlayer(
    playerId: string,
    teamId: string,
    price: number
  ): Promise<Player> {
    const player = this.players.get(playerId);
    if (!player) throw new Error("Player not found");
    const team = this.teams.get(teamId);
    if (!team) throw new Error("Team not found");
    player.teamId = teamId;
    player.soldPrice = price;
    team.spent += price;
    this.players.set(playerId, player);
    this.teams.set(teamId, team);
    return player;
  }

  // ── Teams ──
  async getTeams(): Promise<Team[]> {
    return Array.from(this.teams.values());
  }

  async getTeam(id: string): Promise<Team | undefined> {
    return this.teams.get(id);
  }

  async getTeamPlayers(teamId: string): Promise<Player[]> {
    return Array.from(this.players.values()).filter(
      (p) => p.teamId === teamId
    );
  }

  async addTeam(data: {
    name: string;
    color: string;
    budget: number;
    captainUsername?: string | null;
    captainPassword?: string | null;
  }): Promise<Team> {
    const team: Team = {
      id: randomUUID(),
      name: data.name,
      color: data.color,
      budget: data.budget,
      spent: 0,
      captainUsername: data.captainUsername ?? null,
      captainPassword: data.captainPassword ?? null,
    };
    this.teams.set(team.id, team);
    return team;
  }

  async updateTeam(
    id: string,
    data: Partial<Omit<Team, "id">>
  ): Promise<Team> {
    const team = this.teams.get(id);
    if (!team) throw new Error("Team not found");
    Object.assign(team, data);
    this.teams.set(id, team);
    return team;
  }

  async removeTeam(id: string): Promise<void> {
    this.teams.delete(id);
  }

  async clearTeams(): Promise<void> {
    this.teams.clear();
  }

  // ── Auction State ──
  async getAuctionState(): Promise<AuctionState> {
    return { ...this.auctionState };
  }

  async updateAuctionState(
    updates: Partial<AuctionState>
  ): Promise<AuctionState> {
    Object.assign(this.auctionState, updates);
    return { ...this.auctionState };
  }

  async resetAuction(): Promise<void> {
    // Reset all players
    for (const [id, player] of this.players.entries()) {
      player.teamId = null;
      player.soldPrice = null;
      this.players.set(id, player);
    }
    // Reset team budgets
    for (const [id, team] of this.teams.entries()) {
      team.spent = 0;
      this.teams.set(id, team);
    }
    // Reset auction state
    this.auctionState = {
      phase: "setup",
      currentPlayerIndex: 0,
      playerOrder: [],
      currentBid: 0,
      currentBidderId: null,
      biddingOpen: false,
    };
  }
}

export const storage = new MemStorage();
