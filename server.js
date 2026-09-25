const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const { compareBasket } = require("./services/searcher");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// API endpoint برای مقایسه سبد خرید
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

app.get("/api/dollar", async (req, res) => {
  const sources = [
    async () => {
      const r = await axios.get("https://api.bitpin.ir/v1/mkt/markets/", {
        timeout: 6000,
      });
      const list = r.data?.results || [];
      const usdt = list.find((m) => /USDT_IRT|USDTIRT/i.test(m.code || ""));
      const p = parseFloat(usdt?.price);
      if (!p || p < 50000) throw new Error("bad");
      return Math.round(p);
    },
    async () => {
      const r = await axios.get("https://api.nobitex.ir/v2/orderbook/USDTIRT", {
        timeout: 6000,
      });
      const p = parseFloat(r.data?.lastTradePrice);
      if (!p || p < 500000) throw new Error("bad");
      return Math.round(p / 10);
    },
    async () => {
      const r = await axios.get("https://api.priceto.day/v1/latest/irr/usd", {
        timeout: 6000,
      });
      const v = parseFloat(r.data?.data?.USD || r.data?.USD || r.data?.value);
      if (!v || v < 500000) throw new Error("bad");
      return Math.round(v / 10);
    },
  ];
  for (const s of sources) {
    try {
      return res.json({ success: true, price: await s() });
    } catch {}
  }
  res.status(502).json({ success: false });
});

app.listen(PORT, () => {
  console.log(`🚀 سرور روی http://localhost:${PORT} در حال اجراست`);
});
