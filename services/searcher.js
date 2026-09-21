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

function tokensMatch(queryToken, titleToken) {
  if (queryToken === titleToken) return true;
  if (isCriticalIdentifier(queryToken)) return false;
  const shorter =
    queryToken.length < titleToken.length ? queryToken : titleToken;
  const longer =
    queryToken.length < titleToken.length ? titleToken : queryToken;
  if (shorter.length < 3) return false;
  return longer.includes(shorter);
}

function findUnwantedModifier(query, title) {
  const qTokens = new Set(tokenize(query));
  const tTokens = tokenize(title);
  for (const token of tTokens) {
    if (NEGATIVE_MODIFIERS.has(token) && !qTokens.has(token)) return token;
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

function isModelToken(token) {
  return /[a-z0-9]/i.test(token) && token.length >= 2;
}

function similarity(titleA, titleB) {
  const ta = tokenize(titleA),
    tb = tokenize(titleB);
  const baseSim = jaccard(ta, tb);
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
// 🖼️ استخراج تصویر از عنصر HTML
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

  for (const sel of imageSelectors) {
    const img = $(element).find(sel).first();
    if (img.length === 0) continue;

    let src =
      img.attr("data-src") ||
      img.attr("data-lazy-src") ||
      img.attr("data-original") ||
      img.attr("src") ||
      "";

    if (!src) {
      const srcset = img.attr("srcset") || img.attr("data-srcset") || "";
      if (srcset) src = srcset.split(",")[0].trim().split(" ")[0];
    }

    if (!src) continue;
    if (src.startsWith("data:")) continue;

    if (!src.startsWith("http")) {
      src = `https://${domain}${src.startsWith("/") ? "" : "/"}${src}`;
    }

    return src;
  }
  return null;
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
// 💰 استخراج قیمت از متن
// ---------------------------------------------------------------
function parsePriceText(text, currency) {
  if (!text) return 0;
  let cleaned = text
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[^\d]/g, "");
  let price = parseInt(cleaned, 10);
  if (isNaN(price) || price === 0) return 0;
  if (currency === "rial") price = Math.round(price / 10);
  if (price < 100 || price > 500000000) return 0;
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
    currency: "rial",
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

        let priceText = "";
        if ($(el).find(priceSelector).length === 0) {
          priceText = $(el).text();
        } else {
          priceText = $(el).find(priceSelector).first().text();
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

// ---------------------------------------------------------------
// 🖼️ استخراج URL تصویر با کیفیت بالا از API دیجی‌کالا
// ---------------------------------------------------------------
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
      if (typeof rawUrl === "string" && rawUrl.startsWith("http")) {
        url = rawUrl;
      }
    }

    if (!url) continue;

    // 🎯 حذف query string → نسخه اصلی با کیفیت بالا (1280×1280)
    return url.split("?")[0];
  }

  return null;
}

// ---------------------------------------------------------------
// 🎯 ارتقاء URL تصویر دیجی‌کالا به کیفیت بالا
// ---------------------------------------------------------------
function upgradeDigikalaImageUrl(url) {
  if (!url) return url;

  try {
    // روش ۱: اگر x-oss-process دارد، پارامتر resize را تغییر بده
    if (url.includes("x-oss-process")) {
      // تغییر w_220 (یا هر عددی) به w_1000
      let newUrl = url.replace(/resize[^/]*?w_\d+/g, "resize,w_1000");
      // تغییر h هم اگر وجود داشت
      newUrl = newUrl.replace(/resize[^/]*?h_\d+/g, "resize,h_1000");
      // افزایش کیفیت
      newUrl = newUrl.replace(/quality,q_\d+/g, "quality,q_95");
      // حذف m_lfit اگر می‌خواهیم سایز کامل باشد (اختیاری)
      if (newUrl.includes("w_1000")) return newUrl;
    }

    // روش ۲: اگر پارامترهای resize و quality جدا هستند
    if (url.match(/[?&]w=\d+/)) {
      return url.replace(/([?&])w=\d+/g, "$1w=1000");
    }

    // روش ۳: اگر URL شامل _220x220 یا _thumbnail است
    return url
      .replace(/_220x220/g, "_1000x1000")
      .replace(/_500x500/g, "_1000x1000")
      .replace(/_thumbnail/g, "_large")
      .replace(/-220x220/g, "-1000x1000");
  } catch (e) {
    return url;
  }
}

// ---------------------------------------------------------------
// 🏪 دیجی‌کالا
// ---------------------------------------------------------------
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

    return products.slice(0, limit).map((p) => {
      const image = extractDigikalaImage(p);

      // لاگ دیباگ (فقط برای تست — بعداً می‌توانید حذف کنید)
      if (!image) {
        console.log(
          `  ⚠️ دیجی‌کالا: تصویر برای «${(p.title_fa || "").substring(0, 40)}» یافت نشد`,
        );
        if (p.images)
          console.log(
            `     ساختار images:`,
            JSON.stringify(p.images).substring(0, 200),
          );
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
        link: `https://www.digikala.com/product/dkp-${p.id}/`,
        image,
      };
    });
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
    return products.slice(0, limit).map((p) => {
      let image =
        p.image_url ||
        p.image ||
        p.thumbnail ||
        (p.images && p.images[0]) ||
        null;

      // ارتقاء کیفیت تصویر ترب
      if (image && typeof image === "string") {
        // ترب معمولاً با پارامتر size یا width کار می‌کند
        image = image
          .replace(/[?&]size=\d+/g, "")
          .replace(/[?&]width=\d+/g, "")
          .replace(/[?&]height=\d+/g, "");
      }

      return {
        storeName: "ترب",
        productTitle: p.name1 || p.name || "—",
        price: parseInt(String(p.price || "0").replace(/[^\d]/g, ""), 10),
        link: `https://torob.com/p/${p.random_key || p.id}/`,
        image,
      };
    });
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

  const queries = [];

  for (const query of shoppingList) {
    console.log("\n\n");
    console.log(THICK_SEP);
    console.log(`🔍 جستجو: «${query}»`);
    console.log(THICK_SEP);
    console.log("📡 در حال جستجو در فروشگاه‌ها...");

    const allResults = await Promise.all([
      searchDigikala(query, 20),
      searchTorob(query, 20),
      ...NEW_STORES_CONFIG.map((s) => searchWooCommerceStore(s, query, 20)),
    ]);
    const allProducts = allResults.flat();

    const queryTokens = tokenize(query);
    const queryIds = queryTokens.filter(isCriticalIdentifier);

    console.log("");
    console.log(
      `   توکن‌ها (${queryTokens.length}): ${queryTokens.join(" | ")}`,
    );
    if (queryIds.length > 0)
      console.log(`   🔑 شناسه‌های حیاتی: ${queryIds.join(" | ")}`);
    console.log(`   تعداد کل محصولات دریافتی: ${allProducts.length}`);
    console.log(THICK_SEP);
    console.log("");

    const relevantProducts = [];
    let acceptedCount = 0,
      rejectedCount = 0,
      zeroPriceRejected = 0;

    for (const p of allProducts) {
      const matchInfo = queryMatchScore(query, p.productTitle);
      const passesScore = matchInfo.score >= MIN_QUERY_MATCH;
      const passesRatio = matchInfo.ratio >= MIN_TOKEN_RATIO;
      const isAccepted = passesScore && passesRatio;

      if (isAccepted) {
        if (p.price === 0) zeroPriceRejected++;
        else {
          acceptedCount++;
          relevantProducts.push(p);
        }
      } else rejectedCount++;

      const icon = isAccepted && p.price > 0 ? "✅" : "❌";
      const priceStr =
        p.price > 0 ? p.price.toLocaleString("fa-IR") + " ت" : "بدون قیمت";
      const scoreStr = matchInfo.score.toFixed(2).padStart(4, " ");
      const ratioStr =
        (matchInfo.ratio * 100).toFixed(0).padStart(3, " ") + "%";
      const store = p.storeName.padEnd(12, " ");
      const title =
        p.productTitle.length > 40
          ? p.productTitle.substring(0, 40) + "..."
          : p.productTitle;
      const imgFlag = p.image ? "🖼️" : "  ";

      console.log(
        `${icon} ${imgFlag} [${scoreStr}│${ratioStr}│${priceStr}]  ${store}  │  ${title}`,
      );

      if (matchInfo.reason) console.log(`        ⛔ ${matchInfo.reason}`);
      else if (!isAccepted) {
        const reasons = [];
        if (!passesScore) reasons.push(`امتیاز کم`);
        if (!passesRatio) reasons.push(`نسبت کم`);
        console.log(`        ⛔ ${reasons.join(" + ")}`);
      } else if (p.price === 0) console.log(`        ⚠️ قیمت استخراج نشد`);
      else
        console.log(`        ✔ ${matchInfo.matchedTokens.join(" + ") || "—"}`);
      console.log("");
    }

    console.log(SEP);
    console.log(
      `📊 خلاصه: ${acceptedCount} تأیید │ ${rejectedCount} رد تطبیق │ ${zeroPriceRejected} رد قیمت`,
    );
    console.log(SEP);
    console.log("");

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

    console.log(`🎯 خوشه‌های نهایی: ${matches.length}`);
    queries.push({ query, matches });
    await new Promise((r) => setTimeout(r, 800));
  }

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
        // ارزان‌ترین پیشنهاد آن فروشگاه برای این query
        let cheapestForStore = null;
        for (const match of matches) {
          const offer = match.offers.find((o) => o.storeName === storeName);
          if (
            offer &&
            (!cheapestForStore || offer.price < cheapestForStore.price)
          ) {
            cheapestForStore = offer;
          }
        }

        if (cheapestForStore) {
          total += cheapestForStore.price;
          itemCount++;
          pickedItems.push({
            query,
            title: cheapestForStore.productTitle,
            price: cheapestForStore.price,
            link: cheapestForStore.link,
            image: cheapestForStore.image || null,
          });
        } else {
          missing.push(query);
        }
      }

      return { storeName, total, itemCount, missing, items: pickedItems };
    })
    .filter((b) => b.itemCount > 0)
    .sort((a, b) => {
      if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount;
      return a.total - b.total;
    });

  return { queries, basketComparison };
}

module.exports = { compareBasket };
