import { showToast } from "./common.js";
import {
  getCurrentUser,
  getCurrentUserProfile,
  getSubmittedFarmerApplications,
  updateFarmerVerificationStatus,
  getInvestmentIntentsForAdmin,
  updateInvestmentIntentStatus,
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
  const intentInfo = document.getElementById("adminIntentInfo");
  const intentQueue = document.getElementById("adminIntentQueue");
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

  function statusBadge(status) {
    const value = String(status || "pending").toLowerCase();
    if (value === "funded") {
      return '<span style="display:inline-block; padding:4px 10px; border-radius:999px; background:#e3f2fd; color:#1565c0; font-size:12px;">FUNDED</span>';
    }
    if (value === "approved") {
      return '<span style="display:inline-block; padding:4px 10px; border-radius:999px; background:#e8f5e9; color:#2e7d32; font-size:12px;">APPROVED</span>';
    }
    return '<span style="display:inline-block; padding:4px 10px; border-radius:999px; background:#fff3e0; color:#ef6c00; font-size:12px;">PENDING</span>';
  }

  function intentCardHtml(item) {
    const amount = Number(item?.amount || 0);
    const status = String(item?.status || "pending").toLowerCase();
    const created = item?.createdAt?.toDate?.();
    const createdLabel = created ? created.toLocaleString() : "-";

    return `
      <article class="card" data-intent-id="${item.id}">
        <h3>Investor: ${item.investorName || "-"}</h3>
        <p>Farmer: ${item.farmerName || "-"}</p>
        <p>Amount: USD ${amount.toFixed(2)}</p>
        <p>Status: ${statusBadge(status)}</p>
        <p>Created: ${createdLabel}</p>
        <div class="footer-actions" style="margin-top:10px;">
          <button class="btn btn-primary" data-intent-action="approve" type="button" ${status === "approved" || status === "funded" ? "disabled" : ""}>Approve</button>
          <button class="btn btn-ghost" data-intent-action="fund" type="button" ${status === "funded" ? "disabled" : ""}>Mark Funded</button>
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

  async function loadInvestmentIntents() {
    try {
      const rows = await getInvestmentIntentsForAdmin();
      const pendingCount = rows.filter((row) => String(row?.status || "pending").toLowerCase() === "pending").length;
      intentInfo.textContent = rows.length
        ? `Showing ${rows.length} investment intent(s). Pending approvals: ${pendingCount}.`
        : "No investment intents found.";

      intentQueue.innerHTML = rows.length
        ? rows.map(intentCardHtml).join("")
        : '<article class="card"><p>No investment intents to manage.</p></article>';
    } catch (error) {
      showToast(mapFirebaseError(error));
      intentInfo.textContent = "Unable to load investment intents.";
      intentQueue.innerHTML = '<article class="card"><p>Unable to load intents right now.</p></article>';
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

  intentQueue?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-intent-action]");
    if (!button) return;

    const card = button.closest("[data-intent-id]");
    const intentId = card?.getAttribute("data-intent-id");
    if (!intentId) return;

    const action = button.getAttribute("data-intent-action");
    const nextStatus = action === "fund" ? "funded" : "approved";

    button.disabled = true;
    try {
      await updateInvestmentIntentStatus(intentId, nextStatus);
      showToast(nextStatus === "funded" ? "Intent marked as funded." : "Intent approved.");
      await loadInvestmentIntents();
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
      loadInvestmentIntents();
    }
  });
})();
