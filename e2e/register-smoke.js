const { chromium } = require("playwright");

function uniqueEmail(prefix) {
  const now = Date.now();
  const rand = Math.floor(Math.random() * 100000);
  return `${prefix}+${now}${rand}@example.com`;
}

async function runRegistration(page, role) {
  await page.goto("http://127.0.0.1:5500/pages/register.html", {
    waitUntil: "domcontentloaded",
  });

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
  await page.waitForTimeout(2500);

  return {
    role,
    email,
    url: page.url(),
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];

  try {
    results.push(await runRegistration(page, "Investor"));
    await page.goto("http://127.0.0.1:5500/pages/index.html", { waitUntil: "domcontentloaded" });
    results.push(await runRegistration(page, "Farmer"));

    const investorPass = /\/pages\/investor-dashboard\.html(\?role=investor)?$/.test(results[0].url);
    const farmerPass = /\/pages\/onboarding-contact\.html$/.test(results[1].url);

    console.log("SMOKE_RESULTS=" + JSON.stringify({ results, investorPass, farmerPass }));

    if (!investorPass || !farmerPass) {
      process.exit(1);
    }
  } catch (error) {
    console.error("SMOKE_ERROR=", error?.message || String(error));
    process.exit(2);
  } finally {
    await context.close();
    await browser.close();
  }
})();
