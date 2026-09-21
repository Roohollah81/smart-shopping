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
// 🏪 فروشگاه‌های پشتیبانی‌شده
// ================================================================
const SUPPORTED_STORES = [
  {
    name: "دیجی‌کالا",
    url: "https://www.digikala.com",
    icon: "https://www.google.com/s2/favicons?domain=digikala.com&sz=128",
    color: "#ef4444",
  },
  {
    name: "ترب",
    url: "https://torob.com",
    icon: "https://www.google.com/s2/favicons?domain=torob.com&sz=128",
    color: "#f59e0b",
  },
  {
    name: "قلم‌تراش",
    url: "https://ghalamtarash.ir",
    icon: "https://www.google.com/s2/favicons?domain=ghalamtarash.ir&sz=128",
    color: "#84cc16",
  },
  {
    name: "آرمان آرت",
    url: "https://armanartstore.com",
    icon: "https://www.google.com/s2/favicons?domain=armanartstore.com&sz=128",
    color: "#ec4899",
  },
  {
    name: "عالم‌زاده",
    url: "https://alemzadeh.ir",
    icon: "https://www.google.com/s2/favicons?domain=alemzadeh.ir&sz=128",
    color: "#3b82f6",
  },
  {
    name: "مهستان آرت",
    url: "https://mahestanart.com",
    icon: "https://www.google.com/s2/favicons?domain=mahestanart.com&sz=128",
    color: "#a855f7",
  },
  {
    name: "مجد مارکت",
    url: "https://majdmarket.com",
    icon: "https://www.google.com/s2/favicons?domain=majdmarket.com&sz=128",
    color: "#f97316",
  },
];

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

  // 🏪 آیکون فروشگاه
  const storeIconUrl = getStoreIconUrl(store.storeName);
  const fallbackEmoji = isBest ? "🥇" : "🏪";

  const storeIconHtml = storeIconUrl
    ? `<img 
        src="${escapeHtml(storeIconUrl)}" 
        alt="${escapeHtml(store.storeName)}" 
        class="store-logo" 
        loading="lazy"
        referrerpolicy="no-referrer"
        onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';"
      />
      <span class="store-icon-fallback" style="display:none;">${fallbackEmoji}</span>`
    : `<span class="store-icon-fallback" style="display:flex;">${fallbackEmoji}</span>`;

  return `
    <section class="store-section ${isBest ? "best-store" : ""}">
      ${bestTitle}
      <div class="store-header-row">
        <div class="store-badge">
          <div class="store-logo-wrapper">
            ${storeIconHtml}
          </div>
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
// رندر کارت محصول
// ================================================================
function renderProductCard(item, store) {
  const icon = getProductIcon(item.title);
  const hasLink = item.link && item.link !== "#";

  // 🖼️ استخراج امن URL تصویر
  let imageUrl = item.image;
  if (Array.isArray(imageUrl)) imageUrl = imageUrl[0];
  if (typeof imageUrl === "object" && imageUrl) {
    imageUrl = imageUrl.url || imageUrl.src;
  }
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
          ? `<a class="product-action" href="${escapeHtml(
              item.link,
            )}" target="_blank" rel="noopener noreferrer">
              مشاهده در ${escapeHtml(store.storeName)} ↗
            </a>`
          : `<div class="product-action disabled">لینک موجود نیست</div>`
      }
    </div>
  `;
}

