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
let currentSort = localStorage.getItem("sortOrder") || "price";
let lastBasketComparison = null;
let wishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");

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
// 🎯 اطلاعات تکمیلی فروشگاه‌ها با نشان‌های واقعی
// ================================================================
const STORE_META = {
  دیجی‌کالا: {
    shipping: "سراسر ایران",
    shippingIcon: "/badges/map-icon.png",
    badges: [
      {
        category: "trust",
        img: "/badges/enamad.png",
        link: "https://trustseal.enamad.ir/?id=19077&Code=sScdOJOzhFxtcEqkjP7P",
        alt: "اینماد",
      },
      {
        category: "trust",
        img: "/badges/ecunion.png",
        link: "https://www.ecunion.ir/verify/digikala.com?token=35858775acf0232a8063",
        alt: "مجوز کشوری",
      },
      {
        category: "trust",
        img: "/badges/samandehi.png",
        link: "https://logo.samandehi.ir/Verify.aspx?id=28177&p=uiwkmcsirfthjyoejyoe",
        alt: "نشان ملی ثبت",
      },
      {
        category: "trust",
        img: "/badges/sapra.png",
        link: "https://sapra.ir/",
        alt: "ساپرا",
      },
      {
        category: "payment",
        img: "/badges/digipay.png",
        link: "https://www.mydigipay.com/",
        alt: "دیجی‌پی",
      },
    ],
  },
  ترب: {
    shipping: "واسط خرید",
    shippingIcon: "/badges/map-icon.png",
    badges: [], // 🎯 حذف شد
  },
  قلم‌تراش: {
    shipping: "شهرکرد",
    shippingIcon: "/badges/map-icon.png",
    badges: [
      {
        category: "trust",
        img: "/badges/enamad.png",
        link: "https://trustseal.enamad.ir/?id=714545&Code=A7bJ06l5V5qU4Gx7kGCBPAtLRo1DuKVY",
        alt: "اینماد",
      },
      {
        category: "trust",
        img: "/badges/torob-guarantee.png",
        link: "https://torob.com/shop/1043/%D9%82%D9%84%D9%85%D8%AA%D8%B1%D8%A7%D8%B4/",
        alt: "ضمانت ترب",
      },
      {
        category: "trust",
        img: "/badges/digikala-trust.png",
        link: "https://buy-with-digikala.digify.shop/d-namad/store/d743959b-3dc3-4ebe-9b46-b003c695d645",
        alt: "اعتماد دیجی‌کالا",
      },
      {
        category: "shipping",
        img: "/badges/express-shipping.png",
        link: null,
        alt: "اکسپرس",
      },
      {
        category: "payment",
        img: "/badges/digipay.png",
        link: "https://www.mydigipay.com/",
        alt: "دیجی‌پی",
      },
      {
        category: "payment",
        img: "/badges/torob-pay.png",
        link: "https://pay.torob.com/",
        alt: "ترب‌پی",
      },
    ],
  },
  "آرمان آرت": {
    shipping: "کرج",
    shippingIcon: "/badges/map-icon.png",
    badges: [
      {
        category: "trust",
        img: "/badges/enamad.png",
        link: "https://trustseal.enamad.ir/?id=372725&Code=xZuYs61DQQXouB2rIBBg",
        alt: "اینماد",
      },
      {
        category: "shipping",
        img: "/badges/express-shipping.png",
        link: null,
        alt: "اکسپرس",
      },
      {
        category: "payment",
        img: "/badges/zarinpal.png",
        link: "https://www.zarinpal.com/trustPage/armanartstore.com",
        alt: "زرین‌پال",
      },
    ],
  },
  عالم‌زاده: {
    shipping: "مشهد",
    shippingIcon: "/badges/map-icon.png",
    badges: [
      {
        category: "trust",
        img: "/badges/enamad.png",
        link: "https://trustseal.enamad.ir/?id=528349&Code=xiOEZ5iHyYK6XJPHJiGU6g71l0Htw2bP",
        alt: "اینماد",
      },
      {
        category: "shipping",
        img: "/badges/express-shipping.png",
        link: null,
        alt: "اکسپرس",
      },
      {
        category: "shipping",
        img: "/badges/tipax.png",
        link: "https://www.tipax.ir/",
        alt: "تیپاکس",
      },
    ],
  },
  "مهستان آرت": {
    shipping: "کرج",
    shippingIcon: "/badges/map-icon.png",
    badges: [
      {
        category: "trust",
        img: "/badges/enamad.png",
        link: "https://trustseal.enamad.ir/?id=140414&Code=tGHPEYjqMPGlftMGEWnq",
        alt: "اینماد",
      },
      {
        category: "shipping",
        img: "/badges/express-shipping.png",
        link: null,
        alt: "اکسپرس",
      },
      {
        category: "shipping",
        img: "/badges/tipax.png",
        link: "https://www.tipax.ir/",
        alt: "تیپاکس",
      },
    ],
  },
  "مجد مارکت": {
    shipping: "قم",
    shippingIcon: "/badges/map-icon.png",
    badges: [
      {
        category: "trust",
        img: "/badges/enamad.png",
        link: "https://trustseal.enamad.ir/?id=133075&Code=IME8ioiVnfPkSp88S8el",
        alt: "اینماد",
      },
      {
        category: "trust",
        img: "/badges/digikala-trust.png",
        link: "https://buy-with-digikala.digify.shop/d-namad/store/0a83edab-5f33-4c2f-a3e7-920523b05a1e",
        alt: "اعتماد دیجی‌کالا",
      },
      { category: "shipping", img: "/badges/post.png", link: null, alt: "پست" },
      {
        category: "shipping",
        img: "/badges/tipax.png",
        link: "https://www.tipax.ir/",
        alt: "تیپاکس",
      },
      {
        category: "payment",
        img: "/badges/torob-pay.png",
        link: "https://pay.torob.com/",
        alt: "ترب‌پی",
      },
      {
        category: "payment",
        img: "/badges/snapp-pay.png",
        link: "https://snapppay.ir/",
        alt: "اسنپ‌پی",
      },
    ],
  },
};

function getStoreMeta(storeName) {
  return (
    STORE_META[storeName] || {
      shipping: null,
      shippingIcon: "/badges/map-icon.png",
      badges: [],
    }
  );
}

function getCategoryLabel(category) {
  const labels = {
    trust: "ضمانت و اعتماد",
    shipping: "ارسال",
    payment: "پرداخت",
  };
  return labels[category] || "نشان";
}

function getStoreColor(storeName) {
  const s = SUPPORTED_STORES.find((x) => x.name === storeName);
  return s ? s.color : "#6366f1";
}

// ================================================================
// 🎯 SLOT MACHINE
// ================================================================
let slotStoreInterval = null;
let currentStoreIndex = 0;

