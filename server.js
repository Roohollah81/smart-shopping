require("dotenv/config");
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const cheerio = require("cheerio");
const mysql = require("mysql2/promise");
const geoip = require("geoip-lite");
const { compareBasket } = require("./services/searcher");
const { correctQuery, learnFromItems } = require("./services/corrections");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ─── هدرها برای نمایش در iframe ایتا (وب) ───
app.use((req, res, next) => {
  res.removeHeader("X-Frame-Options");
  res.removeHeader("Content-Security-Policy");
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://eitaa.com https://*.eitaa.com https://web.eitaa.com",
  );
  next();
});

app.use(express.static(path.join(__dirname, "public")));

// ================================================================
// 🗄️ DATABASE
// ================================================================
let db = null;

async function initDatabase() {
  try {
    db = await mysql.createPool({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
      charset: "utf8mb4",
    });

    await db.query(`
      CREATE TABLE IF NOT EXISTS search_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        timestamp DATETIME NOT NULL,
        ip VARCHAR(64),
        city VARCHAR(100),
        region VARCHAR(100),
        country VARCHAR(10),
        items TEXT,
        user_agent TEXT,
        INDEX idx_timestamp (timestamp),
        INDEX idx_city (city)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    const columnsToAdd = [
      { name: "total_results", type: "INT DEFAULT 0" },
      { name: "accepted_count", type: "INT DEFAULT 0" },
      { name: "rejected_count", type: "INT DEFAULT 0" },
      { name: "stores_with_results", type: "TEXT" },
      { name: "stores_without_results", type: "TEXT" },
      { name: "stores_status", type: "TEXT" },
      { name: "product_titles", type: "TEXT" },
      { name: "query_products", type: "TEXT" },
      { name: "duration_ms", type: "INT DEFAULT 0" },
      { name: "quality_score", type: "VARCHAR(20)" },
    ];

    for (const col of columnsToAdd) {
      try {
        const [cols] = await db.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'search_logs' AND COLUMN_NAME = ?`,
          [process.env.DB_NAME, col.name],
        );
        if (cols.length === 0) {
          await db.query(
            `ALTER TABLE search_logs ADD COLUMN ${col.name} ${col.type}`,
          );
          console.log(`[db] column added: ${col.name}`);
        }
      } catch (e) {
        console.error(`[db] column error (${col.name}):`, e.message);
      }
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS page_visits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        timestamp DATETIME NOT NULL,
        ip VARCHAR(64),
        city VARCHAR(100),
        region VARCHAR(100),
        country VARCHAR(10),
        user_agent TEXT,
        referrer VARCHAR(500),
        screen VARCHAR(20),
        language VARCHAR(20),
        INDEX idx_timestamp (timestamp),
        INDEX idx_ip (ip)
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);

    console.log("[db] ready");
  } catch (e) {
    console.error("[db] init failed:", e.message, "| code:", e.code);
    db = null;
  }
}

// ================================================================
// 📱 TELEGRAM
// ================================================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

async function sendTelegramNotification(logEntry) {
  if (process.env.DISABLE_TELEGRAM === "1") return;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    const location = logEntry.city
      ? `${logEntry.city}، ${logEntry.region || ""}`
      : "نامشخص";
    const message =
      `🔍 *سرچ جدید*\n\n` +
      `🕐 ${new Date(logEntry.timestamp).toLocaleString("fa-IR")}\n` +
      `📍 ${location}\n` +
      `🌐 IP: \`${logEntry.ip}\`\n` +
      `📦 ${logEntry.items.join("، ")}`;

    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      { chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "Markdown" },
      { timeout: 5000 },
    );
  } catch (e) {
    console.error("[telegram] error:", e.message);
  }
}

// ================================================================
// 🗺️ GEO
// ================================================================
const IRAN_REGIONS = {
  "00": "مرکزی",
  "01": "گیلان",
  "02": "مازندران",
  "03": "آذربایجان شرقی",
  "04": "آذربایجان غربی",
  "05": "کرمانشاه",
  "06": "خوزستان",
  "07": "فارس",
  "08": "کرمان",
  "09": "خراسان رضوی",
  10: "اصفهان",
  11: "سیستان و بلوچستان",
  12: "کردستان",
  13: "همدان",
  14: "چهارمحال و بختیاری",
  15: "لرستان",
  16: "ایلام",
  17: "کهگیلویه و بویراحمد",
  18: "بوشهر",
  19: "زنجان",
  20: "سمنان",
  21: "یزد",
  22: "هرمزگان",
  23: "تهران",
  24: "اردبیل",
  25: "قزوین",
  26: "قم",
  27: "گلستان",
  28: "خراسان شمالی",
  29: "خراسان جنوبی",
  30: "البرز",
};

const PERSIAN_CITIES = {
  tehran: "تهران",
  esfahan: "اصفهان",
  isfahan: "اصفهان",
  mashhad: "مشهد",
  shiraz: "شیراز",
  karaj: "کرج",
  tabriz: "تبریز",
  qom: "قم",
  ahvaz: "اهواز",
  kermanshah: "کرمانشاه",
  urmia: "ارومیه",
  rasht: "رشت",
  zahedan: "زاهدان",
  hamadan: "همدان",
  hamedan: "همدان",
  kerman: "کرمان",
  yazd: "یزد",
  ardabil: "اردبیل",
  "bandar abbas": "بندرعباس",
  bandarabbas: "بندرعباس",
  arak: "اراک",
  zanjan: "زنجان",
  sanandaj: "سنندج",
  qazvin: "قزوین",
  khorramabad: "خرم‌آباد",
  gorgan: "گرگان",
  sari: "ساری",
  bushehr: "بوشهر",
  birjand: "بیرجند",
  ilam: "ایلام",
  shahrekord: "شهرکرد",
  yasuj: "یاسوج",
  semnan: "سمنان",
  bojnourd: "بجنورد",
  bojnord: "بجنورد",
  "shahr-e kord": "شهرکرد",
  "bandar-e abbas": "بندرعباس",
  kashan: "کاشان",
  najafabad: "نجف‌آباد",
  khomeynishahr: "خمینی‌شهر",
  "shahin shahr": "شاهین‌شهر",
  dehaghan: "دهاقان",
  falavarjan: "فلاورجان",
  khomeyn: "خمین",
  saveh: "ساوه",
  borujerd: "بروجرد",
  dezful: "دزفول",
  abadan: "آبادان",
  khorramshahr: "خرمشهر",
  sabzevar: "سبزوار",
  neyshabur: "نیشابور",
  neyshabour: "نیشابور",
  "torbat-e heydarieh": "تربت حیدریه",
  maragheh: "مراغه",
  marand: "مرند",
  khoy: "خوی",
  maku: "ماکو",
  lahijan: "لاهیجان",
  anzali: "انزلی",
  "bandar anzali": "بندر انزلی",
  chalus: "چالوس",
  ramsar: "رامسر",
  nowshahr: "نوشهر",
  amol: "آمل",
  babol: "بابل",
  qaemshahr: "قائم‌شهر",
  behshahr: "بهشهر",
  shahrud: "شاهرود",
  damghan: "دامغان",
  iran: "ایران",
  iraq: "عراق",
  turkey: "ترکیه",
  türkiye: "ترکیه",
  afghanistan: "افغانستان",
  pakistan: "پاکستان",
  azerbaijan: "آذربایجان",
  armenia: "ارمنستان",
  turkmenistan: "ترکمنستان",
  "united arab emirates": "امارات",
  uae: "امارات",
  germany: "آلمان",
  "united states": "آمریکا",
  usa: "آمریکا",
  "united kingdom": "بریتانیا",
  uk: "بریتانیا",
  canada: "کانادا",
  france: "فرانسه",
  netherlands: "هلند",
  sweden: "سوئد",
  australia: "استرالیا",
  india: "هند",
  china: "چین",
  russia: "روسیه",
  japan: "ژاپن",
};

const PERSIAN_REGIONS = {
  tehran: "تهران",
  esfahan: "اصفهان",
  isfahan: "اصفهان",
  fars: "فارس",
  "khorasan razavi": "خراسان رضوی",
  "khorasan-e razavi": "خراسان رضوی",
  "khorasan shomali": "خراسان شمالی",
  "khorasan jonubi": "خراسان جنوبی",
  alborz: "البرز",
  "east azerbaijan": "آذربایجان شرقی",
  "west azerbaijan": "آذربایجان غربی",
  "azerbaijan-e sharghi": "آذربایجان شرقی",
  "azerbaijan-e gharbi": "آذربایجان غربی",
  khuzestan: "خوزستان",
  kerman: "کرمان",
  kermanshah: "کرمانشاه",
  gilan: "گیلان",
  mazandaran: "مازندران",
  qom: "قم",
  yazd: "یزد",
  hormozgan: "هرمزگان",
  markazi: "مرکزی",
  hamadan: "همدان",
  hamedan: "همدان",
  lorestan: "لرستان",
  kurdistan: "کردستان",
  golestan: "گلستان",
  ardabil: "اردبیل",
  qazvin: "قزوین",
  zanjan: "زنجان",
  semnan: "سمنان",
  bushehr: "بوشهر",
  ilam: "ایلام",
  "chaharmahal and bakhtiari": "چهارمحال و بختیاری",
  "chaharmahal va bakhtiari": "چهارمحال و بختیاری",
  "kohgiluyeh and boyer-ahmad": "کهگیلویه و بویراحمد",
  "kohgiluyeh va buyer ahmad": "کهگیلویه و بویراحمد",
  "sistan and baluchestan": "سیستان و بلوچستان",
  "sistan va baluchestan": "سیستان و بلوچستان",
  "north khorasan": "خراسان شمالی",
  "south khorasan": "خراسان جنوبی",
  "razavi khorasan": "خراسان رضوی",
};

function toPersianLocation(value) {
  if (!value || typeof value !== "string") return value || "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/[\u0600-\u06FF]/.test(trimmed)) return trimmed;

  const lower = trimmed.toLowerCase();
  if (PERSIAN_CITIES[lower]) return PERSIAN_CITIES[lower];
  if (PERSIAN_REGIONS[lower]) return PERSIAN_REGIONS[lower];

  const cleaned = lower
    .replace(/\s+(province|county|city|state|ostan)$/i, "")
    .trim();
  if (PERSIAN_CITIES[cleaned]) return PERSIAN_CITIES[cleaned];
  if (PERSIAN_REGIONS[cleaned]) return PERSIAN_REGIONS[cleaned];
  return trimmed;
}

function formatRegion(region) {
  if (!region) return "";
  const str = String(region).trim();
  if (/^\d+$/.test(str)) return IRAN_REGIONS[str] || "";
  return str;
}

