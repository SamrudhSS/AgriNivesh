import {
  showToast,
  isValidEmail,
  clearError,
  setError,
} from "./common.js";
import { registerWithEmailProfile, mapFirebaseError } from "./firebase.js";

(function initRegister() {
  const form = document.getElementById("registerForm");
  if (!form) return;

  const roleButtons = Array.from(document.querySelectorAll(".role-card"));
  const fullNameInput = document.getElementById("regFullName");
  const countryCodeInput = document.getElementById("regCountryCode");
  const phoneInput = document.getElementById("regPhone");
  const emailInput = document.getElementById("regEmail");
  const passwordInput = document.getElementById("regPassword");
  const confirmInput = document.getElementById("regConfirmPassword");
  const termsInput = document.getElementById("regTerms");

  const passToggle = document.getElementById("regPasswordToggle");
  const confirmToggle = document.getElementById("regConfirmPasswordToggle");

  const bars = [
    document.getElementById("bar1"),
    document.getElementById("bar2"),
    document.getElementById("bar3"),
    document.getElementById("bar4"),
  ];
  const strengthLabel = document.getElementById("strengthLabel");
  const submitBtn = form.querySelector('button[type="submit"]');
  const submitText = submitBtn.textContent;

  let selectedRole = "Farmer";

  function setSubmitLoading(loading) {
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? "Creating account..." : submitText;
  }

  roleButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      selectedRole = button.getAttribute("data-role");
      roleButtons.forEach(function (b) {
        b.classList.remove("selected");
      });
      button.classList.add("selected");
    });
  });

  function toggleVisibility(input, button) {
    const hidden = input.type === "password";
    input.type = hidden ? "text" : "password";
    button.textContent = hidden ? "🙈" : "👁";
  }

  passToggle.addEventListener("click", function () {
    toggleVisibility(passwordInput, passToggle);
  });

  confirmToggle.addEventListener("click", function () {
    toggleVisibility(confirmInput, confirmToggle);
  });

  function passwordScore(value) {
    let score = 0;
    if (value.length >= 8) score++;
    if (/[A-Z]/.test(value)) score++;
    if (/[a-z]/.test(value)) score++;
    if (/[0-9]/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;
    return Math.min(score, 4);
  }

  function strengthMeta(score) {
    if (score <= 1) return { label: "WEAK", color: "#b86868" };
    if (score === 2) return { label: "FAIR", color: "#b28f2d" };
    if (score === 3) return { label: "GOOD", color: "#467c5d" };
    return { label: "STRONG", color: "#365d4b" };
  }

  function updateStrengthUI() {
    const score = passwordScore(passwordInput.value);
    const meta = strengthMeta(score);

    bars.forEach(function (bar, index) {
      bar.style.background = index < score ? meta.color : "#e1e3e1";
    });

    strengthLabel.textContent = meta.label;
    strengthLabel.style.color = meta.color;
  }

  passwordInput.addEventListener("input", function () {
    clearError("regPasswordError");
    updateStrengthUI();
  });

  [fullNameInput, phoneInput, emailInput, confirmInput].forEach(function (input) {
    input.addEventListener("input", function () {
      const map = {
        regFullName: "regFullNameError",
        regPhone: "regPhoneError",
        regEmail: "regEmailError",
        regConfirmPassword: "regConfirmPasswordError",
      };
      clearError(map[input.id]);
    });
  });

  termsInput.addEventListener("change", function () {
    clearError("regTermsError");
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const fullName = fullNameInput.value.trim();
    const countryCode = countryCodeInput.value;
    const phone = phoneInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmInput.value;

    const score = passwordScore(password);

    let valid = true;
    [
      "regFullNameError",
      "regPhoneError",
      "regEmailError",
      "regPasswordError",
      "regConfirmPasswordError",
      "regTermsError",
    ].forEach(clearError);

    if (!fullName) {
      setError("regFullNameError", "Full name is required");
      valid = false;
    } else if (fullName.length < 2) {
      setError("regFullNameError", "Name is too short");
      valid = false;
    }

    if (!phone) {
      setError("regPhoneError", "Phone number is required");
      valid = false;
    } else if (!/^[0-9\s\-()]+$/.test(phone) || phone.replace(/[^0-9]/g, "").length < 7) {
      setError("regPhoneError", "Enter a valid phone number");
      valid = false;
    }

    if (!email) {
      setError("regEmailError", "Email is required");
      valid = false;
    } else if (!isValidEmail(email)) {
      setError("regEmailError", "Enter a valid email address");
      valid = false;
    }

    if (!password) {
      setError("regPasswordError", "Password is required");
      valid = false;
    } else if (password.length < 8) {
      setError("regPasswordError", "Use at least 8 characters");
      valid = false;
    } else if (score < 3) {
      setError("regPasswordError", "Use uppercase, lowercase and number/symbol");
      valid = false;
    }

    if (!confirmPassword) {
      setError("regConfirmPasswordError", "Please confirm your password");
      valid = false;
    } else if (confirmPassword !== password) {
      setError("regConfirmPasswordError", "Passwords do not match");
      valid = false;
    }

    if (!termsInput.checked) {
      setError("regTermsError", "Please agree to Terms of Service and Privacy Policy");
      valid = false;
    }

    if (!valid) return;

    setSubmitLoading(true);
    try {
      await registerWithEmailProfile({
        fullName,
        email,
        password,
        phone,
        countryCode,
        role: selectedRole,
        termsAccepted: true,
      });

      showToast("Registration successful. Redirecting...");
      setTimeout(function () {
        window.location.href = "onboarding-contact.html";
      }, 900);
    } catch (error) {
      showToast(mapFirebaseError(error));
    } finally {
      setSubmitLoading(false);
    }
  });

  updateStrengthUI();
})();
