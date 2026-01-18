
from playwright.sync_api import sync_playwright, expect

def test_accessibility_labels():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use http://0.0.0.0:8080 as per memory
        page = browser.new_page()

        # Navigate to game page directly to test static HTML if possible,
        # or root if needed. The server serves public/ at root.
        # Let's try navigating to game.html directly first.
        try:
            page.goto("http://0.0.0.0:8080/pages/game.html")
            print("Navigated to game.html")

            # 1. Verify Game Page Buttons
            print("Verifying Game Page Buttons...")

            # Check #user_account_btn
            user_btn = page.locator("#user_account_btn")
            expect(user_btn).to_have_attribute("aria-label", "User Account")
            print("Verified #user_account_btn aria-label")

            # Check #fullscreen_toggle
            fs_btn = page.locator("#fullscreen_toggle")
            expect(fs_btn).to_have_attribute("aria-label", "Toggle Fullscreen")
            print("Verified #fullscreen_toggle aria-label")

            # Check #settings_btn
            settings_btn = page.locator("#settings_btn")
            expect(settings_btn).to_have_attribute("aria-label", "Settings")
            print("Verified #settings_btn aria-label")

            # Check #splash_close_btn
            close_btn = page.locator("#splash_close_btn")
            expect(close_btn).to_have_attribute("aria-label", "Exit to Title")
            print("Verified #splash_close_btn aria-label")

            # Take a screenshot of game.html buttons
            page.screenshot(path="verification/game_page_accessibility.png")
            print("Screenshot taken for game.html")

            # 2. Verify Reactor Page Buttons
            print("Verifying Reactor Page Buttons...")
            page.goto("http://0.0.0.0:8080/pages/reactor.html")

            # Check #reactor_copy_paste_toggle
            toggle_btn = page.locator("#reactor_copy_paste_toggle")
            expect(toggle_btn).to_have_attribute("aria-label", "Expand or Collapse Toolbar")
            print("Verified #reactor_copy_paste_toggle aria-label")

            # Check #reactor_deselect_btn
            deselect_btn = page.locator("#reactor_deselect_btn")
            expect(deselect_btn).to_have_attribute("aria-label", "Deselect Selected Part")
            print("Verified #reactor_deselect_btn aria-label")

            # Check #reactor_sell_all_btn
            sell_btn = page.locator("#reactor_sell_all_btn")
            expect(sell_btn).to_have_attribute("aria-label", "Sell All Parts")
            print("Verified #reactor_sell_all_btn aria-label")

             # Check #settings_btn_mobile
            settings_mobile = page.locator("#settings_btn_mobile")
            expect(settings_mobile).to_have_attribute("aria-label", "Settings")
            print("Verified #settings_btn_mobile aria-label")

            # Take a screenshot of reactor.html buttons
            page.screenshot(path="verification/reactor_page_accessibility.png")
            print("Screenshot taken for reactor.html")

            print("All accessibility checks passed!")

        except Exception as e:
            print(f"Test failed: {e}")
            # Take screenshot on failure
            page.screenshot(path="verification/failure.png")
        finally:
            browser.close()

if __name__ == "__main__":
    test_accessibility_labels()