function animateSlot(slotId, newText, color = null) {
  const slotEl = document.getElementById(slotId);
  if (!slotEl) return;

  const currentTextEl = slotEl.querySelector(".slot-text");
  const currentText = currentTextEl ? currentTextEl.textContent : "";

  if (color && slotId === "slot-store") {
    slotEl.style.setProperty("--slot-color-bg", hexToRgba(color, 0.85));
    slotEl.style.setProperty("--slot-color-border", hexToRgba(color, 0.95));
  } else if (slotId === "slot-store") {
    slotEl.style.removeProperty("--slot-color-bg");
    slotEl.style.removeProperty("--slot-color-border");
  }

  if (currentText === newText) return;

  slotEl.innerHTML = `
    <span class="slot-text slot-out">${escapeHtml(currentText || "—")}</span>
    <span class="slot-text slot-in">${escapeHtml(newText)}</span>
  `;

  setTimeout(() => {
    slotEl.innerHTML = `<span class="slot-text">${escapeHtml(newText)}</span>`;
  }, 380);
}

function startStoreCycle() {
  stopStoreCycle();
  currentStoreIndex = 0;
  const firstStore = SUPPORTED_STORES[0];
  animateSlot("slot-store", firstStore.name, firstStore.color);
  slotStoreInterval = setInterval(() => {
    currentStoreIndex = (currentStoreIndex + 1) % SUPPORTED_STORES.length;
    const store = SUPPORTED_STORES[currentStoreIndex];
    animateSlot("slot-store", store.name, store.color);
  }, 1800);
}

function stopStoreCycle() {
  if (slotStoreInterval) {
    clearInterval(slotStoreInterval);
    slotStoreInterval = null;
  }
}

function hexToRgba(hex, alpha = 1) {
  if (!hex || !hex.startsWith("#")) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function toPersianNum(num) {
  const persian = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(num).replace(/\d/g, (d) => persian[parseInt(d, 10)]);
}

// ================================================================
// 🎯 TOAST NOTIFICATIONS
// ================================================================
function showToast(title, message, type = "success", duration = 5000) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const icons = {
    success: "✓",
    remove: "✕",
    info: "❤️",
  };

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || "✓"}</div>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
    <div class="toast-progress">
      <div class="toast-progress-bar" style="animation-duration: ${duration}ms;"></div>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ================================================================
// 🎯 CONFIRM DIALOG
// ================================================================
function showConfirmDialog({
  title = "تأیید عملیات",
  message = "",
  icon = "⚠️",
  confirmText = "تأیید",
  cancelText = "انصراف",
  variant = "danger",
} = {}) {
  return new Promise((resolve) => {
    const dialog = document.getElementById("confirm-dialog");
    const iconEl = document.getElementById("confirm-dialog-icon");
    const titleEl = document.getElementById("confirm-dialog-title");
    const msgEl = document.getElementById("confirm-dialog-message");
    const okBtn = document.getElementById("confirm-dialog-ok");
    const cancelBtn = document.getElementById("confirm-dialog-cancel");
    const backdrop = dialog.querySelector(".confirm-dialog-backdrop");

    dialog.classList.remove("danger", "info");

    iconEl.textContent = icon;
    titleEl.textContent = title;
    msgEl.textContent = message;
    okBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;

    if (variant === "danger") dialog.classList.add("danger");
    else if (variant === "info") dialog.classList.add("info");

    dialog.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    setTimeout(() => okBtn.focus(), 100);

    const newOk = okBtn.cloneNode(true);
    const newCancel = cancelBtn.cloneNode(true);
    const newBackdrop = backdrop.cloneNode(true);
    okBtn.parentNode.replaceChild(newOk, okBtn);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    backdrop.parentNode.replaceChild(newBackdrop, backdrop);

    function close(result) {
      dialog.classList.add("hidden");
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKey);
      resolve(result);
    }

    function handleKey(e) {
      if (e.key === "Escape") close(false);
      else if (e.key === "Enter") close(true);
    }

    newOk.addEventListener("click", () => close(true));
    newCancel.addEventListener("click", () => close(false));
    newBackdrop.addEventListener("click", () => close(false));
    document.addEventListener("keydown", handleKey);
  });
}

// ================================================================
// 🎯 WISHLIST
// ================================================================
function getWishlistKey(item) {
  return `${item.storeName}::${item.title}`;
}

function isInWishlist(item) {
  const key = getWishlistKey(item);
  return wishlist.some((w) => getWishlistKey(w) === key);
}

function saveWishlist() {
  localStorage.setItem("wishlist", JSON.stringify(wishlist));
  updateWishlistFloatBtn();
}

function updateWishlistFloatBtn() {
  const btn = document.getElementById("wishlist-float-btn");
  const countEl = document.getElementById("wishlist-float-count");
  if (!btn || !countEl) return;

  if (wishlist.length > 0) {
    btn.classList.remove("hidden");
    countEl.textContent = toPersianNum(wishlist.length);
  } else {
    btn.classList.add("hidden");
  }
}

function toggleWishlist(item) {
  const key = getWishlistKey(item);
  const index = wishlist.findIndex((w) => getWishlistKey(w) === key);

  if (index >= 0) {
    wishlist.splice(index, 1);
    showToast("از علاقه‌مندی‌ها حذف شد", item.title, "remove", 4500);
  } else {
    wishlist.push({
      title: item.title,
      price: item.price,
      link: item.link,
      image: item.image || null,
      storeName: item.storeName,
    });
    showToast("به علاقه‌مندی‌ها اضافه شد ❤️", item.title, "success", 5000);
  }

  saveWishlist();
  updateAllWishlistButtons();
  const modal = document.getElementById("wishlist-modal");
  if (modal && !modal.classList.contains("hidden")) renderWishlistModal();
}

function removeFromWishlist(item) {
  const key = getWishlistKey(item);
  wishlist = wishlist.filter((w) => getWishlistKey(w) !== key);
  saveWishlist();
  updateAllWishlistButtons();
  renderWishlistModal();
}

function updateAllWishlistButtons() {
  document.querySelectorAll(".product-wishlist-btn").forEach((btn) => {
    const item = {
      storeName: btn.dataset.store,
      title: btn.dataset.title,
      price: parseInt(btn.dataset.price, 10),
      link: btn.dataset.link,
      image: btn.dataset.image || null,
    };
    if (isInWishlist(item)) {
      btn.classList.add("active");
      btn.innerHTML = "❤️";
      btn.title = "حذف از علاقه‌مندی‌ها";
    } else {
      btn.classList.remove("active");
      btn.innerHTML = "🤍";
      btn.title = "افزودن به علاقه‌مندی‌ها";
    }
  });
}

