import { z } from "zod";
import { toDecimal } from "../../utils/decimal.js";

export const NumericLike = z.union([z.number(), z.string()]);
export const DecimalLike = z.union([
  z.number(),
  z.string(),
  z.custom((v) => v == null || (typeof v?.gte === "function")),
]);
export const GridCoordinate = z.number().int().min(0);

export const DecimalSchema = NumericLike.transform((v) => (v != null && v !== "" ? toDecimal(v) : toDecimal(0)));

export const SaveDecimalSchema = z
  .union([DecimalLike, z.undefined()])
  .transform((v) => (v != null && v !== "" ? toDecimal(v) : toDecimal(0)));

export const ObjectiveIndexSchema = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null) return 0;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? 0 : Math.floor(n);
  });

export const NumericToNumber = DecimalLike.transform((v) => (v != null && v !== "" ? toDecimal(v).toNumber() : undefined));