// ================================================================
// 🌍 LOCATION
// ================================================================
async function getLocationFromIp(ip) {
  if (
    !ip ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  ) {
    return { city: "شبکه محلی", region: "", country: "IR" };
  }

  try {
    const geo = geoip.lookup(ip);
    if (geo && (geo.city || geo.region)) {
      return {
        city: toPersianLocation(geo.city),
        region: toPersianLocation(formatRegion(geo.region)),
        country: geo.country || "",
      };
    }
  } catch (e) {}

  try {
    const r = await axios.get(`http://ip-api.com/json/${ip}`, {
      timeout: 5000,
      params: {
        fields: "status,message,city,regionName,country,countryCode",
        lang: "fa",
      },
    });
    if (r.data?.status === "success" && (r.data.city || r.data.regionName)) {
      return {
        city: toPersianLocation(r.data.city),
        region: toPersianLocation(r.data.regionName),
        country: r.data.countryCode || "IR",
      };
    }
  } catch (e) {}

  try {
    const r = await axios.get(`https://ipwho.is/${ip}`, { timeout: 5000 });
    if (r.data?.success && (r.data.city || r.data.region)) {
      return {
        city: toPersianLocation(r.data.city),
        region: toPersianLocation(r.data.region),
        country: r.data.country_code || "IR",
      };
    }
  } catch (e) {}

  try {
    const r = await axios.get(`https://ipapi.co/${ip}/json/`, {
      timeout: 5000,
      headers: { "User-Agent": "smart-shopping/1.0" },
    });
    if (r.data && !r.data.error) {
      return {
        city: toPersianLocation(r.data.city),
        region: toPersianLocation(formatRegion(r.data.region)),
        country: r.data.country_code || "",
      };
    }
  } catch (e) {}

  return { city: "", region: "", country: "" };
}

// ================================================================
// 🎯 QUALITY
// ================================================================
function calculateQuality({
  totalResults,
  storesWithResults,
  storesWithoutResults,
}) {
  const storesCount = storesWithResults.length;
  const totalStores = storesCount + storesWithoutResults.length;
  if (totalResults === 0 || storesCount === 0) return "none";
  const coverage = totalStores > 0 ? storesCount / totalStores : 0;
  if (coverage >= 0.6 && totalResults >= 5) return "excellent";
  if (coverage >= 0.4 && totalResults >= 3) return "good";
  if (coverage >= 0.2) return "low";
  return "none";
}

// ================================================================
// 📝 LOG
// ================================================================
async function logSearch(data) {
  if (!db) return;
  try {
    const {
      ip,
      items,
      userAgent,
      totalResults = 0,
      acceptedCount = 0,
      rejectedCount = 0,
      storesWithResults = [],
      storesWithoutResults = [],
      storesStatus = [],
      productTitles = [],
      queryProducts = [],
      durationMs = 0,
    } = data;

    const location = await getLocationFromIp(ip);
    const quality = calculateQuality({
      totalResults,
      acceptedCount,
      storesWithResults,
      storesWithoutResults,
    });

    const logEntry = {
      timestamp: new Date().toISOString(),
      ip,
      city: location.city,
      region: location.region,
      country: location.country,
      items,
      userAgent,
    };

    await db.query(
      `INSERT INTO search_logs
       (timestamp, ip, city, region, country, items, user_agent,
        total_results, accepted_count, rejected_count,
        stores_with_results, stores_without_results, stores_status,
        product_titles, query_products, duration_ms, quality_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        new Date(),
        logEntry.ip,
        logEntry.city,
        logEntry.region,
        logEntry.country,
        JSON.stringify(items),
        logEntry.userAgent,
        totalResults,
        acceptedCount,
        rejectedCount,
        JSON.stringify(storesWithResults),
        JSON.stringify(storesWithoutResults),
        JSON.stringify(storesStatus),
        JSON.stringify(productTitles),
        JSON.stringify(queryProducts),
        durationMs,
        quality,
      ],
    );

    sendTelegramNotification(logEntry).catch(() => {});
  } catch (e) {
    console.error("[log] failed:", e.message);
  }
}

// ================================================================
// API: COMPARE
// ================================================================
app.post("/api/compare", async (req, res) => {
  const { items, _batch } = req.body;

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

  // ─── تصحیح غلط املایی (Local + Google) ───
  const corrections = await Promise.all(
    items.map((item) =>
      correctQuery(item).catch(() => ({
        original: item,
        corrected: item,
        changed: false,
      })),
    ),
  );
  const correctedItems = corrections.map((c) => c.corrected);

  // لاگ
  const changedCount = corrections.filter((c) => c.changed).length;
  if (changedCount > 0) {
    console.log(
      `[correct] ${changedCount}/${items.length} corrected: ` +
        corrections
          .filter((c) => c.changed)
          .map((c) => `"${c.original}"→"${c.corrected}"(${c.reason})`)
          .join(", "),
    );
  }

  try {
    const result = await compareBasket(correctedItems, {
      batchId: _batch?.id || null,
      batchIndex: _batch?.index || null,
      batchTotal: _batch?.total || null,
    });

    // ─── پیوست اطلاعات تصحیح به پاسخ ───
    if (result.queries) {
      for (let i = 0; i < result.queries.length; i++) {
        const c = corrections[i];
        if (c) {
          result.queries[i].originalQuery = c.original;
          result.queries[i].correctedQuery = c.corrected;
          result.queries[i].correctionChanged = c.changed;
          result.queries[i].correctionReason = c.reason || null;
        }
      }
    }
    const allStoreNames = [
      "دیجی‌کالا",
      "ترب",
      "قلم‌تراش",
      "آرمان آرت",
      "عالم‌زاده",
      "مهستان آرت",
      "مجد مارکت",
    ];
    const storesWithResults = new Set();

    for (const q of result.queries || []) {
      for (const m of q.matches || []) {
        for (const o of m.offers || []) storesWithResults.add(o.storeName);
      }
    }

    const storesWithoutResults = allStoreNames.filter(
      (s) => !storesWithResults.has(s),
    );

    const searchStats = {
      totalResults: (result.queries || []).reduce(
        (sum, q) =>
          sum +
          (q.matches || []).reduce((s, m) => s + (m.offers || []).length, 0),
        0,
      ),
      acceptedCount: (result.queries || []).reduce(
        (sum, q) => sum + (q.stats?.accepted || 0),
        0,
      ),
      rejectedCount: (result.queries || []).reduce(
        (sum, q) => sum + (q.stats?.rejected || 0),
        0,
      ),
      storesWithResults: Array.from(storesWithResults),
      storesWithoutResults,
    };

    result.searchStats = searchStats;
    res.json({ success: true, data: result });
  } catch (error) {
    console.error("[compare] error:", error.message);
    res.status(500).json({ success: false, error: "خطایی در سرور رخ داد." });
  }
});

// ================================================================
// API: DIAGNOSE IP
// ================================================================
app.get("/api/diagnose-ip", async (req, res) => {
  const rawIp =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "";
  const cleanIp = rawIp.replace(/^::ffff:/, "").replace(/^::1$/, "127.0.0.1");

  const results = {};

  try {
    const geo = geoip.lookup(cleanIp);
    results["geoip-lite"] = geo
      ? {
          city: geo.city || null,
          region: geo.region || null,
          country: geo.country || null,
          ll: geo.ll || null,
        }
      : null;
  } catch (e) {
    results["geoip-lite"] = { error: e.message };
  }

  try {
    const r = await axios.get(`http://ip-api.com/json/${cleanIp}`, {
      timeout: 5000,
      params: {
        fields:
          "status,message,city,regionName,country,countryCode,lat,lon,isp,org,as",
        lang: "fa",
      },
    });
    results["ip-api.com-fa"] = r.data;
  } catch (e) {
    results["ip-api.com-fa"] = { error: e.message };
  }

  try {
    const r = await axios.get(`https://ipwho.is/${cleanIp}`, { timeout: 5000 });
    results["ipwho.is"] = r.data;
  } catch (e) {
    results["ipwho.is"] = { error: e.message };
  }

  try {
    const r = await axios.get(`https://ipapi.co/${cleanIp}/json/`, {
      timeout: 5000,
      headers: { "User-Agent": "smart-shopping/1.0" },
    });
    results["ipapi.co"] = r.data;
  } catch (e) {
    results["ipapi.co"] = { error: e.message };
  }

  const finalLocation = await getLocationFromIp(cleanIp);

  res.json({
    success: true,
    detectedIp: cleanIp,
    rawForwardedFor: req.headers["x-forwarded-for"] || null,
    realIp: req.headers["x-real-ip"] || null,
    remoteAddress: req.socket.remoteAddress,
    finalLocation,
    providers: results,
  });
});

// ================================================================
// API: LOG SEARCH
// ================================================================
app.post("/api/log-search", async (req, res) => {
  const {
    items,
    totalResults = 0,
    acceptedCount = 0,
    rejectedCount = 0,
    storesWithResults = [],
    storesWithoutResults = [],
    storesStatus = [],
    productTitles = [],
    queryProducts = [],
    durationMs = 0,
  } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false });
  }

  const rawIp =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "";
  const cleanIp = rawIp.replace(/^::ffff:/, "").replace(/^::1$/, "127.0.0.1");

  logSearch({
    ip: cleanIp,
    items,
    userAgent: req.headers["user-agent"] || "",
    totalResults,
    acceptedCount,
    rejectedCount,
    storesWithResults,
    storesWithoutResults,
    storesStatus,
    productTitles,
    queryProducts,
    durationMs,
  });

  res.json({ success: true });
});

