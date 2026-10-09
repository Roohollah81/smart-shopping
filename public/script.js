// ================================================================
// public/script.js
// ================================================================

// ----------------------------------------------------------------
// DOM ELEMENTS
// ----------------------------------------------------------------
const itemInput = document.getElementById("item-input");
const addBtn = document.getElementById("add-btn");
const searchBtn = document.getElementById("search-btn");
const searchBtnText = document.getElementById("search-btn-text");
const clearBtn = document.getElementById("clear-btn");
const cancelBtn = document.getElementById("cancel-btn");
const itemsList = document.getElementById("items-list");
const resultsSection = document.getElementById("results-section");
const storesContainer = document.getElementById("stores-container");
const errorBox = document.getElementById("error-box");
const spinner = document.getElementById("spinner");

// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
let items = [];
let currentSort = localStorage.getItem("sortOrder") || "price";
let lastBasketComparison = null;
let wishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
let wishlistLastChange = localStorage.getItem("wishlistLastChange") || null;

let searchAborted = false;
let searchController = null;
let suppressNextPopstate = false;

const productDataMap = new Map();
let productDataCounter = 0;
const imageGalleryCache = new Map();
let prefetchAbort = false;

// ----------------------------------------------------------------
// STORES
// ----------------------------------------------------------------
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

// ----------------------------------------------------------------
// STORE META
// ----------------------------------------------------------------
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
    shipping: null,
    shippingIcon: null,
    note: "ترب یک ارائه‌دهنده و مقایسه‌کننده قیمت است و خرید مستقیم این محصولات در آن انجام نمی‌شود.",
    badges: [],
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
        link: "https://torob.com/shop/1043/",
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
        category: "trust",
        img: "/badges/zarinpal.png",
        link: "https://www.zarinpal.com/trustPage/armanartstore.com",
        alt: "زرین‌پال",
      },
      {
        category: "shipping",
        img: "/badges/express-shipping.png",
        link: null,
        alt: "اکسپرس",
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

// ----------------------------------------------------------------
// FUN MESSAGES (تسک ۳۵)
// ----------------------------------------------------------------
const FUN_MESSAGES = {
  none: [
    "هیچی پیدا نشد... شاید باید دقیق‌تر بنویسی 🤔",
    "فروشگاه‌ها گیج شدن! یه بار دیگه امتحان کن 🙃",
    "این یکی رو نداشتیم! ولی ناامید نشو 😅",
    "هیچ نتیجه‌ای نیومد. یه کلمه دیگه امتحان کن ✨",
  ],
  success: [
    "عالی بود! 🎉 ارزون‌ترینش رو پیدا کردیم",
    "دیدیم و اومدیم! 👀 مقایسه آماده‌ست",
    "خب اینم از جیب‌دوزی امروز 💸",
    "همه‌چیز آماده‌ست، بریم خرید 🛒",
  ],
  loading: [
    "داریم زیر و رو می‌کنیم... 🔍",
    "یه لحظه، داریم همه فروشگاه‌ها رو می‌گردیم 🏃",
    "داره گرم می‌شه! 🔥",
  ],
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
function getStoreMeta(storeName) {
  return (
    STORE_META[storeName] || { shipping: null, shippingIcon: null, badges: [] }
  );
}

function getCategoryLabel(category) {
  const labels = {
    trust: "ضمانت و اعتماد",
    shipping: "ارسال",
    payment: "پرداخت اقساطی",
    info: "اطلاعات",
  };
  return labels[category] || "نشان";
}

function getStoreColor(storeName) {
  const s = SUPPORTED_STORES.find((x) => x.name === storeName);
  return s ? s.color : "#6366f1";
}

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

function escapeHtml(t) {
  const d = document.createElement("div");
  d.textContent = t;
  return d.innerHTML;
}

function formatPrice(p) {
  return Number(p).toLocaleString("fa-IR");
}

function toPersianNum(num) {
  const persian = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return String(num).replace(/\d/g, (d) => persian[parseInt(d, 10)]);
}

function hexToRgba(hex, alpha = 1) {
  if (!hex || !hex.startsWith("#")) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ----------------------------------------------------------------
// SLOT MACHINE
// ----------------------------------------------------------------
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

// ----------------------------------------------------------------
// TOAST (تسک ۲۵ — بستن با کلیک، نگه‌داشتن با هاور)
// ----------------------------------------------------------------
function showToast(title, message, type = "success", duration = 5000) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const icons = {
    success: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    remove: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    info: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
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

  let closeTimer = setTimeout(dismiss, duration);
  let dismissed = false;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(closeTimer);
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 350);
  }

  toast.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;
    dismiss();
  });

  toast.addEventListener("mouseenter", () => clearTimeout(closeTimer));
  toast.addEventListener("mouseleave", () => {
    if (!dismissed) closeTimer = setTimeout(dismiss, 1500);
  });
}

// ----------------------------------------------------------------
// CONFIRM DIALOG
// ----------------------------------------------------------------
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

// ----------------------------------------------------------------
// WISHLIST
// ----------------------------------------------------------------
function getWishlistKey(item) {
  return `${item.storeName}::${item.title}`;
}

function isInWishlist(item) {
  const key = getWishlistKey(item);
  return wishlist.some((w) => getWishlistKey(w) === key);
}

function saveWishlist() {
  updateWishlistLastChange();
  localStorage.setItem("wishlist", JSON.stringify(wishlist));
  updateWishlistFloatBtn();
}

function updateWishlistLastChange() {
  wishlistLastChange = new Date().toISOString();
  localStorage.setItem("wishlistLastChange", wishlistLastChange);
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
      addedAt: new Date().toISOString(),
      initialPrice: item.price,
      history: [{ price: item.price, at: new Date().toISOString() }],
    });
    showToast("به علاقه‌مندی‌ها اضافه شد ❤️", item.title, "success", 5000);
  }
  saveWishlist();
  updateAllWishlistButtons();
  const modal = document.getElementById("wishlist-modal");
  if (modal && !modal.classList.contains("hidden")) renderWishlistModal();
}

// ─── تسک ۵۲: بروزرسانی قیمت علاقه‌مندی‌ها ───
function updateWishlistPrices(queryResults) {
  if (!queryResults || queryResults.length === 0) return;
  const priceMap = new Map();
  for (const q of queryResults) {
    for (const m of q.matches || []) {
      for (const o of m.offers || []) {
        const key = `${o.storeName}::${o.productTitle}`;
        const current = priceMap.get(key);
        if (!current || o.price < current) {
          priceMap.set(key, o.price);
        }
      }
    }
  }
  let changes = 0;
  let totalDiff = 0;
  wishlist.forEach((w) => {
    const key = getWishlistKey(w);
    const newPrice = priceMap.get(key);
    if (newPrice && newPrice !== w.price) {
      const diff = w.price - newPrice;
      w.history = w.history || [];
      w.history.push({ price: newPrice, at: new Date().toISOString() });
      if (w.history.length > 30) w.history = w.history.slice(-30);
      w.price = newPrice;
      w.lastChange = { diff, at: new Date().toISOString() };
      changes++;
      totalDiff += diff;
    }
  });
  if (changes > 0) {
    saveWishlist();
    const emoji = totalDiff > 0 ? "🔻" : "🔺";
    showToast(
      `${changes} محصول تغییر قیمت داد ${emoji}`,
      totalDiff > 0
        ? `جمعاً ${formatPrice(Math.abs(totalDiff))} تومان ارزون‌تر شد`
        : `جمعاً ${formatPrice(Math.abs(totalDiff))} تومان گرون‌تر شد`,
      "info",
      6000,
    );
  }
}

