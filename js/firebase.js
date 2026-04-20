import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  serverTimestamp,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

function assertConfig(config) {
  const values = Object.values(config || {});
  const hasPlaceholder = values.some(
    (v) => typeof v === "string" && v.startsWith("REPLACE_WITH_")
  );

  if (hasPlaceholder) {
    throw new Error(
      "Firebase is not configured. Update js/firebase-config.js with your Firebase project values."
    );
  }
}

assertConfig(firebaseConfig);

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function scoreHistoryRisk(userData = {}, docs = {}) {
  const onboarding = userData?.onboarding || {};
  const location = onboarding?.step2FarmLocation || {};

  const yearsFarming = toNumber(
    location?.yearsFarming ?? userData?.yearsFarming ?? userData?.farmerProfile?.yearsFarming,
    -1
  );

  let risk = 60;
  if (yearsFarming >= 10) {
    risk = 25;
  } else if (yearsFarming >= 5) {
    risk = 40;
  } else if (yearsFarming >= 2) {
    risk = 55;
  } else if (yearsFarming >= 0) {
    risk = 70;
  }

  const hasIdentity = Boolean(docs?.identityDocName || userData?.farmerProfile?.identityDocName);
  const hasLand = Boolean(docs?.landDocName || userData?.farmerProfile?.landDocName);
  if (hasIdentity && hasLand) {
    risk -= 10;
  }

  return clamp(Math.round(risk), 10, 95);
}

function scoreLandQualityRisk(userData = {}) {
  const onboarding = userData?.onboarding || {};
  const location = onboarding?.step2FarmLocation || {};
  const fp = userData?.farmerProfile || {};

  const acreage = toNumber(location?.acreageHectare ?? fp?.acreageHectare, 0);
  const soilType = String(location?.soilType || fp?.soilType || "").toLowerCase();
  const irrigationType = String(location?.irrigationType || fp?.irrigationType || "").toLowerCase();

  let risk = 55;
  if (acreage >= 8) {
    risk -= 15;
  } else if (acreage >= 3) {
    risk -= 8;
  } else if (acreage > 0 && acreage < 1) {
    risk += 8;
  }

  if (soilType.includes("alluvial") || soilType.includes("black")) {
    risk -= 8;
  }
  if (soilType.includes("sandy") || soilType.includes("rocky")) {
    risk += 10;
  }

  if (
    irrigationType.includes("drip") ||
    irrigationType.includes("sprinkler") ||
    irrigationType.includes("canal")
  ) {
    risk -= 6;
  }
  if (irrigationType.includes("rain")) {
    risk += 8;
  }

  return clamp(Math.round(risk), 10, 95);
}

function scoreCropTypeRisk(cropRaw = "") {
  const crop = String(cropRaw || "").toLowerCase();
  if (!crop) {
    return 55;
  }

  const riskByCrop = {
    wheat: 45,
    rice: 50,
    paddy: 50,
    sugarcane: 42,
    cotton: 62,
    maize: 52,
    corn: 52,
    groundnut: 55,
    soybean: 58,
    millets: 48,
    millet: 48,
    pulses: 50,
    vegetables: 60,
    vegetable: 60,
  };

  for (const [name, risk] of Object.entries(riskByCrop)) {
    if (crop.includes(name)) {
      return risk;
    }
  }

  return 55;
}

function scoreWeatherRisk(stateRaw = "") {
  const state = String(stateRaw || "").toLowerCase();

  const riskByState = {
    goa: 48,
    maharashtra: 58,
    punjab: 44,
    haryana: 46,
    rajasthan: 64,
    karnataka: 54,
    telangana: 57,
    gujarat: 56,
    "uttar pradesh": 52,
  };

  return riskByState[state] ?? 55;
}

function riskLevelFromScore(score) {
  if (score <= 39) {
    return "low";
  }
  if (score <= 64) {
    return "medium";
  }
  return "high";
}

