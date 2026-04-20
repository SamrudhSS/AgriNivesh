import { showToast } from "./common.js";
import {
  getCurrentUserProfile,
  subscribeToCurrentUserProfile,
  getCurrentUser,
  signOutUser,
  mapFirebaseError,
} from "./firebase.js";
import {
  setActiveSession,
  getActiveRole,
  isAdmin,
  isInvestor,
  routeByRole,
  clearActiveSession,
} from "./session.js";

(function initDashboard() {
  const welcome = document.getElementById("dashWelcome");
  const status = document.getElementById("dashStatus");
  const dashContact = document.getElementById("dashContact");
  const dashFarm = document.getElementById("dashFarm");
  const dashDocs = document.getElementById("dashDocs");
  const logoutBtn = document.getElementById("logoutBtn");
  let unsubscribeProfile = null;

  function field(label, value) {
    return `<dt>${label}</dt><dd>${value || "-"}</dd>`;
  }

  function verificationLabel(statusValue) {
    const value = String(statusValue || "pending").toLowerCase();
    if (value === "verified") {
      return "Verified by admin";
    }
    if (value === "rejected") {
      return "Rejected by admin";
    }
    return "Waiting for verification from admin";
  }

  function renderDashboard(profile = {}) {
    const s1 = profile?.onboarding?.step1ContactInfo || {};
    const s2 = profile?.onboarding?.step2FarmLocation || {};
    const s3 = profile?.onboarding?.step3Documents || {};
    const fp = profile?.farmerProfile || {};

    welcome.textContent = `Welcome ${profile.fullName || profile.email || "Farmer"}. Review your submitted onboarding details below.`;
    const verificationStatus = profile.verificationStatus || "pending";
    status.textContent = `Status: ${verificationLabel(verificationStatus)}`;

    dashContact.innerHTML =
      field("Email", profile.email) +
      field("Primary Mobile", fp.primaryMobile || s1.primaryMobile) +
      field("Communication", fp.commMethod || s1.commMethod);

    dashFarm.innerHTML =
      field("Farm Name", fp.farmName || s2.farmName) +
      field("State", fp.state || s2.state) +
      field("District", fp.district || s2.district) +
      field("Primary Crop", fp.primaryCrop || s2.primaryCrop);

    dashDocs.innerHTML = [
      `<li>Identity: ${fp.identityDocName || s3.identityDocName || "-"}</li>`,
      `<li>Land: ${fp.landDocName || s3.landDocName || "-"}</li>`,
      `<li>Onboarding Status: ${profile?.onboarding?.status || "draft"}</li>`,
    ].join("");
  }

  async function load() {
    try {
      const profile = await getCurrentUserProfile();
      const uid = getCurrentUser()?.uid;
      const role = profile?.role || getActiveRole();

      if (uid) {
        setActiveSession({ uid, role });
      }

      if (isAdmin(role) || isInvestor(role)) {
        routeByRole(role);
        return;
      }

      renderDashboard(profile);

      unsubscribeProfile = await subscribeToCurrentUserProfile(
        (liveProfile) => {
          renderDashboard(liveProfile);
        },
        (error) => {
          showToast(mapFirebaseError(error));
        }
      );
    } catch (error) {
      showToast(mapFirebaseError(error));
      welcome.textContent = "Unable to load dashboard data. Please login again.";
    }
  }

  window.addEventListener("beforeunload", () => {
    if (typeof unsubscribeProfile === "function") {
      unsubscribeProfile();
    }
  });

  logoutBtn.addEventListener("click", async () => {
    try {
      await signOutUser();
    } catch {
      // route anyway
    }
    clearActiveSession();
    window.location.href = "index.html";
  });

  load();
})();
