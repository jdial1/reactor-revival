import { describe, it, expect } from "../helpers/setup.js";
import { numFormat, timeFormat } from "../../public/src/utils/util.js";

describe("Utility Functions", () => {
    describe("numFormat", () => {
        it("should format small numbers correctly", () => {
            expect(numFormat(0)).toBe("0");
            expect(numFormat(100)).toBe("100");
            expect(numFormat(999)).toBe("999");
        });

        it("should format large numbers with suffixes", () => {
            // Default behavior: 2 decimal places for numbers >= 1000, 0 for smaller numbers
            expect(numFormat(1000)).toBe("1.00K");
            expect(numFormat(1500)).toBe("1.50K");
            expect(numFormat(1000000)).toBe("1.00M");
            expect(numFormat(1000000000)).toBe("1.00B");
            expect(numFormat(1000000000000)).toBe("1.00T");
            
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
            expect(numFormat(-1000)).toBe("-1.00K"); // Default places is 2 for numbers >= 1000
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
    });

    describe("timeFormat", () => {
        it("should format seconds", () => {
            expect(timeFormat(500)).toBe("01s");
            expect(timeFormat(1000)).toBe("01s");
            expect(timeFormat(10000)).toBe("10s");
        });

        it("should format minutes", () => {
            // Code uses padStart(2, '0') for minutes, so '1' becomes '01'
            expect(timeFormat(60000)).toBe("01m 00s");
            expect(timeFormat(65000)).toBe("01m 05s");
        });

        it("should format hours", () => {
            // Code uses padStart(2, '0') for hours as well?
            // const h = String(Math.floor(ts / (1000 * 60 * 60)) % 24).padStart(2, '0');
            expect(timeFormat(3600000)).toBe("01h 00m 00s");
        });

        it("should format days", () => {
            expect(timeFormat(86400000)).toBe("1d 00h 00m 00s");
        });

        it("should handle negative time", () => {
            expect(timeFormat(-1000)).toBe("00s");
        });
    });
});

