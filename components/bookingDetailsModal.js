export function createBookingDetailsModal({ onBookingUpdate }) {
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
        <button type="button" class="btn" data-close>Schließen</button>
      </div>
    </div>
  `;

  const meta = overlay.querySelector('#detailsMeta');
  const attachmentList = overlay.querySelector('#attachmentList');
  const uploadInput = overlay.querySelector('#detailsUploadInput');
  const detailsTitle = overlay.querySelector('#detailsTitle');

  let currentBooking = null;

  function render() {
    if (!currentBooking) return;

    detailsTitle.textContent = `Buchung: ${currentBooking.title}`;
    meta.innerHTML = `
      <article><span>Titel</span><strong>${escapeHtml(currentBooking.title)}</strong></article>
      <article><span>Container</span><strong>${escapeHtml(currentBooking.container)}</strong></article>
      <article><span>Kennzeichen</span><strong>${escapeHtml(currentBooking.kennzeichen)}</strong></article>
      <article><span>Auftrag</span><strong>${escapeHtml(currentBooking.auftrag)}</strong></article>
      <article><span>Datum</span><strong>${escapeHtml(currentBooking.date)}</strong></article>
      <article><span>Typ</span><strong>${escapeHtml(currentBooking.type)}</strong></article>
    `;

    attachmentList.innerHTML = '';
    if (!currentBooking.attachments?.length) {
      const empty = document.createElement('li');
      empty.className = 'attachment-empty';
      empty.textContent = 'Noch keine Anhänge vorhanden.';
      attachmentList.append(empty);
      return;
    }

    currentBooking.attachments.forEach((file, idx) => {
      const item = document.createElement('li');
      item.className = 'attachment-item';
      const isImage = file.type.startsWith('image/');
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(file.name)}</strong>
          <p>${Math.ceil(file.size / 1024)} KB</p>
        </div>
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
    render();
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
      const [removed] = currentBooking.attachments.splice(index, 1);
      if (removed?.url) URL.revokeObjectURL(removed.url);
      onBookingUpdate(currentBooking);
      render();
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
    render();
  });

  return { overlay, open, close };
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
