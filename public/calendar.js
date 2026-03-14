const weekdayHeader = document.getElementById('weekdayHeader');
const calendarGrid = document.getElementById('calendarGrid');
const rangeLabel = document.getElementById('rangeLabel');
const todayBtn = document.getElementById('todayBtn');
const monthViewBtn = document.getElementById('monthViewBtn');
const weekViewBtn = document.getElementById('weekViewBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

const gearMenu = document.getElementById('gearMenu');
const gearMenuToggle = document.getElementById('gearMenuToggle');
const gearMenuDropdown = document.getElementById('gearMenuDropdown');
const darkModeToggle = document.getElementById('darkModeToggle');
const moduleDashboardBtn = document.getElementById('moduleDashboardBtn');
const logoutBtn = document.getElementById('logoutBtn');

const DARK_MODE_KEY_PREFIX = 'containerplanung.darkmode';
const SSO_SOURCE_HOST = 'test.paletten-ms.de';

const weekdays = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
let viewMode = 'month';
let cursorDate = new Date();

const bookings = [];

const bookingModal = createBookingModal({
  async onSave(newBooking) {
    const createdBooking = await createBooking(newBooking);
    bookings.push(createdBooking);
    render();
  },
});

const detailsModal = createBookingDetailsModal({
  onBookingUpdate(updated) {
    const index = bookings.findIndex((booking) => booking.id === updated.id);
    if (index >= 0) bookings[index] = updated;
    render();
  },
  async onBookingDelete(bookingId) {
    await deleteBooking(bookingId);
    const index = bookings.findIndex((booking) => booking.id === bookingId);
    if (index < 0) return;

    const [removedBooking] = bookings.splice(index, 1);
    (removedBooking.attachments || []).forEach((file) => {
      if (file?.url) URL.revokeObjectURL(file.url);
    });
    render();
  },
});

document.body.append(bookingModal.overlay);
document.body.append(detailsModal.overlay);

initApp();

function render() {
  if (!weekdayHeader || !calendarGrid) return;
  renderWeekdays();
  renderRangeLabel();
  renderGrid();
  syncViewButtons();
}

async function initApp() {
  const authenticated = await ensureAuthenticated();
  if (!authenticated) return;
  applyInitialTheme();
  await loadBookingsForCurrentMonth();
  render();
}

async function loadBookingsForCurrentMonth() {
  try {
    const month = toYearMonth(cursorDate);
    const response = await fetch(`/api/bookings?month=${encodeURIComponent(month)}`, {
      credentials: 'include',
    });

    if (!response.ok) throw new Error('Buchungen konnten nicht geladen werden.');

    const rows = await response.json();
    bookings.splice(0, bookings.length, ...rows.map(mapApiBookingToUi));
  } catch (error) {
    console.error(error);
    bookings.splice(0, bookings.length);
  }
}

async function createBooking(booking) {
  const response = await fetch('/api/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      title: booking.title,
      containerNo: booking.container,
      customer: '-',
      warehouse: booking.lager,
      plate: booking.kennzeichen,
      orderNo: booking.auftrag,
      date: booking.date,
      color: getColorForBookingType(booking.type),
    }),
  });

  if (!response.ok) {
    const payload = await safeReadJson(response);
    throw new Error(payload?.message || 'Buchung konnte nicht gespeichert werden.');
  }

  const created = await response.json();
  return mapApiBookingToUi(created);
}

async function deleteBooking(bookingId) {
  const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!response.ok) {
    const payload = await safeReadJson(response);
    throw new Error(payload?.message || 'Buchung konnte nicht gelöscht werden.');
  }
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

function mapApiBookingToUi(row) {
  return {
    id: String(row.id),
    title: String(row.title || ''),
    container: String(row.containerNo || ''),
    kennzeichen: String(row.plate || ''),
    auftrag: String(row.orderNo || ''),
    lager: String(row.warehouse || ''),
    date: String(row.date || ''),
    type: getBookingTypeFromColor(row.color),
    attachments: [],
  };
}

