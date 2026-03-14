import { pgTable, serial, text, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export type AuthSession = {
  role: "admin" | "captain" | "guest";
  teamId?: number;
  teamName?: string;
};

export const setup = pgTable("setup", {
  id: serial("id").primaryKey(),
  teamCount: integer("team_count").notNull(),
  budgetPerTeam: integer("budget_per_team").notNull(),
  maxPlayersPerTeam: integer("max_players_per_team").notNull().default(11),
  password: text("password").notNull().default("admin123"),
});

export const ValidatePlayerStatus = pgTable("ValidatePlayerStatus", {
  validatePlayerStatusId: integer("ValidatePlayerStatusID").primaryKey(),
  description: text("Description").notNull().unique(),
});

export const playerStatusRules = pgTable("player_status_rules", {
  id: serial("id").primaryKey(),
  validatePlayerStatusId: integer("ValidatePlayerStatusID")
    .notNull()
    .references(() => ValidatePlayerStatus.validatePlayerStatusId)
    .unique(),
  basePrice: integer("base_price").notNull(),
  maxPerTeam: integer("max_per_team"),
});

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(), // batsman, bowler, allrounder, wicketkeeper
  basePrice: integer("base_price").notNull(),
  validatePlayerStatusId: integer("ValidatePlayerStatusID").references(() => ValidatePlayerStatus.validatePlayerStatusId),
  status: text("status").notNull().default("available"), // available, sold, unsold
  soldTo: integer("sold_to"),
  soldAmount: integer("sold_amount"),
});

export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ownerName: text("owner_name").notNull(),
  remainingBudget: integer("remaining_budget").notNull(),
});

export const auctionState = pgTable("auction_state", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default("idle"), // idle, active, paused, completed
  currentPlayerIndex: integer("current_player_index").notNull().default(0),
  currentPlayerId: integer("current_player_id"),
  playerQueue: jsonb("player_queue").notNull().$type<number[]>().default([]),
  currentBid: integer("current_bid"),
  currentBidTeamId: integer("current_bid_team_id"),
});

export const instantAuctionState = pgTable("instant_auction_state", {
  id: serial("id").primaryKey(),
  status: text("status").notNull().default("idle"), // idle, active, completed
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
});

export const instantPlayerLocks = pgTable("instant_player_locks", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id)
    .unique(),
  teamId: integer("team_id")
    .notNull()
    .references(() => teams.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true, status: true, soldTo: true, soldAmount: true });
export const insertTeamSchema = createInsertSchema(teams).omit({ id: true });

export type Setup = typeof setup.$inferSelect;
export type Player = typeof players.$inferSelect & {
  teamId?: number | null;
  soldPrice?: number | null;
  playerStatusDescription?: string | null;
};
export type Team = typeof teams.$inferSelect & {
  budget?: number;
  spent?: number;
  captainUsername?: string;
};
export type AuctionState = {
  phase: "setup" | "auction" | "paused" | "completed";
  currentPlayerIndex: number;
  currentBid: number;
  currentBidderId: number | null;
  playerOrder: number[];
};

export type InstantPlayerLock = typeof instantPlayerLocks.$inferSelect;
