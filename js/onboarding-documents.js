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
import { extractDocumentText } from "./ocr-api.js";

(function initOnboardingDocuments() {
  const form = document.getElementById("onboardingDocumentsForm");
  if (!form) return;

  const identityDoc = document.getElementById("identityDoc");
  const landDoc = document.getElementById("landDoc");
  const identityDocName = document.getElementById("identityDocName");
  const landDocName = document.getElementById("landDocName");

  const saveBtn = document.getElementById("saveDocumentsBtn");
  const extractBtn = document.getElementById("documentsExtractBtn");
  const continueBtn = document.getElementById("documentsContinueBtn");
  const backBtn = document.getElementById("documentsBackBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const extractionStatus = document.getElementById("extractionStatus");
  const extractionStatusCard = document.getElementById("documentExtractionStatus");

  // OCR progress elements
  const ocrProgressWrap = document.getElementById("ocrProgressWrap");
  const ocrProgressLabel = document.getElementById("ocrProgressLabel");
  const ocrProgressFill = document.getElementById("ocrProgressFill");

  // OCR result elements — identity
  const identityOcrResult = document.getElementById("identityOcrResult");
  const identityOcrType = document.getElementById("identityOcrType");
  const identityOcrConf = document.getElementById("identityOcrConf");
  const identityOcrKeywords = document.getElementById("identityOcrKeywords");
  const identityOcrText = document.getElementById("identityOcrText");
  const identityOcrWordCount = document.getElementById("identityOcrWordCount");

  // OCR result elements — land
  const landOcrResult = document.getElementById("landOcrResult");
  const landOcrType = document.getElementById("landOcrType");
  const landOcrConf = document.getElementById("landOcrConf");
  const landOcrKeywords = document.getElementById("landOcrKeywords");
  const landOcrText = document.getElementById("landOcrText");
  const landOcrWordCount = document.getElementById("landOcrWordCount");

  let saveOnboardingDocuments = null;
  let getCurrentUserProfile = null;
  let getCurrentUser = null;
  let signOutUser = null;
  let mapFirebaseError = null;
  let ocrExtraction = {};

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
    const result = {
      identityDocName: identityDoc.files[0]?.name || identityDocName.dataset.saved || "",
      landDocName: landDoc.files[0]?.name || landDocName.dataset.saved || "",
      updatedAt: new Date().toISOString(),
    };

    if (ocrExtraction && Object.keys(ocrExtraction).length > 0) {
      result.ocrExtraction = ocrExtraction;
    }

    return result;
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

    ocrExtraction = data.ocrExtraction || {};
    renderExtractionSummary();
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

  function formatConfidence(value) {
    if (typeof value !== "number") {
      return "unknown";
    }
    return `${Math.round(value * 100)}%`;
  }

  function getConfidenceClass(value) {
    if (typeof value !== "number") return "";
    if (value >= 0.7) return "conf-high";
    if (value >= 0.4) return "conf-medium";
    return "conf-low";
  }

  function setExtractionStatus(message, isError = false) {
    if (!extractionStatus || !extractionStatusCard) return;
    extractionStatusCard.hidden = false;
    extractionStatus.textContent = message;
    extractionStatus.style.color = isError ? "#c0392b" : "#1a7f37";
  }

  function clearStatus() {
    if (!extractionStatus || !extractionStatusCard) return;
    extractionStatus.textContent = "";
    extractionStatus.style.color = "";
  }

  function showOcrProgress(show) {
    if (ocrProgressWrap) ocrProgressWrap.hidden = !show;
  }

  function updateOcrProgress(status, progress) {
    if (ocrProgressLabel) {
      const friendlyStatus = {
        "loading tesseract core": "Loading OCR engine…",
        "initializing tesseract": "Initializing engine…",
        "loading language traineddata": "Loading language data…",
        "initializing api": "Preparing recognition…",
        "recognizing text": "Scanning document…",
      };
      ocrProgressLabel.textContent = friendlyStatus[status] || status || "Processing…";
    }
    if (ocrProgressFill) {
      ocrProgressFill.style.width = `${progress}%`;
    }
  }

  function renderKeywordPills(container, keywords) {
    if (!container || !keywords || keywords.length === 0) {
      if (container) container.innerHTML = '<span class="ocr-no-keywords">No keywords detected</span>';
      return;
    }
    container.innerHTML = keywords
      .map((kw) => `<span class="ocr-keyword-pill">${kw}</span>`)
      .join("");
  }

  function highlightKeywordsInText(text, keywords) {
    if (!text) return "<em>(No text extracted)</em>";
    if (!keywords || keywords.length === 0) {
      return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    let escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const sortedKw = [...keywords].sort((a, b) => b.length - a.length);
    const pattern = new RegExp(`(${sortedKw.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    escaped = escaped.replace(pattern, '<mark class="ocr-highlight">$1</mark>');
    return escaped;
  }

  function renderDocResult(block, typeEl, confEl, keywordsEl, textEl, wordCountEl, data) {
    if (!block || !data) return;

    block.hidden = false;
    if (typeEl) typeEl.textContent = data.docType || "Unknown";
    if (confEl) {
      confEl.textContent = formatConfidence(data.confidence);
      confEl.className = `ocr-confidence ${getConfidenceClass(data.confidence)}`;
    }
    renderKeywordPills(keywordsEl, data.keywordsFound || []);

    // Word & line count
    const raw = data.ocrText || "";
    const words = raw.split(/\s+/).filter(Boolean).length;
    const lines = raw.split("\n").filter((l) => l.trim()).length;
    if (wordCountEl) {
      wordCountEl.textContent = `${words} words · ${lines} lines`;
    }

    // Render full text with keyword highlighting
    if (textEl) {
      const display = raw.length > 2000 ? raw.slice(0, 2000) + "\n… (truncated)" : raw;
      textEl.innerHTML = display
        ? highlightKeywordsInText(display, data.keywordsFound)
        : "<em>(No text extracted)</em>";
    }
  }

  function renderExtractionSummary() {
    if (!extractionStatus || !extractionStatusCard) return;

    if (!ocrExtraction.identityDoc && !ocrExtraction.landDoc) {
      extractionStatusCard.hidden = false;
      extractionStatus.textContent = "No OCR extraction has been performed yet.";
      extractionStatus.style.color = "";

      // Hide result blocks
      if (identityOcrResult) identityOcrResult.hidden = true;
      if (landOcrResult) landOcrResult.hidden = true;
      return;
    }

    extractionStatusCard.hidden = false;

    // Render identity doc results
    if (ocrExtraction.identityDoc) {
      renderDocResult(
        identityOcrResult,
        identityOcrType,
        identityOcrConf,
        identityOcrKeywords,
        identityOcrText,
        identityOcrWordCount,
        ocrExtraction.identityDoc
      );
    }

    // Render land doc results
    if (ocrExtraction.landDoc) {
      renderDocResult(
        landOcrResult,
        landOcrType,
        landOcrConf,
        landOcrKeywords,
        landOcrText,
        landOcrWordCount,
        ocrExtraction.landDoc
      );
    }

    // Update the status text
    const identityLabel = ocrExtraction.identityDoc?.docType || "Pending";
    const landLabel = ocrExtraction.landDoc?.docType || "Pending";
    extractionStatus.innerHTML = `
      <strong>Identity:</strong> ${identityLabel} (${formatConfidence(ocrExtraction.identityDoc?.confidence)}) &nbsp;|&nbsp;
      <strong>Land:</strong> ${landLabel} (${formatConfidence(ocrExtraction.landDoc?.confidence)})
    `;
    extractionStatus.style.color = "";
  }

  function buildOcrResult(response, fileName) {
    return {
      fileName,
      docType: response?.doc_type || response?.detected_type || "unknown",
      confidence: typeof response?.confidence === "number" ? response.confidence : 0,
      fields: response?.extracted_data || {},
      ocrText: response?.ocr_text || "",
      keywordsFound: response?.keywords_found || [],
      extractedAt: new Date().toISOString(),
    };
  }

  async function performOcrExtraction(allowFallback = true) {
    clearStatus();
    const identityFile = identityDoc.files[0];
    const landFile = landDoc.files[0];

    if (!identityFile && !ocrExtraction.identityDoc) {
      throw new Error("Please select the identity document for OCR extraction.");
    }

    if (!landFile && !ocrExtraction.landDoc) {
      throw new Error("Please select the land document for OCR extraction.");
    }

    try {
      showOcrProgress(true);

      if (identityFile) {
        setExtractionStatus("Extracting identity document…");
        updateOcrProgress("Scanning identity document…", 0);

        const identityResponse = await extractDocumentText(identityFile, "identity", (p) => {
          updateOcrProgress(p.status, p.progress);
        });
        ocrExtraction.identityDoc = buildOcrResult(identityResponse, identityFile.name);
      }

      if (landFile) {
        setExtractionStatus("Extracting land document…");
        updateOcrProgress("Scanning land document…", 0);

        const landResponse = await extractDocumentText(landFile, "land", (p) => {
          updateOcrProgress(p.status, p.progress);
        });
        ocrExtraction.landDoc = buildOcrResult(landResponse, landFile.name);
      }

      showOcrProgress(false);
      renderExtractionSummary();
      setExtractionStatus("OCR extraction completed successfully.");
      return true;
    } catch (error) {
      showOcrProgress(false);
      const message = error?.message || "OCR extraction failed.";
      if (allowFallback) {
        setExtractionStatus("OCR extraction failed. Progress saved locally.", true);
        showToast(message);
        return false;
      }
      throw error;
    }
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

  async function persist(mode, options = { ensureExtraction: false }) {
    const { valid } = validate();
    if (!valid) return false;

    if (options.ensureExtraction) {
      await performOcrExtraction(true);
    }

    const data = payload();
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

  extractBtn?.addEventListener("click", async () => {
    extractBtn.disabled = true;
    saveBtn.disabled = true;
    continueBtn.disabled = true;

    try {
      await performOcrExtraction(false);
      const data = payload();
      setScopedDraft(BASE_KEY, data);
      if (saveOnboardingDocuments) {
        await saveOnboardingDocuments(data);
      }
      showToast("OCR extraction completed and saved.");
    } catch (error) {
      showToast(error?.message || "Unable to extract document data.");
    } finally {
      extractBtn.disabled = false;
      saveBtn.disabled = false;
      continueBtn.disabled = false;
    }
  });

  continueBtn.addEventListener("click", async () => {
    continueBtn.disabled = true;
    const ok = await persist("continue", { ensureExtraction: true });
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
