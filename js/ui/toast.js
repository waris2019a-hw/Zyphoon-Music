/** Toast notifications */

export function showToast(message, type = 'info', duration = 3000) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.25s';
    setTimeout(() => el.remove(), 250);
  }, duration);
}

export function showError(message) {
  showToast(message, 'error', 4500);
}

export function showSuccess(message) {
  showToast(message, 'success');
}
