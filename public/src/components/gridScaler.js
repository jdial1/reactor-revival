import {
    GRID_TARGET_TOTAL_TILES, GRID_MIN_DIMENSION, GRID_MAX_DISPLAY_DIMENSION,
    ZOOM_DAMPING_FACTOR, PINCH_DISTANCE_THRESHOLD_PX,
    MOMENTUM_DECAY_FACTOR, SNAP_BACK_THRESHOLD_RATIO, SNAP_BACK_SPRING_CONSTANT,
    ZOOM_SCALE_MIN, ZOOM_SCALE_MAX
} from "../core/constants.js";
import { BaseComponent } from "./BaseComponent.js";

export class GridScaler extends BaseComponent {

    constructor(ui) {
        super();
        this.ui = ui;
        this.wrapper = null;
        this.reactor = null;
        this.resizeObserver = null;

        this.config = {
            targetTotalTiles: GRID_TARGET_TOTAL_TILES,
            minCols: GRID_MIN_DIMENSION,
            minRows: GRID_MIN_DIMENSION,
            maxCols: GRID_MAX_DISPLAY_DIMENSION,
            maxRows: GRID_MAX_DISPLAY_DIMENSION
        };

        this.gestureState = {
            isPinching: false,
            isPanning: false,
            initialDistance: 0,
            initialScale: 1,
            initialTranslate: { x: 0, y: 0 },
            pinchMidpointInWrapper: { x: 0, y: 0 },
            currentTranslate: { x: 0, y: 0 },
            currentScale: 1,
            targetTranslate: { x: 0, y: 0 },
            targetScale: 1,
            zoomDamping: ZOOM_DAMPING_FACTOR,
            touches: [],
            pinchDistanceThreshold: PINCH_DISTANCE_THRESHOLD_PX,
            lastTranslate: { x: 0, y: 0 },
            lastMoveTime: 0,
            velocity: { x: 0, y: 0 },
            momentumDecay: MOMENTUM_DECAY_FACTOR,
            snapBackThreshold: SNAP_BACK_THRESHOLD_RATIO,
            snapBackSpring: SNAP_BACK_SPRING_CONSTANT,
            _animationId: null
        };

    }



    init() {

        this.reactor = this.ui.DOMElements.reactor || document.getElementById('reactor');
        this.wrapper = this.ui.DOMElements.reactor_wrapper || document.getElementById('reactor_wrapper');

        if (!this.wrapper) return;

        this.resizeObserver = new ResizeObserver(() => this.requestResize());
        this.resizeObserver.observe(this.wrapper);

        this.requestResize();

        const isMobile = typeof window !== 'undefined' && window.innerWidth <= GridScaler.MOBILE_BREAKPOINT_PX;
        if (isMobile) {
            this.setupGestures();
        }

    }

