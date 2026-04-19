import { showToast, clearError, setError } from "./common.js";
import {
  saveOnboardingDocuments,
  getCurrentUserProfile,
  signOutUser,
  mapFirebaseError,
} from "./firebase.js";

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

  const LS_KEY = "agriinvest.onboarding.documents";

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

  async function loadInitial() {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      try {
        hydrate(JSON.parse(raw));
      } catch {
        localStorage.removeItem(LS_KEY);
      }
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

    localStorage.setItem(LS_KEY, JSON.stringify(data));

    try {
      await saveOnboardingDocuments(data);
      showToast(mode === "continue" ? "Documents saved. Continue to Review." : "Progress saved.");
      return true;
    } catch (error) {
      showToast(mapFirebaseError(error));
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
    try {
      await signOutUser();
    } catch {
      // always redirect
    }
    window.location.href = "index.html";
  });

  document.querySelectorAll(".onb-mobile-nav [data-go]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-go");
      if (target) window.location.href = target;
    });
  });

  loadInitial();
})();
