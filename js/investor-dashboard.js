import { showToast } from "./common.js";
import {
  getCurrentUserProfile,
  getCurrentUser,
  getAllFarmerProfiles,
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

(function initInvestorDashboard() {
  const logoutBtn = document.getElementById("logoutBtn");
  const profileInfo = document.getElementById("investorProfileInfo");
  const container = document.getElementById("investorFarmerProfiles");

  function profileCard(profile) {
    const status = String(profile?.verificationStatus || "pending").toUpperCase();
    const name = profile.fullName || profile.farmName || "Farmer";

    return `
      <article class="card" data-uid="${profile.uid}">
        <h3>${name}</h3>
        <p>Farm: ${profile.farmName || "-"}</p>
        <p>Location: ${profile.district || "-"}, ${profile.state || "-"}</p>
        <p>Crop: ${profile.primaryCrop || "-"}</p>
        <p>Acreage: ${profile.acreageHectare || "-"}</p>
        <p>Verification: ${status}</p>
        <p>Identity Doc: ${profile.identityDocName || "-"}</p>
        <p>Land Doc: ${profile.landDocName || "-"}</p>
        <div class="footer-actions" style="margin-top:10px;">
          <button class="btn btn-ghost" data-action="view" type="button">View Details</button>
          <button class="btn btn-primary" data-action="invest" type="button">Invest</button>
        </div>
      </article>
    `;
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
      if (hintedInvestor) {
        const uid = getCurrentUser()?.uid;
        if (uid) {
          setActiveSession({ uid, role: "investor" });
          return true;
        }
      }
      window.location.href = "index.html";
      return false;
    }
  }

  async function loadFarmerProfiles() {
    try {
      const profiles = await getAllFarmerProfiles();
      profileInfo.textContent = profiles.length
        ? `Showing ${profiles.length} farmer profiles visible to investors.`
        : "No farmer profiles found yet.";

      if (!profiles.length) {
        container.innerHTML = '<article class="card"><p>No profiles available.</p></article>';
        return;
      }

      container.innerHTML = profiles.map(profileCard).join("");
    } catch (error) {
      showToast(mapFirebaseError(error));
      profileInfo.textContent = "Unable to load farmer profiles.";
    }
  }

  container?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const card = button.closest("[data-uid]");
    const farmerUid = card?.getAttribute("data-uid");
    if (!farmerUid) {
      return;
    }

    const action = button.getAttribute("data-action");
    if (action === "view") {
      window.location.href = `farmer-profile.html?uid=${encodeURIComponent(farmerUid)}`;
      return;
    }

    if (action === "invest") {
      const raw = window.prompt("Enter investment amount in USD:", "1000");
      if (!raw) {
        return;
      }

      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount <= 0) {
        showToast("Enter a valid investment amount.");
        return;
      }

      button.disabled = true;
      try {
        await createInvestmentIntent(farmerUid, amount);
        showToast(`Investment intent created for USD ${amount.toFixed(2)}.`);
      } catch (error) {
        showToast(mapFirebaseError(error));
      } finally {
        button.disabled = false;
      }
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    try {
      await signOutUser();
    } catch {
      // ignore and redirect
    }
    clearActiveSession();
    window.location.href = "index.html";
  });

  enforceInvestorAccess().then((ok) => {
    if (ok) {
      loadFarmerProfiles();
    }
  });
})();
