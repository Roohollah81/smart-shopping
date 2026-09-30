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
// API: نرخ دلار
// ================================================================
app.get("/api/dollar", async (req, res) => {
  const sources = [
    async () => {
      const r = await axios.get("https://api.bitpin.ir/v1/mkt/markets/", {
        timeout: 5000,
      });
      const usdt = (r.data?.results || []).find((m) =>
        /USDT_IRT|USDTIRT/i.test(m.code || ""),
      );
      const p = parseFloat(usdt?.price);
      if (!p || p < 50000) throw new Error("bad");
      return Math.round(p);
    },
    async () => {
      const r = await axios.get("https://api.nobitex.ir/v2/orderbook/USDTIRT", {
        timeout: 5000,
      });
      const p = parseFloat(r.data?.lastTradePrice);
      if (!p || p < 500000) throw new Error("bad");
      return Math.round(p / 10);
    },
  ];
  for (const s of sources) {
    try {
      return res.json({ success: true, price: await s() });
    } catch {}
  }
  res.status(502).json({ success: false });
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

    // چک کن توی پوشه‌ی thumb هست یا نه
    const isThumbPath = (url) => {
      const low = url.toLowerCase();
      return (
        /\/(thumb|thumbs|thumbnail|thumbnails|small|mini|preview)\//i.test(
          low,
        ) || /_\d+\.(jpg|jpeg|png|webp|gif)$/i.test(low) // _60, _150, _300
      );
    };

    const mainUrls = [];
    const thumbUrls = [];
    const seenMain = new Set();
    const seenThumb = new Set();

    const push = (u) => {
      const n = normalize(u);
      if (!n || isBadImage(n)) return;

      if (isThumbPath(n)) {
        if (!seenThumb.has(n)) {
          seenThumb.add(n);
          thumbUrls.push(n);
        }
      } else {
        if (!seenMain.has(n)) {
          seenMain.add(n);
          mainUrls.push(n);
        }
      }
    };

    const EXCLUDE_CLOSEST =
      ".related, .upsells, .cross-sells, .crosssell, " +
      '[class*="related"], [class*="similar"], [class*="upsell"], ' +
      '[class*="cross-sell"], [class*="crosssell"], [class*="recommend"], ' +
      '[class*="suggest"], [class*="you-may"], [class*="also-like"], ' +
      ".category-products, .products-grid, .product-grid, " +
      ".archive-products, .shop-products, .product-list, " +
      ".widget-products, .sidebar-products, .footer-products";

    // 1) همه‌ی img های صفحه
    $("img").each((i, el) => {
      const $el = $(el);
      if ($el.closest(EXCLUDE_CLOSEST).length > 0) return;
      if (
        $el.closest("header, footer, nav, .sidebar, .menu, #header, #footer")
          .length > 0
      )
        return;

      [
        "data-large_image",
        "data-large-image",
        "data-full-src",
        "data-original",
        "data-src",
        "data-lazy-src",
        "data-zoom-image",
        "src",
      ].forEach((k) => push($el.attr(k)));

      const srcset = $el.attr("srcset") || $el.attr("data-srcset") || "";
      if (srcset) {
        const parts = srcset
          .split(",")
          .map((p) => p.trim().split(/\s+/)[0])
          .filter(Boolean);
        if (parts.length) push(parts[parts.length - 1]);
      }
    });

    // 2) لینک‌های مستقیم به عکس
    $(
      'a[href$=".jpg"], a[href$=".jpeg"], a[href$=".png"], a[href$=".webp"]',
    ).each((i, el) => {
      const $el = $(el);
      if ($el.closest(EXCLUDE_CLOSEST).length > 0) return;
      if ($el.closest("header, footer, nav, .sidebar, .menu").length > 0)
        return;
      push($el.attr("href"));
    });

    // ← ← ← کلید کار: اگه عکس اصلی داریم، فقط همون‌ها رو برگردون ← ← ←
    if (mainUrls.length >= 1) {
      return mainUrls.slice(0, 20);
    }

    // اگه فقط thumb داشتیم، همونا رو برگردون
    if (thumbUrls.length > 0) {
      return thumbUrls.slice(0, 20);
    }

    // 3) og:image + JSON-LD (fallback نهایی)
    const finalUrls = [];
    const finalSeen = new Set();
    const pushFinal = (u) => {
      const n = normalize(u);
      if (!n || isBadImage(n) || finalSeen.has(n)) return;
      finalSeen.add(n);
      finalUrls.push(n);
    };

    pushFinal($('meta[property="og:image"]').attr("content"));

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
              if (Array.isArray(obj.image)) obj.image.forEach(pushFinal);
              else pushFinal(obj.image);
            }
          }
          Object.values(obj).forEach(walk);
        };
        walk(data);
      } catch {}
    });

    return finalUrls.slice(0, 20);
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