function openWishlistModal() {
  const modal = document.getElementById("wishlist-modal");
  if (!modal) return;
  renderWishlistModal();
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeWishlistModal() {
  const modal = document.getElementById("wishlist-modal");
  modal.classList.add("hidden");
  document.body.style.overflow = "";
}

function renderWishlistModal() {
  const body = document.getElementById("wishlist-modal-body");
  const totalEl = document.getElementById("wishlist-modal-total");
  const toolbar = document.getElementById("wishlist-modal-toolbar");

  if (wishlist.length === 0) {
    if (totalEl) {
      totalEl.classList.add("hidden");
      totalEl.innerHTML = "";
    }
    if (toolbar) toolbar.classList.add("hidden");
    body.innerHTML = `
      <div class="wishlist-empty">
        <div class="wishlist-empty-icon">💔</div>
        <div class="wishlist-empty-text">هنوز چیزی به علاقه‌مندی‌ها اضافه نکرده‌اید</div>
      </div>
    `;
    return;
  }

  if (totalEl) totalEl.classList.remove("hidden");
  if (toolbar) toolbar.classList.remove("hidden");

  const total = wishlist.reduce((sum, item) => sum + (item.price || 0), 0);

  if (totalEl) {
    totalEl.innerHTML = `
      <span class="total-label">💰 جمع کل (${toPersianNum(wishlist.length)} آیتم)</span>
      <span class="total-value">${formatPrice(total)} تومان</span>
    `;
  }

  body.innerHTML = wishlist
    .map((item, index) => {
      const icon = getProductIcon(item.title);
      const hasImg =
        item.image &&
        typeof item.image === "string" &&
        item.image.startsWith("http");
      const imgHtml = hasImg
        ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'wishlist-item-icon\\'>${icon}</span>';" />`
        : `<span class="wishlist-item-icon">${icon}</span>`;

      const storeColor = getStoreColor(item.storeName);
      const storeIconUrl = getStoreIconUrl(item.storeName);
      const storeIconHtml = storeIconUrl
        ? `<img src="${escapeHtml(storeIconUrl)}" alt="" class="wishlist-item-store-icon" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';" /><span class="wishlist-item-store-fallback" style="display:none;">🏪</span>`
        : `<span class="wishlist-item-store-fallback">🏪</span>`;

      const hasLink = item.link && item.link !== "#";
      const tag = hasLink ? "a" : "div";
      const linkAttrs = hasLink
        ? `href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer"`
        : "";

      return `
        <${tag} class="wishlist-item ${hasLink ? "wishlist-item-link" : ""}" ${linkAttrs} draggable="false">
          <div class="wishlist-item-image">${imgHtml}</div>
          <div class="wishlist-item-info">
            <div class="wishlist-item-title">${escapeHtml(item.title)}</div>
            <div class="wishlist-item-store" style="color: ${storeColor};">
              <span class="wishlist-item-store-logo">${storeIconHtml}</span>
              <span class="wishlist-item-store-name">${escapeHtml(item.storeName)}</span>
            </div>
          </div>
          <div class="wishlist-item-price">
            <span class="wishlist-item-price-value">${formatPrice(item.price)}</span>
            <span class="wishlist-item-price-currency">تومان</span>
          </div>
          <button class="wishlist-item-remove" data-index="${index}" title="حذف از علاقه‌مندی‌ها" type="button">✕</button>
        </${tag}>
      `;
    })
    .join("");

  body.querySelectorAll(".wishlist-item-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index, 10);
      const item = wishlist[idx];
      if (item) removeFromWishlist(item);
    });
  });
}

async function clearAllWishlist() {
  if (wishlist.length === 0) return;

  const confirmed = await showConfirmDialog({
    title: "حذف همه علاقه‌مندی‌ها",
    message: `آیا مطمئن هستید که می‌خواهید همه ${toPersianNum(wishlist.length)} آیتم را از علاقه‌مندی‌ها حذف کنید؟ این عملیات قابل بازگشت نیست.`,
    icon: "🗑️",
    confirmText: "بله، حذف کن",
    cancelText: "انصراف",
    variant: "danger",
  });

  if (!confirmed) return;

  const count = wishlist.length;
  wishlist = [];
  saveWishlist();
  updateAllWishlistButtons();
  renderWishlistModal();

  showToast(
    "همه آیتم‌ها حذف شدند",
    `${toPersianNum(count)} آیتم از علاقه‌مندی‌ها پاک شد`,
    "remove",
    4500,
  );
}

// ================================================================
// 🎯 SORTING
// ================================================================
function applySorting(basketComparison) {
  if (!basketComparison || basketComparison.length === 0) return [];
  const sorted = [...basketComparison];
  if (currentSort === "price") {
    sorted.sort((a, b) => {
      if (a.total !== b.total) return a.total - b.total;
      return b.itemCount - a.itemCount;
    });
  } else if (currentSort === "count") {
    sorted.sort((a, b) => {
      if (b.itemCount !== a.itemCount) return b.itemCount - a.itemCount;
      return a.total - b.total;
    });
  }
  return sorted;
}

function setSortOrder(order) {
  currentSort = order;
  localStorage.setItem("sortOrder", order);
  document.querySelectorAll(".sort-option").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.sort === order);
  });
  if (lastBasketComparison && lastBasketComparison.length > 0) {
    const sorted = applySorting(lastBasketComparison);
    renderStoreSections(sorted);
  }
}

function initSortToggle() {
  document.querySelectorAll(".sort-option").forEach((btn) => {
    btn.addEventListener("click", () => setSortOrder(btn.dataset.sort));
    btn.classList.toggle("active", btn.dataset.sort === currentSort);
  });
}

// ---------- آیتم‌ها ----------
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

function removeItem(i) {
  if (itemsList.classList.contains("locked")) return;
  items.splice(i, 1);
  renderItems();
}

function renderItems() {
  itemsList.innerHTML = items
    .map(
      (it, i) => `
    <div class="item-chip" data-index="${i}">
      <span class="item-chip-status"></span>
      <span class="item-chip-text">${escapeHtml(it)}</span>
      <span class="remove" onclick="removeItem(${i})">✕</span>
    </div>
  `,
    )
    .join("");
  searchBtn.disabled = items.length === 0;
}

function clearAll() {
  if (itemsList.classList.contains("locked")) return;
  items = [];
  renderItems();
  resultsSection.classList.add("hidden");
  document.getElementById("sort-toggle-group").classList.add("hidden"); // 🎯
  hideError();
  stopStoreCycle();
  searchBtn.classList.remove("searching");
  setLoading(false);
  lastBasketComparison = null;
}

function markChipActive(index) {
  document
    .querySelectorAll(".item-chip.active")
    .forEach((chip) => chip.classList.remove("active"));
  const chip = document.querySelector(`.item-chip[data-index="${index}"]`);
  if (chip) chip.classList.add("active");
}

function markChipDone(index) {
  const chip = document.querySelector(`.item-chip[data-index="${index}"]`);
  if (chip) {
    chip.classList.remove("active", "error");
    chip.classList.add("done");
  }
}

function markChipError(index) {
  const chip = document.querySelector(`.item-chip[data-index="${index}"]`);
  if (chip) {
    chip.classList.remove("active", "done");
    chip.classList.add("error");
  }
}

