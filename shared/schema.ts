import { z } from "zod";

export const insertPlayerSchema = z.object({
  name: z.string().min(1),
  basePrice: z.number().int().min(1).max(100).default(10),
});

export const insertTeamSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1),
  budget: z.number().int().min(1).default(500),
  captainUsername: z.string().nullable().optional(),
  captainPassword: z.string().nullable().optional(),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type LoginCredentials = z.infer<typeof loginSchema>;
