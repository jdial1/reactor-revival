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
     * Calculates grid dimensions that maintain ~144 tiles total,
     * but reshaped to fit the screen's aspect ratio.
     */

    calculateReshapedDimensions(availWidth, availHeight) {

        const screenRatio = availWidth / availHeight;
        const targetArea = this.config.targetTotalTiles;

        // 1. Calculate ideal Rows based on aspect ratio
        // Algebra: Rows^2 = Area / Ratio
        let idealRows = Math.sqrt(targetArea / screenRatio);

        // 2. Derive Cols from that
        let idealCols = targetArea / idealRows;

        // 3. Round to integers
        let rows = Math.round(idealRows);
        let cols = Math.round(idealCols);

        // Debug raw math before clamping
        console.log(`[GridScaler Calc] Ratio: ${screenRatio.toFixed(2)}, Ideal: ${idealCols.toFixed(2)}x${idealRows.toFixed(2)}`);

        // 4. Safety Clamps
        rows = Math.max(this.config.minRows, Math.min(rows, this.config.maxRows));
        cols = Math.max(this.config.minCols, Math.min(cols, this.config.maxCols));

        return { rows, cols, screenRatio };

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

        // 2. Calculate the Grid Dimensions (Rows/Cols)
        const dims = this.calculateReshapedDimensions(availWidth, availHeight);

        const cols = dims.cols;
        const rows = dims.rows;

        // 3. Calculate Tile Size to FIT those dimensions
        const sizeX = availWidth / cols;
        const sizeY = availHeight / rows;

        // Use the smaller size to ensure it fits both width and height
        let tileSize = Math.floor(Math.min(sizeX, sizeY));

        // --- DEBUG LOGGING ---

        console.groupCollapsed(`[GridScaler] Resized to ${cols}x${rows}`);
        console.log(`Wrapper Size:   ${availWidth}px x ${availHeight}px`);
        console.log(`Aspect Ratio:   ${dims.screenRatio.toFixed(2)}`);
        console.log(`Target Tiles:   ${this.config.targetTotalTiles} (Actual: ${rows * cols})`);
        console.log(`Grid Logic:     ${cols} Cols x ${rows} Rows`);
        console.log(`Tile Size:      ${tileSize}px (Fit Width: ${sizeX.toFixed(1)}, Fit Height: ${sizeY.toFixed(1)})`);
        console.log(`Final Size:     ${cols * tileSize}px x ${rows * tileSize}px`);
        console.groupEnd();

        // ---------------------

        // 4. Update Game Logic

        if (this.ui.game.resizeGrid) {

            this.ui.game.resizeGrid(rows, cols);

        } else {

            this.ui.game.rows = rows;
            this.ui.game.cols = cols;

        }

        // 5. Apply CSS
        const finalGridWidth = cols * tileSize;
        const finalGridHeight = rows * tileSize;

        this.reactor.style.setProperty('--tile-size', `${tileSize}px`);
        this.reactor.style.setProperty('--game-cols', cols);
        this.reactor.style.setProperty('--game-rows', rows);

        // Explicit size sets the container for centering

        this.reactor.style.width = `${finalGridWidth}px`;
        this.reactor.style.height = `${finalGridHeight}px`;

        // Center grid in wrapper

        if (this.wrapper) {

            this.wrapper.style.display = 'flex';
            this.wrapper.style.alignItems = 'center';
            this.wrapper.style.justifyContent = 'center';

        }

    }

}