// ---------- جستجو ----------
async function search() {
  if (items.length === 0) return;
  hideError();
  setLoading(true);

  document.querySelectorAll(".item-chip").forEach((chip) => {
    chip.classList.remove("done", "error", "active");
  });

  searchBtn.classList.add("searching");
  itemsList.classList.add("locked");
  startStoreCycle();

  try {
    const queryResults = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      markChipActive(i);
      animateSlot("slot-item", item);

      try {
        const r = await fetch("/api/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: [item] }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();

        if (data.success && data.data?.queries?.[0]) {
          queryResults.push(data.data.queries[0]);
          markChipDone(i);
        } else {
          markChipError(i);
        }
      } catch (e) {
        console.error(`Error searching "${item}":`, e);
        markChipError(i);
      }
    }

    const validQueries = queryResults.filter(Boolean);

    if (validQueries.length === 0) {
      showError("هیچ نتیجه‌ای یافت نشد.");
      return;
    }

    const basketComparison = computeBasketComparison(validQueries);
    renderResults({ queries: validQueries, basketComparison });
  } catch (e) {
    showError("خطا در جستجو: " + (e.message || "خطای نامشخص"));
    console.error(e);
  } finally {
    stopStoreCycle();
    searchBtn.classList.remove("searching");
    setLoading(false);
    itemsList.classList.remove("locked");
    document
      .querySelectorAll(".item-chip.active")
      .forEach((chip) => chip.classList.remove("active"));
    const slotStore = document.getElementById("slot-store");
    if (slotStore) {
      slotStore.style.removeProperty("--slot-color-bg");
      slotStore.style.removeProperty("--slot-color-border");
    }
  }
}

function computeBasketComparison(queries) {
  const storeNames = new Set();
  for (const { matches } of queries) {
    for (const match of matches) {
      for (const offer of match.offers) storeNames.add(offer.storeName);
    }
  }

  return Array.from(storeNames)
    .map((storeName) => {
      let total = 0,
        itemCount = 0;
      const missing = [],
        pickedItems = [];

      for (const { query, matches } of queries) {
        const offersForStore = [];
        for (const match of matches) {
          const offer = match.offers.find((o) => o.storeName === storeName);
          if (offer) offersForStore.push(offer);
        }

        if (offersForStore.length === 0) {
          missing.push(query);
          continue;
        }

        offersForStore.sort((a, b) => a.price - b.price);
        const cheapest = offersForStore[0];
        const others = offersForStore.slice(1);

        total += cheapest.price;
        itemCount++;
        pickedItems.push({
          query,
          title: cheapest.productTitle,
          price: cheapest.price,
          link: cheapest.link,
          image: cheapest.image || null,
          otherItems: others.map((o) => ({
            title: o.productTitle,
            price: o.price,
            link: o.link,
            image: o.image || null,
          })),
        });
      }

      return { storeName, total, itemCount, missing, items: pickedItems };
    })
    .filter((b) => b.itemCount > 0)
    .sort((a, b) => {
      if (a.total !== b.total) return a.total - b.total;
      return b.itemCount - a.itemCount;
    });
}