    teardown() {
        if (this.resizeObserver && this.wrapper) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this._touchHandlers && this.wrapper) {
            this.wrapper.removeEventListener('touchstart', this._touchHandlers.start);
            this.wrapper.removeEventListener('touchmove', this._touchHandlers.move);
            this.wrapper.removeEventListener('touchend', this._touchHandlers.end);
            this.wrapper.removeEventListener('touchcancel', this._touchHandlers.end);
            this._touchHandlers = null;
        }
    }

    setupGestures() {
        if (!this.wrapper) return;

        this._touchHandlers = {
            start: (e) => this.handleTouchStart(e),
            move: (e) => this.handleTouchMove(e),
            end: (e) => this.handleTouchEnd(e),
        };
        this.wrapper.addEventListener('touchstart', this._touchHandlers.start, { passive: false });
        this.wrapper.addEventListener('touchmove', this._touchHandlers.move, { passive: false });
        this.wrapper.addEventListener('touchend', this._touchHandlers.end, { passive: false });
        this.wrapper.addEventListener('touchcancel', this._touchHandlers.end, { passive: false });
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
            this.gestureState.targetScale = this.gestureState.currentScale;
            this.gestureState.targetTranslate = { ...this.gestureState.currentTranslate };
            const midpoint = this.getMidpoint(e.touches[0], e.touches[1]);
            const wrapperRect = this.wrapper.getBoundingClientRect();
            const wrapperCenterX = wrapperRect.left + wrapperRect.width / 2;
            const wrapperCenterY = wrapperRect.top + wrapperRect.height / 2;
            this.gestureState.pinchMidpointInWrapper = {
                x: midpoint.x - wrapperCenterX,
                y: midpoint.y - wrapperCenterY
            };
            this.gestureState.isPinching = false;
            this.gestureState.isPanning = false;
            this.gestureState.lastMoveTime = performance.now();
            this.gestureState.lastTranslate = { ...this.gestureState.currentTranslate };
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
        const g = this.gestureState;
        const now = performance.now();
        const dt = Math.min(100, now - g.lastMoveTime) / 1000;
        if (dt > 0) {
            g.velocity.x = (g.currentTranslate.x - g.lastTranslate.x) / dt;
            g.velocity.y = (g.currentTranslate.y - g.lastTranslate.y) / dt;
        }
        g.lastTranslate = { ...g.currentTranslate };
        g.lastMoveTime = now;

        const d = g.zoomDamping;
        const scale = (currentDistance / g.initialDistance) * g.initialScale;
        const clampedScale = Math.max(ZOOM_SCALE_MIN, Math.min(ZOOM_SCALE_MAX, scale));
        g.targetScale = clampedScale;
        const ratio = g.currentScale > 0 ? clampedScale / g.currentScale : 1;
        const mx = g.pinchMidpointInWrapper.x;
        const my = g.pinchMidpointInWrapper.y;
        g.targetTranslate = {
            x: g.currentTranslate.x * ratio + mx * (1 - ratio),
            y: g.currentTranslate.y * ratio + my * (1 - ratio)
        };
        const currentMidpoint = this.getMidpoint(e.touches[0], e.touches[1]);
        const previousMidpoint = this.getMidpoint(g.touches[0], g.touches[1]);
        g.targetTranslate.x += currentMidpoint.x - previousMidpoint.x;
        g.targetTranslate.y += currentMidpoint.y - previousMidpoint.y;

        g.currentScale += (g.targetScale - g.currentScale) * d;
        g.currentTranslate.x += (g.targetTranslate.x - g.currentTranslate.x) * d;
        g.currentTranslate.y += (g.targetTranslate.y - g.currentTranslate.y) * d;
        g.touches = Array.from(e.touches);
        this.applyTransform();
    }

    handleTouchEnd(e) {
        if (e.touches.length < 2) {
            this.gestureState.isPinching = false;
            this.gestureState.isPanning = false;
            this.gestureState.touches = [];
            this.startInertiaOrSnapBack();
        }
    }

    startInertiaOrSnapBack() {
        if (this.gestureState._animationId) cancelAnimationFrame(this.gestureState._animationId);
        const g = this.gestureState;
        const run = () => {
            const w = this.wrapper;
            if (!w || !this.reactor) return;
            const wW = w.clientWidth || 1;
            const wH = w.clientHeight || 1;
            const limitX = wW * g.snapBackThreshold;
            const limitY = wH * g.snapBackThreshold;
            const needSnap = Math.abs(g.currentTranslate.x) > limitX || Math.abs(g.currentTranslate.y) > limitY;
            const speed = Math.sqrt(g.velocity.x * g.velocity.x + g.velocity.y * g.velocity.y);
            const stillMoving = speed > 5;

            if (stillMoving && !needSnap) {
                g.currentTranslate.x += g.velocity.x * 0.016;
                g.currentTranslate.y += g.velocity.y * 0.016;
                g.velocity.x *= g.momentumDecay;
                g.velocity.y *= g.momentumDecay;
            } else if (needSnap) {
                g.velocity.x = 0;
                g.velocity.y = 0;
                g.currentTranslate.x += (0 - g.currentTranslate.x) * g.snapBackSpring;
                g.currentTranslate.y += (0 - g.currentTranslate.y) * g.snapBackSpring;
            } else {
                g.velocity.x = 0;
                g.velocity.y = 0;
            }

            this.applyTransform();
            const stillSnapping = needSnap && (Math.abs(g.currentTranslate.x) > 1 || Math.abs(g.currentTranslate.y) > 1);
            if (stillMoving || stillSnapping) {
                g._animationId = requestAnimationFrame(run);
            } else {
                g._animationId = null;
            }
        };
        g._animationId = requestAnimationFrame(run);
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
        this.gestureState.targetScale = 1;
        this.gestureState.currentTranslate = { x: 0, y: 0 };
        this.gestureState.targetTranslate = { x: 0, y: 0 };
        this.reactor.style.transform = '';
        this.reactor.style.transformOrigin = '';
    }



    requestResize() {
        if (this.ui?.game && this.reactor && this.wrapper) {
            requestAnimationFrame(() => this.resize());
        }
    }


    static get MOBILE_BREAKPOINT_PX() { return 900; }
    static get MOBILE_MIN_TILE_PX() { return 40; }
    static get DESKTOP_MIN_TILE_PX() { return 36; }
    static get MAX_TILE_SIZE_PX() { return 64; }
    static get MOBILE_PREF_COLS() { return 8; }
    static get MOBILE_TALL_ROWS() { return 14; }
    static get MOBILE_MED_ROWS() { return 10; }
    static get MAX_DESKTOP_COLS() { return 16; }

    getMobileGridDimensions(availWidth, availHeight) {
        const minTileSize = GridScaler.MOBILE_MIN_TILE_PX;
        const maxTilesX = Math.floor(availWidth / minTileSize);
        const maxTilesY = Math.floor(availHeight / minTileSize);
        let cols = GridScaler.MOBILE_PREF_COLS;
        cols = Math.max(this.config.minCols, Math.min(cols, maxTilesX, this.config.maxCols));
        let rows = maxTilesY >= GridScaler.MOBILE_TALL_ROWS ? GridScaler.MOBILE_TALL_ROWS : maxTilesY >= GridScaler.MOBILE_MED_ROWS ? GridScaler.MOBILE_MED_ROWS : Math.max(this.config.minRows, Math.min(maxTilesY, this.config.maxRows));
        const actualTileSizeY = availHeight / rows;
        if (actualTileSizeY < minTileSize) {
            rows = Math.floor(availHeight / minTileSize);
            rows = Math.max(this.config.minRows, Math.min(rows, this.config.maxRows));
        }
        return { rows, cols };
    }

    getDesktopGridDimensions(availWidth, availHeight) {
        const maxDesktopCols = GridScaler.MAX_DESKTOP_COLS;
        const minTileSize = GridScaler.DESKTOP_MIN_TILE_PX;
        const targetTotalTiles = this.config.targetTotalTiles;
        const maxTilesX = Math.floor(availWidth / minTileSize);
        const maxTilesY = Math.floor(availHeight / minTileSize);
        const idealCols = Math.ceil(Math.sqrt(targetTotalTiles));
        const cols = Math.min(maxTilesX, maxDesktopCols, Math.max(idealCols, this.config.minCols));
        let rows = Math.round(targetTotalTiles / cols);
        rows = Math.max(this.config.minRows, Math.min(rows, maxTilesY, this.config.maxRows));
        return { rows, cols };
    }

    calculateGridDimensions(availWidth, availHeight, maxTileSize) {
        const isMobile = typeof window !== 'undefined' && window.innerWidth <= GridScaler.MOBILE_BREAKPOINT_PX;
        if (isMobile) return this.getMobileGridDimensions(availWidth, availHeight);
        return this.getDesktopGridDimensions(availWidth, availHeight);
    }



    resize() {

        if (!this.reactor || !this.wrapper) {
            this.reactor = this.ui.DOMElements.reactor || document.getElementById('reactor');
            this.wrapper = this.ui.DOMElements.reactor_wrapper || document.getElementById('reactor_wrapper');
        }

        if (!this.reactor || !this.wrapper) {
            return;
        }



        const availWidth = this.wrapper.clientWidth;
        const availHeight = this.wrapper.clientHeight;

        if (availWidth <= 0 || availHeight <= 0) {
            return;
        }

        const maxTileSize = GridScaler.MAX_TILE_SIZE_PX;
        const isMobile = typeof window !== 'undefined' && window.innerWidth <= GridScaler.MOBILE_BREAKPOINT_PX;
        const dims = this.calculateGridDimensions(availWidth, availHeight, maxTileSize);

        let cols = dims.cols;
        let rows = dims.rows;

        const sizeXFinal = availWidth / cols;
        const sizeYFinal = availHeight / rows;
        let tileSize = Math.floor(Math.min(sizeXFinal, sizeYFinal, maxTileSize));
        
        const calculatedGridHeight = rows * tileSize;
        if (calculatedGridHeight > availHeight && isMobile) {
            const maxRowsForHeight = Math.floor(availHeight / tileSize);
            if (maxRowsForHeight >= this.config.minRows) {
                rows = maxRowsForHeight;
                tileSize = Math.floor(availHeight / rows);
            }
        }

        if (!this.ui?.game) return;
        if (this.ui.game.resizeGrid) {
            this.ui.game.resizeGrid(rows, cols);
        } else {
            this.ui.game.rows = rows;
            this.ui.game.cols = cols;
        }

        const finalGridWidth = cols * tileSize;
        const finalGridHeight = rows * tileSize;

        this.reactor.style.setProperty('--tile-size', `${tileSize}px`);
        this.reactor.style.setProperty('--game-cols', cols);
        this.reactor.style.setProperty('--game-rows', rows);

        this.reactor.style.width = `${finalGridWidth}px`;
        this.reactor.style.height = `${finalGridHeight}px`;

        if (this.ui.gridCanvasRenderer) {
          this.ui.gridCanvasRenderer.setSize(finalGridWidth, finalGridHeight);
          this.ui.gridCanvasRenderer.setGridDimensions(rows, cols);
          this.ui.gridCanvasRenderer.markStaticDirty();
        }

        this.applyWrapperAndSectionStyles(isMobile);
    }

    applyWrapperAndSectionStyles(isMobile) {
        if (!this.wrapper) return;
        this.wrapper.style.display = 'flex';
        this.wrapper.style.alignItems = 'center';
        this.wrapper.style.justifyContent = 'center';
        const section = document.getElementById('reactor_section') || this.wrapper.parentElement;
        if (section && isMobile) {
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
        }
        if (section && !isMobile) {
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