function toYearMonth(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getColorForBookingType(type) {
  const colors = {
    direct_unload: '#0ea5e9',
    hand_unload: '#22c55e',
    truck_delivery: '#6b7280',
    special_storage: '#ef4444',
  };
  return colors[type] || '#0ea5e9';
}

function getBookingTypeFromColor(color) {
  const normalized = String(color || '').toLowerCase();
  const byColor = {
    '#0ea5e9': 'direct_unload',
    '#22c55e': 'hand_unload',
    '#6b7280': 'truck_delivery',
    '#ef4444': 'special_storage',
  };
  return byColor[normalized] || 'direct_unload';
}

async function ensureAuthenticated() {
  const hasSession = await hasActiveSession();
  if (hasSession) return true;

  const url = new URL(window.location.href);
  const ssoCredentials = getSsoCredentialsFromUrl(url);
  const cameFromSsoHost = didComeFromSsoHost();

  if (ssoCredentials.token) {
    startSessionRedirect(ssoCredentials, url);
    return false;
  }

  if (cameFromSsoHost) {
    await startSsoLogin(url);
    return false;
  }

  window.location.replace('/login.html');
  return false;
}

function didComeFromSsoHost() {
  if (!document.referrer) return false;
  try {
    const referrer = new URL(document.referrer);
    return referrer.hostname === SSO_SOURCE_HOST;
  } catch (_error) {
    return false;
  }
}

async function startSsoLogin(currentUrl = new URL(window.location.href)) {
  try {
    const response = await fetch('/api/auth/sso/config');
    const data = await response.json();
    const callbackUrl = `${currentUrl.origin}${currentUrl.pathname}`;
    const loginUrl = new URL(data.loginUrl);
    loginUrl.searchParams.set('returnUrl', callbackUrl);
    window.location.replace(loginUrl.toString());
  } catch (_error) {
    window.location.replace('/login.html');
  }
}


function startSessionRedirect({ token, user }, currentUrl = new URL(window.location.href)) {
  const redirectUrl = new URL('/api/auth/session-redirect', currentUrl.origin);
  redirectUrl.searchParams.set('ssoToken', token);
  if (user) redirectUrl.searchParams.set('user', user);
  redirectUrl.searchParams.set('returnTo', currentUrl.pathname || '/');
  window.location.replace(redirectUrl.toString());
}

async function hasActiveSession() {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    return response.ok;
  } catch (_error) {
    return false;
  }
}

