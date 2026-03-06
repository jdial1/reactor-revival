import Decimal from 'break_infinity.js';
if (typeof global !== 'undefined') global.Decimal = Decimal;
if (typeof globalThis !== 'undefined') globalThis.Decimal = Decimal;
if (typeof global?.window !== 'undefined') global.window.Decimal = Decimal;
if (typeof window !== 'undefined') window.Decimal = Decimal;
