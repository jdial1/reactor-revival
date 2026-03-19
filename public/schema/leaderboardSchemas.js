import { z } from "zod";

export const LeaderboardEntrySchema = z.object({
  user_id: z.string(),
  run_id: z.string().optional(),
  heat: z.number().optional().default(0),
  power: z.number().optional().default(0),
  money: z.number().optional().default(0),
  time: z.number().optional(),
  layout: z.string().nullable().optional(),
  timestamp: z.union([z.number(), z.string()]).optional(),
}).passthrough();

export const LeaderboardResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(LeaderboardEntrySchema).optional().default([]),
}).passthrough();
