export class GridScaler {
    constructor(ui) {
        this.ui = ui;
        this.resizeObserver = null;
        this.reactor = null;
        this.wrapper = null;
    }

    init() {
        this.reactor = this.ui.DOMElements.reactor;
        this.wrapper = this.ui.DOMElements.reactor_wrapper;

        if (this.wrapper) {
            this.resizeObserver = new ResizeObserver(() => {
                if (this.ui.game && this.ui.game.router && this.ui.game.router.currentPageId === "reactor_section") {
                    requestAnimationFrame(() => this.resize());
                }
            });

            this.resizeObserver.observe(this.wrapper);
        }

        window.addEventListener('resize', () => {
            if (this.ui.game && this.ui.game.router && this.ui.game.router.currentPageId === "reactor_section") {
                this.resize();
            }
        });
    }

    resize() {
        if (!this.reactor) this.reactor = document.getElementById('reactor');
        if (!this.wrapper) this.wrapper = document.getElementById('reactor_wrapper');

        if (!this.reactor || !this.wrapper || !this.ui.game) return;

        if (this.wrapper.offsetParent === null) return;

        const game = this.ui.game;
        const rows = game.rows || 12;
        const cols = game.cols || 12;

        const isMobile = window.innerWidth <= 900;
        let mobileBottomOffset = 0;

        if (isMobile) {
            const bottomNav = document.getElementById('bottom_nav') || document.querySelector('footer#bottom_nav');
            const infoBar = document.getElementById('info_bar');
            const mobileTopBar = document.getElementById('mobile_top_bar');
            
            if (bottomNav && bottomNav.offsetParent !== null) {
                const bottomNavRect = bottomNav.getBoundingClientRect();
                mobileBottomOffset += bottomNavRect.height;
            }
            
            if (infoBar && infoBar.offsetParent !== null) {
                const infoBarRect = infoBar.getBoundingClientRect();
                mobileBottomOffset += infoBarRect.height;
            }
            
            if (mobileTopBar && mobileTopBar.classList.contains('active') && mobileTopBar.offsetParent !== null) {
                const mobileTopBarRect = mobileTopBar.getBoundingClientRect();
                mobileBottomOffset += mobileTopBarRect.height;
            }
        }

        let w, h;
        
        if (typeof this.wrapper.getBoundingClientRect === 'function') {
            const rect = this.wrapper.getBoundingClientRect();
            w = rect.width;
            h = this.wrapper.clientHeight || rect.height;
        } else {
            w = this.wrapper.clientWidth || 800;
            h = this.wrapper.clientHeight || 600;
        }

        if (w === 0 || h === 0) {
            w = w || 800;
            h = h || 600;
        }

        const padding = 10;
        
        if (isMobile && mobileBottomOffset > 0) {
            const wrapperTop = this.wrapper.getBoundingClientRect().top;
            const viewportHeight = window.innerHeight;
            const maxWrapperHeight = viewportHeight - wrapperTop - mobileBottomOffset;
            
            this.wrapper.style.maxHeight = `${maxWrapperHeight}px`;
            
            h = Math.min(h, maxWrapperHeight);
        } else {
            this.wrapper.style.maxHeight = '';
        }
        
        let availW = w - (padding * 2);
        let availH = h - (padding * 2);
        availH = Math.max(availH, rows * 10);

        let tileSize = Math.min(availW / cols, availH / rows);
        tileSize = Math.floor(tileSize);
        tileSize = Math.max(tileSize, 10);

        availH = h - (padding * 2) - (tileSize * 2);
        availH = Math.max(availH, rows * 10);

        tileSize = Math.min(availW / cols, availH / rows);
        tileSize = Math.floor(tileSize);
        tileSize = Math.max(tileSize, 10);

        const gridWidth = cols * tileSize;
        const gridHeight = rows * tileSize;

        this.reactor.style.setProperty('--tile-size', `${tileSize}px`);
        this.reactor.style.setProperty('--game-cols', cols);
        this.reactor.style.setProperty('--game-rows', rows);

        this.reactor.style.width = `${gridWidth}px`;
        this.reactor.style.height = `${gridHeight}px`;

        this.wrapper.style.display = 'flex';
        this.wrapper.style.alignItems = 'flex-start';
        this.wrapper.style.justifyContent = 'center';
        this.wrapper.style.overflow = 'hidden';
        this.wrapper.style.marginTop = `${tileSize}px`;
        
    }
}

