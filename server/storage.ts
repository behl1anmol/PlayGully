import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";

// Use raw postgres connection for better compatibility
const client = postgres(process.env.DATABASE_URL || "", {
  ssl: process.env.NODE_ENV === "production" ? "require" : false,
});

const db = drizzle(client, { schema });

function normalizeStatusName(statusDescription: string) {
  return statusDescription.trim().toLowerCase();
}

export const storage = {
  // Initialize
  async initialize() {
    try {
      const defaultPlayerStatuses = [
        { validatePlayerStatusId: 1, description: "Diamond" },
        { validatePlayerStatusId: 2, description: "Gold" },
        { validatePlayerStatusId: 3, description: "Silver" },
        { validatePlayerStatusId: 4, description: "Bronze" },
        { validatePlayerStatusId: 5, description: "Elite" },
      ];

      const existingStatuses = await db.select().from(schema.ValidatePlayerStatus);
      const existingStatusById = new Map(
        existingStatuses.map((status) => [status.validatePlayerStatusId, status]),
      );

      for (const status of defaultPlayerStatuses) {
        const existingStatus = existingStatusById.get(status.validatePlayerStatusId);
        if (!existingStatus) {
          await db.insert(schema.ValidatePlayerStatus).values(status);
          continue;
        }

        if (existingStatus.description !== status.description) {
          await db
            .update(schema.ValidatePlayerStatus)
            .set({ description: status.description })
            .where(eq(schema.ValidatePlayerStatus.validatePlayerStatusId, status.validatePlayerStatusId));
        }
      }

      const defaultStatusRuleByStatusId: Record<number, { basePrice: number; maxPerTeam: number | null }> = {
        1: { basePrice: 100, maxPerTeam: 1 },
        2: { basePrice: 70, maxPerTeam: 2 },
        3: { basePrice: 0, maxPerTeam: null },
        4: { basePrice: 0, maxPerTeam: null },
        5: { basePrice: 0, maxPerTeam: 1 },
      };

      const existingStatusRules = await db.select().from(schema.playerStatusRules);
      const existingStatusRuleByStatusId = new Map(
        existingStatusRules.map((statusRule) => [statusRule.validatePlayerStatusId, statusRule]),
      );

      for (const status of defaultPlayerStatuses) {
        const defaultRule = defaultStatusRuleByStatusId[status.validatePlayerStatusId];
        if (!defaultRule) continue;

        const existingRule = existingStatusRuleByStatusId.get(status.validatePlayerStatusId);
        if (!existingRule) {
          await db.insert(schema.playerStatusRules).values({
            validatePlayerStatusId: status.validatePlayerStatusId,
            basePrice: defaultRule.basePrice,
            maxPerTeam: defaultRule.maxPerTeam,
          });
          continue;
        }

        if (
          (status.validatePlayerStatusId === 3 || status.validatePlayerStatusId === 4) &&
          existingRule.basePrice !== 0
        ) {
          await db
            .update(schema.playerStatusRules)
            .set({ basePrice: 0 })
            .where(eq(schema.playerStatusRules.validatePlayerStatusId, status.validatePlayerStatusId));
        }
      }

      const setup = await db.select().from(schema.setup).limit(1);
      if (!setup.length) {
        // Create default setup record
        await db.insert(schema.setup).values({
          teamCount: 2,
          budgetPerTeam: 500,
          password: "appl2026",
        });
        console.log("Initialized setup with default password: appl2026");
      }

      await this.backfillCaptainsEliteStatus();
    } catch (error) {
      console.error("Failed to initialize setup:", error);
    }
  },

  async getPlayerStatuses() {
    return await db
      .select()
      .from(schema.ValidatePlayerStatus)
      .orderBy(schema.ValidatePlayerStatus.validatePlayerStatusId);
  },

  async getPlayerStatusRules() {
    const [playerStatuses, statusRules] = await Promise.all([
      this.getPlayerStatuses(),
      db.select().from(schema.playerStatusRules),
    ]);

    const statusRuleByStatusId = new Map(
      statusRules.map((statusRule) => [statusRule.validatePlayerStatusId, statusRule]),
    );

    return playerStatuses.map((playerStatus) => {
      const statusRule = statusRuleByStatusId.get(playerStatus.validatePlayerStatusId);
      return {
        ...playerStatus,
        basePrice: statusRule?.basePrice ?? 0,
        maxPerTeam: statusRule?.maxPerTeam ?? null,
      };
    });
  },

  async updatePlayerStatusRules(
    updates: Array<{
      validatePlayerStatusId: number;
      basePrice?: number;
      maxPerTeam?: number | null;
    }>,
  ) {
    if (updates.length === 0) {
      return this.getPlayerStatusRules();
    }

    const existingRules = await db.select().from(schema.playerStatusRules);
    const existingRuleByStatusId = new Map(
      existingRules.map((statusRule) => [statusRule.validatePlayerStatusId, statusRule]),
    );

    for (const update of updates) {
      const setData: { basePrice?: number; maxPerTeam?: number | null } = {};
      if (update.basePrice !== undefined) setData.basePrice = update.basePrice;
      if (update.maxPerTeam !== undefined) setData.maxPerTeam = update.maxPerTeam;

      const existingRule = existingRuleByStatusId.get(update.validatePlayerStatusId);
      if (!existingRule) {
        await db.insert(schema.playerStatusRules).values({
          validatePlayerStatusId: update.validatePlayerStatusId,
          basePrice: setData.basePrice ?? 0,
          maxPerTeam: setData.maxPerTeam ?? null,
        });
        continue;
      }

      if (Object.keys(setData).length > 0) {
        await db
          .update(schema.playerStatusRules)
          .set(setData)
          .where(eq(schema.playerStatusRules.validatePlayerStatusId, update.validatePlayerStatusId));

        if (setData.basePrice !== undefined) {
          await db
            .update(schema.players)
            .set({ basePrice: setData.basePrice })
            .where(
              and(
                eq(schema.players.validatePlayerStatusId, update.validatePlayerStatusId),
                isNull(schema.players.soldTo),
              ),
            );
        }
      }
    }

    return this.getPlayerStatusRules();
  },

  async assignCaptainEliteStatus(captainUsername: string) {
    const normalizedCaptainUsername = captainUsername?.trim().toLowerCase();
    if (!normalizedCaptainUsername) return;

    const [playerStatuses, statusRules] = await Promise.all([
      this.getPlayerStatuses(),
      this.getPlayerStatusRules(),
    ]);

    const eliteStatus = playerStatuses.find(
      (playerStatus) => normalizeStatusName(playerStatus.description) === "elite",
    );
    if (!eliteStatus) return;

    const eliteStatusRule = statusRules.find(
      (statusRule) => statusRule.validatePlayerStatusId === eliteStatus.validatePlayerStatusId,
    );
    const eliteBasePrice = eliteStatusRule?.basePrice ?? 0;

    const players = await db.select().from(schema.players);
    const captainPlayers = players.filter(
      (player) => player.name.toLowerCase() === normalizedCaptainUsername,
    );

    for (const captainPlayer of captainPlayers) {
      if (
        captainPlayer.validatePlayerStatusId !== eliteStatus.validatePlayerStatusId ||
        captainPlayer.basePrice !== eliteBasePrice
      ) {
        await db.update(schema.players)
          .set({
            validatePlayerStatusId: eliteStatus.validatePlayerStatusId,
            basePrice: eliteBasePrice,
          })
          .where(eq(schema.players.id, captainPlayer.id));
      }
    }
  },

  async backfillCaptainsEliteStatus() {
    const teams = await this.getTeams();
    for (const team of teams) {
      await this.assignCaptainEliteStatus(team.ownerName);
    }
  },

  // Password validation
  async validatePassword(password: string): Promise<boolean> {
    const setup = await db.select().from(schema.setup).limit(1);
    if (!setup.length) return false;
    return setup[0].password === password;
  },

  // Setup
  async getSetup() {
    const result = await db.select().from(schema.setup).limit(1);
    return result[0] || null;
  },

  async saveSetup(data: { teamCount: number; budgetPerTeam: number; password?: string }) {
    const existing = await db.select().from(schema.setup).limit(1);
    if (existing.length > 0) {
      const updated = await db.update(schema.setup)
        .set({ teamCount: data.teamCount, budgetPerTeam: data.budgetPerTeam, ...(data.password ? { password: data.password } : {}) })
        .where(eq(schema.setup.id, existing[0].id))
        .returning();
      return updated[0];
    }
    const inserted = await db.insert(schema.setup).values(data).returning();
    return inserted[0];
  },

  // Players
  async getPlayers() {
    return await db.select().from(schema.players).orderBy(schema.players.id);
  },

  async createPlayer(data: typeof schema.players.$inferInsert) {
    const inserted = await db.insert(schema.players).values(data).returning();
    return inserted[0];
  },

  async updatePlayer(id: number, updates: Partial<typeof schema.players.$inferInsert>) {
    const updated = await db.update(schema.players)
      .set(updates)
      .where(eq(schema.players.id, id))
      .returning();
    return updated[0] || null;
  },

  async deletePlayer(id: number) {
    await db.delete(schema.players).where(eq(schema.players.id, id));
  },

  // Teams
  async getTeams() {
    return await db.select().from(schema.teams).orderBy(schema.teams.id);
  },

  async getTeamByUsername(username: string, _password: string) {
    const teams = await db.select().from(schema.teams);
    return teams.find((team) => team.ownerName.toLowerCase() === username.toLowerCase()) ?? null;
  },

  async createTeam(data: typeof schema.teams.$inferInsert) {
    const inserted = await db.insert(schema.teams).values(data).returning();
    return inserted[0];
  },

  async updateTeam(id: number, updates: Partial<typeof schema.teams.$inferInsert>) {
    const updated = await db.update(schema.teams)
      .set(updates)
      .where(eq(schema.teams.id, id))
      .returning();
    return updated[0] || null;
  },

  async deleteTeam(id: number) {
    await db.update(schema.players)
      .set({ soldTo: null, soldAmount: null, status: "available" })
      .where(eq(schema.players.soldTo, id));

    await db.delete(schema.teams).where(eq(schema.teams.id, id));
  },

  // Auction
  async getAuctionState() {
    const state = await db.select().from(schema.auctionState).limit(1);
    return state[0] || null;
  },

  async startAuction() {
    const players = await db.select().from(schema.players).orderBy(schema.players.id);
    const playerIds = players.map(p => p.id);
    
    const existing = await db.select().from(schema.auctionState).limit(1);
    if (existing.length > 0) {
      const updated = await db.update(schema.auctionState)
        .set({ 
          status: 'active',
          currentPlayerIndex: 0,
          currentPlayerId: playerIds[0] || null,
          playerQueue: playerIds,
          currentBid: null,
          currentBidTeamId: null
        })
        .where(eq(schema.auctionState.id, existing[0].id))
        .returning();
      return updated[0];
    }
    
    const inserted = await db.insert(schema.auctionState).values({
      status: 'active',
      currentPlayerIndex: 0,
      currentPlayerId: playerIds[0] || null,
      playerQueue: playerIds,
      currentBid: null,
      currentBidTeamId: null
    }).returning();
    return inserted[0];
  },

  async nextPlayer() {
    const state = await db.select().from(schema.auctionState).limit(1);
    if (!state.length) throw new Error('No auction state found');
    
    const current = state[0];
    const nextIndex = current.currentPlayerIndex + 1;
    const nextPlayerId = current.playerQueue[nextIndex] || null;
    
    const updated = await db.update(schema.auctionState)
      .set({
        currentPlayerIndex: nextIndex,
        currentPlayerId: nextPlayerId,
        currentBid: null,
        currentBidTeamId: null,
        status: nextPlayerId ? 'active' : 'completed'
      })
      .where(eq(schema.auctionState.id, current.id))
      .returning();
    return updated[0];
  },

  async placeBid(teamId: number, amount: number) {
    const state = await db.select().from(schema.auctionState).limit(1);
    if (!state.length) throw new Error('No auction state');
    
    const updated = await db.update(schema.auctionState)
      .set({ currentBid: amount, currentBidTeamId: teamId })
      .where(eq(schema.auctionState.id, state[0].id))
      .returning();
    return updated[0];
  },

  async sellPlayer() {
    const state = await db.select().from(schema.auctionState).limit(1);
    if (!state.length) throw new Error('No auction state');
    
    const current = state[0];
    if (!current.currentPlayerId || !current.currentBidTeamId || !current.currentBid) {
      throw new Error('No active bid to sell');
    }

    // Update player as sold
    await db.update(schema.players)
      .set({ 
        soldTo: current.currentBidTeamId,
        soldAmount: current.currentBid,
        status: 'sold'
      })
      .where(eq(schema.players.id, current.currentPlayerId));

    // Update team budget
    const team = await db.select().from(schema.teams).where(eq(schema.teams.id, current.currentBidTeamId)).limit(1);
    if (team.length > 0) {
      await db.update(schema.teams)
        .set({ remainingBudget: team[0].remainingBudget - current.currentBid })
        .where(eq(schema.teams.id, current.currentBidTeamId));
    }

    // Move to next player
    return await this.nextPlayer();
  },

  async markPlayerUnsold() {
    const state = await db.select().from(schema.auctionState).limit(1);
    if (!state.length) throw new Error('No auction state');
    
    const current = state[0];
    if (!current.currentPlayerId) throw new Error('No current player');

    await db.update(schema.players)
      .set({ status: 'unsold' })
      .where(eq(schema.players.id, current.currentPlayerId));

    return await this.nextPlayer();
  },

  async resetAuction() {
    await db.update(schema.players).set({ status: 'available', soldTo: null, soldAmount: null });
    await db.delete(schema.auctionState);
  },

  // Results
  async getResults() {
    const teams = await db.select().from(schema.teams);
    const players = await db.select().from(schema.players);
    
    return teams.map(team => ({
      ...team,
      players: players.filter(p => p.soldTo === team.id)
    }));
  }
};
