import { describe, it, expect, beforeEach, afterEach, setupGame, cleanupGame } from "../helpers/setup.js";
import objective_list_data from "../../public/data/objective_list.json";
import { getObjectiveCheck } from "../../public/src/core/objectiveActions.js";
import { satisfyObjective } from "../helpers/objectiveHelpers.js";

let previousStats = null;
let statsHistory = [];
let enableDebugLogging = false;

function logHeapStats(label = 'Heap Stats') {
    try {
        if (typeof process !== 'undefined' && process.memoryUsage) {
            const usage = process.memoryUsage();
            const formatMB = (bytes) => (bytes / 1024 / 1024).toFixed(2);
            
            const stats = {
                rss: usage.rss,
                heapTotal: usage.heapTotal,
                heapUsed: usage.heapUsed,
                external: usage.external,
                arrayBuffers: usage.arrayBuffers || 0,
            };
            
            const heapUsedPercent = ((stats.heapUsed / stats.heapTotal) * 100).toFixed(1);
            const rssPercent = stats.heapTotal > 0 ? ((stats.heapTotal / stats.rss) * 100).toFixed(1) : '0';
            const freeHeap = stats.heapTotal - stats.heapUsed;
            
            // Calculate changes from previous measurement
            let changeStr = '';
            if (previousStats) {
                const rssDelta = stats.rss - previousStats.rss;
                const heapTotalDelta = stats.heapTotal - previousStats.heapTotal;
                const heapUsedDelta = stats.heapUsed - previousStats.heapUsed;
                const externalDelta = stats.external - previousStats.external;
                const arrayBuffersDelta = stats.arrayBuffers - previousStats.arrayBuffers;
                
                const rssDeltaMB = formatMB(rssDelta);
                const heapTotalDeltaMB = formatMB(heapTotalDelta);
                const heapUsedDeltaMB = formatMB(heapUsedDelta);
                const externalDeltaMB = formatMB(externalDelta);
                const arrayBuffersDeltaMB = formatMB(arrayBuffersDelta);
                
                const heapShrunk = heapTotalDelta < -10 * 1024 * 1024; // More than 10MB shrink
                const largeRSSDrop = rssDelta < -50 * 1024 * 1024; // More than 50MB RSS drop (major GC)
                
                changeStr = `\n  CHANGES since last measurement:\n` +
                    `    RSS: ${rssDelta >= 0 ? '+' : ''}${rssDeltaMB} MB ${largeRSSDrop ? '⚠️ MAJOR GC EVENT' : ''}\n` +
                    `    Heap Total: ${heapTotalDelta >= 0 ? '+' : ''}${heapTotalDeltaMB} MB ${heapShrunk ? '⚠️⚠️ HEAP SHRUNK!' : ''}\n` +
                    `    Heap Used: ${heapUsedDelta >= 0 ? '+' : ''}${heapUsedDeltaMB} MB\n` +
                    `    External: ${externalDelta >= 0 ? '+' : ''}${externalDeltaMB} MB\n` +
                    `    ArrayBuffers: ${arrayBuffersDelta >= 0 ? '+' : ''}${arrayBuffersDeltaMB} MB\n`;
                
                // Critical warnings
                if (heapShrunk) {
                    changeStr += `    ⚠️⚠️⚠️ CRITICAL: Heap shrunk by ${Math.abs(parseFloat(heapTotalDeltaMB))} MB - OOM risk HIGH!\n`;
                    changeStr += `    ⚠️⚠️⚠️ Heap size reduced from ${formatMB(previousStats.heapTotal)} MB to ${formatMB(stats.heapTotal)} MB\n`;
                }
                if (largeRSSDrop && heapShrunk) {
                    changeStr += `    ⚠️⚠️⚠️ AGGRESSIVE GC: RSS dropped ${Math.abs(parseFloat(rssDeltaMB))} MB and heap shrunk - memory pressure detected!\n`;
                }
            }
            
            // Warning for high heap usage
            let warningStr = '';
            if (parseFloat(heapUsedPercent) > 85) {
                warningStr = `\n  ⚠️⚠️⚠️ CRITICAL: Heap usage at ${heapUsedPercent}% - Only ${formatMB(freeHeap)} MB free!\n`;
            } else if (parseFloat(heapUsedPercent) > 75) {
                warningStr = `\n  ⚠️ WARNING: Heap usage at ${heapUsedPercent}% - Monitor closely\n`;
            }
            
            previousStats = stats;
            
            // Track history for summary (always collect, even if not logging)
            statsHistory.push({
                label,
                timestamp: Date.now(),
                rss: stats.rss,
                heapTotal: stats.heapTotal,
                heapUsed: stats.heapUsed,
                heapUsedPercent: parseFloat(heapUsedPercent),
                freeHeap: freeHeap
            });
            
            // Only output if debug logging is enabled
            if (enableDebugLogging) {
                const statsStr = `\n[${label}]\n` +
                    `  RSS: ${formatMB(stats.rss)} MB (total allocated)\n` +
                    `  Heap: ${formatMB(stats.heapUsed)} / ${formatMB(stats.heapTotal)} MB (${heapUsedPercent}% used)\n` +
                    `  External: ${formatMB(stats.external)} MB\n` +
                    `  ArrayBuffers: ${formatMB(stats.arrayBuffers)} MB\n` +
                    `  Heap/RSS Ratio: ${rssPercent}%\n` +
                    `  Estimated Free Heap: ${formatMB(freeHeap)} MB\n` +
                    changeStr +
                    warningStr;
                
                process.stderr.write(statsStr);
                console.error(statsStr.trim());
                if (process.stdout && typeof process.stdout.write === 'function') {
                    process.stdout.write('');
                }
            }
            
            return stats;
        }
    } catch (error) {
        if (enableDebugLogging) {
            try {
                const errorStr = `[${label}] ERROR getting heap stats: ${error.message}\n`;
                process.stderr.write(errorStr);
                console.error(errorStr.trim());
            } catch (e) {
                // If even error logging fails, we're in deep trouble
            }
        }
    }
    return null;
}

