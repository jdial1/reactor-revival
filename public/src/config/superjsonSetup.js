import superjson from "superjson";
import { getDecimal } from "../utils/decimal.js";


const Decimal = getDecimal();
superjson.registerCustom(
  {
    isApplicable: (v) => v instanceof Decimal,
    serialize: (v) => v.toString(),
    deserialize: (v) => new Decimal(v),
  },
  "Decimal"
);

export const serializeSave = (obj) => superjson.stringify(obj);
export const parseSave = (str) => superjson.parse(str);
