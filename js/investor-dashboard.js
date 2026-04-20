import { showToast } from "./common.js";
import {
  getCurrentUserProfile,
  getCurrentUser,
  getAllFarmerProfiles,
  getInvestmentIntentsForInvestor,
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
  const modal = document.getElementById("preferencesModal");
  const openPreferencesBtn = document.getElementById("openPreferencesBtn");
  const closePreferencesBtn = document.getElementById("closePreferencesBtn");
  const applyPreferencesBtn = document.getElementById("applyPreferencesBtn");
  const resetPreferencesBtn = document.getElementById("resetPreferencesBtn");
  const searchInput = document.getElementById("searchInput");
  const clearSearchBtn = document.getElementById("clearSearchBtn");
  const activeFiltersDisplay = document.getElementById("activeFiltersDisplay");
  const filterChips = document.getElementById("filterChips");
  const intentsInfo = document.getElementById("investorIntentsInfo");
  const intentsList = document.getElementById("investorIntentsList");
  const totalInvested = document.getElementById("investorTotalInvested");

  let allFarmerProfiles = [];
  let currentPreferences = loadPreferences();

  /**
   * Load preferences from localStorage
   */
  function loadPreferences() {
    const stored = localStorage.getItem("investorPreferences");
    return stored
      ? JSON.parse(stored)
      : {
          riskLevel: "",
          crops: [],
          regions: [],
          minAmount: 0,
          maxAmount: 500000,
        };
  }

  /**
   * Save preferences to localStorage
   */
  function savePreferences(prefs) {
    localStorage.setItem("investorPreferences", JSON.stringify(prefs));
    currentPreferences = prefs;
  }

  /**
   * Restore UI from preferences
   */
  function restoreUIFromPreferences() {
    // Risk level
    const riskRadio = document.querySelector(`input[name="riskLevel"][value="${currentPreferences.riskLevel}"]`);
    if (riskRadio) riskRadio.checked = true;

    // Crops
    document.querySelectorAll('input[name="crop"]').forEach((checkbox) => {
      checkbox.checked = currentPreferences.crops.includes(checkbox.value);
    });

    // Regions
    document.querySelectorAll('input[name="region"]').forEach((checkbox) => {
      checkbox.checked = currentPreferences.regions.includes(checkbox.value);
    });

    // Amount range
    document.getElementById("minAmount").value = currentPreferences.minAmount || "";
    document.getElementById("maxAmount").value = currentPreferences.maxAmount || "";
  }

  /**
   * Determine risk score category from multiple factors
   */
  function getRiskScoreCategory(profile) {
    const storedLevel = String(
      profile?.riskLevel || profile?.riskAssessment?.level || ""
    ).toLowerCase();
    if (storedLevel === "low" || storedLevel === "medium" || storedLevel === "high") {
      return storedLevel;
    }

    // Simple heuristic: can be enhanced with actual risk scoring
    const hasDebt = profile.existingLoans && profile.existingLoans > 0;
    const yearsExperience = 12; // placeholder
    const consistentYield = true; // placeholder

    if (hasDebt || yearsExperience < 5) return "high";
    if (yearsExperience > 10 && consistentYield) return "low";
    return "medium";
  }

  /**
   * Check if profile matches current preferences
   */
  function matchesPreferences(profile, searchTerm = "") {
    // Risk level filter
    if (currentPreferences.riskLevel) {
      const riskCategory = getRiskScoreCategory(profile);
      if (riskCategory !== currentPreferences.riskLevel) {
        return false;
      }
    }

    // Crop filter
    if (currentPreferences.crops.length > 0) {
      const cropLower = (profile.primaryCrop || "").toLowerCase();
      if (!currentPreferences.crops.some((c) => cropLower.includes(c))) {
        return false;
      }
    }

    // Region filter
    if (currentPreferences.regions.length > 0) {
      const stateLower = (profile.state || "").toLowerCase();
      if (!currentPreferences.regions.some((r) => stateLower.includes(r))) {
        return false;
      }
    }

    // Amount range filter (assuming farmer's funding need)
    const needAmount = profile.fundingNeed || 50000; // default
    if (needAmount < currentPreferences.minAmount || needAmount > currentPreferences.maxAmount) {
      return false;
    }

    // Search term filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      const searchableText = `${profile.fullName || ""} ${profile.farmName || ""} ${profile.district || ""} ${
        profile.state || ""
      } ${profile.primaryCrop || ""}`.toLowerCase();
      if (!searchableText.includes(searchLower)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Update filtered farmer list display
   */
  function updateFarmerDisplay() {
    const searchTerm = searchInput.value.trim();
    const filtered = allFarmerProfiles.filter((p) => matchesPreferences(p, searchTerm));

    profileInfo.textContent = filtered.length
      ? `Showing ${filtered.length} of ${allFarmerProfiles.length} farmer profiles.`
      : `No profiles match your filters (${allFarmerProfiles.length} total available).`;

    container.innerHTML = filtered.length
      ? filtered.map(profileCard).join("")
      : '<article class="card"><p>No profiles match your current filters. Try adjusting your preferences.</p></article>';
  }

  /**
   * Update active filters display
   */
  function updateActiveFiltersDisplay() {
    const chips = [];

    if (currentPreferences.riskLevel) {
      chips.push(`Risk: ${currentPreferences.riskLevel.charAt(0).toUpperCase() + currentPreferences.riskLevel.slice(1)}`);
    }

    if (currentPreferences.crops.length > 0) {
      chips.push(`Crops: ${currentPreferences.crops.join(", ")}`);
    }

    if (currentPreferences.regions.length > 0) {
      chips.push(`States: ${currentPreferences.regions.join(", ")}`);
    }

    const minVal = currentPreferences.minAmount || 0;
    const maxVal = currentPreferences.maxAmount || 500000;
    if (minVal > 0 || maxVal < 500000) {
      chips.push(`Amount: ₹${minVal.toLocaleString()}-${maxVal.toLocaleString()}`);
    }

    if (searchInput.value.trim()) {
      chips.push(`Search: "${searchInput.value.trim()}"`);
    }

    if (chips.length === 0) {
      activeFiltersDisplay.style.display = "none";
      filterChips.innerHTML = "";
    } else {
      activeFiltersDisplay.style.display = "block";
      filterChips.innerHTML = chips.map((chip) => `<span style="background:#e8f5e9; padding:4px 12px; border-radius:16px; font-size:12px;">${chip}</span>`).join("");
    }
  }

  function profileCard(profile) {
    const status = String(profile?.verificationStatus || "pending").toUpperCase();
    const name = profile.fullName || profile.farmName || "Farmer";
    const riskCategory = getRiskScoreCategory(profile);
    const riskColor = riskCategory === "low" ? "#4caf50" : riskCategory === "high" ? "#f44336" : "#ff9800";

    return `
      <article class="card" data-uid="${profile.uid}">
        <h3>${name}</h3>
        <p>Farm: ${profile.farmName || "-"}</p>
        <p>Location: ${profile.district || "-"}, ${profile.state || "-"}</p>
        <p>Crop: ${profile.primaryCrop || "-"}</p>
        <p>Acreage: ${profile.acreageHectare || "-"}</p>
        <p>Verification: ${status}</p>
        <p style="color:${riskColor}; font-weight:600;">Risk Level: ${riskCategory.toUpperCase()}</p>
        <p>Identity Doc: ${profile.identityDocName || "-"}</p>
        <p>Land Doc: ${profile.landDocName || "-"}</p>
        <div class="footer-actions" style="margin-top:10px;">
          <button class="btn btn-ghost" data-action="view" type="button">View Details</button>
          <button class="btn btn-primary" data-action="invest" type="button">Invest</button>
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

  function intentCard(intent) {
    const amount = Number(intent?.amount || 0);
    const created = intent?.createdAt?.toDate?.();
    const createdLabel = created ? created.toLocaleString() : "-";

    return `
      <article class="card">
        <h3>${intent?.farmerName || "Farmer"}</h3>
        <p>Amount: USD ${amount.toFixed(2)}</p>
        <p>Status: ${statusBadge(intent?.status)}</p>
        <p>Created: ${createdLabel}</p>
      </article>
    `;
  }

  async function loadMyInvestments() {
    try {
      const intents = await getInvestmentIntentsForInvestor();
      const total = intents.reduce((sum, row) => sum + Number(row?.amount || 0), 0);
      totalInvested.textContent = `Total Invested: USD ${total.toFixed(2)}`;

      intentsInfo.textContent = intents.length
        ? `You have ${intents.length} investment intent(s).`
        : "No investment intents yet. Invest in a farmer to get started.";

      intentsList.innerHTML = intents.length
        ? intents.map(intentCard).join("")
        : '<article class="card"><p>No investment intents found.</p></article>';
    } catch (error) {
      showToast(mapFirebaseError(error));
      intentsInfo.textContent = "Unable to load your investments.";
      intentsList.innerHTML = '<article class="card"><p>Unable to load intents right now.</p></article>';
    }
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
      allFarmerProfiles = await getAllFarmerProfiles();
      restoreUIFromPreferences();
      updateFarmerDisplay();
      updateActiveFiltersDisplay();
    } catch (error) {
      showToast(mapFirebaseError(error));
      profileInfo.textContent = "Unable to load farmer profiles.";
    }
  }

  /**
   * Modal and preference event listeners
   */
  openPreferencesBtn?.addEventListener("click", () => {
    restoreUIFromPreferences();
    modal.style.display = "block";
  });

  closePreferencesBtn?.addEventListener("click", () => {
    modal.style.display = "none";
  });

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });

  applyPreferencesBtn?.addEventListener("click", () => {
    // Collect preference values from form
    const riskLevel = document.querySelector('input[name="riskLevel"]:checked')?.value || "";
    const crops = Array.from(document.querySelectorAll('input[name="crop"]:checked')).map((cb) => cb.value);
    const regions = Array.from(document.querySelectorAll('input[name="region"]:checked')).map((cb) => cb.value);
    const minAmount = Number(document.getElementById("minAmount").value) || 0;
    const maxAmount = Number(document.getElementById("maxAmount").value) || 500000;

    // Save preferences
    savePreferences({
      riskLevel,
      crops,
      regions,
      minAmount,
      maxAmount,
    });

    // Update display
    updateFarmerDisplay();
    updateActiveFiltersDisplay();
    modal.style.display = "none";
    showToast("Preferences applied!");
  });

  resetPreferencesBtn?.addEventListener("click", () => {
    savePreferences({
      riskLevel: "",
      crops: [],
      regions: [],
      minAmount: 0,
      maxAmount: 500000,
    });
    restoreUIFromPreferences();
    searchInput.value = "";
    updateFarmerDisplay();
    updateActiveFiltersDisplay();
    showToast("Preferences reset!");
  });

  /**
   * Search functionality
   */
  searchInput?.addEventListener("input", () => {
    updateFarmerDisplay();
    updateActiveFiltersDisplay();
  });

  clearSearchBtn?.addEventListener("click", () => {
    searchInput.value = "";
    updateFarmerDisplay();
    updateActiveFiltersDisplay();
  });

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
        await loadMyInvestments();
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
      loadMyInvestments();
    }
  });
})();
