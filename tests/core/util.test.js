import { describe, it, expect } from "../helpers/setup.js";
import { Formatter, numFormat, timeFormat, setFormatPreferencesGetter, getDecimal } from "../../public/src/utils.js";

const Decimal = getDecimal();

describe("Utility Functions", () => {
    describe("numFormat", () => {
        it("should format small numbers correctly", () => {
            expect(numFormat(0)).toBe("0");
            expect(numFormat(100)).toBe("100");
            expect(numFormat(999)).toBe("999");
        });

        it("should format large numbers with suffixes", () => {
            // Default behavior: 2 decimal places for numbers >= 1000, 0 for smaller numbers
            expect(numFormat(1000)).toBe("1K");
            expect(numFormat(1500)).toBe("1.5K");
            expect(numFormat(1000000)).toBe("1M");
            expect(numFormat(1000000000)).toBe("1B");
            expect(numFormat(1000000000000)).toBe("1T");
            
            // Test with explicit places
            expect(numFormat(1000, 0)).toBe("1K");
            expect(numFormat(1500, 0)).toBe("2K"); // 1.5 rounded to 2 with 0 decimals
        });

        it("should handle custom decimal places", () => {
            expect(numFormat(1500, 1)).toBe("1.5K");
            expect(numFormat(1200, 0)).toBe("1K"); 
        });

        it("should handle negative numbers", () => {
            expect(numFormat(-100)).toBe("-100");
            expect(numFormat(-1000)).toBe("-1K"); // Default places is 2 for numbers >= 1000, stripped to 0
            expect(numFormat(-1000, 0)).toBe("-1K");
        });

        it("should handle Infinity and NaN", () => {
            expect(numFormat(Infinity)).toBe("Infinity");
            expect(numFormat(-Infinity)).toBe("-Infinity");
            expect(numFormat(NaN)).toBe("");
            expect(numFormat(null)).toBe("");
            expect(numFormat(undefined)).toBe("");
        });

        it("should handle scientific notation for very large numbers", () => {
             expect(numFormat(1e36)).toMatch(/1.*e\+?36/);
        });

        it("formats Decimal instances without object coercion", () => {
            const d = new Decimal("1e150");
            const s = Formatter.number(d, { places: 2 });
            expect(s).not.toMatch(/Object/);
            expect(s).not.toBe("");
            expect(s).not.toContain("NaN");
            expect(s).toMatch(/e\+?150/);
        });

        it("formats Decimal compact suffixes for mid-range magnitudes", () => {
            const d = new Decimal("2.5e24");
            const s = Formatter.number(d, { places: 2 });
            expect(s).toContain("Sp");
        });

        it("respects explicit scientific style for Decimal", () => {
            const d = new Decimal("5000000");
            expect(Formatter.number(d, { style: "scientific", places: 2 })).toBe("5.00e+6");
        });

        it("uses preference getter for number format when style omitted", () => {
            setFormatPreferencesGetter(() => ({ numberFormat: "scientific" }));
            try {
                const d = new Decimal("4000");
                expect(Formatter.number(d)).toMatch(/e\+/);
            } finally {
                setFormatPreferencesGetter(null);
            }
        });
    });

    describe("timeFormat", () => {
        it("should format seconds", () => {
            expect(timeFormat(0)).toBe("0s");
            expect(timeFormat(1000)).toBe("1s");
            expect(timeFormat(10000)).toBe("10s");
        });

        it("should format minutes", () => {
            expect(timeFormat(60000)).toBe("1m 0s");
            expect(timeFormat(65000)).toBe("1m 5s");
        });

        it("should format hours", () => {
            expect(timeFormat(3600000)).toBe("1h 0m 0s");
        });

        it("should format days", () => {
            expect(timeFormat(86400000)).toBe("1d 0h 0m 0s");
        });

        it("should handle negative time", () => {
            expect(timeFormat(-1000)).toBe("0s");
        });
    });
});

