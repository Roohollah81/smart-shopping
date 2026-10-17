// services/corrections.js
// ================================================================
// 🎯 تصحیح هوشمند فارسی — پیاده‌سازی کامل با Node.js
// ================================================================

const nspell = require("nspell");

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

let spellChecker = null;
let isInitializing = false;

// ─── راه‌اندازی غلط‌یاب املایی (با پشتیبانی از ESM) ───
async function initSpellChecker() {
  if (spellChecker) return spellChecker;
  if (isInitializing) {
    // منتظر بمان تا راه‌اندازی قبلی تمام شود
    while (isInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return spellChecker;
  }

  isInitializing = true;
  try {
    // استفاده از import() پویا برای بارگذاری ماژول ESM
    const dictionaryFa = await import("dictionary-fa");
    const dictionary = dictionaryFa.default || dictionaryFa;

    // nspell با دیکشنری Hunspell (شامل aff و dic) کار می‌کند
    spellChecker = nspell(dictionary);
    console.log("[corrections] Spell checker initialized successfully.");
    return spellChecker;
  } catch (e) {
    console.error(
      "[corrections] Failed to initialize spell checker:",
      e.message,
    );
    throw e;
  } finally {
    isInitializing = false;
  }
}

// ─── نرمال‌سازی پایه ───
function normalizePersian(text) {
  if (!text) return "";
  return String(text)
    .replace(/[۰-۹]/g, (d) => PERSIAN_DIGITS.indexOf(d))
    .replace(/[٠-٩]/g, (d) => ARABIC_DIGITS.indexOf(d))
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/ۀ/g, "ه")
    .replace(/[أإآ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ی")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function compactPersian(text) {
  return normalizePersian(text).replace(/\s+/g, "");
}

// ================================================================
// 🎯 غلط‌یابی املایی (با استفاده از نمونه‌ی singleton)
// ================================================================
async function fixSpelling(text) {
  if (!text) return { text, changed: false };

  const spell = await initSpellChecker();

  const words = text.split(/\s+/);
  let changed = false;

  const fixedWords = words.map((word) => {
    // کلماتی که شامل اعداد یا حروف انگلیسی هستند را دست نزن
    if (/[0-9a-z]/i.test(word)) return word;

    // اگه کلمه درست بود، همون رو برگردون
    if (spell.correct(word)) return word;

    // اگه غلط بود، بهترین پیشنهاد رو بگیر
    const suggestions = spell.suggest(word);
    if (suggestions && suggestions.length > 0) {
      changed = true;
      return suggestions[0];
    }

    return word;
  });

  return {
    text: fixedWords.join(" "),
    changed,
  };
}

// ================================================================
// 🎯 تابع اصلی تصحیح
// ================================================================
async function correctQuery(query) {
  if (!query) {
    return { original: query, corrected: query, changed: false };
  }

  const original = String(query).trim();
  if (!original) {
    return { original, corrected: original, changed: false };
  }

  try {
    // غلط‌های املایی را با dictionary-fa اصلاح می‌کنیم
    const spellingResult = await fixSpelling(original);

    if (spellingResult.changed) {
      return {
        original,
        corrected: spellingResult.text,
        changed: true,
        reason: "spelling",
      };
    }
  } catch (e) {
    console.error("[corrections] Error during correction:", e.message);
    // در صورت خطا، متن اصلی را برگردان
  }

  return {
    original,
    corrected: original,
    changed: false,
  };
}

module.exports = {
  normalizePersian,
  compactPersian,
  correctQuery,
  // توابع زیر دیگر نیازی نیستند، اما برای سازگاری با کدهای قبلی خالی می‌مانند
  learnWord: () => {},
  learnFromItems: () => {},
  KNOWN_WORDS: new Set(),
};
