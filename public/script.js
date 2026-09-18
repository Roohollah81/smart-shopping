const itemInput = document.getElementById('item-input');
const addBtn = document.getElementById('add-btn');
const searchBtn = document.getElementById('search-btn');
const searchBtnText = document.getElementById('search-btn-text');
const clearBtn = document.getElementById('clear-btn');
const itemsList = document.getElementById('items-list');
const resultsSection = document.getElementById('results-section');
const cheapestBanner = document.getElementById('cheapest-banner');
const storesContainer = document.getElementById('stores-container');
const errorBox = document.getElementById('error-box');
const spinner = document.getElementById('spinner');

let items = [];

// ---------- مدیریت آیتم‌ها ----------
function addItem() {
  const value = itemInput.value.trim();
  if (!value) return;
  if (items.includes(value)) {
    itemInput.value = '';
    return;
  }
  if (items.length >= 10) {
    showError('حداکثر ۱۰ آیتم قابل افزودن است.');
    return;
  }
  items.push(value);
  itemInput.value = '';
  itemInput.focus();
  renderItems();
}

function removeItem(index) {
  items.splice(index, 1);
  renderItems();
}

function renderItems() {
  itemsList.innerHTML = items
    .map(
      (item, i) => `
      <div class="item-chip">
        <span>${escapeHtml(item)}</span>
        <span class="remove" onclick="removeItem(${i})">✕</span>
      </div>
    `
    )
    .join('');
  searchBtn.disabled = items.length === 0;
}

function clearAll() {
  items = [];
  renderItems();
  resultsSection.classList.add('hidden');
  hideError();
}

