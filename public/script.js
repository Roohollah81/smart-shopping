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

function getStoreColor(storeName) {
  const s = SUPPORTED_STORES.find((x) => x.name === storeName);
  return s ? s.color : "#6366f1";
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
  items.splice(i, 1);
  renderItems();
}
function renderItems() {
  itemsList.innerHTML = items
    .map(
      (it, i) => `
    <div class="item-chip">
      <span>${escapeHtml(it)}</span>
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

async function search() {
  if (items.length === 0) return;
  hideError();
  setLoading(true);
  try {
    const r = await fetch("/api/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    const data = await r.json();
    if (!data.success) {
      showError(data.error || "خطایی رخ داد.");
      return;
    }
    renderResults(data.data);
  } catch (e) {
    showError("ارتباط با سرور برقرار نشد.");
    console.error(e);
  } finally {
    setLoading(false);
  }
}

// ---------- نمایش نتایج ----------
function renderResults(data) {
  const { basketComparison } = data;
  if (!basketComparison || basketComparison.length === 0) {
    showError("هیچ نتیجه‌ای یافت نشد.");
    resultsSection.classList.add("hidden");
    return;
  }
  const best = basketComparison[0];
  let html = renderStoreSection(best, true);
  const others = basketComparison.slice(1);
  if (others.length > 0) {
    html += `<h2 class="section-title others-title">فروشگاه های دیگر</h2>`;
    for (const s of others) html += renderStoreSection(s, false);
  }
  storesContainer.innerHTML = html;
  requestAnimationFrame(() => {
    document.querySelectorAll("[data-strip-track]").forEach(initStripDrag);
  });
  resultsSection.classList.remove("hidden");
  resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- بخش فروشگاه ----------
function renderStoreSection(store, isBest) {
  const storeColor = getStoreColor(store.storeName);
  const cards = store.items
    .map((it) => renderProductCard(it, store, storeColor))
    .join("");
  const missingHtml =
    store.missing && store.missing.length > 0
      ? `<div class="missing-note"><span>⚠️</span><span>ناموجود در این فروشگاه: ${store.missing.map(escapeHtml).join("، ")}</span></div>`
      : "";
  const bestTitle = isBest
    ? `<h2 class="section-title best-title">✨ به صرفه ترین فروشگاه</h2>`
    : "";
  const iconUrl = getStoreIconUrl(store.storeName);
  const fallback = isBest ? "🥇" : "🏪";
  const iconHtml = iconUrl
    ? `<img src="${escapeHtml(iconUrl)}" alt="" class="store-logo" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';" /><span class="store-icon-fallback" style="display:none;">${fallback}</span>`
    : `<span class="store-icon-fallback" style="display:flex;">${fallback}</span>`;
  return `
    <section class="store-section ${isBest ? "best-store" : ""}" style="--store-color: ${storeColor};">
      ${bestTitle}
      <div class="store-header-row">
        <div class="store-badge">
          <div class="store-logo-wrapper">${iconHtml}</div>
          <h3 class="store-name">${escapeHtml(store.storeName)}</h3>
        </div>
        <div class="store-total">
          <span class="total-label">مجموع سبد</span>
          <span class="total-value">${formatPrice(store.total)} تومان</span>
        </div>
      </div>
      <div class="products-grid">${cards}</div>
      ${missingHtml}
    </section>
  `;
}

// ---------- کارت محصول ----------
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

  // 🎯 پشته‌های Filmo — قبل از collapsed در DOM (z-index طبیعی)
  const stackHtml = hasOthers
    ? `<div class="product-stack-layer stack-layer-2"></div>
       <div class="product-stack-layer stack-layer-1"></div>`
    : "";

  // 🎯 بج بازکننده (خارج از collapsed تا tooltip کلیپ نشود)
  const badgeHtml = hasOthers
    ? `<button class="expand-badge" type="button" aria-label="مشاهده ${others.length} آیتم دیگر">
         <svg class="expand-badge-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
           <polyline points="15 18 9 12 15 6"></polyline>
         </svg>
         <span class="expand-tooltip">مشاهده ${others.length} آیتم دیگر</span>
       </button>`
    : "";

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
        <button class="strip-close" type="button" aria-label="بستن">✕</button>
        <div class="strip-viewport">
          <button class="strip-nav strip-nav-right" type="button" aria-label="قبلی">‹</button>
          <div class="strip-track" data-strip-track data-strip-rtl="true">
            ${allItems.map((it) => renderStripItem(it, storeColor)).join("")}
          </div>
          <button class="strip-nav strip-nav-left" type="button" aria-label="بعدی">›</button>
        </div>
        <div class="strip-counter">${totalCount} آیتم · مرتب شده به ترتیب قیمت</div>
      </div>
    `;
  }

  return `
    <div class="product-card ${hasOthers ? "has-others" : ""}">
      ${stackHtml}
      <div class="product-collapsed">
        <div class="product-image-wrapper ${hasImg ? "has-real-image clickable-image" : ""}">
          ${imgContent}
        </div>
        <div class="product-body">
          <div class="product-query">${escapeHtml(item.query)}</div>
          <div class="product-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
          <div class="product-price-section">
            <span class="product-price-value">${formatPrice(item.price)}</span>
            <span class="product-price-currency">تومان</span>
          </div>
        </div>
        ${hasLink ? `<a class="product-action" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">مشاهده در ${escapeHtml(store.storeName)} ↗</a>` : `<div class="product-action disabled">لینک موجود نیست</div>`}
      </div>
      ${badgeHtml}
      ${expandedHtml}
    </div>
  `;
}

// ---------- آیتم strip ----------
function renderStripItem(it, storeColor) {
  const icon = getProductIcon(it.title);
  const hasLink = it.link && it.link !== "#";
  let img = it.image;
  if (Array.isArray(img)) img = img[0];
  if (typeof img === "object" && img) img = img.url || img.src;
  const hasImg = img && typeof img === "string" && img.startsWith("http");
  const imgContent = hasImg
    ? `<img src="${escapeHtml(img)}" alt="" class="strip-item-image" draggable="false" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';" /><span class="strip-item-icon" style="display:none;">${icon}</span>`
    : `<span class="strip-item-icon">${icon}</span>`;
  return `
    <div class="strip-item ${it.isSelected ? "selected" : ""}" style="--store-color: ${storeColor};">
      ${it.isSelected ? '<span class="strip-item-badge">💰 کمترین قیمت</span>' : ""}
      <div class="strip-item-image-wrapper ${hasImg ? "clickable-image" : ""}">${imgContent}</div>
      <div class="strip-item-body">
        <div class="strip-item-title" title="${escapeHtml(it.title)}">${escapeHtml(it.title)}</div>
        <div class="strip-item-price">
          <span class="strip-item-price-value">${formatPrice(it.price)}</span>
          <span class="strip-item-price-currency">تومان</span>
        </div>
      </div>
      ${hasLink ? `<a class="strip-item-action" href="${escapeHtml(it.link)}" target="_blank" rel="noopener noreferrer">مشاهده ↗</a>` : `<div class="strip-item-action disabled">بدون لینک</div>`}
    </div>
  `;
}

