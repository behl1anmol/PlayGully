import { pgTable, serial, text, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const setup = pgTable("setup", {
  id: serial("id").primaryKey(),
  teamCount: integer("team_count").notNull(),
  budgetPerTeam: integer("budget_per_team").notNull(),
  password: text("password").notNull().default("admin123"),
});

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(), // batsman, bowler, allrounder, wicketkeeper
  basePrice: integer("base_price").notNull(),
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
  status: text("status").notNull().default("idle"), // idle, active, completed
  currentPlayerIndex: integer("current_player_index").notNull().default(0),
  currentPlayerId: integer("current_player_id"),
  playerQueue: jsonb("player_queue").notNull().$type<number[]>().default([]),
  currentBid: integer("current_bid"),
  currentBidTeamId: integer("current_bid_team_id"),
});

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true, status: true, soldTo: true, soldAmount: true });
export const insertTeamSchema = createInsertSchema(teams).omit({ id: true });
