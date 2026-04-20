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

(function initOnboardingReview() {
  const contactSummary = document.getElementById("summaryContact");
  const locationSummary = document.getElementById("summaryLocation");
  const documentsSummary = document.getElementById("summaryDocuments");

  const reviewConfirm = document.getElementById("reviewConfirm");
  const reviewConfirmError = "reviewConfirmError";

  const saveBtn = document.getElementById("saveReviewBtn");
  const submitBtn = document.getElementById("submitApplicationBtn");
  const backBtn = document.getElementById("reviewBackBtn");
  const logoutBtn = document.getElementById("logoutBtn");

  let saveOnboardingReview = null;
  let submitOnboardingApplication = null;
  let getCurrentUserProfile = null;
  let getCurrentUser = null;
  let signOutUser = null;
  let mapFirebaseError = null;

  const REVIEW_BASE_KEY = ONBOARDING_BASE_KEYS.review;
  const CONTACT_BASE_KEY = ONBOARDING_BASE_KEYS.contact;
  const LOCATION_BASE_KEY = ONBOARDING_BASE_KEYS.location;
  const DOCUMENTS_BASE_KEY = ONBOARDING_BASE_KEYS.documents;
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
  const REQUIRED_DOCUMENT_FIELDS = ["identityDocName", "landDocName"];

  function field(label, value) {
    return `<dt>${label}</dt><dd>${value || "-"}</dd>`;
  }

  function renderSections(s1 = {}, s2 = {}, s3 = {}) {

    contactSummary.innerHTML =
      field("Primary Mobile", s1.primaryMobile) +
      field("Primary Email", s1.primaryEmail) +
      field("Secondary Contact", s1.secondaryContact) +
      field("Communication", s1.commMethod);

    locationSummary.innerHTML =
      field("Farm Name", s2.farmName) +
      field("State", s2.state) +
      field("District", s2.district) +
      field("Primary Crop", s2.primaryCrop) +
      field("Acreage", s2.acreageHectare) +
      field("Coordinates", `${s2.latitude || "-"}, ${s2.longitude || "-"}`);

    documentsSummary.innerHTML = [
      s3.identityDocName ? `<li>Identity: ${s3.identityDocName}</li>` : "<li>Identity: Missing</li>",
      s3.landDocName ? `<li>Land: ${s3.landDocName}</li>` : "<li>Land: Missing</li>",
    ].join("");
  }

  function parseLocalJson(baseKey) {
    return getScopedDraft(baseKey);
  }

  function mergeWithNonEmpty(primary = {}, fallback = {}) {
    const merged = { ...fallback };

    Object.entries(primary).forEach(([key, value]) => {
      const isString = typeof value === "string";
      const hasValue = isString ? value.trim() !== "" : value !== null && value !== undefined;
      if (hasValue) {
        merged[key] = value;
      }
    });

    return merged;
  }

  function hasRequiredValues(data, fields) {
    return fields.every((field) => String(data?.[field] ?? "").trim() !== "");
  }

  function resolveMissingStep(s1, s2, s3) {
    if (!hasRequiredValues(s1, REQUIRED_CONTACT_FIELDS)) {
      return { target: "onboarding-contact.html", message: "Please complete Contact Details first." };
    }

    if (!hasRequiredValues(s2, REQUIRED_LOCATION_FIELDS)) {
      return { target: "onboarding-location.html", message: "Please complete Farm Location first." };
    }

    if (!hasRequiredValues(s3, REQUIRED_DOCUMENT_FIELDS)) {
      return { target: "onboarding-documents.html", message: "Please complete Documents first." };
    }

    return null;
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
    const localS1 = parseLocalJson(CONTACT_BASE_KEY);
    const localS2 = parseLocalJson(LOCATION_BASE_KEY);
    const localS3 = parseLocalJson(DOCUMENTS_BASE_KEY);

    const missingLocal = resolveMissingStep(localS1, localS2, localS3);
    if (!missingLocal) {
      return true;
    }

    if (getCurrentUserProfile) {
      try {
        const profile = await getCurrentUserProfile();
        const cloudS1 = profile?.onboarding?.step1ContactInfo || {};
        const cloudS2 = profile?.onboarding?.step2FarmLocation || {};
        const cloudS3 = profile?.onboarding?.step3Documents || {};

        const missingCloud = resolveMissingStep(cloudS1, cloudS2, cloudS3);
        if (!missingCloud) {
          return true;
        }

        showToast(missingCloud.message);
        window.location.href = missingCloud.target;
        return false;
      } catch {
        // fallback to local redirect below
      }
    }

    showToast(missingLocal.message);
    window.location.href = missingLocal.target;
    return false;
  }

  function renderFromLocalDrafts() {
    const s1 = parseLocalJson(CONTACT_BASE_KEY);
    const s2 = parseLocalJson(LOCATION_BASE_KEY);
    const s3 = parseLocalJson(DOCUMENTS_BASE_KEY);
    renderSections(s1, s2, s3);
  }

  function renderFromCloudProfile(profile) {
    const localS1 = parseLocalJson(CONTACT_BASE_KEY);
    const localS2 = parseLocalJson(LOCATION_BASE_KEY);
    const localS3 = parseLocalJson(DOCUMENTS_BASE_KEY);

    const cloudS1 = profile?.onboarding?.step1ContactInfo || {};
    const cloudS2 = profile?.onboarding?.step2FarmLocation || {};
    const cloudS3 = profile?.onboarding?.step3Documents || {};

    const s1 = mergeWithNonEmpty(cloudS1, localS1);
    const s2 = mergeWithNonEmpty(cloudS2, localS2);
    const s3 = mergeWithNonEmpty(cloudS3, localS3);

    renderSections(s1, s2, s3);
  }

  async function initFirebaseServices() {
    try {
      const firebase = await import("./firebase.js");
      saveOnboardingReview = firebase.saveOnboardingReview;
      submitOnboardingApplication = firebase.submitOnboardingApplication;
      getCurrentUserProfile = firebase.getCurrentUserProfile;
      getCurrentUser = firebase.getCurrentUser;
      signOutUser = firebase.signOutUser;
      mapFirebaseError = firebase.mapFirebaseError;
    } catch {
      showToast("Cloud sync unavailable. You can still navigate locally.");
    }
  }

  async function load() {
    renderFromLocalDrafts();

    if (!getCurrentUserProfile) return;

    try {
      const profile = await getCurrentUserProfile();
      renderFromCloudProfile(profile);
    } catch (error) {
      showToast(mapFirebaseError ? mapFirebaseError(error) : "Showing locally saved data.");
    }
  }

  async function saveDraft() {
    try {
      const payload = {
        declarationChecked: reviewConfirm.checked,
        updatedAt: new Date().toISOString(),
      };
      setScopedDraft(REVIEW_BASE_KEY, payload);
      if (saveOnboardingReview) {
        await saveOnboardingReview(payload);
        showToast("Review state saved.");
      } else {
        showToast("Review state saved locally.");
      }
    } catch (error) {
      showToast(mapFirebaseError ? mapFirebaseError(error) : "Unable to save cloud draft.");
    }
  }

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    await saveDraft();
    saveBtn.disabled = false;
  });

  submitBtn.addEventListener("click", async () => {
    clearError(reviewConfirmError);
    if (!reviewConfirm.checked) {
      setError(reviewConfirmError, "Please confirm before submitting.");
      return;
    }

    submitBtn.disabled = true;
    try {
      if (saveOnboardingReview) {
        await saveOnboardingReview({ declarationChecked: true, updatedAt: new Date().toISOString() });
      }
      if (submitOnboardingApplication) {
        await submitOnboardingApplication();
      }
      showToast("Application submitted successfully.");
      setTimeout(() => {
        window.location.href = "verification-dashboard.html";
      }, 900);
    } catch (error) {
      showToast(mapFirebaseError ? mapFirebaseError(error) : "Unable to submit cloud application.");
    } finally {
      submitBtn.disabled = false;
    }
  });

  backBtn.addEventListener("click", () => {
    window.location.href = "onboarding-documents.html";
  });

  logoutBtn?.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    if (signOutUser) {
      try {
        await signOutUser();
      } catch {
        // continue redirect
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

  reviewConfirm.addEventListener("change", () => clearError(reviewConfirmError));

  reviewConfirm.checked = !!parseLocalJson(REVIEW_BASE_KEY).declarationChecked;

  initFirebaseServices().then(async () => {
    const isFarmerAllowed = await enforceFarmerAccess();
    if (!isFarmerAllowed) return;
    const allowed = await enforceRouteGuard();
    if (!allowed) return;
    await load();
  });
})();