// ---------- اسکرول نرم ----------
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

// ---------- باز/بسته ----------
function toggleCardExpand(card, expand) {
  if (!card) return;
  const grid = card.closest(".products-grid");
  const allCards = Array.from(grid.querySelectorAll(".product-card"));
  const collapsed = card.querySelector(".product-collapsed");
  const expanded = card.querySelector(".product-expanded");
  if (!collapsed || !expanded) return;

  if (expand) {
    allCards.forEach((c) => {
      if (c !== card && c.classList.contains("expanded"))
        toggleCardExpand(c, false);
    });
    const cardRect = card.getBoundingClientRect();
    allCards.forEach((c) => {
      if (c === card) return;
      const r = c.getBoundingClientRect();
      if (Math.abs(r.top - cardRect.top) < 5) c.classList.add("hidden-sibling");
    });
    card.classList.add("expanded");
    collapsed.classList.add("hidden");
    expanded.classList.remove("hidden");
    requestAnimationFrame(() => {
      const track = card.querySelector("[data-strip-track]");
      if (track) {
        initStripDrag(track);
        smoothScrollTo(track, 0, 1200);
        setTimeout(() => updateNavButtons(card), 1300);
      }
    });
  } else {
    card.classList.remove("expanded");
    allCards.forEach((c) => c.classList.remove("hidden-sibling"));
    collapsed.classList.remove("hidden");
    expanded.classList.add("hidden");
  }
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

// ---------- درگ strip ----------
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
    e.preventDefault(); // 🎯 جلوگیری از drag بومی تصویر
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

// ---------- رویدادها ----------
document.addEventListener("click", (e) => {
  const badge = e.target.closest(".expand-badge");
  if (badge) {
    e.preventDefault();
    e.stopPropagation();
    toggleCardExpand(badge.closest(".product-card"), true);
    return;
  }

  const closeBtn = e.target.closest(".strip-close");
  if (closeBtn) {
    e.preventDefault();
    toggleCardExpand(closeBtn.closest(".product-card"), false);
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

// 🎯 افزایش z-index کارت هنگام هاور بج
document.addEventListener("mouseover", (e) => {
  const badge = e.target.closest(".expand-badge");
  if (badge) badge.closest(".product-card")?.classList.add("badge-hover");
});
document.addEventListener("mouseout", (e) => {
  const badge = e.target.closest(".expand-badge");
  if (badge && !badge.contains(e.relatedTarget)) {
    badge.closest(".product-card")?.classList.remove("badge-hover");
  }
});

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
    <a class="store-strip-card" style="--store-color: ${store.color};" href="${escapeHtml(store.url)}" target="_blank" rel="noopener noreferrer">
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

// ---------- مودال ----------
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
document.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    imageModal &&
    !imageModal.classList.contains("hidden")
  )
    closeImageModal();
});

// ---------- کمکی ----------
function setLoading(v) {
  searchBtn.disabled = v;
  spinner.classList.toggle("active", v);
  searchBtnText.textContent = v ? "در حال جستجو..." : "🔍 جستجو و مقایسه";
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
