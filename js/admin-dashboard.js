import { showToast } from "./common.js";
import {
  getCurrentUser,
  getCurrentUserProfile,
  getSubmittedFarmerApplications,
  updateFarmerVerificationStatus,
  signOutUser,
  mapFirebaseError,
} from "./firebase.js";
import {
  setActiveSession,
  getActiveRole,
  isAdmin,
  routeByRole,
  clearActiveSession,
} from "./session.js";

(function initAdminDashboard() {
  const welcome = document.getElementById("adminWelcome");
  const queueCount = document.getElementById("queueCount");
  const queue = document.getElementById("adminQueue");
  const logoutBtn = document.getElementById("logoutBtn");

  function cardHtml(item) {
    const name = item.fullName || item.email || item.uid;
    const farm = item?.onboarding?.step2FarmLocation?.farmName || "-";
    const district = item?.onboarding?.step2FarmLocation?.district || "-";
    const submitted = item?.onboarding?.submittedAt ? "Submitted" : "Pending";

    return `
      <article class="card" data-uid="${item.uid}">
        <h3>${name}</h3>
        <p>Email: ${item.email || "-"}</p>
        <p>Farm: ${farm}</p>
        <p>District: ${district}</p>
        <p>Application: ${submitted}</p>
        <div class="footer-actions">
          <button class="btn btn-primary" data-action="approve" type="button">Tick Approve</button>
          <button class="btn btn-ghost" data-action="reject" type="button">Wrong Reject</button>
        </div>
      </article>
    `;
  }

  async function enforceAdminAccess() {
    const hintRole = new URLSearchParams(window.location.search).get("role");
    const hintedAdmin = String(hintRole || "").toLowerCase() === "admin";

    try {
      const profile = await getCurrentUserProfile();
      const uid = getCurrentUser()?.uid;
      const role = profile?.role || getActiveRole() || (hintedAdmin ? "admin" : "");

      if (uid) {
        setActiveSession({ uid, role });
      }

      if (!isAdmin(role)) {
        routeByRole(role || "Farmer");
        return false;
      }

      return true;
    } catch {
      if (hintedAdmin) {
        const uid = getCurrentUser()?.uid;
        if (uid) {
          setActiveSession({ uid, role: "admin" });
          return true;
        }
      }

      window.location.href = "index.html";
      return false;
    }
  }

  async function loadQueue() {
    try {
      const rows = await getSubmittedFarmerApplications();
      queueCount.textContent = `Queue: ${rows.length}`;
      welcome.textContent = rows.length
        ? "Review pending farmer applications with tick or wrong mark."
        : "No submitted farmer applications are waiting for verification.";

      if (!rows.length) {
        queue.innerHTML = '<article class="card"><p>No pending submissions.</p></article>';
        return;
      }

      queue.innerHTML = rows.map(cardHtml).join("");
    } catch (error) {
      showToast(mapFirebaseError(error));
      welcome.textContent = "Unable to load verification queue.";
    }
  }

  queue.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const card = button.closest("[data-uid]");
    const uid = card?.getAttribute("data-uid");
    if (!uid) return;

    const action = button.getAttribute("data-action");
    const status = action === "approve" ? "verified" : "rejected";

    button.disabled = true;
    try {
      await updateFarmerVerificationStatus(uid, status);
      showToast(action === "approve" ? "Marked as verified." : "Marked as rejected.");
      await loadQueue();
    } catch (error) {
      showToast(mapFirebaseError(error));
    } finally {
      button.disabled = false;
    }
  });

  logoutBtn.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    try {
      await signOutUser();
    } catch {
      // route anyway
    }
    clearActiveSession();
    window.location.href = "index.html";
  });

  enforceAdminAccess().then((ok) => {
    if (ok) {
      loadQueue();
    }
  });
})();
