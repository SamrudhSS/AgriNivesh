import { showToast, isValidEmail, isValidPhone, clearError, setError } from "./common.js";
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

(function initOnboardingContact() {
  const form = document.getElementById("onboardingContactForm");
  if (!form) return;

  const primaryMobile = document.getElementById("primaryMobile");
  const primaryEmail = document.getElementById("primaryEmail");
  const secondaryContact = document.getElementById("secondaryContact");

  const saveBtn = document.getElementById("saveProgressBtn");
  const continueBtn = document.getElementById("continueBtn");
  const backBtn = document.getElementById("backBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  let saveOnboardingContactInfo = null;
  let getCurrentUserProfile = null;
  let getCurrentUser = null;
  let signOutUser = null;
  let mapFirebaseError = null;
  let autosaveTimer = null;

  const BASE_KEY = ONBOARDING_BASE_KEYS.contact;

  function getSelectedCommMethod() {
    const el = form.querySelector('input[name="commMethod"]:checked');
    return el ? el.value : "";
  }

  function setCommMethod(method) {
    const option = form.querySelector(`input[name="commMethod"][value="${method}"]`);
    if (option) option.checked = true;
  }

  function payloadFromForm() {
    return {
      primaryMobile: primaryMobile.value.trim(),
      primaryEmail: primaryEmail.value.trim(),
      secondaryContact: secondaryContact.value.trim(),
      commMethod: getSelectedCommMethod(),
      updatedAt: new Date().toISOString(),
    };
  }

  function validate() {
    [
      "primaryMobileError",
      "primaryEmailError",
      "secondaryContactError",
      "commMethodError",
    ].forEach(clearError);

    const data = payloadFromForm();
    let valid = true;

    if (!data.primaryMobile) {
      setError("primaryMobileError", "Mobile number is required");
      valid = false;
    } else if (!isValidPhone(data.primaryMobile)) {
      setError("primaryMobileError", "Enter a valid mobile number");
      valid = false;
    }

    if (!data.primaryEmail) {
      setError("primaryEmailError", "Email address is required");
      valid = false;
    } else if (!isValidEmail(data.primaryEmail)) {
      setError("primaryEmailError", "Enter a valid email address");
      valid = false;
    }

    if (data.secondaryContact && !isValidPhone(data.secondaryContact)) {
      setError("secondaryContactError", "Enter a valid secondary contact number");
      valid = false;
    }

    if (!data.commMethod) {
      setError("commMethodError", "Please choose a communication method");
      valid = false;
    }

    return { valid, data };
  }

  function loadDraft() {
    const draft = getScopedDraft(BASE_KEY);
    if (draft.primaryMobile) primaryMobile.value = draft.primaryMobile;
    if (draft.primaryEmail) primaryEmail.value = draft.primaryEmail;
    if (draft.secondaryContact) secondaryContact.value = draft.secondaryContact;
    if (draft.commMethod) setCommMethod(draft.commMethod);
  }

  async function initFirebaseServices() {
    try {
      const firebase = await import("./firebase.js");
      saveOnboardingContactInfo = firebase.saveOnboardingContactInfo;
      getCurrentUserProfile = firebase.getCurrentUserProfile;
      getCurrentUser = firebase.getCurrentUser;
      signOutUser = firebase.signOutUser;
      mapFirebaseError = firebase.mapFirebaseError;
    } catch {
      showToast("Cloud sync unavailable. You can still continue with local progress.");
    }
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
      // allow local mode if profile is not available
    }

    return true;
  }

  async function loadServerDraft() {
    if (!getCurrentUserProfile) return;

    try {
      const profile = await getCurrentUserProfile();
      const draft = profile?.onboarding?.step1ContactInfo;
      if (!draft) return;

      if (draft.primaryMobile) primaryMobile.value = draft.primaryMobile;
      if (draft.primaryEmail) primaryEmail.value = draft.primaryEmail;
      if (draft.secondaryContact) secondaryContact.value = draft.secondaryContact;
      if (draft.commMethod) setCommMethod(draft.commMethod);
    } catch {
      // local draft still available
    }
  }

  async function persist(data, mode) {
    setScopedDraft(BASE_KEY, data);

    if (!saveOnboardingContactInfo) {
      showToast(mode === "continue" ? "Saved locally. Continuing." : "Progress saved locally.");
      return true;
    }

    try {
      await saveOnboardingContactInfo(data);
      showToast(mode === "continue" ? "Contact info saved. Continue to Farm Location." : "Progress saved.");
      return true;
    } catch (error) {
      showToast(mapFirebaseError ? mapFirebaseError(error) : "Unable to save to cloud right now.");
      return false;
    }
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(async () => {
      const { valid, data } = validate();
      if (!valid) {
        return;
      }

      setScopedDraft(BASE_KEY, data);

      if (!saveOnboardingContactInfo) {
        return;
      }

      try {
        await saveOnboardingContactInfo(data);
      } catch {
        // keep silent on autosave errors; explicit save/continue will show feedback
      }
    }, 700);
  }

  [primaryMobile, primaryEmail, secondaryContact].forEach((el) => {
    el.addEventListener("input", () => {
      const map = {
        primaryMobile: "primaryMobileError",
        primaryEmail: "primaryEmailError",
        secondaryContact: "secondaryContactError",
      };
      clearError(map[el.id]);
      scheduleAutosave();
    });
  });

  form.querySelectorAll('input[name="commMethod"]').forEach((el) => {
    el.addEventListener("change", () => {
      clearError("commMethodError");
      scheduleAutosave();
    });
  });

  saveBtn.addEventListener("click", async () => {
    const { valid, data } = validate();
    if (!valid) return;

    saveBtn.disabled = true;
    const ok = await persist(data, "save");
    saveBtn.disabled = false;

    if (ok) {
      // saved successfully
    }
  });

  continueBtn.addEventListener("click", async () => {
    const { valid, data } = validate();
    if (!valid) return;

    continueBtn.disabled = true;
    const ok = await persist(data, "continue");
    continueBtn.disabled = false;

    if (ok) {
      window.location.href = "onboarding-location.html";
    }
  });

  backBtn.addEventListener("click", () => {
    window.location.href = "register.html";
  });

  logoutBtn?.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    if (signOutUser) {
      try {
        await signOutUser();
      } catch {
        // always redirect even if signout request fails
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

  loadDraft();
  initFirebaseServices().then(async () => {
    const allowed = await enforceFarmerAccess();
    if (!allowed) return;
    await loadServerDraft();
  });
})();
