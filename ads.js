(() => {
  const panel = document.getElementById('ad-choice');
  const slot = document.getElementById('ad-banner');
  const status = document.getElementById('ad-status');
  const accept = document.getElementById('ad-accept');
  const decline = document.getElementById('ad-decline');
  const settings = document.getElementById('ad-settings');
  let started = false;

  // Consent is limited to this page visit. No third-party requests before it.
  accept.addEventListener('click', () => {
    if (started) return;
    started = true;
    accept.disabled = true;
    panel.hidden = true;
    slot.hidden = false;
    status.textContent = 'Загрузка рекламы…';
    const library = document.createElement('script');
    library.id = 'aclib';
    library.type = 'text/javascript';
    library.src = 'https://acscdn.com/script/aclib.js';
    library.addEventListener('load', () => {
      if (!window.aclib || typeof window.aclib.runBanner !== 'function') {
        status.textContent = 'Реклама недоступна. Сравнение файлов работает как обычно.';
        slot.hidden = true;
        return;
      }
      // The provider renders the banner in this script's parent element.
      const tag = document.createElement('script');
      tag.type = 'text/javascript';
      tag.textContent = "aclib.runBanner({ zoneId: '12330158' });";
      slot.appendChild(tag);
      status.textContent = 'Реклама · Adcash';
    });
    library.addEventListener('error', () => {
      status.textContent = 'Реклама недоступна. Сравнение файлов работает как обычно.';
      slot.hidden = true;
    });
    document.head.appendChild(library);
  });

  decline.addEventListener('click', () => {
    panel.hidden = true;
    status.textContent = 'Реклама отключена на этой странице.';
  });

  settings.addEventListener('click', () => {
    if (started) {
      if (window.confirm('Отключить рекламу и перезагрузить страницу? Загруженные прайсы и результат сбросятся. При новом открытии реклама снова будет выключена.')) {
        window.location.reload();
      }
      return;
    }
    panel.hidden = false;
    accept.focus();
  });
})();
