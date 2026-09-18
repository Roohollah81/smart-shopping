const express = require('express');
const cors = require('cors');
const path = require('path');
const { compareBasket } = require('./services/searcher');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint برای مقایسه سبد خرید
app.post('/api/compare', async (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'لیست خرید نمی‌تواند خالی باشد.',
    });
  }

  if (items.length > 10) {
    return res.status(400).json({
      success: false,
      error: 'حداکثر ۱۰ آیتم در هر جستجو پشتیبانی می‌شود.',
    });
  }

  try {
    const result = await compareBasket(items);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('خطا در مقایسه سبد:', error);
    res.status(500).json({
      success: false,
      error: 'خطایی در سرور رخ داد. لطفاً دوباره تلاش کنید.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 سرور روی http://localhost:${PORT} در حال اجراست`);
});