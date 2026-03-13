export function createBookingModal({ onSave }) {
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
            <option value="container">Container (Blau)</option>
            <option value="delivery">Lieferung (Grün)</option>
            <option value="service">Service (Grau)</option>
            <option value="problem">Problem / Verzögerung (Rot)</option>
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
    if (event.target === overlay || event.target.dataset.close !== undefined) {
      close();
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    onSave({
      id: crypto.randomUUID(),
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
