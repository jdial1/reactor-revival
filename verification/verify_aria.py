from playwright.sync_api import sync_playwright

def verify_aria_labels():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Go to the local dev server
        page.goto("http://localhost:8080/index.html")

        # Wait for the splash screen to load (New Game button)
        try:
            page.wait_for_selector("#splash-new-game-btn", timeout=5000)
        except:
            print("Timeout waiting for splash screen. Taking screenshot.")
            page.screenshot(path="verification/splash_timeout.png")
            browser.close()
            return

        # Start a new game
        page.click("#splash-new-game-btn")

        # Wait for potential doctrine selection screen or game start
        # The screenshot showed "Select Your Doctrine" with title ".tech-tree-header"
        try:
            # Check if we are on doctrine screen
            doctrine_header = page.locator(".tech-tree-header")
            if doctrine_header.is_visible(timeout=3000):
                 print("Doctrine selection screen detected. Selecting a doctrine...")
                 # Click the first card
                 page.click(".tech-tree-card")
                 # Click Start
                 page.click(".tech-tree-start-btn")
        except:
            print("No doctrine selection screen or interaction failed. Continuing...")

        # Wait for the main game UI to load
        try:
            # Wait for #wrapper to be visible, it contains the game UI
            page.wait_for_selector("#wrapper.hidden", state="hidden", timeout=10000) # Wait for hidden class to be removed?
            # Actually app.js toggles it. Let's wait for a known game element.
            # .part-panel or #parts-container or .part-category-btn are likely elements
            page.wait_for_selector(".part", timeout=10000)
        except:
             print("Timeout waiting for game parts. Taking screenshot.")
             page.screenshot(path="verification/game_start_timeout.png")
             # Even if timeout, let's check what we have

        # Verify Help Button ARIA label
        help_btn = page.locator(".help-btn").first
        if help_btn.count() > 0:
            aria_label = help_btn.get_attribute("aria-label")
            print(f"Help Button ARIA label: {aria_label}")
            if aria_label != "Help information":
                print("FAILURE: Help button missing expected aria-label")
        else:
             print("Help button not found on screen")

        # Verify Part Button ARIA label (e.g., Uranium Cell)
        part_btn = page.locator(".part").first
        if part_btn.count() > 0:
            aria_label = part_btn.get_attribute("aria-label")
            title = part_btn.get_attribute("title")
            print(f"Part Button Title: {title}")
            print(f"Part Button ARIA label: {aria_label}")

            if not aria_label or aria_label != title:
                 print("FAILURE: Part button aria-label does not match title")
        else:
            print("No part buttons found")

        # Verify Close Tooltip Button (Optional - might not be visible)
        # We can inspect the DOM for the template or try to trigger it
        # But for now, verifying the static buttons is good.

        page.screenshot(path="verification/aria_check.png")
        browser.close()

if __name__ == "__main__":
    verify_aria_labels()
