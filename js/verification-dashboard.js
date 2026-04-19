import { showToast } from "./common.js";
import { getCurrentUserProfile, signOutUser, mapFirebaseError } from "./firebase.js";

(function initDashboard() {
  const welcome = document.getElementById("dashWelcome");
  const status = document.getElementById("dashStatus");
  const dashContact = document.getElementById("dashContact");
  const dashFarm = document.getElementById("dashFarm");
  const dashDocs = document.getElementById("dashDocs");
  const logoutBtn = document.getElementById("logoutBtn");

  function field(label, value) {
    return `<dt>${label}</dt><dd>${value || "-"}</dd>`;
  }

  async function load() {
    try {
      const profile = await getCurrentUserProfile();
      const s1 = profile?.onboarding?.step1ContactInfo || {};
      const s2 = profile?.onboarding?.step2FarmLocation || {};
      const s3 = profile?.onboarding?.step3Documents || {};

      welcome.textContent = `Welcome ${profile.fullName || profile.email || "Farmer"}. Review your submitted onboarding details below.`;
      const verificationStatus = profile.verificationStatus || "pending";
      status.textContent = `Status: ${verificationStatus.toUpperCase()}`;

      dashContact.innerHTML =
        field("Email", profile.email) +
        field("Primary Mobile", s1.primaryMobile) +
        field("Communication", s1.commMethod);

      dashFarm.innerHTML =
        field("Farm Name", s2.farmName) +
        field("State", s2.state) +
        field("District", s2.district) +
        field("Primary Crop", s2.primaryCrop);

      dashDocs.innerHTML = [
        `<li>Identity: ${s3.identityDocName || "-"}</li>`,
        `<li>Land: ${s3.landDocName || "-"}</li>`,
        `<li>Onboarding Status: ${profile?.onboarding?.status || "draft"}</li>`,
      ].join("");
    } catch (error) {
      showToast(mapFirebaseError(error));
      welcome.textContent = "Unable to load dashboard data. Please login again.";
    }
  }

  logoutBtn.addEventListener("click", async () => {
    try {
      await signOutUser();
    } catch {
      // route anyway
    }
    window.location.href = "index.html";
  });

  load();
})();
