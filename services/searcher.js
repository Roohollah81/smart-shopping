const axios = require("axios");
const cheerio = require("cheerio");

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

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

const NEGATIVE_MODIFIERS = new Set([
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
  "شارژر",
  "باتری",
  "کابل",
  "آداپتور",
  "محافظ",
  "قاب",
  "کیف",
  "جعبه",
  "سیم",
  "مبدل",
  "برچسب",
  "فیلتر",
  "نوک",
  "تیغ",
  "سوزن",
  "کارتریج",
  "تعمیر",
  "سرویس",
  "نصب",
  "آموزش",
  "راهنما",
  "کتاب",
  "دفترچه",
  "بجای",
]);

// ---------------------------------------------------------------
// 🚫 تداخل دسته‌بندی
// ---------------------------------------------------------------
const CATEGORY_CONFLICTS = [
  { query: ["اتود"], title: ["پاک کن", "پاک‌کن", "پاکن"] },
  { query: ["تراش"], title: ["دفتر", "قلمتراش", "قلم تراش"] },
  { query: ["قیچی"], title: ["دفتر", "کاغذ", "مقوا"] },
  // 🎯 اگر کاربر «جلد» خواست، عنوانی که نشانه‌های «دفتر بودن» دارد رد شود
  { query: ["جلد"], title: ["کاغذ", "مقوا", "برگ", "صفحه", "صفحات"] },
];

function normalize(text) {
  if (!text) return "";
  return text
    .toString()
    .replace(/[۰-۹]/g, (d) => PERSIAN_DIGITS.indexOf(d))
    .replace(/[٠-٩]/g, (d) => ARABIC_DIGITS.indexOf(d))
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[-_.,،;:()\[\]{}«»"'\u060C\u061B\u061F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

// ---------------------------------------------------------------
// 🎯 تطبیق دو توکن (نسخه سخت‌گیرانه برای توکن‌های کوتاه)
// ---------------------------------------------------------------
function tokensMatch(queryToken, titleToken) {
  if (queryToken === titleToken) return true;
  if (isCriticalIdentifier(queryToken)) return false;

  const shorter =
    queryToken.length < titleToken.length ? queryToken : titleToken;
  const longer =
    queryToken.length < titleToken.length ? titleToken : queryToken;

  if (shorter.length < 3) return false;

  // 🎯 توکن‌های کوتاه (≤۴ حرف): فقط تطبیق کامل یا با پسوند ساده
  if (shorter.length <= 4) {
    const suffixes = ["ی", "ها", "های", "تر", "ترین", "و"];
    for (const s of suffixes) {
      if (longer === shorter + s) return true;
    }
    return false;
  }

  // 🎯 توکن‌های بلند (≥۵ حرف): substring مجاز
  return longer.includes(shorter);
}

// ---------------------------------------------------------------
// 🚫 کلمات ناخواسته — تفکیک سخت‌گیرانه و نرم
// ---------------------------------------------------------------
// این‌ها همیشه رد می‌شوند (هر جای عنوان که باشند)
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
]);

// این‌ها فقط اگر قبل از کلمات query بیایند رد می‌شوند
// (یعنی وقتی محصول جانبی است، نه توضیح بسته‌بندی)
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

function findUnwantedModifier(query, title) {
  const qTokens = new Set(tokenize(query));
  const tTokens = tokenize(title);
  if (tTokens.length === 0) return null;

  // مرحله ۱: بررسی کلمات «همیشه منفی»
  for (const token of tTokens) {
    if (ALWAYS_NEGATIVE.has(token) && !qTokens.has(token)) {
      return token;
    }
  }

  // مرحله ۲: بررسی کلمات جانبی با ترتیب
  for (let i = 0; i < tTokens.length; i++) {
    const token = tTokens[i];
    if (!ACCESSORY_WORDS.has(token)) continue;
    if (qTokens.has(token)) continue;

    // آیا این کلمه قبل از هر کلمه‌ی query در عنوان آمده؟
    // اگر بله → احتمالاً محصول جانبی است (مثل «کیف مداد»)
    // اگر نه → توضیح بسته‌بندی است (مثل «مداد با جعبه»)
    let comesBeforeQueryWord = false;
    for (let j = 0; j < tTokens.length; j++) {
      if (qTokens.has(tTokens[j])) {
        if (i < j) comesBeforeQueryWord = true;
        break;
      }
    }

    // فقط اگر کلمه جانبی «در ابتدای عنوان» باشد، رد می‌کنیم
    // مگر اینکه هیچ کلمه‌ی query در عنوان نباشد (که آن‌وقت رد می‌شود)
    if (i === 0 || comesBeforeQueryWord) {
      return token;
    }
  }

  return null;
}

