// smart-shopping.js
const axios = require('axios');
const cheerio = require('cheerio');

// ---------------------------------------------------------------
// ۱. تنظیمات فروشگاه‌ها (فقط API - بدون Puppeteer)
// ---------------------------------------------------------------
const STORES = [
  {
    name: 'دیجی‌کالا',
    type: 'api',
    searchUrl: 'https://api.digikala.com/v1/search/',
  },
  {
    name: 'ترب',
    type: 'api',
    searchUrl: 'https://api.torob.com/v4/base-product/search/',
  },
  {
    name: 'باسلام',
    type: 'api',
    searchUrl: 'https://developers.basalam.com/api/v1/products/search',
    accessToken: process.env.BASALAM_TOKEN || '', // توکن OAuth2 باسلام
  },
];

// ---------------------------------------------------------------
// ۲. تابع کمکی برای استخراج قیمت عددی از متن
// ---------------------------------------------------------------
function parsePrice(priceText) {
  if (!priceText) return 0;
  const cleaned = priceText.toString().replace(/[^\d]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

// ---------------------------------------------------------------
// ۳. جستجو در دیجی‌کالا با API
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
      productTitle: p.title_fa || p.title_en || '—',
      price: parsePrice(p.default_variant?.price?.selling_price) / 10, // ریال به تومان
      link: `https://www.digikala.com/product/dkp-${p.id}/`,
    }));
  } catch (error) {
    console.warn(`⚠️ خطا در جستجوی دیجی‌کالا:`, error.message);
    return [];
  }
}

// ---------------------------------------------------------------
// ۴. جستجو در ترب با API
// ---------------------------------------------------------------
async function searchTorob(query) {
  try {
    const response = await axios.get(
      'https://api.torob.com/v4/base-product/search/',
      {
        params: { q: query, source: 'next_desktop' },
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
        timeout: 15000,
      }
    );

    const products = response.data?.results || [];
    return products.slice(0, 5).map((p) => ({
      storeName: 'ترب',
      productTitle: p.name1 || p.name || '—',
      price: parsePrice(p.price) / 10, // ریال به تومان (در صورت نیاز)
      link: `https://torob.com/p/${p.random_key || p.id}/`,
    }));
  } catch (error) {
    console.warn(`⚠️ خطا در جستجوی ترب:`, error.message);
    return [];
  }
}

// ---------------------------------------------------------------
// ۵. جستجو در باسلام با API
// ---------------------------------------------------------------
async function searchBasalam(query) {
  const token = process.env.BASALAM_TOKEN;
  if (!token) {
    console.warn('⚠️ توکن باسلام تنظیم نشده است. از جستجوی باسلام صرف‌نظر می‌شود.');
    return [];
  }

  try {
    const response = await axios.get(
      'https://developers.basalam.com/api/v1/products/search',
      {
        params: { q: query, page: 1 },
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'Mozilla/5.0',
          Accept: 'application/json',
        },
        timeout: 15000,
      }
    );

    const products = response.data?.data || [];
    return products.slice(0, 5).map((p) => ({
      storeName: 'باسلام',
      productTitle: p.name || '—',
      price: parsePrice(p.price) / 10, // ریال به تومان
      link: `https://basalam.com/product/${p.id}`,
    }));
  } catch (error) {
    console.warn(`⚠️ خطا در جستجوی باسلام:`, error.message);
    return [];
  }
}

// ---------------------------------------------------------------
// ۶. تابع اصلی مقایسه سبد خرید
// ---------------------------------------------------------------
async function compareBasket(shoppingList) {
  console.log('🛒 شروع جستجوی سبد خرید...\n');

  // ساختار نتایج
  const results = {
    'دیجی‌کالا': { items: [], total: 0, missing: [] },
    'ترب': { items: [], total: 0, missing: [] },
    'باسلام': { items: [], total: 0, missing: [] },
  };

  for (const item of shoppingList) {
    console.log(`🔍 جستجوی: «${item}»`);

    // جستجوی همزمان در تمام فروشگاه‌ها
    const [digikalaResults, torobResults, basalamResults] = await Promise.all([
      searchDigikala(item),
      searchTorob(item),
      searchBasalam(item),
    ]);

    // پردازش نتایج دیجی‌کالا
    if (digikalaResults.length > 0) {
      const best = digikalaResults[0];
      results['دیجی‌کالا'].items.push({
        query: item,
        title: best.productTitle,
        price: best.price,
        link: best.link,
      });
      results['دیجی‌کالا'].total += best.price;
    } else {
      results['دیجی‌کالا'].missing.push(item);
    }

    // پردازش نتایج ترب
    if (torobResults.length > 0) {
      const best = torobResults[0];
      results['ترب'].items.push({
        query: item,
        title: best.productTitle,
        price: best.price,
        link: best.link,
      });
      results['ترب'].total += best.price;
    } else {
      results['ترب'].missing.push(item);
    }

    // پردازش نتایج باسلام
    if (basalamResults.length > 0) {
      const best = basalamResults[0];
      results['باسلام'].items.push({
        query: item,
        title: best.productTitle,
        price: best.price,
        link: best.link,
      });
      results['باسلام'].total += best.price;
    } else {
      results['باسلام'].missing.push(item);
    }

    // تأخیر کوتاه بین جستجوها برای جلوگیری از بلاک شدن
    await new Promise((r) => setTimeout(r, 800));
  }

  // ---------------------------------------------------------------
  // ۷. مرتب‌سازی و نمایش نتایج
  // ---------------------------------------------------------------
  const sortedStores = Object.entries(results)
    .filter(([_, data]) => data.items.length > 0)
    .sort((a, b) => a[1].total - b[1].total);

  console.log('\n══════════════════════════════════════════');
  console.log('          📊 نتیجه مقایسه سبد خرید');
  console.log('══════════════════════════════════════════\n');

  if (sortedStores.length === 0) {
    console.log('❌ هیچ محصولی در فروشگاه‌های پشتیبانی‌شده یافت نشد.');
    console.log('💡 نکته: برای باسلام باید متغیر محیطی BASALAM_TOKEN را تنظیم کنید.');
    return;
  }

  sortedStores.forEach(([storeName, data], index) => {
    const rank = index + 1;
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏪';
    console.log(`${medal} ${rank}. ${storeName}`);
    console.log(
      `   💰 مجموع سبد: ${data.total.toLocaleString('fa-IR')} تومان`
    );

    if (data.items.length > 0) {
      console.log('   📦 اقلام موجود:');
      data.items.forEach((item) => {
        console.log(
          `      • ${item.query} → «${item.title}» (${item.price.toLocaleString(
            'fa-IR'
          )} تومان)`
        );
        console.log(`        🔗 ${item.link}`);
      });
    }

    if (data.missing.length > 0) {
      console.log(`   ❌ ناموجود: ${data.missing.join('، ')}`);
    }
    console.log('');
  });

  const best = sortedStores[0];
  console.log('══════════════════════════════════════════');
  console.log(
    `✅ ارزان‌ترین سبد خرید: ${best[0]} با مجموع ${best[1].total.toLocaleString(
      'fa-IR'
    )} تومان`
  );
  console.log('══════════════════════════════════════════');
}

// ---------------------------------------------------------------
// ۸. اجرای برنامه
// ---------------------------------------------------------------
const myShoppingList = ['گوشی سامسونگ', 'هدفون بی‌سیم', 'ماوس لاجیتک'];
compareBasket(myShoppingList).catch((err) => {
  console.error('❌ خطای کلی در اجرای برنامه:', err);
});