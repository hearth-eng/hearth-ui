/* =========================================================================
 HEARTH — categories.js
 Renders and drives the Categories & Services browser page. Reads data
 from CATEGORY_DATA (categories-data.js). Presentation/interaction only —
 no data lives in this file, and no network calls happen here.
 ========================================================================= */

var categories_hierarchy = [];

const CAT_ICONS = {
    scissors: '<svg viewBox="0 0 24 24" fill="none"><circle cx="6" cy="6" r="3" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="2"/><path d="M8.5 8 20 19M20 5 8.5 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    broom: '<svg viewBox="0 0 24 24" fill="none"><path d="M14 3 6 21M17 6l-8 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 21h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="18" cy="5" r="2.4" stroke="currentColor" stroke-width="2"/></svg>',
    wrench: '<svg viewBox="0 0 24 24" fill="none"><path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4l-3-3Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    'paint-roller': '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="14" height="6" rx="1.5" stroke="currentColor" stroke-width="2"/><path d="M8 10v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="5" y="15" width="6" height="6" rx="1.5" stroke="currentColor" stroke-width="2"/></svg>',
};

/* ---- per-service photos ---------------------------------------------------
 Each service carries its own image from the backend (fks_services.image).
 Falls back to the sub-category's image if a service has none. */
function serviceImage(sku, subCategory) {
    if (sku && sku.image)
        return sku.image;
    return subCategory ? subCategory.image : '';
}

/* ---- "sign in to continue" prompt ------------------------------------
 Browsing categories/services needs no account, but acting on one (adding
 to cart) does. Rather than popping a modal unasked, this shows a brief
 toast and visually points at the header's own Log In / Sign Up buttons,
 so the user drives which flow they want. */
