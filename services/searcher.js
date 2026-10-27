const axios = require("axios");
const cheerio = require("cheerio");
const { wrapper } = require("axios-cookiejar-support");
const { CookieJar } = require("tough-cookie");

// ساخت یک سشن اختصاصی برای ترب
const torobJar = new CookieJar();
const torobClient = wrapper(axios.create({ jar: torobJar }));

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

// ================================================================
// LOGGER — timestamp + clean output
// ================================================================
function log(level, scopeOrMsg, message) {
  const time = new Date().toTimeString().slice(0, 8);
  const tag = `[${String(level).padEnd(5)}]`;

  let scope = "";
  let msg = "";
  if (message === undefined) {
    msg = scopeOrMsg || "";
  } else {
    scope = scopeOrMsg || "";
    msg = message;
  }

  // نام فروشگاه را دقیقاً ۱۴ کاراکتر می‌کنیم تا کولون‌ها همیشه در یک ستون باشند
  const storeStr = scope
    ? `[${String(scope).padEnd(14, " ")}]`
    : `[${" ".repeat(14)}]`;

  // پیام را تمیز می‌کنیم تا فاصله‌های اضافی حذف شوند
  msg = msg.trim();

  console.log(`[${time}] ${tag} ${storeStr} : ${msg}`);
}

const STOPWORDS = new Set([
  "مدل",
  "کد",
  "عدد",
  "بسته",
  "بسته‌بندی",
  "سایز",
  "اندازه",
  "و",
  "با",
  "از",
  "به",
  "در",
  "برای",
  "یک",
  "این",
  "آن",
  "یا",
  "گرم",
  "گرمی",
  "کیلوگرم",
  "لیتر",
  "میلی",
  "سانتی",
  "سانتیمتر",
  "متر",
  "شماره",
  "سری",
  "طرح",
  "نوع",
  "برند",
  "اصلی",
  "اورجینال",
  "جدید",
  "قدیمی",
  "کیفیت",
  "عالی",
  "درجه",
]);

// ─── نگاشت نام فروشگاه برای لاگ ───
const STORE_EN_NAME = {
  دیجی‌کالا: "Digikala",
  ترب: "Torob",
  قلم‌تراش: "Ghalamtarash",
  "آرمان آرت": "ArmanArt",
  عالم‌زاده: "Alemzadeh",
  "مهستان آرت": "MahestanArt",
  "مجد مارکت": "MajdMarket",
};

function enName(name) {
  return STORE_EN_NAME[name] || name;
}

const ALWAYS_NEGATIVE = new Set([
  "یدک",
  "یدکی",
  "قطعه",
  "قطعات",
  "لوازم",
  "جانبی",
  "متعلقات",
  "متعلق",
  "جایگزین",
  "بدل",
  "مشابه",
  "نمونه",
  "تعمیر",
  "سرویس",
  "نصب",
  "آموزش",
  "راهنما",
  "کتاب",
  "دفترچه",
  "بجای",
]);

const ACCESSORY_WORDS = new Set([
  "کیف",
  "جعبه",
  "قاب",
  "محافظ",
  "شارژر",
  "باتری",
  "کابل",
  "آداپتور",
  "سیم",
  "مبدل",
  "برچسب",
  "فیلتر",
  "نوک",
  "تیغ",
  "سوزن",
  "کارتریج",
]);

const CATEGORY_CONFLICTS = [
  { query: ["اتود"], title: ["پاک کن", "پاک‌کن", "پاکن"] },
  { query: ["تراش"], title: ["دفتر", "قلمتراش", "قلم تراش"] },
  { query: ["قیچی"], title: ["دفتر", "کاغذ", "مقوا"] },
  { query: ["جلد"], title: ["کاغذ", "مقوا", "برگ", "صفحه", "صفحات"] },
];

