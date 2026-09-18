const axios = require('axios');

// ---------------------------------------------------------------
// ۱. نرمال‌سازی متن فارسی/عربی
// ---------------------------------------------------------------
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function normalize(text) {
  if (!text) return '';
  return text
    .toString()
    .replace(/[۰-۹]/g, (d) => PERSIAN_DIGITS.indexOf(d))
    .replace(/[٠-٩]/g, (d) => ARABIC_DIGITS.indexOf(d))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[-_.,،;:()\[\]{}«»"'\u060C\u061B\u061F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokenize(text) {
  return normalize(text)
    .split(' ')
    .filter((t) => t.length >= 2);
}

// ---------------------------------------------------------------
// ۲. محاسبه شباهت بین دو عنوان
// ---------------------------------------------------------------
function jaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const union = setA.size + setB.size - inter;
  return inter / union;
}

// کلمات مدل‌مانند (انگلیسی + عدد) وزن بیشتری دارند
function isModelToken(token) {
  return /[a-z]/i.test(token) && token.length >= 2;
}

function similarity(titleA, titleB) {
  const ta = tokenize(titleA);
  const tb = tokenize(titleB);
  const baseSim = jaccard(ta, tb);

  const modelA = ta.filter(isModelToken);
  const modelB = tb.filter(isModelToken);

  // اگر هر دو مدل دارند، وزن بیشتری به تطبیق مدل بده
  if (modelA.length && modelB.length) {
    const modelSim = jaccard(modelA, modelB);
    return 0.4 * baseSim + 0.6 * modelSim;
  }
  return baseSim;
}

// ---------------------------------------------------------------
// ۳. خوشه‌بندی محصولات مشابه
// ---------------------------------------------------------------
function clusterProducts(products, threshold = 0.55) {
  const clusters = [];

  for (const product of products) {
    let bestCluster = null;
    let bestSim = 0;

    for (const cluster of clusters) {
      const sim = similarity(
        product.productTitle,
        cluster.representative.productTitle
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

// ---------------------------------------------------------------
// ۴. جستجو در دیجی‌کالا
// ---------------------------------------------------------------
async function searchDigikala(query, limit = 20) {
  try {
    const response = await axios.get('https://api.digikala.com/v1/search/', {
      params: { q: query, page: 1 },
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/json',
      },
      timeout: 15000,
    });

    const products = response.data?.data?.products || [];
    return products.slice(0, limit).map((p) => ({
      storeName: 'دیجی‌کالا',
      productTitle: p.title_fa || '—',
      price: parseInt(
        String(p.default_variant?.price?.selling_price || '0').replace(
          /[^\d]/g,
          ''
        ),
        10
      ) / 10,
      link: `https://www.digikala.com/product/dkp-${p.id}/`,
    }));
  } catch (error) {
    console.warn(`⚠️ خطا در جستجوی دیجی‌کالا:`, error.message);
    return [];
  }
}

// ---------------------------------------------------------------
// ۵. جستجو در ترب
// ---------------------------------------------------------------
async function searchTorob(query, limit = 20) {
  try {
    const response = await axios.get(
      'https://api.torob.com/v4/base-product/search/',
      {
        params: { q: query, source: 'next_desktop', page: 0, size: limit },
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8',
          Referer: 'https://torob.com/',
          Origin: 'https://torob.com',
        },
        timeout: 15000,
      }
    );

    const products = response.data?.results || [];
    return products.slice(0, limit).map((p) => ({
      storeName: 'ترب',
      productTitle: p.name1 || p.name || '—',
        price: parseInt(String(p.price || '0').replace(/[^\d]/g, ''), 10), // ✅ بدون تقسیم
      link: `https://torob.com/p/${p.random_key || p.id}/`,
    }));
  } catch (error) {
    console.warn(`⚠️ خطا در جستجوی ترب:`, error.message);
    return [];
  }
}

// ---------------------------------------------------------------
// ۶. تابع اصلی مقایسه سبد خرید
// ---------------------------------------------------------------
async function compareBasket(shoppingList) {
  const queries = [];

  for (const query of shoppingList) {
    const [digikalaResults, torobResults] = await Promise.all([
      searchDigikala(query, 20),
      searchTorob(query, 20),
    ]);

    const allProducts = [...digikalaResults, ...torobResults];
    const clusters = clusterProducts(allProducts);

    // برای هر خوشه، بهترین قیمت هر فروشگاه را استخراج کن
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
          (a, b) => a.price - b.price
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
      // اولویت: تعداد فروشگاه بیشتر (اطمینان از تطبیق) → صرفه‌جویی بیشتر
      .sort((a, b) => {
        if (b.storeCount !== a.storeCount)
          return b.storeCount - a.storeCount;
        return b.savings - a.savings;
      })
      .slice(0, 10);

    queries.push({ query, matches });

    await new Promise((r) => setTimeout(r, 800));
  }

  // محاسبه بهترین سبد "همه از یک فروشگاه"
  const storeTotals = {};
  for (const { matches } of queries) {
    for (const match of matches) {
      for (const offer of match.offers) {
        const store = offer.storeName;
        if (!storeTotals[store]) {
          storeTotals[store] = { store, total: 0, itemCount: 0 };
        }
        // برای هر query، فقط بهترین قیمت آن فروشگاه را حساب کن
        // (این کار جلوگیری می‌کند از دوباره‌شماری)
      }
    }
  }

  // بازنویسی: برای هر query، ارزان‌ترین فروشگاه را پیدا کن
  for (const { matches } of queries) {
    if (matches.length === 0) continue;
    for (const match of matches) {
      for (const offer of match.offers) {
        const store = offer.storeName;
        if (!storeTotals[store]) {
          storeTotals[store] = { store, total: 0, itemCount: 0 };
        }
      }
    }
  }

  // سبد "همه از یک فروشگاه": برای هر query، ارزان‌ترین محصول را از آن فروشگاه بردار
  const basketComparison = Object.keys(storeTotals)
    .map((storeName) => {
      let total = 0;
      let itemCount = 0;
      const missing = [];
      const pickedItems = [];

      for (const { query, matches } of queries) {
        let cheapestForStore = null;
        for (const match of matches) {
          const offer = match.offers.find((o) => o.storeName === storeName);
          if (offer && (!cheapestForStore || offer.price < cheapestForStore.price)) {
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

      return {
        storeName,
        total,
        itemCount,
        missing,
        items: pickedItems,
      };
    })
    .filter((b) => b.itemCount > 0)
    .sort((a, b) => {
      // اولویت: پوشش بیشتر، سپس قیمت کمتر
      if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount;
      return a.total - b.total;
    });

  return { queries, basketComparison };
}

module.exports = { compareBasket };