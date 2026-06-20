globalThis.litIssuedWarnings = globalThis.litIssuedWarnings ?? new Set();
globalThis.litIssuedWarnings.add("Lit is in dev mode. Not recommended for production! See https://lit.dev/msg/dev-mode for more information.");
globalThis.litIssuedWarnings.add("dev-mode");

import Decimal from 'break_infinity.js';
if (typeof global !== 'undefined') global.Decimal = Decimal;
if (typeof globalThis !== 'undefined') globalThis.Decimal = Decimal;
if (typeof global?.window !== 'undefined') global.window.Decimal = Decimal;
if (typeof window !== 'undefined') window.Decimal = Decimal;
