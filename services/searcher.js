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

// ---------------------------------------------------------------
// 🚫 کلمات تغییردهنده‌ی معنا (اگر در عنوان باشند ولی در query نباشند، رد می‌شوند)
// ---------------------------------------------------------------
const NEGATIVE_MODIFIERS = new Set([
  // قطعات و یدکی
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
  // لوازم جانبی رایج
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
  // خدمات
  "تعمیر",
  "سرویس",
  "نصب",
  "آموزش",
  "راهنما",
  "کتاب",
  "دفترچه",
  // برای/مخصوص (اگر بخواهیم دقیق باشیم)
  "بجای",
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

// ---------------------------------------------------------------
// 🚫 بررسی کلمات ناخواسته در عنوان
// ---------------------------------------------------------------
function findUnwantedModifier(query, title) {
  const qTokens = new Set(tokenize(query));
  const tTokens = tokenize(title);

  for (const token of tTokens) {
    if (NEGATIVE_MODIFIERS.has(token) && !qTokens.has(token)) {
      return token;
    }
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

  // ⭐ چک کلمات ناخواسته (قبل از هر چیز)
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

  // ... بقیه کد قبلی بدون تغییر
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

// ---------------------------------------------------------------
// 🎯 شباهت با Overlap Coefficient (بهبودیافته برای خوشه‌بندی بین‌فروشگاهی)
// ---------------------------------------------------------------
function overlapCoefficient(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  return inter / Math.min(setA.size, setB.size);
}

// ---------------------------------------------------------------
// 🎯 شباهت بین دو عنوان — با بررسی دقیق شناسه‌های حیاتی
// ---------------------------------------------------------------
function similarity(titleA, titleB) {
  const ta = tokenize(titleA);
  const tb = tokenize(titleB);

  const jac = jaccard(ta, tb);
  const overlap = overlapCoefficient(ta, tb);
  const baseSim = 0.4 * jac + 0.6 * overlap;

  // شناسه‌های حیاتی (اعداد، مدل‌ها، کدها)
  const idsA = ta.filter(isCriticalIdentifier);
  const idsB = tb.filter(isCriticalIdentifier);

  // ============ حالت ۱: هیچ‌کدام شناسه ندارند ============
  if (idsA.length === 0 && idsB.length === 0) {
    return baseSim;
  }

  // ============ حالت ۲: یکی شناسه دارد، دیگری ندارد ============
  // ← این دقیقاً همان مشکل شماست: «پاکن برقی تیهو» vs «پاکن برقی تیهو TC8302»
  if (idsA.length > 0 && idsB.length === 0) {
    return baseSim * 0.4;
  }
  if (idsA.length === 0 && idsB.length > 0) {
    return baseSim * 0.4;
  }

  // ============ حالت ۳: هر دو شناسه دارند ============
  const commonIds = idsA.filter((id) => idsB.includes(id));

  // اگر هیچ شناسه‌ای مشترک نیست → تفاوت مدل آشکار
  if (commonIds.length === 0) {
    return baseSim * 0.3;
  }

  // اگر شناسه‌های مشترک وجود دارند → بر اساس نسبت تطبیق
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
// 🌐 پیکربندی فروشگاه‌های جدید
// ================================================================
const NEW_STORES_CONFIG = [
  { name: "قلم‌تراش", domain: "ghalamtarash.ir" },
  { name: "آرمان آرت", domain: "armanartstore.com" },
  { name: "عالم‌زاده", domain: "alemzadeh.ir" },
  { name: "مجد مارکت", domain: "majdmarket.com" },
  { name: "مهستان آرت", domain: "mahestanart.com" },
];

// ================================================================
// 🌐 جستجو در ووکامرس — با Store API + Scraping fallback
// ================================================================
async function searchWooCommerceStore(storeConfig, query, limit = 20) {
  const { name, domain } = storeConfig;

  // مرحله ۱: Store API (عمومی، بدون احراز هویت، همراه قیمت)
  const storeApiUrl = `https://${domain}/wp-json/wc/store/v1/products?search=${encodeURIComponent(query)}&per_page=${limit}`;

  try {
    const response = await axios.get(storeApiUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      timeout: 15000,
    });

    const products = response.data || [];
    if (Array.isArray(products) && products.length > 0) {
      const mapped = products.slice(0, limit).map((p) => ({
        storeName: name,
        productTitle: p.name || "—",
        price: parseStoreApiPrice(p),
        link: p.permalink || `https://${domain}/?p=${p.id}`,
      }));

      // اگر همه قیمت‌ها صفر بودند، به Scraping برو
      if (mapped.some((p) => p.price > 0)) {
        console.log(
          `  ✔ ${name}: ${mapped.length} محصول از Store API (قیمت‌دار)`,
        );
        return mapped;
      }
      console.log(
        `  ⚠️ ${name}: Store API پاسخ داد ولی قیمت‌ها خالی بودند، Scraping...`,
      );
    } else {
      console.log(`  ℹ️ ${name}: Store API محصولی برنگرداند، Scraping...`);
    }
  } catch (error) {
    console.log(
      `  ⚠️ ${name}: Store API خطا داد (${error.message})، Scraping...`,
    );
  }

  // مرحله ۲: Scraping HTML
  return await searchWooCommerceStoreByScraping(storeConfig, query, limit);
}

// استخراج قیمت از Store API
function parseStoreApiPrice(product) {
  if (product.prices) {
    const minorUnit = product.prices.currency_minor_unit ?? 0;
    const rawPrice = product.prices.price || product.prices.regular_price;
    if (rawPrice) {
      const num = parseInt(String(rawPrice).replace(/[^\d]/g, ""), 10);
      if (!isNaN(num) && num > 0)
        return Math.round(num / Math.pow(10, minorUnit));
    }
  }
  return 0;
}

// Scraping HTML به‌عنوان راه‌حل پشتیبان
async function searchWooCommerceStoreByScraping(
  storeConfig,
  query,
  limit = 20,
) {
  const { name, domain } = storeConfig;
  const url = `https://${domain}/?s=${encodeURIComponent(query)}&post_type=product`;

  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html",
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const products = [];

    const selectors = [
      "li.product",
      ".product",
      ".product-item",
      ".wc-block-grid__product",
      "article.product",
    ];

    for (const sel of selectors) {
      $(sel)
        .slice(0, limit)
        .each((i, el) => {
          const title = $(el)
            .find(
              "h2, h3, .woocommerce-loop-product__title, .wc-block-grid__product-title, .product-title, .entry-title",
            )
            .first()
            .text()
            .trim();
          const priceText = $(el)
            .find(
              ".price, .amount, .woocommerce-Price-amount, .wc-block-grid__product-price",
            )
            .first()
            .text()
            .trim();
          const link = $(el).find("a").first().attr("href") || "";

          if (!title || !priceText) return;

          const price = parseInt(priceText.replace(/[^\d]/g, ""), 10);
          if (isNaN(price) || price === 0) return;

          if (!products.some((p) => p.productTitle === title)) {
            products.push({
              storeName: name,
              productTitle: title,
              price,
              link: link.startsWith("http") ? link : `https://${domain}${link}`,
            });
          }
        });
      if (products.length > 0) break;
    }

    console.log(`  ✔ ${name}: ${products.length} محصول از Scraping`);
    return products;
  } catch (error) {
    console.warn(`  ⚠️ ${name}: Scraping هم خطا داد (${error.message})`);
    return [];
  }
}

// ================================================================
// 🏪 دیجی‌کالا
// ================================================================
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
    }));
  } catch (error) {
    console.warn(`⚠️ خطا در دیجی‌کالا:`, error.message);
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
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
    }));
  } catch (error) {
    console.warn(`⚠️ خطا در ترب:`, error.message);
    return [];
  }
}