// ================================================================
// API: TRACK VISIT
// ================================================================
app.post("/api/track-visit", async (req, res) => {
  if (!db) return res.json({ success: true });
  try {
    const {
      referrer = "",
      screen = "",
      language = "",
      sessionId = "",
    } = req.body || {};

    const rawIp =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket.remoteAddress ||
      "";
    const cleanIp = rawIp.replace(/^::ffff:/, "").replace(/^::1$/, "127.0.0.1");

    const [recent] = await db.query(
      `SELECT COUNT(*) AS c FROM page_visits
       WHERE ip = ? AND timestamp >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)`,
      [cleanIp],
    );
    if (recent[0].c > 0) return res.json({ success: true, skipped: true });

    const location = await getLocationFromIp(cleanIp);

    await db.query(
      `INSERT INTO page_visits
       (timestamp, ip, city, region, country, user_agent, referrer, screen, language)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        new Date(),
        cleanIp,
        location.city,
        location.region,
        location.country,
        req.headers["user-agent"] || "",
        String(referrer).substring(0, 500),
        String(screen).substring(0, 20),
        String(language).substring(0, 20),
      ],
    );

    res.json({ success: true });
  } catch (e) {
    console.error("[track-visit] error:", e.message);
    res.json({ success: false });
  }
});

// ================================================================
// API: POPULAR SEARCHES
// ================================================================
let popularCache = { data: [], expires: 0 };
const POPULAR_CACHE_TTL = 10 * 60 * 1000;

app.get("/api/popular-searches", async (req, res) => {
  if (!db) return res.json({ success: true, items: [] });
  const now = Date.now();
  if (popularCache.expires > now) {
    return res.json({ success: true, items: popularCache.data });
  }
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 20);
    const [rows] = await db.query(
      `SELECT items FROM search_logs
       WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         AND quality_score IN ('excellent', 'good')
         AND total_results >= 3
         AND accepted_count >= 3`,
    );
    const counts = new Map();
    for (const row of rows) {
      try {
        const arr = JSON.parse(row.items || "[]");
        for (const item of arr) {
          const key = String(item).trim();
          if (!key || key.length < 2) continue;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      } catch {}
    }
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([item]) => item);
    popularCache = { data: sorted, expires: now + POPULAR_CACHE_TTL };
    res.json({ success: true, items: sorted });
  } catch (e) {
    console.error("[popular] error:", e.message);
    res.json({ success: false, items: [] });
  }
});

// ================================================================
// API: AUTOCOMPLETE (Digikala)
// ================================================================
const suggestCache = new Map();
const SUGGEST_TTL = 5 * 60 * 1000;

function normalizeForMatch(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\u200c/g, "")
    .replace(/\s+/g, "")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ۀ/g, "ه")
    .replace(/ة/g, "ه")
    .replace(/[أإآ]/g, "ا")
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function buildParts(title, query) {
  const tWords = title.split(/\s+/).filter(Boolean);
  const qWords = query.split(/\s+/).filter(Boolean);
  const normQW = qWords.map(normalizeForMatch).filter(Boolean);

  return tWords.map((tw) => {
    const twNorm = normalizeForMatch(tw);
    if (!twNorm) return { text: tw, bold: false };
    const matched = normQW.some((qw) => {
      if (!qw) return false;
      if (qw === twNorm) return true;
      if (qw.length >= 3 && twNorm.length >= 3) {
        return twNorm.includes(qw) || qw.includes(twNorm);
      }
      return false;
    });
    return { text: tw, bold: !matched };
  });
}

async function fetchDigikalaAutocomplete(q) {
  try {
    const url = `https://api.digikala.com/discovery/api/v2/autocomplete?q=${encodeURIComponent(q)}`;
    const r = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
        Referer: "https://www.digikala.com/",
        Origin: "https://www.digikala.com",
      },
      timeout: 4500,
      validateStatus: () => true,
    });
    if (r.status !== 200 || !r.data) return [];
    const list = r.data?.data?.auto_complete || [];
    if (!Array.isArray(list)) return [];
    const results = [];
    for (const item of list) {
      const title = String(item?.title || "").trim();
      if (!title) continue;
      results.push(title);
    }
    return results;
  } catch (e) {
    console.error("[suggest] digikala error:", e.message);
    return [];
  }
}

app.get("/api/suggest", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q || q.length < 2) return res.json({ success: true, items: [] });

  const cacheKey = q.toLowerCase();
  const cached = suggestCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SUGGEST_TTL) {
    return res.json({ success: true, items: cached.items });
  }

  let suggestions = await fetchDigikalaAutocomplete(q);

  if (suggestions.length === 0 && db) {
    try {
      const [rows] = await db.query(
        `SELECT items FROM search_logs
         WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 60 DAY)`,
      );
      const ql = q.toLowerCase();
      const matches = new Set();
      for (const row of rows) {
        try {
          const arr = JSON.parse(row.items || "[]");
          for (const item of arr) {
            const t = String(item).trim();
            if (t.toLowerCase().includes(ql) && t.length >= 2) matches.add(t);
          }
        } catch {}
      }
      suggestions = [...matches].slice(0, 10);
    } catch {}
  }

  let items = suggestions.map((title) => ({
    full: title,
    parts: buildParts(title, q),
  }));

  // ─── بررسی و اضافه کردن تصحیح ───
  let correctionResult = { changed: false, corrected: q };
  try {
    correctionResult = await correctQuery(q);
  } catch (e) {}

  if (correctionResult.changed && correctionResult.corrected !== q) {
    // ۱. حذف کلمه‌ی غلط/محاوره از لیست پیشنهادها
    items = items.filter(
      (it) => it.full.trim().toLowerCase() !== q.trim().toLowerCase(),
    );

    // ۲. گذاشتن تصحیح در ردیف اول
    items.unshift({
      full: correctionResult.corrected,
      correction: true,
      original: q,
      parts: [{ text: correctionResult.corrected, bold: true }],
    });
  } else {
    // اگه تصحیحی نبود (کلمه درست بود)، کلمه‌ی دقیق رو ببر اول
    const exactMatchIdx = items.findIndex(
      (it) => !it.correction && !it.fallback && it.full.trim() === q.trim(),
    );
    if (exactMatchIdx !== -1) {
      const [exactItem] = items.splice(exactMatchIdx, 1);
      items.unshift(exactItem);
    } else {
      items.unshift({ full: q, parts: buildParts(q, q) });
    }
  }

  // ─── Fallback نهایی ───
  if (items.length === 0) {
    items = [{ full: q, fallback: true, parts: [{ text: q, bold: true }] }];
  }

  suggestCache.set(cacheKey, { items, at: Date.now() });
  if (suggestCache.size > 200) {
    const entries = [...suggestCache.entries()].sort(
      (a, b) => a[1].at - b[1].at,
    );
    entries.slice(0, 100).forEach(([k]) => suggestCache.delete(k));
  }

  res.json({ success: true, items });
});

// ================================================================
// 📊 ADMIN PANEL
// ================================================================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const ADMIN_COOKIE = "smart_admin_session";

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  header.split(";").forEach((c) => {
    const [k, ...v] = c.trim().split("=");
    if (k) cookies[k] = decodeURIComponent(v.join("="));
  });
  return cookies;
}

function isAuthed(req) {
  const cookies = parseCookies(req);
  return cookies[ADMIN_COOKIE] === ADMIN_PASSWORD;
}

function escapeHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── highlight server-side ───
function serverHighlight(title, queryWords) {
  if (!title) return "";
  if (!queryWords || queryWords.length === 0) return escapeHtml(title);

  var titleLen = title.length;
  var marks = [];
  var i, j, k;
  for (i = 0; i < titleLen; i++) marks.push(false);

  function nch(ch) {
    var c = ch.charCodeAt(0);
    if (c === 0x200b || c === 0x200c || c === 0x200d) return "";
    if (c === 0x200e || c === 0x200f) return "";
    if (c === 0xfeff) return "";
    if (c === 0x0640) return "";
    if (c >= 0x064b && c <= 0x065f) return "";
    if (c === 0x0670) return "";
    if (c === 0x064a || c === 0x0649 || c === 0x06d2) return "ی";
    if (c === 0x0643 || c === 0x06aa || c === 0x06ab) return "ک";
    if (c === 0x0629 || c === 0x06c0 || c === 0x06c1 || c === 0x06d5)
      return "ه";
    if (c === 0x0622 || c === 0x0623 || c === 0x0625) return "ا";
    if (c === 0x0624) return "و";
    if (c === 0x0626) return "ی";
    var pd = "۰۱۲۳۴۵۶۷۸۹";
    var ad = "٠١٢٣٤٥٦٧٨٩";
    var pdi = pd.indexOf(ch);
    if (pdi !== -1) return String(pdi);
    var adi = ad.indexOf(ch);
    if (adi !== -1) return String(adi);
    return ch.toLowerCase();
  }

  function nstr(s) {
    var r = "";
    for (var x = 0; x < s.length; x++) r += nch(s[x]);
    return r;
  }

  var nTitle = "";
  var pMap = [];
  for (i = 0; i < titleLen; i++) {
    var nc = nch(title[i]);
    for (j = 0; j < nc.length; j++) {
      nTitle += nc[j];
      pMap.push(i);
    }
  }

  function markRange(from, len) {
    if (len <= 0) return;
    var s = pMap[from];
    var e = pMap[from + len - 1];
    if (s === undefined || e === undefined) return;
    for (var x = s; x <= e; x++) {
      if (x >= 0 && x < titleLen) marks[x] = true;
    }
  }

  // مرحله ۱: جستجوی مستقیم
  for (var w = 0; w < queryWords.length; w++) {
    var qw = String(queryWords[w] || "").trim();
    if (!qw) continue;
    var nqw = nstr(qw);
    if (!nqw) continue;
    if (nqw.length < 2 && !/^[0-9]$/.test(nqw)) continue;

    var from = 0;
    while (true) {
      var idx = nTitle.indexOf(nqw, from);
      if (idx === -1) break;
      markRange(idx, nqw.length);
      from = idx + nqw.length;
    }
  }

  // مرحله ۲: جستجوی ترکیبی (قلمو → قلم + مو)
  for (var w2 = 0; w2 < queryWords.length; w2++) {
    var qw2 = String(queryWords[w2] || "").trim();
    if (!qw2) continue;
    var nqw2 = nstr(qw2);
    if (nqw2.length < 4) continue;
    if (nTitle.indexOf(nqw2) !== -1) continue;

    for (var sp = 2; sp <= nqw2.length - 2; sp++) {
      var p1 = nqw2.substring(0, sp);
      var p2 = nqw2.substring(sp);
      if (!p1 || !p2) continue;

      var f1 = 0;
      while (true) {
        var i1 = nTitle.indexOf(p1, f1);
        if (i1 === -1) break;

        var j1 = i1 + p1.length;
        while (j1 < nTitle.length && /\s/.test(nTitle[j1])) j1++;

        if (nTitle.substring(j1, j1 + p2.length) === p2) {
          var s1 = pMap[i1];
          var e1 = pMap[j1 + p2.length - 1];
          for (var m = s1; m <= e1; m++) {
            if (m >= 0 && m < titleLen) marks[m] = true;
          }
        }

        f1 = i1 + p1.length;
      }
    }
  }

  var html = "";
  var inBold = false;
  for (i = 0; i < titleLen; i++) {
    if (marks[i] && !inBold) {
      html += "<b>";
      inBold = true;
    } else if (!marks[i] && inBold) {
      html += "</b>";
      inBold = false;
    }
    html += escapeHtml(title[i]);
  }
  if (inBold) html += "</b>";

  return html;
}