// ---------- جستجو ----------
async function search() {
  if (items.length === 0) return;
  hideError();
  setLoading(true);

  try {
    const response = await fetch('/api/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    const data = await response.json();

    if (!data.success) {
      showError(data.error || 'خطایی رخ داد.');
      return;
    }
    renderResults(data.data);
  } catch (error) {
    showError('ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید.');
    console.error(error);
  } finally {
    setLoading(false);
  }
}

// ---------- نمایش نتایج ----------
function renderResults(data) {
  const { queries, basketComparison } = data;

  // ========== ۱. رندر بخش تحلیل هوشمند ==========
  renderAnalysisPanel(queries, basketComparison);

  // ========== ۲. بنر بهترین فروشگاه ==========
  if (basketComparison && basketComparison.length > 0) {
    const best = basketComparison[0];
    cheapestBanner.innerHTML = `
      <div class="label">🎉 ارزان‌ترین فروشگاه برای خرید همه اقلام</div>
      <div class="store-name">${escapeHtml(best.storeName)}</div>
      <div class="total">
        ${formatPrice(best.total)} تومان
        <span class="coverage">(${best.itemCount} از ${queries.length} قلم)</span>
      </div>
    `;
  } else {
    cheapestBanner.innerHTML = '';
  }

  // ========== ۳. رندر لیست کامل ==========
  let html = '';

  for (const { query, matches } of queries) {
    html += `
      <div class="query-group">
        <h3 class="query-title">🔍 ${escapeHtml(query)}</h3>
    `;

    if (matches.length === 0) {
      html += `<p class="no-match">هیچ محصولی یافت نشد.</p>`;
    } else {
      const comparable = matches.filter((m) => m.storeCount >= 2);
      const singleStore = matches.filter((m) => m.storeCount === 1);

      if (comparable.length > 0) {
        html += `<p class="match-hint">✅ ${comparable.length} محصول مشترک بین فروشگاه‌ها پیدا شد:</p>`;
        html += '<div class="matches-list">';
        for (const match of comparable) {
          html += renderMatch(match);
        }
        html += '</div>';
      }

      if (singleStore.length > 0) {
        html += `
          <details class="single-store-details">
            <summary>ℹ️ ${singleStore.length} محصول فقط در یک فروشگاه یافت شد</summary>
            <div class="matches-list">
              ${singleStore.map(renderMatch).join('')}
            </div>
          </details>
        `;
      }
    }

    html += `</div>`;
  }

  storesContainer.innerHTML = html;

  resultsSection.classList.remove('hidden');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- رندر پنل تحلیل هوشمند ----------
function renderAnalysisPanel(queries, basketComparison) {
  const panel = document.getElementById('analysis-content');

  // اگر هیچ نتیجه‌ای نبود
  if (!basketComparison || basketComparison.length === 0) {
    panel.innerHTML = `
      <div class="analysis-empty">
        ⚠️ هیچ نتیجه‌ای برای تحلیل یافت نشد.
      </div>
    `;
    return;
  }

  // ---------------------------------------------------------------
  // محاسبه شاخص‌های تحلیلی
  // ---------------------------------------------------------------
  const best = basketComparison[0];
  const totalItems = queries.length;

  // ارزان‌ترین پیشنهاد هر قلم (از هر فروشگاهی)
  const smartPickPerItem = queries.map(({ query, matches }) => {
    if (!matches || matches.length === 0) {
      return { query, best: null };
    }
    // بهترین تطبیق: بیشترین تعداد فروشگاه، سپس کمترین قیمت
    const sorted = [...matches]
      .filter((m) => m.cheapest && m.cheapest.price > 0)
      .sort((a, b) => {
        if (b.storeCount !== a.storeCount) return b.storeCount - a.storeCount;
        return a.cheapest.price - b.cheapest.price;
      });
    return { query, best: sorted[0] || null };
  });

  // مجموع «خرید هوشمند» (هر قلم از ارزان‌ترین فروشگاه خودش)
  const smartTotal = smartPickPerItem.reduce(
    (sum, item) => sum + (item.best ? item.best.cheapest.price : 0),
    0
  );
  const smartFoundCount = smartPickPerItem.filter((i) => i.best).length;

  // مقایسه با بهترین سبد تک‌فروشگاهی
  const singleStoreTotal = best.total;
  const savingsVsSingle = singleStoreTotal - smartTotal;
  const savingsPercent =
    singleStoreTotal > 0
      ? Math.round((savingsVsSingle / singleStoreTotal) * 100)
      : 0;

  // ---------------------------------------------------------------
  // ساخت HTML
  // ---------------------------------------------------------------
  const smartItemsHtml = smartPickPerItem
    .map(({ query, best }) => {
      if (!best) {
        return `
        <div class="smart-item smart-item-missing">
          <span class="smart-item-query">${escapeHtml(query)}</span>
          <span class="smart-item-status">❌ یافت نشد</span>
        </div>
      `;
      }
      return `
      <div class="smart-item">
        <div class="smart-item-info">
          <div class="smart-item-query">${escapeHtml(query)}</div>
          <div class="smart-item-title">${escapeHtml(best.cheapest.productTitle)}</div>
        </div>
        <div class="smart-item-store">
          <span class="store-tag">${escapeHtml(best.cheapest.storeName)}</span>
        </div>
        <div class="smart-item-price">${formatPrice(best.cheapest.price)} تومان</div>
      </div>
    `;
    })
    .join('');

  const comparisonHtml =
    savingsVsSingle > 0
      ? `
      <div class="analysis-comparison">
        <div class="comparison-row">
          <span class="comparison-label">💡 خرید همه از یک فروشگاه (${escapeHtml(best.storeName)})</span>
          <span class="comparison-value">${formatPrice(singleStoreTotal)} تومان</span>
        </div>
        <div class="comparison-row highlight">
          <span class="comparison-label">🧠 خرید هوشمند (هر قلم از بهترین فروشگاه)</span>
          <span class="comparison-value">${formatPrice(smartTotal)} تومان</span>
        </div>
        <div class="comparison-savings">
          💰 صرفه‌جویی با خرید هوشمند: 
          <strong>${formatPrice(savingsVsSingle)} تومان (${savingsPercent}٪)</strong>
        </div>
      </div>
    `
      : `
      <div class="analysis-comparison">
        <div class="comparison-row highlight">
          <span class="comparison-label">🧠 مجموع خرید هوشمند</span>
          <span class="comparison-value">${formatPrice(smartTotal)} تومان</span>
        </div>
        <div class="comparison-note">
          ℹ️ خرید همه اقلام از «${escapeHtml(best.storeName)}» در حال حاضر به‌صرفه‌تر است.
        </div>
      </div>
    `;

  panel.innerHTML = `
    <div class="analysis-conclusion">
      <div class="conclusion-icon">🏆</div>
      <div class="conclusion-text">
        <div class="conclusion-label">نتیجه تحلیل</div>
        <div class="conclusion-main">
          بهترین گزینه: <strong>${escapeHtml(best.storeName)}</strong>
          <span class="conclusion-coverage">(${best.itemCount} از ${totalItems} قلم)</span>
        </div>
        <div class="conclusion-total">${formatPrice(best.total)} تومان</div>
      </div>
    </div>

    <div class="analysis-section">
      <h4 class="analysis-subtitle">📦 پیشنهاد بهینه برای هر قلم</h4>
      <div class="smart-items-list">${smartItemsHtml}</div>
    </div>

    <div class="analysis-section">
      <h4 class="analysis-subtitle">📊 مقایسه استراتژی‌های خرید</h4>
      ${comparisonHtml}
    </div>

    <div class="analysis-disclaimer">
      ⚙️ این نتیجه بر اساس شباهت عنوان محصولات (الگوریتم Jaccard + وزن‌دهی مدل) و قیمت‌های لحظه‌ای فروشگاه‌ها محاسبه شده است.
      ممکن است برخی قیمت‌ها با صفحه واقعی محصول تفاوت جزئی داشته باشند.
    </div>
  `;
}

function renderMatch(match) {
  const offersHtml = match.offers
    .map(
      (offer, i) => `
      <div class="offer-row ${i === 0 ? 'best-offer' : ''}">
        <div class="offer-store">
          ${i === 0 ? '🏆 ' : ''}${escapeHtml(offer.storeName)}
        </div>
        <a class="offer-link" href="${escapeHtml(offer.link)}" target="_blank" rel="noopener">
          مشاهده
        </a>
        <div class="offer-price">${formatPrice(offer.price)} تومان</div>
      </div>
    `
    )
    .join('');

  const savingsHtml =
    match.savings > 0
      ? `
    <div class="savings-badge">
      صرفه‌جویی: ${formatPrice(match.savings)} تومان (${match.savingsPercent}٪)
    </div>
  `
      : '';

  return `
    <div class="match-card">
      <div class="match-name">${escapeHtml(match.productName)}</div>
      ${savingsHtml}
      <div class="offers-table">${offersHtml}</div>
    </div>
  `;
}

// ---------- توابع کمکی ----------
function setLoading(loading) {
  searchBtn.disabled = loading;
  spinner.classList.toggle('active', loading);
  searchBtnText.textContent = loading ? 'در حال جستجو...' : '🔍 جستجو و مقایسه';
}

function showError(message) {
  errorBox.textContent = '⚠️ ' + message;
  errorBox.classList.remove('hidden');
}

function hideError() {
  errorBox.classList.add('hidden');
}

function formatPrice(price) {
  return Number(price).toLocaleString('fa-IR');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ---------- رویدادها ----------
addBtn.addEventListener('click', addItem);
itemInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addItem();
});
searchBtn.addEventListener('click', search);
clearBtn.addEventListener('click', clearAll);

// ---------- مدیریت تم ----------
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = themeToggle.querySelector('.theme-icon');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) applyTheme(saved);
  else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

initTheme();