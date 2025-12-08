import { describe, it, expect, beforeEach, afterEach, vi, setupGameWithDOM } from "../helpers/setup.js";

import { leaderboardService } from "../../public/src/services/leaderboardService.js";

describe("Leaderboard Service & Integration", () => {
    let game;
    let document;
    let window;
    let mockDb;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
        document = setup.document;
        window = setup.window;
        
        mockDb = {
            exec: vi.fn()
        };

        leaderboardService.db = null;
        leaderboardService.initialized = false;
        
        window.sqlite3InitModule = vi.fn().mockResolvedValue({
            oo1: {
                DB: vi.fn(() => mockDb),
                OpfsDb: vi.fn(() => mockDb)
            }
        });

        const leaderboardHtml = `
            <table class="leaderboard-table">
                <tbody id="leaderboard_rows"></tbody>
            </table>
            <button class="leaderboard-sort" data-sort="power">Power</button>
            <button class="leaderboard-sort" data-sort="heat">Heat</button>
            <button class="leaderboard-sort" data-sort="money">Money</button>
        `;
        document.body.innerHTML += leaderboardHtml;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    describe("Initialization", () => {
        it("should initialize sqlite3 and create tables", async () => {
            await leaderboardService.init();

            expect(window.sqlite3InitModule).toHaveBeenCalled();
            expect(leaderboardService.initialized).toBe(true);
            expect(leaderboardService.db).toBe(mockDb);
            
            expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining("CREATE TABLE IF NOT EXISTS runs"));
        });

        it("should not re-initialize if already initialized", async () => {
            await leaderboardService.init();
            mockDb.exec.mockClear();
            window.sqlite3InitModule.mockClear();

            await leaderboardService.init();
            
            expect(window.sqlite3InitModule).not.toHaveBeenCalled();
            expect(mockDb.exec).not.toHaveBeenCalled();
        });
    });

    describe("Data Operations", () => {
        beforeEach(async () => {
            await leaderboardService.init();
            mockDb.exec.mockClear();
        });

        it("should construct correct SQL for saving a run", () => {
            const stats = {
                user_id: "user_123",
                run_id: "run_abc",
                heat: 5000,
                power: 1000,
                money: 50000,
                time: 3600000
            };

            leaderboardService.saveRun(stats);

            expect(mockDb.exec).toHaveBeenCalledTimes(1);
            const callArg = mockDb.exec.mock.calls[0][0];
            
            expect(callArg.sql).toContain("INSERT INTO runs");
            expect(callArg.sql).toContain("ON CONFLICT(user_id) DO UPDATE SET");
            
            expect(callArg.sql).toContain("heat = CASE WHEN $heat > heat THEN $heat ELSE heat END");
            expect(callArg.sql).toContain("power = CASE WHEN $power > power THEN $power ELSE power END");

            expect(callArg.bind).toEqual({
                $user_id: stats.user_id,
                $run_id: stats.run_id,
                $timestamp: expect.any(Number),
                $heat: stats.heat,
                $power: stats.power,
                $money: stats.money,
                $time_played: stats.time
            });
        });

        it("should query top runs with correct sorting", () => {
            mockDb.exec.mockImplementation((opts) => {
                if (opts.sql.includes("SELECT")) {
                    opts.callback({ user_id: 'u1', power: 100 });
                    opts.callback({ user_id: 'u2', power: 90 });
                }
            });

            const results = leaderboardService.getTopRuns('power', 5);

            expect(mockDb.exec).toHaveBeenCalled();
            const callArg = mockDb.exec.mock.calls[0][0];
            
            expect(callArg.sql).toContain("ORDER BY power DESC");
            expect(callArg.bind).toEqual([5]);
            expect(results.length).toBe(2);
            expect(results[0].user_id).toBe('u1');
        });

        it("should default to 'power' sort if invalid sort key provided", () => {
            leaderboardService.getTopRuns('hacking_attempt', 10);
            const callArg = mockDb.exec.mock.calls[0][0];
            expect(callArg.sql).toContain("ORDER BY power DESC");
        });
    });

    describe("Game Integration", () => {
        it("should trigger saveRun when saving the game", async () => {
            const saveSpy = vi.spyOn(leaderboardService, 'saveRun');
            
            game.peak_heat = 1000;
            game.peak_power = 500;
            game.current_money = 5000;
            game.total_played_time = 60000;
            game.user_id = "test_user";
            game.run_id = "test_run";

            game.saveGame();

            expect(saveSpy).toHaveBeenCalledWith({
                user_id: "test_user",
                run_id: "test_run",
                heat: 1000,
                power: 500,
                money: 5000,
                time: expect.any(Number)
            });
        });

        it("should NOT trigger saveRun if peak stats are zero", () => {
            const saveSpy = vi.spyOn(leaderboardService, 'saveRun');
            
            game.peak_heat = 0;
            game.peak_power = 0;
            
            game.saveGame();

            expect(saveSpy).not.toHaveBeenCalled();
        });
    });

    describe("UI Rendering", () => {
        beforeEach(async () => {
            await leaderboardService.init();
        });

        it("should render rows based on data from service", async () => {
            const mockData = [
                { timestamp: Date.now(), power: 5000, heat: 200, money: 100000, time_played: 3600000 },
                { timestamp: Date.now() - 10000, power: 2000, heat: 100, money: 50000, time_played: 1800000 }
            ];
            
            vi.spyOn(leaderboardService, 'getTopRuns').mockReturnValue(mockData);

            game.ui.setupLeaderboardPage();
            
            // eslint-disable-next-line no-undef
            await new Promise(r => setTimeout(r, 0));

            const rows = document.querySelectorAll('#leaderboard_rows tr');
            expect(rows.length).toBe(2);
            
            const firstRowCells = rows[0].querySelectorAll('td');
            expect(firstRowCells[0].textContent).toBe("1");
            expect(firstRowCells[2].textContent.trim()).toContain("5K");
            expect(firstRowCells[4].textContent.trim()).toContain("$100K");
        });

        it("should handle empty results gracefully", async () => {
            vi.spyOn(leaderboardService, 'getTopRuns').mockReturnValue([]);

            game.ui.setupLeaderboardPage();
            // eslint-disable-next-line no-undef
            await new Promise(r => setTimeout(r, 0));

            const rows = document.querySelectorAll('#leaderboard_rows tr');
            expect(rows.length).toBe(1);
            expect(rows[0].textContent).toContain("No records found");
        });

        it("should update list when sorting buttons are clicked", async () => {
            game.ui.setupLeaderboardPage();
            
            const heatBtn = document.querySelector('[data-sort="heat"]');
            leaderboardService.getTopRuns = vi.fn().mockReturnValue([]);
            
            expect(heatBtn).toBeTruthy();
            
            heatBtn.click();
            await new Promise(resolve => setTimeout(resolve, 0));
            
            expect(leaderboardService.getTopRuns).toHaveBeenCalledWith('heat', 20);
            expect(heatBtn.classList.contains('active')).toBe(true);
        });
    });
});

