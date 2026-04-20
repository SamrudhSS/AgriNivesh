import { showToast, clearError, setError } from "./common.js";
import {
  ONBOARDING_BASE_KEYS,
  getScopedDraft,
  setScopedDraft,
  setActiveSession,
  getActiveRole,
  isAdmin,
  isInvestor,
  routeByRole,
  clearActiveSession,
} from "./session.js";

(function initOnboardingDocuments() {
  const form = document.getElementById("onboardingDocumentsForm");
  if (!form) return;

  const identityDoc = document.getElementById("identityDoc");
  const landDoc = document.getElementById("landDoc");
  const identityDocName = document.getElementById("identityDocName");
  const landDocName = document.getElementById("landDocName");

  const saveBtn = document.getElementById("saveDocumentsBtn");
  const continueBtn = document.getElementById("documentsContinueBtn");
  const backBtn = document.getElementById("documentsBackBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  let saveOnboardingDocuments = null;
  let getCurrentUserProfile = null;
  let getCurrentUser = null;
  let signOutUser = null;
  let mapFirebaseError = null;

  const BASE_KEY = ONBOARDING_BASE_KEYS.documents;
  const CONTACT_BASE_KEY = ONBOARDING_BASE_KEYS.contact;
  const LOCATION_BASE_KEY = ONBOARDING_BASE_KEYS.location;
  const REQUIRED_CONTACT_FIELDS = ["primaryMobile", "primaryEmail", "commMethod"];
  const REQUIRED_LOCATION_FIELDS = [
    "farmName",
    "state",
    "district",
    "primaryCrop",
    "acreageHectare",
    "latitude",
    "longitude",
  ];

  function parseLocalJson(baseKey) {
    return getScopedDraft(baseKey);
  }

  function hasRequiredValues(data, fields) {
    return fields.every((field) => String(data?.[field] ?? "").trim() !== "");
  }

  function guardStep1(data) {
    return hasRequiredValues(data, REQUIRED_CONTACT_FIELDS);
  }

  function guardStep2(data) {
    return hasRequiredValues(data, REQUIRED_LOCATION_FIELDS);
  }

  async function enforceFarmerAccess() {
    const cachedRole = getActiveRole();
    if (isInvestor(cachedRole) || isAdmin(cachedRole)) {
      routeByRole(cachedRole);
      return false;
    }

    if (!getCurrentUserProfile) {
      return true;
    }

    try {
      const profile = await getCurrentUserProfile();
      const role = profile?.role || cachedRole;
      const uid = getCurrentUser?.()?.uid;
      if (uid) {
        setActiveSession({ uid, role });
      }

      if (isInvestor(role) || isAdmin(role)) {
        routeByRole(role);
        return false;
      }
    } catch {
      // allow local mode
    }

    return true;
  }

  async function enforceRouteGuard() {
    const localContact = parseLocalJson(CONTACT_BASE_KEY);
    const localLocation = parseLocalJson(LOCATION_BASE_KEY);

    const step1Done = guardStep1(localContact);
    const step2Done = guardStep2(localLocation);

    if (step1Done && step2Done) {
      return true;
    }

    if (getCurrentUserProfile) {
      try {
        const profile = await getCurrentUserProfile();
        const cloudContact = profile?.onboarding?.step1ContactInfo || {};
        const cloudLocation = profile?.onboarding?.step2FarmLocation || {};

        const cloudStep1Done = guardStep1(cloudContact);
        const cloudStep2Done = guardStep2(cloudLocation);

        if (cloudStep1Done && cloudStep2Done) {
          return true;
        }

        if (!cloudStep1Done) {
          showToast("Please complete Contact Details first.");
          window.location.href = "onboarding-contact.html";
          return false;
        }

        showToast("Please complete Farm Location first.");
        window.location.href = "onboarding-location.html";
        return false;
      } catch {
        // fallback to local redirect logic below
      }
    }

    if (!step1Done) {
      showToast("Please complete Contact Details first.");
      window.location.href = "onboarding-contact.html";
      return false;
    }

    showToast("Please complete Farm Location first.");
    window.location.href = "onboarding-location.html";
    return false;
  }

  function payload() {
    return {
      identityDocName: identityDoc.files[0]?.name || identityDocName.dataset.saved || "",
      landDocName: landDoc.files[0]?.name || landDocName.dataset.saved || "",
      updatedAt: new Date().toISOString(),
    };
  }

  function hydrate(data) {
    if (!data) return;
    if (data.identityDocName) {
      identityDocName.textContent = data.identityDocName;
      identityDocName.dataset.saved = data.identityDocName;
    }
    if (data.landDocName) {
      landDocName.textContent = data.landDocName;
      landDocName.dataset.saved = data.landDocName;
    }
  }

  function validate() {
    clearError("identityDocError");
    clearError("landDocError");

    const data = payload();
    let valid = true;

    if (!data.identityDocName) {
      setError("identityDocError", "Identity document is required");
      valid = false;
    }

    if (!data.landDocName) {
      setError("landDocError", "Land document is required");
      valid = false;
    }

    return { valid, data };
  }

  async function initFirebaseServices() {
    try {
      const firebase = await import("./firebase.js");
      saveOnboardingDocuments = firebase.saveOnboardingDocuments;
      getCurrentUserProfile = firebase.getCurrentUserProfile;
      getCurrentUser = firebase.getCurrentUser;
      signOutUser = firebase.signOutUser;
      mapFirebaseError = firebase.mapFirebaseError;
    } catch {
      showToast("Cloud sync unavailable. You can still continue with local progress.");
    }
  }

  async function loadInitial() {
    hydrate(parseLocalJson(BASE_KEY));

    if (!getCurrentUserProfile) {
      return;
    }

    try {
      const profile = await getCurrentUserProfile();
      if (profile?.onboarding?.step3Documents) {
        hydrate(profile.onboarding.step3Documents);
      }
    } catch {
      // local draft only
    }
  }

  async function persist(mode) {
    const { valid, data } = validate();
    if (!valid) return false;

    setScopedDraft(BASE_KEY, data);

    if (!saveOnboardingDocuments) {
      showToast(mode === "continue" ? "Saved locally. Continuing." : "Progress saved locally.");
      return true;
    }

    try {
      await saveOnboardingDocuments(data);
      showToast(mode === "continue" ? "Documents saved. Continue to Review." : "Progress saved.");
      return true;
    } catch (error) {
      showToast(mapFirebaseError ? mapFirebaseError(error) : "Unable to save to cloud right now.");
      return false;
    }
  }

  identityDoc.addEventListener("change", () => {
    const file = identityDoc.files[0];
    if (file) {
      identityDocName.textContent = file.name;
      identityDocName.dataset.saved = file.name;
      clearError("identityDocError");
    }
  });

  landDoc.addEventListener("change", () => {
    const file = landDoc.files[0];
    if (file) {
      landDocName.textContent = file.name;
      landDocName.dataset.saved = file.name;
      clearError("landDocError");
    }
  });

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    await persist("save");
    saveBtn.disabled = false;
  });

  continueBtn.addEventListener("click", async () => {
    continueBtn.disabled = true;
    const ok = await persist("continue");
    continueBtn.disabled = false;
    if (ok) window.location.href = "onboarding-review.html";
  });

  backBtn.addEventListener("click", () => {
    window.location.href = "onboarding-location.html";
  });

  logoutBtn?.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    if (signOutUser) {
      try {
        await signOutUser();
      } catch {
        // always redirect
      }
    }
    clearActiveSession();
    window.location.href = "index.html";
  });

  document.querySelectorAll(".onb-mobile-nav [data-go]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-go");
      if (target) window.location.href = target;
    });
  });

  initFirebaseServices().then(async () => {
    const isFarmerAllowed = await enforceFarmerAccess();
    if (!isFarmerAllowed) return;
    const allowed = await enforceRouteGuard();
    if (!allowed) return;
    await loadInitial();
  });
})();
