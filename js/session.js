const ACTIVE_UID_KEY = "agriinvest.active.uid";
const ACTIVE_ROLE_KEY = "agriinvest.active.role";
const ROLE_BY_UID_PREFIX = "agriinvest.role.";

export const ONBOARDING_BASE_KEYS = {
  contact: "agriinvest.onboarding.contact",
  location: "agriinvest.onboarding.location",
  documents: "agriinvest.onboarding.documents",
  review: "agriinvest.onboarding.review",
};

function roleStorageKeyForUid(uid) {
  return `${ROLE_BY_UID_PREFIX}${uid}`;
}

export function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

export function routeByRole(role) {
  const normalized = normalizeRole(role);
  if (normalized === "admin") {
    window.location.href = "admin-dashboard.html";
    return;
  }

  if (normalized === "investor") {
    window.location.href = "investor-dashboard.html";
    return;
  }

  window.location.href = "onboarding-contact.html";
}

export function isInvestor(role) {
  return normalizeRole(role) === "investor";
}

export function isAdmin(role) {
  return normalizeRole(role) === "admin";
}

export function isFarmer(role) {
  const normalized = normalizeRole(role);
  return normalized === "farmer" || normalized === "";
}

export function setRoleForUid(uid, role) {
  if (!uid) return;
  const normalized = normalizeRole(role);
  if (!normalized) return;
  localStorage.setItem(roleStorageKeyForUid(uid), normalized);
}

export function getRoleForUid(uid) {
  if (!uid) return "";
  return localStorage.getItem(roleStorageKeyForUid(uid)) || "";
}

export function setActiveSession({ uid, role }) {
  if (uid) {
    localStorage.setItem(ACTIVE_UID_KEY, uid);
  }

  if (role) {
    const normalized = normalizeRole(role);
    localStorage.setItem(ACTIVE_ROLE_KEY, normalized);
    if (uid) {
      setRoleForUid(uid, normalized);
    }
  }
}

export function getActiveUid() {
  return localStorage.getItem(ACTIVE_UID_KEY) || "";
}

export function getActiveRole() {
  return localStorage.getItem(ACTIVE_ROLE_KEY) || "";
}

export function clearActiveSession() {
  localStorage.removeItem(ACTIVE_UID_KEY);
  localStorage.removeItem(ACTIVE_ROLE_KEY);
}

export function getScopedKey(baseKey, uid = getActiveUid()) {
  if (!uid) return "";
  return `${baseKey}:${uid}`;
}

export function getScopedDraft(baseKey, uid = getActiveUid()) {
  const key = getScopedKey(baseKey, uid);
  if (!key) return {};

  const raw = localStorage.getItem(key);
  if (!raw) return {};

  try {
    return JSON.parse(raw) || {};
  } catch {
    localStorage.removeItem(key);
    return {};
  }
}

export function setScopedDraft(baseKey, value, uid = getActiveUid()) {
  const key = getScopedKey(baseKey, uid);
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function clearLegacyOnboardingDrafts() {
  Object.values(ONBOARDING_BASE_KEYS).forEach((baseKey) => {
    localStorage.removeItem(baseKey);
  });
}