function promptLoginToContinue(message) {
    const navActions = document.getElementById('navActions');
    if (navActions) {
        navActions.classList.remove('nav-actions-pulse');
        void navActions.offsetWidth; // restart the animation if already running
        navActions.classList.add('nav-actions-pulse');
        setTimeout(() => navActions.classList.remove('nav-actions-pulse'), 1600);
    }

    let toast = document.getElementById('authPromptToast');
    if (! toast) {
        toast = document.createElement('div');
        toast.id = 'authPromptToast';
        toast.className = 'auth-prompt-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove('is-visible'), 3500);
}

document.addEventListener('DOMContentLoaded', () => {
    // if (typeof CATEGORY_DATA === 'undefined') {
    //     return; // guard: only runs on categories.html
    // }
    loadCategories();
    // initCategoriesPage();
});

async function loadCategories() {
    let res = await HearthAPI.viewCategories();
        
    if (! res.success) {
        showError('categoryError', res.message || 'Could fetch categories. Please try again.');
        return;
    }
    categories_hierarchy = res.result.items;
    
    initCategoriesPage();
}

function initCategoriesPage() {
    const catPillRow = document.getElementById('catPillRow');
    const subcatChipRow = document.getElementById('subcatChipRow');
    const catBanner = document.getElementById('catBanner');
    const skuGrid = document.getElementById('skuGrid');
    const resultsMeta = document.getElementById('catResultsMeta');
    const searchInput = document.getElementById('catSearchInput');
    const searchClear = document.getElementById('catSearchClear');
    const cartBar = document.getElementById('cartBar');
    const cartBarCount = document.getElementById('cartBarCount');
    const cartBarTotal = document.getElementById('cartBarTotal');
    const cartBarCta = document.getElementById('cartBarCta');

    if (!catPillRow || !skuGrid)
        return;

    const totalServiceCount = categories_hierarchy.reduce(
            (sum, cat) => sum + countServices(cat), 0
            );
    const statTotal = document.getElementById('catStatTotal');
    if (statTotal)
        statTotal.textContent = `${totalServiceCount} services across ${categories_hierarchy.length} categories`;

    const state = {
        activeCategoryId: categories_hierarchy[0].categoryId,
        activeSubCategoryId: 0,     // 'all'
        searchQuery: ''
    };

    // Deep-link support: categories.html#appliance-repair pre-selects a category.
    const hashId = decodeURIComponent(location.hash.replace('#', ''));
    if (categories_hierarchy.some(c => c.categoryId === hashId)) {
        state.activeCategoryId = Number(hashId);
    }

    renderAll();
    updateCartBar();

    function renderAll() {
        renderCategoryPills();
        renderSubcategoryChips();
        renderBanner();
        renderGrid();
    }

    // ---- search -----------------------------------------------------------
    searchInput.addEventListener('input', () => {
        state.searchQuery = searchInput.value.trim();
        searchClear.classList.toggle('is-visible', state.searchQuery.length > 0);
        renderGrid();
    });
    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        state.searchQuery = '';
        searchClear.classList.remove('is-visible');
        renderGrid();
        searchInput.focus();
    });

    // ---- rendering: category pills (with thumbnail image) -------------------
    function renderCategoryPills() {
        catPillRow.setAttribute('role', 'tablist');
        catPillRow.innerHTML = categories_hierarchy.map(cat => `
      <button type="button" class="cat-pill${cat.categoryId === state.activeCategoryId ? ' is-active' : ''}"
              role="tab" aria-selected="${cat.categoryId === state.activeCategoryId}"
              data-category-id="${cat.categoryId}">
        <span class="cat-pill-thumb" aria-hidden="true">
          <img src="${cat.image}" alt="" loading="lazy">
        </span>
        <span>${escapeHtml(cat.name)}</span>
        <span class="cat-pill-count">${countServices(cat)}</span>
      </button>
    `).join('');

        catPillRow.querySelectorAll('.cat-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                state.activeCategoryId = Number(btn.dataset.categoryId);
                state.activeSubCategoryId = 0;
                if (state.searchQuery) {
                    state.searchQuery = '';
                    searchInput.value = '';
                    searchClear.classList.remove('is-visible');
                }
                // Rendering happens first and unconditionally — updating the URL
                // hash is a nice-to-have and must never block the UI if it fails
                // (history.replaceState can throw a SecurityError on file:// origins).
                renderCategoryPills();
                renderSubcategoryChips();
                renderBanner();
                renderGrid();
                try {
                    history.replaceState(null, '', `#${state.activeCategoryId}`);
                } catch (err) {
                    console.warn('[Hearth] Could not update URL hash (safe to ignore):', err);
                }
            });
        });
    }

    // ---- rendering: subcategory chips ---------------------------------------
    function renderSubcategoryChips() {
        const category = categories_hierarchy.find(c => c.categoryId === state.activeCategoryId);
        if (!category)
            return;

        const chips = [{id: 0, name: 'All', count: countServices(category)}]
                .concat(category.subCategories.map(sub => ({id: sub.categoryId, name: sub.name, count: sub.services.length})));

        subcatChipRow.innerHTML = chips.map(chip => `
      <button type="button" class="subcat-chip${chip.id === state.activeSubCategoryId ? ' is-active' : ''}"
              data-subcategory-id="${chip.id}">
        ${escapeHtml(chip.name)} <span style="opacity:.7">(${chip.count})</span>
      </button>
    `).join('');

        subcatChipRow.querySelectorAll('.subcat-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                state.activeSubCategoryId = Number(btn.dataset.subcategoryId);
                renderSubcategoryChips();
                renderBanner();
                renderGrid();
            });
        });
    }

    // ---- rendering: hero banner for the active category/subcategory ---------
    function renderBanner() {
        if (!catBanner)
            return;
        const category = categories_hierarchy.find(c => c.categoryId === state.activeCategoryId);
        if (!category)
            return;

        const subCategory = state.activeSubCategoryId !== 0
                ? category.subCategories.find(s => s.categoryId === state.activeSubCategoryId)
                : null;

        const image = subCategory ? subCategory.image : category.image;
        const title = subCategory ? subCategory.name : category.name;
        const sub = subCategory ? category.name : category.tagLine;

        catBanner.innerHTML = `
      <img src="${image}" alt="" loading="lazy">
      <div class="cat-banner-overlay">
        <p class="cat-banner-eyebrow">${escapeHtml(sub)}</p>
        <h2 class="cat-banner-title">${escapeHtml(title)}</h2>
      </div>
    `;
    }

    // ---- rendering: SKU grid -------------------------------------------------
    function renderGrid() {
        let items = [];

        if (state.searchQuery) {
            const q = state.searchQuery.toLowerCase();
            categories_hierarchy.forEach(cat => {
                cat.subCategories.forEach(sub => {
                    sub.services.forEach(sku => {
                        if (sku.name.toLowerCase().includes(q) || sku.description.toLowerCase().includes(q)) {
                            items.push({sku, category: cat, subCategory: sub});
                        }
                    });
                });
            });
            resultsMeta.innerHTML = `<strong>${items.length}</strong> result${items.length === 1 ? '' : 's'} for "${escapeHtml(state.searchQuery)}"`;
        } else {
            const category = categories_hierarchy.find(c => c.categoryId === state.activeCategoryId);
            category.subCategories.forEach(sub => {
                if (state.activeSubCategoryId !== 0 && sub.categoryId !== state.activeSubCategoryId)
                    return;
                sub.services.forEach(sku => items.push({sku, category, subCategory: sub}));
            });
            
            const subLabel = state.activeSubCategoryId !== 0
                    ? ' · ' + escapeHtml(category.subCategories.find(s => s.categoryId === state.activeSubCategoryId).name)
                    : '';
            resultsMeta.innerHTML = `<strong>${items.length}</strong> service${items.length === 1 ? '' : 's'} in ${escapeHtml(category.name)}${subLabel}`;
        }

        if (items.length === 0) {
            skuGrid.innerHTML = '';
            renderNoResults();
            return;
        }
        removeNoResults();

        skuGrid.innerHTML = items.map(({ sku, category, subCategory }) => renderSkuCard(sku, category, subCategory)).join('');
        wireCardControls(items);
    }

    function renderNoResults() {
        removeNoResults();
        const el = document.createElement('div');
        el.className = 'cat-no-results';
        el.id = 'catNoResults';
        el.innerHTML = `
      <h3>No services found</h3>
      <p>Try a different search term, or browse a category above.</p>
    `;
        skuGrid.insertAdjacentElement('afterend', el);
    }
    function removeNoResults() {
        const el = document.getElementById('catNoResults');
        if (el)
            el.remove();
    }

    function renderSkuCard(sku, category, subCategory) {
        const cartItem = getCart().find(i => i.skuId === sku.serviceId);
        const qty = cartItem ? cartItem.qty : 0;
        return `
      <article class="sku-card" data-sku-id="${sku.serviceId}">
        <div class="sku-thumb">
          <img src="${serviceImage(sku, subCategory)}" alt="${escapeHtml(sku.name)}" loading="lazy">
          ${sku.isPopular ? '<span class="sku-popular-badge">Popular</span>' : ''}
          <button type="button" class="sku-wishlist-btn" data-wishlist-toggle aria-label="Save ${escapeHtml(sku.name)} to wishlist" aria-pressed="${isWishlisted(sku.serviceId)}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div class="sku-card-body">
          <p class="sku-breadcrumb">${escapeHtml(category.name)} · ${escapeHtml(subCategory.name)}</p>
          <h3 class="sku-name">${escapeHtml(sku.name)}</h3>
          <p class="sku-description">${escapeHtml(sku.description)}</p>
          <div class="sku-meta-row">
            <span class="sku-duration" aria-label="Estimated duration">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              ${escapeHtml(sku.duration)}
            </span>
            <span class="rating" aria-label="Rated ${sku.ratingAvg} out of 5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.1 6.6 7.2.9-5.3 5 1.4 7.2L12 18l-6.4 3.7L7 14.5l-5.3-5 7.2-.9Z"/></svg>
              ${sku.ratingAvg.toFixed(1)}
            </span>
            <span class="dot" aria-hidden="true">·</span>
            <span>${sku.reviews.toLocaleString('en-IN')} reviews</span>
          </div>
          ${qty > 0 ? `
            <p class="sku-schedule-line" data-schedule-line>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              <span data-schedule-text>${formatScheduleShort(cartItem)}</span>
              <button type="button" class="link-btn" data-change-slot>Change</button>
            </p>
          ` : ''}
          <div class="sku-footer">
            <span class="sku-price">${sku.currency} ${sku.basePrice.toLocaleString('en-IN')}<small><br>onward</small></span>

            <button type="button" class="sku-add-btn${qty > 0 ? ' is-added' : ''}" data-add-btn ${qty > 0 ? 'hidden' : ''}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
              Add
            </button>
            <div class="sku-stepper${qty > 0 ? ' is-visible' : ''}" data-stepper>
              <button type="button" data-decrement aria-label="Remove one">&minus;</button>
              <span class="sku-stepper-qty" data-qty>${qty}</span>
              <button type="button" data-increment aria-label="Add one more">+</button>
            </div>
          </div>
        </div>
      </article>
    `;
    }

    function formatScheduleShort(cartItem) {
        if (!cartItem)
            return '';
        const d = new Date(cartItem.date + 'T00:00:00');
        const dateLabel = d.toLocaleDateString('en-IN', {weekday: 'short', day: 'numeric', month: 'short'});
        const addressPart = cartItem.addressSummary ? ` · ${cartItem.addressSummary}` : '';
        return `${dateLabel} · ${cartItem.timeSlotLabel}${addressPart}`;
    }

    function isWishlisted(skuId) {
        return getWishlist().some(i => i.skuId === skuId);
    }

    function wireCardControls(items) {
        items.forEach(({ sku, category, subCategory }) => {
            const card = skuGrid.querySelector(`[data-sku-id="${sku.serviceId}"]`);
            if (!card)
                return;
            const addBtn = card.querySelector('[data-add-btn]');
            const incBtn = card.querySelector('[data-increment]');
            const decBtn = card.querySelector('[data-decrement]');
            const changeSlotBtn = card.querySelector('[data-change-slot]');
            const wishlistBtn = card.querySelector('[data-wishlist-toggle]');

            if (wishlistBtn) {
                wishlistBtn.addEventListener('click', () => {
                    const nowWishlisted = toggleWishlistItem({
                        skuId: sku.serviceId,
                        name: sku.name,
                        price: sku.basePrice,
                        currency: sku.currency,
                        categoryName: category.name,
                        subCategoryName: subCategory.name,
                        image: serviceImage(sku, subCategory),
                        duration: sku.durationMinutes
                    });
                    wishlistBtn.setAttribute('aria-pressed', String(nowWishlisted));
                });
            }

            addBtn.addEventListener('click', async () => {
                if (typeof isLoggedIn === 'function' && (! await isLoggedIn() || ! getCurrentUser())) {
                    promptLoginToContinue('You have to log in or sign up to opt for a service.');
                    return;
                }
                openSchedulePicker(sku.serviceId, sku.name, null, (schedule) => {
                    addToCart(sku, category, subCategory, schedule);
                    renderGrid();
                });
            });

            incBtn.addEventListener('click', () => {
                // Additional units of the same visit reuse the already-chosen slot.
                const existing = getCart().find(i => i.skuId === sku.serviceId);
                addToCart(sku, category, subCategory, existing);
                renderGrid();
            });

            decBtn.addEventListener('click', () => {
                removeFromCart(sku.serviceId);
                renderGrid();
            });

            if (changeSlotBtn) {
                changeSlotBtn.addEventListener('click', () => {
                    const current = getCart().find(i => i.skuId === sku.serviceId);
                    openSchedulePicker(sku.name, current, (schedule) => {
                        updateCartSchedule(sku.serviceId, schedule);
                        renderGrid();
                    });
                });
        }
        });
    }

    // ---- cart state (persisted via script.js's getCart/saveCart helpers) --
    function addToCart(sku, category, subCategory, schedule) {
        const cart = getCart();
        let item = cart.find(i => i.skuId === sku.serviceId);
        if (!item) {
            item = {
                skuId: sku.serviceId,
                name: sku.name,
                price: sku.basePrice,
                currency: sku.currency,
                categoryName: category.name,
                subCategoryName: subCategory.name,
                duration: sku.durationMinutes,
                qty: 0,
                date: schedule ? schedule.date : null,
                timeSlotId: schedule ? schedule.timeSlotId : null,
                timeSlotLabel: schedule ? schedule.timeSlotLabel : null,
                addressId: schedule ? schedule.addressId : null,
                addressSummary: schedule ? schedule.addressSummary : null
            };
            cart.push(item);
        } else if (schedule) {
            item.date = schedule.date;
            item.timeSlotId = schedule.timeSlotId;
            item.timeSlotLabel = schedule.timeSlotLabel;
            item.addressId = schedule.addressId;
            item.addressSummary = schedule.addressSummary;
        }
        // alert('Adding to cart:\n' + JSON.stringify(cart));
        item.qty += 1;
        saveCart(cart);
        updateCartBar();
    }

    function removeFromCart(skuId) {
        let cart = getCart();
        const item = cart.find(i => i.skuId === skuId);
        if (!item)
            return;
        item.qty -= 1;
        if (item.qty <= 0)
            cart = cart.filter(i => i.skuId !== skuId);
        saveCart(cart);
        updateCartBar();
    }

    function updateCartSchedule(skuId, schedule) {
        const cart = getCart();
        const item = cart.find(i => i.skuId === skuId);
        if (!item)
            return;
        item.date = schedule.date;
        item.timeSlotId = schedule.timeSlotId;
        item.timeSlotLabel = schedule.timeSlotLabel;
        item.addressId = schedule.addressId;
        item.addressSummary = schedule.addressSummary;
        saveCart(cart);
    }

    function updateCartBar() {
        const cart = getCart();
        const totalQty = getCartCount(cart);
        const totalPrice = getCartTotal(cart);

        if (totalQty === 0) {
            cartBar.classList.remove('is-visible');
            return;
        }

        cartBarCount.textContent = `${totalQty} service${totalQty === 1 ? '' : 's'} added`;
        cartBarTotal.textContent = `₹${totalPrice.toLocaleString('en-IN')}`;
        cartBar.classList.add('is-visible');
    }

    cartBarCta.addEventListener('click', () => {
        if (getCart().length === 0)
            return;

        if (isLoggedIn() && getCurrentUser()) {
            window.location.href = 'checkout';
            return;
        }

        // Not signed in yet: capture where to land after signup completes,
        // then open the same signup flow used everywhere else on the site.
        safeStorageSet(HEARTH_STORAGE_KEYS.postSignupRedirect, 'checkout');
        const signupBtn = document.getElementById('signupBtn');
        if (signupBtn)
            signupBtn.click();
    });

    function countServices(category) {
        return category.subCategories.reduce((sum, sub) => sum + sub.services.length, 0);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
