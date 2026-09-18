const axios = require("axios");

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
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const union = setA.size + setB.size - inter;
  return inter / union;
}

function isModelToken(token) {
  return /[a-z0-9]/i.test(token) && token.length >= 2;
}

function similarity(titleA, titleB) {
  const ta = tokenize(titleA);
  const tb = tokenize(titleB);
  const baseSim = jaccard(ta, tb);
  const modelA = ta.filter(isModelToken);
  const modelB = tb.filter(isModelToken);
  if (modelA.length && modelB.length) {
    const modelSim = jaccard(modelA, modelB);
    return 0.4 * baseSim + 0.6 * modelSim;
  }
  return baseSim;
}

function queryMatchScore(query, title) {
  const qt = tokenize(query);
  const tt = tokenize(title);
  if (qt.length === 0) return { score: 1, matchedTokens: [], missedTokens: [] };

  let totalWeight = 0;
  let matchedWeight = 0;
  const matchedTokens = [];
  const missedTokens = [];

  for (const token of qt) {
    const weight = Math.pow(token.length, 1.5);
    totalWeight += weight;

    // 🎯 مطابقت سخت‌گیرانه: توکن باید کامل در عنوان باشد
    // (نه اینکه عنوان شامل توکن باشد یا برعکس)
    const isMatched = tt.some((t) => t === token);

    if (isMatched) {
      matchedWeight += weight;
      matchedTokens.push(token);
    } else {
      missedTokens.push(token);
    }
  }

  const score = totalWeight > 0 ? matchedWeight / totalWeight : 0;
  return { score, matchedTokens, missedTokens };
}

function clusterProducts(products, threshold = 0.6) {
  const clusters = [];
  for (const product of products) {
    let bestCluster = null;
    let bestSim = 0;
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
    if (bestCluster) {
      bestCluster.offers.push(product);
    } else {
      clusters.push({
        representative: product,
        offers: [product],
      });
    }
  }
  return clusters;
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
    }));
  } catch (error) {
    console.warn(`⚠️ خطا در جستجوی دیجی‌کالا:`, error.message);
    return [];
  }
}

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
    }));
  } catch (error) {
    console.warn(`⚠️ خطا در جستجوی ترب:`, error.message);
    return [];
  }
}

async function compareBasket(shoppingList) {
  const queries = [];
  const MIN_QUERY_MATCH = 0.6;

  // خط جداکننده برای خوانایی بهتر لاگ‌ها
  const SEP = "─".repeat(70);
  const THICK_SEP = "═".repeat(70);

  for (const query of shoppingList) {
    const [digikalaResults, torobResults] = await Promise.all([
      searchDigikala(query, 20),
      searchTorob(query, 20),
    ]);

    const allProducts = [...digikalaResults, ...torobResults];

    console.log("\n\n");
    console.log(THICK_SEP);
    console.log(`🔍 جستجو: «${query}»`);
    console.log(`   توکن‌ها: ${tokenize(query).join(" | ")}`);
    console.log(`   تعداد محصولات دریافتی: ${allProducts.length}`);
    console.log(THICK_SEP);
    console.log("");

    // فیلتر محصولات نامرتبط
    const relevantProducts = [];
    let acceptedCount = 0;
    let rejectedCount = 0;

    for (const p of allProducts) {
      const matchInfo = queryMatchScore(query, p.productTitle);
      const isAccepted = matchInfo.score >= MIN_QUERY_MATCH;

      if (isAccepted) {
        acceptedCount++;
      } else {
        rejectedCount++;
      }

      const icon = isAccepted ? "✅" : "❌";
      const scoreStr = matchInfo.score.toFixed(2).padStart(4, " ");
      const store = p.storeName.padEnd(10, " ");
      const title =
        p.productTitle.length > 55
          ? p.productTitle.substring(0, 55) + "..."
          : p.productTitle;

      console.log(`${icon}  [${scoreStr}]  ${store}  │  ${title}`);

      const matched = matchInfo.matchedTokens.join(" + ") || "—";
      const missed = matchInfo.missedTokens.join(" + ") || "—";
      console.log(`              ✔ تطبیق: ${matched}`);
      if (matchInfo.missedTokens.length > 0) {
        console.log(`              ✘ جامانده: ${missed}`);
      }
      console.log("");

      if (isAccepted) {
        relevantProducts.push(p);
      }
    }

    console.log(SEP);
    console.log(
      `📊 خلاصه فیلتر: ${acceptedCount} تأیید شده  │  ${rejectedCount} رد شده  │  از ${allProducts.length} محصول`,
    );
    console.log(SEP);
    console.log("");

    const clusters = clusterProducts(relevantProducts);

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
        return b.savings - a.savings;
      })
      .slice(0, 10);

    console.log(`🎯 خوشه‌های نهایی برای «${query}»: ${matches.length}`);
    matches.forEach((m, i) => {
      const storeList = m.offers.map((o) => o.storeName).join(" / ");
      console.log(`   ${i + 1}. [${m.storeCount} فروشگاه] ${storeList}`);
      console.log(`      عنوان: ${m.productName.substring(0, 70)}`);
    });
    console.log("");

    queries.push({ query, matches });
    await new Promise((r) => setTimeout(r, 800));
  }

  const storeNames = new Set();
  for (const { matches } of queries) {
    for (const match of matches) {
      for (const offer of match.offers) {
        storeNames.add(offer.storeName);
      }
    }
  }

  const basketComparison = Array.from(storeNames)
    .map((storeName) => {
      let total = 0;
      let itemCount = 0;
      const missing = [];
      const pickedItems = [];
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

  console.log("\n\n");
  console.log(THICK_SEP);
  console.log("🏁 پایان تحلیل");
  console.log(THICK_SEP);
  console.log("");

  return { queries, basketComparison };
}

module.exports = { compareBasket };