function hasCategoryConflict(query, title) {
  const qNorm = normalize(query);
  const tNorm = normalize(title);

  for (const rule of CATEGORY_CONFLICTS) {
    const qHasAny = rule.query.some((kw) => qNorm.includes(normalize(kw)));
    if (!qHasAny) continue;
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

  const unwanted = findUnwantedModifier(query, title);
  if (unwanted) {
    return {
      score: 0,
      ratio: 0,
      matchedTokens: [],
      missedTokens: [unwanted],
      reason: `کلمه ناخواسته در عنوان: «${unwanted}» (در query نیست)`,
    };
  }

  // 🎯 چک تداخل دسته‌بندی
  const conflict = hasCategoryConflict(query, title);
  if (conflict) {
    return {
      score: 0,
      ratio: 0,
      matchedTokens: [],
      missedTokens: [conflict],
      reason: `تداخل دسته‌بندی: «${conflict}» در عنوان (query نمی‌خواهد)`,
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
      reason: `شناسه حیاتی مطابقت ندارد: ${missedIdentifiers.join("، ")}`,
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
    const isMatched = tt.some((t) => tokensMatch(token, t));
    if (isMatched) {
      matchedWeight += weight;
      matchedCount++;
      matchedTokens.push(token);
    } else missedTokens.push(token);
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

// ---------------------------------------------------------------
// 🖼️ استخراج URL تصویر با کیفیت بالا
// ---------------------------------------------------------------
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

// ---------------------------------------------------------------
// 🖼️ استخراج محصولات از __NEXT_DATA__
// ---------------------------------------------------------------
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

// ---------------------------------------------------------------
// 💰 استخراج قیمت از متن (با حداقل ۱۰۰۰ تومان)
// ---------------------------------------------------------------
function parsePriceText(text, currency) {
  if (!text) return 0;

  const cleaned = text
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));

  // 🎯 فقط اعدادی که با فرمت قیمت (کاما دار) نوشته شده‌اند
  // این الگو: عدد ۱ تا ۳ رقمی، سپس یک یا چند گروه «,XXX»
  const priceMatches = cleaned.match(/\d{1,3}(?:,\d{3})+/g);

  let price = 0;

  if (priceMatches && priceMatches.length > 0) {
    // اگر چند عدد با فرمت قیمت هست، بزرگ‌ترین (که معمولاً قیمت واقعی است) را انتخاب کن
    const values = priceMatches.map((m) => parseInt(m.replace(/,/g, ""), 10));
    price = Math.max(...values);
  } else {
    // اگر فرمت کاما نداشت (قیمت‌های زیر ۱۰۰۰ تومان)، از روش قدیمی استفاده کن
    price = parseInt(cleaned.replace(/[^\d]/g, ""), 10);
  }

  if (isNaN(price) || price === 0) return 0;

  if (currency === "rial") price = Math.round(price / 10);

  if (price < 1000 || price > 500000000) return 0;

  return price;
}

// ================================================================
// 🌐 پیکربندی فروشگاه‌ها
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
    priceSelector: ".price ins .amount, .price .amount, .price",
    currency: "toman",
  },
  {
    name: "عالم‌زاده",
    domain: "alemzadeh.ir",
    searchUrl: (q) =>
      `https://alemzadeh.ir/?s=${encodeURIComponent(q)}&post_type=product`,
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
    itemSelector: ".product-card, .product-item, li.product",
    titleSelector: "h3, h2, .product-title",
    priceSelector: ".product-price, .price",
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
// 🌐 جستجو در ووکامرس
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

  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
      },
      timeout: 20000,
      validateStatus: () => true,
    });

    if (response.status !== 200 || !response.data) {
      console.log(`  ⚠️ ${name}: HTTP ${response.status}`);
      return [];
    }

    const $ = cheerio.load(response.data);
    const products = [];
    const seen = new Set();

    // تلاش برای __NEXT_DATA__
    const nextDataMatch = response.data.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const nextProducts = extractFromNextData(nextData, name, domain);
        if (nextProducts.length > 0) {
          console.log(
            `  ✔ ${name}: ${nextProducts.length} محصول از __NEXT_DATA__`,
          );
          return nextProducts.slice(0, limit);
        }
      } catch (e) {}
    }

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

        // 🎯 اولویت ۱: قیمت فروش (ins) — قیمت خط‌خورده (del) بزرگ‌تر است
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
        });
      });

    console.log(`  ✔ ${name}: ${products.length} محصول استخراج شد`);
    return products;
  } catch (error) {
    console.log(`  ⚠️ ${name}: خطا (${error.message})`);
    return [];
  }
}

// ================================================================
// 🏪 دیجی‌کالا
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
    return products.slice(0, limit).map((p) => ({
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
      link: `https://www.digikala.com/product/dkp-${p.id}/`,
      image: extractDigikalaImage(p),
    }));
  } catch (error) {
    console.warn(`⚠️ خطا در جستجوی دیجی‌کالا:`, error.message);
    return [];
  }
}