// ================================================================
// 🎯 تابع اصلی
// ================================================================
async function compareBasket(shoppingList) {
  const queries = [];
  const MIN_QUERY_MATCH = 0.6;
  const MIN_TOKEN_RATIO = 0.75;
  const SEP = "─".repeat(70);
  const THICK_SEP = "═".repeat(70);

  for (const query of shoppingList) {
    console.log("\n\n");
    console.log(THICK_SEP);
    console.log(`🔍 جستجو: «${query}»`);
    console.log(THICK_SEP);

    // گزارش منابع
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
      rejectedCount = 0;
    let zeroPriceRejected = 0;

    for (const p of allProducts) {
      const matchInfo = queryMatchScore(query, p.productTitle);
      const passesScore = matchInfo.score >= MIN_QUERY_MATCH;
      const passesRatio = matchInfo.ratio >= MIN_TOKEN_RATIO;
      const isAccepted = passesScore && passesRatio;

      if (isAccepted) {
        if (p.price === 0) {
          zeroPriceRejected++;
        } else {
          acceptedCount++;
          relevantProducts.push(p);
        }
      } else {
        rejectedCount++;
      }

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

      console.log(
        `${icon}  [${scoreStr}│${ratioStr}│${priceStr}]  ${store}  │  ${title}`,
      );

      if (matchInfo.reason) {
        console.log(`        ⛔ ${matchInfo.reason}`);
      } else if (!isAccepted) {
        const reasons = [];
        if (!passesScore) reasons.push(`امتیاز کم`);
        if (!passesRatio)
          reasons.push(`نسبت کم (${(matchInfo.ratio * 100).toFixed(0)}%)`);
        console.log(`        ⛔ ${reasons.join(" + ")}`);
      } else if (p.price === 0) {
        console.log(
          `        ⚠️ تطبیق خوب ولی قیمت استخراج نشد — نادیده گرفته شد`,
        );
      } else {
        console.log(`        ✔ ${matchInfo.matchedTokens.join(" + ") || "—"}`);
      }
      console.log("");
    }

    console.log(SEP);
    console.log(
      `📊 خلاصه: ${acceptedCount} تأیید │ ${rejectedCount} رد تطبیق │ ${zeroPriceRejected} رد به‌خاطر قیمت`,
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
        // ۱. خوشه‌هایی که در چند فروشگاه هستند اول بیایند
        if (b.storeCount !== a.storeCount) return b.storeCount - a.storeCount;
        // ۲. سپس بر اساس ارزان‌ترین قیمت (صعودی)
        return a.cheapest.price - b.cheapest.price;
      })
      .slice(0, 30); // ← افزایش از ۱۰ به ۳۰

    // 📊 لاگ تفصیلی خوشه‌بندی
    console.log(`\n📦 خوشه‌بندی:`);
    console.log(`   کل محصولات تأییدشده: ${relevantProducts.length}`);
    console.log(`   تعداد خوشه‌ها: ${clusters.length}`);
    const multiStoreClusters = matches.filter((m) => m.storeCount > 1);
    console.log(`   خوشه‌های چندفروشگاهی: ${multiStoreClusters.length}`);
    const singleStoreClusters = matches.filter((m) => m.storeCount === 1);
    console.log(`   خوشه‌های تک‌فروشگاهی: ${singleStoreClusters.length}`);

    console.log(`🎯 خوشه‌های نهایی: ${matches.length}`);
    matches.forEach((m, i) => {
      const storeList = m.offers
        .map((o) => `${o.storeName} (${o.price.toLocaleString("fa-IR")})`)
        .join(" / ");
      console.log(`   ${i + 1}. [${m.storeCount} فروشگاه] ${storeList}`);
      console.log(`      ${m.productName.substring(0, 70)}`);
    });
    console.log("");

    queries.push({ query, matches });
    await new Promise((r) => setTimeout(r, 800));
  }

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
          });
        } else missing.push(query);
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