function normalize(text) {
  if (!text) return "";
  return (
    text
      .toString()
      // اعداد فارسی و عربی → انگلیسی
      .replace(/[۰-۹]/g, (d) => PERSIAN_DIGITS.indexOf(d))
      .replace(/[٠-٩]/g, (d) => ARABIC_DIGITS.indexOf(d))
      // حروف عربی → فارسی
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/ة/g, "ه")
      .replace(/ۀ/g, "ه")
      .replace(/أ|إ|آ/g, "ا") // ← همه‌ی انواع الف → ا
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ی")
      // حذف اعراب
      .replace(/[\u064B-\u065F\u0670]/g, "")
      // حذف نیم‌فاصله (چسباندن کلمات)
      .replace(/\u200c/g, "")
      // حذف علائم
      .replace(/[-_.,،;:()\[\]{}«»"'\u060C\u061B\u061F]/g, " ")
      // چند فاصله → یکی
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
  );
}

// نسخه‌ی فشرده: بدون فاصله، برای مقایسه‌ی چسبیده/جدا
function normalizeCompact(text) {
  return normalize(text).replace(/\s+/g, "");
}

function tokenMatchesJoined(token, titleTokens) {
  function isSubstringMatch(part, target) {
    const minL = Math.min(part.length, target.length);
    const maxL = Math.max(part.length, target.length);
    return part.includes(target) || target.includes(part)
      ? minL >= 3 && minL / maxL >= 0.6
      : false;
  }

  // تک توکن
  for (const t of titleTokens) {
    if (t === token) return true;
    if (isSubstringMatch(t, token)) return true;
  }

  // ترکیب دو توکن مجاور
  for (let i = 0; i < titleTokens.length - 1; i++) {
    const joined = titleTokens[i] + titleTokens[i + 1];
    if (joined === token) return true;
    if (isSubstringMatch(joined, token)) return true;
  }

  // ترکیب سه توکن مجاور
  for (let i = 0; i < titleTokens.length - 2; i++) {
    const joined = titleTokens[i] + titleTokens[i + 1] + titleTokens[i + 2];
    if (joined === token) return true;
    if (isSubstringMatch(joined, token)) return true;
  }

  return false;
}

function tokenize(text) {
  return normalize(text)
    .split(" ")
    .filter((t) => {
      if (STOPWORDS.has(t)) return false;
      if (/^\d+$/.test(t)) return true;
      return t.length >= 2;
    });
}

function isCriticalIdentifier(token) {
  if (/^\d+$/.test(token)) return true;
  if (/^[a-z]{1,4}\d+[a-z]?$/i.test(token)) return true;
  if (/^\d+[a-z]{1,4}$/i.test(token)) return true;
  return false;
}

// ─── کلمات مترادف که اگه با هم بیان، محصول متفاوته ───
const COMPOUND_WORDS = [
  // ترکیب‌هایی که کلمه‌ی دوم رو به چیز دیگه تبدیل می‌کنه
  { query: "کفش", conflict: ["دوزک", "دوز", "دوزک"] },
  { query: "دست", conflict: ["مالی", "بند", "کش"] },
  { query: "سر", conflict: ["گرد", "خود", "سرد"] },
  { query: "گل", conflict: ["دوز", "ابی", "خانه"] },
  { query: "کتاب", conflict: ["خانه"] },
  { query: "چشم", conflict: ["ک"] },
  { query: "قلم", conflict: ["و"] }, // قلمو != قلم
  { query: "سنگ", conflict: ["ک"] },
  { query: "برگ", conflict: ["ه"] },
  { query: "پا", conflict: ["ک"] },
  { query: "شیر", conflict: ["ین", "ینی"] },
  { query: "مو", conflict: ["تور", "رو"] },
  { query: "شیر", conflict: ["از", "ینی"] },
];

function findCompoundConflict(query, title) {
  const qNorm = normalize(query);
  const tNorm = normalize(title);

  for (const rule of COMPOUND_WORDS) {
    const qHas = qNorm.split(" ").includes(rule.query);
    if (!qHas) continue;

    for (const bad of rule.conflict) {
      // اگه bad قبل یا بعد از query چسبیده باشه
      const combined = rule.query + bad;
      const combinedReverse = bad + rule.query;
      if (tNorm.includes(combined) || tNorm.includes(combinedReverse)) {
        return `${rule.query}+${bad}`;
      }
    }
  }
  return null;
}

function findUnwantedModifier(query, title) {
  const qTokens = new Set(tokenize(query));
  const tTokens = tokenize(title);
  if (tTokens.length === 0) return null;

  // ─── جدید: چک ترکیب‌های خطرناک ───
  const compound = findCompoundConflict(query, title);
  if (compound) return `compound:${compound}`;

  for (const token of tTokens) {
    if (ALWAYS_NEGATIVE.has(token) && !qTokens.has(token)) {
      return token;
    }
  }

  for (let i = 0; i < tTokens.length; i++) {
    const token = tTokens[i];
    if (!ACCESSORY_WORDS.has(token)) continue;
    if (qTokens.has(token)) continue;

    let comesBeforeQueryWord = false;
    for (let j = 0; j < tTokens.length; j++) {
      if (qTokens.has(tTokens[j])) {
        if (i < j) comesBeforeQueryWord = true;
        break;
      }
    }

    if (i === 0 || comesBeforeQueryWord) {
      return token;
    }
  }

  return null;
}

// ================================================================
// 🎯 تشخیص کلمات مرکب و ویژگی‌بودن query
// ================================================================

// پسوندهای رایج فارسی که با کلمه ترکیب می‌شن ولی معنی رو عوض نمی‌کنن
const COMMON_PERSIAN_SUFFIXES = new Set([
  "ها",
  "های",
  "هایی",
  "هام",
  "هامان",
  "هايت",
  "هايش",
  "ی",
  "اي",
  "ای",
  "تر",
  "ترین",
  "ترين",
  "شان",
  "مان",
  "تان",
  "اش",
  "ام",
  "ات",
]);

// ─── چک ترکیب چسبیده: «کفش» تو «کفشدوزک» ───
function findCompoundMismatch(query, title) {
  const qTokens = tokenize(query);
  const tTokens = tokenize(title);

  if (qTokens.length === 0 || tTokens.length === 0) return null;
  // فقط برای query تک‌کلمه اعمال کن
  if (qTokens.length !== 1) return null;

  const qNorm = normalizeCompact(qTokens[0]);
  if (qNorm.length < 2) return null;

  for (const tToken of tTokens) {
    const tNorm = normalizeCompact(tToken);
    if (tNorm === qNorm) continue; // دقیقاً همون کلمه
    if (tNorm.length <= qNorm.length + 1) continue; // خیلی کوتاه‌تر از ترکیب

    // چک کن tToken با qNorm شروع یا تموم می‌شه
    let extra = null;
    if (tNorm.startsWith(qNorm)) extra = tNorm.slice(qNorm.length);
    else if (tNorm.endsWith(qNorm)) extra = tNorm.slice(0, -qNorm.length);

    if (!extra || extra.length < 2) continue;

    // اگه پسوند معمولی هست، نادیده بگیر
    if (COMMON_PERSIAN_SUFFIXES.has(extra)) continue;

    // ترکیب مشکوک
    return {
      queryToken: qTokens[0],
      titleToken: tToken,
      extra,
    };
  }
  return null;
}

// ─── چک ویژگی‌بودن: query تو موقعیت ۳ به بعد باشه ───
function isQueryAFeature(query, title) {
  const qTokens = tokenize(query);
  const tTokens = tokenize(title);

  if (qTokens.length === 0 || tTokens.length === 0) return false;
  // فقط برای query تک‌کلمه
  if (qTokens.length !== 1) return false;
  // عنوان باید حداقل ۳ کلمه باشه که معنی داشته باشه
  if (tTokens.length < 3) return false;

  const qNorm = normalize(qTokens[0]);
  if (!qNorm) return false;

  // چک کن تو ۲ کلمه‌ی اول هست
  for (let i = 0; i < Math.min(2, tTokens.length); i++) {
    const t = normalize(tTokens[i]);
    if (t === qNorm || t.startsWith(qNorm) || qNorm.startsWith(t)) {
      return false; // query جزء اصلی محصول
    }
  }

  // چک کن تو کلمات بعدی هست
  for (let i = 2; i < tTokens.length; i++) {
    const t = normalize(tTokens[i]);
    if (t === qNorm || t.startsWith(qNorm) || qNorm.startsWith(t)) {
      return true; // query فقط یه ویژگیه
    }
  }

  return false;
}

function hasCategoryConflict(query, title) {
  const qNorm = normalize(query);
  const tNorm = normalize(title);

  for (const rule of CATEGORY_CONFLICTS) {
    const qHasAny = rule.query.some((kw) => qNorm.includes(normalize(kw)));
    if (!qHasAny) continue;

    // 🎯 اگر خود کاربر کلمه‌ی متناقض رو تایپ کرده باشه (مثل "پاک‌کن اتود")، دیگه تناقضی نیست!
    const queryHasConflictWord = rule.title.some((kw) =>
      qNorm.includes(normalize(kw)),
    );
    if (queryHasConflictWord) continue;

    const conflict = rule.title.find((kw) => tNorm.includes(normalize(kw)));
    if (conflict) return conflict;
  }
  return null;
}

function queryMatchScore(query, title) {
  const qt = tokenize(query);
  const tt = tokenize(title);

  if (qt.length === 0) {
    return {
      score: 1,
      ratio: 1,
      matchedTokens: [],
      missedTokens: [],
      reason: null,
    };
  }

  // ─── چک ۱: ترکیب چسبیده (کفش → کفشدوزک) ───
  const compound = findCompoundMismatch(query, title);
  if (compound) {
    return {
      score: 0,
      ratio: 0,
      matchedTokens: [],
      missedTokens: [compound.queryToken],
      reason: `compound word: "${compound.queryToken}" inside "${compound.titleToken}"`,
    };
  }

  // ─── چک ۲: query به‌عنوان ویژگی نه محصول اصلی ───
  if (isQueryAFeature(query, title)) {
    return {
      score: 0,
      ratio: 0,
      matchedTokens: [],
      missedTokens: qt,
      reason: `query is a feature not main product`,
    };
  }

  const unwanted = findUnwantedModifier(query, title);
  if (unwanted) {
    return {
      score: 0,
      ratio: 0,
      matchedTokens: [],
      missedTokens: [unwanted],
      reason: `unwanted word: "${unwanted}"`,
    };
  }

  const conflict = hasCategoryConflict(query, title);
  if (conflict) {
    return {
      score: 0,
      ratio: 0,
      matchedTokens: [],
      missedTokens: [conflict],
      reason: `category conflict: "${conflict}"`,
    };
  }

  const queryIdentifiers = qt.filter(isCriticalIdentifier);
  const missedIdentifiers = [];
  for (const id of queryIdentifiers) {
    if (!tt.some((t) => t === id)) missedIdentifiers.push(id);
  }
  if (missedIdentifiers.length > 0) {
    return {
      score: 0,
      ratio: 0,
      matchedTokens: [],
      missedTokens: missedIdentifiers,
      reason: `missing identifiers: ${missedIdentifiers.join(", ")}`,
    };
  }

  let totalWeight = 0,
    matchedWeight = 0,
    matchedCount = 0;
  const matchedTokens = [],
    missedTokens = [];

  for (const token of qt) {
    const weight = isCriticalIdentifier(token)
      ? 10
      : Math.pow(token.length, 1.5);
    totalWeight += weight;

    const isMatched = tokenMatchesJoined(token, tt);

    if (isMatched) {
      matchedWeight += weight;
      matchedCount++;
      matchedTokens.push(token);
    } else {
      missedTokens.push(token);
    }
  }

  // ⭐️⭐️⭐️ قانون طلایی جدید و قطعی ⭐️⭐️⭐️
  // برای جستجوهای ۱ تا ۳ کلمه‌ای، EVERY کلمه باید در عنوان باشد.
  if (qt.length <= 3 && missedTokens.length > 0) {
    return {
      score: 0,
      ratio: 0,
      matchedTokens: matchedTokens,
      missedTokens: missedTokens,
      reason: `strict: missing ${missedTokens.join(", ")}`,
    };
  }

  const score = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  const ratio = qt.length > 0 ? matchedCount / qt.length : 0;
  return { score, ratio, matchedTokens, missedTokens, reason: null };
}

function jaccard(a, b) {
  const setA = new Set(a),
    setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  return inter / (setA.size + setB.size - inter);
}

function overlapCoefficient(a, b) {
  const setA = new Set(a),
    setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  return inter / Math.min(setA.size, setB.size);
}

function isModelToken(token) {
  return /[a-z0-9]/i.test(token) && token.length >= 2;
}

function similarity(titleA, titleB) {
  const ta = tokenize(titleA),
    tb = tokenize(titleB);
  const jac = jaccard(ta, tb);
  const overlap = overlapCoefficient(ta, tb);
  const baseSim = 0.4 * jac + 0.6 * overlap;

  const idsA = ta.filter(isCriticalIdentifier);
  const idsB = tb.filter(isCriticalIdentifier);

  if (idsA.length === 0 && idsB.length === 0) return baseSim;
  if (idsA.length > 0 && idsB.length === 0) return baseSim * 0.4;
  if (idsA.length === 0 && idsB.length > 0) return baseSim * 0.4;

  const commonIds = idsA.filter((id) => idsB.includes(id));
  if (commonIds.length === 0) return baseSim * 0.3;
  const idMatchRatio = commonIds.length / Math.max(idsA.length, idsB.length);
  return 0.3 * baseSim + 0.7 * idMatchRatio;
}

function clusterProducts(products, threshold = 0.6) {
  const clusters = [];
  for (const product of products) {
    let bestCluster = null,
      bestSim = 0;
    for (const cluster of clusters) {
      const sim = similarity(
        product.productTitle,
        cluster.representative.productTitle,
      );
      if (sim > bestSim && sim >= threshold) {
        bestSim = sim;
        bestCluster = cluster;
      }
    }
    if (bestCluster) bestCluster.offers.push(product);
    else clusters.push({ representative: product, offers: [product] });
  }
  return clusters;
}

// ================================================================
// IMAGE EXTRACTION
// ================================================================
function extractProductImage($, element, domain) {
  const imageSelectors = [
    "img.attachment-woocommerce_thumbnail",
    ".product-image img",
    ".product-thumbnail img",
    ".product-card-image img",
    "img.wp-post-image",
    'img[class*="product"]',
    'img[class*="thumb"]',
    'img[loading="lazy"]',
    "img",
  ];

  let bestUrl = null;

  for (const sel of imageSelectors) {
    const img = $(element).find(sel).first();
    if (img.length === 0) continue;

    const srcset = img.attr("srcset") || img.attr("data-srcset") || "";
    if (srcset) {
      const largest = pickLargestFromSrcset(srcset);
      if (largest) {
        bestUrl = largest;
        break;
      }
    }

    const dataLarge =
      img.attr("data-large_image") ||
      img.attr("data-large-image") ||
      img.attr("data-full-src") ||
      img.attr("data-original") ||
      img.attr("data-src") ||
      img.attr("data-lazy-src");
    if (dataLarge) {
      bestUrl = dataLarge;
      break;
    }

    const src = img.attr("src") || "";
    if (src && !src.startsWith("data:")) {
      bestUrl = src;
      break;
    }
  }

  if (!bestUrl) return null;
  if (bestUrl.startsWith("data:")) return null;

  if (!bestUrl.startsWith("http")) {
    bestUrl = `https://${domain}${bestUrl.startsWith("/") ? "" : "/"}${bestUrl}`;
  }

  return upgradeWooCommerceImageUrl(bestUrl);
}

function pickLargestFromSrcset(srcset) {
  if (!srcset) return null;
  const parts = srcset
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  let maxWidth = 0,
    bestUrl = null;
  for (const part of parts) {
    const [url, descriptor] = part.split(/\s+/);
    if (!url) continue;
    let width = 0;
    if (descriptor) {
      const wMatch = descriptor.match(/^(\d+)w$/);
      const xMatch = descriptor.match(/^([\d.]+)x$/);
      if (wMatch) width = parseInt(wMatch[1], 10);
      else if (xMatch) width = parseFloat(xMatch[1]) * 1000;
    }
    if (width > maxWidth) {
      maxWidth = width;
      bestUrl = url;
    }
  }
  return bestUrl;
}

function upgradeWooCommerceImageUrl(url) {
  if (!url) return url;
  try {
    const sizePattern = /-(\d+)x(\d+)(?=\.(jpg|jpeg|png|webp|gif))/gi;
    const withoutSize = url.replace(sizePattern, "");
    let cleaned = withoutSize.split("?")[0];

    if (
      url.includes("i0.wp.com") ||
      url.includes("i1.wp.com") ||
      url.includes("i2.wp.com")
    ) {
      cleaned = url
        .replace(/[?&]resize=[^&]+/g, "")
        .replace(/[?&]w=\d+/g, "")
        .replace(/[?&]h=\d+/g, "");
      cleaned = cleaned.replace(/[?&]$/, "");
    }
    return cleaned;
  } catch (e) {
    return url;
  }
}

// ================================================================
// NEXT_DATA EXTRACTION
// ================================================================
function extractFromNextData(data, storeName, domain) {
  const products = [];
  const seen = new Set();

  function walk(obj, depth = 0) {
    if (depth > 15 || !obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      for (const item of obj) walk(item, depth + 1);
      return;
    }

    const name = obj.name || obj.title || obj.productName;
    const price =
      obj.price ||
      obj.final_price ||
      obj.regular_price ||
      obj.sale_price ||
      obj.price_with_discount;

    if (name && price && typeof name === "string" && name.length > 3) {
      const num = parseInt(String(price).replace(/[^\d]/g, ""), 10);
      if (!isNaN(num) && num > 0 && !seen.has(name)) {
        seen.add(name);
        const slug = obj.slug || obj.id || obj.product_id;

        let image =
          obj.image ||
          obj.image_url ||
          obj.thumbnail ||
          obj.thumbnail_url ||
          obj.cover ||
          (Array.isArray(obj.images) ? obj.images[0] : null);

        if (image && typeof image === "object") {
          image = image.url || image.src || image.path || null;
        }
        if (Array.isArray(image)) image = image[0];
        if (image && typeof image === "string" && !image.startsWith("http")) {
          image = `https://${domain}${image.startsWith("/") ? "" : "/"}${image}`;
        }

        products.push({
          storeName,
          productTitle: name,
          price: num < 10000000 ? num : Math.round(num / 10),
          link: slug
            ? `https://${domain}/products/${slug}`
            : `https://${domain}/`,
          image: image || null,
        });
      }
    }

    for (const key of Object.keys(obj)) walk(obj[key], depth + 1);
  }

  walk(data);
  return products;
}

// ================================================================
// PRICE PARSING
// ================================================================
function parsePriceText(text, currency) {
  if (!text) return 0;

  const cleaned = text
    .replace(/[۰-۹]/g, (d) => PERSIAN_DIGITS.indexOf(d))
    .replace(/[٠-٩]/g, (d) => ARABIC_DIGITS.indexOf(d));

  const priceMatches = cleaned.match(/\d{1,3}(?:,\d{3})+/g);

  let price = 0;

  if (priceMatches && priceMatches.length > 0) {
    const values = priceMatches.map((m) => parseInt(m.replace(/,/g, ""), 10));
    price = Math.max(...values);
  } else {
    const numMatches = cleaned.match(/\d{5,}/g);
    if (numMatches) {
      const values = numMatches.map((m) => parseInt(m, 10));
      price = Math.max(...values);
    } else {
      price = parseInt(cleaned.replace(/[^\d]/g, ""), 10);
    }
  }

  if (isNaN(price) || price === 0) return 0;

  if (currency === "rial") price = Math.round(price / 10);

  if (price < 1000 || price > 500000000) return 0;

  return price;
}

// ================================================================
// STORES CONFIG
// ================================================================
const NEW_STORES_CONFIG = [
  {
    name: "قلم‌تراش",
    domain: "ghalamtarash.ir",
    searchUrl: (q) =>
      `https://ghalamtarash.ir/?s=${encodeURIComponent(q)}&post_type=product`,
    itemSelector: "li.product, .product.type-product",
    titleSelector: ".woocommerce-loop-product__title, h2, h3",
    priceSelector: ".price ins .amount, .price .amount, .price",
    currency: "rial",
  },
  {
    name: "آرمان آرت",
    domain: "armanartstore.com",
    searchUrl: (q) =>
      `https://armanartstore.com/?s=${encodeURIComponent(q)}&post_type=product`,
    itemSelector: "li.product",
    titleSelector: ".woocommerce-loop-product__title, h2, h3",
    priceSelector:
      ".item-price, .price ins .amount, .price .amount, .price, .woocommerce-Price-amount",
    currency: "toman",
  },
  {
    name: "عالم‌زاده",
    domain: "alemzadeh.ir",
    searchUrl: (q) =>
      `https://alemzadeh.ir/products?q=${encodeURIComponent(q)}`,
    itemSelector: ".product-card",
    titleSelector: "h3, h2, .product-card-title",
    priceSelector: ".product-card-price, .price",
    currency: "toman",
  },
  {
    name: "مهستان آرت",
    domain: "mahestanart.com",
    searchUrl: (q) =>
      `https://mahestanart.com/?s=${encodeURIComponent(q)}&post_type=product`,
    itemSelector: "article",
    titleSelector: ".title, h3, h2, .v-product-item-content .title",
    priceSelector:
      '.product-price-container, .product-price-container *, [class*="price"]',
    currency: "toman",
  },
  {
    name: "مجد مارکت",
    domain: "majdmarket.com",
    searchUrl: (q) =>
      `https://majdmarket.com/products?search=${encodeURIComponent(q)}`,
    itemSelector: 'a[href*="/products/"]',
    titleSelector: "__self__",
    priceSelector: '[class*="price"], .price',
    currency: "toman",
    type: "nextjs",
  },
];

// ================================================================
// WOOCOMMERCE SEARCH
// ================================================================
async function searchWooCommerceStore(storeConfig, query, limit = 20) {
  const {
    name,
    domain,
    searchUrl,
    itemSelector,
    titleSelector,
    priceSelector,
    currency,
  } = storeConfig;
  const url = searchUrl(query);

  let retries = 2; // حداکثر ۲ بار تلاش
  let response = null;

  while (retries > 0) {
    try {
      response = await axios.get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
        },
        timeout: 8000, // کاهش به ۸ ثانیه
        validateStatus: () => true,
      });
      break;
    } catch (error) {
      retries--;
      if (retries === 0) {
        log("ERR", enName(name), error.message);
        return [];
      }
      await new Promise((r) => setTimeout(r, 1000)); // ۱ ثانیه صبر
    }
  }

  try {
    if (!response || !response.data) {
      log("WARN", enName(name), `0 products (empty response)`);
      return [];
    }

    // ─── مدیریت خطای 404 (صفحه پیدا نشد) ───
    if (response.status === 404) {
      log("WARN", enName(name), `0 products (404)`);
      return [];
    }

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }

    const $ = cheerio.load(response.data);
    const products = [];
    const seen = new Set();

    // ─── تلاش برای استخراج از __NEXT_DATA__ ───
    const nextDataMatch = response.data.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const nextProducts = extractFromNextData(nextData, name, domain);
        if (nextProducts.length > 0) {
          log("OK", enName(name), `${nextProducts.length} products`);
          return nextProducts.slice(0, limit);
        }
      } catch (e) {}
    }

    // ─── استخراج از HTML ───
    $(itemSelector)
      .slice(0, limit * 3)
      .each((i, el) => {
        if (products.length >= limit) return false;

        let title = "";
        if (titleSelector === "__self__") {
          title = $(el).text().trim();
        } else {
          title = $(el).find(titleSelector).first().text().trim();
        }
        title = title.replace(/\s+/g, " ").substring(0, 200);
        if (!title || title.length < 5) return;

        let link =
          $(el).attr("href") || $(el).find("a").first().attr("href") || "";
        if (!link.startsWith("http")) {
          link = `https://${domain}${link.startsWith("/") ? "" : "/"}${link}`;
        }

        let priceText = "";
        const salePrice = $(el)
          .find(".price ins .amount, .price ins, ins .amount")
          .first()
          .text()
          .trim();
        if (salePrice) {
          priceText = salePrice;
        } else {
          const configured = $(el).find(priceSelector).first().text().trim();
          if (configured) {
            priceText = configured;
          } else {
            priceText = $(el).text();
          }
        }

        const price = parsePriceText(priceText, currency);
        if (price === 0) return;

        const image = extractProductImage($, el, domain);

        if (seen.has(title)) return;
        seen.add(title);

        products.push({
          storeName: name,
          productTitle: title,
          price,
          link,
          image,
          images: image ? [image] : [],
        });
      });

    if (products.length === 0) {
      log("WARN", enName(name), `0 products`);
    } else {
      log("OK", enName(name), `${products.length} products`);
    }
    return products;
  } catch (error) {
    log("ERR", enName(name), error.message);
    return []; // در صورت خطای غیرمنتظره، آرایه خالی برگردان تا بقیه فروشگاه‌ها ادامه دهند
  }
}