function renderLoginPage(errorMsg = "") {
  return `
    <!DOCTYPE html>
    <html lang="en" dir="ltr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
          --primary: #6366f1; --primary-dark: #4f46e5; --danger: #ef4444;
          --bg: #f8fafc; --surface: #ffffff; --border: #e2e8f0;
          --text: #1e293b; --text-muted: #64748b;
          --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        }
        :root[data-theme="dark"] {
          --primary: #818cf8; --primary-dark: #6366f1; --danger: #f87171;
          --bg: #0f172a; --surface: #1e293b; --border: #334155;
          --text: #f1f5f9; --text-muted: #94a3b8;
          --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.2);
        }
        body {
          font-family: "Inter", system-ui, sans-serif;
          background: linear-gradient(135deg, #f0f4ff 0%, #f8fafc 100%);
          color: var(--text); min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          padding: 2rem 1rem;
        }
        :root[data-theme="dark"] body {
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        }
        .theme-btn {
          position: fixed; top: 1.5rem; right: 1.5rem;
          width: 3rem; height: 3rem; border-radius: 50%;
          background: var(--surface); border: 2px solid var(--border);
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          font-size: 1.25rem; transition: all 0.3s ease; box-shadow: var(--shadow); padding: 0;
        }
        .theme-btn:hover { transform: rotate(20deg) scale(1.1); border-color: var(--primary); }
        .card {
          background: var(--surface); padding: 2.5rem 2rem;
          border-radius: 1.5rem; box-shadow: var(--shadow);
          width: 100%; max-width: 380px; text-align: center;
          border: 1.5px solid var(--border); position: relative; overflow: hidden;
        }
        .card::before {
          content: ""; position: absolute; top: 0; left: 0; right: 0;
          height: 4px;
          background: linear-gradient(90deg, #6366f1 0%, #8b5cf6 35%, #ec4899 65%, #f59e0b 100%);
        }
        .icon {
          width: 4rem; height: 4rem; margin: 0 auto 1rem;
          border-radius: 1rem;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          display: flex; align-items: center; justify-content: center;
          font-size: 1.75rem; box-shadow: 0 8px 24px rgba(99, 102, 241, 0.35);
        }
        h1 { font-size: 1.4rem; font-weight: 800; margin: 0 0 1.75rem; color: var(--text); }
        .field { position: relative; margin-bottom: 0.75rem; }
        input {
          width: 100%; padding: 0.9rem 1rem; border: 2px solid var(--border);
          border-radius: 0.75rem; font-family: inherit; font-size: 1rem;
          background: var(--bg); color: var(--text); text-align: left; direction: ltr;
        }
        input:focus {
          outline: none; border-color: var(--primary);
          background: var(--surface); box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
        }
        button {
          width: 100%; padding: 0.9rem;
          background: linear-gradient(135deg, #a5b4fc 0%, #818cf8 55%, #6366f1 100%);
          color: white; border: none; border-radius: 0.75rem;
          font-family: inherit; font-size: 1rem; font-weight: 700; cursor: pointer;
        }
        button:hover { transform: translateY(-2px); }
        .error { color: var(--danger); font-size: 0.85rem; margin-bottom: 0.75rem; min-height: 1.2rem; font-weight: 600; }
      </style>
    </head>
    <body>
      <button class="theme-btn" id="theme-btn">🌙</button>
      <div class="card">
        <div class="icon">🔒</div>
        <h1>Admin</h1>
        ${errorMsg ? `<div class="error">${errorMsg}</div>` : '<div class="error"></div>'}
        <form method="POST" action="/admin/login">
          <div class="field">
            <input type="password" name="password" placeholder="password" autofocus required />
          </div>
          <button type="submit">Login</button>
        </form>
      </div>
      <script>
        (function() {
          const btn = document.getElementById('theme-btn');
          const saved = localStorage.getItem('adminTheme');
          const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
          applyTheme(saved || (prefers ? 'dark' : 'light'));
          function applyTheme(t) {
            document.documentElement.setAttribute('data-theme', t);
            btn.textContent = t === 'dark' ? '☀️' : '🌙';
            localStorage.setItem('adminTheme', t);
          }
          btn.addEventListener('click', () => {
            const c = document.documentElement.getAttribute('data-theme') || 'light';
            applyTheme(c === 'dark' ? 'light' : 'dark');
          });
        })();
      </script>
    </body>
    </html>
  `;
}

