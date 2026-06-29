import { getGeminiApiKey } from './gemini';
import { GoogleGenerativeAI } from '@google/generative-ai';

const CATEGORIES = [
  { key: 'dairy',    emoji: '\u{1F95B}', he: 'מוצרי חלב',         en: 'Dairy' },
  { key: 'meat',     emoji: '\u{1F969}', he: 'בשר / עוף / דגים',  en: 'Meat & Fish' },
  { key: 'produce',  emoji: '\u{1F966}', he: 'ירקות ופירות',      en: 'Produce' },
  { key: 'bakery',   emoji: '\u{1F35E}', he: 'אפייה ולחם',        en: 'Bakery' },
  { key: 'dryGoods', emoji: '\u{1F35D}', he: 'יבשים וקטניות',     en: 'Dry Goods' },
  { key: 'spices',   emoji: '\u{1F9C2}', he: 'תבלינים ובישול',    en: 'Spices & Cooking' },
  { key: 'drinks',   emoji: '\u{1F9C3}', he: 'שתייה',             en: 'Drinks' },
  { key: 'snacks',   emoji: '\u{1F36B}', he: 'חטיפים ומתוקים',    en: 'Snacks & Sweets' },
  { key: 'cleaning', emoji: '\u{1F9FC}', he: 'ניקיון וחד"פ',      en: 'Cleaning' },
  { key: 'frozen',   emoji: '\u{2744}\u{FE0F}', he: 'קפואים',     en: 'Frozen' },
  { key: 'baby',     emoji: '\u{1F476}', he: 'תינוקות',            en: 'Baby' },
  { key: 'sauces',   emoji: '\u{1F336}\u{FE0F}', he: 'שימורים ורטבים', en: 'Canned & Sauces' },
  { key: 'other',    emoji: '\u{1F9C8}', he: 'אחר',               en: 'Other' },
];

// ── User-configurable category layer ──────────────────────────────────────
// The 13 built-ins above are fixed; on top of them the user can add their own
// categories and reorder ALL of them to match their supermarket's aisle order.
// Config is injected from the store (profile.shoppingCustomCategories / .order)
// via setShoppingCatConfig, called synchronously during render so every pure
// helper below (getCategoryMeta/getAllCategories/groupByCategory) sees it.
let _customCats = [];   // [{ key, he, en, emoji }]
let _catOrder = null;   // [key, ...] — user's aisle order, or null for default

export const setShoppingCatConfig = ({ custom, order } = {}) => {
  _customCats = Array.isArray(custom) ? custom.filter((c) => c && c.key) : [];
  _catOrder = Array.isArray(order) && order.length ? order : null;
};

export const isCustomCategory = (key) => _customCats.some((c) => c.key === key);

export const getCategoryMeta = (key) =>
  CATEGORIES.find((c) => c.key === key) ||
  _customCats.find((c) => c.key === key) ||
  CATEGORIES[CATEGORIES.length - 1];

// All categories (built-in + custom) in the user's preferred order. Unknown /
// unordered keys keep their natural order; "other" always sinks to the bottom.
export const getAllCategories = () => {
  const pool = [...CATEGORIES, ..._customCats];
  const byKey = (k) => pool.find((c) => c.key === k);
  const merged = [];
  const seen = new Set();
  if (_catOrder) {
    for (const k of _catOrder) {
      if (seen.has(k)) continue;
      const c = byKey(k);
      if (c) { merged.push(c); seen.add(k); }
    }
  }
  for (const c of pool) {
    if (!seen.has(c.key)) { merged.push(c); seen.add(c.key); }
  }
  const others = merged.filter((c) => c.key === 'other');
  return [...merged.filter((c) => c.key !== 'other'), ...others];
};

// The default key order (built-ins + custom appended), used to seed the
// reorder UI before the user has saved a custom order.
export const getDefaultCategoryOrder = () => getAllCategories().map((c) => c.key);

