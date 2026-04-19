import { showToast, clearError, setError } from "./common.js";

(function initOnboardingLocation() {
  const form = document.getElementById("onboardingLocationForm");
  if (!form) return;

  const ids = [
    "farmName",
    "farmState",
    "farmDistrict",
    "farmCrop",
    "farmAcreage",
    "farmLatitude",
    "farmLongitude",
  ];
  const fields = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

  const saveBtn = document.getElementById("saveLocationBtn");
  const continueBtn = document.getElementById("locationContinueBtn");
  const backBtn = document.getElementById("locationBackBtn");
  const autodetectBtn = document.getElementById("autodetectBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const mapElement = document.getElementById("farmMap");

  const LS_KEY = "agriinvest.onboarding.location";

  let saveOnboardingFarmLocation = null;
  let getCurrentUserProfile = null;
  let mapFirebaseError = null;
  let signOutUser = null;

  let map;
  let marker;
  const defaultCenter = [15.2993, 74.1240];

  function initMap() {
    if (!mapElement || typeof window.L === "undefined") {
      showToast("Leaflet map failed to load. Check internet connection.");
      return;
    }

    map = window.L.map(mapElement).setView(defaultCenter, 9);

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);

    marker = window.L.marker(defaultCenter, { draggable: true }).addTo(map);

    marker.on("dragend", () => {
      const { lat, lng } = marker.getLatLng();
      setCoordinates(lat, lng, false);
    });

    map.on("click", (event) => {
      const { lat, lng } = event.latlng;
      setCoordinates(lat, lng, false);
    });
  }

  function setCoordinates(lat, lng, recenter = true) {
    fields.farmLatitude.value = Number(lat).toFixed(6);
    fields.farmLongitude.value = Number(lng).toFixed(6);
    clearError("farmLatitudeError");
    clearError("farmLongitudeError");

    if (marker) {
      marker.setLatLng([lat, lng]);
    }

    if (map && recenter) {
      map.setView([lat, lng], Math.max(map.getZoom(), 13));
    }
  }

  function syncMapFromInputs() {
    const lat = Number(fields.farmLatitude.value);
    const lng = Number(fields.farmLongitude.value);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return;
    }

    setCoordinates(lat, lng, true);
  }

  function payload() {
    return {
      farmName: fields.farmName.value.trim(),
      state: fields.farmState.value,
      district: fields.farmDistrict.value.trim(),
      primaryCrop: fields.farmCrop.value.trim(),
      acreageHectare: fields.farmAcreage.value.trim(),
      latitude: fields.farmLatitude.value.trim(),
      longitude: fields.farmLongitude.value.trim(),
      updatedAt: new Date().toISOString(),
    };
  }

  function validate() {
    [
      "farmNameError",
      "farmStateError",
      "farmDistrictError",
      "farmCropError",
      "farmAcreageError",
      "farmLatitudeError",
      "farmLongitudeError",
    ].forEach(clearError);

    const data = payload();
    let valid = true;

    if (!data.farmName) {
      setError("farmNameError", "Farm name is required");
      valid = false;
    }
    if (!data.state) {
      setError("farmStateError", "State is required");
      valid = false;
    }
    if (!data.district) {
      setError("farmDistrictError", "District is required");
      valid = false;
    }
    if (!data.primaryCrop) {
      setError("farmCropError", "Primary crop is required");
      valid = false;
    }

    const acreage = Number(data.acreageHectare);
    if (!data.acreageHectare) {
      setError("farmAcreageError", "Acreage is required");
      valid = false;
    } else if (!Number.isFinite(acreage) || acreage <= 0) {
      setError("farmAcreageError", "Enter a valid acreage value");
      valid = false;
    }

    const lat = Number(data.latitude);
    const lng = Number(data.longitude);

    if (!data.latitude) {
      setError("farmLatitudeError", "Latitude is required");
      valid = false;
    } else if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setError("farmLatitudeError", "Latitude must be between -90 and 90");
      valid = false;
    }

    if (!data.longitude) {
      setError("farmLongitudeError", "Longitude is required");
      valid = false;
    } else if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      setError("farmLongitudeError", "Longitude must be between -180 and 180");
      valid = false;
    }

    return { valid, data };
  }

  function hydrate(data) {
    if (!data) return;
    if (data.farmName) fields.farmName.value = data.farmName;
    if (data.state) fields.farmState.value = data.state;
    if (data.district) fields.farmDistrict.value = data.district;
    if (data.primaryCrop) fields.farmCrop.value = data.primaryCrop;
    if (data.acreageHectare) fields.farmAcreage.value = data.acreageHectare;
    if (data.latitude) fields.farmLatitude.value = data.latitude;
    if (data.longitude) fields.farmLongitude.value = data.longitude;

    syncMapFromInputs();
  }

  async function initFirebaseServices() {
    try {
      const firebase = await import("./firebase.js");
      saveOnboardingFarmLocation = firebase.saveOnboardingFarmLocation;
      getCurrentUserProfile = firebase.getCurrentUserProfile;
      mapFirebaseError = firebase.mapFirebaseError;
      signOutUser = firebase.signOutUser;
    } catch {
      showToast("Cloud sync unavailable. Map still works; data stays local for now.");
    }
  }

  async function loadInitial() {
    const draftRaw = localStorage.getItem(LS_KEY);
    if (draftRaw) {
      try {
        hydrate(JSON.parse(draftRaw));
      } catch {
        localStorage.removeItem(LS_KEY);
      }
    }

    if (!getCurrentUserProfile) {
      return;
    }

    try {
      const profile = await getCurrentUserProfile();
      if (profile?.onboarding?.step2FarmLocation) {
        hydrate(profile.onboarding.step2FarmLocation);
      }
    } catch {
      // user not logged in yet; local draft still works
    }
  }

  async function persist(mode) {
    const { valid, data } = validate();
    if (!valid) return false;

    localStorage.setItem(LS_KEY, JSON.stringify(data));

    if (!saveOnboardingFarmLocation) {
      showToast(
        mode === "continue"
          ? "Saved locally. Sign in over HTTP/HTTPS to sync cloud data."
          : "Progress saved locally."
      );
      return true;
    }

    try {
      await saveOnboardingFarmLocation(data);
      showToast(mode === "continue" ? "Farm location saved. Continue to Documents." : "Progress saved.");
      return true;
    } catch (error) {
      showToast(mapFirebaseError ? mapFirebaseError(error) : "Unable to save to cloud right now.");
      return false;
    }
  }

  Object.entries(fields).forEach(([id, el]) => {
    el.addEventListener("input", () => clearError(`${id}Error`));
  });

  [fields.farmLatitude, fields.farmLongitude].forEach((el) => {
    el.addEventListener("change", syncMapFromInputs);
  });

  autodetectBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showToast("Geolocation is not supported in this browser.");
      return;
    }

    autodetectBtn.disabled = true;
    const originalText = autodetectBtn.textContent;
    autodetectBtn.textContent = "Detecting...";

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setCoordinates(lat, lng, true);
        showToast("GPS coordinates detected.");
        autodetectBtn.disabled = false;
        autodetectBtn.textContent = originalText;
      },
      () => {
        showToast("Unable to detect location. Please set coordinates manually.");
        autodetectBtn.disabled = false;
        autodetectBtn.textContent = originalText;
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  });

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    await persist("save");
    saveBtn.disabled = false;
  });

  continueBtn.addEventListener("click", async () => {
    continueBtn.disabled = true;
    const ok = await persist("continue");
    continueBtn.disabled = false;
    if (ok) window.location.href = "onboarding-documents.html";
  });

  backBtn.addEventListener("click", () => {
    window.location.href = "onboarding-contact.html";
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
    window.location.href = "index.html";
  });

  document.querySelectorAll(".onb-mobile-nav [data-go]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-go");
      if (target) window.location.href = target;
    });
  });

  initMap();
  initFirebaseServices().then(loadInitial);
  syncMapFromInputs();
})();