function removeFromWishlist(item) {
  const key = getWishlistKey(item);
  wishlist = wishlist.filter((w) => getWishlistKey(w) !== key);
  saveWishlist();
  updateAllWishlistButtons();
  renderWishlistModal();
}

function updateAllWishlistButtons() {
  document
    .querySelectorAll(".product-wishlist-btn, .variant-card-wishlist-btn")
    .forEach((btn) => {
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

function formatPersianDateTime(isoString) {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    const dateFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const timeFormatter = new Intl.DateTimeFormat("fa-IR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `آخرین تغییر: ${dateFormatter.format(date)} - ساعت ${timeFormatter.format(date)}`;
  } catch (e) {
    return "";
  }
}

function renderWishlistModal() {
  const body = document.getElementById("wishlist-modal-body");
  const totalEl = document.getElementById("wishlist-modal-total");
  const toolbar = document.getElementById("wishlist-modal-toolbar");
  const dateEl = document.getElementById("wishlist-modal-date");
  if (wishlist.length === 0) {
    if (totalEl) {
      totalEl.classList.add("hidden");
      totalEl.innerHTML = "";
    }
    if (toolbar) toolbar.classList.add("hidden");
    if (dateEl) dateEl.textContent = "";
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
  if (dateEl) dateEl.textContent = formatPersianDateTime(wishlistLastChange);
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

      let priceChangeHtml = "";
      if (
        item.lastChange &&
        item.initialPrice &&
        item.initialPrice !== item.price
      ) {
        const diff = item.initialPrice - item.price;
        const pct = Math.round((Math.abs(diff) / item.initialPrice) * 100);
        const isDown = diff > 0;
        const color = isDown ? "#10b981" : "#ef4444";
        const arrow = isDown ? "🔻" : "🔺";
        priceChangeHtml = `
          <div class="wishlist-item-change" style="color: ${color}; font-size: 0.7rem; font-weight: 700; margin-top: 0.2rem;">
            ${arrow} ${toPersianNum(pct)}٪ ${isDown ? "ارزون‌تر" : "گرون‌تر"}
          </div>
        `;
      }

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
            ${priceChangeHtml}
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

// ----------------------------------------------------------------
// BASKET PERSISTENCE (تسک ۲۹)
// ----------------------------------------------------------------
const BASKET_KEY = "basketItems";

function saveBasket() {
  localStorage.setItem(BASKET_KEY, JSON.stringify(items));
}

function loadBasket() {
  try {
    const raw = JSON.parse(localStorage.getItem(BASKET_KEY) || "[]");
    if (Array.isArray(raw)) items = raw.slice(0, 10);
  } catch {}
}

// ----------------------------------------------------------------
// RECENT SEARCHES (تسک ۵۱)
// ----------------------------------------------------------------
const RECENT_KEY = "recentSearches";
const RECENT_LIMIT = 8;

function getRecentSearches() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(itemsArr) {
  if (!itemsArr || itemsArr.length === 0) return;
  const existing = getRecentSearches();
  const combined = [...itemsArr, ...existing];
  const unique = [];
  const seen = new Set();
  for (const it of combined) {
    const key = String(it).trim().toLowerCase();
    if (key && !seen.has(key) && unique.length < RECENT_LIMIT) {
      seen.add(key);
      unique.push(it);
    }
  }
  localStorage.setItem(RECENT_KEY, JSON.stringify(unique));
  renderSuggestions();
}

// ----------------------------------------------------------------
// SUGGESTIONS (تسک ۲۸ + ۵۱)
// ----------------------------------------------------------------
const SAMPLE_ITEMS = [
  "قلمو سرگرد شماره ۴",
  "مقوا A4",
  "آبرنگ ۱۲ رنگ",
  "مداد HB",
  "دفتر اسکچ",
  "پاک‌کن اتود",
];

function renderSuggestions() {
  const container = document.getElementById("suggestions-box");
  if (!container) return;

  const recent = getRecentSearches();
  const suggestions = recent.length >= 3 ? recent : SAMPLE_ITEMS;
  const title =
    recent.length >= 3 ? "🕐 اخیراً جستجو کردی:" : "✨ پیشنهاد شروع:";

  container.innerHTML = `
    <div class="suggestions-title">${title}</div>
    <div class="suggestions-list">
      ${suggestions
        .map(
          (s) => `
        <button class="suggestion-chip" type="button" data-value="${escapeHtml(s)}">
          ${escapeHtml(s)}
        </button>
      `,
        )
        .join("")}
    </div>
  `;
}

// ----------------------------------------------------------------
// SORTING
// ----------------------------------------------------------------
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
  if (currentSort === order) return;
  currentSort = order;
  localStorage.setItem("sortOrder", order);

  document.querySelectorAll(".sort-option").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.sort === order);
  });

  const label = order === "price" ? "کمترین قیمت" : "بیشترین موجودی";
  showToast(
    "ترتیب نمایش تغییر کرد",
    `فروشگاه‌ها بر اساس «${label}» مرتب شدند`,
    "info",
    3000,
  );

  if (lastBasketComparison && lastBasketComparison.length > 0) {
    const sorted = applySorting(lastBasketComparison);
    renderStoreSections(sorted);
    setTimeout(() => {
      const target =
        document.querySelector(".store-section.best-store") ||
        document.querySelector(".store-section");
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
  }
}

function handleSortClick(e) {
  e.preventDefault();
  e.stopPropagation();
  const order = e.currentTarget.dataset.sort;
  if (order) setSortOrder(order);
}

function initSortToggle() {
  document.querySelectorAll(".sort-option").forEach((btn) => {
    btn.removeEventListener("click", handleSortClick);
    btn.addEventListener("click", handleSortClick);
    btn.classList.toggle("active", btn.dataset.sort === currentSort);
  });
}

// ----------------------------------------------------------------
// HEADER INFO
// ----------------------------------------------------------------
function updateDateTime() {
  const now = new Date();
  let dateStr = "—";
  let timeStr = "—";
  try {
    const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).formatToParts(now);
    const get = (t) => parts.find((p) => p.type === t)?.value || "";
    dateStr = `${get("weekday")} ${get("day")} ${get("month")} ${get("year")}`;
    timeStr = new Intl.DateTimeFormat("fa-IR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(now);
  } catch (e) {}
  const set = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };
  set("datetime-date", dateStr);
  set("datetime-time", timeStr);
  set("top-datetime-date", dateStr);
  set("top-datetime-time", timeStr);
}

async function fetchDollarRate() {
  const set = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };
  set("dollar-value", "...");
  set("top-dollar-value", "...");
  try {
    const res = await fetch("/api/dollar");
    const data = await res.json();
    if (data?.success && data.price) {
      const txt = Number(data.price).toLocaleString("fa-IR");
      set("dollar-value", txt);
      set("top-dollar-value", txt);
    } else {
      set("dollar-value", "—");
      set("top-dollar-value", "—");
    }
  } catch {
    set("dollar-value", "—");
    set("top-dollar-value", "—");
  }
}

// ----------------------------------------------------------------
// STICKY HEADER
// ----------------------------------------------------------------
function initStickyHeader() {
  const stickyHeader = document.getElementById("sticky-header");
  const stickySort = document.getElementById("sticky-sort");
  const topInfoBar = document.getElementById("top-info-bar");
  const topSort = document.getElementById("top-sort");

  if (!stickyHeader) return;

  let ticking = false;

  function checkDollar() {
    const center = stickyHeader.querySelector(".sticky-center");
    const dollar = stickyHeader.querySelector(".sticky-dollar");
    if (!center || !dollar) return;
    stickyHeader.classList.remove("hide-dollar");
    void stickyHeader.offsetWidth;
    if (center.scrollWidth > center.clientWidth + 2) {
      stickyHeader.classList.add("hide-dollar");
    }
  }

  function updateSticky() {
    const topInfoBarBottom = topInfoBar
      ? topInfoBar.getBoundingClientRect().bottom
      : 200;
    if (topInfoBarBottom < 0) {
      stickyHeader.classList.add("visible");
      checkDollar();
    } else {
      stickyHeader.classList.remove("visible");
    }
    if (topSort && !topSort.classList.contains("hidden")) {
      const r = topSort.getBoundingClientRect();
      if (r.bottom < 0) stickySort.classList.remove("hidden");
      else stickySort.classList.add("hidden");
    } else {
      stickySort.classList.add("hidden");
    }
    ticking = false;
  }

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        window.requestAnimationFrame(updateSticky);
        ticking = true;
      }
    },
    { passive: true },
  );

  window.addEventListener("resize", () => setTimeout(checkDollar, 100));
  updateSticky();
}

