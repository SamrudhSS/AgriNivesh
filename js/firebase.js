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

function buildFarmerProfileFromUserData(userData = {}) {
  const onboarding = userData?.onboarding || {};
  const contact = onboarding?.step1ContactInfo || {};
  const location = onboarding?.step2FarmLocation || {};
  const docs = onboarding?.step3Documents || {};

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

    return {
      uid: d.id,
      ...profile,
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
  return {
    uid: farmerUid,
    ...profile,
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
    status: "initiated",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function getCurrentUser() {
  return auth.currentUser;
}

export { mapFirebaseError };
