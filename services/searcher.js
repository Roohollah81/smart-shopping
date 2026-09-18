
const axios = require('axios');

// ---------------------------------------------------------------
// تابع کمکی برای استخراج قیمت عددی
// ---------------------------------------------------------------
function parsePrice(priceText) {
  if (!priceText) return 0;
  const cleaned = priceText.toString().replace(/[^\d]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

// ---------------------------------------------------------------
// جستجو در دیجی‌کالا
// ---------------------------------------------------------------
async function searchDigikala(query) {
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
    return products.slice(0, 5).map((p) => ({
      storeName: 'دیجی‌کالا',
      productTitle: p.title_fa || '—',
      price: parsePrice(p.default_variant?.price?.selling_price) / 10,
      link: `https://www.digikala.com/product/dkp-${p.id}/`,
    }));
  } catch (error) {
    console.warn(`⚠️ خطا در جستجوی دیجی‌کالا:`, error.message);
    return [];
  }
}

// ---------------------------------------------------------------
// جستجو در ترب
// ---------------------------------------------------------------
async function searchTorob(query) {
  try {
    const response = await axios.get(
      'https://api.torob.com/v4/base-product/search/',
      {
        params: { q: query, source: 'next_desktop', page: 0, size: 24 },
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
    return products.slice(0, 5).map((p) => ({
      storeName: 'ترب',
      productTitle: p.name1 || p.name || '—',
      price: parsePrice(p.price) / 10,
      link: `https://torob.com/p/${p.random_key || p.id}/`,
    }));
  } catch (error) {
    console.warn(`⚠️ خطا در جستجوی ترب:`, error.message);
    return [];
  }
}

// ---------------------------------------------------------------
// تابع اصلی مقایسه سبد خرید
// ---------------------------------------------------------------
async function compareBasket(shoppingList) {
  const results = {
    'دیجی‌کالا': { items: [], total: 0, missing: [] },
    'ترب': { items: [], total: 0, missing: [] },
  };

  for (const item of shoppingList) {
    const [digikalaResults, torobResults] = await Promise.all([
      searchDigikala(item),
      searchTorob(item),
    ]);

    const searchResults = [
      { store: 'دیجی‌کالا', results: digikalaResults },
      { store: 'ترب', results: torobResults },
    ];

    for (const { store, results: found } of searchResults) {
      if (found.length > 0) {
        const best = found[0];
        results[store].items.push({
          query: item,
          title: best.productTitle,
          price: best.price,
          link: best.link,
        });
        results[store].total += best.price;
      } else {
        results[store].missing.push(item);
      }
    }

    await new Promise((r) => setTimeout(r, 800));
  }

  const sortedStores = Object.entries(results)
    .filter(([_, data]) => data.items.length > 0)
    .sort((a, b) => a[1].total - b[1].total)
    .map(([storeName, data], index) => ({
      storeName,
      rank: index + 1,
      total: data.total,
      items: data.items,
      missing: data.missing,
      coverage: `${data.items.length}/${shoppingList.length}`,
    }));

  return {
    stores: sortedStores,
    shoppingList,
    cheapest: sortedStores[0] || null,
  };
}

module.exports = { compareBasket };