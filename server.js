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
    return res
      .status(400)
      .json({ success: false, error: "لیست خرید نمی‌تواند خالی باشد." });
  }
  if (items.length > 10) {
    return res.status(400).json({
      success: false,
      error: "حداکثر ۱۰ آیتم در هر جستجو پشتیبانی می‌شود.",
    });
  }

  try {
    const result = await compareBasket(items);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("خطا در مقایسه سبد:", error);
    res.status(500).json({ success: false, error: "خطایی در سرور رخ داد." });
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
// API: گالری عکس محصول
// ================================================================
app.get("/api/product-images", async (req, res) => {
  const productId = String(req.query.id || "").trim();
  const productUrl = String(req.query.url || "").trim();
  const store = String(req.query.store || "").trim();

  if (!productId && !productUrl) {
    return res.status(400).json({ success: false, error: "invalid params" });
  }

  // ---------- ترب: بلاک شده، نادیده بگیر (از عکس جستجو استفاده کن) ----------
  if (store.includes("ترب")) {
    return res.json({ success: true, images: [] });
  }

  // ---------- مجد مارکت: Puppeteer بدون Chrome کار نمی‌کنه، نادیده بگیر ----------
  if (store.includes("مجد")) {
    return res.json({ success: true, images: [] });
  }

  // ---------- دیجی‌کالا: از API ----------
  if (store.includes("دیجی") && productId) {
    try {
      const id = String(productId).replace(/[^\d]/g, "");
      if (!id) return res.json({ success: true, images: [] });

      const r = await axios.get(`https://api.digikala.com/v1/product/${id}/`, {
        timeout: 6000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          Referer: `https://www.digikala.com/product/dkp-${id}/`,
          Origin: "https://www.digikala.com",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-site",
          "x-web-client": "desktop",
          "x-web-version": "1.0.0",
        },
        validateStatus: () => true,
      });

      // اگه v1 جواب نداد، v2 رو امتحان کن
      let data = r.data;
      if (r.status !== 200) {
        try {
          const r2 = await axios.get(
            `https://api.digikala.com/v2/product/${id}/`,
            {
              timeout: 6000,
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                Accept: "application/json",
                Referer: `https://www.digikala.com/product/dkp-${id}/`,
              },
              validateStatus: () => true,
            },
          );
          if (r2.status === 200) data = r2.data;
        } catch {}
      }

      const imgs = data?.data?.product?.images || [];
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
      console.log(`[gallery] دیجی‌کالا → ${urls.length} images`);
      return res.json({ success: true, images: urls });
    } catch (e) {
      console.error(`[gallery] دیجی‌کالا → خطا:`, e.message);
      return res.json({ success: true, images: [] });
    }
  }

  // ---------- فروشگاه‌های دیگر: اسکرپ HTML ----------
  if (productUrl) {
    try {
      const r = await axios.get(productUrl, {
        timeout: 6000,
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
      });

      if (r.status !== 200 || typeof r.data !== "string") {
        console.log(`[gallery] ${store} → HTTP ${r.status}`);
        return res.json({ success: true, images: [] });
      }

      const $ = cheerio.load(r.data);
      const urls = [];
      const seen = new Set();

      const normalize = (u) => {
        if (!u || typeof u !== "string") return null;
        if (u.startsWith("data:")) return null;
        if (!u.startsWith("http")) {
          try {
            u = new URL(u, productUrl).href;
          } catch {
            return null;
          }
        }
        u = u.split("?")[0];
        u = u.replace(/-\d+x\d+(?=\.(jpg|jpeg|png|webp|gif))/i, "");
        return u;
      };

      const add = (raw) => {
        const u = normalize(raw);
        if (u && !seen.has(u)) {
          seen.add(u);
          urls.push(u);
        }
      };

      $(
        ".woocommerce-product-gallery__image img, .woocommerce-product-gallery img",
      ).each((i, el) => {
        const $el = $(el);
        add($el.attr("data-large_image"));
        add($el.attr("data-large-image"));
        add($el.attr("data-full-src"));
        add($el.attr("data-original"));
        add($el.attr("data-src"));
        const srcset = $el.attr("srcset") || $el.attr("data-srcset") || "";
        if (srcset) {
          const big = srcset
            .split(",")
            .map((p) => p.trim().split(/\s+/)[0])
            .filter(Boolean)
            .pop();
          if (big) add(big);
        }
        add($el.attr("src"));
      });

      $(
        ".flex-control-thumbs img, .flex-control-nav img, .thumbnails img, .gallery-thumbnails img",
      ).each((i, el) => {
        const $el = $(el);
        add($el.attr("data-large_image"));
        add($el.attr("data-src"));
        add($el.attr("src"));
      });

      $(
        '.product-gallery img, .product-images img, .gallery-item img, [class*="product-gallery"] img, [class*="productGallery"] img',
      ).each((i, el) => {
        const $el = $(el);
        add($el.attr("data-large_image"));
        add($el.attr("data-original"));
        add($el.attr("data-src"));
        add($el.attr("src"));
      });

      $('a[href$=".jpg"], a[href$=".jpeg"], a[href$=".png"], a[href$=".webp"]')
        .slice(0, 20)
        .each((i, el) => {
          const href = $(el).attr("href");
          if (
            href &&
            !href.includes("icon") &&
            !href.includes("logo") &&
            !href.includes("banner")
          ) {
            add(href);
          }
        });

      add($('meta[property="og:image"]').attr("content"));

      $('script[type="application/ld+json"]').each((i, el) => {
        try {
          const data = JSON.parse($(el).html() || "{}");
          const walk = (obj) => {
            if (!obj || typeof obj === "string") return;
            if (Array.isArray(obj)) {
              obj.forEach(walk);
              return;
            }
            if (obj.image) {
              if (Array.isArray(obj.image)) obj.image.forEach(add);
              else add(obj.image);
            }
            Object.values(obj).forEach(walk);
          };
          walk(data);
        } catch {}
      });

      console.log(`[gallery] ${store} → ${urls.length} images`);
      return res.json({ success: true, images: urls.slice(0, 20) });
    } catch (e) {
      console.error(`[gallery] ${store} → خطا:`, e.message);
      return res.json({ success: true, images: [] });
    }
  }

  res.json({ success: true, images: [] });
});

// ================================================================
// START
// ================================================================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 سرور روی پورت ${PORT} در حال اجراست`);
});
