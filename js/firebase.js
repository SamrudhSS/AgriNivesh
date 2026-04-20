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

  await setDoc(
    doc(db, "users", user.uid),
    {
      onboarding: {
        status: "submitted",
        submittedAt: serverTimestamp(),
        currentStep: 4,
      },
      verificationStatus: "pending",
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

  await setDoc(
    doc(db, "users", targetUid),
    {
      verificationStatus,
      onboarding: {
        reviewedBy: user.uid,
        reviewedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function getCurrentUser() {
  return auth.currentUser;
}

export { mapFirebaseError };