// ================================================================
// DIGIKALA
// ================================================================
function extractDigikalaImage(p) {
  if (!p || !p.images) return null;
  const candidates = [
    p.images.main,
    p.images.main_image,
    p.images.thumbnail,
    Array.isArray(p.images) ? p.images[0] : null,
  ].filter(Boolean);

  for (const img of candidates) {
    let url = null;
    if (typeof img === "string" && img.startsWith("http")) {
      url = img;
    } else if (typeof img === "object") {
      let rawUrl = img.url || img.webp_url || img.src || img.path;
      if (Array.isArray(rawUrl)) rawUrl = rawUrl[0];
      if (typeof rawUrl === "string" && rawUrl.startsWith("http")) url = rawUrl;
    }
    if (!url) continue;
    return url.split("?")[0];
  }
  return null;
}

function extractDigikalaImages(p) {
  if (!p || !p.images) return [];
  const urls = [];
  const seen = new Set();

  const push = (x) => {
    if (!x) return;
    if (typeof x === "string" && x.startsWith("http")) {
      const clean = x.split("?")[0];
      if (!seen.has(clean)) {
        seen.add(clean);
        urls.push(clean);
      }
    } else if (typeof x === "object" && !Array.isArray(x)) {
      push(x.url);
      push(x.webp_url);
      push(x.src);
      push(x.path);
    } else if (Array.isArray(x)) {
      x.forEach(push);
    }
  };

  if (Array.isArray(p.images)) {
    p.images.forEach(push);
  } else {
    push(p.images.main);
    push(p.images.main_image);
    push(p.images.thumbnail);
    Object.values(p.images).forEach(push);
  }

  return urls;
}