const KEYWORDS = {
  dairy: [
    'חלב', 'גבינה', 'גבינת', 'יוגורט', 'יופלה', 'שמנת', 'שמנת מתוקה', 'שמנת חמוצה',
    'קוטג', "קוטג'", 'לבן', 'לבנה', 'קשקבל', 'מוצרלה', 'מוצרלה', 'פרמזן', 'פרמז',
    'ריקוטה', 'מסקרפונה', 'חמאה', 'מרגרינה', 'מעדן', 'מעדני', 'דנונה', 'יופי',
    'אקטיביה', 'גו', 'מילקי', 'דני', 'גבינה צהובה', 'גבינה לבנה', 'גבינה מותכת',
    'עמק', 'בולגרית', 'צפתית', 'פטה', 'פטה', 'קממבר', 'ברי', 'גאודה', 'אמנטל',
    'טוב טעם', 'נפוליאון', 'שמנת לבישול', 'רוקפור', 'חלב סויה', 'חלב שקדים',
    'חלב שיבולת', 'חלב קוקוס', 'משקה שקדים', 'שוקו', 'אשל', 'גיל', 'תנובה',
    'יטבתה', 'טרה', 'פסטרם גבינה',
  ],
  meat: [
    'עוף', 'עוף שלם', 'בקר', 'טחון', 'בשר טחון', 'שניצל', 'סלמון', 'טונה טרי',
    'נקניק', 'נקניקיה', 'נקניקיות', 'סטייק', 'כבש', 'טלה', 'הודו', 'פרגית',
    'כנף', 'כנפיים', 'שוקיים', 'חזה עוף', 'ירך עוף', 'שוקי עוף', 'כרעיים',
    'פילה', 'פילה עוף', 'דג', 'דגים', 'בשר', 'בשר בקר', 'קבב', 'המבורגר',
    'אנטריקוט', 'פילה בקר', 'אונטריב', 'אסאדו', 'צלעות', 'נתח', 'כתף',
    'אמנון', 'דניס', 'ברמונדי', 'מוסר', 'לברק', 'לוקוס', 'בורי', 'סרדינים',
    'פסטרמה', 'סלמי', 'קבנוס', 'קציצות', 'נתחי', 'שניצלונים', 'המבורגרים',
    'פרוסות הודו', 'נקניקיות עוף', 'דג סלמון', 'שווארמה',
  ],
  produce: [
    'עגבני', 'עגבניה', 'עגבניות', 'מלפפון', 'מלפפונים', 'בצל', 'בצל ירוק',
    'שום', 'גזר', 'תפוח אדמה', 'תפו"א', 'בטטה', 'תפוח', 'תפוחים', 'בננה',
    'בננות', 'אבוקדו', 'לימון', 'לימונים', 'תפוז', 'תפוזים', 'קלמנטינה',
    'קלמנטינות', 'מנדרינה', 'פלפל', 'פלפלים', 'חסה', 'כרוב', 'כרוב אדום',
    'ברוקולי', 'כרובית', 'תרד', 'פטרוזיליה', 'כוסברה', 'שמיר', 'נענע',
    'בזיליקום', 'רוקט', 'בייבי', 'אפרסק', 'נקטרינה', 'שזיף', 'ענב', 'ענבים',
    'אגס', 'אגסים', 'מנגו', 'אננס', 'קיווי', 'תות', 'תותים', 'פטל',
    'אוכמניות', 'רימון', 'רימונים', 'אשכולית', 'פומלה', 'פומלית', 'דלעת',
    'דלורית', 'קישוא', 'קישואים', 'חציל', 'חצילים', 'סלק', 'צנונית', 'צנון',
    'תירס', 'אפונה', 'שעועית ירוקה', 'שעועית', 'אדממה', 'פטריות', 'פטרייה',
    'ירקות', 'פירות', 'ירוקים', 'עלים', 'עשבי תיבול', 'שרי', 'בטטה',
    'סלרי', 'שמיר', 'כרישה', 'לפת', 'קולורבי', 'ארטישוק', 'במיה',
    'מלון', 'אבטיח', 'תאנים', 'תמרים', 'משמש', 'דובדבן', 'דובדבנים',
    'ליצ\'י', 'קרמבולה', 'גויאבה', 'חבוש', 'אפרסמון', 'זנגביל טרי',
  ],
  bakery: [
    'לחם', 'לחמניה', 'לחמניות', 'פיתה', 'פיתות', 'חלה', 'חלות', 'עוגה',
    'עוגת', 'עוגיות', 'בייגל', 'בייגלה', 'טורטייה', 'טורטיות', 'קרואסון',
    'סופגניה', 'סופגניות', 'בורקס', 'בורקסים', 'מאפה', 'מאפים', 'פוקצ\'ה',
    'באגט', 'לחם שיפון', 'לחם מלא', 'לחם אחיד', 'לחם קל', 'רול', 'פרנה',
    'מצה', 'מצות', 'קרקרים', 'פריכיות', 'גבעול', 'דנונה אפיה', 'רוגלך',
    'מאפין', 'דונאט', 'בריוש', 'לאפה',
  ],
  dryGoods: [
    'אורז', 'פסטה', 'עדשים', 'עדשים כתומות', 'חומוס יבש', 'גרגירי חומוס',
    'קמח', 'קמח תופח', 'סוכר', 'סוכר חום', 'שעועית יבשה', 'קוסקוס', 'פתיתים',
    'בורגול', 'קינואה', 'גריסים', 'אטריות', 'ספגטי', 'פנה', 'מקרוני',
    'נודלס', 'אטריות אורז', 'ביצים', 'ביצה', 'דגנים', 'קורנפלקס', 'שיבולת שועל',
    'קוואקר', 'גרנולה', 'מוזלי', 'אבקת אפיה', 'שמרים', 'סודה לשתיה',
    'פירורי לחם', 'פתי בר', 'תפוצ\'יפס', 'במבה אפויה', 'קמח מלא', 'דוחן',
    'כוסמת', 'פריקי', 'מלאווח', 'ג\'חנון', 'בצק עלים',
  ],
  spices: [
    'מלח', 'מלח גס', 'פלפל שחור', 'פלפל לבן', 'פפריקה', 'פפריקה מתוקה',
    'פפריקה חריפה', 'כורכום', 'שמן', 'שמן זית', 'שמן קנולה', 'שמן חמניות',
    'שמן קוקוס', 'חומץ', 'חומץ בלסמי', 'קינמון', 'זנגביל', 'כמון', 'אורגנו',
    'רוזמרין', 'טימין', 'זעתר', 'סומק', 'הל', 'ציפורן', 'אגוז מוסקט',
    'תבלין', 'תבלינים', 'מרק עוף', 'אבקת מרק', 'אבקת שום', 'אבקת בצל',
    'רוטב סויה', 'סויה', 'בייקינג', 'וניל', 'תמצית וניל', 'סוכר וניל',
    'קוקוס', 'שומשום', 'פרג', 'זרעי צ\'יה', 'חרדל גרגירים', 'מלח לימון',
  ],
  drinks: [
    'מים', 'מים מינרלים', 'מים מינרליים', 'קולה', 'קוקה קולה', 'מיץ', 'בירה',
    'יין', 'יין אדום', 'יין לבן', 'ערק', 'וודקה', 'וויסקי', 'סודה', 'לימונדה',
    'תה', 'תה ירוק', 'קפה', 'נס קפה', 'קפה שחור', 'אספרסו', 'קפסולות',
    'ספרייט', 'פאנטה', 'שוופס', 'שוויפס', 'טוניק', 'אנרגיה', 'רד בול',
    'סירופ', 'פריגת', 'פטל', 'משקה', 'משקה אנרגיה', 'XL', 'נביעות',
    'מי עדן', 'נסטי', 'תפוזינה', 'יוגורט שתיה', 'בירה שחורה',
  ],
  snacks: [
    'במבה', 'ביסלי', 'שוקולד', 'שוקולדים', 'שוקולד מריר', 'שוקולד חלב',
    'פרה', 'עוגיות', 'עוגיה', 'גלידה', 'ארטיק', 'סוכריות', 'סוכריה',
    'מסטיק', 'חטיף', 'חטיפים', 'וופל', 'וופלים', 'קרקר', 'פופקורן',
    'אגוזים', 'אגוזי מלך', 'שקדים', 'בוטנים', 'קשיו', 'פיסטוק', 'פקאן',
    'חמוציות', 'צימוקים', 'גרעינים', 'גרעיני חמניה', 'גרעינים שחורים',
    'חלבה', 'טחינה מתוקה', 'רפאלו', 'קינדר', 'אוראו', 'במבה ממולאת',
    'קליק', 'מקופלת', 'טורטית', 'דוריטוס', 'צ\'יטוס', 'תפוצ\'יפס',
    'אפרופו', 'שלוק', 'מנטוס', 'טופי', 'מרשמלו', 'נוגט',
  ],
  cleaning: [
    'אקונומיקה', 'סבון', 'סבון כלים', 'סבון ידיים', 'נוזל כלים', 'נייר טואלט',
    'שקיות', 'שקית', 'ספוג', 'ספוגים', 'אבקת כביסה', 'ג\'ל כביסה', 'מרכך כביסה',
    'מרכך', 'מטליות', 'מטלית', 'ניקוי', 'מנקה', 'פיירי', 'סנו', 'מגבונים',
    'נייר סופג', 'מגבות נייר', 'שקיות אשפה', 'שקיות זבל', 'כפפות', 'מברשת',
    'חד פעמי', 'חד"פ', 'כוסות', 'כוסות חד פעמי', 'צלחות', 'סכו"ם', 'סכום',
    'מפיות', 'נרות', 'נר', 'גפרורים', 'בלון', 'פחיות', 'אלומיניום',
    'ניילון נצמד', 'נייר אפיה', 'שמפו', 'מרכך שיער', 'משחת שיניים',
    'מברשת שיניים', 'דאודורנט', 'ג\'ל רחצה', 'אבקת ניקוי', 'מטהר אוויר',
    'בד מיקרופייבר', 'נוזל רצפות', 'אקונומיקה', 'מסיר שומנים',
  ],
  frozen: [
    'קפוא', 'קפואה', 'קפואים', 'קפואות', 'פיצה קפואה', 'ירקות קפואים',
    'בורקס קפוא', 'שניצל קפוא', 'גלידה', 'מלאווח קפוא', 'בצק עלים קפוא',
    'אפונה קפואה', 'תירס קפוא', 'נקניקיות קפואות', 'דג קפוא', 'במיה קפואה',
  ],
  baby: [
    'טיטולים', 'טיטול', 'חיתולים', 'מגבונים לתינוק', 'מזון תינוקות', 'בקבוק',
    'מוצץ', 'האגיס', 'פמפרס', 'מטרנה', 'סימילאק', 'נוטרילון', 'דייסה',
    'מחית', 'גמדים', 'ביבי',
  ],
  sauces: [
    'קטשופ', 'רוטב', 'רוטב עגבניות', 'רסק עגבניות', 'שימורים', 'טחינה גולמית',
    'טחינה', 'חרדל', 'מיונז', 'ריבה', 'דבש', 'סילאן', 'ממרח', 'ממרח שוקולד',
    'נוטלה', 'חמאת בוטנים', 'חומוס מוכן', 'חומוס', 'אמבה', 'סלט חצילים',
    'מטבוחה', 'חריף', 'סחוג', 'פסטו', 'עגבניות מרוסקות', 'רסק', 'תירס שימורים',
    'זיתים', 'מלפפון חמוץ', 'מלפפונים חמוצים', 'חמוצים', 'טונה שימורים',
    'תירס משומר', 'אפונה משומרת', 'רוטב צ\'ילי', 'טריאקי', 'ברביקיו',
    'סלט קצוץ', 'מיץ לימון',
  ],
};