function calculateStaticRiskScore(userData = {}) {
  const onboarding = userData?.onboarding || {};
  const location = onboarding?.step2FarmLocation || {};
  const docs = onboarding?.step3Documents || {};

  const history = scoreHistoryRisk(userData, docs);
  const landQuality = scoreLandQualityRisk(userData);
  const cropType = scoreCropTypeRisk(location?.primaryCrop || userData?.farmerProfile?.primaryCrop);
  const weather = scoreWeatherRisk(location?.state || userData?.farmerProfile?.state);

  const score = Math.round(
    history * 0.30 +
      landQuality * 0.30 +
      cropType * 0.20 +
      weather * 0.20
  );

  const knownSignals = [
    Boolean(location?.primaryCrop),
    Boolean(location?.state),
    Boolean(location?.acreageHectare),
    Boolean(docs?.identityDocName),
    Boolean(docs?.landDocName),
  ].filter(Boolean).length;

  const confidence = knownSignals >= 4 ? "high" : knownSignals >= 2 ? "medium" : "low";

  return {
    score,
    level: riskLevelFromScore(score),
    confidence,
    version: "static-v1",
    updatedAt: new Date().toISOString(),
    breakdown: {
      history,
      landQuality,
      cropType,
      weather,
    },
  };
}

function normalizeIntentStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value === "initiated") {
    return "pending";
  }
  if (value === "approved") {
    return "approved";
  }
  if (value === "funded") {
    return "funded";
  }
  return "pending";
}

function buildFarmerProfileFromUserData(userData = {}) {
  const onboarding = userData?.onboarding || {};
  const contact = onboarding?.step1ContactInfo || {};
  const location = onboarding?.step2FarmLocation || {};
  const docs = onboarding?.step3Documents || {};
  const risk = calculateStaticRiskScore(userData);

  return {
    fullName: userData?.fullName || "",
    email: userData?.email || "",
    primaryMobile: contact?.primaryMobile || "",
    commMethod: contact?.commMethod || "",
    farmName: location?.farmName || "",
    state: location?.state || "",
    district: location?.district || "",
    primaryCrop: location?.primaryCrop || "",
    acreageHectare: location?.acreageHectare || "",
    latitude: location?.latitude || "",
    longitude: location?.longitude || "",
    identityDocName: docs?.identityDocName || "",
    landDocName: docs?.landDocName || "",
    riskScore: risk.score,
    riskLevel: risk.level,
    riskConfidence: risk.confidence,
    riskBreakdown: risk.breakdown,
    riskEngineVersion: risk.version,
    riskUpdatedAt: risk.updatedAt,
    onboardingStatus: onboarding?.status || "draft",
    verificationStatus: userData?.verificationStatus || "pending",
  };
}

async function waitForCurrentUser(timeoutMs = 5000) {
  if (auth.currentUser) {
    return auth.currentUser;
  }

  return new Promise((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        unsubscribe();
        resolve(auth.currentUser || null);
      }
    }, timeoutMs);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(user || null);
    });
  });
}

function mapFirebaseError(error) {
  const code = error?.code || "";
  const map = {
    "auth/email-already-in-use": "This email is already registered.",
    "auth/invalid-email": "Invalid email address.",
    "auth/weak-password": "Password is too weak.",
    "auth/user-not-found": "No account found for this email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Invalid login credentials.",
    "auth/popup-closed-by-user": "Sign-in popup was closed before completion.",
    "auth/network-request-failed": "Network error. Check your internet connection.",
  };

  return map[code] || error?.message || "Something went wrong. Please try again.";
}