async function searchDigikala(query, limit = 20) {
  try {
    const response = await axios.get("https://api.digikala.com/v1/search/", {
      params: { q: query, page: 1 },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      timeout: 15000,
    });
    const products = response.data?.data?.products || [];
    const sliced = products.slice(0, limit);

    log("OK", "Digikala", `${sliced.length} products`);

    return sliced.map((p) => {
      const imgs = extractDigikalaImages(p);

      // ─── منطق جدید برای ساخت لینک مطمئن ───
      let productLink = null;

      // ۱. اولویت با لینک مستقیم API
      if (p.url && typeof p.url === "string" && p.url.startsWith("http")) {
        productLink = p.url;
      }
      // ۲. اگر لینک نبود، با ID بساز
      else if (p.id) {
        const cleanId = String(p.id).replace(/[^\d]/g, "");
        if (cleanId) {
          productLink = `https://www.digikala.com/product/dkp-${cleanId}/`;
        }
      }

      // ۳. اگر هیچ‌کدام نبود، به صفحه جستجو هدایت کن
      if (!productLink) {
        productLink = `https://www.digikala.com/search/?q=${encodeURIComponent(p.title_fa || "")}`;
      }

      return {
        storeName: "دیجی‌کالا",
        productTitle: p.title_fa || "—",
        price:
          parseInt(
            String(p.default_variant?.price?.selling_price || "0").replace(
              /[^\d]/g,
              "",
            ),
            10,
          ) / 10,
        link: productLink, // ← استفاده از لینک مطمئن
        image: imgs[0] || null,
        images: imgs,
        productId: p.id,
      };
    });
  } catch (error) {
    log("ERR", "Digikala", error.message);
    throw error;
  }
}