// ================================================================
// 🏪 ترب
// ================================================================
async function searchTorob(query, limit = 20) {
  try {
    const response = await axios.get(
      "https://api.torob.com/v4/base-product/search/",
      {
        params: { q: query, source: "next_desktop", page: 0, size: limit },
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
          Referer: "https://torob.com/",
          Origin: "https://torob.com",
        },
        timeout: 15000,
      },
    );
    const products = response.data?.results || [];
    return products.slice(0, limit).map((p) => ({
      storeName: "ترب",
      productTitle: p.name1 || p.name || "—",
      price: parseInt(String(p.price || "0").replace(/[^\d]/g, ""), 10),
      link: `https://torob.com/p/${p.random_key || p.id}/`,
      image:
        p.image_url ||
        p.image ||
        p.thumbnail ||
        (p.images && p.images[0]) ||
        null,
    }));
  } catch (error) {
    console.warn(`⚠️ خطا در جستجوی ترب:`, error.message);
    return [];
  }
}

// ================================================================
// 🎯 تابع اصلی
// ================================================================
async function compareBasket(shoppingList) {
  const MIN_QUERY_MATCH = 0.6;
  const MIN_TOKEN_RATIO = 0.75;
  const SEP = "─".repeat(70);
  const THICK_SEP = "═".repeat(70);

  // 🎯 اجرای موازی همه‌ی queryها
  const queryResults = await Promise.all(
    shoppingList.map(async (query) => {
      console.log("\n\n");
      console.log(THICK_SEP);
      console.log(`🔍 جستجو: «${query}»`);
      console.log(THICK_SEP);

      const allResults = await Promise.all([
        searchDigikala(query, 20),
        searchTorob(query, 20),
        ...NEW_STORES_CONFIG.map((s) => searchWooCommerceStore(s, query, 20)),
        // searchAlemzadehWithPuppeteer(query, 20), // اگر Chrome نداری، کامنت کن
      ]);
      const allProducts = allResults.flat();

      const queryTokens = tokenize(query);
      const queryIds = queryTokens.filter(isCriticalIdentifier);

      console.log(`   تعداد کل محصولات دریافتی: ${allProducts.length}`);

      const relevantProducts = [];
      let acceptedCount = 0,
        rejectedCount = 0,
        zeroPriceRejected = 0;

      for (const p of allProducts) {
        const matchInfo = queryMatchScore(query, p.productTitle);
        const passesScore = matchInfo.score >= 0.6;
        const passesRatio = matchInfo.ratio >= 0.75;
        const isAccepted = passesScore && passesRatio;

        if (isAccepted) {
          if (p.price === 0) zeroPriceRejected++;
          else {
            acceptedCount++;
            relevantProducts.push(p);
          }
        } else rejectedCount++;
      }

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
          const offers = Object.values(byStore).sort(
            (a, b) => a.price - b.price,
          );
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

      console.log(
        `   ✅ ${acceptedCount} تأیید │ ❌ ${rejectedCount} رد │ 🎯 ${matches.length} خوشه`,
      );
      return { query, matches };
    }),
  );

  const queries = queryResults;

  // ===============================================================
  // ساخت basketComparison (گروه‌بندی بر اساس فروشگاه)
  // ===============================================================
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
        // 🎯 جمع‌آوری همه پیشنهادهای این فروشگاه برای این query
        const offersForStore = [];
        for (const match of matches) {
          const offer = match.offers.find((o) => o.storeName === storeName);
          if (offer) offersForStore.push(offer);
        }

        if (offersForStore.length === 0) {
          missing.push(query);
          continue;
        }

        // 🎯 مرتب‌سازی بر اساس قیمت (کمترین اول)
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
          // 🎯 سایر محصولات این فروشگاه برای این query
          otherItems: others.map((o) => ({
            title: o.productTitle,
            price: o.price,
            link: o.link,
            image: o.image || null,
          })),
        });
      }

      return { storeName, total, itemCount, missing, items: pickedItems };
    })
    .filter((b) => b.itemCount > 0)
    .sort((a, b) => {
      // 🎯 اولویت اول: مجموع سبد (کمترین → بیشترین)
      if (a.total !== b.total) return a.total - b.total;
      // 🎯 اولویت دوم: در صورت تساوی قیمت، فروشگاه با آیتم بیشتر بالاتر
      return b.itemCount - a.itemCount;
    });

  return { queries, basketComparison };
}

// ================================================================
// 🌐 اسکرپر اختصاصی عالم‌زاده با Puppeteer (برای جستجوی داینامیک)
// ================================================================
const puppeteer = require("puppeteer");

