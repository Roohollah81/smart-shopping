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

// ---------- افزودن آیتم ----------
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

// ---------- حذف آیتم ----------
function removeItem(index) {
  items.splice(index, 1);
  renderItems();
}

// ---------- رندر لیست آیتم‌ها ----------
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

// ---------- پاک کردن همه ----------
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
  const { stores, shoppingList, cheapest } = data;

  if (!stores || stores.length === 0) {
    showError('هیچ محصولی در فروشگاه‌های پشتیبانی‌شده یافت نشد.');
    return;
  }

  // بنر ارزان‌ترین
  if (cheapest) {
    cheapestBanner.innerHTML = `
      <div class="label">🎉 ارزان‌ترین سبد خرید</div>
      <div class="store-name">${escapeHtml(cheapest.storeName)}</div>
      <div class="total">${formatPrice(cheapest.total)} تومان</div>
    `;
  } else {
    cheapestBanner.innerHTML = '';
  }

  // کارت‌های فروشگاه
  storesContainer.innerHTML = stores
    .map((store) => {
      const medal = store.rank === 1 ? '🥇' : store.rank === 2 ? '🥈' : '🥉';

      const itemsHtml = store.items
        .map(
          (item) => `
        <div class="item-row">
          <div class="item-info">
            <div class="item-query">${escapeHtml(item.query)}</div>
            <div class="item-title">
              <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">
                ${escapeHtml(item.title)}
              </a>
            </div>
          </div>
          <div class="item-price">${formatPrice(item.price)} تومان</div>
        </div>
      `
        )
        .join('');

      const missingHtml =
        store.missing.length > 0
          ? `
        <div class="missing-items">
          <strong>❌ ناموجود در این فروشگاه:</strong>
          ${store.missing.map(escapeHtml).join('، ')}
        </div>
      `
          : '';

      return `
        <div class="store-card rank-${store.rank}">
          <div class="store-header">
            <div class="store-info">
              <span class="store-rank">${medal}</span>
              <div>
                <div class="store-name">${escapeHtml(store.storeName)}</div>
                <div class="store-coverage">پوشش: ${store.coverage}</div>
              </div>
            </div>
            <div class="store-total">
              <span class="label">مجموع سبد</span>
              <span class="amount">${formatPrice(store.total)} تومان</span>
            </div>
          </div>
          <div class="items-table">${itemsHtml}</div>
          ${missingHtml}
        </div>
      `;
    })
    .join('');

  resultsSection.classList.remove('hidden');
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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