const LS_KEY = 'cl_grocery_learned_dict';

const loadLearnedDict = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch { return {}; }
};

const saveLearnedDict = (dict) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(dict)); } catch { /* ignore */ }
};

// Merge a Firestore-synced dict into the local cache (called on subscribe so
// learnings flow between devices). Local entries win only on conflict-free keys.
export const applyExternalDict = (extDict) => {
  if (!extDict || typeof extDict !== 'object') return;
  const learned = loadLearnedDict();
  saveLearnedDict({ ...extDict, ...learned });
};

const QTY_REGEX = /^[\d.,]+\s*(?:x|×|X|ק"ג|קילו|גרם|ג'|מ"ל|ליטר|יח'|יחידות?)?\s*/;
// Strip leading bullets and list markers ("1.", "2)") — but NOT bare numbers,
// which are quantities handled by parseQuantity/QTY_REGEX.
const LINE_CLEAN = /^\s*(?:[-–—•·*]+|\d+[.)])\s+/;

let _idCounter = 0;
export const genItemId = () =>
  `item-${typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${(_idCounter++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`}`;

// Normalize a Hebrew product string for matching: strip niqqud, gershayim/
// quotes, punctuation, leading conjunction "ו", and collapse whitespace.
const NIQQUD = /[֑-ׇ]/g;
export const normalizeHebrew = (s) =>
  (s || '')
    .toLowerCase()
    .replace(NIQQUD, '')
    .replace(/["'`׳״.,()/\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Flat keyword index, sorted longest-first so the most specific keyword wins