// ================================================================
// 🎯 TOROB (صف سریالی + Circuit Breaker)
// ================================================================
let torobQueue = Promise.resolve();
let torobLastRequest = 0;
const TOROB_MIN_GAP = 5000; // افزایش به ۵ ثانیه

async function searchTorob(query, limit = 20) {
  // هر درخواست به انتهای صف اضافه می‌شود (سریالی)
  const result = await new Promise((resolve) => {
    torobQueue = torobQueue
      .then(async () => {
        // رعایت فاصله زمانی
        const now = Date.now();
        const elapsed = now - torobLastRequest;
        if (elapsed < TOROB_MIN_GAP) {
          await new Promise((r) => setTimeout(r, TOROB_MIN_GAP - elapsed));
        }

        try {
          const response = await axios.get(
            "https://api.torob.com/v4/base-product/search/",
            {
              params: {
                page: 0,
                sort: "popularity", // از cURL
                size: limit,
                query: query, // پارامتر جدید
                q: query,
                _search_landing: "home",
                _landing_page: "home",
                source: "next_desktop",
              },
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                Accept: "*/*", // از cURL
                "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
                Origin: "https://torob.com",
                Referer: "https://torob.com/",
              },
              timeout: 20000,
            },
          );
          torobLastRequest = Date.now();

          if (response.status === 200) {
            resolve(response.data);
          } else {
            log("WARN", "Torob", `0 products (HTTP ${response.status})`);
            resolve(null);
          }
        } catch (error) {
          torobLastRequest = Date.now();
          // 🎯 چالش ربات یا Rate Limit → هیچ تلاش مجددی نکن (Circuit Breaker)
          if (
            error.response?.status === 490 ||
            error.response?.status === 429
          ) {
            log(
              "WARN",
              "Torob",
              `Rate limited (HTTP ${error.response.status}) - skipping`,
            );
            resolve(null);
          } else {
            log("ERR", "Torob", error.message);
            resolve(null);
          }
        }
      })
      .catch(() => resolve(null));
  });

  if (!result) return [];

  const products = result?.results || [];
  const sliced = products.slice(0, limit);
  log("OK", "Torob", `${sliced.length} products`);

  return sliced.map((p) => {
    const imgs = [];
    if (Array.isArray(p.images)) imgs.push(...p.images);
    if (p.image_url) imgs.push(p.image_url);
    if (p.image) imgs.push(p.image);
    if (p.thumbnail) imgs.push(p.thumbnail);
    const images = [
      ...new Set(
        imgs.filter((x) => typeof x === "string" && x.startsWith("http")),
      ),
    ];
    return {
      storeName: "ترب",
      productTitle: p.name1 || p.name || "—",
      price: parseInt(String(p.price || "0").replace(/[^\d]/g, ""), 10),
      link: `https://torob.com/p/${p.random_key || p.id}/`,
      image: images[0] || null,
      images,
    };
  });
}

