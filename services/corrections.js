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
    // ۱. اعداد فارسی، عربی، انگلیسی و حروف لاتین را هرگز تغییر نده
    if (/[0-9۰-۹٠-٩a-z]/i.test(word)) return word;

    // ۲. اگر کلمه در دیکشنری صحیح است، دست نزن
    if (spell.correct(word)) return word;

    // ۳. اگر غلط است، پیشنهادها را با منطق ساختاری بررسی کن
    const suggestions = spell.suggest(word);
    if (suggestions && suggestions.length > 0) {
      const origLower = normalizePersian(word);
      const topSugg = suggestions[0];
      const topSuggLower = normalizePersian(topSugg);

      let skipCorrection = false;

      // حالت الف: پیشنهاد دارای فاصله است (مثل "قلم مو" برای "قلمو" یا "کفش دوزک" برای "کفشدوزک")
      if (topSuggLower.includes(" ")) {
        skipCorrection = true;
      }

      // حالت ب: پیشنهاد کوتاه‌تر است و فقط بخشی از کلمه اصلی است (مثل "قلم" برای "قلمو")
      if (
        origLower.includes(topSuggLower) &&
        topSuggLower.length < origLower.length
      ) {
        // استثنا: اگر فقط یک حرف تکراری اشتباه تایپ شده باشد (مثل مدااد -> مداد)
        let isRepeatedCharTypo = false;
        for (let i = 0; i < origLower.length - 1; i++) {
          if (origLower[i] === origLower[i + 1]) {
            const cleaned =
              origLower.substring(0, i) + origLower.substring(i + 1);
            if (cleaned === topSuggLower) {
              isRepeatedCharTypo = true;
              break;
            }
          }
        }
        if (!isRepeatedCharTypo) {
          skipCorrection = true; // کلمه محاوره‌ای است (قلمو)، تصحیح نکن!
        }
      }

      // حالت ج: اگر تفاوت طولی کلمه پیشنهادی خیلی زیاد باشد (بیش از ۲ حرف)
      if (Math.abs(topSuggLower.length - origLower.length) > 2) {
        skipCorrection = true;
      }

      // اگر تمام تست‌ها پاس شد، اصلاح کن
      if (!skipCorrection) {
        changed = true;
        return topSugg;
      }
    }

    return word; // حفظ کلمه اصلی (مثل "قلمو") در صورت شکست در تست‌ها
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
