const { test, expect } = require("@playwright/test");

function uniqueEmail(prefix) {
  const now = Date.now();
  const rand = Math.floor(Math.random() * 100000);
  return `${prefix}+${now}${rand}@example.com`;
}

async function register(page, role) {
  await page.goto("/pages/register.html");

  if (role === "Investor") {
    await page.locator('.role-card[data-role="Investor"]').click();
  } else {
    await page.locator('.role-card[data-role="Farmer"]').click();
  }

  const email = uniqueEmail(role.toLowerCase());
  const password = "Aa1!testpass";

  await page.fill("#regFullName", `${role} Smoke User`);
  await page.selectOption("#regCountryCode", "+1");
  await page.fill("#regPhone", "5551234567");
  await page.fill("#regEmail", email);
  await page.fill("#regPassword", password);
  await page.fill("#regConfirmPassword", password);
  await page.check("#regTerms");

  await page.locator('#registerForm button[type="submit"]').click();

  return { email };
}

test("Investor registration redirects to investor dashboard", async ({ page }) => {
  await register(page, "Investor");
  await expect(page).toHaveURL(/investor-dashboard\.html(\?role=investor)?$/);
});

test("Farmer registration redirects to onboarding contact", async ({ page }) => {
  await register(page, "Farmer");
  await expect(page).toHaveURL(/onboarding-contact\.html$/);
});