function getSsoCredentialsFromUrl(url) {
  const directToken = url.searchParams.get('ssoToken') || url.searchParams.get('token') || url.searchParams.get('session') || '';
  const directUser = url.searchParams.get('user') || '';
  if (directToken || directUser) return { token: directToken, user: normalizeUsername(directUser) };

  if (url.hash.startsWith('#')) {
    const hashParams = new URLSearchParams(url.hash.slice(1));
    return {
      token: hashParams.get('ssoToken') || hashParams.get('token') || hashParams.get('session') || '',
      user: normalizeUsername(hashParams.get('user') || ''),
    };
  }

  return { token: '', user: '' };
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function renderWeekdays() {
  if (viewMode === 'day') {
    weekdayHeader.innerHTML = '';
    const node = document.createElement('div');
    node.className = 'weekday';
    node.textContent = cursorDate.toLocaleDateString('de-DE', { weekday: 'long' });
    weekdayHeader.append(node);
    return;
  }

  weekdayHeader.innerHTML = '';
  weekdays.forEach((day) => {
    const node = document.createElement('div');
    node.className = 'weekday';
    node.textContent = day;
    weekdayHeader.append(node);
  });
}

function renderRangeLabel() {
  if (!rangeLabel) return;
  if (viewMode === 'month') {
    rangeLabel.textContent = cursorDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  } else if (viewMode === 'day') {
    rangeLabel.textContent = cursorDate.toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } else {
    const { start, end } = getWeekRange(cursorDate);
    rangeLabel.textContent = `${start.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} – ${end.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  }
}

function renderGrid() {
  calendarGrid.innerHTML = '';
  calendarGrid.classList.toggle('calendar-grid--day', viewMode === 'day');
  weekdayHeader.classList.toggle('weekdays--day', viewMode === 'day');
  const days = viewMode === 'month' ? buildMonthCells(cursorDate) : buildWeekCells(cursorDate);

  days.forEach(({ date, isCurrentMonth }) => {
    const ymd = toYmd(date);
    const dayCard = document.createElement('article');
    dayCard.className = `day-card ${isCurrentMonth ? '' : 'day-card--other-month'} ${isToday(date) ? 'day-card--today' : ''}`.trim();
    dayCard.dataset.date = ymd;

    const dateNode = document.createElement('div');
    dateNode.className = 'day-card__date';
    dateNode.textContent = `${date.getDate()}.${date.getMonth() + 1}.`;
    dayCard.append(dateNode);

    const matches = bookings.filter((item) => item.date === ymd);
    const isCompact = matches.length > 1;
    matches.forEach((booking) => dayCard.append(createBookingCard(booking, { compact: isCompact })));

    dayCard.addEventListener('click', (event) => {
      if (event.target.closest('.booking-card')) return;
      bookingModal.open(ymd);
    });

    dayCard.addEventListener('dragover', (event) => {
      event.preventDefault();
      dayCard.classList.add('is-drop-target');
    });

    dayCard.addEventListener('dragleave', () => dayCard.classList.remove('is-drop-target'));

    dayCard.addEventListener('drop', (event) => {
      event.preventDefault();
      dayCard.classList.remove('is-drop-target');
      const bookingId = event.dataTransfer.getData('text/booking-id');
      const booking = bookings.find((item) => item.id === bookingId);
      if (!booking) return;
      booking.date = ymd;
      render();
    });

    calendarGrid.append(dayCard);
  });
}

function createBookingCard(booking, { compact = false } = {}) {
  const card = document.createElement('div');
  card.className = `booking-card ${compact ? 'booking-card--compact' : ''}`.trim();
  card.draggable = true;
  card.dataset.type = booking.type;
  card.innerHTML = compact
    ? `
      <strong>${escapeHtml(booking.title)}</strong>
      Container: ${escapeHtml(booking.container)}
    `
    : `
      <strong>🚛 ${escapeHtml(booking.title)}</strong>
      Container: ${escapeHtml(booking.container)}<br />
      Kennzeichen: ${escapeHtml(booking.kennzeichen)}<br />
      Auftrag: ${escapeHtml(booking.auftrag)}<br />
      Lager: ${escapeHtml(booking.lager || '-')}
    `;

  card.addEventListener('click', (event) => {
    event.stopPropagation();
    detailsModal.open(booking);
  });

  card.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData('text/booking-id', booking.id);
    event.dataTransfer.effectAllowed = 'move';
  });

  return card;
}

function buildMonthCells(baseDate) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  const startWeekDay = (monthStart.getDay() + 6) % 7;
  const cells = [];

  for (let i = startWeekDay; i > 0; i -= 1) cells.push({ date: new Date(year, month, 1 - i), isCurrentMonth: false });
  for (let day = 1; day <= monthEnd.getDate(); day += 1) cells.push({ date: new Date(year, month, day), isCurrentMonth: true });

  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    cells.push({ date: next, isCurrentMonth: false });
  }
  return cells;
}

function buildWeekCells(baseDate) {
  if (viewMode === 'day') return [{ date: new Date(baseDate), isCurrentMonth: true }];

  const { start } = getWeekRange(baseDate);
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    return { date, isCurrentMonth: true };
  });
}

function getWeekRange(baseDate) {
  const start = new Date(baseDate);
  const weekDay = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - weekDay);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function syncViewButtons() {
  monthViewBtn?.classList.toggle('is-active', viewMode === 'month');
  monthViewBtn?.classList.toggle('btn--primary', viewMode === 'month');
  monthViewBtn?.classList.toggle('btn--ghost', viewMode !== 'month');
  weekViewBtn?.classList.toggle('is-active', viewMode === 'week');
  weekViewBtn?.classList.toggle('btn--primary', viewMode === 'week');
  weekViewBtn?.classList.toggle('btn--ghost', viewMode !== 'week');
}

function toYmd(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isToday(date) {
  return toYmd(new Date()) === toYmd(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getBookingTypeLabel(type) {
  const labels = {
    direct_unload: 'Container Direktentladung',
    hand_unload: 'Container Handentladung',
    truck_delivery: 'LKW Anlieferung',
    special_storage: 'Sonderarbeiten Lager',
  };
  return labels[type] || type;
}

function applyInitialTheme() {
  const isDark = localStorage.getItem(getDarkModeStorageKey()) === '1';
  document.body.classList.toggle('theme-dark', isDark);
  if (darkModeToggle) darkModeToggle.textContent = isDark ? 'Light Mode' : 'Dark Mode';
}

function getDarkModeStorageKey() {
  return DARK_MODE_KEY_PREFIX;
}

todayBtn?.addEventListener('click', () => {
  viewMode = 'day';
  cursorDate = new Date();
  bookingModal.close();
  detailsModal.close();
  refreshDataAndRender();
});

monthViewBtn?.addEventListener('click', () => {
  viewMode = 'month';
  refreshDataAndRender();
});

weekViewBtn?.addEventListener('click', () => {
  viewMode = 'week';
  refreshDataAndRender();
});

prevBtn?.addEventListener('click', () => {
  cursorDate = new Date(cursorDate);
  if (viewMode === 'month') cursorDate.setMonth(cursorDate.getMonth() - 1);
  else if (viewMode === 'day') cursorDate.setDate(cursorDate.getDate() - 1);
  else cursorDate.setDate(cursorDate.getDate() - 7);
  refreshDataAndRender();
});

nextBtn?.addEventListener('click', () => {
  cursorDate = new Date(cursorDate);
  if (viewMode === 'month') cursorDate.setMonth(cursorDate.getMonth() + 1);
  else if (viewMode === 'day') cursorDate.setDate(cursorDate.getDate() + 1);
  else cursorDate.setDate(cursorDate.getDate() + 7);
  refreshDataAndRender();
});

function refreshDataAndRender() {
  loadBookingsForCurrentMonth()
    .then(() => render())
    .catch((error) => {
      console.error(error);
      render();
    });
}

gearMenuToggle?.addEventListener('click', (event) => {
  event.stopPropagation();
  gearMenu.classList.toggle('is-open');
});

document.addEventListener('click', () => gearMenu?.classList.remove('is-open'));
gearMenuDropdown?.addEventListener('click', (event) => event.stopPropagation());

darkModeToggle?.addEventListener('click', () => {
  const enabled = !document.body.classList.contains('theme-dark');
  document.body.classList.toggle('theme-dark', enabled);
  localStorage.setItem(getDarkModeStorageKey(), enabled ? '1' : '0');
  darkModeToggle.textContent = enabled ? 'Light Mode' : 'Dark Mode';
  gearMenu?.classList.remove('is-open');
});

moduleDashboardBtn?.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/auth/sso-forward-token', {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) throw new Error('SSO-Weiterleitungs-Token konnte nicht erstellt werden.');

    const body = await response.json();
    const ssoToken = body?.ssoToken || '';
    const username = String(body?.user?.username || '').trim().toLowerCase();
    const dashboardUrl = new URL('https://test.paletten-ms.de/dashboard.html');

    if (ssoToken) {
      dashboardUrl.searchParams.set('ssoToken', ssoToken);
      if (username) dashboardUrl.searchParams.set('user', username);
    }

    window.location.href = dashboardUrl.toString();
  } catch (_error) {
    window.location.href = 'https://test.paletten-ms.de/dashboard.html';
  }
});

logoutBtn?.addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch (_error) {
    // no-op
  }
  sessionStorage.clear();
  window.location.href = '/login.html';
});

function createBookingModal({ onSave }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h3>Neue Buchung erstellen</h3>
      <form id="bookingCreateForm" class="form-grid">
        <label>Titel<input name="title" required /></label>
        <label>Containernummer<input name="container" required /></label>
        <label>Kennzeichen<input name="kennzeichen" required /></label>
        <label>Auftragsnummer<input name="auftrag" required /></label>
        <label>Lager<input name="lager" required /></label>
        <label>Datum<input type="date" name="date" required /></label>
        <label>Typ
          <select name="type">
            <option value="direct_unload">Container Direktentladung (Blau)</option>
            <option value="hand_unload">Container Handentladung (Grün)</option>
            <option value="truck_delivery">LKW Anlieferung (Grau)</option>
            <option value="special_storage">Sonderarbeiten Lager (Rot)</option>
          </select>
        </label>
        <p class="hint-text">Hinweis: Fotos/Dateien können nach dem Anlegen nur innerhalb der Buchungsdetails hochgeladen werden.</p>
        <div class="modal-actions">
          <button type="button" class="btn" data-close>Abbrechen</button>
          <button type="submit" class="btn btn--primary">Speichern</button>
        </div>
      </form>
    </div>
  `;

  const form = overlay.querySelector('#bookingCreateForm');

  function open(defaultDate) {
    form.reset();
    form.date.value = defaultDate;
    overlay.classList.add('is-open');
  }

  function close() {
    overlay.classList.remove('is-open');
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.dataset.close !== undefined) close();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    onSave({
      title: data.get('title').toString().trim(),
      container: data.get('container').toString().trim(),
      kennzeichen: data.get('kennzeichen').toString().trim(),
      auftrag: data.get('auftrag').toString().trim(),
      lager: data.get('lager').toString().trim(),
      date: data.get('date').toString(),
      type: data.get('type').toString(),
      attachments: [],
    })
      .then(() => close())
      .catch((error) => {
        console.error(error);
        window.alert(error.message || 'Buchung konnte nicht gespeichert werden.');
      });
  });

  return { overlay, open, close };
}

