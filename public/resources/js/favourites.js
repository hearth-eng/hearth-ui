/* =========================================================================
   HEARTH — favourites.js
   Renders two independent lists: Favourite Professionals and Wishlist
   (saved services), both backed by the localStorage helpers defined in
   script.js (getFavouriteProfessionals/toggleFavouriteProfessional,
   getWishlist/toggleWishlistItem). No network calls — neither list was
   specified against a REST endpoint.
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  if (typeof getCurrentUser === 'undefined') return; // guard: only runs on favourites.html
  initFavouritesPage();
});

function initFavouritesPage() {
  const gate = document.getElementById('favouritesGate');
  const content = document.getElementById('favouritesContent');
  if (!gate || !content) return;

  if (!isLoggedIn() || !getCurrentUser()) {
    gate.hidden = false;
    content.hidden = true;
    document.getElementById('favouritesGateSignupBtn')?.addEventListener('click', () => {
      document.getElementById('signupBtn')?.click();
    });
    return;
  }

  gate.hidden = true;
  content.hidden = false;
  renderFavouriteProfessionals();
  renderWishlist();
}

/* ---- Favourite professionals ---------------------------------------- */
function renderFavouriteProfessionals() {
  const grid = document.getElementById('favouriteProsGrid');
  const empty = document.getElementById('favouriteProsEmpty');
  const pros = getFavouriteProfessionals();

  if (pros.length === 0) {
    grid.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  grid.innerHTML = pros.map(pro => `
    <article class="pro-card" data-fav-pro-id="${escapeHtmlF(pro.id)}">
      <button type="button" class="pro-favourite-btn" aria-pressed="true" data-remove-favourite-pro="${escapeHtmlF(pro.id)}" aria-label="Remove ${escapeHtmlF(pro.name)} from favourites">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z"/></svg>
      </button>
      <div class="pro-photo">
        ${pro.photo
          ? `<img src="${escapeAttrF(pro.photo)}" alt="Portrait of ${escapeHtmlF(pro.name)}" width="96" height="96" loading="lazy">`
          : `<svg viewBox="0 0 96 96" role="img" aria-label="Portrait of ${escapeHtmlF(pro.name)}"><circle cx="48" cy="48" r="48" fill="var(--color-sage-20)"/><circle cx="48" cy="40" r="17" fill="var(--color-espresso)"/><path d="M14 92c4-20 20-30 34-30s30 10 34 30" fill="var(--color-espresso)"/></svg>`}
        <span class="verified-pin" title="Background verified">&check;</span>
      </div>
      <h3>${escapeHtmlF(pro.name)}</h3>
      <p class="pro-role">${escapeHtmlF(pro.role)}</p>
      <div class="pro-meta">
        <span class="rating"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3.1 6.6 7.2.9-5.3 5 1.4 7.2L12 18l-6.4 3.7L7 14.5l-5.3-5 7.2-.9Z"/></svg> ${escapeHtmlF(pro.rating)}</span>
      </div>
      <div class="pro-footer">
        <span class="pro-price">${escapeHtmlF(pro.price)} <small>onward</small></span>
        <a href="index#top" class="btn btn-primary btn-sm btn-ripple">Book Now</a>
      </div>
    </article>
  `).join('');

  grid.querySelectorAll('[data-remove-favourite-pro]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.removeFavouritePro;
      const list = getFavouriteProfessionals().filter(p => p.id !== id);
      saveFavouriteProfessionals(list);
      renderFavouriteProfessionals();
    });
  });
}

/* ---- Wishlist (saved services) ---------------------------------------- */
function renderWishlist() {
  const list = document.getElementById('wishlistGrid');
  const empty = document.getElementById('wishlistEmpty');
  const items = getWishlist();

  if (items.length === 0) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  list.innerHTML = items.map(item => `
    <article class="wishlist-card" data-wishlist-sku-id="${escapeHtmlF(item.skuId)}">
      <img class="wishlist-thumb" src="${escapeAttrF(item.image)}" alt="" loading="lazy">
      <div class="wishlist-card-body">
        <p class="sku-breadcrumb">${escapeHtmlF(item.categoryName)} · ${escapeHtmlF(item.subCategoryName)}</p>
        <h3 class="sku-name">${escapeHtmlF(item.name)}</h3>
        <div class="sku-meta-row">
          <span class="sku-duration"><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> ${escapeHtmlF(item.duration)}</span>
        </div>
        <div class="sku-footer">
          <span class="sku-price">${escapeHtmlF(item.currency)}${Number(item.price).toLocaleString('en-IN')}<small><br>onward</small></span>
          <div style="display:flex; gap:0.5rem;">
            <button type="button" class="btn btn-ghost btn-sm" data-remove-wishlist="${escapeHtmlF(item.skuId)}">Remove</button>
            <button type="button" class="btn btn-primary btn-sm btn-ripple" data-add-wishlist-to-cart="${escapeHtmlF(item.skuId)}">Add to Cart</button>
          </div>
        </div>
      </div>
    </article>
  `).join('');

  list.querySelectorAll('[data-remove-wishlist]').forEach(btn => {
    btn.addEventListener('click', () => {
      const skuId = btn.dataset.removeWishlist;
      saveWishlist(getWishlist().filter(i => i.skuId !== skuId));
      renderWishlist();
    });
  });

  list.querySelectorAll('[data-add-wishlist-to-cart]').forEach(btn => {
    btn.addEventListener('click', () => {
      const skuId = btn.dataset.addWishlistToCart;
      const item = getWishlist().find(i => i.skuId === skuId);
      if (!item) return;

      openSchedulePicker(item.name, null, (schedule) => {
        const cart = getCart();
        let cartItem = cart.find(i => i.skuId === item.skuId);
        if (!cartItem) {
          cartItem = {
            skuId: item.skuId,
            name: item.name,
            price: item.price,
            currency: item.currency,
            categoryName: item.categoryName,
            subCategoryName: item.subCategoryName,
            duration: item.duration,
            qty: 0,
            date: schedule.date,
            timeSlotId: schedule.timeSlotId,
            timeSlotLabel: schedule.timeSlotLabel,
            addressId: schedule.addressId,
            addressSummary: schedule.addressSummary,
          };
          cart.push(cartItem);
        } else {
          cartItem.date = schedule.date;
          cartItem.timeSlotId = schedule.timeSlotId;
          cartItem.timeSlotLabel = schedule.timeSlotLabel;
          cartItem.addressId = schedule.addressId;
          cartItem.addressSummary = schedule.addressSummary;
        }
        cartItem.qty += 1;
        saveCart(cart);

        const addedBtn = document.querySelector(`[data-add-wishlist-to-cart="${skuId}"]`);
        if (addedBtn) {
          const original = addedBtn.textContent;
          addedBtn.textContent = 'Added ✓';
          setTimeout(() => { addedBtn.textContent = original; }, 1600);
        }
      });
    });
  });
}

function escapeHtmlF(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}
function escapeAttrF(str) {
  return escapeHtmlF(str).replace(/"/g, '&quot;');
}
