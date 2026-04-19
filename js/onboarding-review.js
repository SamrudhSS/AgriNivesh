import { showToast, clearError, setError } from "./common.js";
import {
  saveOnboardingReview,
  submitOnboardingApplication,
  getCurrentUserProfile,
  signOutUser,
  mapFirebaseError,
} from "./firebase.js";

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

  const LS_REVIEW = "agriinvest.onboarding.review";

  function field(label, value) {
    return `<dt>${label}</dt><dd>${value || "-"}</dd>`;
  }

  function render(profile) {
    const s1 = profile?.onboarding?.step1ContactInfo || {};
    const s2 = profile?.onboarding?.step2FarmLocation || {};
    const s3 = profile?.onboarding?.step3Documents || {};

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

  async function load() {
    try {
      const profile = await getCurrentUserProfile();
      render(profile);
    } catch (error) {
      showToast(mapFirebaseError(error));
    }
  }

  async function saveDraft() {
    try {
      const payload = {
        declarationChecked: reviewConfirm.checked,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(LS_REVIEW, JSON.stringify(payload));
      await saveOnboardingReview(payload);
      showToast("Review state saved.");
    } catch (error) {
      showToast(mapFirebaseError(error));
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
      await saveOnboardingReview({ declarationChecked: true, updatedAt: new Date().toISOString() });
      await submitOnboardingApplication();
      showToast("Application submitted successfully.");
      setTimeout(() => {
        window.location.href = "verification-dashboard.html";
      }, 900);
    } catch (error) {
      showToast(mapFirebaseError(error));
    } finally {
      submitBtn.disabled = false;
    }
  });

  backBtn.addEventListener("click", () => {
    window.location.href = "onboarding-documents.html";
  });

  logoutBtn?.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    try {
      await signOutUser();
    } catch {
      // continue redirect
    }
    window.location.href = "index.html";
  });

  document.querySelectorAll(".onb-mobile-nav [data-go]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-go");
      if (target) window.location.href = target;
    });
  });

  reviewConfirm.addEventListener("change", () => clearError(reviewConfirmError));

  const reviewDraft = localStorage.getItem(LS_REVIEW);
  if (reviewDraft) {
    try {
      reviewConfirm.checked = !!JSON.parse(reviewDraft).declarationChecked;
    } catch {
      localStorage.removeItem(LS_REVIEW);
    }
  }

  load();
})();
