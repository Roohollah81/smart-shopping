const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const { compareBasket } = require("./services/searcher");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ================================================================
// API: مقایسه سبد خرید
// ================================================================
app.post("/api/compare", async (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: "لیست خرید نمی‌تواند خالی باشد.",
    });
  }
  if (items.length > 10) {
    return res.status(400).json({
      success: false,
      error: "حداکثر ۱۰ آیتم در هر جستجو پشتیبانی می‌شود.",
    });
  }

  try {
    const result = await compareBasket(items);

    // ============================================================
    // جمع‌آوری همه‌ی محصولات از نتایج
    // ============================================================
    const allProducts = [];
    const seen = new Set();
    for (const q of result.queries || []) {
      for (const match of q.matches || []) {
        for (const offer of match.offers || []) {
          const key = `${offer.productId || ""}|${offer.link || ""}`;
          if (seen.has(key)) continue;
          seen.add(key);
          allProducts.push({
            id: offer.productId || "",
            url: offer.link || "",
            store: offer.storeName || "",
            key,
          });
        }
      }
    }

    console.log(
      `[compare] fetching ${allProducts.length} product galleries in parallel...`,
    );

    // ============================================================
    // fetch موازی گالری همه‌ی محصولات
    // ============================================================
    const galleryMap = {};
    await Promise.all(
      allProducts.map(async (p) => {
        try {
          const images = await getProductGalleryInternal(p.id, p.url, p.store);
          galleryMap[p.key] = images;
        } catch {
          galleryMap[p.key] = [];
        }
      }),
    );

    const totalImages = Object.values(galleryMap).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );
    console.log(
      `[compare] got ${totalImages} total images for ${allProducts.length} products`,
    );

    result.galleryMap = galleryMap;
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("خطا در مقایسه سبد:", error);
    res.status(500).json({
      success: false,
      error: "خطایی در سرور رخ داد. لطفاً دوباره تلاش کنید.",
    });
  }
});

// ================================================================
// API: حالت Debug — همه‌ی rejected items
// ================================================================
app.post("/api/compare-debug", async (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: "empty" });
  }

  try {
    const result = await compareBasket(items);

    // جمع‌آوری همه‌ی rejected از همه‌ی queryها
    const allRejected = [];
    for (const q of result.queries || []) {
      for (const r of q.rejectedProducts || []) {
        allRejected.push({
          query: q.query,
          ...r,
        });
      }
    }

    // جمع‌آوری همه‌ی accepted
    const allAccepted = [];
    for (const q of result.queries || []) {
      for (const match of q.matches || []) {
        for (const offer of match.offers || []) {
          allAccepted.push({
            query: q.query,
            storeName: offer.storeName,
            title: offer.productTitle,
            price: offer.price,
          });
        }
      }
    }

    res.json({
      success: true,
      queries: (result.queries || []).map((q) => q.query),
      accepted: allAccepted,
      rejected: allRejected,
    });
  } catch (e) {
    console.error("debug compare error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ================================================================
// API: نرخ دلار (نرخ بازار آزاد از Bitpin Academy)
// ================================================================
app.get('/api/dollar', async (req, res) => {
  try {
    const r = await axios.get('https://bitpin.ir/academy/live/currency/', {
      timeout: 8000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8',
      },
      validateStatus: () => true,
    });

    if (r.status !== 200 || typeof r.data !== 'string') {
      throw new Error(`HTTP ${r.status}`);
    }

    const html = r.data;

    // استخراج نرخ دلار از بلوک data-price-symbol="USDIRT"
    // الگو: data-price-symbol="USDIRT" ... data-price-value>265,500</p>
    const match = html.match(
      /data-price-symbol="USDIRT"[\s\S]*?data-price-value[^>]*>\s*([\d,،٬۰-۹]+)\s*</,
    );

    if (!match || !match[1]) {
      throw new Error('dollar rate not found in HTML');
    }

    // تبدیل اعداد فارسی/عربی به انگلیسی و حذف جداکننده‌ها
    const normalized = match[1]
      .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[,،٬]/g, '');

    const price = parseInt(normalized, 10);

    if (!price || price < 50000 || price > 1000000) {
      throw new Error(`invalid price: ${price}`);
    }

    console.log(`[dollar] Bitpin Academy (USDIRT): ${price.toLocaleString()} تومان`);
    res.json({ success: true, price });
  } catch (e) {
    console.error('[dollar] خطا:', e.message);
    res.status(502).json({ success: false, error: e.message });
  }
});

// ================================================================
// HELPERS
// ================================================================

