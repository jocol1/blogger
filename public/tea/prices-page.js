// Standalone price page (/gia): the same board as the café, without needing to enter the game.
(function () {
  let locale = 'vi';
  try { if (localStorage.getItem('locly-tea-language') === 'en') locale = 'en'; } catch {}
  const words = window.TeaGameWords;
  const t = (key, vars = {}) => String(words[locale]?.[key] ?? words.en?.[key] ?? key).replace(/\{(\w+)\}/g, (match, name) => vars[name] ?? match);
  document.documentElement.lang = locale;
  window.TeaPricesUI({ t, locale: () => locale, standalone: true, search: location.search, close() { location.href = '/tra-da'; } }).open();
})();
