const { clean } = require('../graduation/service');

class CardError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// Ready-made looks. Each one is checked by the tests for readable text on the card.
const PALETTES = {
  green: { bg: '#e3f5e8', card: '#fffdf6', accent: '#2e9e6e', ink: '#1f3d2e' },
  pink: { bg: '#ffe9f0', card: '#fffafb', accent: '#d9487a', ink: '#4a2333' },
  purple: { bg: '#efe8ff', card: '#fdfbff', accent: '#7656dd', ink: '#2e2450' },
  blue: { bg: '#e3f1ff', card: '#fbfdff', accent: '#2a78c8', ink: '#1d3350' },
  yellow: { bg: '#fff4d6', card: '#fffdf5', accent: '#c47f00', ink: '#3f2f0c' },
  mono: { bg: '#efefef', card: '#ffffff', accent: '#222222', ink: '#151515' },
};
const FONTS = ['cute', 'elegant', 'modern'];
const ICONS = ['cap', 'diploma', 'bouquet', 'book', 'star', 'rice', 'heart', 'laptop'];
const MODULES = ['info', 'countdown', 'calendar', 'wishes', 'music', 'cap'];

const HEX = /^#[0-9a-f]{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const line = (value, max) => clean(value, max).replace(/\n+/g, ' ');

function colour(value, field) {
  const hex = String(value ?? '').trim().toLowerCase();
  if (!HEX.test(hex)) throw new CardError(`Màu ${field} không hợp lệ.`);
  return hex;
}

// WCAG relative luminance and contrast ratio.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const textOn = hex => (contrast(hex, '#ffffff') >= contrast(hex, '#111111') ? '#ffffff' : '#111111');

function httpsUrl(value, field) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw.length > 400) throw new CardError(`Link ${field} quá dài.`);
  let url;
  try { url = new URL(raw); } catch (_) { throw new CardError(`Link ${field} không hợp lệ.`); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new CardError(`Link ${field} phải bắt đầu bằng https://`);
  return url.href;
}

function phone(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (!/^\+?[\d .-]{8,20}$/.test(raw)) throw new CardError('Số điện thoại không hợp lệ.');
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length < 8 || digits.length > 15) throw new CardError('Số điện thoại không hợp lệ.');
  return raw.replace(/\s+/g, ' ');
}

function date(value) {
  const raw = String(value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const parsed = match && new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  if (!match || parsed.getUTCMonth() !== +match[2] - 1 || parsed.getUTCDate() !== +match[3] || +match[1] < 2024 || +match[1] > 2100) {
    throw new CardError('Ngày tổ chức không hợp lệ.');
  }
  return raw;
}

function time(value, required) {
  const raw = String(value ?? '').trim();
  if (!raw && !required) return '';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) throw new CardError('Giờ không hợp lệ (dạng 11:30).');
  return raw;
}

const photoId = value => (value && UUID.test(String(value)) ? String(value) : null);

function place(input, withPhoto) {
  const value = input && typeof input === 'object' ? input : {};
  return {
    name: line(value.name, 80),
    address: line(value.address, 160),
    mapUrl: httpsUrl(value.mapUrl, 'bản đồ'),
    ...(withPhoto ? { photoId: photoId(value.photoId) } : {}),
  };
}

function content(input) {
  const value = input && typeof input === 'object' ? input : {};
  const nickname = line(value.nickname, 24);
  if (!nickname) throw new CardError('Bạn nhập tên hiển thị trên thiệp nhé.');
  const start = time(value.start, true);
  const end = time(value.end, false);
  if (end && end <= start) throw new CardError('Giờ kết thúc phải sau giờ bắt đầu.');
  const contacts = (Array.isArray(value.contacts) ? value.contacts : []).slice(0, 2)
    .map(c => ({ name: line(c?.name, 40), note: line(c?.note, 40), phone: phone(c?.phone) }))
    .filter(c => c.name || c.phone);
  return {
    nickname,
    fullName: line(value.fullName, 60),
    headline: line(value.headline, 30) || 'Lễ tốt nghiệp',
    school: line(value.school, 80),
    major: line(value.major, 80),
    invite: clean(value.invite, 200),
    date: date(value.date),
    start,
    end,
    venue: place(value.venue, true),
    parking: place(value.parking, false),
    contacts,
  };
}

function look(input) {
  const value = input && typeof input === 'object' ? input : {};
  const preset = Object.hasOwn(PALETTES, value.palette) ? value.palette : 'custom';
  const source = preset === 'custom' ? (value.colors || {}) : PALETTES[preset];
  const colors = { bg: colour(source.bg, 'nền'), card: colour(source.card, 'thẻ'), accent: colour(source.accent, 'chính'), ink: colour(source.ink, 'chữ') };
  const portraitIn = value.portrait && typeof value.portrait === 'object' ? value.portrait : {};
  const portrait = portraitIn.type === 'photo' && photoId(portraitIn.photoId)
    ? { type: 'photo', photoId: photoId(portraitIn.photoId) }
    : { type: 'icon', icon: ICONS.includes(portraitIn.icon) ? portraitIn.icon : 'cap' };
  const modulesIn = value.modules && typeof value.modules === 'object' ? value.modules : {};
  const modules = Object.fromEntries(MODULES.map(key => [key, modulesIn[key] !== false]));
  return { palette: preset, colors, font: FONTS.includes(value.font) ? value.font : 'cute', portrait, modules };
}

function email(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.length > 120 || !/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/.test(raw)) throw new CardError('Email không hợp lệ.');
  return raw;
}

function normalizeCard(input) {
  return { content: content(input?.content), look: look(input?.look) };
}

module.exports = { CardError, PALETTES, FONTS, ICONS, MODULES, normalizeCard, contrast, textOn, httpsUrl, phone, email, photoId };