function createBookingDetailsModal({ onBookingUpdate, onBookingDelete }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal--details" role="dialog" aria-modal="true">
      <div class="details-head">
        <h3 id="detailsTitle">Buchungsdetails</h3>
        <button class="btn btn--icon" data-close aria-label="Schließen">✕</button>
      </div>
      <div class="details-content">
        <div class="details-grid" id="detailsMeta"></div>
        <section>
          <h4>Anhänge (Fotos / Dateien)</h4>
          <input id="detailsUploadInput" type="file" multiple />
          <p class="hint-text">Uploads sind nur hier in den Buchungsdetails möglich.</p>
          <ul class="attachment-list" id="attachmentList"></ul>
        </section>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn--danger" data-delete-booking>Buchung löschen</button>
        <button type="button" class="btn" data-close>Schließen</button>
      </div>
    </div>
  `;

  const meta = overlay.querySelector('#detailsMeta');
  const attachmentList = overlay.querySelector('#attachmentList');
  const uploadInput = overlay.querySelector('#detailsUploadInput');
  const detailsTitle = overlay.querySelector('#detailsTitle');
  let currentBooking = null;

  function renderDetails() {
    if (!currentBooking) return;
    detailsTitle.textContent = `Buchung: ${currentBooking.title}`;
    meta.innerHTML = `
      <article><span>Titel</span><strong>${escapeHtml(currentBooking.title)}</strong></article>
      <article><span>Container</span><strong>${escapeHtml(currentBooking.container)}</strong></article>
      <article><span>Kennzeichen</span><strong>${escapeHtml(currentBooking.kennzeichen)}</strong></article>
      <article><span>Auftrag</span><strong>${escapeHtml(currentBooking.auftrag)}</strong></article>
      <article><span>Lager</span><strong>${escapeHtml(currentBooking.lager || '-')}</strong></article>
      <article><span>Datum</span><strong>${escapeHtml(currentBooking.date)}</strong></article>
      <article><span>Typ</span><strong>${escapeHtml(getBookingTypeLabel(currentBooking.type))}</strong></article>
    `;

    attachmentList.innerHTML = '';
    if (!(currentBooking.attachments || []).length) {
      const empty = document.createElement('li');
      empty.className = 'attachment-empty';
      empty.textContent = 'Noch keine Anhänge vorhanden.';
      attachmentList.append(empty);
      return;
    }

    currentBooking.attachments.forEach((file, idx) => {
      const item = document.createElement('li');
      item.className = 'attachment-item';
      const isImage = (file.type || '').startsWith('image/');
      item.innerHTML = `
        <div><strong>${escapeHtml(file.name)}</strong><p>${Math.ceil(file.size / 1024)} KB</p></div>
        <div class="attachment-actions">
          <a class="btn" href="${file.url}" download="${escapeHtml(file.name)}">Download</a>
          <button class="btn btn--danger" data-delete="${idx}">Entfernen</button>
        </div>
      `;
      if (isImage) {
        const img = document.createElement('img');
        img.src = file.url;
        img.alt = file.name;
        img.className = 'attachment-preview';
        item.prepend(img);
      }
      attachmentList.append(item);
    });
  }

  function open(booking) {
    currentBooking = booking;
    renderDetails();
    overlay.classList.add('is-open');
  }

  function close() {
    overlay.classList.remove('is-open');
    uploadInput.value = '';
    currentBooking = null;
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.dataset.close !== undefined) {
      close();
      return;
    }

    if (event.target.dataset.deleteBooking !== undefined && currentBooking) {
      if (!window.confirm(`Buchung „${currentBooking.title}“ wirklich löschen?`)) return;
      onBookingDelete(currentBooking.id)
        .then(() => close())
        .catch((error) => {
          console.error(error);
          window.alert(error.message || 'Buchung konnte nicht gelöscht werden.');
        });
      return;
    }

    if (event.target.dataset.delete !== undefined && currentBooking) {
      const index = Number(event.target.dataset.delete);
      const removed = currentBooking.attachments.splice(index, 1)[0];
      if (removed?.url) URL.revokeObjectURL(removed.url);
      onBookingUpdate(currentBooking);
      renderDetails();
    }
  });

  uploadInput.addEventListener('change', () => {
    if (!currentBooking) return;
    const files = Array.from(uploadInput.files || []);
    const mapped = files.map((file) => ({
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      url: URL.createObjectURL(file),
    }));
    currentBooking.attachments = [...(currentBooking.attachments || []), ...mapped];
    onBookingUpdate(currentBooking);
    uploadInput.value = '';
    renderDetails();
  });

  return { overlay, open, close };
}