function fetchHtmlWithTimeout(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timeout")),
      timeoutMs + 500,
    );
    axios
      .get(url, {
        timeout: timeoutMs,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
        },
        validateStatus: () => true,
        maxRedirects: 5,
      })
      .then((r) => {
        clearTimeout(timer);
        if (r.status === 200 && typeof r.data === "string") resolve(r.data);
        else resolve(null);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

async function fetchHtmlWithRetry(url, timeoutsMs = [4000, 6000]) {
  for (let i = 0; i < timeoutsMs.length; i++) {
    try {
      const html = await fetchHtmlWithTimeout(url, timeoutsMs[i]);
      if (html && html.length > 500) return html;
    } catch (e) {
      if (i === timeoutsMs.length - 1) throw e;
    }
  }
  return null;
}

function normalizeImageUrl(u, baseUrl) {
  if (!u || typeof u !== "string") return null;
  if (u.startsWith("data:")) return null;
  if (!u.startsWith("http")) {
    try {
      u = new URL(u, baseUrl).href;
    } catch {
      return null;
    }
  }
  u = u.split("?")[0];
  u = u.replace(/-\d+x\d+(?=\.(jpg|jpeg|png|webp|gif))/i, "");
  return u;
}

function isBadImage(url) {
  const low = url.toLowerCase();
  const blacklist = [
    "icon",
    "logo",
    "banner",
    "avatar",
    "flag",
    "sprite",
    "placeholder",
    "loading",
    "spinner",
    "payment",
    "social",
    "footer",
    "header",
    "badge",
  ];
  return blacklist.some((w) => low.includes(w));
}

function extractFromNextData(html, baseUrl) {
  try {
    const match = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (!match) return [];

    const data = JSON.parse(match[1]);
    const urls = [];
    const seen = new Set();

    const add = (u) => {
      const n = normalizeImageUrl(u, baseUrl);
      if (n && !isBadImage(n) && !seen.has(n)) {
        seen.add(n);
        urls.push(n);
      }
    };

    const walk = (obj, depth = 0) => {
      if (depth > 25 || !obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        obj.forEach((x) => walk(x, depth + 1));
        return;
      }
      if (Array.isArray(obj.images)) {
        obj.images.forEach((img) => {
          if (typeof img === "string") add(img);
          else if (img && typeof img === "object") {
            ["url", "src", "path", "image_url", "imageUrl"].forEach((k) => {
              const v = img[k];
              if (typeof v === "string") add(v);
              else if (Array.isArray(v))
                v.forEach((x) => typeof x === "string" && add(x));
            });
          }
        });
      }
      ["gallery", "photos", "pictures", "media"].forEach((k) => {
        if (Array.isArray(obj[k])) {
          obj[k].forEach((item) => {
            if (typeof item === "string") add(item);
            else if (item && typeof item === "object") {
              ["url", "src", "path"].forEach((kk) => {
                if (typeof item[kk] === "string") add(item[kk]);
              });
            }
          });
        }
      });
      Object.values(obj).forEach((v) => walk(v, depth + 1));
    };

    walk(data);
    return urls.slice(0, 20);
  } catch {
    return [];
  }
}

function scrapeImagesFromHtml(html, baseUrl) {
  try {
    const $ = cheerio.load(html);

    const normalize = (u) => {
      if (!u || typeof u !== "string") return null;
      if (u.startsWith("data:")) return null;
      if (!u.startsWith("http")) {
        try {
          u = new URL(u, baseUrl).href;
        } catch {
          return null;
        }
      }
      u = u.split("?")[0];
      u = u.replace(/-\d+x\d+(?=\.(jpg|jpeg|png|webp|gif))/i, "");
      return u;
    };

    const isBadImage = (url) => {
      const low = url.toLowerCase();
      const blacklist = [
        "icon",
        "logo",
        "banner",
        "avatar",
        "flag",
        "sprite",
        "placeholder",
        "loading",
        "spinner",
        "payment",
        "social",
        "footer",
        "header",
        "badge",
      ];
      return blacklist.some((w) => low.includes(w));
    };

    const isThumbPath = (url) => {
      const low = url.toLowerCase();
      return (
        /\/(thumb|thumbs|thumbnail|thumbnails|small|mini|preview)\//i.test(
          low,
        ) || /_\d+\.(jpg|jpeg|png|webp|gif)$/i.test(low)
      );
    };

    const makePush = () => {
      const arr = [];
      const seen = new Set();
      return {
        arr,
        push(u) {
          const n = normalize(u);
          if (!n || isBadImage(n) || seen.has(n)) return;
          seen.add(n);
          arr.push(n);
        },
      };
    };

    // ============================================================
    // مرحله 1: گالری ووکامرس
    // ============================================================
    const wooMain = makePush();
    const wooThumb = makePush();

    const wooContainer = $(
      ".woocommerce-product-gallery, .woocommerce-product-gallery__wrapper",
    );

    if (wooContainer.length > 0) {
      wooContainer
        .find(
          'img, a[href$=".jpg"], a[href$=".jpeg"], a[href$=".png"], a[href$=".webp"]',
        )
        .each((i, el) => {
          const $el = $(el);
          if ($el.closest(".woocommerce-product-gallery__trigger").length > 0)
            return;

          const candidates = [];
          if ($el.is("img")) {
            [
              "data-large_image",
              "data-large-image",
              "data-full-src",
              "data-original",
              "data-src",
              "data-lazy-src",
              "data-zoom-image",
              "src",
            ].forEach((k) => candidates.push($el.attr(k)));
            const srcset = $el.attr("srcset") || $el.attr("data-srcset") || "";
            if (srcset) {
              const parts = srcset
                .split(",")
                .map((p) => p.trim().split(/\s+/)[0])
                .filter(Boolean);
              if (parts.length) candidates.push(parts[parts.length - 1]);
            }
          } else {
            candidates.push($el.attr("href"));
          }

          for (const c of candidates) {
            const n = normalize(c);
            if (!n || isBadImage(n)) continue;
            if (isThumbPath(n)) wooThumb.push(n);
            else wooMain.push(n);
          }
        });
    }

    // ← ← ← تغییر کلیدی: اگه گالری ووکامرس وجود داشت، همون رو برگردون (حتی با ۱ عکس) ← ← ←
    // چون وجود این کانتینر یعنی صفحه یه محصول ووکامرسه و عکس‌های اصلی همون‌جان
    if (wooContainer.length > 0 && wooMain.arr.length >= 1) {
      return wooMain.arr.slice(0, 20);
    }
    // اگه کانتینر وجود داشت ولی فقط thumb داشت، اون‌ها رو برگردون
    if (wooContainer.length > 0 && wooThumb.arr.length >= 1) {
      return wooThumb.arr.slice(0, 20);
    }

    // ============================================================
    // مرحله 2: اسکن عمومی صفحه با فیلتر سختگیرانه (مهستان، مجد، ...)
    // ============================================================
    const genericMain = makePush();
    const genericThumb = makePush();

    const EXCLUDE_CLOSEST =
      ".related, .upsells, .cross-sells, .crosssell, " +
      '[class*="related"], [class*="similar"], [class*="upsell"], ' +
      '[class*="cross-sell"], [class*="crosssell"], [class*="recommend"], ' +
      '[class*="suggest"], [class*="you-may"], [class*="also-like"], ' +
      ".category-products, .products-grid, .product-grid, " +
      ".archive-products, .shop-products, .product-list, " +
      ".widget-products, .sidebar-products, .footer-products, " +
      ".swiper-wrapper, .carousel-inner, .banner-slider, .hero-slider, " +
      ".slider, .carousel, .categories-menu, .menu-categories";

    $("img").each((i, el) => {
      const $el = $(el);
      if ($el.closest(EXCLUDE_CLOSEST).length > 0) return;
      if (
        $el.closest("header, footer, nav, .sidebar, .menu, #header, #footer")
          .length > 0
      )
        return;

      const candidates = [
        $el.attr("data-large_image"),
        $el.attr("data-large-image"),
        $el.attr("data-full-src"),
        $el.attr("data-original"),
        $el.attr("data-src"),
        $el.attr("data-lazy-src"),
        $el.attr("data-zoom-image"),
        $el.attr("src"),
      ];
      const srcset = $el.attr("srcset") || $el.attr("data-srcset") || "";
      if (srcset) {
        const parts = srcset
          .split(",")
          .map((p) => p.trim().split(/\s+/)[0])
          .filter(Boolean);
        if (parts.length) candidates.push(parts[parts.length - 1]);
      }

      for (const c of candidates) {
        const n = normalize(c);
        if (!n || isBadImage(n)) continue;
        if (isThumbPath(n)) genericThumb.push(n);
        else genericMain.push(n);
      }
    });

    // ============================================================
    // مرحله 3: انتخاب بهترین نتیجه
    // ============================================================
    // اولویت: main -> thumb -> og:image
    if (genericMain.arr.length >= 1) {
      return genericMain.arr.slice(0, 20);
    }
    if (genericThumb.arr.length >= 1) {
      return genericThumb.arr.slice(0, 20);
    }

    // ============================================================
    // مرحله 4: fallback نهایی (og:image + JSON-LD)
    // ============================================================
    const final = makePush();
    final.push($('meta[property="og:image"]').attr("content"));

    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const data = JSON.parse($(el).html() || "{}");
        const walk = (obj) => {
          if (!obj || typeof obj !== "object") return;
          if (Array.isArray(obj)) {
            obj.forEach(walk);
            return;
          }
          const type = obj["@type"];
          if (
            type === "Product" ||
            (Array.isArray(type) && type.includes("Product"))
          ) {
            if (obj.image) {
              if (Array.isArray(obj.image))
                obj.image.forEach((u) => final.push(u));
              else final.push(obj.image);
            }
          }
          Object.values(obj).forEach(walk);
        };
        walk(data);
      } catch {}
    });

    return final.arr.slice(0, 20);
  } catch (e) {
    return [];
  }
}
// ================================================================
// CORE: گرفتن گالری یک محصول (بدون res)
// ================================================================
async function getProductGalleryInternal(productId, productUrl, store) {
  productId = String(productId || "").trim();
  productUrl = String(productUrl || "").trim();
  store = String(store || "").trim();

  if (!productId && !productUrl) return [];
  if (store.includes("ترب")) return [];

  // تلاش اول: HTML
  if (productUrl) {
    try {
      const html = await fetchHtmlWithRetry(productUrl, [4000, 6000]);
      if (html) {
        const nextImages = extractFromNextData(html, productUrl);
        if (nextImages.length > 0) {
          return nextImages;
        }
        const scrapedImages = scrapeImagesFromHtml(html, productUrl);
        if (scrapedImages.length > 0) {
          return scrapedImages;
        }
      }
    } catch (e) {
      // بی‌صدا رد شو
    }
  }

  // تلاش دوم: API دیجی‌کالا
  if (store.includes("دیجی") && productId) {
    try {
      const id = String(productId).replace(/[^\d]/g, "");
      if (!id) return [];
      const r = await axios.get(`https://api.digikala.com/v1/product/${id}/`, {
        timeout: 6000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "application/json",
          Referer: `https://www.digikala.com/product/dkp-${id}/`,
        },
        validateStatus: () => true,
      });
      const imgs = r.data?.data?.product?.images || [];
      const urls = [];
      for (const img of imgs) {
        const raw = img?.url;
        const list = Array.isArray(raw) ? raw : [raw];
        for (const u of list) {
          if (typeof u === "string" && u.startsWith("http")) {
            const clean = u.split("?")[0];
            if (!urls.includes(clean)) urls.push(clean);
          }
        }
      }
      return urls;
    } catch {
      return [];
    }
  }

  return [];
}