async function searchMajdMarket(query, limit = 20) {
  try {
    const url = `https://majdmarket.com/search?q=${encodeURIComponent(query)}`;

    const r = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        Accept: "text/html, application/xhtml+xml",
        "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
        "X-Inertia": "true",
        "X-Inertia-Version": "04a46bfc2c211525d155b9a391b28b06",
        "X-Requested-With": "XMLHttpRequest",
        "X-XSRF-TOKEN":
          "eyJpdiI6IkVEdXYvNC9Wdi8zQ25Yb2FKaDNaaUE9PSIsInZhbHVlIjoiVGJ1alBpNjlNQXZGS2FueW5ZNEVrR0dmclg4Qm8yZm5QbW11VXBBU1E2RnJycG9oTUZuOGZtTngxNisxVnhDWWZtL1JlZlZQM2dwanhCRnJMK0V1eDVzSUgxSnFBOThMeXg0elRlWnpQNEN1Q1JzWVlkYk04dTBVelJOdC83YjgiLCJtYWMiOiI5ZDEyZmY5MDdiODYwYzQ4MjVkMDEwZGE3ZjRjMTViMWIwMjlmNDhmNWJkNTg0NDBiMzRhY2M1NGVkODI5MDllIiwidGFnIjoiIn0=",
        Referer: `https://majdmarket.com/search?q=${encodeURIComponent(query)}`,
        Origin: "https://majdmarket.com",
      },
      validateStatus: () => true,
    });

    if (r.status !== 200) {
      log("WARN", "MajdMarket", `HTTP ${r.status}`);
      return [];
    }

    let products = [];
    let data = r.data;

    // اگر پاسخ از نوع HTML بود (نه JSON)، دیتا را از data-page دربیاور
    if (typeof data === "string") {
      const $ = cheerio.load(data);
      const appDiv = $("#app");
      if (appDiv.length > 0 && appDiv.attr("data-page")) {
        try {
          data = JSON.parse(appDiv.attr("data-page"));
        } catch (e) {}
      }
    }

    if (typeof data === "object" && data !== null) {
      // 🎯 هدف‌گیری دقیق ساختار JSON مجد مارکت
      const sections = data?.props?.sections || [];
      const productSection = sections.find((s) => s.key === "product");

      if (productSection && Array.isArray(productSection.items)) {
        for (const item of productSection.items) {
          if (products.length >= limit) break;

          // اصلاح آدرس عکس‌ها (کلید عکس در این سایت thumb است)
          let image = item.thumb || null;
          if (image && typeof image === "string" && image.startsWith("/")) {
            image = `https://majdmarket.com${image}`;
          }

          products.push({
            storeName: "مجد مارکت",
            productTitle: item.title || "—",
            price: parseInt(
              String(item.price || "0").replace(/[^\d]/g, ""),
              10,
            ),
            link: item.url || `https://majdmarket.com/products/${item.id}`,
            image: image,
            images: image ? [image] : [],
          });
        }
      } else {
        // (پشتیبان) اگر ساختار تغییر کرد، از روش پیمایش عمیق استفاده کن
        const walk = (obj, depth = 0) => {
          if (
            depth > 25 ||
            !obj ||
            typeof obj !== "object" ||
            products.length >= limit
          )
            return;
          if (Array.isArray(obj)) {
            obj.forEach((x) => walk(x, depth + 1));
            return;
          }

          const name = obj.title || obj.name;
          const price = obj.price;
          const slug = obj.slug || obj.id || obj.url;

          if (
            name &&
            price &&
            slug &&
            typeof name === "string" &&
            name.length > 3
          ) {
            const pNum = parseInt(String(price).replace(/[^\d]/g, ""), 10);
            if (pNum > 1000 && !products.some((p) => p.productTitle === name)) {
              let rawImage =
                obj.thumb || obj.image || obj.thumbnail || obj.cover;
              let image = rawImage;
              if (image && typeof image === "string" && image.startsWith("/")) {
                image = `https://majdmarket.com${image}`;
              }

              let link = obj.url || `https://majdmarket.com/products/${slug}`;
              if (link && !link.startsWith("http")) {
                link = `https://majdmarket.com${link.startsWith("/") ? "" : "/"}${link}`;
              }

              products.push({
                storeName: "مجد مارکت",
                productTitle: name,
                price: pNum,
                link: link,
                image: image || null,
                images: image ? [image] : [],
              });
            }
          }
          Object.values(obj).forEach((v) => walk(v, depth + 1));
        };
        walk(data);
      }
    }

    const sliced = products.slice(0, limit);
    log("OK", "MajdMarket", `${sliced.length} products`);
    return sliced;
  } catch (error) {
    log("ERR", "MajdMarket", error.message.split("\n")[0]);
    return [];
  }
}

// ================================================================
// BASALAM
// ================================================================
async function searchBasalam(query, limit = 20) {
  try {
    // استفاده از endpoint جدید که از cURL استخراج شد
    const url = `https://services.basalam.com/web/v1/search/product/search`;

    const params = {
      from: 0,
      q: query,
      dynamicFacets: true,
      size: limit,
      enableNavigations: true,
      adsImpressionDisable: false,
      grouped: false,
      userCityId: 1873, // می‌توانید این را ثابت نگه دارید یا داینامیک کنید
    };

    const r = await axios.get(url, {
      params,
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
        Origin: "https://basalam.com",
        Referer: "https://basalam.com/",
        // هدرهای کلیدی که از cURL استخراج شدند
        "x-client-info": JSON.stringify({
          version: "4.14.3",
          project: "charsou",
          platform: "web",
          name: "web.public",
          deviceId: "0774f75c-7526-491f-8d72-f1f3e7b77e42", // می‌توانید یک ID ثابت یا تصادفی بگذارید
          sessionId: "d81c36e4-2c20-4004-aec6-e4b6be356d90",
        }),
        "x-creation-tags": JSON.stringify({
          client: "customer-charsou",
          os: "windows",
          uri: "/s",
          fullPath: `https://basalam.com/s?q=${encodeURIComponent(query)}`,
          device: "desktop",
          app: "web",
        }),
      },
      validateStatus: () => true,
    });

    if (r.status !== 200 || !r.data) {
      log("WARN", "Basalam", `HTTP ${r.status}`);
      return [];
    }

    // ساختار پاسخ بر اساس مستندات و cURL (احتمالاً hits یا products)
    const hits = r.data?.hits || r.data?.products || r.data?.data || [];

    if (!Array.isArray(hits) || hits.length === 0) {
      log("OK", "Basalam", `0 products`);
      return [];
    }

    const products = hits
      .map((item) => {
        const p = item._source || item;
        let image =
          p.photo?.MEDIUM || p.photo?.SMALL || p.photo || p.image || null;
        if (image && typeof image === "string" && image.startsWith("/")) {
          image = `https://basalam.com${image}`;
        }

        // 🎯 تبدیل ریال به تومان با تقسیم بر ۱۰
        const rawPrice = parseInt(
          String(p.price || p.primaryPrice || "0").replace(/[^\d]/g, ""),
          10,
        );
        const priceInToman = Math.round(rawPrice / 10);

        return {
          storeName: "باسلام",
          productTitle: p.name || p.title || "—",
          price: priceInToman, // ← استفاده از قیمت تبدیل‌شده
          link: `https://basalam.com/p/${p.id || p.productId}`,
          image,
          images: image ? [image] : [],
        };
      })
      .filter((p) => p.price > 1000);

    const sliced = products.slice(0, limit);
    log("OK", "Basalam", `${sliced.length} products`);
    return sliced;
  } catch (error) {
    log("ERR", "Basalam", error.message);
    return [];
  }
}

