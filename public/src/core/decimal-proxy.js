import { getDecimal } from "../simUtils.js";
import { superjsonStringify, superjsonParse } from "./save-wire.js";

export { superjsonStringify, superjsonParse };

const DecimalProxy = new Proxy(function () {}, {
  construct(_, args) { return new (getDecimal())(...args); },
  get(_, prop) { return getDecimal()[prop]; },
  apply(_, t, args) { return getDecimal()(...args); }
});

export default DecimalProxy;
