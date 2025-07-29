
class HeatSegment {
    constructor(id) {
        this.id = id;
        this.components = [];
        this.outlets = [];
        this.vents = [];
        this.inlets = [];

        this.totalHeatCapacity = 0;
        this.currentHeat = 0;
    }

    recalculateStats() {
        this.totalHeatCapacity = 0;
        this.currentHeat = 0;
        for (const tile of this.components) {
            if (tile.part && tile.part.containment) {
                this.totalHeatCapacity += tile.part.containment;
            }
            this.currentHeat += tile.heat_contained || 0;
        }

        if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
            console.log(`[DEBUG] Segment ${this.id} recalculated: currentHeat=${this.currentHeat}, components=${this.components.length}`);
        }
    }

    distributeHeat() {
        if (this.components.length === 0) return;

        // First, try to distribute heat evenly while respecting containment limits
        let remainingHeat = this.currentHeat;
        let componentsToDistribute = [...this.components];
        let heatPerComponent = remainingHeat / componentsToDistribute.length;

        // Distribute heat in rounds, respecting containment limits
        while (remainingHeat > 0 && componentsToDistribute.length > 0) {
            heatPerComponent = remainingHeat / componentsToDistribute.length;

            // Filter out components that are at capacity
            const stillDistributing = [];
            for (const tile of componentsToDistribute) {
                const currentHeat = tile.heat_contained || 0;
                const maxHeat = tile.part?.containment || 0;

                if (maxHeat > 0 && currentHeat >= maxHeat) {
                    // Component is at capacity, don't add more heat
                    continue;
                }

                // Add heat up to capacity
                const heatToAdd = Math.min(heatPerComponent, maxHeat - currentHeat);
                tile.heat_contained = currentHeat + heatToAdd;
                remainingHeat -= heatToAdd;

                if (tile.heat_contained < maxHeat) {
                    stillDistributing.push(tile);
                }

                tile.updateVisualState();
            }

            componentsToDistribute = stillDistributing;
        }

        // If there's still remaining heat, distribute it among components that can take it
        // (components without containment limits, like heat exchangers)
        if (remainingHeat > 0) {
            const unlimitedComponents = this.components.filter(tile =>
                !tile.part?.containment || tile.part.containment <= 0
            );

            if (unlimitedComponents.length > 0) {
                const heatPerUnlimited = remainingHeat / unlimitedComponents.length;
                for (const tile of unlimitedComponents) {
                    tile.heat_contained = (tile.heat_contained || 0) + heatPerUnlimited;
                    tile.updateVisualState();
                }
            }
        }
    }

    get fullnessRatio() {
        if (this.totalHeatCapacity <= 0) return 0;
        return this.currentHeat / this.totalHeatCapacity;
    }
}

export class HeatManager {
    constructor(game) {
        this.game = game;
        this.segments = new Map();
        this.tileSegmentMap = new Map();
        this.nextSegmentId = 0;
    }


    processTick() {
        if (this.game.paused) {
            return;
        }
        this.updateSegments();

        // 0. Process heat distribution from cells to neighbors (this happens in engine.js)
        // The engine already distributes heat from cells to neighbors, so we don't need to do it again here

        // 1. Process heat exchangers to transfer heat between components within segments.
        this.processHeatExchangers();

        // 2. Process transfers to/from the reactor, modifying segment heat pools.
        this.processHeatTransfer();

        // 3. Check for explosions BEFORE venting to prevent venting of exploded components
        this.checkExplosions();

        // 4. Process venting, further modifying segment heat pools (skipping exploded components).
        this.processVenting();

        // 5. Update visual states for components that had their heat changed
        this.updateVisualStates();
    }


