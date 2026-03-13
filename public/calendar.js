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

const DARK_MODE_KEY = 'containerplanung.darkmode';
const TOKEN_KEY = 'containerplanung-token';
const SSO_SOURCE_HOST = 'test.paletten-ms.de';

const weekdays = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
let viewMode = 'month';
let cursorDate = new Date();

const bookings = [
  {
    id: createId(),
    title: 'Nova Lieferung',
    container: 'CAIU3160880',
    kennzeichen: 'BGL-AB123',
    auftrag: '845233',
    date: '2026-03-12',
    type: 'hand_unload',
    attachments: [],
  },
  {
    id: createId(),
    title: 'Container Check',
    container: 'MSKU4074217',
    kennzeichen: 'M-CT901',
    auftrag: '801116',
    date: toYmd(new Date()),
    type: 'direct_unload',
    attachments: [],
  },
];

const bookingModal = createBookingModal({
  onSave(newBooking) {
    bookings.push(newBooking);
    render();
  },
});

const detailsModal = createBookingDetailsModal({
  onBookingUpdate(updated) {
    const index = bookings.findIndex((booking) => booking.id === updated.id);
    if (index >= 0) bookings[index] = updated;
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
  render();
}

async function ensureAuthenticated() {
  const existingToken = localStorage.getItem(TOKEN_KEY) || '';
  if (existingToken) return true;

  const url = new URL(window.location.href);
  const incomingSsoToken = getSsoTokenFromUrl(url);
  const cameFromSsoHost = didComeFromSsoHost();

  if (incomingSsoToken) {
    const exchangedToken = await exchangeSsoToken(incomingSsoToken);
    if (exchangedToken) {
      localStorage.setItem(TOKEN_KEY, exchangedToken);
      cleanupSsoParams(url);
      return true;
    }
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

async function exchangeSsoToken(ssoToken) {
  try {
    const response = await fetch('/api/auth/sso-forward-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: ssoToken }),
    });

    if (!response.ok) return '';
    const body = await response.json();
    return body?.token || '';
  } catch (_error) {
    return '';
  }
}

function cleanupSsoParams(url) {
  url.searchParams.delete('ssoToken');
  url.searchParams.delete('session');
  url.searchParams.delete('token');
  url.hash = '';
  window.history.replaceState({}, document.title, url.toString());
}

function getSsoTokenFromUrl(url) {
  const directToken = url.searchParams.get('ssoToken') || url.searchParams.get('token') || url.searchParams.get('session');
  if (directToken) return directToken;

  if (url.hash.startsWith('#')) {
    const hashParams = new URLSearchParams(url.hash.slice(1));
    return hashParams.get('ssoToken') || hashParams.get('token') || hashParams.get('session') || '';
  }

  return '';
}

function renderWeekdays() {
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
  } else {
    const { start, end } = getWeekRange(cursorDate);
    rangeLabel.textContent = `${start.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} – ${end.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  }
}

function renderGrid() {
  calendarGrid.innerHTML = '';
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
      Auftrag: ${escapeHtml(booking.auftrag)}
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
  weekViewBtn?.classList.toggle('is-active', viewMode === 'week');
  weekViewBtn?.classList.toggle('btn--primary', viewMode === 'week');
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

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
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
  const isDark = localStorage.getItem(DARK_MODE_KEY) === '1';
  document.body.classList.toggle('theme-dark', isDark);
  if (darkModeToggle) darkModeToggle.textContent = isDark ? 'Light Mode' : 'Dark Mode';
}

todayBtn?.addEventListener('click', () => {
  cursorDate = new Date();
  render();
});

monthViewBtn?.addEventListener('click', () => {
  viewMode = 'month';
  render();
});

weekViewBtn?.addEventListener('click', () => {
  viewMode = 'week';
  render();
});

prevBtn?.addEventListener('click', () => {
  cursorDate = new Date(cursorDate);
  if (viewMode === 'month') cursorDate.setMonth(cursorDate.getMonth() - 1);
  else cursorDate.setDate(cursorDate.getDate() - 7);
  render();
});

nextBtn?.addEventListener('click', () => {
  cursorDate = new Date(cursorDate);
  if (viewMode === 'month') cursorDate.setMonth(cursorDate.getMonth() + 1);
  else cursorDate.setDate(cursorDate.getDate() + 7);
  render();
});

gearMenuToggle?.addEventListener('click', (event) => {
  event.stopPropagation();
  gearMenu.classList.toggle('is-open');
});

document.addEventListener('click', () => gearMenu?.classList.remove('is-open'));
gearMenuDropdown?.addEventListener('click', (event) => event.stopPropagation());

darkModeToggle?.addEventListener('click', () => {
  const enabled = !document.body.classList.contains('theme-dark');
  document.body.classList.toggle('theme-dark', enabled);
  localStorage.setItem(DARK_MODE_KEY, enabled ? '1' : '0');
  darkModeToggle.textContent = enabled ? 'Light Mode' : 'Dark Mode';
  gearMenu?.classList.remove('is-open');
});

moduleDashboardBtn?.addEventListener('click', async () => {
  const authToken = localStorage.getItem(TOKEN_KEY) || '';

  if (!authToken) {
    window.location.href = 'https://test.paletten-ms.de/dashboard.html';
    return;
  }

  try {
    const response = await fetch('/api/auth/sso-forward-token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!response.ok) throw new Error('SSO-Weiterleitungs-Token konnte nicht erstellt werden.');

    const body = await response.json();
    const ssoToken = body?.ssoToken || '';
    const dashboardUrl = new URL('https://test.paletten-ms.de/dashboard.html');

    if (ssoToken) {
      dashboardUrl.searchParams.set('ssoToken', ssoToken);
      dashboardUrl.searchParams.set('source', window.location.host);
    }

    window.location.href = dashboardUrl.toString();
  } catch (_error) {
    window.location.href = 'https://test.paletten-ms.de/dashboard.html';
  }
});

logoutBtn?.addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
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
      id: createId(),
      title: data.get('title').toString().trim(),
      container: data.get('container').toString().trim(),
      kennzeichen: data.get('kennzeichen').toString().trim(),
      auftrag: data.get('auftrag').toString().trim(),
      date: data.get('date').toString(),
      type: data.get('type').toString(),
      attachments: [],
    });
    close();
  });

  return { overlay, open, close };
}

function createBookingDetailsModal({ onBookingUpdate }) {
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
      <div class="modal-actions"><button type="button" class="btn" data-close>Schließen</button></div>
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
