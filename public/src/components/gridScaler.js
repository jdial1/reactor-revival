export class GridScaler {

    constructor(ui) {

        this.ui = ui;
        this.wrapper = null;
        this.reactor = null;
        this.resizeObserver = null;

        this.config = {
            targetTotalTiles: 144, // The goal (e.g., 12x12 = 144)
            minCols: 6,            // Never narrower than this
            minRows: 6,            // Never shorter than this
            maxCols: 20,           // Sanity cap
            maxRows: 20            // Sanity cap

        };

    }



    init() {

        this.reactor = this.ui.DOMElements.reactor || document.getElementById('reactor');
        this.wrapper = this.ui.DOMElements.reactor_wrapper || document.getElementById('reactor_wrapper');

        if (!this.wrapper) return;

        // Observe wrapper size changes
        this.resizeObserver = new ResizeObserver(() => this.requestResize());
        this.resizeObserver.observe(this.wrapper);

        this.requestResize();

    }



    requestResize() {
        if (this.ui.game && this.reactor && this.wrapper) {
            requestAnimationFrame(() => this.resize());
        }
    }


    /**
     * Calculates grid dimensions for desktop (rectangular) or mobile (rectangular).
     * Desktop: scales columns up to 16, calculates rows to maintain ~144 total tiles.
     * Mobile: rectangular grid (8x10 or 8x14) based on screen space.
     */

    calculateGridDimensions(availWidth, availHeight, maxTileSize) {

        const isMobile = typeof window !== 'undefined' && window.innerWidth <= 900;

        if (isMobile) {
            const minTileSize = 32;
            const maxTilesX = Math.floor(availWidth / minTileSize);
            const maxTilesY = Math.floor(availHeight / minTileSize);

            let cols = 6;
            cols = Math.max(this.config.minCols, Math.min(cols, maxTilesX, this.config.maxCols));

            let rows;
            if (maxTilesY >= 14) {
                rows = 14;
            } else if (maxTilesY >= 10) {
                rows = 10;
            } else {
                rows = Math.max(this.config.minRows, Math.min(maxTilesY, this.config.maxRows));
            }
            
            const actualTileSizeY = availHeight / rows;
            if (actualTileSizeY < minTileSize) {
                rows = Math.floor(availHeight / minTileSize);
                rows = Math.max(this.config.minRows, Math.min(rows, this.config.maxRows));
            }

            return { rows, cols };
        } else {
            const maxDesktopCols = 16;
            const minTileSize = 32;
            const targetTotalTiles = this.config.targetTotalTiles;

            const maxTilesX = Math.floor(availWidth / minTileSize);
            const maxTilesY = Math.floor(availHeight / minTileSize);

            const idealCols = Math.ceil(Math.sqrt(targetTotalTiles));
            
            let cols = Math.min(maxTilesX, maxDesktopCols, Math.max(idealCols, this.config.minCols));
            
            let rows = Math.round(targetTotalTiles / cols);
            
            rows = Math.max(this.config.minRows, Math.min(rows, maxTilesY, this.config.maxRows));
            
            return { rows, cols };
        }

    }



    resize() {

        if (!this.reactor || !this.wrapper) {
            this.reactor = this.ui.DOMElements.reactor || document.getElementById('reactor');
            this.wrapper = this.ui.DOMElements.reactor_wrapper || document.getElementById('reactor_wrapper');
        }

        if (!this.reactor || !this.wrapper) {
            return;
        }



        // 1. Get Available Space
        const availWidth = this.wrapper.clientWidth;
        const availHeight = this.wrapper.clientHeight;

        if (availWidth <= 0 || availHeight <= 0) {
            return;
        }

        // 2. Calculate grid dimensions (rectangular for desktop and mobile)
        const maxTileSize = 64;
        const isMobile = typeof window !== 'undefined' && window.innerWidth <= 900;
        const dims = this.calculateGridDimensions(availWidth, availHeight, maxTileSize);

        let cols = dims.cols;
        let rows = dims.rows;

        // 3. Calculate tile size to fit the grid perfectly (max 64px)
        const sizeXFinal = availWidth / cols;
        const sizeYFinal = availHeight / rows;
        let tileSize = Math.floor(Math.min(sizeXFinal, sizeYFinal, maxTileSize));
        
        // 4. Verify grid fits and adjust rows if needed (especially for mobile)
        const calculatedGridHeight = rows * tileSize;
        if (calculatedGridHeight > availHeight && isMobile) {
            const maxRowsForHeight = Math.floor(availHeight / tileSize);
            if (maxRowsForHeight >= this.config.minRows) {
                rows = maxRowsForHeight;
                tileSize = Math.floor(availHeight / rows);
            }
        }

        // --- DEBUG LOGGING ---
        const gridType = isMobile ? 'Mobile (Rectangular)' : 'Desktop (Rectangular)';
        
        // console.groupCollapsed(`[GridScaler] Resized to ${cols}x${rows}`);
        // console.log(`Wrapper Size:   ${availWidth}px x ${availHeight}px`);
        // console.log(`Grid Logic:     ${cols} Cols x ${rows} Rows (${gridType})`);
        // console.log(`Tile Size:      ${tileSize}px (Fit Width: ${sizeXFinal.toFixed(1)}, Fit Height: ${sizeYFinal.toFixed(1)})`);
        // console.log(`Final Size:     ${cols * tileSize}px x ${rows * tileSize}px`);
        // console.groupEnd();

        // ---------------------

        // 5. Update Game Logic

        if (this.ui.game.resizeGrid) {

            this.ui.game.resizeGrid(rows, cols);

        } else {

            this.ui.game.rows = rows;
            this.ui.game.cols = cols;

        }

        // 6. Apply CSS
        const finalGridWidth = cols * tileSize;
        const finalGridHeight = rows * tileSize;

        this.reactor.style.setProperty('--tile-size', `${tileSize}px`);
        this.reactor.style.setProperty('--game-cols', cols);
        this.reactor.style.setProperty('--game-rows', rows);

        // Explicit size sets the container for centering

        this.reactor.style.width = `${finalGridWidth}px`;
        this.reactor.style.height = `${finalGridHeight}px`;

        // Align grid in wrapper (flex-start for mobile, center for desktop)

        if (this.wrapper) {

            this.wrapper.style.display = 'flex';
            
            if (isMobile) {
                this.wrapper.style.alignItems = 'flex-start';
                this.wrapper.style.justifyContent = 'flex-start';
            } else {
                this.wrapper.style.alignItems = 'center';
                this.wrapper.style.justifyContent = 'center';
            }

        }

    }

}
