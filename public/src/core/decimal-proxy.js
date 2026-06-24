import { getDecimal } from "../simUtils.js";
import superjson from "../../lib/superjson.js";

const Decimal = getDecimal();
superjson.registerCustom(
  { isApplicable: (v) => v instanceof Decimal, serialize: (v) => v.toString(), deserialize: (v) => new Decimal(v) },
  "Decimal"
);

export const superjsonStringify = (obj) => superjson.stringify(obj);
export const superjsonParse = (str) => superjson.parse(str);

const DecimalProxy = new Proxy(function () {}, {
  construct(_, args) { return new (getDecimal())(...args); },
  get(_, prop) { return getDecimal()[prop]; },
  apply(_, t, args) { return getDecimal()(...args); }
});

export default DecimalProxy;
