export function showToast(message) {
  const old = document.querySelector('.toast');
  if (old) old.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2600);
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidPhone(value) {
  return /^\+?[0-9\s\-()]{7,18}$/.test(value);
}

export function clearError(id) {
  const el = document.getElementById(id);
  if (el) el.textContent = '';
}

export function setError(id, message) {
  const el = document.getElementById(id);
  if (el) el.textContent = message;
}
