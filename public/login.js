const loginForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');

init();

async function init() {
  const hasSession = await hasActiveSession();
  if (hasSession) {
    window.location.replace('/');
  }
}

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginStatus.textContent = 'Anmeldung läuft...';

  const formData = new FormData(loginForm);
  const username = String(formData.get('username') || '').trim();
  const password = String(formData.get('password') || '');

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || 'Anmeldung fehlgeschlagen.');
    }

    loginStatus.textContent = `Erfolgreich angemeldet als ${body.user?.username || username}.`;
    window.location.href = '/';
  } catch (error) {
    loginStatus.textContent = error.message || 'Anmeldung fehlgeschlagen.';
  }
});

async function hasActiveSession() {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    return response.ok;
  } catch (_error) {
    return false;
  }
}