export async function registerWithEmailProfile(payload) {
  const {
    email,
    password,
    fullName,
    phone,
    countryCode,
    role,
    termsAccepted,
  } = payload;

  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const { uid } = credential.user;

  await setDoc(
    doc(db, "users", uid),
    {
      uid,
      fullName,
      email,
      phone,
      countryCode,
      role,
      termsAccepted,
      authProvider: "password",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return credential.user;
}

export async function loginWithEmail(identity, password, rememberMe) {
  await setPersistence(
    auth,
    rememberMe ? browserLocalPersistence : browserSessionPersistence
  );

  const credential = await signInWithEmailAndPassword(auth, identity, password);
  return credential.user;
}

export async function signInWithGoogle(options = {}) {
  const { role, termsAccepted } = options;
  const credential = await signInWithPopup(auth, googleProvider);
  const user = credential.user;

  const profile = {
    uid: user.uid,
    fullName: user.displayName || "",
    email: user.email || "",
    authProvider: "google",
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };

  if (role) {
    profile.role = role;
  }

  if (typeof termsAccepted === "boolean") {
    profile.termsAccepted = termsAccepted;
  }

  await setDoc(
    doc(db, "users", user.uid),
    profile,
    { merge: true }
  );

  return user;
}

export async function sendResetEmail(email) {
  await sendPasswordResetEmail(auth, email);
}

export async function signOutUser() {
  await signOut(auth);
}

export async function saveOnboardingContactInfo(contactInfo) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Please log in before saving onboarding progress.");
  }

  await setDoc(
    doc(db, "users", user.uid),
    {
      onboarding: {
        step1ContactInfo: {
          ...contactInfo,
          updatedAt: serverTimestamp(),
        },
        currentStep: 1,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function saveOnboardingFarmLocation(farmLocationInfo) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Please log in before saving onboarding progress.");
  }

  await setDoc(
    doc(db, "users", user.uid),
    {
      onboarding: {
        step2FarmLocation: {
          ...farmLocationInfo,
          updatedAt: serverTimestamp(),
        },
        currentStep: 2,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function saveOnboardingDocuments(documentInfo) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Please log in before saving onboarding progress.");
  }

  await setDoc(
    doc(db, "users", user.uid),
    {
      onboarding: {
        step3Documents: {
          ...documentInfo,
          updatedAt: serverTimestamp(),
        },
        currentStep: 3,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function saveOnboardingReview(reviewInfo) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Please log in before saving onboarding progress.");
  }

  await setDoc(
    doc(db, "users", user.uid),
    {
      onboarding: {
        step4Review: {
          ...reviewInfo,
          updatedAt: serverTimestamp(),
        },
        currentStep: 4,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function submitOnboardingApplication() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Please log in before submitting onboarding.");
  }

  const userSnap = await getDoc(doc(db, "users", user.uid));
  const userData = userSnap.exists() ? userSnap.data() : {};
  const farmerProfile = buildFarmerProfileFromUserData({
    ...userData,
    verificationStatus: "pending",
    onboarding: {
      ...(userData?.onboarding || {}),
      status: "submitted",
    },
  });

  await setDoc(
    doc(db, "users", user.uid),
    {
      onboarding: {
        status: "submitted",
        submittedAt: serverTimestamp(),
        currentStep: 4,
      },
      verificationStatus: "pending",
      farmerProfile,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getCurrentUserProfile() {
  const user = await waitForCurrentUser();
  if (!user) {
    throw new Error("Please log in to load profile data.");
  }

  const snap = await getDoc(doc(db, "users", user.uid));
  return snap.exists() ? snap.data() : {};
}

export async function subscribeToCurrentUserProfile(onData, onError) {
  const user = await waitForCurrentUser();
  if (!user) {
    throw new Error("Please log in to load profile data.");
  }

  const userRef = doc(db, "users", user.uid);
  return onSnapshot(
    userRef,
    (snap) => {
      onData(snap.exists() ? snap.data() : {});
    },
    (error) => {
      if (typeof onError === "function") {
        onError(error);
      }
    }
  );
}

export async function getSubmittedFarmerApplications() {
  const usersRef = collection(db, "users");
  const q = query(
    usersRef,
    where("role", "==", "Farmer"),
    where("onboarding.status", "==", "submitted")
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

export async function updateFarmerVerificationStatus(targetUid, verificationStatus) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Please log in as admin before verifying farmers.");
  }

  const targetSnap = await getDoc(doc(db, "users", targetUid));
  const targetData = targetSnap.exists() ? targetSnap.data() : {};
  const farmerProfile = buildFarmerProfileFromUserData({
    ...targetData,
    verificationStatus,
    onboarding: {
      ...(targetData?.onboarding || {}),
      status: verificationStatus,
    },
  });

  await setDoc(
    doc(db, "users", targetUid),
    {
      verificationStatus,
      farmerProfile,
      onboarding: {
        status: verificationStatus,
        reviewedBy: user.uid,
        reviewedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getAllFarmerProfiles() {
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("role", "==", "Farmer"));
  const snap = await getDocs(q);

  return snap.docs.map((d) => {
    const data = d.data() || {};
    const profile = data?.farmerProfile || buildFarmerProfileFromUserData(data);
    const computedRisk = calculateStaticRiskScore({ ...data, farmerProfile: profile });

    return {
      uid: d.id,
      ...profile,
      riskScore: profile?.riskScore ?? computedRisk.score,
      riskLevel: profile?.riskLevel ?? computedRisk.level,
      riskConfidence: profile?.riskConfidence ?? computedRisk.confidence,
      riskBreakdown: profile?.riskBreakdown || computedRisk.breakdown,
      verificationStatus: data?.verificationStatus || profile?.verificationStatus || "pending",
    };
  });
}

export async function getFarmerProfileByUid(farmerUid) {
  if (!farmerUid) {
    throw new Error("Farmer ID is required.");
  }

  const snap = await getDoc(doc(db, "users", farmerUid));
  if (!snap.exists()) {
    throw new Error("Farmer profile not found.");
  }

  const data = snap.data() || {};
  if (data?.role !== "Farmer") {
    throw new Error("Selected user is not a farmer profile.");
  }

  const profile = data?.farmerProfile || buildFarmerProfileFromUserData(data);
  const computedRisk = calculateStaticRiskScore({ ...data, farmerProfile: profile });
  return {
    uid: farmerUid,
    ...profile,
    riskScore: profile?.riskScore ?? computedRisk.score,
    riskLevel: profile?.riskLevel ?? computedRisk.level,
    riskConfidence: profile?.riskConfidence ?? computedRisk.confidence,
    riskBreakdown: profile?.riskBreakdown || computedRisk.breakdown,
    verificationStatus: data?.verificationStatus || profile?.verificationStatus || "pending",
  };
}

export async function createInvestmentIntent(targetFarmerUid, amount) {
  const user = await waitForCurrentUser();
  if (!user) {
    throw new Error("Please log in before creating an investment intent.");
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Enter a valid investment amount.");
  }

  await addDoc(collection(db, "investmentIntents"), {
    investorUid: user.uid,
    targetFarmerUid,
    amount: numericAmount,
    currency: "USD",
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function getInvestmentIntentsForInvestor() {
  const user = await waitForCurrentUser();
  if (!user) {
    throw new Error("Please log in before viewing investments.");
  }

  const intentsQuery = query(
    collection(db, "investmentIntents"),
    where("investorUid", "==", user.uid)
  );
  const intentsSnap = await getDocs(intentsQuery);
  const rows = intentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const userCache = new Map();
  const readUserName = async (uid) => {
    if (!uid) {
      return "-";
    }
    if (userCache.has(uid)) {
      return userCache.get(uid);
    }

    const snap = await getDoc(doc(db, "users", uid));
    const data = snap.exists() ? snap.data() : {};
    const name = data?.fullName || data?.farmerProfile?.fullName || data?.email || uid;
    userCache.set(uid, name);
    return name;
  };

  const mapped = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      status: normalizeIntentStatus(row.status),
      farmerName: await readUserName(row.targetFarmerUid),
    }))
  );

  return mapped.sort((a, b) => {
    const aMillis = a?.createdAt?.toMillis?.() || 0;
    const bMillis = b?.createdAt?.toMillis?.() || 0;
    return bMillis - aMillis;
  });
}

export async function getInvestmentIntentsForAdmin() {
  const user = await waitForCurrentUser();
  if (!user) {
    throw new Error("Please log in before managing investment intents.");
  }

  const profileSnap = await getDoc(doc(db, "users", user.uid));
  const profile = profileSnap.exists() ? profileSnap.data() : {};
  if (String(profile?.role || "").toLowerCase() !== "admin") {
    throw new Error("Only admins can manage investment intents.");
  }

  const intentsSnap = await getDocs(collection(db, "investmentIntents"));
  const rows = intentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const userCache = new Map();
  const readUserName = async (uid) => {
    if (!uid) {
      return "-";
    }
    if (userCache.has(uid)) {
      return userCache.get(uid);
    }

    const snap = await getDoc(doc(db, "users", uid));
    const data = snap.exists() ? snap.data() : {};
    const name = data?.fullName || data?.farmerProfile?.fullName || data?.email || uid;
    userCache.set(uid, name);
    return name;
  };

  const mapped = await Promise.all(
    rows.map(async (row) => ({
      ...row,
      status: normalizeIntentStatus(row.status),
      investorName: await readUserName(row.investorUid),
      farmerName: await readUserName(row.targetFarmerUid),
    }))
  );

  return mapped.sort((a, b) => {
    const aMillis = a?.createdAt?.toMillis?.() || 0;
    const bMillis = b?.createdAt?.toMillis?.() || 0;
    return bMillis - aMillis;
  });
}

export async function updateInvestmentIntentStatus(intentId, status) {
  const user = await waitForCurrentUser();
  if (!user) {
    throw new Error("Please log in before updating investment intents.");
  }

  if (!intentId) {
    throw new Error("Investment intent ID is required.");
  }

  const profileSnap = await getDoc(doc(db, "users", user.uid));
  const profile = profileSnap.exists() ? profileSnap.data() : {};
  if (String(profile?.role || "").toLowerCase() !== "admin") {
    throw new Error("Only admins can update investment intent status.");
  }

  const normalized = normalizeIntentStatus(status);
  await setDoc(
    doc(db, "investmentIntents", intentId),
    {
      status: normalized,
      reviewedBy: user.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function getCurrentUser() {
  return auth.currentUser;
}

export { mapFirebaseError };
