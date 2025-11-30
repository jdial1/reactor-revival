import { describe, it, expect, beforeEach, afterEach, vi } from "../helpers/setup.js";
import { Logger } from "../../public/src/utils/logger.js";

describe("Logger", () => {
    let logger;
    let consoleSpy;

    beforeEach(() => {
        logger = new Logger();
        consoleSpy = {
            log: vi.spyOn(console, "log").mockImplementation(() => {}),
            info: vi.spyOn(console, "info").mockImplementation(() => {}),
            warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
            error: vi.spyOn(console, "error").mockImplementation(() => {}),
            debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should respect log levels", () => {
        logger.setLevel("WARN");
        
        logger.info("info message");
        expect(consoleSpy.info).not.toHaveBeenCalled();

        logger.warn("warn message");
        expect(consoleSpy.warn).toHaveBeenCalled();

        logger.error("error message");
        expect(consoleSpy.error).toHaveBeenCalled();
    });

    it("should format arguments correctly", () => {
        logger.setLevel("DEBUG");
        const obj = { a: 1 };
        logger.debug("test", obj);
        expect(consoleSpy.debug).toHaveBeenCalled();
    });
    
    it("should not log in production mode", () => {
        logger.productionMode = true;
        logger.setLevel("DEBUG");
        logger.error("Should not show");
        expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    it("should support grouped logging", () => {
        logger.setLevel("DEBUG");
        const groupSpy = vi.spyOn(console, "group").mockImplementation(() => {});
        const groupEndSpy = vi.spyOn(console, "groupEnd").mockImplementation(() => {});
        
        logger.group("Test Group");
        expect(groupSpy).toHaveBeenCalledWith("Test Group");
        
        logger.groupEnd();
        expect(groupEndSpy).toHaveBeenCalled();
    });
});