// ---------- نمایش نتایج ----------
function renderResults(data) {
  const { basketComparison } = data;
  if (!basketComparison || basketComparison.length === 0) {
    showError("هیچ نتیجه‌ای یافت نشد.");
    resultsSection.classList.add("hidden");
    document.getElementById("sort-toggle-group").classList.add("hidden");
    return;
  }
  lastBasketComparison = basketComparison;
  const sorted = applySorting(basketComparison);
  renderStoreSections(sorted);

  // 🎯 نمایش فیلتر ترتیب
  document.getElementById("sort-toggle-group").classList.remove("hidden");

  resultsSection.classList.remove("hidden");
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderStoreSections(sortedStores) {
  const best = sortedStores[0];
  let html = renderStoreSection(best, true);
  const others = sortedStores.slice(1);
  if (others.length > 0) {
    html += `<h2 class="section-title others-title">فروشگاه های دیگر</h2>`;
    for (const s of others) html += renderStoreSection(s, false);
  }
  storesContainer.innerHTML = html;

  requestAnimationFrame(() => {
    document.querySelectorAll("[data-strip-track]").forEach(initStripDrag);
    document.querySelectorAll("[data-grid-track]").forEach(initGridDrag);
    disableAllDraggable();
    updateAllWishlistButtons();
    setTimeout(checkAllGridOverflows, 100);
  });
}

function renderStoreSection(store, isBest) {
  const storeColor = getStoreColor(store.storeName);
  const storeMeta = getStoreMeta(store.storeName);
  const storeUrl = SUPPORTED_STORES.find(
    (s) => s.name === store.storeName,
  )?.url;

  const cards = store.items
    .map((it) => renderProductCard(it, store, storeColor))
    .join("");

  // 🎯 نشان‌ها به‌صورت ستون عمودی
  const badges = Array.isArray(storeMeta.badges) ? storeMeta.badges : [];

  const buildBadgeRow = (badge) => {
    const cat = badge.category || "trust";
    const inner = `<img src="${escapeHtml(badge.img)}" alt="${escapeHtml(badge.alt)}" class="store-badge-img" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.style.display='none';" />`;
    const title = `${getCategoryLabel(cat)} — ${badge.alt}`;

    const tag = badge.link ? "a" : "span";
    const attrs = badge.link
      ? `href="${escapeHtml(badge.link)}" target="_blank" rel="noopener noreferrer"`
      : "";

    return `
      <${tag} class="store-badge-row store-badge-row-${cat}" ${attrs} title="${escapeHtml(title)}">
        <span class="store-badge-thumb">${inner}</span>
        <span class="store-badge-text">${escapeHtml(badge.alt)}</span>
      </${tag}>
    `;
  };

  // 🎯 گروه‌بندی نشان‌ها بر اساس category
  const trustBadges = badges.filter((b) => b.category === "trust");
  const shippingBadges = badges.filter((b) => b.category === "shipping");
  const paymentBadges = badges.filter((b) => b.category === "payment");

  const buildGroup = (labelIcon, labelText, className, list) => {
    if (list.length === 0) return "";
    return `
      <div class="store-badge-group ${className}">
        <div class="store-badge-group-label">
          <span>${labelIcon}</span>
          <span>${labelText}</span>
        </div>
        <div class="store-badge-group-items">
          ${list.map(buildBadgeRow).join("")}
        </div>
      </div>
    `;
  };

  // 🎯 ستون نشان‌ها با شهر در ابتدای آن
  const cityRowHtml = storeMeta.shipping
    ? `
      <div class="store-badge-group group-city">
        <div class="store-badge-group-label">
          <span>📍</span>
          <span>ارسال از</span>
        </div>
        <div class="store-badge-group-items">
          <span class="store-badge-row store-badge-row-city">
            <span class="store-badge-thumb">
              <img src="${storeMeta.shippingIcon}" alt="" class="store-badge-img" onerror="this.style.display='none';" />
            </span>
            <span class="store-badge-text">${escapeHtml(storeMeta.shipping)}</span>
          </span>
        </div>
      </div>
    `
    : "";

  const badgesColumnHtml =
    badges.length > 0 || storeMeta.shipping
      ? `
      <aside class="store-badges-column">
        ${cityRowHtml}
        ${buildGroup("🛡️", "ضمانت و اعتماد", "group-trust", trustBadges)}
        ${buildGroup("📦", "ارسال", "group-shipping", shippingBadges)}
        ${buildGroup("💳", "پرداخت", "group-payment", paymentBadges)}
      </aside>
    `
      : "";

  const missingHtml =
    store.missing && store.missing.length > 0
      ? `
      <div class="missing-section">
        <span class="missing-label">
          <span class="missing-icon">⚠️</span>
          <span>ناموجود در این فروشگاه:</span>
        </span>
        ${store.missing
          .map(
            (m) => `
          <span class="missing-item-card">
            <span class="missing-item-icon">📦</span>
            <span class="missing-item-text">${escapeHtml(m)}</span>
          </span>
        `,
          )
          .join("")}
      </div>
    `
      : "";

  let bestTitle = "";
  if (isBest) {
    const titleText =
      currentSort === "count"
        ? "🎨 متنوع ترین فروشگاه"
        : "✨ به صرفه ترین فروشگاه";
    bestTitle = `<h2 class="section-title best-title">${titleText}</h2>`;
  }

  const iconUrl = getStoreIconUrl(store.storeName);
  const fallback = isBest ? "🥇" : "🏪";
  const iconHtml = iconUrl
    ? `<img src="${escapeHtml(iconUrl)}" alt="" class="store-logo" draggable="false" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';" /><span class="store-icon-fallback" style="display:none;">${fallback}</span>`
    : `<span class="store-icon-fallback" style="display:flex;">${fallback}</span>`;

  const storeNameHtml = storeUrl
    ? `<a class="store-name store-name-link" href="${escapeHtml(storeUrl)}" target="_blank" rel="noopener noreferrer" title="رفتن به صفحه اصلی ${escapeHtml(store.storeName)}">
         ${escapeHtml(store.storeName)}
         <svg class="store-name-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
           <line x1="7" y1="17" x2="17" y2="7"></line>
           <polyline points="7 7 17 7 17 17"></polyline>
         </svg>
       </a>`
    : `<span class="store-name">${escapeHtml(store.storeName)}</span>`;

  return `
    <section class="store-section ${isBest ? "best-store" : ""}" style="--store-color: ${storeColor};">
      ${bestTitle}

      <div class="store-header-row">
        <div class="store-logo-wrapper">${iconHtml}</div>
        <div class="store-info">
          <div class="store-name-row">
            ${storeNameHtml}
          </div>
        </div>
        <div class="store-total">
          <span class="total-value">${formatPrice(store.total)}</span>
          <span class="total-currency">تومان</span>
        </div>
      </div>

      <div class="store-body">
        ${badgesColumnHtml}
        <div class="products-strip-wrapper">
          <button class="grid-nav grid-nav-right hidden" type="button" aria-label="قبلی" draggable="false">‹</button>
          <div class="products-strip" data-grid-track>
            ${cards}
          </div>
          <button class="grid-nav grid-nav-left hidden" type="button" aria-label="بعدی" draggable="false">›</button>
        </div>
      </div>

      ${missingHtml}
    </section>
  `;
}

function renderProductCard(item, store, storeColor) {
  const icon = getProductIcon(item.title);
  const hasLink = item.link && item.link !== "#";
  const others = Array.isArray(item.otherItems) ? item.otherItems : [];
  const hasOthers = others.length > 0;
  const totalCount = 1 + others.length;

  let img = item.image;
  if (Array.isArray(img)) img = img[0];
  if (typeof img === "object" && img) img = img.url || img.src;
  const hasImg = img && typeof img === "string" && img.startsWith("http");

  const imgContent = hasImg
    ? `<img src="${escapeHtml(img)}" alt="" class="product-image-real" draggable="false" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.style.display='none'; this.parentElement.innerHTML='<span class=&quot;product-image-icon&quot;>${icon}</span>';" />`
    : `<span class="product-image-icon">${icon}</span>`;

  const stackHtml = hasOthers
    ? `<div class="product-stack-layer stack-layer-2"></div>
       <div class="product-stack-layer stack-layer-1"></div>`
    : "";

  const expandButtonHtml = hasOthers
    ? `<button class="product-expand-button" type="button" draggable="false">
         <svg class="product-expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
           <polyline points="15 18 9 12 15 6"></polyline>
         </svg>
         <span>مشاهده ${toPersianNum(others.length)} آیتم دیگر</span>
       </button>`
    : `<div class="product-expand-placeholder" aria-hidden="true"></div>`;

  const wishlistItem = {
    storeName: store.storeName,
    title: item.title,
    price: item.price,
    link: item.link,
    image: item.image,
  };
  const inWishlist = isInWishlist(wishlistItem);
  const wishlistBtn = `
    <button class="product-wishlist-btn ${inWishlist ? "active" : ""}"
            type="button"
            draggable="false"
            data-store="${escapeHtml(store.storeName)}"
            data-title="${escapeHtml(item.title)}"
            data-price="${item.price}"
            data-link="${escapeHtml(item.link || "")}"
            data-image="${escapeHtml(typeof item.image === "string" ? item.image : "")}"
            title="${inWishlist ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"}">
      ${inWishlist ? "❤️" : "🤍"}
    </button>
  `;

  let expandedHtml = "";
  if (hasOthers) {
    const allItems = [
      {
        title: item.title,
        price: item.price,
        link: item.link,
        image: item.image,
        isSelected: true,
      },
      ...others.map((o) => ({ ...o, isSelected: false })),
    ].sort((a, b) => a.price - b.price);

    expandedHtml = `
      <div class="product-expanded hidden">
        <button class="strip-close" type="button" aria-label="بستن" draggable="false">✕</button>
        <div class="strip-viewport">
          <button class="strip-nav strip-nav-right" type="button" aria-label="قبلی" draggable="false">‹</button>
          <div class="strip-track" data-strip-track data-strip-rtl="true">
            ${allItems.map((it) => renderStripItem(it, storeColor, store.storeName)).join("")}
          </div>
          <button class="strip-nav strip-nav-left" type="button" aria-label="بعدی" draggable="false">›</button>
        </div>
        <div class="strip-counter">${toPersianNum(totalCount)} آیتم · مرتب شده به ترتیب قیمت</div>
      </div>
    `;
  }

  return `
    <div class="product-card ${hasOthers ? "has-others" : ""}">
      ${stackHtml}
      <div class="product-collapsed">
        <div class="product-image-wrapper ${hasImg ? "has-real-image clickable-image" : ""}">
          ${imgContent}
          ${wishlistBtn}
        </div>
        <div class="product-body">
          <div class="product-query">${escapeHtml(item.query)}</div>
          <div class="product-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
          <div class="product-price-section">
            <span class="product-price-value">${formatPrice(item.price)}</span>
            <span class="product-price-currency">تومان</span>
          </div>
          ${expandButtonHtml}
        </div>
        ${hasLink ? `<a class="product-action" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" draggable="false">مشاهده در ${escapeHtml(store.storeName)} ↗</a>` : `<div class="product-action disabled">لینک موجود نیست</div>`}
      </div>
      ${expandedHtml}
    </div>
  `;
}

function renderStripItem(it, storeColor, storeName) {
  const icon = getProductIcon(it.title);
  const hasLink = it.link && it.link !== "#";
  let img = it.image;
  if (Array.isArray(img)) img = img[0];
  if (typeof img === "object" && img) img = img.url || img.src;
  const hasImg = img && typeof img === "string" && img.startsWith("http");
  const imgContent = hasImg
    ? `<img src="${escapeHtml(img)}" alt="" class="strip-item-image" draggable="false" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';" /><span class="strip-item-icon" style="display:none;">${icon}</span>`
    : `<span class="strip-item-icon">${icon}</span>`;

  const wishlistItem = {
    storeName,
    title: it.title,
    price: it.price,
    link: it.link,
    image: it.image,
  };
  const inWishlist = isInWishlist(wishlistItem);
  const wishlistBtn = `
    <button class="product-wishlist-btn strip-wishlist-btn ${inWishlist ? "active" : ""}"
            type="button"
            draggable="false"
            data-store="${escapeHtml(storeName)}"
            data-title="${escapeHtml(it.title)}"
            data-price="${it.price}"
            data-link="${escapeHtml(it.link || "")}"
            data-image="${escapeHtml(typeof it.image === "string" ? it.image : "")}"
            title="${inWishlist ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"}">
      ${inWishlist ? "❤️" : "🤍"}
    </button>
  `;

  return `
    <div class="strip-item ${it.isSelected ? "selected" : ""}" style="--store-color: ${storeColor};">
      ${it.isSelected ? '<span class="strip-item-badge">💰 کمترین قیمت</span>' : ""}
      <div class="strip-item-image-wrapper ${hasImg ? "clickable-image" : ""}">
        ${imgContent}
        ${wishlistBtn}
      </div>
      <div class="strip-item-body">
        <div class="strip-item-title" title="${escapeHtml(it.title)}">${escapeHtml(it.title)}</div>
        <div class="strip-item-price">
          <span class="strip-item-price-value">${formatPrice(it.price)}</span>
          <span class="strip-item-price-currency">تومان</span>
        </div>
      </div>
      ${hasLink ? `<a class="strip-item-action" href="${escapeHtml(it.link)}" target="_blank" rel="noopener noreferrer" draggable="false">مشاهده ↗</a>` : `<div class="strip-item-action disabled">بدون لینک</div>`}
    </div>
  `;
}

function smoothScrollTo(track, target, duration = 1200) {
  const start = track.scrollLeft;
  const dist = target - start;
  if (Math.abs(dist) < 1) return;
  const t0 = performance.now();
  function step(now) {
    const t = Math.min((now - t0) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    track.scrollLeft = start + dist * eased;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function toggleCardExpand(card, expand) {
  if (!card) return;
  const grid =
    card.closest(".products-strip") || card.closest(".products-grid");
  if (!grid) return;
  const allCards = Array.from(grid.querySelectorAll(".product-card"));
  const collapsed = card.querySelector(".product-collapsed");
  const expanded = card.querySelector(".product-expanded");
  if (!collapsed || !expanded) return;

  if (expand) {
    allCards.forEach((c) => {
      if (c !== card && c.classList.contains("expanded"))
        toggleCardExpand(c, false);
    });
    allCards.forEach((c) => {
      if (c !== card) c.classList.add("hidden-sibling");
    });
    card.classList.add("expanded");
    collapsed.classList.add("hidden");
    expanded.classList.remove("hidden");

    const wrapper = card.closest(".products-strip-wrapper");
    const parentTrack = wrapper?.querySelector("[data-grid-track]");
    if (parentTrack) parentTrack.scrollTo({ left: 0, behavior: "smooth" });
    if (wrapper) {
      wrapper.querySelectorAll(".grid-nav").forEach((btn) => {
        btn.style.display = "none";
      });
    }
    requestAnimationFrame(() => {
      const track = card.querySelector("[data-strip-track]");
      if (track) {
        initStripDrag(track);
        smoothScrollTo(track, 0, 1200);
        setTimeout(() => updateNavButtons(card), 1300);
      }
      updateAllWishlistButtons();
    });
  } else {
    card.classList.remove("expanded");
    allCards.forEach((c) => c.classList.remove("hidden-sibling"));
    collapsed.classList.remove("hidden");
    expanded.classList.add("hidden");

    const wrapper = card.closest(".products-strip-wrapper");
    if (wrapper) {
      wrapper.querySelectorAll(".grid-nav").forEach((btn) => {
        btn.style.display = "";
      });
      requestAnimationFrame(() => {
        const parentTrack = wrapper.querySelector("[data-grid-track]");
        if (parentTrack) {
          parentTrack.scrollTo({ left: 0, behavior: "smooth" });
          setTimeout(() => {
            checkGridOverflow(parentTrack);
            updateGridButtons(parentTrack);
          }, 350);
        }
      });
    }
  }
  setTimeout(checkAllGridOverflows, 400);
}

function updateNavButtons(card) {
  const track = card.querySelector("[data-strip-track]");
  const right = card.querySelector(".strip-nav-right");
  const left = card.querySelector(".strip-nav-left");
  if (!track || !right || !left) return;
  if (track.scrollWidth <= track.clientWidth + 2) {
    right.style.display = "none";
    left.style.display = "none";
    return;
  }
  right.style.display = "flex";
  left.style.display = "flex";
  const cur = track.scrollLeft;
  const max = track.scrollWidth - track.clientWidth;
  right.disabled = cur > -2;
  left.disabled = cur < -max + 2;
}

function initStripDrag(track) {
  if (!track || track.dataset.dragInit === "true") return;
  track.dataset.dragInit = "true";
  let dragging = false,
    moved = false,
    startX = 0,
    startScroll = 0;

  track.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest("a, button")) return;
    e.preventDefault();
    dragging = true;
    moved = false;
    startX = e.clientX;
    startScroll = track.scrollLeft;
    track.style.cursor = "grabbing";
    track.style.userSelect = "none";
    track.style.scrollBehavior = "auto";
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    e.preventDefault();
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 3) moved = true;
    track.scrollLeft = startScroll - dx;
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    track.style.cursor = "";
    track.style.userSelect = "";
    track.style.scrollBehavior = "";
    if (moved) {
      const card = track.closest(".product-card");
      if (card) updateNavButtons(card);
    }
  });

  track.addEventListener(
    "click",
    (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    },
    true,
  );

  track.addEventListener("scroll", () => {
    const card = track.closest(".product-card");
    if (card) updateNavButtons(card);
  });
}

