/* Read-only DOM collector for a BHX page already opened normally in a browser.
 * No cookies, login tokens, account details or hidden application state are read.
 * Import this function into a browser automation tool, or evaluate it in DevTools.
 * Visit category pages using the website, wait for prices to settle, then collect.
 */
function readBhxPage() {
  if (location.origin !== 'https://www.bachhoaxanh.com') throw new Error('Open the BHX website first');
  return Array.from(document.querySelectorAll('a[id^="product_"]')).map(link => {
    const box = link.closest('[product-code]');
    const price = box?.querySelector('.product_price');
    const name = box?.querySelector('.product_name');
    const per = price?.querySelector('div')?.textContent?.trim();
    const near = name?.parentElement?.nextElementSibling?.textContent?.trim();
    return [
      link.id.replace('product_', ''), name?.textContent?.trim(),
      per?.startsWith('/') ? per.slice(1).trim() : (/^\d+(?:[.,]\d+)?\s*(?:g|kg|ml|lít|l)$/i.test(near || '') ? near : ''),
      price ? Array.from(price.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() : '',
      box?.querySelector('.line-through')?.textContent?.trim() || '',
      new URL(link.href).pathname, location.pathname,
      !!box?.querySelector('.btn_buy_product:not([disabled])'),
    ];
  }).filter(row => row[1] && row[3]);
}
if (typeof module !== 'undefined') module.exports = { readBhxPage };