// ================================================================
// API: گالری یک محصول
// ================================================================
app.get("/api/product-images", async (req, res) => {
  const productId = String(req.query.id || "").trim();
  const productUrl = String(req.query.url || "").trim();
  const store = String(req.query.store || "").trim();

  if (!productId && !productUrl) {
    return res.status(400).json({ success: false, error: "invalid params" });
  }

  try {
    const images = await getProductGalleryInternal(
      productId,
      productUrl,
      store,
    );
    if (images.length > 0) {
      console.log(`[gallery] ${store} → ${images.length} images`);
    } else {
      console.log(`[gallery] ${store} → 0 images`);
    }
    res.json({ success: true, images });
  } catch (e) {
    console.error(`[gallery] ${store} → error:`, e.message);
    res.json({ success: true, images: [] });
  }
});

// ================================================================
// API: گالری چند محصول (batch — موازی)
// ================================================================
app.post("/api/product-images-batch", async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    return res.status(400).json({ success: false, error: "empty" });
  }

  console.log(`[gallery] batch → ${items.length} items`);

  const results = await Promise.all(
    items.map(async (item) => {
      const { id, url, store } = item;
      const key = `${id || ""}|${url || ""}`;
      try {
        const images = await getProductGalleryInternal(id, url, store);
        return { key, images };
      } catch {
        return { key, images: [] };
      }
    }),
  );

  const map = {};
  let totalFound = 0;
  for (const r of results) {
    map[r.key] = r.images;
    totalFound += r.images.length;
  }
  console.log(`[gallery] batch → ${totalFound} total images`);

  res.json({ success: true, results: map });
});

// ================================================================
// START
// ================================================================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 سرور روی پورت ${PORT} در حال اجراست`);
});