function initGridDrag(track) {
  if (!track || track.dataset.gridDragInit === "true") return;
  track.dataset.gridDragInit = "true";
  let dragging = false,
    moved = false,
    startX = 0,
    startScroll = 0;

  track.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest("a, button")) return;
    if (e.target.closest(".product-expand-button")) return;
    e.preventDefault();
    dragging = true;
    moved = false;
    startX = e.clientX;
    startScroll = track.scrollLeft;
    track.style.cursor = "grabbing";
    track.style.userSelect = "none";
    track.style.scrollBehavior = "auto";
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    e.preventDefault();
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 3) moved = true;
    track.scrollLeft = startScroll - dx;
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    track.style.cursor = "";
    track.style.userSelect = "";
    track.style.scrollBehavior = "";
    if (moved) updateGridButtons(track);
  });

  track.addEventListener(
    "click",
    (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    },
    true,
  );

  track.addEventListener("scroll", () => updateGridButtons(track));
}

function checkGridOverflow(track) {
  if (!track) return;
  const wrapper = track.closest(".products-strip-wrapper");
  const right = wrapper?.querySelector(".grid-nav-right");
  const left = wrapper?.querySelector(".grid-nav-left");
  if (!right || !left) return;

  const hasOverflow = track.scrollWidth > track.clientWidth + 2;
  if (hasOverflow) {
    right.classList.remove("hidden");
    left.classList.remove("hidden");
    wrapper.classList.add("scrollable");
  } else {
    right.classList.add("hidden");
    left.classList.add("hidden");
    wrapper.classList.remove("scrollable");
    track.scrollLeft = 0;
  }
  updateGridButtons(track);
}

