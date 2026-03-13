const loginForm = document.getElementById('loginForm');
const loginStatus = document.getElementById('loginStatus');
const TOKEN_KEY = 'containerplanung-token';

if (localStorage.getItem(TOKEN_KEY)) {
  window.location.replace('/');
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
      body: JSON.stringify({ username, password }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.token) {
      throw new Error(body.message || 'Anmeldung fehlgeschlagen.');
    }

    localStorage.setItem(TOKEN_KEY, body.token);
    loginStatus.textContent = `Erfolgreich angemeldet als ${body.user?.username || username}.`;
    window.location.href = '/';
  } catch (error) {
    loginStatus.textContent = error.message || 'Anmeldung fehlgeschlagen.';
  }
});
