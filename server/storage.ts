import { drizzle } from "drizzle-orm/neon-serverless";
import { neon } from "@neondatabase/serverless";
import * as schema from "@shared/schema";
import { eq } from "drizzle-orm";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

export const storage = {
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

  async createPlayer(data: typeof schema.insertPlayerSchema._type) {
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

  async createTeam(data: typeof schema.insertTeamSchema._type) {
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