function checkAllGridOverflows() {
  document.querySelectorAll("[data-grid-track]").forEach(checkGridOverflow);
}

function updateGridButtons(track) {
  const wrapper = track.closest(".products-strip-wrapper");
  const right = wrapper?.querySelector(".grid-nav-right");
  const left = wrapper?.querySelector(".grid-nav-left");
  if (!right || !left) return;
  if (right.classList.contains("hidden") || left.classList.contains("hidden"))
    return;
  const cur = track.scrollLeft;
  const max = track.scrollWidth - track.clientWidth;
  right.disabled = cur > -2;
  left.disabled = cur < -max + 2;
}

window.addEventListener("resize", () => {
  clearTimeout(window.__resizeTimer);
  window.__resizeTimer = setTimeout(checkAllGridOverflows, 200);
});

// ---------- رویدادها ----------
document.addEventListener("click", (e) => {
  const wishlistBtn = e.target.closest(".product-wishlist-btn");
  if (wishlistBtn) {
    e.preventDefault();
    e.stopPropagation();
    const item = {
      storeName: wishlistBtn.dataset.store,
      title: wishlistBtn.dataset.title,
      price: parseInt(wishlistBtn.dataset.price, 10),
      link: wishlistBtn.dataset.link,
      image: wishlistBtn.dataset.image || null,
    };
    toggleWishlist(item);
    return;
  }

  const expandBtn = e.target.closest(".product-expand-button");
  if (expandBtn) {
    e.preventDefault();
    e.stopPropagation();
    toggleCardExpand(expandBtn.closest(".product-card"), true);
    return;
  }

  const closeBtn = e.target.closest(".strip-close");
  if (closeBtn) {
    e.preventDefault();
    toggleCardExpand(closeBtn.closest(".product-card"), false);
    return;
  }

  const gridNav = e.target.closest(".grid-nav");
  if (gridNav) {
    e.preventDefault();
    const wrapper = gridNav.closest(".products-strip-wrapper");
    const track = wrapper?.querySelector("[data-grid-track]");
    if (!track) return;
    const firstCard = track.querySelector(".product-card");
    if (!firstCard) return;
    const cardWidth =
      firstCard.getBoundingClientRect().width +
      parseFloat(getComputedStyle(track).gap || 16);
    const isLeft = gridNav.classList.contains("grid-nav-left");
    track.scrollBy({
      left: isLeft ? -cardWidth : cardWidth,
      behavior: "smooth",
    });
    setTimeout(() => updateGridButtons(track), 350);
    return;
  }

  const nav = e.target.closest(".strip-nav");
  if (nav) {
    e.preventDefault();
    const card = nav.closest(".product-card");
    const track = card?.querySelector("[data-strip-track]");
    if (!track) return;
    const first = track.querySelector(".strip-item");
    if (!first) return;
    const w =
      first.getBoundingClientRect().width +
      parseFloat(getComputedStyle(track).gap || 12);
    const isLeft = nav.classList.contains("strip-nav-left");
    track.scrollBy({ left: isLeft ? -w : w, behavior: "smooth" });
    setTimeout(() => updateNavButtons(card), 350);
    return;
  }

  const stripImg = e.target.closest(
    ".strip-item-image-wrapper.clickable-image",
  );
  if (stripImg) {
    if (e.target.closest(".product-wishlist-btn")) return;
    const img = stripImg.querySelector(".strip-item-image");
    if (img?.src) {
      const title =
        stripImg
          .closest(".strip-item")
          ?.querySelector(".strip-item-title")
          ?.textContent?.trim() || "";
      openImageModal(img.src, title, img.alt);
      return;
    }
  }

  const prodImg = e.target.closest(".product-image-wrapper.clickable-image");
  if (prodImg) {
    if (e.target.closest(".product-wishlist-btn")) return;
    const img = prodImg.querySelector(".product-image-real");
    if (img?.src) {
      const title =
        prodImg
          .closest(".product-card")
          ?.querySelector(".product-title")
          ?.textContent?.trim() || "";
      openImageModal(img.src, title, img.alt);
      return;
    }
  }
});

document.addEventListener("click", (e) => {
  const modal = document.getElementById("wishlist-modal");
  if (!modal || modal.classList.contains("hidden")) return;
  if (
    e.target.closest(".wishlist-modal-close") ||
    e.target.classList.contains("wishlist-modal-backdrop")
  ) {
    closeWishlistModal();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const modal = document.getElementById("wishlist-modal");
    if (modal && !modal.classList.contains("hidden")) closeWishlistModal();
  }
});

document.addEventListener(
  "dragstart",
  (e) => {
    if (e.target.closest(".clickable-image img")) return;
    e.preventDefault();
    return false;
  },
  true,
);

document.addEventListener(
  "mousedown",
  (e) => {
    if (e.target.closest(".product-wishlist-btn")) return;
    const stripItem = e.target.closest(".strip-item");
    if (stripItem) {
      if (e.target.closest("a, button")) return;
      e.preventDefault();
      return;
    }
    const interactive = e.target.closest(
      "a, button, .product-action, .product-expand-button, .store-strip-card, .strip-nav, .strip-close, .grid-nav, .product-wishlist-btn",
    );
    if (interactive && e.detail > 1) {
      e.preventDefault();
    }
  },
  true,
);

