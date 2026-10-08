const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const mysql = require("mysql2/promise");
const geoip = require("geoip-lite");
const { compareBasket } = require("./services/searcher");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ================================================================
// 🗄️ DATABASE — MySQL
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

    console.log("📂 دیتابیس MySQL آماده است");
  } catch (e) {
    console.error("⚠️ خطا در راه‌اندازی دیتابیس:", e.message);
    db = null;
  }
}

// ================================================================
// 📱 TELEGRAM
// ================================================================
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

async function sendTelegramNotification(logEntry) {
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
      {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown",
      },
      { timeout: 5000 },
    );
  } catch (e) {
    console.error("[telegram] خطا:", e.message);
  }
}

// ================================================================
// 🗺️ گرفتن موقعیت مکانی از IP
// ================================================================
async function getLocationFromIp(ip) {
  // IPهای داخلی/خصوصی
  if (
    !ip ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") ||
    ip.startsWith("172.2") ||
    ip.startsWith("172.30.") ||
    ip.startsWith("172.31.")
  ) {
    return { city: "", region: "", country: "" };
  }

  // تلاش ۱: ip-api.com
  try {
    const r = await axios.get(`http://ip-api.com/json/${ip}`, {
      timeout: 5000,
      params: { fields: "status,message,city,regionName,countryCode" },
    });
    if (r.data && r.data.status === "success") {
      console.log(
        `[geo] ${ip} → ${r.data.city || "?"}, ${r.data.regionName || "?"} (ip-api)`,
      );
      return {
        city: r.data.city || "",
        region: r.data.regionName || "",
        country: r.data.countryCode || "",
      };
    } else {
      console.log(
        `[geo] ${ip} → ip-api failed: ${r.data?.message || "unknown"}`,
      );
    }
  } catch (e) {
    console.log(`[geo] ${ip} → ip-api error: ${e.message}`);
  }

  // تلاش ۲: ipapi.co
  try {
    const r = await axios.get(`https://ipapi.co/${ip}/json/`, {
      timeout: 5000,
      headers: {
        "User-Agent": "smart-shopping/1.0",
        Accept: "application/json",
      },
    });
    if (r.data && !r.data.error) {
      console.log(
        `[geo] ${ip} → ${r.data.city || "?"}, ${r.data.region || "?"} (ipapi.co)`,
      );
      return {
        city: r.data.city || "",
        region: r.data.region || "",
        country: r.data.country_code || "",
      };
    } else {
      console.log(
        `[geo] ${ip} → ipapi.co failed: ${r.data?.reason || "unknown"}`,
      );
    }
  } catch (e) {
    console.log(`[geo] ${ip} → ipapi.co error: ${e.message}`);
  }

  console.log(`[geo] ${ip} → همه‌ی منابع شکست خوردن`);
  return { city: "", region: "", country: "" };
}