// ================================================================
// DIVAR (Web Scraping)
// ================================================================
async function searchDivar(query, limit = 20) {
  try {
    // جستجو در دسته‌بندی "لوازم هنری و تحریر" دیوار
    const url = `https://divar.ir/s/tehran/art-supplies?q=${encodeURIComponent(query)}`;
    const r = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
      },
      validateStatus: () => true,
    });

    if (r.status !== 200 || typeof r.data !== "string") {
      log("WARN", "Divar", `0 products (HTTP ${r.status})`);
      return [];
    }

    const $ = cheerio.load(r.data);
    const products = [];

    // استخراج آگهی‌ها از HTML
    $('div[data-testid="post-list-item"]').each((i, el) => {
      if (products.length >= limit) return false;
      const $el = $(el);
      const title = $el.find("h2").text().trim();
      if (!title) return;

      const priceText =
        $el.find('div[data-testid="price"]').text().trim() || $el.text();
      const priceMatch = priceText.match(/([\d۰-۹]{1,3}(?:[،,][\d۰-۹]{3})+)/);
      if (!priceMatch) return;

      const price = parseInt(
        priceMatch[1]
          .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
          .replace(/[،,]/g, ""),
        10,
      );
      if (price < 1000) return;

      const href = $el.find("a").attr("href") || "";
      const link = href.startsWith("http") ? href : `https://divar.ir${href}`;

      let image = $el.find("img").attr("src") || null;
      if (image && image.startsWith("/")) image = `https://divar.ir${image}`;

      products.push({
        storeName: "دیوار",
        productTitle: title,
        price,
        link,
        image,
        images: image ? [image] : [],
      });
    });

    const sliced = products.slice(0, limit);
    log("OK", "Divar", `${sliced.length} products`);
    return sliced;
  } catch (error) {
    log("ERR", "Divar", error.message);
    return [];
  }
}

// ================================================================
// SHEYPOOR (Web Scraping)
// ================================================================
async function searchSheypoor(query, limit = 20) {
  try {
    // جستجو در دسته‌بندی "لوازم هنری و تحریر" شیپور
    const url = `https://www.sheypoor.com/s/tehran/art-supplies?q=${encodeURIComponent(query)}`;
    const r = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
      },
      validateStatus: () => true,
    });

    if (r.status !== 200 || typeof r.data !== "string") {
      log("WARN", "Sheypoor", `0 products (HTTP ${r.status})`);
      return [];
    }

    const $ = cheerio.load(r.data);
    const products = [];

    // استخراج آگهی‌ها از HTML (ساختار ممکن است نیاز به تنظیم داشته باشد)
    $('article, .listing-item, [data-testid="listing-card"]').each((i, el) => {
      if (products.length >= limit) return false;
      const $el = $(el);
      const title = $el.find("h2, h3, .title").first().text().trim();
      if (!title || title.length < 3) return;

      const priceText = $el
        .find('.price, [class*="price"]')
        .first()
        .text()
        .trim();
      const priceMatch = priceText.match(/([\d۰-۹]{1,3}(?:[،,][\d۰-۹]{3})+)/);
      if (!priceMatch) return;

      const price = parseInt(
        priceMatch[1]
          .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
          .replace(/[،,]/g, ""),
        10,
      );
      if (price < 1000) return;

      const href = $el.find("a").attr("href") || "";
      const link = href.startsWith("http")
        ? href
        : `https://www.sheypoor.com${href}`;

      let image = $el.find("img").attr("src") || null;
      if (image && image.startsWith("/"))
        image = `https://www.sheypoor.com${image}`;

      products.push({
        storeName: "شیپور",
        productTitle: title,
        price,
        link,
        image,
        images: image ? [image] : [],
      });
    });

    const sliced = products.slice(0, limit);
    log("OK", "Sheypoor", `${sliced.length} products`);
    return sliced;
  } catch (error) {
    log("ERR", "Sheypoor", error.message);
    return [];
  }
}

// ================================================================
// MAIN FUNCTION
// ================================================================
const STORE_EN_MAP = {
  دیجی‌کالا: "Digikala",
  ترب: "Torob",
  قلم‌تراش: "Ghalamtarash",
  "آرمان آرت": "ArmanArt",
  عالم‌زاده: "Alemzadeh",
  "مهستان آرت": "MahestanArt",
  "مجد مارکت": "MajdMarket",
  باسلام: "Basalam",
  دیوار: "Divar",
  شیپور: "Sheypoor",
};

function getStoreEn(name) {
  return STORE_EN_MAP[name] || name;
}