async function searchAlemzadehWithPuppeteer(query, limit = 20) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath:
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", // مسیر Chrome خود را اینجا بگذارید
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    const url = `https://alemzadeh.ir/products?q=${encodeURIComponent(query)}`;
    console.log(`  ⏳ عالم‌زاده: بارگذاری صفحه با Puppeteer...`);

    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // صبر کن تا کارت‌های محصول ظاهر شوند
    await page
      .waitForSelector(".product-card, li.product, .products .product", {
        timeout: 10000,
      })
      .catch(() => {});

    // اسکرول به پایین برای لود شدن تصاویر lazy
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await new Promise((r) => setTimeout(r, 800));
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 300));

    const products = await page.evaluate(() => {
      const items = document.querySelectorAll(
        ".product-card, li.product, .products .product",
      );
      const result = [];

      items.forEach((el) => {
        // 🎯 عنوان
        const titleEl = el.querySelector(
          "h3, h2, .product-card-title, .product-title, .woocommerce-loop-product__title",
        );
        if (!titleEl) return;
        const title = titleEl.textContent.trim();

        // 🎯 قیمت — سعی می‌کنیم عنصر خاص قیمت را بگیریم
        let priceText = "";
        const priceCandidates = [
          ".product-card-price",
          '[class*="price"]',
          ".price",
          ".amount",
        ];
        for (const sel of priceCandidates) {
          const el2 = el.querySelector(sel);
          if (el2) {
            const t = el2.textContent.trim();
            // باید حداقل یک عدد داشته باشد
            if (/\d/.test(t)) {
              priceText = t;
              break;
            }
          }
        }
        if (!priceText) return;

        // 🎯 لینک — چند روش
        let link = "";
        // ۱. اگر خود کارت anchor است
        if (el.tagName === "A" && el.href) {
          link = el.href;
        } else {
          // ۲. اولین anchor داخل کارت
          const a = el.querySelector("a[href]");
          if (a && a.href) link = a.href;

          // ۳. اگر عنوان داخل anchor باشد
          if (!link) {
            const titleLink = titleEl.closest("a");
            if (titleLink && titleLink.href) link = titleLink.href;
          }
        }

        // 🎯 تصویر — با پشتیبانی از lazy-load
        let image = null;
        const imgEl = el.querySelector("img");
        if (imgEl) {
          image =
            imgEl.getAttribute("data-src") ||
            imgEl.getAttribute("data-lazy-src") ||
            imgEl.getAttribute("data-original") ||
            imgEl.getAttribute("data-srcset") ||
            imgEl.src ||
            null;

          // اگر srcset بود، اولین URL را بگیر
          if (image && image.includes(",")) {
            image = image.split(",")[0].trim().split(" ")[0];
          }

          // اگر data URI یا placeholder بود، رد کن
          if (
            image &&
            (image.startsWith("data:") || image.includes("placeholder"))
          ) {
            image = null;
          }

          // تبدیل به URL مطلق
          if (image && !image.startsWith("http")) {
            try {
              image = new URL(image, window.location.origin).href;
            } catch (e) {
              image = null;
            }
          }
        }

        // 🎯 قیمت — تبدیل به عدد
        const cleanPrice = priceText
          .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
          .replace(/[^\d]/g, "");
        const price = parseInt(cleanPrice, 10);

        if (!isNaN(price) && price > 0 && title) {
          result.push({
            storeName: "عالم‌زاده",
            productTitle: title,
            price: price,
            link: link,
            image: image,
          });
        }
      });

      return result;
    });

    // 🎯 لاگ دیباگ: نمایش وضعیت لینک و تصویر
    const withLink = products.filter((p) => p.link).length;
    const withImage = products.filter((p) => p.image).length;
    console.log(
      `  ✔ عالم‌زاده: ${products.length} محصول | ${withLink} لینک | ${withImage} تصویر`,
    );

    // اگر مشکل داشت، ساختار اولین کارت را چاپ کن
    if (products.length > 0 && (withLink === 0 || withImage === 0)) {
      console.log("  🔍 دیباگ عالم‌زاده — نمونه محصول اول:");
      console.log("     عنوان:", products[0].productTitle);
      console.log("     لینک:", products[0].link || "(خالی)");
      console.log("     تصویر:", products[0].image || "(خالی)");

      // چاپ ساختار HTML اولین کارت
      const debugHtml = await page.evaluate(() => {
        const first = document.querySelector(
          ".product-card, li.product, .products .product",
        );
        return first ? first.outerHTML.substring(0, 1500) : "not found";
      });
      console.log("     HTML نمونه:", debugHtml);
    }

    return products.slice(0, limit);
  } catch (error) {
    console.log(`  ⚠️ عالم‌زاده: خطا در Puppeteer (${error.message})`);
    return [];
  } finally {
    await browser.close();
  }
}

module.exports = { compareBasket };