// ================================================================
// نقشه‌ی آیکون فروشگاه‌ها
// ================================================================
function getStoreIconUrl(storeName) {
  const domainMap = {
    دیجی‌کالا: "digikala.com",
    ترب: "torob.com",
    قلم‌تراش: "ghalamtarash.ir",
    "آرمان آرت": "armanartstore.com",
    عالم‌زاده: "alemzadeh.ir",
    "مهستان آرت": "mahestanart.com",
    "مجد مارکت": "majdmarket.com",
  };
  const domain = domainMap[storeName];
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

// ================================================================
// تشخیص آیکون بر اساس دسته‌بندی محصول
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
// 🏪 ساخت HTML یک کارت فروشگاه
// ================================================================
function buildStoreCard(store) {
  return `
    <a 
      class="store-strip-card" 
      style="--store-color: ${store.color};"
      href="${escapeHtml(store.url)}"
      target="_blank"
      rel="noopener noreferrer"
      title="رفتن به ${escapeHtml(store.name)}"
    >
      <div class="store-strip-info">
        <span class="store-strip-name">${escapeHtml(store.name)}</span>
      </div>
      <div class="store-strip-logo">
        <img 
          src="${escapeHtml(store.icon)}" 
          alt="${escapeHtml(store.name)}"
          loading="lazy"
          referrerpolicy="no-referrer"
          onerror="this.onerror=null; this.parentElement.innerHTML='<span class=&quot;store-strip-fallback&quot;>🏪</span>';"
        />
      </div>
    </a>
  `;
}

// ================================================================
// رندر نوار فروشگاه‌ها
// ================================================================
function renderSupportedStores() {
  const strip = document.getElementById("stores-strip");
  if (!strip) return;

  // 🎯 معکوس کردن ترتیب DOM تا در LTR دیجی‌کالا راست‌ترین باشد
  const cardsHtml = [...SUPPORTED_STORES]
    .reverse()
    .map(buildStoreCard)
    .join("");

  strip.innerHTML = `
    <div class="stores-strip-track">${cardsHtml}</div>
    <div class="stores-strip-track" aria-hidden="true">${cardsHtml}</div>
  `;

  // 🎯 اعمال direction به صورت inline (بالاترین اولویت)
  strip.style.direction = "ltr";

  initStripAutoScroll();
}

// ================================================================
// مدیریت اسکرول خودکار + دستی (حلقه‌ی بی‌نهایت یکپارچه)
// ================================================================
function initStripAutoScroll() {
  const wrapper = document.querySelector(".supported-stores");
  const strip = document.getElementById("stores-strip");
  if (!wrapper || !strip) return;

  let stripPos = 0;
  let lastTime = performance.now();
  const SPEED = 25; // پیکسل در ثانیه

  let isMouseDown = false;
  let isDragging = false;
  let clickSuppressed = false;
  let dragStartX = 0;
  let dragStartPos = 0;
  let isHovering = false;

  // 🎯 اندازه‌ی واقعی یک track
  let trackWidth = 0;

  function measureTrack() {
    const firstTrack = strip.querySelector(".stores-strip-track");
    if (firstTrack) {
      trackWidth = firstTrack.getBoundingClientRect().width;
    }
  }

  measureTrack();
  window.addEventListener("resize", measureTrack);

  // 🎯 حلقه‌ی انیمیشن
  function tick(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    if (trackWidth > 0) {
      // حرکت خودکار فقط اگر کاربر هاور نکرده و درگ نمی‌کند
      if (!isHovering && !isDragging) {
        stripPos -= SPEED * dt;
      }

      // 📐 نرمال‌سازی با ماژول منفی
      stripPos = stripPos % trackWidth;
      if (stripPos > 0) stripPos -= trackWidth;

      strip.style.transform = `translateX(${stripPos}px)`;
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame((t) => {
    lastTime = t;
    requestAnimationFrame(tick);
  });

  // 🖱️ ورود و خروج موس (cursor از CSS می‌آید)
  wrapper.addEventListener("mouseenter", () => {
    isHovering = true;
  });

  wrapper.addEventListener("mouseleave", () => {
    isHovering = false;
    isMouseDown = false;
    isDragging = false;
  });

  // 🖱️ شروع درگ
  wrapper.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    isMouseDown = true;
    isDragging = false;
    clickSuppressed = false;
    dragStartX = e.clientX;
    dragStartPos = stripPos;
  });

  // 🖱️ حرکت موس
  document.addEventListener("mousemove", (e) => {
    if (!isMouseDown) return;
    const delta = e.clientX - dragStartX;

    if (!isDragging && Math.abs(delta) > 5) {
      isDragging = true;
      clickSuppressed = true;
    }

    if (isDragging) {
      stripPos = dragStartPos + delta;
    }
  });

  // 🖱️ رها کردن موس
  document.addEventListener("mouseup", () => {
    if (isMouseDown) {
      isMouseDown = false;
      isDragging = false;
    }
  });

  // 🚫 جلوگیری از کلیک روی لینک‌ها هنگام درگ
  wrapper.addEventListener(
    "click",
    (e) => {
      if (clickSuppressed) {
        e.preventDefault();
        e.stopPropagation();
        clickSuppressed = false;
      }
    },
    true,
  );

  // 🎡 اسکرول با چرخ ماوس
  wrapper.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      stripPos -= (e.deltaY + e.deltaX) * 0.6;
    },
    { passive: false },
  );
}

// ================================================================
// 🖼️ مودال نمایش تصویر بزرگ (Lightbox)
// ================================================================
const imageModal = document.getElementById("image-modal");
const imageModalImg = document.getElementById("image-modal-img");
const imageModalCaption = imageModal
  ? imageModal.querySelector(".image-modal-caption")
  : null;
const imageModalClose = imageModal
  ? imageModal.querySelector(".image-modal-close")
  : null;
const imageModalBackdrop = imageModal
  ? imageModal.querySelector(".image-modal-backdrop")
  : null;

function openImageModal(src, caption, alt) {
  if (!imageModal) return;
  imageModalImg.src = src;
  imageModalImg.alt = alt || "";
  if (imageModalCaption) imageModalCaption.textContent = caption || "";
  imageModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeImageModal() {
  if (!imageModal) return;
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

  const card = img.closest(".product-card");
  const title =
    card?.querySelector(".product-title")?.textContent?.trim() || "";

  openImageModal(realImg.src, title, realImg.alt);
});

// بستن مودال
if (imageModalClose) imageModalClose.addEventListener("click", closeImageModal);
if (imageModalBackdrop)
  imageModalBackdrop.addEventListener("click", closeImageModal);

// بستن با کلید Escape
document.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    imageModal &&
    !imageModal.classList.contains("hidden")
  ) {
    closeImageModal();
  }
});

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
// مدیریت تم روشن/تاریک
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
  if (saved) {
    applyTheme(saved);
  } else {
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

initTheme();

// ================================================================
// 🚀 اجرای اولیه
// ================================================================
renderSupportedStores();