// ("מלפפון חמוץ" → sauces beats "מלפפון" → produce). Built once, lazily.
let _index = null;
const buildIndex = () => {
  const arr = [];
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    for (const w of words) {
      const nw = normalizeHebrew(w);
      if (nw) arr.push({ w: nw, cat, len: nw.length });
    }
  }
  arr.sort((a, b) => b.len - a.len);
  return arr;
};

const matchCategory = (name) => {
  const n = normalizeHebrew(name);
  if (!n) return null;
  if (!_index) _index = buildIndex();
  const tokens = n.split(' ');
  for (const { w, cat, len } of _index) {
    // Very short keywords (≤2 chars) must match a whole token to avoid false
    // positives ("תה" inside "פתה", "יין" inside "בניין").
    if (len <= 2) {
      if (tokens.includes(w)) return cat;
    } else if (n.includes(w)) {
      return cat;
    }
  }
  return null;
};

export const parseQuantity = (raw) => {
  // Anchored: only a LEADING number counts as a quantity. This avoids treating
  // "5%" in "גבינה צהובה 5%" as a quantity. A "%" right after the number also
  // disqualifies it.
  const match = raw.match(/^(\d+(?:[.,]\d+)?)(?!%)\s*(x|×|X|ק"ג|קילו|גרם|ג'|מ"ל|ליטר|יח'|יחידות?)?/);
  if (!match) return { qty: null, unit: null };
  return { qty: match[1], unit: match[2] || null };
};

export const parseShoppingText = (text) => {
  const lines = text
    .split(/[\n,;]/)
    .map((l) => l.replace(LINE_CLEAN, '').trim())
    .filter((l) => l.length > 0);

  const learned = loadLearnedDict();
  const items = [];
  const unresolved = [];

  for (const raw of lines) {
    const { qty, unit } = parseQuantity(raw);
    const cleanName = raw.replace(QTY_REGEX, '').trim();
    // A line that is only a quantity (e.g. "2 ק\"ג") leaves nothing behind —
    // skip it rather than creating a junk "other" item.
    if (!cleanName) continue;

    const normKey = normalizeHebrew(cleanName);
    let category = matchCategory(cleanName);
    if (!category && learned[normKey]) {
      category = learned[normKey];
    }

    const item = {
      id: genItemId(),
      name: cleanName,
      category: category || 'other',
      checked: false,
      qty: qty || null,
      unit: unit || null,
      addedAt: new Date().toISOString(),
    };

    if (!category) {
      unresolved.push(item);
    }
    items.push(item);
  }

  return { items, unresolved };
};

// Resolves unresolved items via Gemini. Returns { items, learned } where
// `learned` is the map of newly-classified { nameLower: category } so the
// caller can persist it to Firestore for cross-device sync.
export const categorizeWithAI = async (unresolvedItems) => {
  const key = getGeminiApiKey();
  if (!key || unresolvedItems.length === 0) return { items: unresolvedItems, learned: {} };

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const categoryKeys = CATEGORIES.map((c) => c.key).join(', ');
    const itemNames = unresolvedItems.map((i) => i.name).join('\n');

    const prompt = `Categorize these grocery items into one of these categories: ${categoryKeys}.
Return ONLY a JSON object mapping each item name to its category key. No markdown, no explanation.

Items:
${itemNames}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    // Extract the first {...} block so stray prose/fences don't break JSON.parse.
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const mapping = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    // Case-insensitive lookup in case the model normalizes the key casing.
    const lowerMap = {};
    for (const [k, v] of Object.entries(mapping)) lowerMap[k.toLowerCase()] = v;

    const learned = loadLearnedDict();
    const newlyLearned = {};

    for (const item of unresolvedItems) {
      const cat = mapping[item.name] || lowerMap[item.name.toLowerCase()];
      if (cat && CATEGORIES.some((c) => c.key === cat)) {
        const k = normalizeHebrew(item.name);
        item.category = cat;
        learned[k] = cat;
        newlyLearned[k] = cat;
      }
    }

    saveLearnedDict(learned);
    return { items: unresolvedItems, learned: newlyLearned };
  } catch (e) {
    console.error('[groceryCategories] AI categorization failed:', e);
    return { items: unresolvedItems, learned: {} };
  }
};

// Persist a single manual category correction (used when the user re-assigns an
// item's category). Returns the { normKey: category } pair for Firestore sync.
export const learnCategory = (itemName, category) => {
  const k = normalizeHebrew(itemName);
  const learned = loadLearnedDict();
  learned[k] = category;
  saveLearnedDict(learned);
  return { [k]: category };
};

export const groupByCategory = (items) => {
  const all = getAllCategories();
  const known = new Set(all.map((c) => c.key));
  const groups = {};
  for (const item of items) {
    // Fold any unknown category (e.g. a custom one the user later deleted) into
    // "other" so it never spawns a phantom duplicate section.
    let cat = item.category || 'other';
    if (!known.has(cat)) cat = 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  // Order by the user's aisle order.
  return all.filter((c) => groups[c.key]).map((c) => ({ ...c, items: groups[c.key] }));
};