    updateSegments() {
        // Store existing heat values before clearing segments
        const existingHeat = new Map();
        for (const [tile, segment] of this.tileSegmentMap) {
            if (tile.heat_contained && tile.heat_contained > 0) {
                existingHeat.set(tile, tile.heat_contained);
            }
        }

        this.segments.clear();
        this.tileSegmentMap.clear();
        this.nextSegmentId = 0;
        const visited = new Set();

        console.log(`[DEBUG] updateSegments: processing ${this.game.tileset.active_tiles_list.length} active tiles`);

        for (const tile of this.game.tileset.active_tiles_list) {
            if (tile.activated && tile.part &&
                tile.part.category !== 'cell' &&
                (tile.part.containment > 0
                    || tile.part.category === 'heat_exchanger'
                    || tile.part.category === 'vent'
                    || tile.part.category === 'heat_outlet'
                    || tile.part.category === 'heat_inlet'
                ) &&
                !visited.has(tile)) {
                const segment = new HeatSegment(this.nextSegmentId++);
                const queue = [tile];
                visited.add(tile);

                while (queue.length > 0) {
                    const currentTile = queue.shift();
                    segment.components.push(currentTile);
                    this.tileSegmentMap.set(currentTile, segment);

                    // Restore existing heat value if it exists
                    if (existingHeat.has(currentTile)) {
                        currentTile.heat_contained = existingHeat.get(currentTile);
                    }

                    if (currentTile.part.category === 'vent') {
                        segment.vents.push(currentTile);
                    }

                    for (const neighbor of this.game.tileset.getTilesInRange(currentTile, 1)) {
                        if (neighbor && neighbor.activated && neighbor.part &&
                            neighbor.part.category !== 'cell' &&
                            (neighbor.part.containment > 0 || neighbor.part.category === 'heat_exchanger' || neighbor.part.category === 'vent' ||
                                neighbor.part.category === 'heat_outlet' || neighbor.part.category === 'heat_inlet') &&
                            !visited.has(neighbor)) {
                            visited.add(neighbor);
                            queue.push(neighbor);
                        }

                        if (neighbor && neighbor.activated && neighbor.part && neighbor.part.category === 'heat_outlet') {
                            if (!segment.outlets.includes(neighbor)) {
                                segment.outlets.push(neighbor);
                            }
                        }

                        if (neighbor && neighbor.activated && neighbor.part && neighbor.part.category === 'heat_inlet') {
                            if (!segment.inlets.includes(neighbor)) {
                                segment.inlets.push(neighbor);
                            }
                        }
                    }
                }

                segment.recalculateStats();
                this.segments.set(segment.id, segment);

                console.log(`[DEBUG] Created segment ${segment.id} with ${segment.components.length} components: ${segment.components.map(t => t.part?.id).join(', ')}`);
                console.log(`[DEBUG] Segment ${segment.id} has ${segment.outlets.length} outlets: ${segment.outlets.map(t => t.part?.id).join(', ')}`);
            }
        }

        // Also create segments for isolated components that might receive heat from cells
        for (const tile of this.game.tileset.active_tiles_list) {
            if (tile.activated && tile.part &&
                tile.part.category !== 'cell' &&
                (tile.part.containment > 0
                    || tile.part.category === 'heat_exchanger'
                    || tile.part.category === 'vent'
                    || tile.part.category === 'heat_outlet'
                    || tile.part.category === 'heat_inlet'
                ) &&
                !this.tileSegmentMap.has(tile)) {
                // Create a single-component segment for isolated components
                const segment = new HeatSegment(this.nextSegmentId++);
                segment.components.push(tile);
                this.tileSegmentMap.set(tile, segment);

                if (tile.part.category === 'vent') {
                    segment.vents.push(tile);
                }
                if (tile.part.category === 'heat_outlet') {
                    segment.outlets.push(tile);
                }
                if (tile.part.category === 'heat_inlet') {
                    segment.inlets.push(tile);
                }

                segment.recalculateStats();
                this.segments.set(segment.id, segment);

                if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                    console.log(`[DEBUG] Created isolated segment ${segment.id} with component: ${tile.part?.id}`);
                }
            }
        }
    }

    updateVisualStates() {
        for (const segment of this.segments.values()) {
            for (const tile of segment.components) {
                tile.updateVisualState();
            }
        }
    }

    processHeatExchangers() {
        // Process heat exchangers across all segments and between segments
        const allHeatExchangers = [];
        for (const segment of this.segments.values()) {
            const heatExchangers = segment.components.filter(tile =>
                tile.part && tile.part.category === 'heat_exchanger'
            );
            allHeatExchangers.push(...heatExchangers);
        }

        if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
            console.log(`[DEBUG] Processing ${allHeatExchangers.length} heat exchangers`);
        }

        for (const exchanger of allHeatExchangers) {
            const transferRate = exchanger.getEffectiveTransferValue();
            if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                console.log(`[DEBUG] Heat exchanger at (${exchanger.row}, ${exchanger.col}) transfer rate: ${transferRate}`);
            }
            if (transferRate <= 0) continue;

            // Get all adjacent components, not just those in the same segment
            const adjacentComponents = Array.from(this.game.tileset.getTilesInRange(exchanger, 1))
                .filter(neighbor => neighbor && neighbor.activated && neighbor.part &&
                    (neighbor.part.containment > 0 || neighbor.part.category === 'heat_exchanger' ||
                        neighbor.part.category === 'vent' || neighbor.part.category === 'heat_outlet' ||
                        neighbor.part.category === 'heat_inlet'));

            if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                console.log(`[DEBUG] Heat exchanger at (${exchanger.row}, ${exchanger.col}) has ${adjacentComponents.length} adjacent components`);
                adjacentComponents.forEach((neighbor, i) => {
                    console.log(`[DEBUG] Adjacent component ${i}: ${neighbor.part?.id} at (${neighbor.row}, ${neighbor.col}) with heat ${neighbor.heat_contained}`);
                });
            }

            if (adjacentComponents.length === 0) continue;

            const exchangerHeat = exchanger.heat_contained || 0;
            const neighborHeats = adjacentComponents.map(n => n.heat_contained || 0);
            const totalHeat = exchangerHeat + neighborHeats.reduce((sum, heat) => sum + heat, 0);
            const totalComponents = 1 + adjacentComponents.length;

            const targetHeatPerComponent = totalHeat / totalComponents;

            const heatToTransfer = Math.min(
                transferRate,
                Math.abs(exchangerHeat - targetHeatPerComponent)
            );

            if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                console.log(`[DEBUG] Heat transfer calculation: exchanger=${exchangerHeat}, neighbors=${JSON.stringify(neighborHeats)}, total=${totalHeat}, target=${targetHeatPerComponent}, transfer=${heatToTransfer}`);
            }

            if (heatToTransfer > 0) {
                if (exchangerHeat > targetHeatPerComponent) {
                    // Transfer heat from exchanger to neighbors
                    exchanger.heat_contained = Math.max(0, exchangerHeat - heatToTransfer);
                    const heatPerNeighbor = heatToTransfer / adjacentComponents.length;

                    for (const neighbor of adjacentComponents) {
                        neighbor.heat_contained = (neighbor.heat_contained || 0) + heatPerNeighbor;
                        neighbor.updateVisualState();
                    }

                    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                        console.log(`[DEBUG] Transferred ${heatToTransfer} heat from exchanger to neighbors. Exchanger now has ${exchanger.heat_contained} heat.`);
                    }
                } else {
                    // Transfer heat from neighbors to exchanger
                    exchanger.heat_contained = exchangerHeat + heatToTransfer;
                    const heatPerNeighbor = heatToTransfer / adjacentComponents.length;

                    for (const neighbor of adjacentComponents) {
                        neighbor.heat_contained = Math.max(0, (neighbor.heat_contained || 0) - heatPerNeighbor);
                        neighbor.updateVisualState();
                    }

                    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                        console.log(`[DEBUG] Transferred ${heatToTransfer} heat from neighbors to exchanger. Exchanger now has ${exchanger.heat_contained} heat.`);
                    }
                }
                exchanger.updateVisualState();
            }
        }
    }


    processHeatTransfer() {
        const reactor = this.game.reactor;
        // Note: reactor.updateStats() is called in the engine, no need to call it again here.

        // 1. Recalculate segment stats to get the current heat sum after exchangers.
        for (const segment of this.segments.values()) {
            segment.recalculateStats();
        }

        // 2. Process Inlets: Move heat from segments to the reactor core.
        for (const segment of this.segments.values()) {
            for (const inlet of segment.inlets) {
                const inletTransferRate = inlet.getEffectiveTransferValue();
                if (inletTransferRate > 0) {
                    const actualTransfer = Math.min(segment.currentHeat, inletTransferRate);
                    segment.currentHeat -= actualTransfer;
                    reactor.current_heat += actualTransfer;
                }
            }
        }

        // 3. Process Outlets: Move heat from the reactor core to segments.
        for (const segment of this.segments.values()) {
            for (const outlet of segment.outlets) {
                const outletTransferRate = outlet.getEffectiveTransferValue();
                const neighborCount = outlet.containmentNeighborTiles ? outlet.containmentNeighborTiles.length : 0;
                const totalTransferRate = outletTransferRate * neighborCount;

                if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                    console.log(`[DEBUG] Outlet transfer calculation: rate=${outletTransferRate}, neighbors=${neighborCount}, total=${totalTransferRate}`);
                }

                if (totalTransferRate > 0) {
                    const actualTransfer = Math.min(reactor.current_heat, totalTransferRate);
                    reactor.current_heat -= actualTransfer;
                    segment.currentHeat += actualTransfer;
                }
            }
        }

        // 4. Correctly distribute the final segment heat among its components.
        // This loop was the source of the main bug. It now SETS heat instead of ADDING it.
        for (const segment of this.segments.values()) {
            if (segment.components.length > 0) {
                const heatPerComponent = segment.currentHeat / segment.components.length;
                if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                    console.log(`[DEBUG] Distributing ${segment.currentHeat} heat among ${segment.components.length} components: ${heatPerComponent} each`);
                }
                for (const component of segment.components) {
                    component.heat_contained = heatPerComponent;
                }
            }
        }
    }


    checkExplosions() {
        for (const segment of this.segments.values()) {
            for (const tile of segment.components) {
                const part = tile.part;

                // Check for explosions (same logic as in engine.js)
                // Use > to match the test expectation for "exactly at containment"
                if (part && part.containment > 0 && tile.heat_contained > part.containment) {
                    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                        console.log(`[DEBUG] Component ${part.id} at (${tile.row}, ${tile.col}) exploded: heat=${tile.heat_contained}, containment=${part.containment}`);
                    }
                    if (part.category === "particle_accelerator") {
                        this.game.reactor.checkMeltdown();
                        return;
                    }
                    this.game.engine.handleComponentExplosion(tile);
                    // Mark this tile as exploded so it's skipped in subsequent processing
                    tile.exploded = true;
                }
            }
        }
    }

    processVenting() {
        for (const segment of this.segments.values()) {
            if (segment.vents.length > 0) {
                let totalVentRate = 0;
                const activeVents = segment.vents.filter(vent => !vent.exploded);

                // Calculate total venting capacity of the segment
                for (const vent of activeVents) {
                    totalVentRate += vent.getEffectiveVentValue();
                }

                if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                    console.log(`[DEBUG] Processing venting for segment ${segment.id}: ${segment.vents.length} vents, ${activeVents.length} active, total vent rate: ${totalVentRate}`);
                }

                if (totalVentRate > 0) {
                    // Calculate total heat available for venting from all components in the segment
                    let totalHeatAvailable = 0;
                    for (const component of segment.components) {
                        totalHeatAvailable += component.heat_contained || 0;
                    }

                    const totalHeatToVent = Math.min(totalHeatAvailable, totalVentRate);

                    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                        console.log(`[DEBUG] Segment ${segment.id} venting: total heat available: ${totalHeatAvailable}, total heat to vent: ${totalHeatToVent}`);
                    }

                    if (totalHeatToVent > 0) {
                        // Distribute venting proportionally among components (skip exploded ones)
                        const ventRatio = totalHeatToVent / totalHeatAvailable;
                        for (const component of segment.components) {
                            if (!component.exploded) {
                                const heatToRemove = (component.heat_contained || 0) * ventRatio;
                                const oldHeat = component.heat_contained || 0;
                                component.heat_contained = Math.max(0, (component.heat_contained || 0) - heatToRemove);
                                component.updateVisualState();

                                if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
                                    console.log(`[DEBUG] Component ${component.part?.id} at (${component.row}, ${component.col}): heat removed: ${heatToRemove}, old heat: ${oldHeat}, new heat: ${component.heat_contained}`);
                                }
                            }
                        }

                        // For each Extreme Vent, consume power equal to the heat it actually vents
                        for (const vent of activeVents) {
                            if (vent.part.id === "vent6") {
                                const ventContribution = vent.getEffectiveVentValue() / totalVentRate;
                                const heatVentedByThisVent = totalHeatToVent * ventContribution;
                                this.game.reactor.current_power -= heatVentedByThisVent;
                            }
                        }
                    }
                }
            }
        }
    }


    distributeHeatInSegments() {
        for (const segment of this.segments.values()) {
            segment.distributeHeat();
        }
    }


    getSegmentStats() {
        const stats = {
            totalVent: 0,
            totalInlet: 0,
            totalOutlet: 0,
            segmentCount: this.segments.size
        };

        for (const segment of this.segments.values()) {
            // Sum vent rates
            for (const vent of segment.vents) {
                stats.totalVent += vent.getEffectiveVentValue();
            }

            // Sum inlet rates
            for (const inlet of segment.inlets) {
                stats.totalInlet += inlet.getEffectiveTransferValue();
            }

            // Sum outlet rates
            for (const outlet of segment.outlets) {
                stats.totalOutlet += outlet.getEffectiveTransferValue();
            }
        }

        return stats;
    }

    getSegmentForTile(tile) {
        return this.tileSegmentMap.get(tile);
    }
} 