// ================================================================
// 📝 LOG
// ================================================================
async function logSearch(req, items) {
  if (!db) return;

  try {
    const rawIp =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket.remoteAddress ||
      "";
    const cleanIp = rawIp.replace(/^::ffff:/, "").replace(/^::1$/, "127.0.0.1");

    const location = await getLocationFromIp(cleanIp);
    const city = location.city;
    const region = location.region;
    const country = location.country;

    const logEntry = {
      timestamp: new Date().toISOString(),
      ip: cleanIp,
      city,
      region,
      country,
      items,
      userAgent: req.headers["user-agent"] || "",
    };

    db.query(
      `INSERT INTO search_logs (timestamp, ip, city, region, country, items, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        new Date(),
        logEntry.ip,
        logEntry.city,
        logEntry.region,
        logEntry.country,
        JSON.stringify(logEntry.items),
        logEntry.userAgent,
      ],
    ).catch((e) => console.error("[log] خطا در درج:", e.message));

    sendTelegramNotification(logEntry).catch(() => {});
  } catch (e) {
    console.error("[log] خطا در ثبت:", e.message);
  }
}

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
// API: ثبت لاگ (یک بار برای هر جستجو)
// ================================================================
app.post("/api/log-search", (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false });
  }
  logSearch(req, items);
  res.json({ success: true });
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

function renderLoginPage(errorMsg = "") {
  return `
    <!DOCTYPE html>
    <html lang="en" dir="ltr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
          --primary: #6366f1;
          --primary-dark: #4f46e5;
          --danger: #ef4444;
          --bg: #f8fafc;
          --surface: #ffffff;
          --border: #e2e8f0;
          --text: #1e293b;
          --text-muted: #64748b;
          --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        }
        :root[data-theme="dark"] {
          --primary: #818cf8;
          --primary-dark: #6366f1;
          --danger: #f87171;
          --bg: #0f172a;
          --surface: #1e293b;
          --border: #334155;
          --text: #f1f5f9;
          --text-muted: #94a3b8;
          --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.2);
        }
        body {
          font-family: "Inter", system-ui, -apple-system, sans-serif;
          background: linear-gradient(135deg, #f0f4ff 0%, #f8fafc 100%);
          color: var(--text);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1rem;
          transition: background 0.3s ease;
        }
        :root[data-theme="dark"] body {
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        }
        .theme-btn {
          position: fixed;
          top: 1.5rem;
          right: 1.5rem;
          width: 3rem;
          height: 3rem;
          border-radius: 50%;
          background: var(--surface);
          border: 2px solid var(--border);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          transition: all 0.3s ease;
          box-shadow: var(--shadow);
          padding: 0;
        }
        .theme-btn:hover {
          transform: rotate(20deg) scale(1.1);
          border-color: var(--primary);
        }
        .card {
          background: var(--surface);
          padding: 2.5rem 2rem;
          border-radius: 1.5rem;
          box-shadow: var(--shadow);
          width: 100%;
          max-width: 380px;
          text-align: center;
          border: 1.5px solid var(--border);
          position: relative;
          overflow: hidden;
        }
        .card::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, #6366f1 0%, #8b5cf6 35%, #ec4899 65%, #f59e0b 100%);
        }
        .icon {
          width: 4rem;
          height: 4rem;
          margin: 0 auto 1rem;
          border-radius: 1rem;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.75rem;
          box-shadow: 0 8px 24px rgba(99, 102, 241, 0.35);
        }
        h1 {
          font-size: 1.4rem;
          font-weight: 800;
          margin: 0 0 1.75rem;
          color: var(--text);
          letter-spacing: -0.5px;
        }
        .field {
          position: relative;
          margin-bottom: 0.75rem;
        }
        input {
          width: 100%;
          padding: 0.9rem 1rem;
          border: 2px solid var(--border);
          border-radius: 0.75rem;
          font-family: inherit;
          font-size: 1rem;
          background: var(--bg);
          color: var(--text);
          transition: all 0.2s;
          text-align: left;
          direction: ltr;
        }
        input::placeholder {
          color: var(--text-muted);
          opacity: 0.7;
        }
        input:focus {
          outline: none;
          border-color: var(--primary);
          background: var(--surface);
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
        }
        button {
          width: 100%;
          padding: 0.9rem;
          background: linear-gradient(135deg, #a5b4fc 0%, #818cf8 55%, #6366f1 100%);
          color: white;
          border: none;
          border-radius: 0.75rem;
          font-family: inherit;
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 14px rgba(129, 140, 248, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25);
          letter-spacing: 0.5px;
        }
        button:hover {
          transform: translateY(-2px);
          background: linear-gradient(135deg, #c7d2fe 0%, #a5b4fc 55%, #818cf8 100%);
          box-shadow: 0 8px 24px rgba(129, 140, 248, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.35);
        }
        .error {
          color: var(--danger);
          font-size: 0.85rem;
          margin-bottom: 0.75rem;
          min-height: 1.2rem;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <button class="theme-btn" id="theme-btn" aria-label="Toggle theme">🌙</button>
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
          const themeBtn = document.getElementById('theme-btn');
          const saved = localStorage.getItem('adminTheme');
          const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
          const initial = saved || (prefers ? 'dark' : 'light');
          applyTheme(initial);
          function applyTheme(t) {
            document.documentElement.setAttribute('data-theme', t);
            themeBtn.textContent = t === 'dark' ? '☀️' : '🌙';
            localStorage.setItem('adminTheme', t);
          }
          themeBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'light';
            applyTheme(current === 'dark' ? 'light' : 'dark');
          });
        })();
      </script>
    </body>
    </html>
  `;
}

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

  const [topCities] = await db.query(
    `SELECT city, COUNT(*) as c FROM search_logs
     WHERE city != '' GROUP BY city ORDER BY c DESC LIMIT 10`,
  );

  const [last7Days] = await db.query(
    `SELECT DATE(timestamp) as day, COUNT(*) as c FROM search_logs
     WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     GROUP BY day ORDER BY day DESC`,
  );

  const rowsHtml = logs
    .map((log) => {
      let itemsArr = [];
      try {
        itemsArr = JSON.parse(log.items);
      } catch {}
      const itemsStr = itemsArr
        .map((i) => `<span class="item-tag">${escapeHtml(i)}</span>`)
        .join("");
      const timeStr = new Date(log.timestamp).toLocaleString("fa-IR");
      // فیلتر: اگه region عددی بود، نشون نده
      const regionDisplay =
        log.region && !/^\d+$/.test(String(log.region).trim())
          ? log.region
          : "";
      const locationStr = log.city
        ? `<span class="location">📍 ${escapeHtml(log.city)}${regionDisplay ? "، " + escapeHtml(regionDisplay) : ""}</span>`
        : '<span class="location empty-loc">نامشخص</span>';
      return `
        <tr>
          <td class="time">${timeStr}</td>
          <td>${locationStr}</td>
          <td class="ip"><code>${escapeHtml(log.ip)}</code></td>
          <td class="items">${itemsStr}</td>
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

  return `
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&family=Inter:wght@500;700;800&display=swap" rel="stylesheet">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
          --primary: #6366f1;
          --primary-dark: #4f46e5;
          --primary-light: #a5b4fc;
          --success: #10b981;
          --warning: #f59e0b;
          --danger: #ef4444;
          --bg: #f8fafc;
          --surface: #ffffff;
          --border: #e2e8f0;
          --text: #1e293b;
          --text-muted: #64748b;
          --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        }
        :root[data-theme="dark"] {
          --primary: #818cf8;
          --primary-dark: #6366f1;
          --primary-light: #4f46e5;
          --success: #34d399;
          --warning: #fbbf24;
          --danger: #f87171;
          --bg: #0f172a;
          --surface: #1e293b;
          --border: #334155;
          --text: #f1f5f9;
          --text-muted: #94a3b8;
          --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.2);
        }
        body {
          font-family: "Vazirmatn", system-ui, -apple-system, sans-serif;
          background: linear-gradient(135deg, #f0f4ff 0%, #f8fafc 100%);
          color: var(--text);
          min-height: 100vh;
          padding: 1.5rem 1rem;
          transition: background 0.3s ease;
        }
        :root[data-theme="dark"] body {
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          gap: 0.75rem;
        }
        .logo { display: inline-flex; align-items: center; gap: 0.75rem; }
        .logo-icon {
          width: 2.75rem;
          height: 2.75rem;
          border-radius: 0.75rem;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          box-shadow: 0 6px 18px rgba(99, 102, 241, 0.35);
        }
        .logo-text { display: flex; flex-direction: column; }
        h1 {
          font-family: "Inter", "Vazirmatn", sans-serif;
          font-size: 1.3rem;
          font-weight: 800;
          color: var(--text);
          line-height: 1.2;
          letter-spacing: -0.5px;
        }
        .subtitle { font-size: 0.72rem; color: var(--text-muted); font-weight: 500; }
        .header-actions { display: flex; gap: 0.5rem; }
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          padding: 0.6rem 1rem;
          border-radius: 0.65rem;
          font-family: inherit;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1.5px solid;
          text-decoration: none;
        }
        .btn-theme {
          background: var(--surface);
          border-color: var(--border);
          color: var(--text);
          font-size: 1.05rem;
          width: 2.5rem;
          height: 2.5rem;
          padding: 0;
        }
        .btn-theme:hover {
          border-color: var(--primary);
          transform: rotate(20deg) scale(1.08);
        }
        .btn-logout {
          background: var(--surface);
          border-color: rgba(239, 68, 68, 0.3);
          color: var(--danger);
        }
        .btn-logout:hover {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          border-color: #ef4444;
          color: white;
          box-shadow: 0 4px 14px rgba(239, 68, 68, 0.35);
          transform: translateY(-1px);
        }
        .stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .stat-card {
          background: var(--surface);
          padding: 1.25rem;
          border-radius: 1.25rem;
          box-shadow: var(--shadow);
          border: 1.5px solid var(--border);
          position: relative;
          overflow: hidden;
        }
        .stat-card::before {
          content: "";
          position: absolute;
          top: 0;
          right: 0;
          width: 3px;
          height: 100%;
          background: var(--primary);
          border-radius: 0 1.25rem 1.25rem 0;
        }
        .stat-card.cities::before { background: linear-gradient(180deg, #6366f1, #8b5cf6); }
        .stat-card.days::before { background: linear-gradient(180deg, #10b981, #059669); }
        .stat-card h3 {
          font-size: 0.85rem;
          font-weight: 800;
          color: var(--text-muted);
          margin-bottom: 0.85rem;
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .stat-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .stat-list li {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          font-size: 0.83rem;
          padding: 0.4rem 0.65rem;
          background: var(--bg);
          border-radius: 0.5rem;
          transition: all 0.2s;
        }
        .stat-list li:hover { background: var(--border); }
        .stat-list strong { font-weight: 700; color: var(--text); }
        .count-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 1.75rem;
          height: 1.5rem;
          padding: 0 0.5rem;
          background: linear-gradient(135deg, var(--primary), var(--primary-dark));
          color: white;
          border-radius: 1rem;
          font-size: 0.72rem;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }
        .empty-list {
          color: var(--text-muted);
          font-size: 0.8rem;
          text-align: center;
          padding: 1.5rem;
          font-style: italic;
        }
        .search-form {
          background: var(--surface);
          padding: 0.75rem;
          border-radius: 1rem;
          margin-bottom: 1rem;
          box-shadow: var(--shadow);
          border: 1.5px solid var(--border);
          display: flex;
          gap: 0.5rem;
        }
        .search-form input {
          flex: 1;
          padding: 0.7rem 1rem;
          border: 2px solid var(--border);
          border-radius: 0.65rem;
          font-family: inherit;
          font-size: 0.9rem;
          background: var(--bg);
          color: var(--text);
          transition: all 0.2s;
        }
        .search-form input:focus {
          outline: none;
          border-color: var(--primary);
          background: var(--surface);
          box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
        }
        .search-form button {
          padding: 0.7rem 1.35rem;
          background: linear-gradient(135deg, #a5b4fc 0%, #818cf8 55%, #6366f1 100%);
          color: white;
          border: none;
          border-radius: 0.65rem;
          font-family: inherit;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 14px rgba(129, 140, 248, 0.35);
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        }
        .search-form button:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(129, 140, 248, 0.5);
        }
        .table-wrapper {
          background: var(--surface);
          border-radius: 1.25rem;
          box-shadow: var(--shadow);
          border: 1.5px solid var(--border);
          overflow-x: auto;
          overflow-y: hidden;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
        }
        .table-wrapper::-webkit-scrollbar { height: 6px; }
        .table-wrapper::-webkit-scrollbar-track { background: transparent; }
        .table-wrapper::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 3px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 700px;
        }
        th {
          background: linear-gradient(135deg, #6366f1, #4f46e5);
          color: white;
          padding: 0.9rem 1rem;
          text-align: right;
          font-size: 0.82rem;
          font-weight: 700;
          white-space: nowrap;
        }
        td {
          padding: 0.8rem 1rem;
          border-bottom: 1px solid var(--border);
          font-size: 0.83rem;
          vertical-align: middle;
          color: var(--text);
        }
        tr:last-child td { border-bottom: none; }
        tbody tr { transition: background 0.2s; }
        tbody tr:hover { background: var(--bg); }
        .time {
          white-space: nowrap;
          color: var(--text-muted);
          font-size: 0.78rem;
          font-variant-numeric: tabular-nums;
        }
        .location {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.83rem;
          font-weight: 600;
        }
        .empty-loc {
          color: var(--text-muted);
          font-style: italic;
          font-weight: 500;
        }
        .ip code {
          background: var(--bg);
          padding: 0.25rem 0.55rem;
          border-radius: 0.4rem;
          font-size: 0.75rem;
          color: var(--primary);
          font-family: 'Courier New', monospace;
          font-weight: 600;
          border: 1px solid var(--border);
        }
        .item-tag {
          display: inline-block;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(139, 92, 246, 0.08));
          color: var(--primary);
          padding: 0.25rem 0.65rem;
          border-radius: 0.5rem;
          margin: 0.15rem;
          font-size: 0.78rem;
          font-weight: 600;
          border: 1px solid rgba(99, 102, 241, 0.2);
        }
        :root[data-theme="dark"] .item-tag {
          color: var(--primary-light);
          border-color: rgba(129, 140, 248, 0.3);
        }
        .empty {
          text-align: center;
          padding: 3rem;
          color: var(--text-muted);
          font-size: 0.9rem;
        }
        .limit-info {
          margin-top: 1rem;
          text-align: center;
          color: var(--text-muted);
          font-size: 0.8rem;
        }
        @media (max-width: 700px) {
          body { padding: 1rem 0.75rem; }
          .stats { grid-template-columns: 1fr; }
          .header { flex-direction: column; align-items: stretch; }
          .logo { justify-content: center; }
          .header-actions { justify-content: center; }
          th, td { padding: 0.6rem 0.7rem; font-size: 0.75rem; }
          .search-form { flex-direction: column; }
          .search-form button { width: 100%; }
          .ip code { font-size: 0.7rem; }
          .item-tag { font-size: 0.72rem; }
          table { min-width: 650px; }
          .table-wrapper { border-radius: 1rem; }
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
            <button class="btn btn-theme" id="theme-btn" aria-label="تغییر تم">🌙</button>
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
            <h3>📅 ۷ روز اخیر</h3>
            <ul class="stat-list">
              ${daysHtml || '<li class="empty-list">داده‌ای نیست</li>'}
            </ul>
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
                <th>آیتم‌های جستجو</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="4" class="empty">هیچ لاگی ثبت نشده</td></tr>'}
            </tbody>
          </table>
        </div>

        <div class="limit-info">
          نمایش ${logs.length} از ${total} رکورد
        </div>
      </div>

      <script>
        (function() {
          const themeBtn = document.getElementById('theme-btn');
          const saved = localStorage.getItem('adminTheme');
          const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
          const initial = saved || (prefers ? 'dark' : 'light');
          applyTheme(initial);
          function applyTheme(t) {
            document.documentElement.setAttribute('data-theme', t);
            themeBtn.textContent = t === 'dark' ? '☀️' : '🌙';
            localStorage.setItem('adminTheme', t);
          }
          themeBtn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'light';
            applyTheme(current === 'dark' ? 'light' : 'dark');
          });
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
  if (!db) {
    return res.status(500).send("<h1>Database not available</h1>");
  }

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
      console.error("admin render error:", e);
      return res.status(500).send("<h1>Error loading admin page</h1>");
    }
  }

  res.send(renderLoginPage());
});

app.get("/admin/logs", (req, res) => {
  res.redirect("/admin");
});

function escapeHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ================================================================
// API: نرخ دلار
// ================================================================
app.get("/api/dollar", async (req, res) => {
  try {
    const r = await axios.get("https://bitpin.ir/academy/live/currency/", {
      timeout: 8000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.8",
      },
      validateStatus: () => true,
    });

    if (r.status !== 200 || typeof r.data !== "string") {
      throw new Error(`HTTP ${r.status}`);
    }

    const html = r.data;
    const match = html.match(
      /data-price-symbol="USDIRT"[\s\S]*?data-price-value[^>]*>\s*([\d,،٬۰-۹]+)\s*</,
    );

    if (!match || !match[1]) {
      throw new Error("dollar rate not found in HTML");
    }

    const normalized = match[1]
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[,،٬]/g, "");

    const price = parseInt(normalized, 10);

    if (!price || price < 50000 || price > 1000000) {
      throw new Error(`invalid price: ${price}`);
    }

    res.json({ success: true, price });
  } catch (e) {
    console.error("[dollar] خطا:", e.message);
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

    if (wooMain.arr.length === 1 && genericMain.arr.length > 0) {
      return wooMain.arr;
    }
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
      const html = await fetchHtmlWithRetry(productUrl, [4000, 6000]);
      if (html) {
        const nextImages = extractFromNextData(html, productUrl);
        if (nextImages.length > 0) return nextImages;
        const scrapedImages = scrapeImagesFromHtml(html, productUrl);
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
    console.error(`[gallery] ${store} → error:`, e.message);
    res.json({ success: true, images: [] });
  }
});

app.post("/api/product-images-batch", async (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    return res.status(400).json({ success: false, error: "empty" });
  }
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
  for (const r of results) map[r.key] = r.images;
  res.json({ success: true, results: map });
});

// ================================================================
// START
// ================================================================
initDatabase().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 سرور روی پورت ${PORT} در حال اجراست`);
    console.log(`📊 پنل ادمین: /admin`);
  });
});