// ----------------------------------------------------------------
// PRODUCT ICON
// ----------------------------------------------------------------
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

// ----------------------------------------------------------------
// ITEMS
// ----------------------------------------------------------------
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
  saveBasket();
}

function removeItem(i) {
  if (itemsList.classList.contains("locked")) return;
  items.splice(i, 1);
  renderItems();
  saveBasket();
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
  saveBasket();
  resultsSection.classList.add("hidden");
  document.getElementById("top-sort")?.classList.add("hidden");
  document.getElementById("sticky-sort")?.classList.add("hidden");
  hideError();
  stopStoreCycle();
  searchBtn.classList.remove("searching");
  setLoading(false);
  lastBasketComparison = null;
  window.__lastQueries = null;

  prefetchAbort = true;
  imageGalleryCache.clear();
  productDataMap.clear();
  productDataCounter = 0;

  const varModal = document.getElementById("variants-modal");
  if (varModal && !varModal.classList.contains("hidden")) {
    varModal.classList.add("hidden");
    document.body.style.overflow = "";
  }
  renderSuggestions();
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

// ----------------------------------------------------------------
// LOG SEARCH (باگ ۰.۲)
// ----------------------------------------------------------------
function logSearch(payload) {
  fetch("/api/log-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

// ----------------------------------------------------------------
// SKELETON LOADING (تسک ۲۷)
// ----------------------------------------------------------------
function renderSkeleton() {
  const skeletons = [];
  for (let s = 0; s < 2; s++) {
    const cards = [];
    for (let i = 0; i < 3; i++) {
      cards.push(`
        <div class="skeleton-card">
          <div class="skeleton-image shimmer"></div>
          <div class="skeleton-body">
            <div class="skeleton-line skeleton-line-sm shimmer"></div>
            <div class="skeleton-line skeleton-line-lg shimmer"></div>
            <div class="skeleton-line skeleton-line-md shimmer"></div>
          </div>
        </div>
      `);
    }
    skeletons.push(`
      <div class="store-section skeleton-store">
        <div class="store-header-row">
          <div class="skeleton-circle shimmer"></div>
          <div class="skeleton-header-lines">
            <div class="skeleton-line skeleton-line-md shimmer"></div>
            <div class="skeleton-line skeleton-line-sm shimmer"></div>
          </div>
        </div>
        <div class="skeleton-cards-row">${cards.join("")}</div>
      </div>
    `);
  }
  return `
    <div class="skeleton-container">
      <div class="skeleton-title shimmer"></div>
      ${skeletons.join("")}
    </div>
  `;
}

function showSkeleton() {
  if (!storesContainer) return;
  storesContainer.innerHTML = renderSkeleton();
  resultsSection.classList.remove("hidden");
}

// ----------------------------------------------------------------
// SEARCH (باگ ۰.۱ + ۳۵)
// ----------------------------------------------------------------
async function search() {
  if (items.length === 0) {
    showToast("سبد خالیه", pickRandom(FUN_MESSAGES.none), "info", 3000);
    return;
  }
  hideError();
  setLoading(true);
  searchAborted = false;

  searchController = new AbortController();
  const signal = searchController.signal;

  if (cancelBtn) {
    cancelBtn.classList.remove("hidden");
    cancelBtn.disabled = false;
  }

  document
    .querySelectorAll(".item-chip")
    .forEach((chip) => chip.classList.remove("done", "error", "active"));
  searchBtn.classList.add("searching");
  itemsList.classList.add("locked");
  clearBtn.classList.add("hidden");
  addBtn.disabled = true;
  startStoreCycle();

  showSkeleton();

  const searchStartTime = Date.now();

  try {
    const queryResults = [];
    for (let i = 0; i < items.length; i++) {
      if (searchAborted) break;
      const item = items[i];
      markChipActive(i);
      animateSlot("slot-item", item);
      try {
        const r = await fetch("/api/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: [item] }),
          signal,
        });
        if (searchAborted) break;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (data.success && data.data?.queries?.[0]) {
          queryResults.push(data.data.queries[0]);
          markChipDone(i);
        } else {
          markChipError(i);
        }
      } catch (e) {
        if (e.name === "AbortError" || searchAborted) break;
        console.error(`Error searching "${item}":`, e);
        markChipError(i);
      }
    }

    if (searchAborted) {
      showToast("جستجو لغو شد", "عملیات توسط شما متوقف شد", "remove", 3000);
      resultsSection.classList.add("hidden");
      return;
    }

    const validQueries = queryResults.filter(Boolean);
    const durationMs = Date.now() - searchStartTime;

    if (validQueries.length === 0) {
      showError(pickRandom(FUN_MESSAGES.none));
      resultsSection.classList.add("hidden");
      logSearch({
        items: [...items],
        totalResults: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        storesWithResults: [],
        storesWithoutResults: SUPPORTED_STORES.map((s) => s.name),
        durationMs,
      });
      return;
    }

    window.__lastQueries = validQueries;

    const basketComparison = computeBasketComparison(validQueries);
    renderResults({ queries: validQueries, basketComparison });
    saveRecentSearch(items);
    updateWishlistPrices(validQueries);

    const storesWithResultsSet = new Set();
    let totalResults = 0;
    let totalAccepted = 0;
    let totalRejected = 0;

    for (const q of validQueries) {
      for (const m of q.matches || []) {
        for (const o of m.offers || []) storesWithResultsSet.add(o.storeName);
        totalResults += (m.offers || []).length;
      }
      if (q.stats) {
        totalAccepted += q.stats.accepted || 0;
        totalRejected += q.stats.rejected || 0;
      }
    }

    const storesWithoutResults = SUPPORTED_STORES.map((s) => s.name).filter(
      (s) => !storesWithResultsSet.has(s),
    );

    logSearch({
      items: [...items],
      totalResults,
      acceptedCount: totalAccepted,
      rejectedCount: totalRejected,
      storesWithResults: Array.from(storesWithResultsSet),
      storesWithoutResults,
      durationMs,
    });
  } catch (e) {
    if (!searchAborted && e.name !== "AbortError") {
      showError("خطا در جستجو: " + (e.message || "خطای نامشخص"));
      console.error(e);
    }
  } finally {
    stopStoreCycle();
    searchBtn.classList.remove("searching");
    setLoading(false);
    itemsList.classList.remove("locked");
    addBtn.disabled = false;
    clearBtn.classList.remove("hidden");
    if (cancelBtn) cancelBtn.classList.add("hidden");
    searchController = null;
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
          images: cheapest.images || (cheapest.image ? [cheapest.image] : []),
          productId: cheapest.productId || null,
          otherItems: others.map((o) => ({
            title: o.productTitle,
            price: o.price,
            link: o.link,
            image: o.image || null,
            images: o.images || (o.image ? [o.image] : []),
            productId: o.productId || null,
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

// ----------------------------------------------------------------
// RESULTS
// ----------------------------------------------------------------
function renderResults(data) {
  const { basketComparison } = data;
  if (!basketComparison || basketComparison.length === 0) {
    showError(pickRandom(FUN_MESSAGES.none));
    resultsSection.classList.add("hidden");
    document.getElementById("top-sort")?.classList.add("hidden");
    document.getElementById("sticky-sort")?.classList.add("hidden");
    return;
  }
  lastBasketComparison = basketComparison;
  const sorted = applySorting(basketComparison);
  renderStoreSections(sorted);

  document.getElementById("top-sort")?.classList.remove("hidden");
  resultsSection.classList.remove("hidden");
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });

  setTimeout(() => {
    showToast(
      "آماده شد! ✅",
      pickRandom(FUN_MESSAGES.success),
      "success",
      3500,
    );
  }, 400);
}

function renderStoreSections(sortedStores) {
  if (!sortedStores || sortedStores.length === 0) return;

  let hasBest = true;
  if (sortedStores.length > 1) {
    const first = sortedStores[0];
    const second = sortedStores[1];
    if (first.total === second.total && first.itemCount === second.itemCount) {
      hasBest = false;
    }
  }

  let html = "";
  if (hasBest) {
    html += renderStoreSection(sortedStores[0], true);
    for (let i = 1; i < sortedStores.length; i++)
      html += renderStoreSection(sortedStores[i], false);
  } else {
    for (const s of sortedStores) html += renderStoreSection(s, false);
  }

  storesContainer.innerHTML = html;
  requestAnimationFrame(() => {
    document.querySelectorAll("[data-grid-track]").forEach(initGridDrag);
    disableAllDraggable();
    updateAllWishlistButtons();
    initBadgeRotation();
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

  const trustBadges = badges.filter((b) => b.category === "trust");
  const shippingBadges = badges.filter((b) => b.category === "shipping");
  const paymentBadges = badges.filter((b) => b.category === "payment");
  const infoBadges = badges.filter((b) => b.category === "info");

  const buildGroup = (labelIcon, labelText, className, list) => {
    if (list.length === 0) return "";
    return `
      <div class="store-badge-group ${className}">
        <div class="store-badge-group-label">
          ${labelIcon ? `<span>${labelIcon}</span>` : ""}
          <span>${labelText}</span>
        </div>
        <div class="store-badge-group-items">
          ${list.map(buildBadgeRow).join("")}
        </div>
      </div>
    `;
  };

  const cityRowHtml = storeMeta.shipping
    ? `
      <div class="store-badge-group group-city">
        <div class="store-badge-group-label">
          <span>ارسال از</span>
        </div>
        <div class="store-badge-group-items single">
          <div class="store-badge-row store-badge-row-city" title="ارسال از ${escapeHtml(storeMeta.shipping)}">
            <span class="store-badge-thumb">
              <img src="${storeMeta.shippingIcon}" alt="" class="store-badge-img" onerror="this.style.display='none';" />
            </span>
            <span class="store-badge-text">${escapeHtml(storeMeta.shipping)}</span>
          </div>
        </div>
      </div>
    `
    : "";

  const noteHtml = storeMeta.note
    ? `<aside class="store-note-vertical">
         <img src="/badges/warning-icon.png" alt="" class="store-note-icon" onerror="this.style.display='none';" />
         <div class="store-note-text">${escapeHtml(storeMeta.note)}</div>
       </aside>`
    : "";

  const badgesColumnHtml =
    badges.length > 0 || storeMeta.shipping
      ? `
    <aside class="store-badges-column">
      ${cityRowHtml}
      ${buildGroup("", "ضمانت و اعتماد", "group-trust", trustBadges)}
      ${buildGroup("", "ارسال", "group-shipping", shippingBadges)}
      ${buildGroup("", "پرداخت اقساطی", "group-payment", paymentBadges)}
      ${buildGroup("", "اطلاعات", "group-info", infoBadges)}
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
      <div class="store-header-row">
        <div class="store-logo-wrapper">${iconHtml}</div>
        <div class="store-info">
          <div class="store-name-row">${storeNameHtml}</div>
        </div>
        <div class="store-total">
          <svg class="store-total-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="21" r="1"></circle>
            <circle cx="20" cy="21" r="1"></circle>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
          </svg>
          <span class="total-value">${formatPrice(store.total)}</span>
          <span class="total-currency">تومان</span>
        </div>
      </div>
      <div class="store-body">
        ${noteHtml || badgesColumnHtml || '<div class="store-badges-spacer"></div>'}
        <div class="products-strip-wrapper">
          <button class="grid-nav grid-nav-right hidden" type="button" aria-label="قبلی" draggable="false">‹</button>
          <div class="products-strip" data-grid-track>${cards}</div>
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

  let img = item.image;
  if (Array.isArray(img)) img = img[0];
  if (typeof img === "object" && img) img = img.url || img.src;
  const hasImg = img && typeof img === "string" && img.startsWith("http");
  const imgContent = hasImg
    ? `<img src="${escapeHtml(img)}" alt="" class="product-image-real" draggable="false" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.style.display='none'; this.parentElement.innerHTML='<span class=&quot;product-image-icon&quot;>${icon}</span>';" />`
    : `<span class="product-image-icon">${icon}</span>`;
  const stackHtml = hasOthers
    ? `<div class="product-stack-layer stack-layer-2"></div><div class="product-stack-layer stack-layer-1"></div>`
    : "";

  const allVariants = hasOthers
    ? [
        {
          title: item.title,
          price: item.price,
          link: item.link,
          image: item.image,
          images: item.images,
          productId: item.productId,
          isSelected: true,
        },
        ...others.map((o) => ({ ...o, isSelected: false })),
      ].sort((a, b) => a.price - b.price)
    : [];

  const pid = `pd-${++productDataCounter}`;
  const cacheKey = `${item.productId || ""}|${item.link || ""}`;
  const currentImages =
    Array.isArray(item.images) && item.images.length > 0
      ? item.images
      : item.image
        ? [item.image]
        : [];

  productDataMap.set(pid, {
    images: currentImages,
    productId: item.productId || "",
    productUrl: item.link || "",
    storeName: store.storeName || "",
    title: item.title || "",
    variants: allVariants,
    variantsQuery: item.query || "",
    variantsStoreColor: storeColor,
    variantsStoreName: store.storeName || "",
    cacheKey,
  });

  const galleryCount = currentImages.length;
  const galleryBadgeHtml =
    galleryCount > 1
      ? `<span class="product-gallery-badge has-multi">📷 ${toPersianNum(galleryCount)}</span>`
      : `<span class="product-gallery-badge loading" data-cache-key="${escapeHtml(cacheKey)}">🕐</span>`;

  const expandButtonHtml = hasOthers
    ? `<button class="product-expand-button" type="button" draggable="false" data-variants-pd="${pid}">
         <svg class="product-expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
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
    <button class="product-wishlist-btn ${inWishlist ? "active" : ""}" type="button" draggable="false"
            data-store="${escapeHtml(store.storeName)}" data-title="${escapeHtml(item.title)}"
            data-price="${item.price}" data-link="${escapeHtml(item.link || "")}"
            data-image="${escapeHtml(typeof item.image === "string" ? item.image : "")}"
            title="${inWishlist ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"}">
      ${inWishlist ? "❤️" : "🤍"}
    </button>
  `;

  return `
    <div class="product-card ${hasOthers ? "has-others" : ""}">
      ${stackHtml}
      <div class="product-collapsed">
        <div class="product-image-wrapper ${hasImg ? "has-real-image clickable-image" : ""}" data-pd="${pid}">
          ${imgContent}
          ${wishlistBtn}
          ${galleryBadgeHtml}
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
    </div>
  `;
}

// ----------------------------------------------------------------
// VARIANTS MODAL
// ----------------------------------------------------------------
function renderVariantCard(variant, storeColor, storeName) {
  const icon = getProductIcon(variant.title);
  const hasLink = variant.link && variant.link !== "#";
  let img = variant.image;
  if (Array.isArray(img)) img = img[0];
  if (typeof img === "object" && img) img = img.url || img.src;
  const hasImg = img && typeof img === "string" && img.startsWith("http");
  const imgContent = hasImg
    ? `<img src="${escapeHtml(img)}" alt="" class="variant-card-image" draggable="false" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';" /><span class="variant-card-icon" style="display:none;">${icon}</span>`
    : `<span class="variant-card-icon">${icon}</span>`;

  const wishlistItem = {
    storeName,
    title: variant.title,
    price: variant.price,
    link: variant.link,
    image: variant.image,
  };
  const inWishlist = isInWishlist(wishlistItem);
  const wishlistBtn = `
    <button class="variant-card-wishlist-btn ${inWishlist ? "active" : ""}" type="button" draggable="false"
            data-store="${escapeHtml(storeName)}" data-title="${escapeHtml(variant.title)}"
            data-price="${variant.price}" data-link="${escapeHtml(variant.link || "")}"
            data-image="${escapeHtml(typeof variant.image === "string" ? variant.image : "")}"
            title="${inWishlist ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"}">
      ${inWishlist ? "❤️" : "🤍"}
    </button>
  `;

  const vpid = `pd-${++productDataCounter}`;
  productDataMap.set(vpid, {
    images:
      Array.isArray(variant.images) && variant.images.length > 0
        ? variant.images
        : variant.image
          ? [variant.image]
          : [],
    productId: variant.productId || "",
    productUrl: variant.link || "",
    storeName,
    title: variant.title || "",
  });

  return `
    <div class="variant-card ${variant.isSelected ? "selected" : ""}" style="--store-color: ${storeColor};">
      ${variant.isSelected ? '<span class="variant-card-badge">💰 کمترین قیمت</span>' : ""}
      <div class="variant-card-inner">
        <div class="variant-card-image-wrapper ${hasImg ? "clickable-image" : ""}" data-pd="${vpid}">
          ${imgContent}
          ${wishlistBtn}
        </div>
        <div class="variant-card-body">
          <div class="variant-card-title" title="${escapeHtml(variant.title)}">${escapeHtml(variant.title)}</div>
          <div class="variant-card-price">
            <span class="variant-card-price-value">${formatPrice(variant.price)}</span>
            <span class="variant-card-price-currency">تومان</span>
          </div>
        </div>
        ${hasLink ? `<a class="variant-card-action" href="${escapeHtml(variant.link)}" target="_blank" rel="noopener noreferrer" draggable="false">مشاهده ↗</a>` : `<div class="variant-card-action disabled">بدون لینک</div>`}
      </div>
    </div>
  `;
}

function openVariantsModal(pid) {
  const data = productDataMap.get(pid);
  if (!data || !data.variants || data.variants.length === 0) return;

  const modal = document.getElementById("variants-modal");
  const iconEl = document.getElementById("variants-modal-icon");
  const nameEl = document.getElementById("variants-modal-name");
  const queryEl = document.getElementById("variants-modal-query");
  const bodyEl = document.getElementById("variants-modal-body");

  if (!modal || !bodyEl) return;

  const storeName = data.variantsStoreName || "";
  const query = data.variantsQuery || "این محصول";
  const count = data.variants.length;
  const storeColor = data.variantsStoreColor || "var(--primary)";
  const storeIconUrl = getStoreIconUrl(storeName);

  if (iconEl) {
    if (storeIconUrl) {
      iconEl.innerHTML = `
        <img src="${escapeHtml(storeIconUrl)}" alt="" class="variants-modal-store-icon"
             loading="lazy" referrerpolicy="no-referrer"
             onerror="this.onerror=null; this.parentElement.innerHTML='<span class=&quot;variants-modal-icon-fallback&quot;>🏪</span>';" />
      `;
      iconEl.style.background = "#ffffff";
      iconEl.style.borderColor = storeColor;
      iconEl.style.padding = "0.3rem";
    } else {
      iconEl.innerHTML = `<span class="variants-modal-icon-fallback">🏪</span>`;
      iconEl.style.background = "#ffffff";
      iconEl.style.borderColor = storeColor;
    }
  }

  if (nameEl) {
    nameEl.textContent = `پیشنهادهای موجود برای «${query}»`;
  }

  if (queryEl) {
    queryEl.innerHTML = `
      <span class="variants-modal-store" style="color: ${storeColor}">${escapeHtml(storeName)}</span>
      <span class="variants-modal-sep">·</span>
      <span class="variants-modal-count">${toPersianNum(count)} مدل مختلف</span>
    `;
  }

  bodyEl.innerHTML = data.variants
    .map((v) => renderVariantCard(v, storeColor, storeName))
    .join("");

  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  history.pushState({ variantsModal: true }, "");
}

function closeVariantsModal(fromPopstate = false) {
  const modal = document.getElementById("variants-modal");
  if (!modal || modal.classList.contains("hidden")) return;
  modal.classList.add("hidden");
  document.body.style.overflow = "";
  if (!fromPopstate && history.state?.variantsModal) {
    suppressNextPopstate = true;
    history.back();
  }
}

// ----------------------------------------------------------------
// GRID DRAG & NAV
// ----------------------------------------------------------------
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

// ----------------------------------------------------------------
// BADGE ROTATION (موبایل)
// ----------------------------------------------------------------
function initBadgeRotation() {
  document.querySelectorAll(".store-badge-group-items").forEach((c) => {
    if (c._rotationInterval) {
      clearInterval(c._rotationInterval);
      c._rotationInterval = null;
    }
  });

  if (window.innerWidth > 900) {
    document.querySelectorAll(".store-badge-row").forEach((r) => {
      r.classList.remove("active", "slide-out-left");
    });
    return;
  }

  document.querySelectorAll(".store-badge-group-items").forEach((container) => {
    const rows = Array.from(container.querySelectorAll(".store-badge-row"));
    if (rows.length < 2) {
      container.classList.add("single");
      rows.forEach((r) => r.classList.remove("active", "slide-out-left"));
      return;
    }
    container.classList.remove("single");
    rows.forEach((r, i) => {
      r.classList.toggle("active", i === 0);
      r.classList.remove("slide-out-left");
    });
    let idx = 0;
    container._rotationInterval = setInterval(() => {
      const all = container.querySelectorAll(".store-badge-row");
      if (all.length < 2) return;
      const current = all[idx];
      const nextIdx = (idx + 1) % all.length;
      const next = all[nextIdx];
      current.classList.remove("active");
      current.classList.add("slide-out-left");
      setTimeout(() => current.classList.remove("slide-out-left"), 500);
      next.classList.add("active");
      idx = nextIdx;
    }, 3500);
  });
}

let __badgeResizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(__badgeResizeTimer);
  __badgeResizeTimer = setTimeout(initBadgeRotation, 250);
});

// ----------------------------------------------------------------
// IMAGE MODAL
// ----------------------------------------------------------------
const imageModal = document.getElementById("image-modal");
const imageModalImg = document.getElementById("image-modal-img");
const imageModalCaption = imageModal?.querySelector(".image-modal-caption");
const imageModalClose = imageModal?.querySelector(".image-modal-close");
const imageModalBackdrop = imageModal?.querySelector(".image-modal-backdrop");
const imageModalPrev = imageModal?.querySelector(".image-modal-prev");
const imageModalNext = imageModal?.querySelector(".image-modal-next");
const imageModalCounter = document.getElementById("image-modal-counter");

const imageModalState = { images: [], index: 0, caption: "" };

function renderImageModalContent() {
  const { images, index, caption } = imageModalState;
  if (!images || images.length === 0) return;
  imageModalImg.src = images[index];
  imageModalImg.alt = "";
  if (imageModalCaption) imageModalCaption.textContent = caption || "";
  if (imageModalCounter) {
    if (images.length > 1) {
      imageModalCounter.textContent = `${index + 1} / ${images.length}`;
      imageModalCounter.classList.remove("hidden");
    } else {
      imageModalCounter.classList.add("hidden");
    }
  }
  const hasMultiple = images.length > 1;
  if (imageModalPrev) imageModalPrev.classList.toggle("hidden", !hasMultiple);
  if (imageModalNext) imageModalNext.classList.toggle("hidden", !hasMultiple);
}

async function openImageModal(
  images,
  startIndex = 0,
  cap = "",
  alt = "",
  productId = "",
  productUrl = "",
  storeName = "",
) {
  if (!imageModal) return;

  let arr = [];
  if (Array.isArray(images))
    arr = images.filter((x) => typeof x === "string" && x.length > 0);
  else if (typeof images === "string" && images.length > 0) arr = [images];
  if (arr.length === 0) return;

  const key = `${productId || ""}|${productUrl || ""}`;
  if ((productId || productUrl) && imageGalleryCache.has(key)) {
    try {
      const imgs = await imageGalleryCache.get(key);
      if (Array.isArray(imgs) && imgs.length > arr.length) arr = imgs;
    } catch {}
  }

  imageModalState.images = arr;
  imageModalState.index = Math.max(0, Math.min(startIndex, arr.length - 1));
  imageModalState.caption = cap || "";

  renderImageModalContent();
  imageModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  history.pushState({ imageModal: true }, "");

  if (arr.length <= 1 && (productId || productUrl)) {
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve(null), 5000),
    );

    Promise.race([
      fetchProductGallery(productId, productUrl, storeName),
      timeoutPromise,
    ]).then((imgs) => {
      if (
        imgs &&
        imgs.length > arr.length &&
        !imageModal.classList.contains("hidden")
      ) {
        imageModalState.images = imgs;
        if (imageModalState.index >= imgs.length) imageModalState.index = 0;
        renderImageModalContent();
      }
    });
  }
}

function closeImageModal(fromPopstate = false) {
  if (!imageModal) return;
  if (imageModal.classList.contains("hidden")) return;
  imageModal.classList.add("hidden");
  imageModalImg.src = "";
  document.body.style.overflow = "";
  imageModalState.images = [];
  imageModalState.index = 0;

  if (!fromPopstate && history.state?.imageModal) {
    suppressNextPopstate = true;
    history.back();
  }
}

function showPrevImage() {
  const { images, index } = imageModalState;
  if (images.length < 2) return;
  imageModalState.index = (index - 1 + images.length) % images.length;
  renderImageModalContent();
}

function showNextImage() {
  const { images, index } = imageModalState;
  if (images.length < 2) return;
  imageModalState.index = (index + 1) % images.length;
  renderImageModalContent();
}

if (imageModalClose)
  imageModalClose.addEventListener("click", () => closeImageModal());
if (imageModalBackdrop)
  imageModalBackdrop.addEventListener("click", () => closeImageModal());
if (imageModalPrev)
  imageModalPrev.addEventListener("click", (e) => {
    e.stopPropagation();
    showPrevImage();
  });
if (imageModalNext)
  imageModalNext.addEventListener("click", (e) => {
    e.stopPropagation();
    showNextImage();
  });

let touchStartX = 0;
let touchEndX = 0;
let touchStartY = 0;
let touchEndY = 0;

if (imageModal) {
  imageModal.addEventListener(
    "touchstart",
    (e) => {
      if (imageModal.classList.contains("hidden")) return;
      const t = e.changedTouches[0];
      touchStartX = t.screenX;
      touchStartY = t.screenY;
    },
    { passive: true },
  );

  imageModal.addEventListener(
    "touchend",
    (e) => {
      if (imageModal.classList.contains("hidden")) return;
      const t = e.changedTouches[0];
      touchEndX = t.screenX;
      touchEndY = t.screenY;

      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;

      if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
      if (imageModalState.images.length < 2) return;

      if (dx < -50) {
        showNextImage();
      } else if (dx > 50) {
        showPrevImage();
      }
    },
    { passive: true },
  );
}
document.addEventListener("keydown", (e) => {
  if (!imageModal || imageModal.classList.contains("hidden")) return;
  if (e.key === "ArrowLeft") showNextImage();
  else if (e.key === "ArrowRight") showPrevImage();
  else if (e.key === "Escape") closeImageModal();
});

// ----------------------------------------------------------------
// GALLERY FETCHER
// ----------------------------------------------------------------
function fetchProductGallery(productId, productUrl, storeName) {
  const key = `${productId || ""}|${productUrl || ""}`;
  if (imageGalleryCache.has(key)) return imageGalleryCache.get(key);

  const params = new URLSearchParams();
  if (productId) params.set("id", productId);
  if (productUrl) params.set("url", productUrl);
  if (storeName) params.set("store", storeName);

  const promise = fetch(`/api/product-images?${params.toString()}`)
    .then((r) => r.json())
    .then((data) =>
      data.success && Array.isArray(data.images) ? data.images : [],
    )
    .catch(() => []);

  imageGalleryCache.set(key, promise);
  return promise;
}

function updateBadgeByKey(cacheKey, count) {
  const badges = document.querySelectorAll(
    `.product-gallery-badge[data-cache-key="${CSS.escape(cacheKey)}"]`,
  );
  badges.forEach((badge) => {
    if (count > 1) {
      badge.textContent = `📷 ${toPersianNum(count)}`;
      badge.classList.remove("loading");
      badge.classList.add("has-multi");
    } else {
      badge.remove();
    }
  });
}

async function updateBadgeFromCache(badge) {
  const key = badge.dataset.cacheKey;
  if (!key) return;
  try {
    const imgs = await imageGalleryCache.get(key);
    updateBadgeByKey(key, Array.isArray(imgs) ? imgs.length : 0);
  } catch {}
}

// ----------------------------------------------------------------
// SUPPORTED STORES STRIP
// ----------------------------------------------------------------
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

// ----------------------------------------------------------------
// DRAG PREVENTION
// ----------------------------------------------------------------
function disableAllDraggable() {
  document
    .querySelectorAll("a, img")
    .forEach((el) => el.setAttribute("draggable", "false"));
}

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
      "a, button, .product-action, .product-expand-button, .store-strip-card, .grid-nav, .product-wishlist-btn, .variant-card-wishlist-btn",
    );
    if (interactive && e.detail > 1) e.preventDefault();
  },
  true,
);

