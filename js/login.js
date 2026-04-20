import {
  showToast,
  isValidEmail,
  isValidPhone,
  clearError,
  setError,
} from "./common.js";
import {
  loginWithEmail,
  signInWithGoogle,
  sendResetEmail,
  getCurrentUserProfile,
  mapFirebaseError,
} from "./firebase.js";
import {
  routeByRole,
  setActiveSession,
  getRoleForUid,
  normalizeRole,
  clearLegacyOnboardingDrafts,
} from "./session.js";

(function initLogin() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  const identityInput = document.getElementById("loginIdentity");
  const passwordInput = document.getElementById("loginPassword");
  const roleGroup = document.getElementById("loginRoleGroup");
  const roleButtons = Array.from(document.querySelectorAll("#loginRoleGroup .role-card"));
  const rememberMeInput = document.getElementById("rememberMe");
  const toggleBtn = document.getElementById("loginPasswordToggle");
  const forgotBtn = document.getElementById("forgotPasswordBtn");
  const googleBtn = document.getElementById("googleLoginBtn");
  const submitBtn = form.querySelector('button[type="submit"]');

  const submitText = submitBtn.textContent;
  const googleText = googleBtn.querySelector("span").textContent;
  let selectedRole = "Farmer";

  function getSelectedRoleFromUI() {
    const selected = roleGroup?.querySelector(".role-card.selected[data-role]");
    return selected?.getAttribute("data-role") || selectedRole || "Farmer";
  }

  selectedRole = getSelectedRoleFromUI();

  roleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      roleButtons.forEach((b) => b.classList.remove("selected"));
      button.classList.add("selected");
      selectedRole = getSelectedRoleFromUI();
    });
  });

  function showRoleSelectionInfo(actualRole, requestedRole) {
    if (normalizeRole(actualRole) === normalizeRole(requestedRole)) {
      return;
    }

    showToast(`Role mismatch detected. Signed in as ${actualRole}.`);
  }

  async function resolveRoleOrDefault(uid, defaultRole = "Farmer") {
    try {
      const profile = await getCurrentUserProfile();
      if (profile?.role) {
        return profile.role;
      }
    } catch {
      // continue to local fallback
    }

    const cachedRole = getRoleForUid(uid);
    return cachedRole || defaultRole;
  }

  function setSubmitLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? "Signing in..." : submitText;
  }

  function setGoogleLoading(loading) {
    googleBtn.disabled = loading;
    googleBtn.style.opacity = loading ? "0.7" : "1";
    googleBtn.querySelector("span").textContent = loading
      ? "Signing in..."
      : googleText;
  }

  toggleBtn.addEventListener("click", function () {
    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";
    toggleBtn.textContent = isHidden ? "🙈" : "👁";
  });

  forgotBtn.addEventListener("click", async function () {
    const identity = identityInput.value.trim();
    if (!isValidEmail(identity)) {
      setError("loginIdentityError", "Enter your email to reset password");
      return;
    }

    try {
      await sendResetEmail(identity);
      showToast("Password reset email sent.");
    } catch (error) {
      showToast(mapFirebaseError(error));
    }
  });

  googleBtn.addEventListener("click", async function () {
    setGoogleLoading(true);
    try {
      const user = await signInWithGoogle();
      const role = await resolveRoleOrDefault(user?.uid, getSelectedRoleFromUI());
      showRoleSelectionInfo(role, getSelectedRoleFromUI());
      setActiveSession({ uid: user?.uid, role });
      clearLegacyOnboardingDrafts();
      showToast("Google sign-in successful. Redirecting...");
      setTimeout(function () {
        routeByRole(role);
      }, 800);
    } catch (error) {
      showToast(mapFirebaseError(error));
    } finally {
      setGoogleLoading(false);
    }
  });

  identityInput.addEventListener("input", function () {
    clearError("loginIdentityError");
  });

  passwordInput.addEventListener("input", function () {
    clearError("loginPasswordError");
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const identity = identityInput.value.trim();
    const password = passwordInput.value;

    let valid = true;
    clearError("loginIdentityError");
    clearError("loginPasswordError");

    if (!identity) {
      setError("loginIdentityError", "Email is required for Firebase login");
      valid = false;
    } else if (!isValidEmail(identity)) {
      if (isValidPhone(identity)) {
        setError(
          "loginIdentityError",
          "Phone login is not enabled yet. Use your email."
        );
      } else {
        setError("loginIdentityError", "Enter a valid email address");
      }
      valid = false;
    }

    if (!password) {
      setError("loginPasswordError", "Password is required");
      valid = false;
    } else if (password.length < 8) {
      setError("loginPasswordError", "Password must be at least 8 characters");
      valid = false;
    }

    if (!valid) return;

    setSubmitLoading(true);
    try {
      const user = await loginWithEmail(identity, password, rememberMeInput.checked);
      const role = await resolveRoleOrDefault(user?.uid, getSelectedRoleFromUI());
      showRoleSelectionInfo(role, getSelectedRoleFromUI());
      setActiveSession({ uid: user?.uid, role });
      clearLegacyOnboardingDrafts();
      showToast("Login successful. Redirecting...");
      setTimeout(function () {
        routeByRole(role);
      }, 800);
    } catch (error) {
      showToast(mapFirebaseError(error));
    } finally {
      setSubmitLoading(false);
    }
  });
})();
