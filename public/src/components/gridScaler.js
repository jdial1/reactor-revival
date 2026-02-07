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

        this.gestureState = {
            isPinching: false,
            isPanning: false,
            initialDistance: 0,
            initialScale: 1,
            initialTranslate: { x: 0, y: 0 },
            currentTranslate: { x: 0, y: 0 },
            currentScale: 1,
            touches: [],
            pinchDistanceThreshold: 10
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

        const isMobile = typeof window !== 'undefined' && window.innerWidth <= 900;
        if (isMobile) {
            this.setupGestures();
        }

    }

    setupGestures() {
        if (!this.wrapper) return;

        this.wrapper.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        this.wrapper.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        this.wrapper.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
        this.wrapper.addEventListener('touchcancel', (e) => this.handleTouchEnd(e), { passive: false });
    }

    getDistance(touch1, touch2) {
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getMidpoint(touch1, touch2) {
        return {
            x: (touch1.clientX + touch2.clientX) / 2,
            y: (touch1.clientY + touch2.clientY) / 2
        };
    }

    handleTouchStart(e) {
        if (e.touches.length === 2) {
            this.gestureState.touches = Array.from(e.touches);
            this.gestureState.initialDistance = this.getDistance(e.touches[0], e.touches[1]);
            this.gestureState.initialScale = this.gestureState.currentScale || 1;
            this.gestureState.initialTranslate = { ...this.gestureState.currentTranslate };
            this.gestureState.isPinching = false;
            this.gestureState.isPanning = false;
        } else if (e.touches.length === 1) {
            this.gestureState.isPinching = false;
            this.gestureState.isPanning = false;
            this.gestureState.touches = [];
        }
    }

    handleTouchMove(e) {
        if (e.touches.length !== 2) return;
        const currentDistance = this.getDistance(e.touches[0], e.touches[1]);
        if (!this.gestureState.isPinching && !this.gestureState.isPanning) {
            const threshold = this.gestureState.pinchDistanceThreshold || 10;
            const distanceDelta = Math.abs(currentDistance - this.gestureState.initialDistance);
            if (distanceDelta < threshold) return;
            this.gestureState.isPinching = true;
            this.gestureState.isPanning = true;
        }
        e.preventDefault();
        if (this.gestureState.isPinching) {
            const scale = (currentDistance / this.gestureState.initialDistance) * this.gestureState.initialScale;
            const clampedScale = Math.max(0.5, Math.min(2.0, scale));
            this.gestureState.currentScale = clampedScale;
            const midpoint = this.getMidpoint(e.touches[0], e.touches[1]);
            const wrapperRect = this.wrapper.getBoundingClientRect();
            const wrapperCenterX = wrapperRect.left + wrapperRect.width / 2;
            const wrapperCenterY = wrapperRect.top + wrapperRect.height / 2;
            this.gestureState.currentTranslate = {
                x: midpoint.x - wrapperCenterX,
                y: midpoint.y - wrapperCenterY
            };
        } else {
            const currentMidpoint = this.getMidpoint(e.touches[0], e.touches[1]);
            const previousMidpoint = this.getMidpoint(
                this.gestureState.touches[0],
                this.gestureState.touches[1]
            );
            this.gestureState.currentTranslate.x += currentMidpoint.x - previousMidpoint.x;
            this.gestureState.currentTranslate.y += currentMidpoint.y - previousMidpoint.y;
        }
        this.gestureState.touches = Array.from(e.touches);
        this.applyTransform();
    }

    handleTouchEnd(e) {
        if (e.touches.length < 2) {
            this.gestureState.isPinching = false;
            this.gestureState.isPanning = false;
            this.gestureState.touches = [];
        }
    }

    applyTransform() {
        if (!this.reactor) return;

        const { currentScale, currentTranslate } = this.gestureState;
        const transform = `translate(${currentTranslate.x}px, ${currentTranslate.y}px) scale(${currentScale})`;
        this.reactor.style.transform = transform;
        this.reactor.style.transformOrigin = 'center center';
    }

    resetTransform() {
        if (!this.reactor) return;
        
        this.gestureState.currentScale = 1;
        this.gestureState.currentTranslate = { x: 0, y: 0 };
        this.reactor.style.transform = '';
        this.reactor.style.transformOrigin = '';
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
            const minTileSize = 40;
            const maxTilesX = Math.floor(availWidth / minTileSize);
            const maxTilesY = Math.floor(availHeight / minTileSize);

            let cols = 8;
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
            const minTileSize = 36;
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

        // console.groupCollapsed(`[GridScaler] Resized to ${cols}x${rows}`);
        // console.log(`Wrapper Size:   ${availWidth}px x ${availHeight}px`);
        // console.log(`Grid Logic:     ${cols} Cols x ${rows} Rows (${gridType})`);
        // console.log(`Tile Size:      ${tileSize}px (Fit Width: ${sizeXFinal.toFixed(1)}, Fit Height: ${sizeYFinal.toFixed(1)})`);
        // console.log(`Final Size:     ${cols * tileSize}px x ${rows * tileSize}px`);
        // console.groupEnd();

        // ---------------------

        // 5. Update Game Logic
        if (!this.ui.game) {
            return;
        }

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

        if (this.ui.gridCanvasRenderer) {
          this.ui.gridCanvasRenderer.setSize(finalGridWidth, finalGridHeight);
          this.ui.gridCanvasRenderer.setGridDimensions(rows, cols);
          this.ui.gridCanvasRenderer.markStaticDirty();
        }

        // Align grid in wrapper (flex-start for mobile, center for desktop)

        if (this.wrapper) {
            this.wrapper.style.display = 'flex';
            this.wrapper.style.alignItems = 'center';
            this.wrapper.style.justifyContent = 'center';
            const section = document.getElementById('reactor_section') || this.wrapper.parentElement;
            if (isMobile && section) {
                const topBar = document.getElementById('mobile_passive_top_bar');
                const topOffset = topBar ? topBar.offsetHeight : 0;
                const buildRow = document.getElementById('build_above_deck_row');
                const controlDeck = document.getElementById('reactor_control_deck');
                const bottomNav = document.getElementById('bottom_nav');
                const bottomOffset = (buildRow?.offsetHeight || 0) + (controlDeck?.offsetHeight || 0) + (bottomNav?.offsetHeight || 0);
                section.style.paddingTop = `${topOffset}px`;
                section.style.paddingRight = '5px';
                section.style.paddingBottom = `${bottomOffset}px`;
                section.style.paddingLeft = '5px';
            } else if (section) {
                section.style.paddingTop = '';
                section.style.paddingRight = '';
                section.style.paddingBottom = '';
                section.style.paddingLeft = '';
            }
            this.wrapper.style.paddingTop = '';
            this.wrapper.style.paddingRight = '';
            this.wrapper.style.paddingBottom = '';
            this.wrapper.style.paddingLeft = '';
        }

    }

}