function printMemorySummary() {
    if (!enableDebugLogging) {
        return;
    }
    if (statsHistory.length === 0) {
        return;
    }
    
    // Force output immediately
    process.stderr.write('\n' + '='.repeat(80) + '\n');
    process.stderr.write('MEMORY USAGE SUMMARY\n');
    process.stderr.write('='.repeat(80) + '\n');
    
    const formatMB = (bytes) => (bytes / 1024 / 1024).toFixed(2);
    
    // Find critical events
    const criticalEvents = [];
    for (let i = 1; i < statsHistory.length; i++) {
        const prev = statsHistory[i - 1];
        const curr = statsHistory[i];
        
        const heapDelta = curr.heapTotal - prev.heapTotal;
        const rssDelta = curr.rss - prev.rss;
        const heapUsedPercentDelta = curr.heapUsedPercent - prev.heapUsedPercent;
        
        if (heapDelta < -10 * 1024 * 1024) {
            criticalEvents.push({
                label: curr.label,
                type: 'HEAP_SHRINK',
                heapShrinkMB: formatMB(Math.abs(heapDelta)),
                fromMB: formatMB(prev.heapTotal),
                toMB: formatMB(curr.heapTotal),
                heapUsedPercent: curr.heapUsedPercent.toFixed(1),
                freeHeapMB: formatMB(curr.freeHeap)
            });
        }
        
        if (rssDelta < -50 * 1024 * 1024) {
            criticalEvents.push({
                label: curr.label,
                type: 'MAJOR_GC',
                rssDropMB: formatMB(Math.abs(rssDelta))
            });
        }
        
        if (curr.heapUsedPercent > 85) {
            criticalEvents.push({
                label: curr.label,
                type: 'HIGH_USAGE',
                heapUsedPercent: curr.heapUsedPercent.toFixed(1),
                freeHeapMB: formatMB(curr.freeHeap)
            });
        }
    }
    
    // Print key milestones
    process.stderr.write('\nKEY MILESTONES:\n');
    const milestones = [
        statsHistory[0], // First
        statsHistory.find(s => s.label.includes('Objective 0')),
        statsHistory.find(s => s.label.includes('Objective 5')),
        statsHistory.find(s => s.label.includes('Objective 10')),
        statsHistory.find(s => s.label.includes('Objective 15')),
        statsHistory.find(s => s.label.includes('Objective 20')),
        statsHistory.find(s => s.label.includes('Objective 21')),
        statsHistory.find(s => s.label.includes('Objective 22')),
        statsHistory.find(s => s.label.includes('Objective 23')),
        statsHistory.find(s => s.label.includes('Objective 24')),
        statsHistory.find(s => s.label.includes('Objective 25')),
        statsHistory[statsHistory.length - 1] // Last
    ].filter(Boolean);
    
    milestones.forEach(stat => {
        const msg = `  [${stat.label}]\n` +
            `    Heap: ${formatMB(stat.heapUsed)}/${formatMB(stat.heapTotal)} MB (${stat.heapUsedPercent.toFixed(1)}% used, ${formatMB(stat.freeHeap)} MB free)\n` +
            `    RSS: ${formatMB(stat.rss)} MB\n`;
        process.stderr.write(msg);
    });
    
    // Print critical events
    if (criticalEvents.length > 0) {
        process.stderr.write('\n⚠️ CRITICAL EVENTS:\n');
        criticalEvents.forEach(event => {
            if (event.type === 'HEAP_SHRINK') {
                const msg = `  ⚠️⚠️⚠️ [${event.label}] HEAP SHRUNK by ${event.heapShrinkMB} MB\n` +
                    `     From ${event.fromMB} MB → ${event.toMB} MB (${event.heapUsedPercent}% used, ${event.freeHeapMB} MB free)\n`;
                process.stderr.write(msg);
            } else if (event.type === 'MAJOR_GC') {
                const msg = `  ⚠️ [${event.label}] MAJOR GC EVENT: RSS dropped ${event.rssDropMB} MB\n`;
                process.stderr.write(msg);
            } else if (event.type === 'HIGH_USAGE') {
                const msg = `  ⚠️⚠️ [${event.label}] HIGH HEAP USAGE: ${event.heapUsedPercent}% (${event.freeHeapMB} MB free)\n`;
                process.stderr.write(msg);
            }
        });
    }
    
    // Calculate total memory growth
    const first = statsHistory[0];
    const last = statsHistory[statsHistory.length - 1];
    if (first && last) {
        const rssGrowth = last.rss - first.rss;
        const heapGrowth = last.heapTotal - first.heapTotal;
        const heapUsedGrowth = last.heapUsed - first.heapUsed;
        
        process.stderr.write('\nTOTAL GROWTH:\n');
        process.stderr.write(`  RSS: ${formatMB(rssGrowth >= 0 ? '+' : '')}${formatMB(rssGrowth)} MB\n`);
        process.stderr.write(`  Heap Total: ${formatMB(heapGrowth >= 0 ? '+' : '')}${formatMB(heapGrowth)} MB\n`);
        process.stderr.write(`  Heap Used: ${formatMB(heapUsedGrowth >= 0 ? '+' : '')}${formatMB(heapUsedGrowth)} MB\n`);
        process.stderr.write(`  Final Heap Usage: ${last.heapUsedPercent.toFixed(1)}% (${formatMB(last.freeHeap)} MB free)\n`);
    }
    
    process.stderr.write('='.repeat(80) + '\n');
    process.stderr.write('\n'); // Extra newline for visibility
}

