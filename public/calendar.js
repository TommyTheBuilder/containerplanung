import { createBookingModal } from '/components/bookingModal.js';

const weekdayHeader = document.getElementById('weekdayHeader');
const calendarGrid = document.getElementById('calendarGrid');
const rangeLabel = document.getElementById('rangeLabel');
const todayBtn = document.getElementById('todayBtn');
const monthViewBtn = document.getElementById('monthViewBtn');
const weekViewBtn = document.getElementById('weekViewBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

const weekdays = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
let viewMode = 'month';
let cursorDate = new Date();

const bookings = [
  {
    id: crypto.randomUUID(),
    title: 'Nova Lieferung',
    container: 'CAIU3160880',
    kennzeichen: 'BGL-AB123',
    auftrag: '845233',
    date: '2026-03-12',
    type: 'delivery',
  },
  {
    id: crypto.randomUUID(),
    title: 'Container Check',
    container: 'MSKU4074217',
    kennzeichen: 'M-CT901',
    auftrag: '801116',
    date: toYmd(new Date()),
    type: 'container',
  },
];

const modal = createBookingModal({
  onSave(newBooking) {
    bookings.push(newBooking);
    render();
  },
});
document.body.append(modal.overlay);

function render() {
  renderWeekdays();
  renderRangeLabel();
  renderGrid();
  syncViewButtons();
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
    matches.forEach((booking) => dayCard.append(createBookingCard(booking)));

    dayCard.addEventListener('click', (event) => {
      if (event.target.closest('.booking-card')) return;
      modal.open(ymd);
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

function createBookingCard(booking) {
  const card = document.createElement('div');
  card.className = 'booking-card';
  card.draggable = true;
  card.dataset.type = booking.type;
  card.innerHTML = `
    <strong>🚛 ${escapeHtml(booking.title)}</strong>
    Container: ${escapeHtml(booking.container)}<br />
    Kennzeichen: ${escapeHtml(booking.kennzeichen)}<br />
    Auftrag: ${escapeHtml(booking.auftrag)}
  `;

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

  for (let i = startWeekDay; i > 0; i -= 1) {
    const prevDate = new Date(year, month, 1 - i);
    cells.push({ date: prevDate, isCurrentMonth: false });
  }

  for (let day = 1; day <= monthEnd.getDate(); day += 1) {
    cells.push({ date: new Date(year, month, day), isCurrentMonth: true });
  }

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
  monthViewBtn.classList.toggle('is-active', viewMode === 'month');
  monthViewBtn.classList.toggle('btn--primary', viewMode === 'month');
  weekViewBtn.classList.toggle('is-active', viewMode === 'week');
  weekViewBtn.classList.toggle('btn--primary', viewMode === 'week');
}

function toYmd(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isToday(date) {
  const now = new Date();
  return toYmd(now) === toYmd(date);
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

todayBtn.addEventListener('click', () => {
  cursorDate = new Date();
  render();
});

monthViewBtn.addEventListener('click', () => {
  viewMode = 'month';
  render();
});

weekViewBtn.addEventListener('click', () => {
  viewMode = 'week';
  render();
});

prevBtn.addEventListener('click', () => {
  cursorDate = new Date(cursorDate);
  if (viewMode === 'month') {
    cursorDate.setMonth(cursorDate.getMonth() - 1);
  } else {
    cursorDate.setDate(cursorDate.getDate() - 7);
  }
  render();
});

nextBtn.addEventListener('click', () => {
  cursorDate = new Date(cursorDate);
  if (viewMode === 'month') {
    cursorDate.setMonth(cursorDate.getMonth() + 1);
  } else {
    cursorDate.setDate(cursorDate.getDate() + 7);
  }
  render();
});

render();
