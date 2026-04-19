import { showToast, isValidEmail, isValidPhone, clearError, setError } from "./common.js";
import {
  saveOnboardingContactInfo,
  getCurrentUserProfile,
  signOutUser,
  mapFirebaseError,
} from "./firebase.js";

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

  const LS_KEY = "agriinvest.onboarding.contact";

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
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;

    try {
      const draft = JSON.parse(raw);
      if (draft.primaryMobile) primaryMobile.value = draft.primaryMobile;
      if (draft.primaryEmail) primaryEmail.value = draft.primaryEmail;
      if (draft.secondaryContact) secondaryContact.value = draft.secondaryContact;
      if (draft.commMethod) setCommMethod(draft.commMethod);
    } catch {
      localStorage.removeItem(LS_KEY);
    }
  }

  async function loadServerDraft() {
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
    localStorage.setItem(LS_KEY, JSON.stringify(data));

    try {
      await saveOnboardingContactInfo(data);
      showToast(mode === "continue" ? "Contact info saved. Continue to Farm Location." : "Progress saved.");
      return true;
    } catch (error) {
      showToast(mapFirebaseError(error));
      return false;
    }
  }

  [primaryMobile, primaryEmail, secondaryContact].forEach((el) => {
    el.addEventListener("input", () => {
      const map = {
        primaryMobile: "primaryMobileError",
        primaryEmail: "primaryEmailError",
        secondaryContact: "secondaryContactError",
      };
      clearError(map[el.id]);
    });
  });

  form.querySelectorAll('input[name="commMethod"]').forEach((el) => {
    el.addEventListener("change", () => clearError("commMethodError"));
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
    try {
      await signOutUser();
    } catch {
      // always redirect even if signout request fails
    }
    window.location.href = "index.html";
  });

  document.querySelectorAll(".onb-mobile-nav [data-go]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-go");
      if (target) window.location.href = target;
    });
  });

  loadDraft();
  loadServerDraft();
})();
