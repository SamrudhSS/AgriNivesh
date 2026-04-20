from playwright.sync_api import sync_playwright
import time
import random

BASE_URL = "http://127.0.0.1:5500"


def unique_email(prefix: str) -> str:
    return f"{prefix}+{int(time.time() * 1000)}{random.randint(1000, 9999)}@example.com"


def run_registration(page, role: str) -> dict:
    page.goto(f"{BASE_URL}/pages/register.html", wait_until="domcontentloaded")

    if role.lower() == "investor":
        page.locator('.role-card[data-role="Investor"]').click()
    else:
        page.locator('.role-card[data-role="Farmer"]').click()

    email = unique_email(role.lower())
    password = "Aa1!testpass"

    page.fill("#regFullName", f"{role} Smoke User")
    page.select_option("#regCountryCode", "+1")
    page.fill("#regPhone", "5551234567")
    page.fill("#regEmail", email)
    page.fill("#regPassword", password)
    page.fill("#regConfirmPassword", password)
    page.check("#regTerms")

    page.locator('#registerForm button[type="submit"]').click()
    page.wait_for_timeout(4500)

    field_errors = {
        "regFullNameError": page.locator("#regFullNameError").inner_text().strip(),
        "regPhoneError": page.locator("#regPhoneError").inner_text().strip(),
        "regEmailError": page.locator("#regEmailError").inner_text().strip(),
        "regPasswordError": page.locator("#regPasswordError").inner_text().strip(),
        "regConfirmPasswordError": page.locator("#regConfirmPasswordError").inner_text().strip(),
        "regTermsError": page.locator("#regTermsError").inner_text().strip(),
    }

    toast_text = ""
    toast = page.locator(".toast")
    if toast.count() > 0:
      toast_text = toast.first.inner_text().strip()

    return {
        "role": role,
        "email": email,
        "url": page.url,
        "toast": toast_text,
        "errors": field_errors,
    }


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        investor = run_registration(page, "Investor")

        page.goto(f"{BASE_URL}/pages/index.html", wait_until="domcontentloaded")

        farmer = run_registration(page, "Farmer")

        investor_ok = investor["url"].endswith("/pages/investor-dashboard.html?role=investor") or investor["url"].endswith("/pages/investor-dashboard.html")
        farmer_ok = farmer["url"].endswith("/pages/onboarding-contact.html")

        print("RESULT investor:", investor)
        print("RESULT farmer:", farmer)
        print("PASS investor:", investor_ok)
        print("PASS farmer:", farmer_ok)

        context.close()
        browser.close()

        return 0 if investor_ok and farmer_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