const QUALITY_LABELS = {
  excellent: {
    label: "کاملاً موفق",
    color: "#10b981",
    bg: "rgba(16,185,129,0.15)",
  },
  good: { label: "خوب", color: "#34d399", bg: "rgba(52,211,153,0.12)" },
  low: { label: "کم نتیجه", color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
  none: { label: "بدون نتیجه", color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
  suspicious: { label: "مشکوک", color: "#f97316", bg: "rgba(249,115,22,0.15)" },
};

async function renderAdminPage(req) {
  const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
  const search = String(req.query.search || "").trim();

  let logs, total;
  if (search) {
    const [rows] = await db.query(
      `SELECT * FROM search_logs
       WHERE items LIKE ? OR city LIKE ? OR ip LIKE ?
       ORDER BY timestamp DESC LIMIT ?`,
      [`%${search}%`, `%${search}%`, `%${search}%`, limit],
    );
    logs = rows;
    const [countRows] = await db.query(
      `SELECT COUNT(*) as c FROM search_logs
       WHERE items LIKE ? OR city LIKE ? OR ip LIKE ?`,
      [`%${search}%`, `%${search}%`, `%${search}%`],
    );
    total = countRows[0].c;
  } else {
    const [rows] = await db.query(
      "SELECT * FROM search_logs ORDER BY timestamp DESC LIMIT ?",
      [limit],
    );
    logs = rows;
    const [countRows] = await db.query("SELECT COUNT(*) as c FROM search_logs");
    total = countRows[0].c;
  }

  const [rawCities] = await db.query(
    `SELECT city, COUNT(*) as c FROM search_logs
     WHERE city != '' GROUP BY city`,
  );

  const cityMap = new Map();
  for (const row of rawCities) {
    const normalized = toPersianLocation(row.city) || row.city;
    const existing = cityMap.get(normalized) || 0;
    cityMap.set(normalized, existing + row.c);
  }
  const topCities = [...cityMap.entries()]
    .map(([city, c]) => ({ city, c }))
    .sort((a, b) => b.c - a.c)
    .slice(0, 10);

  const [last7Days] = await db.query(
    `SELECT DATE(timestamp) as day, COUNT(*) as c FROM search_logs
     WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     GROUP BY day ORDER BY day DESC`,
  );

  const [visits7Days] = await db.query(
    `SELECT DATE(timestamp) as day, COUNT(*) as c FROM page_visits
     WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     GROUP BY day ORDER BY day DESC`,
  );

  let visitStats = { total: 0, today: 0, since: null, last24h: 0 };
  try {
    const [v] = await db.query(
      `SELECT COUNT(*) as c, MIN(timestamp) as first FROM page_visits`,
    );
    visitStats.total = v[0].c;
    visitStats.since = v[0].first;

    const [vt] = await db.query(
      `SELECT COUNT(*) as c FROM page_visits WHERE DATE(timestamp) = CURDATE()`,
    );
    visitStats.today = vt[0].c;

    const [v24] = await db.query(
      `SELECT COUNT(*) as c FROM page_visits
       WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
    );
    visitStats.last24h = v24[0].c;

    const [recentVisits] = await db.query(
      `SELECT timestamp, ip, city, region, country
       FROM page_visits
       ORDER BY timestamp DESC
       LIMIT 3`,
    );
    visitStats.recent = recentVisits;
  } catch {}

  const rowsHtml = logs
    .map((log) => {
      let itemsArr = [];
      try {
        itemsArr = JSON.parse(log.items);
      } catch {}
      const itemsStr = itemsArr
        .map((i) => `<span class="item-tag">${escapeHtml(i)}</span>`)
        .join("");

      const timeStr = (() => {
        try {
          const d = new Date(log.timestamp);
          const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
            weekday: "short",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).formatToParts(d);
          const get = (t) => parts.find((p) => p.type === t)?.value || "";
          return `${get("weekday")} ${get("year")}/${get("month")}/${get("day")} · ${get("hour")}:${get("minute")}`;
        } catch {
          return new Date(log.timestamp).toLocaleString("fa-IR");
        }
      })();

      const locationStr = log.city
        ? `<span class="location">📍 ${escapeHtml(log.city)}${log.region ? "، " + escapeHtml(log.region) : ""}</span>`
        : '<span class="location empty-loc">نامشخص</span>';

      const qualityInfo =
        QUALITY_LABELS[log.quality_score] || QUALITY_LABELS.none;
      const qualityBadge = `
        <button class="quality-badge quality-badge-btn"
                style="color: ${qualityInfo.color}; background: ${qualityInfo.bg};"
                title="${qualityInfo.label} - کلیک برای جزئیات"
                data-log-id="${log.id}"
                type="button">
          ${qualityInfo.label}
        </button>
      `;

      let statsLine = "";
      try {
        const storesWith = JSON.parse(log.stores_with_results || "[]");
        const storesWithout = JSON.parse(log.stores_without_results || "[]");
        const storesStatus = JSON.parse(log.stores_status || "[]");

        const errorStores = storesStatus.filter((s) => s.status === "ERR");

        statsLine = `
          <div class="stats-line">
            <button class="stats-btn stats-btn-stores" type="button" data-log-id="${log.id}" title="مشاهده محصولات">
              ✅ ${storesWith.length} فروشگاه
            </button>
            <span>❌ ${storesWithout.length} بدون نتیجه</span>
            <span>📦 ${log.total_results || 0} محصول</span>
            <span>⏱️ ${log.duration_ms || 0}ms</span>
          </div>
        `;

        if (errorStores.length > 0) {
          const seenErrors = new Set();
          const uniqueErrors = [];
          for (const s of errorStores) {
            const key = s.store + "::" + s.message;
            if (seenErrors.has(key)) continue;
            seenErrors.add(key);
            uniqueErrors.push(s);
          }

          statsLine += `
            <div class="stats-line stats-line-errors">
              ${uniqueErrors
                .map(
                  (s) =>
                    `<span class="error-tag" title="${escapeHtml(s.message)}">⚠️ ${escapeHtml(s.store)}: ${escapeHtml(s.message)}</span>`,
                )
                .join("")}
            </div>
          `;
        }
      } catch {}

      return `
        <tr>
          <td class="time">${timeStr}</td>
          <td>${locationStr}</td>
          <td class="ip"><code>${escapeHtml(log.ip)}</code></td>
          <td class="quality">${qualityBadge}</td>
          <td class="items">${itemsStr}${statsLine}</td>
        </tr>
      `;
    })
    .join("");

  const citiesHtml = topCities
    .map(
      (c) =>
        `<li><strong>${escapeHtml(c.city)}</strong><span class="count-badge">${c.c}</span></li>`,
    )
    .join("");

  const daysHtml = last7Days
    .map((d) => {
      const dayStr = d.day ? new Date(d.day).toLocaleDateString("fa-IR") : "—";
      return `<li><strong>${dayStr}</strong><span class="count-badge">${d.c}</span></li>`;
    })
    .join("");

  const visits7DaysHtml = visits7Days
    .map((d) => {
      const dayStr = d.day ? new Date(d.day).toLocaleDateString("fa-IR") : "—";
      return `<li><strong>${dayStr}</strong><span class="count-badge count-badge-green">${d.c}</span></li>`;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin</title>
      <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&family=Inter:wght@500;700;800&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
          --primary: #6366f1; --primary-dark: #4f46e5; --primary-light: #a5b4fc;
          --success: #10b981; --warning: #f59e0b; --danger: #ef4444;
          --bg: #f8fafc; --surface: #ffffff; --border: #e2e8f0;
          --text: #1e293b; --text-muted: #64748b;
          --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        }
        :root[data-theme="dark"] {
          --primary: #818cf8; --primary-dark: #6366f1; --primary-light: #4f46e5;
          --success: #34d399; --warning: #fbbf24; --danger: #f87171;
          --bg: #0f172a; --surface: #1e293b; --border: #334155;
          --text: #f1f5f9; --text-muted: #94a3b8;
          --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.2);
        }
        body {
          font-family: "Vazirmatn", system-ui, sans-serif;
          background: linear-gradient(135deg, #f0f4ff 0%, #f8fafc 100%);
          color: var(--text); min-height: 100vh; padding: 1.5rem 1rem;
        }
        :root[data-theme="dark"] body {
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header {
          display: flex; align-items: center; justify-content: space-between;
          flex-wrap: nowrap; gap: 0.75rem;
          position: sticky; top: 0; z-index: 100;
          padding: 0.75rem 1rem; margin: -1.5rem -1rem 1.5rem;
          background: color-mix(in srgb, var(--bg) 88%, transparent);
          backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid transparent;
          transition: box-shadow 0.25s ease, border-color 0.25s ease;
        }
        .header.stuck {
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
          border-bottom-color: var(--border);
        }
        :root[data-theme="dark"] .header { background: color-mix(in srgb, var(--bg) 85%, transparent); }
        :root[data-theme="dark"] .header.stuck { box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4); }
        @media (max-width: 700px) {
          .header { padding: 0.6rem 0.75rem; margin-inline: -0.75rem; padding-inline: 0.75rem; }
        }
        .logo { display: inline-flex; align-items: center; gap: 0.75rem; min-width: 0; flex-shrink: 1; }
        .logo-icon {
          width: 2.75rem; height: 2.75rem; border-radius: 0.75rem;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          display: flex; align-items: center; justify-content: center;
          font-size: 1.25rem; flex-shrink: 0;
          box-shadow: 0 6px 18px rgba(99, 102, 241, 0.35);
        }
        .logo-text { display: flex; flex-direction: column; min-width: 0; }
        h1 {
          font-family: "Inter", "Vazirmatn", sans-serif;
          font-size: 1.3rem; font-weight: 800; color: var(--text);
          line-height: 1.2; letter-spacing: -0.5px; white-space: nowrap;
        }
        .subtitle {
          font-size: 0.72rem; color: var(--text-muted); font-weight: 500;
          line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .header-actions { display: flex; gap: 0.5rem; flex-shrink: 0; }
        .btn {
          display: inline-flex; align-items: center; justify-content: center;
          gap: 0.4rem; padding: 0.6rem 1rem; border-radius: 0.65rem;
          font-family: inherit; font-size: 0.85rem; font-weight: 700;
          cursor: pointer; transition: all 0.2s ease;
          border: 1.5px solid; text-decoration: none; white-space: nowrap;
        }
        .btn-theme {
          background: var(--surface); border-color: var(--border);
          color: var(--text); font-size: 1.05rem;
          width: 2.5rem; height: 2.5rem; padding: 0; flex-shrink: 0;
        }
        .btn-theme:hover { border-color: var(--primary); transform: rotate(20deg) scale(1.08); }
        .btn-logout { background: var(--surface); border-color: rgba(239,68,68,0.3); color: var(--danger); }
        .btn-logout:hover {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          border-color: #ef4444; color: white; transform: translateY(-1px);
        }
        .stats {
          display: grid; grid-template-columns: repeat(4, 1fr);
          gap: 1rem; margin-bottom: 1rem;
        }
        @media (max-width: 1200px) { .stats { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 700px) { .stats { grid-template-columns: 1fr; } }
        .stat-card {
          background: var(--surface); padding: 1.25rem; border-radius: 1.25rem;
          box-shadow: var(--shadow); border: 1.5px solid var(--border);
          position: relative; overflow: hidden;
        }
        .stat-card::before {
          content: ""; position: absolute; top: 0; right: 0;
          width: 3px; height: 100%; background: var(--primary);
          border-radius: 0 1.25rem 1.25rem 0;
        }
        .stat-card.cities::before { background: linear-gradient(180deg, #6366f1, #8b5cf6); }
        .stat-card.days::before { background: linear-gradient(180deg, #10b981, #059669); }
        .stat-card.visits::before { background: linear-gradient(180deg, #f59e0b, #d97706); }
        .stat-card.visits-days::before { background: linear-gradient(180deg, #f59e0b, #d97706); }
        .stat-card h3 {
          font-size: 0.85rem; font-weight: 800; color: var(--text-muted);
          margin-bottom: 0.85rem; display: flex; align-items: center; gap: 0.4rem;
        }
        .stat-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
        .stat-list li {
          display: flex; align-items: center; justify-content: space-between;
          gap: 0.5rem; font-size: 0.83rem; padding: 0.4rem 0.65rem;
          background: var(--bg); border-radius: 0.5rem;
        }
        .stat-list li:hover { background: var(--border); }
        .stat-list strong { font-weight: 700; color: var(--text); }
        .count-badge {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 1.75rem; height: 1.5rem; padding: 0 0.5rem;
          background: linear-gradient(135deg, var(--primary), var(--primary-dark));
          color: white; border-radius: 1rem; font-size: 0.72rem;
          font-weight: 800; font-variant-numeric: tabular-nums;
        }
        .count-badge-green { background: linear-gradient(135deg, #10b981, #059669) !important; }
        .visits-row { display: flex; gap: 1rem; align-items: center; justify-content: space-around; }
        .visit-block {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          gap: 0.25rem; padding: 0.5rem; background: var(--bg); border-radius: 0.6rem;
        }
        .visit-number {
          font-size: 1.5rem; font-weight: 900; color: #f59e0b;
          line-height: 1; font-variant-numeric: tabular-nums;
        }
        :root[data-theme="dark"] .visit-number { color: #fbbf24; }
        .visit-number-today { color: #10b981; font-size: 1.5rem; font-weight: 900; }
        :root[data-theme="dark"] .visit-number-today { color: #34d399; }
        .visit-label { font-size: 0.68rem; color: var(--text-muted); font-weight: 700; }
        .visits-since {
          margin-top: 0.6rem; font-size: 0.7rem; color: var(--text-muted);
          font-weight: 600; text-align: center; padding-top: 0.5rem;
          border-top: 1px dashed var(--border);
        }
        .recent-visits {
          margin-top: 0.75rem; padding-top: 0.75rem;
          border-top: 1px dashed var(--border);
          display: flex; flex-direction: column; gap: 0.35rem;
        }
        .recent-visits-title {
          font-size: 0.68rem; font-weight: 800; color: var(--text-muted);
          margin-bottom: 0.25rem; letter-spacing: 0.5px;
        }
        .recent-visit-row {
          display: flex; align-items: center; justify-content: space-between;
          gap: 0.5rem; padding: 0.35rem 0.5rem; background: var(--bg);
          border-radius: 0.4rem; font-size: 0.7rem;
        }
        .rv-time { color: var(--text-muted); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .rv-loc { color: var(--text); font-weight: 700; flex: 1; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .rv-ip {
          color: var(--primary); font-family: 'Courier New', monospace;
          font-size: 0.65rem; font-weight: 600; background: var(--surface);
          padding: 0.15rem 0.35rem; border-radius: 0.3rem;
          border: 1px solid var(--border); white-space: nowrap;
        }
        .empty-list {
          color: var(--text-muted); font-size: 0.8rem; text-align: center;
          padding: 1.5rem; font-style: italic;
        }
        .search-form {
          background: var(--surface); padding: 0.75rem; border-radius: 1rem;
          margin-bottom: 1rem; box-shadow: var(--shadow);
          border: 1.5px solid var(--border); display: flex; gap: 0.5rem;
        }
        .search-form input {
          flex: 1; padding: 0.7rem 1rem; border: 2px solid var(--border);
          border-radius: 0.65rem; font-family: inherit; font-size: 0.9rem;
          background: var(--bg); color: var(--text);
        }
        .search-form input:focus {
          outline: none; border-color: var(--primary);
          background: var(--surface); box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
        }
        .search-form button {
          padding: 0.7rem 1.35rem;
          background: linear-gradient(135deg, #a5b4fc 0%, #818cf8 55%, #6366f1 100%);
          color: white; border: none; border-radius: 0.65rem;
          font-family: inherit; font-size: 0.9rem; font-weight: 700;
          cursor: pointer; box-shadow: 0 4px 14px rgba(129, 140, 248, 0.35);
        }
        .search-form button:hover { transform: translateY(-2px); }
        .table-wrapper {
          background: var(--surface); border-radius: 1.25rem;
          box-shadow: var(--shadow); border: 1.5px solid var(--border);
          overflow-x: auto;
        }
        table { width: 100%; border-collapse: collapse; min-width: 800px; }
        th {
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          color: white; padding: 0.9rem 1rem; text-align: right;
          font-size: 0.82rem; font-weight: 700; white-space: nowrap;
        }
        td {
          padding: 0.8rem 1rem; border-bottom: 1px solid var(--border);
          font-size: 0.83rem; vertical-align: middle; color: var(--text);
        }
        tr:last-child td { border-bottom: none; }
        tbody tr:hover { background: var(--bg); }
        .time {
          white-space: nowrap; color: var(--text); font-size: 0.83rem;
          font-weight: 600; letter-spacing: -0.2px;
        }
        .location { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.83rem; font-weight: 600; }
        .empty-loc { color: var(--text-muted); font-style: italic; font-weight: 500; }
        .ip code {
          background: var(--bg); padding: 0.25rem 0.55rem;
          border-radius: 0.4rem; font-size: 0.75rem;
          color: var(--primary); font-family: 'Courier New', monospace;
          font-weight: 600; border: 1px solid var(--border);
        }
        .quality-badge {
          display: inline-flex; align-items: center; gap: 0.3rem;
          padding: 0.35rem 0.7rem; border-radius: 0.5rem;
          font-size: 0.75rem; font-weight: 700;
          white-space: nowrap; border: 1.5px solid currentColor;
        }
        .quality-badge-btn {
          cursor: pointer; font-family: inherit; transition: all 0.2s ease;
        }
        .quality-badge-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
        }
        .item-tag {
          display: inline-block;
          background: linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08));
          color: var(--primary); padding: 0.25rem 0.65rem;
          border-radius: 0.5rem; margin: 0.15rem;
          font-size: 0.78rem; font-weight: 600;
          border: 1px solid rgba(99,102,241,0.2);
        }
        .stats-line { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.4rem; font-size: 0.68rem; color: var(--text-muted); }
        .stats-line span { padding: 0.15rem 0.4rem; background: var(--bg); border-radius: 0.3rem; border: 1px solid var(--border); }
        .stats-line-errors { margin-top: 0.3rem; }
        .error-tag {
          display: inline-block; padding: 0.15rem 0.5rem;
          background: rgba(239, 68, 68, 0.15); color: #dc2626;
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 0.4rem; font-size: 0.68rem; font-weight: 700;
          font-family: 'Courier New', monospace;
          max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .stats-btn {
          display: inline-flex; align-items: center; gap: 0.3rem;
          padding: 0.2rem 0.55rem; background: var(--bg);
          border: 1.5px solid var(--border); border-radius: 0.4rem;
          font-family: inherit; font-size: 0.72rem; font-weight: 700;
          color: var(--text); cursor: pointer; transition: all 0.2s ease;
        }
        .stats-btn:hover {
          background: var(--surface); border-color: var(--primary);
          color: var(--primary); transform: translateY(-1px);
        }
        .stats-btn-stores { color: #059669; border-color: rgba(16, 185, 129, 0.3); }
        .stats-btn-stores:hover { border-color: #10b981; color: #10b981; }
        :root[data-theme="dark"] .stats-btn-stores { color: #34d399; }
        .empty { text-align: center; padding: 3rem; color: var(--text-muted); font-size: 0.9rem; }
        .limit-info { margin-top: 1rem; text-align: center; color: var(--text-muted); font-size: 0.8rem; }
        .admin-datetime {
          display: inline-flex; align-items: center; gap: 0.5rem;
          padding: 0.45rem 0.75rem; background: var(--bg);
          border: 1.5px solid var(--border); border-radius: 0.6rem;
          font-size: 0.78rem; font-weight: 700; white-space: nowrap;
        }
        .admin-datetime #admin-time {
          color: var(--primary); font-variant-numeric: tabular-nums;
          letter-spacing: 0.5px; padding-inline-start: 0.5rem;
          border-inline-start: 1.5px solid var(--border);
        }
        .admin-datetime #admin-date { color: var(--text-muted); }
        @media (max-width: 900px) { .admin-datetime { display: none; } }
        .visits-toast {
          position: fixed; top: 100px; left: 50%;
          transform: translateX(-50%) translateY(-100px);
          background: linear-gradient(135deg, #10b981, #059669);
          color: white; padding: 0.875rem 1.5rem; border-radius: 1rem;
          font-family: inherit; font-size: 0.875rem; font-weight: 700;
          box-shadow: 0 8px 30px rgba(16, 185, 129, 0.4);
          z-index: 10000; opacity: 0;
          transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
          display: flex; align-items: center; gap: 0.6rem;
          pointer-events: none;
        }
        .visits-toast.visible { transform: translateX(-50%) translateY(0); opacity: 1; }
        .visits-toast-icon { font-size: 1.25rem; }
        .quality-modal {
          position: fixed; inset: 0; z-index: 9500;
          display: flex; align-items: center; justify-content: center;
          padding: 2rem;
        }
        .quality-modal.hidden { display: none !important; }
        .quality-modal-backdrop {
          position: absolute; inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(6px); cursor: pointer;
        }
        .quality-modal-content {
          position: relative; z-index: 1; background: var(--surface);
          border-radius: 1.25rem; padding: 1.5rem;
          width: 100%; max-width: 800px; max-height: 85vh;
          display: flex; flex-direction: column;
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
          overflow: hidden; border: 1.5px solid var(--border);
        }
        .quality-modal-header {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 1rem; padding-bottom: 1rem;
          border-bottom: 2px dashed var(--border);
        }
        .quality-modal-title {
          display: flex; align-items: center; gap: 0.6rem;
          font-size: 1rem; font-weight: 800; color: var(--text);
        }
        .quality-modal-title > span { font-size: 1.3rem; }
        .quality-modal-subtitle {
          font-size: 0.72rem; color: var(--text-muted);
          font-weight: 600; margin-top: 0.15rem;
        }
        .quality-modal-close {
          width: 2rem; height: 2rem; border-radius: 50%;
          background: var(--bg); border: 1.5px solid var(--border);
          color: var(--text-muted); cursor: pointer;
          font-family: inherit; display: flex;
          align-items: center; justify-content: center;
          transition: all 0.2s ease;
        }
        .quality-modal-close:hover {
          background: #ef4444; color: white; border-color: #ef4444;
          transform: rotate(90deg);
        }
        .quality-modal-body {
          flex: 1; overflow-y: auto; overflow-x: hidden;
          background: #0f172a; border-radius: 0.75rem;
          padding: 1rem;
          font-family: 'Courier New', 'Consolas', monospace;
          direction: ltr; text-align: left;
          font-size: 0.8rem; line-height: 1.75;
        }
        .quality-modal-line {
          display: flex;
          align-items: flex-start;
          flex-wrap: wrap; /* اجازه شکستن خطوط در موبایل */
          gap: 0.5rem; /* فاصله استاندارد بین اجزا */
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 0.78rem;
          line-height: 1.6;
          padding: 0.25rem 0;
          direction: ltr;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .quality-modal-line.qry-line {
          color: #a5b4fc; font-weight: 700;
          margin-top: 0.5rem; margin-bottom: 0.25rem;
        }
        .quality-modal-line.qry-line:first-child { margin-top: 0; }
        .qml-time { color: #94a3b8; flex-shrink: 0; }
        .qml-status { font-weight: 800; flex-shrink: 0; }
        .qml-status-ok { color: #4ade80; }
        .qml-status-warn { color: #fbbf24; }
        .qml-status-err { color: #f87171; }
        .qml-status-qry { color: #a5b4fc; }
        .qml-store { color: #a5b4fc; font-weight: 700; flex-shrink: 0; }
        .qml-msg { color: #e2e8f0; word-break: break-word; flex: 1; min-width: 150px; }

        /* 🎯 تنظیمات اختصاصی موبایل */
        @media (max-width: 640px) {
          .quality-modal-content { padding: 1rem; max-height: 90vh; border-radius: 1rem; }
          .quality-modal-body { padding: 0.75rem; }
          .quality-modal-line { gap: 0.25rem; font-size: 0.72rem; }
          .qml-msg { min-width: 100%; padding-left: 0; } /* پیام به خط بعد می‌رود */
        }
        .quality-modal-loading,
        .quality-modal-empty {
          color: #94a3b8; text-align: center; padding: 2rem;
        }
        .products-query-group {
          margin-bottom: 1rem; padding-bottom: 0.75rem;
          border-bottom: 1px dashed rgba(148, 163, 184, 0.2);
        }
        .products-query-group:last-child { border-bottom: none; margin-bottom: 0; }
        .products-query-header {
          display: flex; align-items: center; gap: 0.5rem;
          font-size: 0.82rem; font-weight: 800; color: #a5b4fc;
          margin-bottom: 0.5rem; direction: rtl; text-align: right;
          font-family: 'Vazirmatn', sans-serif;
        }
        .products-query-count { font-size: 0.68rem; color: #94a3b8; font-weight: 600; }
        .products-list { display: flex; flex-direction: column; gap: 0.35rem; direction: rtl; }
        .product-item {
          display: flex; align-items: baseline; gap: 0.5rem;
          padding: 0.45rem 0.7rem;
          background: rgba(99, 102, 241, 0.05);
          border: 1px solid rgba(99, 102, 241, 0.15);
          border-radius: 0.5rem;
          font-family: 'Vazirmatn', sans-serif;
          font-size: 0.78rem; color: #cbd5e1;
          text-align: right; direction: rtl;
        }
        .product-item-index {
          color: #64748b; font-size: 0.68rem; font-weight: 700;
          flex-shrink: 0; font-variant-numeric: tabular-nums;
        }
        .product-item-title { flex: 1; line-height: 1.5; word-break: break-word; }
        .product-item-title b {
          color: #fbbf24 !important;
          font-weight: 900 !important;
          background: rgba(251, 191, 36, 0.2) !important;
          padding: 0 0.2rem !important;
          border-radius: 0.2rem !important;
        }
        .products-empty {
          text-align: center; color: #94a3b8;
          padding: 2rem; font-family: 'Vazirmatn', sans-serif;
        }
        @media (max-width: 700px) {
          body { padding: 1rem 0.75rem; }
          th, td { padding: 0.6rem 0.7rem; font-size: 0.75rem; }
          .search-form { flex-direction: column; }
          .search-form button { width: 100%; }
          table { min-width: 700px; }
          .header { gap: 0.5rem; padding: 0.65rem 0.75rem; margin: -1rem -0.75rem 1rem; }
          .subtitle { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">
            <div class="logo-icon">📊</div>
            <div class="logo-text">
              <h1>Admin</h1>
              <span class="subtitle">پنل مدیریت جستجوها</span>
            </div>
          </div>
          <div class="header-actions">
            <span class="admin-datetime" id="admin-datetime">
              <span id="admin-date">—</span>
              <span id="admin-time">—</span>
            </span>
            <button class="btn btn-theme" id="theme-btn">🌙</button>
            <a href="/admin/logout" class="btn btn-logout">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              خروج
            </a>
          </div>
        </div>

        <div class="stats">
          <div class="stat-card cities">
            <h3>🏙️ پرجستجوترین شهرها</h3>
            <ul class="stat-list">
              ${citiesHtml || '<li class="empty-list">داده‌ای نیست</li>'}
            </ul>
          </div>
          <div class="stat-card days">
            <h3>🔍 جستجوها ۷ روز اخیر</h3>
            <ul class="stat-list">
              ${daysHtml || '<li class="empty-list">داده‌ای نیست</li>'}
            </ul>
          </div>
          <div class="stat-card visits-days">
            <h3>👁️ بازدیدها ۷ روز اخیر</h3>
            <ul class="stat-list">
              ${visits7DaysHtml || '<li class="empty-list">داده‌ای نیست</li>'}
            </ul>
          </div>
          <div class="stat-card visits">
            <h3>👁️ بازدید صفحات</h3>
            <div class="visits-row">
              <div class="visit-block">
                <div class="visit-number" id="visit-total" data-total="${visitStats.total}">${visitStats.total}</div>
                <div class="visit-label">کل</div>
              </div>
              <div class="visit-block">
                <div class="visit-number visit-number-today">${visitStats.today}</div>
                <div class="visit-label">امروز</div>
              </div>
            </div>
            ${
              visitStats.since
                ? `<div class="visits-since">آمارگیری از ${new Date(visitStats.since).toLocaleDateString("fa-IR-u-ca-persian", { year: "numeric", month: "long", day: "numeric" })}</div>`
                : ""
            }
            ${
              visitStats.recent && visitStats.recent.length > 0
                ? `
                  <div class="recent-visits">
                    <div class="recent-visits-title">آخرین بازدیدها</div>
                    ${visitStats.recent
                      .map((v) => {
                        const timeStr = new Date(v.timestamp).toLocaleString(
                          "fa-IR",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          },
                        );
                        const dateStr = new Date(
                          v.timestamp,
                        ).toLocaleDateString("fa-IR-u-ca-persian", {
                          month: "2-digit",
                          day: "2-digit",
                        });
                        const loc = v.city ? escapeHtml(v.city) : "نامشخص";
                        return `
                          <div class="recent-visit-row">
                            <span class="rv-time">${dateStr} · ${timeStr}</span>
                            <span class="rv-loc">📍 ${loc}</span>
                            <code class="rv-ip">${escapeHtml(v.ip || "—")}</code>
                          </div>
                        `;
                      })
                      .join("")}
                  </div>
                `
                : ""
            }
          </div>
        </div>

        <form class="search-form" method="GET" action="/admin">
          <input type="text" name="search" placeholder="جستجو در آیتم‌ها، شهر یا IP..." value="${escapeHtml(search)}" />
          <button type="submit">🔍 جستجو</button>
        </form>

        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>زمان</th>
                <th>موقعیت</th>
                <th>IP</th>
                <th>کیفیت</th>
                <th>آیتم‌های جستجو</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="5" class="empty">هیچ لاگی ثبت نشده</td></tr>'}
            </tbody>
          </table>
        </div>

        <div class="limit-info">نمایش ${logs.length} از ${total} رکورد</div>
      </div>

      <!-- مودال محصولات -->
      <div id="products-modal" class="quality-modal hidden">
        <div class="quality-modal-backdrop"></div>
        <div class="quality-modal-content">
          <div class="quality-modal-header">
            <div class="quality-modal-title">
              <span>📦</span>
              <div>
                <div>محصولات پیدا شده</div>
                <div class="quality-modal-subtitle" id="products-modal-subtitle"></div>
              </div>
            </div>
            <button class="quality-modal-close" type="button">✕</button>
          </div>
          <div class="quality-modal-body" id="products-modal-body"></div>
        </div>
      </div>

      <!-- مودال کیفیت -->
      <div id="quality-modal" class="quality-modal hidden">
        <div class="quality-modal-backdrop"></div>
        <div class="quality-modal-content">
          <div class="quality-modal-header">
            <div class="quality-modal-title">
              <span>🔍</span>
              <div>
                <div>وضعیت فروشگاه‌ها</div>
                <div class="quality-modal-subtitle" id="quality-modal-subtitle"></div>
              </div>
            </div>
            <button class="quality-modal-close" type="button">✕</button>
          </div>
          <div class="quality-modal-body" id="quality-modal-body"></div>
        </div>
      </div>
    
      <script>
        // ═══════════════════════════════════════════════════════════
        // 🎯 GLOBAL: escapeHtml + highlightQuery
        // ═══════════════════════════════════════════════════════════
        window.escapeHtml = window.escapeHtml || function(s) {
          if (!s) return "";
          return String(s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        };

        // ─── highlightQuery (mark-based) ───
        window.highlightQuery = function(title, queryWords) {
          if (!title) return "";
          if (!queryWords || queryWords.length === 0) return window.escapeHtml(title);

          var titleLen = title.length;
          var marks = [];
          var i, j, k;
          for (i = 0; i < titleLen; i++) marks.push(false);

          function nch(ch) {
            var c = ch.charCodeAt(0);
            if (c === 0x200B || c === 0x200C || c === 0x200D) return "";
            if (c === 0x200E || c === 0x200F) return "";
            if (c === 0xFEFF) return "";
            if (c === 0x0640) return "";
            if (c >= 0x064B && c <= 0x065F) return "";
            if (c === 0x0670) return "";
            if (c === 0x064A || c === 0x0649 || c === 0x06D2) return "ی";
            if (c === 0x0643 || c === 0x06AA || c === 0x06AB) return "ک";
            if (c === 0x0629 || c === 0x06C0 || c === 0x06C1 || c === 0x06D5) return "ه";
            if (c === 0x0622 || c === 0x0623 || c === 0x0625) return "ا";
            if (c === 0x0624) return "و";
            if (c === 0x0626) return "ی";
            var pd = "۰۱۲۳۴۵۶۷۸۹";
            var ad = "٠١٢٣٤٥٦٧٨٩";
            var pdi = pd.indexOf(ch);
            if (pdi !== -1) return String(pdi);
            var adi = ad.indexOf(ch);
            if (adi !== -1) return String(adi);
            return ch.toLowerCase();
          }

          function nstr(s) {
            var r = "";
            for (var x = 0; x < s.length; x++) r += nch(s[x]);
            return r;
          }

          var nTitle = "";
          var pMap = [];
          for (i = 0; i < titleLen; i++) {
            var nc = nch(title[i]);
            for (j = 0; j < nc.length; j++) {
              nTitle += nc[j];
              pMap.push(i);
            }
          }

          function markRange(from, len) {
            if (len <= 0) return;
            var s = pMap[from];
            var e = pMap[from + len - 1];
            if (s === undefined || e === undefined) return;
            for (var x = s; x <= e; x++) {
              if (x >= 0 && x < titleLen) marks[x] = true;
            }
          }

          // مرحله ۱: جستجوی مستقیم
          for (var w = 0; w < queryWords.length; w++) {
            var qw = String(queryWords[w] || "").trim();
            if (!qw) continue;
            var nqw = nstr(qw);
            if (!nqw) continue;
            if (nqw.length < 2 && !/^[0-9]$/.test(nqw)) continue;

            var from = 0;
            while (true) {
              var idx = nTitle.indexOf(nqw, from);
              if (idx === -1) break;
              markRange(idx, nqw.length);
              from = idx + nqw.length;
            }
          }

          // مرحله ۲: جستجوی ترکیبی (قلمو → قلم + مو)
          for (var w2 = 0; w2 < queryWords.length; w2++) {
            var qw2 = String(queryWords[w2] || "").trim();
            if (!qw2) continue;
            var nqw2 = nstr(qw2);
            if (nqw2.length < 4) continue;
            if (nTitle.indexOf(nqw2) !== -1) continue;

            for (var sp = 2; sp <= nqw2.length - 2; sp++) {
              var p1 = nqw2.substring(0, sp);
              var p2 = nqw2.substring(sp);
              if (!p1 || !p2) continue;

              var f1 = 0;
              while (true) {
                var i1 = nTitle.indexOf(p1, f1);
                if (i1 === -1) break;

                var j1 = i1 + p1.length;
                while (j1 < nTitle.length && /\s/.test(nTitle[j1])) j1++;

                if (nTitle.substring(j1, j1 + p2.length) === p2) {
                  var s1 = pMap[i1];
                  var e1 = pMap[j1 + p2.length - 1];
                  for (var m = s1; m <= e1; m++) {
                    if (m >= 0 && m < titleLen) marks[m] = true;
                  }
                }

                f1 = i1 + p1.length;
              }
            }
          }

          var html = "";
          var inBold = false;
          for (i = 0; i < titleLen; i++) {
            if (marks[i] && !inBold) {
              html += "<b>";
              inBold = true;
            } else if (!marks[i] && inBold) {
              html += "</b>";
              inBold = false;
            }
            html += window.escapeHtml(title[i]);
          }
          if (inBold) html += "</b>";

          return html;
        };

        // ═══════════════════════════════════════════════════════════
        // 🎯 ADMIN PANEL INIT
        // ═══════════════════════════════════════════════════════════
        (function() {
          const btn = document.getElementById('theme-btn');
          const saved = localStorage.getItem('adminTheme');
          const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
          applyTheme(saved || (prefers ? 'dark' : 'light'));
          function applyTheme(t) {
            document.documentElement.setAttribute('data-theme', t);
            btn.textContent = t === 'dark' ? '☀️' : '🌙';
            localStorage.setItem('adminTheme', t);
          }
          btn.addEventListener('click', () => {
            const c = document.documentElement.getAttribute('data-theme') || 'light';
            applyTheme(c === 'dark' ? 'light' : 'dark');
          });

          // ─── Datetime ───
          function updateAdminDateTime() {
            const now = new Date();
            try {
              const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
                weekday: "long", year: "numeric", month: "long", day: "numeric",
              }).formatToParts(now);
              const get = (t) => parts.find((p) => p.type === t)?.value || "";
              const dateStr = get("weekday") + " " + get("day") + " " + get("month") + " " + get("year");
              const timeStr = new Intl.DateTimeFormat("fa-IR", {
                hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
              }).format(now);
              const dateEl = document.getElementById("admin-date");
              const timeEl = document.getElementById("admin-time");
              if (dateEl) dateEl.textContent = dateStr;
              if (timeEl) timeEl.textContent = timeStr;
            } catch (e) {}
          }
          updateAdminDateTime();
          setInterval(updateAdminDateTime, 1000);

          // ─── Toast بازدید ───
          (function() {
            const el = document.getElementById("visit-total");
            if (!el) return;
            const total = parseInt(el.dataset.total || "0", 10);
            const LAST_KEY = "adminLastSeenVisitTotal";
            const lastSeen = parseInt(localStorage.getItem(LAST_KEY) || "0", 10);

            if (lastSeen > 0 && total > lastSeen) {
              const diff = total - lastSeen;
              const toast = document.createElement("div");
              toast.className = "visits-toast";
              toast.innerHTML =
                '<span class="visits-toast-icon">👁️</span>' +
                '<span>' + diff + ' بازدید جدید از آخرین بار</span>';
              document.body.appendChild(toast);

              setTimeout(function() { toast.classList.add("visible"); }, 300);
              setTimeout(function() {
                toast.classList.remove("visible");
                setTimeout(function() { toast.remove(); }, 500);
              }, 5500);
            }

            localStorage.setItem(LAST_KEY, String(total));
          })();

          // ─── کلیک روی کیفیت ───
          document.addEventListener("click", async (e) => {
            const qualityBtn = e.target.closest(".quality-badge-btn");
            if (!qualityBtn) return;
            e.preventDefault();
            const logId = qualityBtn.dataset.logId;
            if (!logId) return;

            const modal = document.getElementById("quality-modal");
            const body = document.getElementById("quality-modal-body");
            const subtitle = document.getElementById("quality-modal-subtitle");

            body.innerHTML = '<div class="quality-modal-loading">در حال بارگذاری...</div>';
            subtitle.textContent = "";
            modal.classList.remove("hidden");

            try {
              const r = await fetch("/admin/log-status/" + logId);
              const data = await r.json();
              if (!data.success) throw new Error("failed");

              const statuses = data.statuses || [];
              if (statuses.length === 0) {
                body.innerHTML = '<div class="quality-modal-empty">اطلاعاتی ثبت نشده</div>';
                return;
              }

              const storeCount = statuses.filter(function(s) {
                return s.status !== "QRY";
              }).length;
              subtitle.textContent = storeCount + " فروشگاه · log #" + logId;

              let html = "";
              for (let i = 0; i < statuses.length; i++) {
                const s = statuses[i];
                const time = new Date(s.at).toLocaleTimeString("en-GB", { hour12: false });
                const isQuery = s.status === "QRY";

                if (isQuery) {
                  const progress = s.progress ? s.progress : "";
                  html += '<div class="quality-modal-line qry-line">';
                  html += '<span class="qml-time">[' + time + ']</span>';
                  html += '<span class="qml-status qml-status-qry">[QRY]</span>';
                  html += '<span class="qml-msg">' + progress + window.escapeHtml(s.message) + '</span>';
                  html += '</div>';
                } else {
                  const statusLower = String(s.status).toLowerCase();
                  html += '<div class="quality-modal-line">';
                  html += '<span class="qml-time">[' + time + ']</span>';
                  html += '<span class="qml-status qml-status-' + statusLower + '">[' + s.status + ']</span>';
                  html += '<span class="qml-store">' + window.escapeHtml(s.store || "") + ':</span>';
                  html += '<span class="qml-msg">' + window.escapeHtml(s.message) + '</span>';
                  html += '</div>';
                }
              }
              body.innerHTML = html;
            } catch (err) {
              body.innerHTML = '<div class="quality-modal-empty">خطا در بارگذاری</div>';
            }
          });

          // ─── کلیک روی "✅ X فروشگاه" ───
          document.addEventListener("click", async (e) => {
            const statsBtn = e.target.closest(".stats-btn-stores");
            if (!statsBtn) return;
            e.preventDefault();
            const logId = statsBtn.dataset.logId;
            if (!logId) return;

            const modal = document.getElementById("products-modal");
            const body = document.getElementById("products-modal-body");
            const subtitle = document.getElementById("products-modal-subtitle");

            body.innerHTML = '<div class="quality-modal-loading">در حال بارگذاری...</div>';
            subtitle.textContent = "";
            modal.classList.remove("hidden");

            try {
              const r = await fetch("/admin/log-products/" + logId);
              const data = await r.json();
              if (!data.success) throw new Error("failed");

              const qp = data.queryProducts || [];
              if (qp.length === 0) {
                body.innerHTML = '<div class="products-empty">محصولی پیدا نشده</div>';
                return;
              }

              let totalCount = 0;
              for (let i = 0; i < qp.length; i++) {
                totalCount += (qp[i].products || []).length;
              }
              subtitle.textContent = totalCount + " محصول در " + qp.length + " جستجو · log #" + logId;

              let html = "";
              for (let i = 0; i < qp.length; i++) {
                const group = qp[i];
                const query = group.query || "";
                const products = group.products || [];
                const queryWords = query.split(/\s+/).filter(function(w) { return w.length >= 1; });

                html += '<div class="products-query-group">';
                html += '<div class="products-query-header">';
                html += '<span>🔍 "' + window.escapeHtml(query) + '"</span>';
                html += '<span class="products-query-count">(' + products.length + ' محصول)</span>';
                html += '</div>';

                if (products.length === 0) {
                  html += '<div class="products-empty" style="padding:0.5rem;">محصولی پیدا نشد</div>';
                } else {
                  html += '<div class="products-list">';
                  for (let j = 0; j < products.length; j++) {
                    const product = products[j];
                    const highlighted = (typeof product === "object" && product.html)
                      ? product.html
                      : window.escapeHtml(typeof product === "string" ? product : (product.title || ""));
                    html += '<div class="product-item">';
                    html += '<span class="product-item-index">' + (j + 1) + '.</span>';
                    html += '<span class="product-item-title">' + highlighted + '</span>';
                    html += '</div>';
                  }
                  html += '</div>';
                }
                html += '</div>';
              }
              body.innerHTML = html;
            } catch (err) {
              body.innerHTML = '<div class="products-empty">خطا در بارگذاری</div>';
            }
          });

          // ─── بستن مودال محصولات ───
          document.addEventListener("click", (e) => {
            const modal = document.getElementById("products-modal");
            if (!modal || modal.classList.contains("hidden")) return;
            if (e.target.closest(".quality-modal-close") || e.target.classList.contains("quality-modal-backdrop")) {
              modal.classList.add("hidden");
            }
          });

          // ─── بستن مودال کیفیت ───
          document.addEventListener("click", (e) => {
            const modal = document.getElementById("quality-modal");
            if (!modal || modal.classList.contains("hidden")) return;
            if (e.target.closest(".quality-modal-close") || e.target.classList.contains("quality-modal-backdrop")) {
              modal.classList.add("hidden");
            }
          });

          // ─── نوار چسبان ───
          const header = document.querySelector('.header');
          if (header) {
            let ticking = false;
            const updateStuck = () => {
              const rect = header.getBoundingClientRect();
              header.classList.toggle('stuck', rect.top <= 0 && window.scrollY > 10);
              ticking = false;
            };
            window.addEventListener('scroll', () => {
              if (!ticking) {
                window.requestAnimationFrame(updateStuck);
                ticking = true;
              }
            }, { passive: true });
            updateStuck();
          }
        })();
      </script>
    </body>
    </html>
  `;
}

app.post(
  "/admin/login",
  express.urlencoded({ extended: false }),
  (req, res) => {
    const password = String(req.body?.password || "");
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).send(renderLoginPage("Wrong password"));
    }
    res.setHeader(
      "Set-Cookie",
      `${ADMIN_COOKIE}=${encodeURIComponent(ADMIN_PASSWORD)}; Path=/; Max-Age=${7 * 24 * 3600}; HttpOnly; SameSite=Lax${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }`,
    );
    res.redirect("/admin");
  },
);

app.get("/admin/logout", (req, res) => {
  res.setHeader(
    "Set-Cookie",
    `${ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
  );
  res.redirect("/admin");
});

app.get("/admin", async (req, res) => {
  if (!db) return res.status(500).send("<h1>Database not available</h1>");

  const queryPassword = String(req.query.password || "");
  if (queryPassword === ADMIN_PASSWORD) {
    res.setHeader(
      "Set-Cookie",
      `${ADMIN_COOKIE}=${encodeURIComponent(ADMIN_PASSWORD)}; Path=/; Max-Age=${7 * 24 * 3600}; HttpOnly; SameSite=Lax${
        process.env.NODE_ENV === "production" ? "; Secure" : ""
      }`,
    );
    return res.redirect("/admin");
  }

  if (isAuthed(req)) {
    try {
      const html = await renderAdminPage(req);
      return res.send(html);
    } catch (e) {
      console.error("[admin] render error:", e.message);
      return res.status(500).send("<h1>Error loading admin page</h1>");
    }
  }

  res.send(renderLoginPage());
});

app.get("/admin/logs", (req, res) => res.redirect("/admin"));

app.get("/admin/log-status/:id", async (req, res) => {
  if (!db) return res.json({ success: false });
  if (!isAuthed(req)) return res.status(401).json({ success: false });

  const logId = parseInt(req.params.id, 10);
  if (!logId) return res.json({ success: false, error: "invalid id" });

  try {
    const [rows] = await db.query(
      `SELECT stores_status FROM search_logs WHERE id = ?`,
      [logId],
    );
    if (rows.length === 0)
      return res.json({ success: false, error: "not found" });

    let statuses = [];
    try {
      statuses = JSON.parse(rows[0].stores_status || "[]");
    } catch {}
    res.json({ success: true, statuses });
  } catch (e) {
    console.error("[admin] log-status error:", e.message);
    res.json({ success: false, error: e.message });
  }
});

app.get("/admin/log-products/:id", async (req, res) => {
  if (!db) return res.json({ success: false });
  if (!isAuthed(req)) return res.status(401).json({ success: false });

  const logId = parseInt(req.params.id, 10);
  if (!logId) return res.json({ success: false, error: "invalid id" });

  try {
    const [rows] = await db.query(
      `SELECT query_products, items FROM search_logs WHERE id = ?`,
      [logId],
    );
    if (rows.length === 0)
      return res.json({ success: false, error: "not found" });

    let queryProducts = [];
    try {
      queryProducts = JSON.parse(rows[0].query_products || "[]");
    } catch {}

    let items = [];
    try {
      items = JSON.parse(rows[0].items || "[]");
    } catch {}

    if (queryProducts.length === 0 && items.length > 0) {
      queryProducts = items.map((q) => ({ query: q, products: [] }));
    }

    // ─── highlight تو سرور ───
    const highlighted = queryProducts.map((group) => {
      const qWords = String(group.query || "")
        .split(/\s+/)
        .filter((w) => w.length >= 1);
      return {
        query: group.query,
        products: (group.products || []).map((title) => ({
          title: String(title),
          html: serverHighlight(String(title), qWords),
        })),
      };
    });

    res.json({ success: true, queryProducts: highlighted });
  } catch (e) {
    console.error("[admin] log-products error:", e.message);
    res.json({ success: false, error: e.message });
  }
});

// ================================================================
// HELPERS — گالری
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
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
    const isBad = (url) => {
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
          if (!n || isBad(n) || seen.has(n)) return;
          seen.add(n);
          arr.push(n);
        },
      };
    };

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
            if (!n || isBad(n)) continue;
            if (isThumbPath(n)) wooThumb.push(n);
            else wooMain.push(n);
          }
        });
    }

    if (wooMain.arr.length >= 2) return wooMain.arr.slice(0, 20);

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
        if (!n || isBad(n)) continue;
        if (isThumbPath(n)) genericThumb.push(n);
        else genericMain.push(n);
      }
    });

    if (wooMain.arr.length === 1 && genericMain.arr.length > 0)
      return wooMain.arr;
    if (genericMain.arr.length >= 1) return genericMain.arr.slice(0, 20);
    if (wooMain.arr.length >= 1) return wooMain.arr.slice(0, 20);
    if (genericThumb.arr.length >= 1) return genericThumb.arr.slice(0, 20);
    if (wooThumb.arr.length >= 1) return wooThumb.arr.slice(0, 20);

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
  } catch {
    return [];
  }
}

async function getProductGalleryInternal(productId, productUrl, store) {
  productId = String(productId || "").trim();
  productUrl = String(productUrl || "").trim();
  store = String(store || "").trim();
  if (!productId && !productUrl) return [];
  if (store.includes("ترب")) return [];

  if (productUrl) {
    try {
      let html = await fetchHtmlWithRetry(productUrl, [4000, 6000]);
      if (html) {
        const nextImages = extractFromNextData(html, productUrl);
        if (nextImages.length > 0) {
          html = null;
          return nextImages;
        }
        const scrapedImages = scrapeImagesFromHtml(html, productUrl);
        html = null;
        if (scrapedImages.length > 0) return scrapedImages;
      }
    } catch {}
  }

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
    res.json({ success: true, images });
  } catch (e) {
    console.error(`[gallery] ${store} error:`, e.message);
    res.json({ success: true, images: [] });
  }
});

app.post("/api/product-images-batch", async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    return res.status(400).json({ success: false, error: "empty" });
  }

  const map = {};
  const CONCURRENCY = 3;
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      const item = items[i];
      const { id, url, store } = item;
      const key = `${id || ""}|${url || ""}`;
      try {
        const images = await getProductGalleryInternal(id, url, store);
        map[key] = images;
      } catch {
        map[key] = [];
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker()),
  );

  res.json({ success: true, results: map });
});

// ================================================================
// START
// ================================================================
async function learnCorrectionsFromDB() {
  if (!db) return;
  try {
    const [rows] = await db.query(
      `SELECT items FROM search_logs
       WHERE quality_score IN ('excellent', 'good')
         AND timestamp >= DATE_SUB(NOW(), INTERVAL 90 DAY)
       LIMIT 500`,
    );
    let learned = 0;
    for (const row of rows) {
      try {
        const items = JSON.parse(row.items || "[]");
        learnFromItems(items);
        learned++;
      } catch {}
    }
    console.log(`[corrections] learned from ${learned} logs`);
  } catch (e) {
    console.error("[corrections] learn failed:", e.message);
  }
}

initDatabase().then(async () => {
  await learnCorrectionsFromDB();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[server] listening on port ${PORT}`);
    console.log(`[server] admin panel: /admin`);
  });
});
