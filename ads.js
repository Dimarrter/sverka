(() => {
  const slot = document.getElementById('ad-banner');
  const status = document.getElementById('ad-status');
  if (!slot || !status || document.getElementById('aclib')) return;

  const unavailable = () => {
    slot.hidden = true;
    status.textContent = 'Сейчас нет доступной рекламы.';
  };
  // Local previews must not generate advertising impressions.
  if (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
    slot.hidden = true;
    status.textContent = 'Реклама подключается на опубликованном сайте.';
    return;
  }
  const library = document.createElement('script');
  library.id = 'aclib';
  library.type = 'text/javascript';
  library.src = 'https://acscdn.com/script/aclib.js';
  library.addEventListener('load', () => {
    if (!window.aclib || typeof window.aclib.runBanner !== 'function') {
      unavailable();
      return;
    }
    // Adcash renders in the invoking script's parent; do not refresh the zone.
    const tag = document.createElement('script');
    tag.type = 'text/javascript';
    tag.textContent = "aclib.runBanner({ zoneId: '12330158' });";
    slot.appendChild(tag);
    status.textContent = 'Реклама · Adcash';
  });
  library.addEventListener('error', unavailable);
  document.head.appendChild(library);
})();
