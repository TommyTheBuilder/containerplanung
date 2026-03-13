const monthLabel = document.getElementById('monthLabel');
const calendarEl = document.getElementById('calendar');
const bookingForm = document.getElementById('bookingForm');
const bookingTemplate = document.getElementById('bookingTemplate');
const bookingDateInput = document.getElementById('bookingDate');
const statusText = document.getElementById('statusText');
const authCard = document.getElementById('authCard');
const bookingCard = document.getElementById('bookingCard');
const calendarCard = document.getElementById('calendarCard');
const logoutBtn = document.getElementById('logoutBtn');
const ssoLoginBtn = document.getElementById('ssoLoginBtn');

const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');
const todayBtn = document.getElementById('todayBtn');

const weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const TOKEN_KEY = 'containerplanung-token';
let currentDate = new Date();
let bookings = [];
let token = localStorage.getItem(TOKEN_KEY) || '';

if (bookingDateInput) bookingDateInput.value = toInputDate(new Date());
renderCalendar();
applyAuthState(Boolean(token));
if (token) fetchBookings();
processSsoReturn();

ssoLoginBtn.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/auth/sso/config');
    const data = await response.json();
    const callbackUrl = `${window.location.origin}${window.location.pathname}`;
    const loginUrl = new URL(data.loginUrl);
    loginUrl.searchParams.set('returnUrl', callbackUrl);
    window.location.href = loginUrl.toString();
  } catch (_error) {
    statusText.textContent = 'SSO-Login konnte nicht gestartet werden.';
  }
});

logoutBtn.addEventListener('click', () => {
  token = '';
  bookings = [];
  localStorage.removeItem(TOKEN_KEY);
  applyAuthState(false);
  renderCalendar();
});

bookingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(bookingForm);
  const entry = {
    title: formData.get('title').toString().trim(),
    containerNo: formData.get('containerNo').toString().trim(),
    customer: formData.get('customer').toString().trim(),
    plate: formData.get('plate').toString().trim(),
    orderNo: formData.get('orderNo').toString().trim(),
    date: formData.get('bookingDate').toString(),
    color: formData.get('bookingColor').toString(),
  };

  try {
    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(entry),
    });

    if (!response.ok) throw new Error('Speichern fehlgeschlagen');
    bookingForm.reset();
    bookingDateInput.value = toInputDate(new Date(entry.date));
    document.getElementById('bookingColor').value = '#0ea5e9';
    await fetchBookings();
  } catch (_error) {
    statusText.textContent = 'Buchung konnte nicht gespeichert werden.';
  }
});

prevMonthBtn.addEventListener('click', () => {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  fetchBookings();
});

nextMonthBtn.addEventListener('click', () => {
  currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
  fetchBookings();
});

todayBtn.addEventListener('click', () => {
  currentDate = new Date();
  fetchBookings();
});

async function processSsoReturn() {
  const url = new URL(window.location.href);
  const ssoToken = getSsoTokenFromUrl(url);
  if (!ssoToken) return;

  try {
    const exchangeData = await exchangeSsoToken(ssoToken);

    if (exchangeData?.token) {
      token = exchangeData.token;
      localStorage.setItem(TOKEN_KEY, token);
      applyAuthState(true, exchangeData.user?.username);
      await fetchBookings();
      cleanupSsoParams(url);
      return;
    }

    const meResponse = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${ssoToken}` },
    });

    if (!meResponse.ok) throw new Error('SSO-Anmeldung fehlgeschlagen');
    const user = await meResponse.json();
    token = ssoToken;
    localStorage.setItem(TOKEN_KEY, token);
    applyAuthState(true, user?.username);
    await fetchBookings();
    cleanupSsoParams(url);
  } catch (_error) {
    statusText.textContent = 'SSO-Anmeldung fehlgeschlagen.';
  }
}

async function exchangeSsoToken(ssoToken) {
  const response = await fetch('/api/auth/sso-exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ssoToken }),
  });

  if (!response.ok) return null;
  return response.json();
}

function cleanupSsoParams(url) {
  url.searchParams.delete('ssoToken');
  url.searchParams.delete('session');
  url.hash = '';
  window.history.replaceState({}, document.title, url.toString());
}

function getSsoTokenFromUrl(url) {
  const directToken = url.searchParams.get('ssoToken') || url.searchParams.get('session');
  if (directToken) return directToken;

  if (url.hash.startsWith('#')) {
    const hashParams = new URLSearchParams(url.hash.slice(1));
    return hashParams.get('ssoToken') || hashParams.get('session') || '';
  }

  return '';
}

async function fetchBookings() {
  renderCalendar();
  if (!token) return;

  const monthParam = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

  try {
    const response = await fetch(`/api/bookings?month=${monthParam}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      if (response.status === 401) logoutBtn.click();
      throw new Error('Laden fehlgeschlagen');
    }

    bookings = await response.json();
    statusText.textContent = `${bookings.length} Buchungen geladen.`;
    renderCalendar();
  } catch (_error) {
    statusText.textContent = 'Buchungen konnten nicht geladen werden.';
  }
}

function applyAuthState(loggedIn, username = '') {
  authCard.classList.toggle('hidden', loggedIn);
  bookingCard.classList.toggle('hidden', !loggedIn);
  calendarCard.classList.toggle('hidden', !loggedIn);
  statusText.textContent = loggedIn ? `Angemeldet als ${username || 'Benutzer'}.` : 'Bitte per SSO anmelden.';
}

function renderCalendar() {
  calendarEl.innerHTML = '';

  weekdays.forEach((day) => {
    const head = document.createElement('div');
    head.className = 'day-name';
    head.textContent = day;
    calendarEl.append(head);
  });

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysPrevMonth = new Date(year, month, 0).getDate();

  monthLabel.textContent = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(currentDate);

  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'day-cell';

    let dayNumber;
    let cellDate;

    if (i < firstWeekday) {
      dayNumber = daysPrevMonth - firstWeekday + i + 1;
      cellDate = new Date(year, month - 1, dayNumber);
      cell.classList.add('other-month');
    } else if (i >= firstWeekday + daysInMonth) {
      dayNumber = i - (firstWeekday + daysInMonth) + 1;
      cellDate = new Date(year, month + 1, dayNumber);
      cell.classList.add('other-month');
    } else {
      dayNumber = i - firstWeekday + 1;
      cellDate = new Date(year, month, dayNumber);
    }

    const dayNumberEl = document.createElement('div');
    dayNumberEl.className = 'day-number';
    dayNumberEl.textContent = String(dayNumber);
    cell.append(dayNumberEl);

    const currentIso = toInputDate(cellDate);
    const cellBookings = bookings.filter((booking) => booking.date === currentIso);

    cellBookings.forEach((booking) => {
      const bookingEl = bookingTemplate.content.firstElementChild.cloneNode(true);
      bookingEl.style.background = booking.color;
      bookingEl.querySelector('.booking-title').textContent = booking.title;
      bookingEl.querySelector('.booking-meta').textContent = `${booking.containerNo} · ${booking.customer} · ${booking.plate} · ${booking.orderNo}`;
      bookingEl.title = 'Klicken zum Löschen';

      bookingEl.addEventListener('click', async () => {
        const response = await fetch(`/api/bookings/${booking.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) await fetchBookings();
      });

      cell.append(bookingEl);
    });

    calendarEl.append(cell);
  }
}

function toInputDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
