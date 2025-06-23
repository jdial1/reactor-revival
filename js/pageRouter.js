export class PageRouter {
  constructor(ui) {
    this.ui = ui;
    this.pages = {
      reactor_section: { path: "pages/reactor.html" },
      upgrades_section: { path: "pages/upgrades.html" },
      experimental_upgrades_section: { path: "pages/research.html" },
      about_section: { path: "pages/about.html" },
    };
    this.currentPageId = null;
    this.contentAreaSelector = "#page_content_area";
  }

  async loadPage(pageId, force = false) {
    console.log(`PageRouter: Attempting to load page "${pageId}"`);

    if (!force && this.ui.game.reactor.has_melted_down) {
      console.log("PageRouter: Navigation disabled during meltdown.");
      return;
    }

    if (!force && this.currentPageId === pageId) {
      console.log(`PageRouter: Page "${pageId}" is already loaded, skipping.`);
      return;
    }

    const pageDef = this.pages[pageId];
    if (!pageDef) {
      console.error(
        `PageRouter: Page definition not found for ID "${pageId}".`
      );
      return;
    }

    const pageContentArea = document.querySelector(this.contentAreaSelector);
    if (!pageContentArea) {
      console.error(
        `PageRouter: Content area "${this.contentAreaSelector}" not found.`
      );
      return;
    }

    console.log(`PageRouter: Loading page from "${pageDef.path}"`);

    try {
      const response = await fetch(pageDef.path);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const html = await response.text();

      console.log(`PageRouter: Removing showing class from existing pages`);
      // Remove showing class from all existing pages
      pageContentArea.querySelectorAll(".page").forEach((page) => {
        page.classList.remove("showing");
        console.log(`PageRouter: Removed showing class from page: ${page.id}`);
      });

      console.log(`PageRouter: Replacing content area HTML`);
      pageContentArea.innerHTML = html;

      // Add showing class to the newly loaded page
      const newPage = pageContentArea.querySelector(".page");
      if (newPage) {
        console.log(
          `PageRouter: Adding showing class to new page: ${newPage.id}`
        );
        newPage.classList.add("showing");
      } else {
        console.warn(`PageRouter: No .page element found in loaded content`);
      }

      const oldPageId = this.currentPageId;
      this.currentPageId = pageId;

      console.log(
        `PageRouter: Page loaded successfully. Old: "${oldPageId}", New: "${pageId}"`
      );

      this.updateNavigation(pageId);

      if (this.ui && typeof this.ui.initializePage === "function") {
        console.log(`PageRouter: Initializing page "${pageId}"`);
        this.ui.initializePage(pageId, pageContentArea);
      }
    } catch (error) {
      console.error(
        `PageRouter: Failed to load page "${pageId}" from "${pageDef.path}":`,
        error
      );

      // Load error page from separate file
      try {
        const errorResponse = await fetch("pages/error-page.html");
        if (errorResponse.ok) {
          const errorHtml = await errorResponse.text();
          pageContentArea.innerHTML = errorHtml;
        } else {
          // Fallback to inline error message if error page fails to load
          pageContentArea.innerHTML = `<div class="pixel-panel explanitory"><h3>Error</h3><p>Could not load page. Please check your connection and try again.</p></div>`;
        }
      } catch (errorPageError) {
        console.error("Failed to load error page:", errorPageError);
        // Final fallback
        pageContentArea.innerHTML = `<div class="pixel-panel explanitory"><h3>Error</h3><p>Could not load page. Please check your connection and try again.</p></div>`;
      }

      if (this.currentPageId) this.updateNavigation(this.currentPageId);
    }
  }

  updateNavigation(activePageId) {
    const navSelectors = ["#main_top_nav", "#bottom_nav"];
    navSelectors.forEach((selector) => {
      const navContainer = document.querySelector(selector);
      if (navContainer) {
        navContainer
          .querySelectorAll(".pixel-btn[data-page]")
          .forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.page === activePageId);
          });
      }
    });
  }

  async loadGameLayout() {
    try {
      const response = await fetch("pages/game.html");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const html = await response.text();
      const wrapper = document.getElementById("wrapper");

      if (wrapper) {
        wrapper.innerHTML = html;
        wrapper.style.display = "";
      } else {
        console.error(
          "PageRouter: #wrapper element not found to load game layout."
        );
      }
    } catch (error) {
      console.error("PageRouter: Failed to load game layout:", error);
    }
  }
}
