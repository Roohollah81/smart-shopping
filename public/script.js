// ================================================================
// public/script.js
// ================================================================

const itemInput = document.getElementById("item-input");
const addBtn = document.getElementById("add-btn");
const searchBtn = document.getElementById("search-btn");
const searchBtnText = document.getElementById("search-btn-text");
const clearBtn = document.getElementById("clear-btn");
const itemsList = document.getElementById("items-list");
const resultsSection = document.getElementById("results-section");
const storesContainer = document.getElementById("stores-container");
const errorBox = document.getElementById("error-box");
const spinner = document.getElementById("spinner");

let items = [];

// ================================================================
// مدیریت آیتم‌ها
// ================================================================
function addItem() {
  const value = itemInput.value.trim();
  if (!value) return;
  if (items.includes(value)) {
    itemInput.value = "";
    return;
  }
  if (items.length >= 10) {
    showError("حداکثر ۱۰ آیتم قابل افزودن است.");
    return;
  }
  items.push(value);
  itemInput.value = "";
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
    `,
    )
    .join("");
  searchBtn.disabled = items.length === 0;
}

function clearAll() {
  items = [];
  renderItems();
  resultsSection.classList.add("hidden");
  hideError();
}

// ================================================================
// جستجو
// ================================================================
async function search() {
  if (items.length === 0) return;
  hideError();
  setLoading(true);

  try {
    const response = await fetch("/api/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const data = await response.json();

    if (!data.success) {
      showError(data.error || "خطایی رخ داد.");
      return;
    }
    renderResults(data.data);
  } catch (error) {
    showError("ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید.");
    console.error(error);
  } finally {
    setLoading(false);
  }
}

// ================================================================
// نمایش نتایج
// ================================================================
function renderResults(data) {
  const { basketComparison } = data;

  if (!basketComparison || basketComparison.length === 0) {
    showError("هیچ نتیجه‌ای در فروشگاه‌های پشتیبانی‌شده یافت نشد.");
    resultsSection.classList.add("hidden");
    return;
  }

  const best = basketComparison[0];
  let html = renderStoreSection(best, true);

  const others = basketComparison.slice(1);
  if (others.length > 0) {
    html += `<h2 class="section-title others-title">فروشگاه های دیگر</h2>`;
    for (const store of others) {
      html += renderStoreSection(store, false);
    }
  }

  storesContainer.innerHTML = html;
  resultsSection.classList.remove("hidden");
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ================================================================
// رندر یک بخش فروشگاه
// ================================================================
function renderStoreSection(store, isBest) {
  const productCards = store.items
    .map((item) => renderProductCard(item, store))
    .join("");

  const missingHtml =
    store.missing && store.missing.length > 0
      ? `
      <div class="missing-note">
        <span class="missing-icon">⚠️</span>
        <span>ناموجود در این فروشگاه: ${store.missing.map(escapeHtml).join("، ")}</span>
      </div>
    `
      : "";

  const bestTitle = isBest
    ? `<h2 class="section-title best-title">✨ به صرفه ترین فروشگاه</h2>`
    : "";

  return `
    <section class="store-section ${isBest ? "best-store" : ""}">
      ${bestTitle}
      <div class="store-header-row">
        <div class="store-badge">
          <span class="store-icon">${isBest ? "🥇" : "🏪"}</span>
          <h3 class="store-name">${escapeHtml(store.storeName)}</h3>
        </div>
        <div class="store-total">
          <span class="total-label">مجموع سبد</span>
          <span class="total-value">${formatPrice(store.total)} تومان</span>
        </div>
      </div>
      <div class="products-grid">${productCards}</div>
      ${missingHtml}
    </section>
  `;
}

// ================================================================
// رندر کارت محصول با تصویر
// ================================================================
function renderProductCard(item, store) {
  const icon = getProductIcon(item.title);
  const hasLink = item.link && item.link !== "#";

  // 🖼️ استخراج امن URL تصویر
  let imageUrl = item.image;
  if (Array.isArray(imageUrl)) imageUrl = imageUrl[0];
  if (typeof imageUrl === "object" && imageUrl)
    imageUrl = imageUrl.url || imageUrl.src;
  const hasImage =
    imageUrl && typeof imageUrl === "string" && imageUrl.startsWith("http");

  const imageContent = hasImage
    ? `<img 
        src="${escapeHtml(imageUrl)}" 
        alt="${escapeHtml(item.title)}" 
        class="product-image-real" 
        loading="lazy"
        referrerpolicy="no-referrer"
        data-lightbox="true"
        onerror="this.onerror=null; this.style.display='none'; this.parentElement.innerHTML='<span class=&quot;product-image-icon&quot;>${icon}</span>';"
      />
      <span class="image-zoom-hint">🔍</span>`
    : `<span class="product-image-icon">${icon}</span>`;

  return `
    <div class="product-card">
      <div class="product-image-wrapper ${hasImage ? "has-real-image" : ""} ${hasImage ? "clickable-image" : ""}">
        ${imageContent}
      </div>
      <div class="product-body">
        <div class="product-query">${escapeHtml(item.query)}</div>
        <div class="product-title" title="${escapeHtml(item.title)}">
          ${escapeHtml(item.title)}
        </div>
        <div class="product-price-section">
          <span class="product-price-value">${formatPrice(item.price)}</span>
          <span class="product-price-currency">تومان</span>
        </div>
      </div>
      ${
        hasLink
          ? `<a class="product-action" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">
              مشاهده در ${escapeHtml(store.storeName)} ↗
            </a>`
          : `<div class="product-action disabled">لینک موجود نیست</div>`
      }
    </div>
  `;
}

// ================================================================
// تشخیص آیکون
// ================================================================
function getProductIcon(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("قلمو") || t.includes("قلم مو") || t.includes("brush"))
    return "🖌️";
  if (t.includes("مقوا") || t.includes("کاغذ") || t.includes("ورق"))
    return "📄";
  if (t.includes("دفتر") || t.includes("بلوک") || t.includes("اسکچ"))
    return "📔";
  if (t.includes("خودکار") || t.includes("روان")) return "🖊️";
  if (t.includes("مداد") || t.includes("تراش")) return "✏️";
  if (t.includes("آبرنگ") || t.includes("رنگ") || t.includes("گواش"))
    return "🎨";
  if (t.includes("ماوس")) return "🖱️";
  if (t.includes("کیبورد")) return "⌨️";
  if (t.includes("هدفون") || t.includes("هدست")) return "🎧";
  if (t.includes("گوشی") || t.includes("موبایل")) return "📱";
  if (t.includes("شارژر")) return "🔌";
  if (t.includes("کابل")) return "🔗";
  if (t.includes("پاک‌کن") || t.includes("پاکن")) return "🧽";
  if (t.includes("خط‌کش") || t.includes("گونیا")) return "📐";
  if (t.includes("چسب")) return "🧴";
  if (t.includes("قیچی")) return "✂️";
  if (t.includes("ماژیک")) return "🖍️";
  if (t.includes("کوله") || t.includes("کیف")) return "🎒";
  return "📦";
}

// ================================================================
// توابع کمکی
// ================================================================
function setLoading(loading) {
  searchBtn.disabled = loading;
  spinner.classList.toggle("active", loading);
  searchBtnText.textContent = loading ? "در حال جستجو..." : "🔍 جستجو و مقایسه";
}

function showError(message) {
  errorBox.textContent = "⚠️ " + message;
  errorBox.classList.remove("hidden");
}

function hideError() {
  errorBox.classList.add("hidden");
}

function formatPrice(price) {
  return Number(price).toLocaleString("fa-IR");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ================================================================
// رویدادها
// ================================================================
addBtn.addEventListener("click", addItem);
itemInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addItem();
});
searchBtn.addEventListener("click", search);
clearBtn.addEventListener("click", clearAll);

// ================================================================
// مدیریت تم
// ================================================================
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = themeToggle.querySelector(".theme-icon");

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeIcon.textContent = theme === "dark" ? "☀️" : "🌙";
  localStorage.setItem("theme", theme);
}

function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) applyTheme(saved);
  else {
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    applyTheme(prefersDark ? "dark" : "light");
  }
}

themeToggle.addEventListener("click", () => {
  const current =
    document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current === "dark" ? "light" : "dark");
});

// ================================================================
// 🖼️ مودال نمایش تصویر بزرگ (Lightbox)
// ================================================================
const imageModal = document.getElementById("image-modal");
const imageModalImg = document.getElementById("image-modal-img");
const imageModalCaption = imageModal.querySelector(".image-modal-caption");
const imageModalClose = imageModal.querySelector(".image-modal-close");
const imageModalBackdrop = imageModal.querySelector(".image-modal-backdrop");

function openImageModal(src, caption, alt) {
  imageModalImg.src = src;
  imageModalImg.alt = alt || "";
  imageModalCaption.textContent = caption || "";
  imageModal.classList.remove("hidden");
  document.body.style.overflow = "hidden"; // قفل اسکرول
}

function closeImageModal() {
  imageModal.classList.add("hidden");
  imageModalImg.src = "";
  document.body.style.overflow = "";
}

// رویداد کلیک روی تصاویر (Event Delegation)
document.addEventListener("click", (e) => {
  const img = e.target.closest(".product-image-wrapper.clickable-image");
  if (!img) return;

  const realImg = img.querySelector(".product-image-real");
  if (!realImg || !realImg.src) return;

  // عنوان محصول از کارت والد
  const card = img.closest(".product-card");
  const title =
    card?.querySelector(".product-title")?.textContent?.trim() || "";

  openImageModal(realImg.src, title, realImg.alt);
});

// بستن مودال
imageModalClose.addEventListener("click", closeImageModal);
imageModalBackdrop.addEventListener("click", closeImageModal);

// بستن با کلید Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !imageModal.classList.contains("hidden")) {
    closeImageModal();
  }
});

initTheme();
