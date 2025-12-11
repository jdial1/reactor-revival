import { describe, it, expect, beforeEach, afterEach, vi, setupGameWithDOM } from "../helpers/setup.js";

import { leaderboardService } from "../../public/src/services/leaderboardService.js";

describe("Leaderboard Service & Integration", () => {
    let game;
    let document;
    let window;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
        document = setup.document;
        window = setup.window;
        
        leaderboardService.initialized = false;
        leaderboardService.initPromise = null;
        leaderboardService.apiBaseUrl = 'http://localhost:3000';

        global.fetch = vi.fn();

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
        if (document && document.body) {
            document.body.innerHTML = '';
        }
    });

    describe("Initialization", () => {
        it("should initialize and check API health", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ status: 'ok', database: 'connected' })
            });

            await leaderboardService.init();

            expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/health');
            expect(leaderboardService.initialized).toBe(true);
        });

        it("should not re-initialize if already initialized", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ status: 'ok', database: 'connected' })
            });

            await leaderboardService.init();
            global.fetch.mockClear();

            await leaderboardService.init();
            
            expect(global.fetch).not.toHaveBeenCalled();
        });
    });

    describe("Data Operations", () => {
        beforeEach(async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ status: 'ok', database: 'connected' })
            });
            await leaderboardService.init();
            global.fetch.mockClear();
        });

        it("should send correct data when saving a run", async () => {
            const stats = {
                user_id: "user_123",
                run_id: "run_abc",
                heat: 5000,
                power: 1000,
                money: 50000,
                time: 3600000
            };

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, data: { id: 1, ...stats } })
            });

            await leaderboardService.saveRun(stats);

            expect(global.fetch).toHaveBeenCalledWith(
                'http://localhost:3000/api/leaderboard/save',
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: stats.user_id,
                        run_id: stats.run_id,
                        heat: stats.heat,
                        power: stats.power,
                        money: stats.money,
                        time: stats.time,
                        layout: null
                    })
                })
            );
        });

        it("should send correct data when saving a run with layout", async () => {
            const stats = {
                user_id: "user_123",
                run_id: "run_abc",
                heat: 5000,
                power: 1000,
                money: 50000,
                time: 3600000,
                layout: '{"size":{"rows":12,"cols":12},"parts":[]}'
            };

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, data: { id: 1, ...stats } })
            });

            await leaderboardService.saveRun(stats);

            const callArgs = global.fetch.mock.calls[0];
            const body = JSON.parse(callArgs[1].body);
            expect(body.layout).toBe(stats.layout);
        });

        it("should query top runs with correct sorting", async () => {
            const mockData = [
                { user_id: 'u1', power: 100 },
                { user_id: 'u2', power: 90 }
            ];

            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, data: mockData })
            });

            const results = await leaderboardService.getTopRuns('power', 5);

            expect(global.fetch).toHaveBeenCalledWith(
                'http://localhost:3000/api/leaderboard/top?sortBy=power&limit=5'
            );
            expect(results.length).toBe(2);
            expect(results[0].user_id).toBe('u1');
        });

        it("should default to 'power' sort if invalid sort key provided", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, data: [] })
            });

            await leaderboardService.getTopRuns('hacking_attempt', 10);

            expect(global.fetch).toHaveBeenCalledWith(
                'http://localhost:3000/api/leaderboard/top?sortBy=power&limit=10'
            );
        });
    });

    describe("Game Integration", () => {
        it("should trigger saveRun when saving the game", async () => {
            const saveSpy = vi.spyOn(leaderboardService, 'saveRun').mockResolvedValue();
            
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
                time: 60000,
                layout: expect.any(String)
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
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ status: 'ok', database: 'connected' })
            });
            await leaderboardService.init();
        });

        it("should render rows based on data from service", async () => {
            const mockData = [
                { timestamp: Date.now(), power: 5000, heat: 200, money: 100000, time_played: 3600000 },
                { timestamp: Date.now() - 10000, power: 2000, heat: 100, money: 50000, time_played: 1800000 }
            ];
            
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, data: mockData })
            });

            vi.spyOn(leaderboardService, 'getTopRuns').mockResolvedValue(mockData);

            game.ui.setupLeaderboardPage();
            
            await new Promise(r => setTimeout(r, 100));

            const rows = document.querySelectorAll('#leaderboard_rows tr');
            expect(rows.length).toBe(2);
            
            const firstRowCells = rows[0].querySelectorAll('td');
            expect(firstRowCells[0].textContent).toBe("1");
            expect(firstRowCells[2].textContent.trim()).toContain("5K");
            expect(firstRowCells[4].textContent.trim()).toContain("$100K");
        });

        it("should handle empty results gracefully", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, data: [] })
            });

            vi.spyOn(leaderboardService, 'getTopRuns').mockResolvedValue([]);

            game.ui.setupLeaderboardPage();
            await new Promise(r => setTimeout(r, 100));

            const rows = document.querySelectorAll('#leaderboard_rows tr');
            expect(rows.length).toBe(1);
            expect(rows[0].textContent).toContain("No records found");
        });

        it("should update list when sorting buttons are clicked", async () => {
            global.fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true, data: [] })
            });

            vi.spyOn(leaderboardService, 'getTopRuns').mockResolvedValue([]);

            game.ui.setupLeaderboardPage();
            
            const heatBtn = document.querySelector('[data-sort="heat"]');
            
            expect(heatBtn).toBeTruthy();
            
            heatBtn.click();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            expect(leaderboardService.getTopRuns).toHaveBeenCalledWith('heat', 20);
            expect(heatBtn.classList.contains('active')).toBe(true);
        });
    });
});