async function compareBasket(shoppingList, options = {}) {
  const MIN_QUERY_MATCH = 0.6;
  const MIN_TOKEN_RATIO = 0.75;

  const { batchId = null, batchIndex = null, batchTotal = null } = options;

  const queries = [];
  let queryIndex = 0;

  for (const query of shoppingList) {
    queryIndex++;

    // ─── Separator بین batchها ───
    if (batchId && batchIndex === 1) {
      const W = 72;
      const border = "=".repeat(W);
      const pad = (str) => str.padEnd(W - 1, " ");
      const time = new Date().toTimeString().slice(0, 8);

      console.log(`\n+${border}+`);
      console.log(`| ${pad("BATCH STARTED")}|`);
      console.log(`+${border}+`);
      console.log(`| ${pad("ID    : " + batchId)}|`);
      console.log(`| ${pad("ITEMS : " + batchTotal)}|`);
      console.log(`| ${pad("TIME  : " + time)}|`);
      console.log(`+${border}+\n`);
    } else if (batchIndex && batchIndex > 1) {
      console.log(`\n${"-".repeat(74)}`);
    } else if (!batchId && queryIndex === 1) {
      console.log("");
    }

    // ─── Progress tag (مثلاً 2/5) ───
    const progress =
      batchTotal > 1 && batchIndex ? `${batchIndex}/${batchTotal}` : `1/1`;
    log("QRY", null, `[${progress}] ${query}`);

    const otherStores = NEW_STORES_CONFIG.filter((s) => s.name !== "مجد مارکت");

    // ساخت آرایه‌ی تسک‌ها با نام فروشگاه
    const storeTasks = [
      { name: "دیجی‌کالا", promise: searchDigikala(query, 20) },
      { name: "ترب", promise: searchTorob(query, 20) },
      ...otherStores.map((s) => ({
        name: s.name,
        promise: searchWooCommerceStore(s, query, 20),
      })),
      { name: "مجد مارکت", promise: searchMajdMarket(query, 20) },
      { name: "باسلام", promise: searchBasalam(query, 20) },
      { name: "دیوار", promise: searchDivar(query, 20) },
      { name: "شیپور", promise: searchSheypoor(query, 20) },
    ];

    const settled = await Promise.allSettled(storeTasks.map((t) => t.promise));

    const storeStatuses = [];
    const allProducts = [];

    // ─── خط QRY ───
    const qryTime = Date.now();
    const progressTag =
      batchTotal > 1 && batchIndex ? `(${batchIndex}/${batchTotal}) ` : "";
    storeStatuses.push({
      store: "",
      status: "QRY",
      count: 0,
      message: `"${query}"`,
      progress: progressTag,
      at: qryTime,
    });

    settled.forEach((result, idx) => {
      const storeName = storeTasks[idx].name;
      const storeEn = getStoreEn(storeName);
      const at = Date.now();

      if (result.status === "fulfilled") {
        const products = Array.isArray(result.value) ? result.value : [];
        const count = products.length;
        const status = count > 0 ? "OK" : "WARN";
        const message = count > 0 ? `${count} products` : "0 products";
        storeStatuses.push({
          store: storeEn,
          status,
          count,
          message,
          at,
        });
        allProducts.push(...products);
      } else {
        const errMsg = result.reason?.message || "unknown error";
        storeStatuses.push({
          store: storeEn,
          status: "ERR",
          count: 0,
          message: errMsg.substring(0, 120),
          at,
        });
      }
    });

    const queryTokens = tokenize(query);
    const queryIds = queryTokens.filter(isCriticalIdentifier);

    log(
      "FETCH",
      null,
      `got ${allProducts.length} products` +
        (queryIds.length ? ` | ids: ${queryIds.join(",")}` : ""),
    );

    const relevantProducts = [];
    const rejectedProducts = [];
    let acceptedCount = 0,
      rejectedCount = 0,
      zeroPriceRejected = 0;

    for (const p of allProducts) {
      const matchInfo = queryMatchScore(query, p.productTitle);
      const passesScore = matchInfo.score >= MIN_QUERY_MATCH;
      const passesRatio = matchInfo.ratio >= MIN_TOKEN_RATIO;

      // ─── سخت‌گیری: برای جستجوهای ۳ کلمه‌ای یا کمتر، همه کلمات باید موجود باشند ───
      let isAccepted = passesScore && passesRatio;
      if (queryTokens.length <= 3 && matchInfo.missedTokens.length > 0) {
        isAccepted = false; // رد کردن محصول اگر حتی یک کلمه کم داشته باشد
      }

      if (isAccepted) {
        if (p.price === 0) {
          zeroPriceRejected++;
        } else {
          acceptedCount++;
          relevantProducts.push(p);
        }
      } else {
        rejectedCount++;
        rejectedProducts.push({
          storeName: p.storeName,
          title: p.productTitle,
          price: p.price,
          link: p.link,
          image: p.image || null,
          score: matchInfo.score,
          ratio: matchInfo.ratio,
          reason: matchInfo.reason || "low match",
          matchedTokens: matchInfo.matchedTokens || [],
          missedTokens: matchInfo.missedTokens || [],
          queryTokens: tokenize(query),
        });
      }
    }

    log(
      "FILT",
      null,
      `accepted: ${acceptedCount} | rejected: ${rejectedCount} | zero-price: ${zeroPriceRejected}`,
    );

    const clusters = clusterProducts(relevantProducts, 0.5);

    const matches = clusters
      .map((cluster) => {
        const byStore = {};
        for (const offer of cluster.offers) {
          if (
            !byStore[offer.storeName] ||
            offer.price < byStore[offer.storeName].price
          ) {
            byStore[offer.storeName] = offer;
          }
        }
        const offers = Object.values(byStore).sort((a, b) => a.price - b.price);
        const cheapest = offers[0];
        const mostExpensive = offers[offers.length - 1];
        const savings = mostExpensive.price - cheapest.price;
        const savingsPercent =
          mostExpensive.price > 0
            ? Math.round((savings / mostExpensive.price) * 100)
            : 0;
        return {
          productName: cluster.representative.productTitle,
          offers,
          cheapest,
          savings,
          savingsPercent,
          storeCount: offers.length,
        };
      })
      .filter((m) => m.offers.length > 0 && m.cheapest.price > 0)
      .sort((a, b) => {
        if (b.storeCount !== a.storeCount) return b.storeCount - a.storeCount;
        return a.cheapest.price - b.cheapest.price;
      });

    log("DONE", null, `${matches.length} clusters for «${query}»`);
    // محصولات نهایی که به کاربر نشون داده می‌شن
    const visibleProductTitles = [];
    for (const match of matches) {
      if (match.productName) {
        visibleProductTitles.push(match.productName);
      }
    }

    queries.push({
      query,
      matches,
      rejectedProducts,
      storeStatuses,
      visibleProductTitles,
      stats: {
        totalReceived: allProducts.length,
        accepted: acceptedCount,
        rejected: rejectedCount,
        zeroPrice: zeroPriceRejected,
      },
    });
    await new Promise((r) => setTimeout(r, 800));
  }

  // Build basketComparison
  const storeNames = new Set();
  for (const { matches } of queries) {
    for (const match of matches) {
      for (const offer of match.offers) storeNames.add(offer.storeName);
    }
  }

  const basketComparison = Array.from(storeNames)
    .map((storeName) => {
      let total = 0,
        itemCount = 0;
      const missing = [],
        pickedItems = [];

      for (const { query, matches } of queries) {
        const offersForStore = [];
        for (const match of matches) {
          const offer = match.offers.find((o) => o.storeName === storeName);
          if (offer) offersForStore.push(offer);
        }

        if (offersForStore.length === 0) {
          missing.push(query);
          continue;
        }

        offersForStore.sort((a, b) => a.price - b.price);
        const cheapest = offersForStore[0];
        const others = offersForStore.slice(1);

        total += cheapest.price;
        itemCount++;
        pickedItems.push({
          query,
          title: cheapest.productTitle,
          price: cheapest.price,
          link: cheapest.link,
          image: cheapest.image || null,
          images: cheapest.images || (cheapest.image ? [cheapest.image] : []),
          productId: cheapest.productId || null,
          otherItems: others.map((o) => ({
            title: o.productTitle,
            price: o.price,
            link: o.link,
            image: o.image || null,
            images: o.images || (o.image ? [o.image] : []),
            productId: o.productId || null,
          })),
        });
      }

      return { storeName, total, itemCount, missing, items: pickedItems };
    })
    .filter((b) => b.itemCount > 0)
    .sort((a, b) => {
      if (a.total !== b.total) return a.total - b.total;
      return b.itemCount - a.itemCount;
    });

  log("END ", null, `${basketComparison.length} stores with results`);

  // ─── پایان Batch ───
  if (batchId && batchIndex === batchTotal) {
    const W = 72;
    const border = "=".repeat(W);
    const pad = (str) => str.padEnd(W - 1, " ");

    console.log(`+${border}+`);
    console.log(`| ${pad("BATCH COMPLETED")}|`);
    console.log(`+${border}+\n`);
  }

  return { queries, basketComparison };
}

module.exports = { compareBasket };