// Set up process-level error handlers to log heap stats before crashes
if (typeof process !== 'undefined') {
    const originalUncaughtException = process.listeners('uncaughtException');
    process.removeAllListeners('uncaughtException');
    
    process.on('uncaughtException', (error) => {
        enableDebugLogging = true;
        logHeapStats('UNCAUGHT EXCEPTION - Final Heap State');
        printMemorySummary();
        originalUncaughtException.forEach(listener => listener(error));
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        enableDebugLogging = true;
        logHeapStats('UNHANDLED REJECTION - Heap State');
        printMemorySummary();
    });
}


describe('Full Objective Run', () => {
    let game;

    // Add a simple test first to ensure we can log before the big test
    it('should initialize and log heap stats', () => {
        expect(true).toBe(true);
    });

    // Diagnostic test to see if setupGame causes memory issues
    it('should handle setupGame without crashing', async () => {
        const testGame = await setupGame();
        expect(testGame).toBeDefined();
        expect(testGame.objectives_manager).toBeDefined();
    });

    beforeEach(async () => {
        enableDebugLogging = false;
        statsHistory = [];
        previousStats = null;

        try {
            game = await setupGame();
            if (game.engine) {
                game.engine.stop();
            }
            game.bypass_tech_tree_restrictions = true; // Ensure all upgrades are available
            game.objectives_manager.disableTimers = true;
        } catch (error) {
            enableDebugLogging = true;
            logHeapStats('ERROR during setupGame');
            throw error;
        }
    });

    afterEach((context) => {
        const testFailed = context.task?.state === 'fail' || context.task?.result?.state === 'fail' || context.task?.result?.error;
        if (testFailed) {
            enableDebugLogging = true;
            logHeapStats('After test cleanup (FAILED)');
            if (statsHistory.length > 0) {
                printMemorySummary();
            }
        }
        enableDebugLogging = false;
        statsHistory = [];
        previousStats = null;
    });

    it('should complete all objectives in a single continuous run', async () => {
        const totalObjectives = objective_list_data.length;
        game.objectives_manager.current_objective_index = 0;
        
        try {
            await game.set_defaults();
        } catch (error) {
            enableDebugLogging = true;
            logHeapStats('ERROR during set_defaults');
            throw error;
        }

        try {
            if (!game.objectives_manager.objectives_data) {
                await game.objectives_manager.initialize();
            }

            if (!game.objectives_manager.current_objective_def) {
                game.objectives_manager.start();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            enableDebugLogging = true;
            logHeapStats('ERROR during objectives manager initialization');
            throw error;
        }

        let saveCallCount = 0;
        const originalSaveGame = game.saveGame;
        game.saveGame = () => {
            saveCallCount++;
            originalSaveGame.call(game);
        };

        try {
            game.objectives_manager.start();
        } catch (error) {
            enableDebugLogging = true;
            logHeapStats('ERROR during objectives_manager.start (final)');
            throw error;
        }

        expect(game.objectives_manager.current_objective_def).not.toBeNull();

        for (let i = 0; i < totalObjectives - 1; i++) {
            const objective = objective_list_data[i];

            expect(game.objectives_manager.current_objective_index).toBe(i);

            try {
                await satisfyObjective(game, i, objective_list_data);
            } catch (error) {
                enableDebugLogging = true;
                logHeapStats(`ERROR during satisfyObjective ${i}`);
                printMemorySummary();
                throw error;
            }

            // Ensure game is not paused for objective checking
            game.paused = false;
            game.ui.stateManager.setVar("pause", false);
            
            // Ensure objective is loaded
            if (!game.objectives_manager.current_objective_def) {
                game.objectives_manager.set_objective(i, true);
            }
            
            game.objectives_manager.check_current_objective();

            if (game.objectives_manager.current_objective_def && !game.objectives_manager.current_objective_def.completed) {
                game.reactor.updateStats();
                game.objectives_manager.check_current_objective();
            }

            if (objective.checkId !== "allObjectives") {
                // Verify current objective is loaded and completed before claiming
                expect(game.objectives_manager.current_objective_def, `Objective ${i} (${objective.checkId}) should have a definition.`).toBeDefined();
                expect(game.objectives_manager.current_objective_def?.completed, `Objective ${i} (${objective.checkId}) should be completed.`).toBe(true);
            }

            game.objectives_manager.claimObjective();
            await new Promise(resolve => setTimeout(resolve, 600));
            
            // Ensure next objective is loaded (claimObjective already calls set_objective, but verify it's set)
            if (i < totalObjectives - 2) {
                const nextIndex = i + 1;
                // claimObjective increments the index and calls set_objective, so verify it worked
                expect(game.objectives_manager.current_objective_index).toBe(nextIndex);
                
                // If the objective def isn't set, set it explicitly
                if (!game.objectives_manager.current_objective_def) {
                    game.objectives_manager.set_objective(nextIndex, true);
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                // Verify the objective is loaded
                expect(game.objectives_manager.current_objective_def).not.toBeNull();
                expect(game.objectives_manager.current_objective_def).not.toBeUndefined();
            }

            if (i < totalObjectives - 2) {
                expect(game.objectives_manager.current_objective_index).toBe(i + 1);
            } else {
                expect(game.objectives_manager.current_objective_index).toBe(totalObjectives - 1);
            }

            try {
                game.tileset.clearAllTiles();
            } catch (error) {
                enableDebugLogging = true;
                logHeapStats(`ERROR during clearAllTiles ${i}`);
                printMemorySummary();
                throw error;
            }
        }

        expect(game.objectives_manager.current_objective_index).toBe(totalObjectives - 1);
        const infIds = ["infinitePower", "infiniteHeatMaintain", "infiniteMoneyThorium", "infiniteHeat", "infiniteEP"];
        const cid = game.objectives_manager.current_objective_def?.checkId;
        expect(cid === "allObjectives" || infIds.includes(cid)).toBe(true);
        expect(saveCallCount).toBeGreaterThan(0);

        game.saveGame = originalSaveGame;
    }, 120000);
}); 