// smart-shopping.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// ---------------------------------------------------------------
// ۱. تعریف فروشگاه‌ها و سلکتورهای CSS مربوط به هر سایت
// ---------------------------------------------------------------
const STORES = [
  {
    name: 'دیجی‌کالا',
    searchUrl: (query) =>
      `https://www.digikala.com/search/?q=${encodeURIComponent(query)}`,
    selectors: {
      productItem: 'article[data-product-id]',
      title: 'h3',
      price: 'span[data-testid="price-final"]',
      // در صورت نیاز، سلکتور موجودی را اضافه کنید
    },
    baseUrl: 'https://www.digikala.com',
  },
  {
    name: 'ترب',
    searchUrl: (query) =>
      `https://torob.com/search/?query=${encodeURIComponent(query)}`,
    selectors: {
      productItem: 'div[class*="product-card"]',
      title: 'h2',
      price: 'div[class*="price"]',
    },
    baseUrl: 'https://torob.com',
  },
  {
    name: 'باسلام',
    searchUrl: (query) =>
      `https://basalam.com/search?q=${encodeURIComponent(query)}`,
    selectors: {
      productItem: 'div[class*="product-card"]',
      title: 'h3',
      price: 'span[class*="price"]',
    },
    baseUrl: 'https://basalam.com',
  },
  // می‌توانید فروشگاه‌های بیشتری مانند «ایمالز»، «اسنپ‌شاپ» و ... اضافه کنید
];

// ---------------------------------------------------------------
// ۲. تابع استخراج قیمت از یک فروشگاه برای یک محصول خاص
// ---------------------------------------------------------------
async function searchProductInStore(browser, store, query) {
  const page = await browser.newPage();
  try {
    // تنظیم User-Agent برای شبیه‌سازی مرورگر واقعی
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.goto(store.searchUrl(query), {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // منتظر می‌مانیم تا عناصر محصول بارگذاری شوند
    await page.waitForSelector(store.selectors.productItem, { timeout: 10000 });

    // استخراج اطلاعات اولین محصول (یا می‌توانید همه را استخراج کنید)
    const product = await page.evaluate((sel) => {
      const item = document.querySelector(sel.productItem);
      if (!item) return null;

      const titleEl = item.querySelector(sel.title);
      const priceEl = item.querySelector(sel.price);

      return {
        title: titleEl ? titleEl.innerText.trim() : '—',
        priceText: priceEl ? priceEl.innerText.trim() : null,
      };
    }, store.selectors);

    if (!product || !product.priceText) return null;

    // تبدیل متن قیمت به عدد (حذف کاراکترهای غیرعددی)
    const numericPrice = parseInt(
      product.priceText.replace(/[^\d]/g, ''),
      10
    );
    if (isNaN(numericPrice) || numericPrice === 0) return null;

    // ساخت لینک محصول (اختیاری)
    const productLink = `${store.baseUrl}`; // در صورت نیاز مسیر دقیق محصول را استخراج کنید

    return {
      storeName: store.name,
      productTitle: product.title,
      price: numericPrice,
      link: productLink,
    };
  } catch (error) {
    console.warn(`⚠️ خطا در جستجوی «${query}» در ${store.name}:`, error.message);
    return null;
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------
// ۳. تابع اصلی مقایسه سبد خرید
// ---------------------------------------------------------------
async function compareBasket(shoppingList) {
  console.log('🛒 شروع جستجوی سبد خرید...\n');

  const browser = await puppeteer.launch({
    headless: 'new', // حالت Headless جدید
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // ساختار نتایج: { storeName: { items: [], total: 0, missing: [] } }
  const results = {};

  for (const store of STORES) {
    results[store.name] = { items: [], total: 0, missing: [] };
  }

  // جستجوی موازی برای هر آیتم در تمام فروشگاه‌ها
  for (const item of shoppingList) {
    console.log(`🔍 جستجوی: «${item}»`);

    const searchPromises = STORES.map((store) =>
      searchProductInStore(browser, store, item)
    );
    const foundResults = await Promise.all(searchPromises);

    foundResults.forEach((res) => {
      if (res) {
        results[res.storeName].items.push({
          query: item,
          title: res.productTitle,
          price: res.price,
          link: res.link,
        });
        results[res.storeName].total += res.price;
      } else {
        // فروشگاهی که محصول را ندارد
        const storeName = STORES.find(
          (s) => !results[s.name].items.some((i) => i.query === item)
        )?.name;
        if (storeName) {
          results[storeName].missing.push(item);
        }
      }
    });

    // کمی تأخیر برای جلوگیری از بلاک شدن
    await new Promise((r) => setTimeout(r, 1000));
  }

  await browser.close();

  // ---------------------------------------------------------------
  // ۴. مرتب‌سازی فروشگاه‌ها بر اساس مجموع قیمت
  // ---------------------------------------------------------------
  const sortedStores = Object.entries(results)
    .filter(([_, data]) => data.items.length > 0) // فقط فروشگاه‌هایی که حداقل یک کالا دارند
    .sort((a, b) => a[1].total - b[1].total);

  // ---------------------------------------------------------------
  // ۵. نمایش نتایج
  // ---------------------------------------------------------------
  console.log('\n══════════════════════════════════════════');
  console.log('          📊 نتیجه مقایسه سبد خرید');
  console.log('══════════════════════════════════════════\n');

  if (sortedStores.length === 0) {
    console.log('❌ هیچ محصولی در فروشگاه‌های پشتیبانی‌شده یافت نشد.');
    return;
  }

  sortedStores.forEach(([storeName, data], index) => {
    const rank = index + 1;
    console.log(`🏪 ${rank}. ${storeName}`);
    console.log(`   💰 مجموع سبد: ${data.total.toLocaleString('fa-IR')} تومان`);

    if (data.items.length > 0) {
      console.log('   📦 اقلام موجود:');
      data.items.forEach((item) => {
        console.log(
          `      • ${item.query} → «${item.title}» (${item.price.toLocaleString(
            'fa-IR'
          )} تومان)`
        );
      });
    }

    if (data.missing.length > 0) {
      console.log(`   ❌ ناموجود: ${data.missing.join('، ')}`);
    }
    console.log('');
  });

  // نمایش بهترین گزینه
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
// ۶. اجرای برنامه
// ---------------------------------------------------------------
const myShoppingList = ['گوشی سامسونگ', 'هدفون بی‌سیم', 'ماوس لاجیتک'];
compareBasket(myShoppingList);