function disableAllDraggable() {
  document.querySelectorAll("a, img").forEach((el) => {
    el.setAttribute("draggable", "false");
  });
}

const observer = new MutationObserver((mutations) => {
  mutations.forEach((m) => {
    m.addedNodes.forEach((node) => {
      if (node.nodeType === 1) {
        if (node.tagName === "A" || node.tagName === "IMG") {
          node.setAttribute("draggable", "false");
        }
        node
          .querySelectorAll?.("a, img")
          .forEach((el) => el.setAttribute("draggable", "false"));
      }
    });
  });
});
observer.observe(document.body, { childList: true, subtree: true });

// ---------- نقشه ----------
function getStoreIconUrl(name) {
  const map = {
    دیجی‌کالا: "digikala.com",
    ترب: "torob.com",
    قلم‌تراش: "ghalamtarash.ir",
    "آرمان آرت": "armanartstore.com",
    عالم‌زاده: "alemzadeh.ir",
    "مهستان آرت": "mahestanart.com",
    "مجد مارکت": "majdmarket.com",
  };
  return map[name]
    ? `https://www.google.com/s2/favicons?domain=${map[name]}&sz=128`
    : null;
}

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

function buildStoreCard(store) {
  return `
    <a class="store-strip-card" style="--store-color: ${store.color};" href="${escapeHtml(store.url)}" target="_blank" rel="noopener noreferrer" draggable="false">
      <div class="store-strip-info"><span class="store-strip-name">${escapeHtml(store.name)}</span></div>
      <div class="store-strip-logo">
        <img src="${escapeHtml(store.icon)}" alt="" draggable="false" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.parentElement.innerHTML='<span class=&quot;store-strip-fallback&quot;>🏪</span>';" />
      </div>
    </a>
  `;
}

function renderSupportedStores() {
  const strip = document.getElementById("stores-strip");
  if (!strip) return;
  const cards = [...SUPPORTED_STORES].reverse().map(buildStoreCard).join("");
  strip.innerHTML = `<div class="stores-strip-track">${cards}</div><div class="stores-strip-track" aria-hidden="true">${cards}</div>`;
  strip.style.direction = "ltr";
  initStripAutoScroll();
}

function initStripAutoScroll() {
  const wrapper = document.querySelector(".supported-stores");
  const strip = document.getElementById("stores-strip");
  if (!wrapper || !strip) return;
  let pos = 0,
    lastT = performance.now();
  const SPEED = 25;
  let mDown = false,
    dragging = false,
    suppress = false;
  let startX = 0,
    startPos = 0,
    hover = false,
    trackW = 0;

  function measure() {
    const t = strip.querySelector(".stores-strip-track");
    if (t) trackW = t.getBoundingClientRect().width;
  }
  measure();
  window.addEventListener("resize", measure);

  function tick(now) {
    const dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    if (trackW > 0) {
      if (!hover && !dragging) pos -= SPEED * dt;
      pos = pos % trackW;
      if (pos > 0) pos -= trackW;
      strip.style.transform = `translateX(${pos}px)`;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame((t) => {
    lastT = t;
    requestAnimationFrame(tick);
  });

  wrapper.addEventListener("mouseenter", () => {
    hover = true;
  });
  wrapper.addEventListener("mouseleave", () => {
    hover = false;
    mDown = false;
    dragging = false;
  });
  wrapper.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    mDown = true;
    dragging = false;
    suppress = false;
    startX = e.clientX;
    startPos = pos;
  });
  document.addEventListener("mousemove", (e) => {
    if (!mDown) return;
    const dx = e.clientX - startX;
    if (!dragging && Math.abs(dx) > 5) {
      dragging = true;
      suppress = true;
    }
    if (dragging) pos = startPos + dx;
  });
  document.addEventListener("mouseup", () => {
    if (mDown) {
      mDown = false;
      dragging = false;
    }
  });
  wrapper.addEventListener(
    "click",
    (e) => {
      if (suppress) {
        e.preventDefault();
        e.stopPropagation();
        suppress = false;
      }
    },
    true,
  );
  wrapper.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      pos -= (e.deltaY + e.deltaX) * 0.6;
    },
    { passive: false },
  );
}

// ---------- مودال تصویر ----------
const imageModal = document.getElementById("image-modal");
const imageModalImg = document.getElementById("image-modal-img");
const imageModalCaption = imageModal?.querySelector(".image-modal-caption");
const imageModalClose = imageModal?.querySelector(".image-modal-close");
const imageModalBackdrop = imageModal?.querySelector(".image-modal-backdrop");

function openImageModal(src, cap, alt) {
  if (!imageModal) return;
  imageModalImg.src = src;
  imageModalImg.alt = alt || "";
  if (imageModalCaption) imageModalCaption.textContent = cap || "";
  imageModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeImageModal() {
  if (!imageModal) return;
  imageModal.classList.add("hidden");
  imageModalImg.src = "";
  document.body.style.overflow = "";
}
if (imageModalClose) imageModalClose.addEventListener("click", closeImageModal);
if (imageModalBackdrop)
  imageModalBackdrop.addEventListener("click", closeImageModal);

// ---------- کمکی ----------
function setLoading(v) {
  searchBtn.disabled = v;
  spinner.classList.toggle("active", v);
}
function showError(m) {
  errorBox.textContent = "⚠️ " + m;
  errorBox.classList.remove("hidden");
}
function hideError() {
  errorBox.classList.add("hidden");
}
function formatPrice(p) {
  return Number(p).toLocaleString("fa-IR");
}
function escapeHtml(t) {
  const d = document.createElement("div");
  d.textContent = t;
  return d.innerHTML;
}

addBtn.addEventListener("click", addItem);
itemInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addItem();
});
searchBtn.addEventListener("click", search);
clearBtn.addEventListener("click", clearAll);

const wishlistFloatBtn = document.getElementById("wishlist-float-btn");
if (wishlistFloatBtn)
  wishlistFloatBtn.addEventListener("click", openWishlistModal);

const wishlistClearAllBtn = document.getElementById("wishlist-clear-all");
if (wishlistClearAllBtn)
  wishlistClearAllBtn.addEventListener("click", clearAllWishlist);

// ---------- تم ----------
const themeToggle = document.getElementById("theme-toggle");
const themeIcon = themeToggle.querySelector(".theme-icon");
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  themeIcon.textContent = t === "dark" ? "☀️" : "🌙";
  localStorage.setItem("theme", t);
}
function initTheme() {
  const s = localStorage.getItem("theme");
  if (s) applyTheme(s);
  else
    applyTheme(
      window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
    );
}
themeToggle.addEventListener("click", () => {
  const c = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(c === "dark" ? "light" : "dark");
});
initTheme();

renderSupportedStores();
disableAllDraggable();
initSortToggle();
updateWishlistFloatBtn();
