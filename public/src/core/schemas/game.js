import { z } from "zod";

export const TechTreeDoctrineSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    shortTitle: z.string().optional(),
    subtitle: z.string().optional(),
    playstyle: z.string().optional(),
    focus: z.string().optional(),
    mechanics: z.array(z.string()).optional(),
    color: z.string().optional(),
    icon: z.string().optional(),
    upgrades: z.array(z.string()),
    bonuses: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const TechTreeSchema = z.array(TechTreeDoctrineSchema);

export const ObjectiveDefinitionSchema = z
  .object({
    title: z.string(),
    flavor_text: z.string().optional(),
    reward: z.number().optional(),
    ep_reward: z.number().optional(),
    checkId: z.string(),
    isChapterCompletion: z.boolean().optional(),
  })
  .strict();

export const ObjectiveListSchema = z.array(ObjectiveDefinitionSchema);

export const GameDimensionsSchema = z.object({
  base_cols: z.number().int().min(1).default(12),
  base_rows: z.number().int().min(1).default(12),
});

export const DifficultyPresetSchema = z.object({
  base_money: z.union([z.number(), z.string()]),
  base_max_heat: z.union([z.number(), z.string()]),
  base_max_power: z.union([z.number(), z.string()]),
  base_loop_wait: z.union([z.number(), z.string()]),
  base_manual_heat_reduce: z.union([z.number(), z.string()]),
  power_overflow_to_heat_pct: z.union([z.number(), z.string()]),
});

const HelpTextSectionSchema = z.record(z.string(), z.union([z.string(), z.object({ title: z.string(), content: z.string() }).passthrough()]));
export const HelpTextSchema = z.record(z.string(), HelpTextSectionSchema);

export const VersionSchema = z.object({
  version: z.string().optional().default("Unknown"),
}).passthrough();