const observer = new MutationObserver((mutations) => {
  mutations.forEach((m) => {
    m.addedNodes.forEach((node) => {
      if (node.nodeType === 1) {
        if (node.tagName === "A" || node.tagName === "IMG")
          node.setAttribute("draggable", "false");
        node
          .querySelectorAll?.("a, img")
          .forEach((el) => el.setAttribute("draggable", "false"));
      }
    });
  });
});
observer.observe(document.body, { childList: true, subtree: true });

// ----------------------------------------------------------------
// MAIN CLICK HANDLER
// ----------------------------------------------------------------
document.addEventListener("click", (e) => {
  const wishlistBtn = e.target.closest(
    ".product-wishlist-btn, .variant-card-wishlist-btn",
  );
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

  const expandBtn = e.target.closest(
    ".product-expand-button[data-variants-pd]",
  );
  if (expandBtn) {
    e.preventDefault();
    e.stopPropagation();
    openVariantsModal(expandBtn.dataset.variantsPd);
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

  const stripImg = e.target.closest(
    ".strip-item-image-wrapper.clickable-image",
  );
  if (stripImg) {
    if (e.target.closest(".product-wishlist-btn")) return;
    const img = stripImg.querySelector(".strip-item-image");
    const pd = productDataMap.get(stripImg.dataset.pd);
    if (img?.src && pd) {
      openImageModal(
        pd.images,
        0,
        pd.title,
        img.alt,
        pd.productId,
        pd.productUrl,
        pd.storeName,
      );
      return;
    }
  }

  const prodImg = e.target.closest(".product-image-wrapper.clickable-image");
  if (prodImg) {
    if (e.target.closest(".product-wishlist-btn")) return;
    const img = prodImg.querySelector(".product-image-real");
    const pd = productDataMap.get(prodImg.dataset.pd);
    if (img?.src && pd) {
      openImageModal(
        pd.images,
        0,
        pd.title,
        img.alt,
        pd.productId,
        pd.productUrl,
        pd.storeName,
      );
      return;
    }
  }

  const variantImg = e.target.closest(
    ".variant-card-image-wrapper.clickable-image",
  );
  if (variantImg) {
    if (e.target.closest(".variant-card-wishlist-btn")) return;
    const img = variantImg.querySelector(".variant-card-image");
    const pd = productDataMap.get(variantImg.dataset.pd);
    if (img?.src && pd) {
      openImageModal(
        pd.images,
        0,
        pd.title,
        img.alt,
        pd.productId,
        pd.productUrl,
        pd.storeName,
      );
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

document.addEventListener("click", (e) => {
  const modal = document.getElementById("variants-modal");
  if (!modal || modal.classList.contains("hidden")) return;
  if (
    e.target.closest(".variants-modal-close") ||
    e.target.classList.contains("variants-modal-backdrop")
  ) {
    closeVariantsModal();
  }
});

window.addEventListener("popstate", () => {
  if (suppressNextPopstate) {
    suppressNextPopstate = false;
    return;
  }

  const imgModal = document.getElementById("image-modal");
  if (imgModal && !imgModal.classList.contains("hidden")) {
    closeImageModal(true);
    return;
  }

  const varModal = document.getElementById("variants-modal");
  if (varModal && !varModal.classList.contains("hidden")) {
    closeVariantsModal(true);
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const wModal = document.getElementById("wishlist-modal");
    if (wModal && !wModal.classList.contains("hidden")) closeWishlistModal();
    const vModal = document.getElementById("variants-modal");
    if (vModal && !vModal.classList.contains("hidden")) closeVariantsModal();
  }
});

// ----------------------------------------------------------------
// UTILS
// ----------------------------------------------------------------
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

// ----------------------------------------------------------------
// CANCEL BUTTON
// ----------------------------------------------------------------
if (cancelBtn) {
  cancelBtn.addEventListener("click", async () => {
    if (cancelBtn.disabled || searchAborted) return;

    const confirmed = await showConfirmDialog({
      title: "لغو جستجو",
      message:
        "آیا مطمئن هستید که می‌خواهید جستجوی فعلی را لغو کنید؟ نتایج بدست‌آمده تا این لحظه نمایش داده نخواهند شد.",
      icon: "⏹️",
      confirmText: "بله، لغو کن",
      cancelText: "ادامه بده",
      variant: "danger",
    });

    if (!confirmed) return;

    searchAborted = true;
    cancelBtn.disabled = true;
    if (searchController) searchController.abort();
  });
}

// ----------------------------------------------------------------
// THEME
// ----------------------------------------------------------------
const themeToggle = document.getElementById("theme-toggle");
const themeToggleTop = document.getElementById("theme-toggle-top");

function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  const icon = t === "dark" ? "☀️" : "🌙";
  const i1 = document.querySelector("#theme-toggle .theme-icon");
  if (i1) i1.textContent = icon;
  const i2 = document.querySelector("#theme-toggle-top .theme-icon-top");
  if (i2) i2.textContent = icon;
  localStorage.setItem("theme", t);
}

function toggleTheme() {
  const c = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(c === "dark" ? "light" : "dark");
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

if (themeToggle) themeToggle.addEventListener("click", toggleTheme);
if (themeToggleTop) themeToggleTop.addEventListener("click", toggleTheme);
initTheme();

// ================================================================
// 🎯 DEBUG MODE (باگ ۰.۳ — بدون endpoint جدید)
// ================================================================
const debugBtn = document.getElementById("debug-btn");
const debugModal = document.getElementById("debug-modal");
let debugData = null;

const mainLogo = document.querySelector(".logo");
if (mainLogo) {
  mainLogo.addEventListener("dblclick", () => {
    debugBtn?.classList.toggle("hidden");
    showToast(
      "حالت Debug",
      debugBtn.classList.contains("hidden")
        ? "غیرفعال شد"
        : "فعال شد — روی 🐞 بزن",
      "info",
      3000,
    );
  });
}

async function openDebugModal() {
  if (!debugModal) return;

  if (!window.__lastQueries || window.__lastQueries.length === 0) {
    showToast("اطلاعات کافی نیست", "اول یه جستجو بزن", "info", 3000);
    return;
  }

  const rejected = [];
  const accepted = [];
  for (const q of window.__lastQueries) {
    for (const r of q.rejectedProducts || []) {
      rejected.push({ ...r, query: q.query });
    }
    for (const m of q.matches || []) {
      for (const o of m.offers || []) {
        accepted.push({ ...o, query: q.query });
      }
    }
  }
  debugData = { rejected, accepted };
  renderDebugModal();
  debugModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  history.pushState({ debugModal: true }, "");
}

function renderDebugModal() {
  const body = document.getElementById("debug-modal-body");
  const subtitle = document.getElementById("debug-modal-subtitle");
  const search = document.getElementById("debug-search");
  const sortSelect = document.getElementById("debug-sort");

  if (!body || !debugData) return;

  const render = () => {
    const q = search?.value.toLowerCase().trim() || "";
    const sortBy = sortSelect?.value || "score";

    let list = [...(debugData.rejected || [])];

    if (q) {
      list = list.filter(
        (x) =>
          x.title.toLowerCase().includes(q) ||
          x.storeName.toLowerCase().includes(q) ||
          x.query.toLowerCase().includes(q),
      );
    }

    if (sortBy === "score") list.sort((a, b) => b.score - a.score);
    else if (sortBy === "ratio") list.sort((a, b) => b.ratio - a.ratio);
    else if (sortBy === "store")
      list.sort((a, b) => a.storeName.localeCompare(b.storeName, "fa"));

    if (subtitle) {
      subtitle.textContent = `${list.length} محصول رد شده از ${debugData.rejected.length} | ${debugData.accepted.length} محصول قبول شده`;
    }

    if (list.length === 0) {
      body.innerHTML = `<div class="debug-empty">هیچ موردی پیدا نشد</div>`;
      return;
    }

    body.innerHTML = list
      .map((item) => {
        const missedHtml = (item.missedTokens || [])
          .map(
            (t) =>
              `<span class="debug-badge token-miss">✗ ${escapeHtml(t)}</span>`,
          )
          .join("");
        const matchedHtml = (item.matchedTokens || [])
          .map(
            (t) => `<span class="debug-badge token">✓ ${escapeHtml(t)}</span>`,
          )
          .join("");

        return `
        <div class="debug-item">
          <div class="debug-item-header">
            <span class="debug-item-store" style="color: ${getStoreColor(item.storeName)}">${escapeHtml(item.storeName)}</span>
            <span class="debug-badge reason">${escapeHtml(item.reason)}</span>
          </div>
          <div class="debug-item-title">${escapeHtml(item.title)}</div>
          <div class="debug-item-meta">
            <span class="debug-badge score">Score: ${(item.score || 0).toFixed(2)}</span>
            <span class="debug-badge ratio">Ratio: ${(item.ratio || 0).toFixed(2)}</span>
            <span style="color: var(--text-muted); font-size: 0.7rem;">Query: "${escapeHtml(item.query)}"</span>
            ${
              item.link
                ? `<a class="debug-item-link" href="${escapeHtml(item.link)}" target="_blank" rel="noopener">مشاهده ↗</a>`
                : ""
            }
          </div>
          ${
            matchedHtml || missedHtml
              ? `<div class="debug-item-meta">${matchedHtml}${missedHtml}</div>`
              : ""
          }
        </div>
      `;
      })
      .join("");
  };

  if (search) {
    search.removeEventListener("input", render);
    search.addEventListener("input", render);
  }
  if (sortSelect) {
    sortSelect.removeEventListener("change", render);
    sortSelect.addEventListener("change", render);
  }

  render();
}

function closeDebugModal(fromPopstate = false) {
  if (!debugModal || debugModal.classList.contains("hidden")) return;
  debugModal.classList.add("hidden");
  document.body.style.overflow = "";
  if (!fromPopstate && history.state?.debugModal) {
    suppressNextPopstate = true;
    history.back();
  }
}

if (debugBtn) debugBtn.addEventListener("click", openDebugModal);

document.addEventListener("click", (e) => {
  if (!debugModal || debugModal.classList.contains("hidden")) return;
  if (
    e.target.closest(".debug-modal-close") ||
    e.target.classList.contains("debug-modal-backdrop")
  ) {
    closeDebugModal();
  }
});

window.addEventListener("popstate", () => {
  if (suppressNextPopstate) {
    suppressNextPopstate = false;
    return;
  }
  if (debugModal && !debugModal.classList.contains("hidden")) {
    closeDebugModal(true);
  }
});

// ================================================================
// 📊 VISIT TRACKING — Session-based (30 min TTL)
// ================================================================
const VISIT_SESSION_KEY = "visit_session";
const VISIT_SESSION_TTL = 30 * 60 * 1000; // 30 minutes

function getOrCreateSession() {
  try {
    const stored = JSON.parse(
      localStorage.getItem(VISIT_SESSION_KEY) || "null",
    );
    if (stored && Date.now() - stored.lastActivity < VISIT_SESSION_TTL) {
      stored.lastActivity = Date.now();
      localStorage.setItem(VISIT_SESSION_KEY, JSON.stringify(stored));
      return { sessionId: stored.sessionId, isNew: false };
    }
  } catch {}

  const sessionId =
    (crypto.randomUUID && crypto.randomUUID()) ||
    `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  localStorage.setItem(
    VISIT_SESSION_KEY,
    JSON.stringify({ sessionId, lastActivity: Date.now() }),
  );
  return { sessionId, isNew: true };
}

function trackVisit() {
  const { sessionId, isNew } = getOrCreateSession();
  if (!isNew) return; // same session → skip

  fetch("/api/track-visit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      referrer: document.referrer || "",
      screen: `${window.screen.width}x${window.screen.height}`,
      language: navigator.language || "",
    }),
  }).catch(() => {});
}

// ----------------------------------------------------------------
// INIT
// ----------------------------------------------------------------
addBtn.addEventListener("click", addItem);
itemInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addItem();
});
searchBtn.addEventListener("click", search);

clearBtn.addEventListener("click", async () => {
  if (itemsList.classList.contains("locked")) return;
  if (items.length === 0 && !lastBasketComparison) return;

  const confirmed = await showConfirmDialog({
    title: "پاک کردن همه",
    message: `آیا مطمئن هستید که می‌خواهید همه‌ی آیتم‌ها (${toPersianNum(
      items.length,
    )} مورد) و نتایج جستجو را پاک کنید؟ این عملیات قابل بازگشت نیست.`,
    icon: "🗑️",
    confirmText: "بله، پاک کن",
    cancelText: "انصراف",
    variant: "danger",
  });

  if (!confirmed) return;
  clearAll();
});

const wishlistFloatBtn = document.getElementById("wishlist-float-btn");
if (wishlistFloatBtn)
  wishlistFloatBtn.addEventListener("click", openWishlistModal);
const wishlistClearAllBtn = document.getElementById("wishlist-clear-all");
if (wishlistClearAllBtn)
  wishlistClearAllBtn.addEventListener("click", clearAllWishlist);

// کلیک روی چیپ‌های پیشنهادی
document.addEventListener("click", (e) => {
  const chip = e.target.closest(".suggestion-chip");
  if (!chip) return;
  const val = chip.dataset.value;
  if (!val) return;
  if (itemsList.classList.contains("locked")) return;
  if (items.includes(val)) {
    itemInput.value = val;
  } else {
    if (items.length >= 10) return;
    items.push(val);
    renderItems();
    saveBasket();
  }
  itemInput.focus();
});

// راه‌اندازی
loadBasket();
renderItems();
renderSuggestions();
renderSupportedStores();
disableAllDraggable();
initSortToggle();
updateWishlistFloatBtn();
updateDateTime();
fetchDollarRate();
setInterval(updateDateTime, 1000);
setInterval(fetchDollarRate, 600000);
initStickyHeader();
trackVisit();

// Global exposure for inline onclick in item chips
window.removeItem = removeItem;
