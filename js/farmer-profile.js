import { showToast } from "./common.js";
import {
  getCurrentUserProfile,
  getCurrentUser,
  getFarmerProfileByUid,
  createInvestmentIntent,
  signOutUser,
  mapFirebaseError,
} from "./firebase.js";
import {
  setActiveSession,
  getActiveRole,
  isInvestor,
  isAdmin,
  routeByRole,
  clearActiveSession,
} from "./session.js";

(function initFarmerProfilePage() {
  const logoutBtn = document.getElementById("logoutBtn");
  const farmerName = document.getElementById("farmerName");
  const farmerSummary = document.getElementById("farmerSummary");
  const farmerStatus = document.getElementById("farmerStatus");
  const detailContact = document.getElementById("detailContact");
  const detailFarm = document.getElementById("detailFarm");
  const detailDocs = document.getElementById("detailDocs");
  const investAmount = document.getElementById("investAmount");
  const investBtn = document.getElementById("investBtn");
  const investInfo = document.getElementById("investInfo");

  let selectedFarmerUid = "";

  function row(label, value) {
    return `<dt>${label}</dt><dd>${value || "-"}</dd>`;
  }

  async function enforceInvestorAccess() {
    const hintRole = new URLSearchParams(window.location.search).get("role");
    const hintedInvestor = String(hintRole || "").toLowerCase() === "investor";

    try {
      const uid = getCurrentUser()?.uid;
      const profile = await getCurrentUserProfile();
      const role = profile?.role || getActiveRole() || (hintedInvestor ? "investor" : "");

      if (uid) {
        setActiveSession({ uid, role });
      }

      if (isAdmin(role)) {
        window.location.href = "admin-dashboard.html";
        return false;
      }

      if (!isInvestor(role)) {
        routeByRole(role || "Farmer");
        return false;
      }

      return true;
    } catch {
      window.location.href = "index.html";
      return false;
    }
  }

  async function loadFarmer() {
    selectedFarmerUid = new URLSearchParams(window.location.search).get("uid") || "";
    if (!selectedFarmerUid) {
      farmerName.textContent = "Farmer not selected";
      farmerSummary.textContent = "Open this page from the investor dashboard farmer list.";
      investBtn.disabled = true;
      return;
    }

    try {
      const profile = await getFarmerProfileByUid(selectedFarmerUid);
      farmerName.textContent = profile.fullName || profile.farmName || "Farmer";
      farmerSummary.textContent = `${profile.farmName || "Farm"} in ${profile.district || "-"}, ${profile.state || "-"}`;
      farmerStatus.textContent = `Status: ${String(profile.verificationStatus || "pending").toUpperCase()}`;

      detailContact.innerHTML =
        row("Email", profile.email) +
        row("Mobile", profile.primaryMobile) +
        row("Preferred Communication", profile.commMethod);

      detailFarm.innerHTML =
        row("Farm Name", profile.farmName) +
        row("State", profile.state) +
        row("District", profile.district) +
        row("Primary Crop", profile.primaryCrop) +
        row("Acreage", profile.acreageHectare) +
        row("Latitude", profile.latitude) +
        row("Longitude", profile.longitude);

      detailDocs.innerHTML =
        row("Identity Document", profile.identityDocName) +
        row("Land Document", profile.landDocName);
    } catch (error) {
      showToast(mapFirebaseError(error));
      farmerName.textContent = "Unable to load farmer profile";
      farmerSummary.textContent = "Please go back to investor dashboard and try again.";
      investBtn.disabled = true;
    }
  }

  investBtn?.addEventListener("click", async () => {
    const amount = Number(investAmount?.value || 0);
    if (!selectedFarmerUid) {
      showToast("Select a farmer first.");
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("Enter a valid investment amount.");
      return;
    }

    investBtn.disabled = true;
    try {
      await createInvestmentIntent(selectedFarmerUid, amount);
      investInfo.textContent = `Investment intent created for USD ${amount.toFixed(2)}.`;
      showToast("Investment intent submitted.");
      investAmount.value = "";
    } catch (error) {
      showToast(mapFirebaseError(error));
    } finally {
      investBtn.disabled = false;
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    try {
      await signOutUser();
    } catch {
      // route anyway
    }
    clearActiveSession();
    window.location.href = "index.html";
  });

  enforceInvestorAccess().then((ok) => {
    if (ok) {
      loadFarmer();
    }
  });
})();
