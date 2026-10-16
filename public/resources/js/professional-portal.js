/* =========================================================================
 HEARTH — professional-portal.js
 Drives professional-portal.html: the left-navigation dashboard a
 registered professional lands on after verifying through
 professional-onboarding.html. Sections (switched via the URL hash, so
 each one is linkable and the browser back button works):

   #profile         My Profile — account details, professional details
                    (application status) and saved addresses
   #bookings        My Bookings — upcoming / completed / cancelled
   #neighbourhoods  My Neighbourhoods — localities the professional serves
   #services        My Services — services on the professional's profile
   #earnings        My Earnings — totals derived from booking amounts

 Read-only by design; editing profile/addresses links to the existing
 profile.html editor rather than duplicating it here.

 Reuses session helpers from script.js (isLoggedIn, getCurrentUser,
 renderUserChip, postLogout) and HearthAPI (api.js) for every request.
 Wrapped in an IIFE so nothing here collides with other page scripts.
 ========================================================================= */

(function () {
    'use strict';

    const SECTIONS = ['profile', 'bookings', 'neighbourhoods', 'services', 'earnings'];
    const DEFAULT_SECTION = 'profile';
    const ALL_LOCALITIES_ID = '-1';

    const ctx = {
        user: null,
        professional: null,
        loaded: {},               // section -> true once rendered
        bookingsPromise: null,    // shared by My Bookings + My Earnings
        activeBookingTab: 'upcoming',
        bookings: []
    };

    document.addEventListener('DOMContentLoaded', () => {
        if (typeof HearthAPI === 'undefined' || typeof getCurrentUser === 'undefined') {
            return;
        }
        if (!document.getElementById('ppContent')) {
            return; // guard: only runs on this page
        }
        initPortal();
    });

    async function initPortal() {
        // alert('Init Portal');
        let loggedIn = false;
        try {
            loggedIn = await isLoggedIn();
            // alert('Is logged in: ' + loggedIn);
        } catch (err) {
            loggedIn = false;
        }
        const cachedUser = getCurrentUser();
        // alert('Cached User:\n' + JSON.stringify(cachedUser, null, 2));
        
        if (!loggedIn || !cachedUser) {
            hide('ppLoading');
            show('ppGate');
            return;
        }

        const res = await HearthAPI.viewProfessional();
        hide('ppLoading');

        if (!res.success) {
            if (res.code === 401 || res.authExpired) {
                postLogout();
                show('ppGate');
                return;
            }
            if (res.code === 404 || res.code === 403) {
                show('ppNotPro');
                return;
            }
            showErr('ppLoadError', res.message || 'Could not load your dashboard. Please refresh and try again.');
            return;
        }
        // alert('Queried professional:\n' + JSON.stringify(res.result, null, 2));
        
        ctx.professional = res.result || {};
        ctx.user = ctx.professional.user || cachedUser;
        if (ctx.professional.user) {
            renderUserChip(ctx.professional.user);
        }
        const firstName = String(ctx.user.fullName || 'there').trim().split(' ')[0];
        document.getElementById('ppGreeting').textContent = `Welcome back, ${firstName}`;

        show('ppContent');
        wireBookingTabs();
        window.addEventListener('hashchange', showSectionFromHash);
        showSectionFromHash();
    }

    /* ---- left-nav section switching ------------------------------------- */
    function showSectionFromHash() {
        const requested = (window.location.hash || '').replace('#', '');
        const section = SECTIONS.includes(requested) ? requested : DEFAULT_SECTION;

        document.querySelectorAll('[data-pp-nav]').forEach(link => {
            const active = link.dataset.ppNav === section;
            link.classList.toggle('is-active', active);
            if (active) {
                link.setAttribute('aria-current', 'page');
            }
            else {
                link.removeAttribute('aria-current');
            }
        });
        document.querySelectorAll('[data-pp-panel]').forEach(panel => {
            panel.hidden = panel.dataset.ppPanel !== section;
        });

        if (! ctx.loaded[section]) {
            ctx.loaded[section] = true;
            ({
                profile: loadProfile,
                bookings: loadBookings,
                neighbourhoods: loadNeighbourhoods,
                services: loadServices,
                earnings: loadEarnings
            })[section]();
        }
    }

    /* =====================================================================
     MY PROFILE
     ===================================================================== */
    function loadProfile() {
        // alert('Called loadProfile');
        
        loadProfileDetails();
        loadProfessionalDetails();
        loadAddresses();
    }

    async function loadProfileDetails() {
        const grid = document.getElementById('ppProfileFields');
        // const res = await HearthAPI.viewUser();
        // const user = res.success && res.result ? res.result : ctx.user;
        // if (!res.success) {
        //     showErr('ppProfileError', res.message || 'Could not load your latest profile details.');
        // }
        // alert('Queried User (2nd time):\n' + JSON.stringify(res.result, null, 2));
        
        const user = ctx.professional.user;
        
        grid.innerHTML = [
            field('User ID', user.externalId),
            field('Full name', user.fullName),
            field('Email address', user.email),
            field('Primary phone', user.phone1),
            field('Secondary phone', user.phone2),
            field('User role', user.role),
            field('Account status', user.status),
            field('Member since', formatDate(user.createdAt))
        ].join('');
    }

    async function loadProfessionalDetails() {
        const pro = ctx.professional || {};
        const grid = document.getElementById('ppProFields');
        const badge = document.getElementById('ppStatusBadge');

        // Application status lives on the submitted identity document
        // (same source professional-dashboard.js uses).
        let doc = null;
        const res = await HearthAPI.viewDocuments();
        if (res.success && res.result && Array.isArray(res.result.items)) {
            doc = res.result.items[0] || null;
        }
        // alert('Queried Document(s):\n' + JSON.stringify(res.result.items, null, 2));
        
        const rawStatus = doc && doc.verificationStatus ? doc.verificationStatus : (pro.status || '');
        const status = String(rawStatus).toUpperCase() === 'PENDING' ? 'Pending Review' : (rawStatus || '—');
        const meta = statusMeta(status);
        badge.textContent = status;
        badge.style.background = meta.bg;
        badge.style.color = meta.color;

        const exp = pro.experienceYears;
        grid.innerHTML = [
            field('Application ID', (doc && doc.applicationId) || pro.applicationId),
            field('Applied on', formatDate((doc && doc.createdAt) || pro.createdAt)),
            field('Years of experience', exp !== undefined && exp !== null && exp !== ''
                    ? `${exp} yr${Number(exp) === 1 ? '' : 's'}` : null),
            field('Serving cities', pro.servingCities)
        ].join('');

        const hint = document.getElementById('ppStatusHint');
        const s = String(status).toLowerCase();
        if (s.includes('reject')) {
            hint.textContent = 'Your application was not approved this time. Contact support if you think this is a mistake.';
            hint.hidden = false;
        } else if (s.includes('pending') || s.includes('review')) {
            hint.textContent = "We're reviewing your application — this usually takes 2–3 business days.";
            hint.hidden = false;
        }
    }

    async function loadAddresses() {
        const body = document.getElementById('ppAddressBody');
        const res = await HearthAPI.viewAddresses();
        if (!res.success) {
            body.innerHTML = '';
            showErr('ppAddressError', res.message || 'Could not fetch addresses. Please try again.');
            return;
        }
        // alert('Queried Addres(s):\n' + JSON.stringify(res.result.items, null, 2));
        
        const addresses = (res.result && res.result.items) || [];
        if (addresses.length === 0) {
            body.innerHTML = `
        <div class="address-empty-state">
          <span class="address-empty-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M12 22s7-7.4 7-12.5A7 7 0 0 0 5 9.5C5 14.6 12 22 12 22Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.5" stroke="currentColor" stroke-width="2"/></svg>
          </span>
          <p>You haven't added an address yet.</p>
          <a href="profile" class="btn btn-primary btn-ripple">Add an Address</a>
        </div>`;
            return;
        }
        body.innerHTML = `<div class="address-list">${addresses.map(a => `
      <div class="address-entry">
        <div class="address-entry-header">
          <span class="address-entry-label">${esc(a.label || 'Address')}</span>
        </div>
        <div class="profile-fields-grid">${[
                field('Primary address line', a.addressLine1),
                field('Secondary address line', a.addressLine2),
                field('Locality', a.locality),
                field('City', a.city),
                field('State', a.province),
                field('Pincode', a.pincode)
            ].join('')}</div>
      </div>`).join('')}</div>`;
    }

    /* =====================================================================
     MY BOOKINGS (+ shared fetch for My Earnings)
     ===================================================================== */
    function fetchBookings() {
        if (!ctx.bookingsPromise) {
            ctx.bookingsPromise = HearthAPI.getBookings().then(result => {
                if (result.success) {
                    const items = (result.result && result.result.items) || [];
                    ctx.bookings = items.map(b => ({...b, _tab: classifyBooking(b)}));
                } else {
                    ctx.bookingsPromise = null; // allow a retry on next visit
                }
                return result;
            });
        }
        return ctx.bookingsPromise;
    }

    function classifyBooking(booking) {
        if (String(booking.status || '').toUpperCase() === 'CANCELLED')
            return 'cancelled';
        if (booking.scheduledAt && new Date(booking.scheduledAt).getTime() < Date.now())
            return 'past';
        return 'upcoming';
    }

    async function loadBookings() {
        show('ppBookingsLoading');
        hide('ppBookingsError');
        const result = await fetchBookings();
        
        hide('ppBookingsLoading');
        if (!result.success) {
            ctx.loaded.bookings = false;
            showErr('ppBookingsError', result.message || 'Could not load your bookings. Please try again.');
            return;
        }
        // alert('Queried Bookings:\n' + JSON.stringify(result, null, 2));
        renderBookings();
    }

    function wireBookingTabs() {
        document.querySelectorAll('[data-pp-booking-tab]').forEach(btn => {
            btn.addEventListener('click', () => {
                ctx.activeBookingTab = btn.dataset.ppBookingTab;
                document.querySelectorAll('[data-pp-booking-tab]').forEach(b => b.classList.toggle('is-active', b === btn));
                renderBookings();
            });
        });
    }

    function renderBookings() {
        document.querySelectorAll('[data-pp-booking-tab]').forEach(btn => {
            const count = ctx.bookings.filter(b => b._tab === btn.dataset.ppBookingTab).length;
            const label = btn.querySelector('[data-pp-tab-count]');
            if (label)
                label.textContent = `(${count})`;
        });

        const list = document.getElementById('ppBookingsList');
        const filtered = ctx.bookings
                .filter(b => b._tab === ctx.activeBookingTab)
                .sort((a, b) => new Date(a.scheduledAt || 0) - new Date(b.scheduledAt || 0));

        document.getElementById('ppBookingsEmpty').hidden = filtered.length > 0;
        list.innerHTML = filtered.map(renderBookingCard).join('');
    }

    function renderBookingCard(booking) {
        const meta = {
            upcoming: {label: 'Upcoming', cls: 'booking-status-upcoming'},
            past: {label: 'Completed', cls: 'booking-status-past'},
            cancelled: {label: 'Cancelled', cls: 'booking-status-cancelled'}
        } [booking._tab];
        
        // const customer = booking.customerName;

        return `
    <article class="booking-card">
      <div class="booking-card-header">
        <p class="order-line-breadcrumb">Booking ${esc(booking.bookingId || '')}${booking.createdAt ? ' · Booked on ' + esc(formatDate(booking.createdAt)) : ''}</p>
        <span class="booking-status-badge ${meta.cls}">${meta.label}</span>
      </div>
      <h4>${esc(booking.serviceName || 'Service')}</h4>
      <p class="profile-field-label" style="text-transform:none; letter-spacing:0; margin-top: 0.3rem;">
        ${esc(formatDate(booking.scheduledAt))}${' - ' + esc(booking.timeSlot)}${' · ' + esc(booking.customerName)}${' · ' + esc(booking.customerContact)}
      </p>
      ${booking.address ? `<p class="profile-field-label" style="text-transform:none; letter-spacing:0;">${esc(booking.address)}</p>` : ''}
      ${amountOf(booking) ? `<p class="sku-price" style="margin-top: 0.4rem;">${formatInr(amountOf(booking))}</p>` : ''}
    </article>`;
    }

    /* =====================================================================
     MY NEIGHBOURHOODS
     ===================================================================== */
    async function loadNeighbourhoods() {
        // alert('Loading Neighbourhoods ...');
        
        const res = await HearthAPI.viewProfessionalNeighbourhoods();
        if (! res.success) {
            ctx.loaded.neighbourhoods = false;
            showErr('ppNeighbourhoodsError', res.message || 'Could not load your servicing localities. Please try again.');
            return;
        }
        ctx.servedNbhoods = (res.result && res.result.items) || [];
        wireNeighbourhoodsEditor();
        renderNeighbourhoodsView();
    }

    /* ---- read view ------------------------------------------------------- */
    function renderNeighbourhoodsView() {
        const container = document.getElementById('ppNeighbourhoods');
        const empty = document.getElementById('ppNeighbourhoodsEmpty');

        document.getElementById('ppNeighbourhoodsEditor').hidden = true;
        container.hidden = false;
        document.getElementById('ppNbEditBtn').hidden = false;
        document.getElementById('ppNbCancelBtn').hidden = true;
        document.getElementById('ppNbSaveBtn').hidden = true;
        document.getElementById('ppNeighbourhoodsHint').textContent = 'Localities you take bookings in, grouped by zone.';

        const nbhoods = ctx.servedNbhoods || [];
        if (nbhoods.length === 0) {
            container.innerHTML = '';
            empty.hidden = false;
            return;
        }
        empty.hidden = true;
        renderNeighbourhoodZones(container, nbhoods);
    }

    /* ---- edit: add / remove localities ------------------------------------
     Same zone-wise picker as onboarding ("Localities you serve"): ★ All
     Localities (sentinel -1, mutually exclusive), search, one collapsible
     block per zone with a tri-state "Select all" and a checklist of
     locality + pincode. Lists every locality in the professional's city
     (GET /neighbourhoods?cityId=…), pre-ticked from what they serve now.
     Save → PATCH /professionalNeighbourhoods with the id array, then the
     view is rebuilt from a fresh GET (never from the local draft). */
    async function professionalCityId() {
        const pro = ctx.professional || {};
        const cityName = String(pro.servingCities || '').split(',')[0].trim();
        if (!cityName) {
            return null;
        }
        const res = await HearthAPI.viewCities('cityName', cityName);
        if (! res.success || !res.result || res.result.total !== 1) {
            return null;
        }
        return res.result.items[0].cityId;
    }

    function wireNeighbourhoodsEditor() {
        if (ctx.nbEditorWired)
            return;
        ctx.nbEditorWired = true;

        const editBtn = document.getElementById('ppNbEditBtn');
        const cancelBtn = document.getElementById('ppNbCancelBtn');
        const saveBtn = document.getElementById('ppNbSaveBtn');

        editBtn.addEventListener('click', async () => {
            hide('ppNeighbourhoodsError');
            const served = (ctx.servedNbhoods || []).map(n => String(n.neighbourhoodId));
            ctx.nbDraft = {
                ids: served.includes(ALL_LOCALITIES_ID) ? [ALL_LOCALITIES_ID] : served,
                openZones: new Set(),
                search: ''
            };
            // Open the zones the professional already serves.
            (ctx.servedNbhoods || []).forEach(n => ctx.nbDraft.openZones.add(zoneOf(n)));

            if (!ctx.cityNbhoods) {
                const cityId = await professionalCityId();   // async — must be awaited
                if (cityId === null) {
                    showErr('ppNeighbourhoodsError', 'We couldn\'t work out your city, so localities can\'t be edited right now.');
                    return;
                }
                editBtn.disabled = true;
                editBtn.textContent = 'Loading…';
                const res = await HearthAPI.viewNeighbourhoods(cityId);
                editBtn.disabled = false;
                editBtn.textContent = 'Edit';
                if (!res.success) {
                    showErr('ppNeighbourhoodsError', res.message || 'Could not load the localities in your city. Please try again.');
                    return;
                }
                ctx.cityNbhoods = (res.result && (res.result.items || res.result)) || [];
            }
            if (ctx.cityNbhoods.length === 0) {
                showErr('ppNeighbourhoodsError', 'No localities are set up for your city yet.');
                return;
            }
            renderNeighbourhoodsEditor();
        });

        cancelBtn.addEventListener('click', () => {
            hide('ppNeighbourhoodsError');
            renderNeighbourhoodsView();
        });

        saveBtn.addEventListener('click', async () => {
            hide('ppNeighbourhoodsError');
            const ids = ctx.nbDraft.ids;
            if (ids.length === 0) {
                showErr('ppNeighbourhoodsError', 'Select at least one locality to keep taking bookings.');
                return;
            }
            // Numeric ids ([-1] = All Localities).
            const payload = ids.map(id => (/^-?\d+$/.test(id) ? Number(id) : id));
            // alert(JSON.stringify(payload));
            // const res = {success:false};
            
            saveBtn.disabled = true;
            cancelBtn.disabled = true;
            saveBtn.textContent = 'Saving…';
            const res = await HearthAPI.updateProfessionalNeighbourhoods(payload);
            saveBtn.disabled = false;
            cancelBtn.disabled = false;
            saveBtn.textContent = 'Save';

            if (!res.success) {
                showErr('ppNeighbourhoodsError', res.message || 'Could not save your localities. Please try again.');
                return;
            }

            const fresh = await HearthAPI.viewProfessionalNeighbourhoods();
            if (fresh.success) {
                ctx.servedNbhoods = (fresh.result && fresh.result.items) || [];
            } else {
                const byId = new Map((ctx.cityNbhoods || []).map(n => [String(n.neighbourhoodId), n]));
                ctx.servedNbhoods = ids.includes(ALL_LOCALITIES_ID)
                        ? [{neighbourhoodId: -1, locality: 'All Localities'}]
                        : ids.map(id => byId.get(id)).filter(Boolean);
            }
            renderNeighbourhoodsView();
        });
    }

    function renderNeighbourhoodsEditor() {
        document.getElementById('ppNeighbourhoods').hidden = true;
        document.getElementById('ppNeighbourhoodsEmpty').hidden = true;
        const editor = document.getElementById('ppNeighbourhoodsEditor');
        editor.hidden = false;
        document.getElementById('ppNbEditBtn').hidden = true;
        document.getElementById('ppNbCancelBtn').hidden = false;
        document.getElementById('ppNbSaveBtn').hidden = false;
        document.getElementById('ppNeighbourhoodsHint').textContent =
                'Tick localities to add them, untick to remove. Use “Select all” for a whole zone, or “All Localities” for the entire city.';

        const draft = ctx.nbDraft;
        const allSelected = draft.ids.includes(ALL_LOCALITIES_ID);
        const selected = new Set(draft.ids);
        const zones = groupByZone(ctx.cityNbhoods);
        if (zones.length === 1)
            draft.openZones.add(zones[0][0]);

        const blocks = zones.map(([zone, list], idx) => {
            const isOpen = draft.openZones.has(zone);
            const bodyId = `ppNbEditBody${idx}`;
            const rows = list.map(n => {
                const id = String(n.neighbourhoodId);
                const search = `${n.locality || ''} ${n.pincode || ''} ${zone}`.toLowerCase();
                return `
            <label class="po-loc" data-po-loc-search="${esc(search)}">
              <input type="checkbox" value="${esc(id)}" data-po-serving ${allSelected ? 'disabled' : ''} ${!allSelected && selected.has(id) ? 'checked' : ''}>
              <span class="po-loc-box" aria-hidden="true"></span>
              <span class="po-loc-name">${esc(n.locality)}</span>
              ${n.pincode ? `<span class="po-loc-pin">${esc(n.pincode)}</span>` : ''}
            </label>`;
            }).join('');
            return `
        <section class="po-zone${isOpen ? ' is-open' : ''}" data-po-zone="${esc(zone)}">
          <div class="po-zone-head">
            <button type="button" class="po-zone-toggle" data-po-zone-toggle aria-expanded="${isOpen}" aria-controls="${bodyId}">
              <span class="po-zone-chevron" aria-hidden="true"></span>
              <span class="po-zone-name">${esc(zone)}</span>
              <span class="po-zone-count" data-po-zone-count></span>
            </button>
            <label class="po-zone-all">
              <input type="checkbox" data-po-zone-all ${allSelected ? 'disabled' : ''}>
              <span>Select all</span>
            </label>
          </div>
          <div class="po-zone-body" id="${bodyId}" ${isOpen ? '' : 'hidden'}>${rows}
          </div>
        </section>`;
        }).join('');

        editor.innerHTML = `
      <div class="po-zone-toolbar">
        <label class="pro-expertise-chip pro-expertise-chip-all">
          <input type="checkbox" value="${ALL_LOCALITIES_ID}" data-po-serving-all ${allSelected ? 'checked' : ''}>
          <span>★ All Localities</span>
        </label>
        <input type="search" class="po-zone-search" data-po-zone-search placeholder="Search locality or pincode" autocomplete="off" aria-label="Search localities" value="${esc(draft.search)}" ${allSelected ? 'disabled' : ''}>
      </div>
      <div class="po-zone-summary">
        <span data-po-zone-summary></span>
        <button type="button" class="po-zone-clear" data-po-zone-clear hidden>Clear</button>
      </div>
      <div class="po-zone-list${allSelected ? ' is-disabled' : ''}">${blocks}
        <p class="po-zone-empty" data-po-zone-empty hidden>No localities match your search.</p>
      </div>`;

        const setServing = (id, on) => {
            id = String(id);
            const has = draft.ids.includes(id);
            if (on && !has)
                draft.ids.push(id);
            else if (!on && has)
                draft.ids = draft.ids.filter(x => x !== id);
        };

        editor.querySelector('[data-po-serving-all]').addEventListener('change', e => {
            draft.ids = e.target.checked ? [ALL_LOCALITIES_ID] : [];
            hide('ppNeighbourhoodsError');
            renderNeighbourhoodsEditor();
        });

        const searchInput = editor.querySelector('[data-po-zone-search]');
        searchInput.addEventListener('input', () => {
            draft.search = searchInput.value;
            applyNbEditorSearch(editor);
        });

        editor.querySelector('[data-po-zone-clear]').addEventListener('click', () => {
            draft.ids = [];
            editor.querySelectorAll('[data-po-serving]').forEach(cb => { cb.checked = false; });
            syncNbEditor(editor);
        });

        editor.querySelectorAll('[data-po-zone]').forEach(zoneEl => {
            const zone = zoneEl.getAttribute('data-po-zone');
            const toggle = zoneEl.querySelector('[data-po-zone-toggle]');
            const body = zoneEl.querySelector('.po-zone-body');

            toggle.addEventListener('click', () => {
                const open = body.hidden;
                body.hidden = !open;
                zoneEl.classList.toggle('is-open', open);
                toggle.setAttribute('aria-expanded', String(open));
                if (open)
                    draft.openZones.add(zone);
                else
                    draft.openZones.delete(zone);
            });

            const zoneAll = zoneEl.querySelector('[data-po-zone-all]');
            zoneAll.addEventListener('change', () => {
                zoneEl.querySelectorAll('[data-po-serving]').forEach(cb => {
                    cb.checked = zoneAll.checked;
                    setServing(cb.value, cb.checked);
                });
                hide('ppNeighbourhoodsError');
                syncNbEditor(editor);
            });

            zoneEl.querySelectorAll('[data-po-serving]').forEach(cb => {
                cb.addEventListener('change', () => {
                    setServing(cb.value, cb.checked);
                    hide('ppNeighbourhoodsError');
                    syncNbEditor(editor);
                });
            });
        });

        syncNbEditor(editor);
        applyNbEditorSearch(editor);
    }

    /** Per-zone counts, tri-state "Select all", and the "+added / −removed" summary. */
    function syncNbEditor(editor) {
        const draft = ctx.nbDraft;
        const summary = editor.querySelector('[data-po-zone-summary]');
        const clearBtn = editor.querySelector('[data-po-zone-clear]');
        const total = ctx.cityNbhoods.length;

        if (draft.ids.includes(ALL_LOCALITIES_ID)) {
            summary.textContent = `You'll serve every locality in your city (${total}).`;
            clearBtn.hidden = true;
            editor.querySelectorAll('[data-po-zone]').forEach(zoneEl => {
                const boxes = zoneEl.querySelectorAll('[data-po-serving]');
                zoneEl.querySelector('[data-po-zone-count]').textContent = `${boxes.length} localities`;
                const zoneAll = zoneEl.querySelector('[data-po-zone-all]');
                zoneAll.checked = true;
                zoneAll.indeterminate = false;
            });
            return;
        }

        let zonesTouched = 0;
        editor.querySelectorAll('[data-po-zone]').forEach(zoneEl => {
            const boxes = Array.from(zoneEl.querySelectorAll('[data-po-serving]'));
            const checked = boxes.filter(cb => cb.checked).length;
            const zoneAll = zoneEl.querySelector('[data-po-zone-all]');
            zoneAll.checked = checked > 0 && checked === boxes.length;
            zoneAll.indeterminate = checked > 0 && checked < boxes.length;
            zoneEl.classList.toggle('has-selection', checked > 0);
            zoneEl.querySelector('[data-po-zone-count]').textContent =
                    checked > 0 ? `${checked} of ${boxes.length} selected` : `${boxes.length} localities`;
            if (checked > 0)
                zonesTouched++;
        });

        // What changes against what is saved now.
        const before = new Set((ctx.servedNbhoods || []).map(n => String(n.neighbourhoodId)));
        const after = new Set(draft.ids);
        const wasAll = before.has(ALL_LOCALITIES_ID);
        const added = wasAll ? 0 : draft.ids.filter(id => !before.has(id)).length;
        const removed = wasAll ? 0 : Array.from(before).filter(id => !after.has(id)).length;

        const n = draft.ids.length;
        let text = n === 0
                ? 'No localities selected.'
                : `${n} ${n === 1 ? 'locality' : 'localities'} selected across ${zonesTouched} ${zonesTouched === 1 ? 'zone' : 'zones'}.`;
        const changes = [];
        if (added)
            changes.push(`+${added} added`);
        if (removed)
            changes.push(`−${removed} removed`);
        if (changes.length)
            text += ` (${changes.join(', ')})`;
        summary.textContent = text;
        clearBtn.hidden = n === 0;
    }

    function applyNbEditorSearch(editor) {
        const query = (ctx.nbDraft.search || '').trim().toLowerCase();
        let anyVisible = false;
        editor.querySelectorAll('[data-po-zone]').forEach(zoneEl => {
            const zone = zoneEl.getAttribute('data-po-zone');
            let matches = 0;
            zoneEl.querySelectorAll('.po-loc').forEach(row => {
                const hit = !query || row.getAttribute('data-po-loc-search').includes(query);
                row.hidden = !hit;
                if (hit)
                    matches++;
            });
            zoneEl.hidden = matches === 0;
            anyVisible = anyVisible || matches > 0;
            const open = query ? matches > 0 : ctx.nbDraft.openZones.has(zone);
            zoneEl.querySelector('.po-zone-body').hidden = !open;
            zoneEl.classList.toggle('is-open', open);
            zoneEl.querySelector('[data-po-zone-toggle]').setAttribute('aria-expanded', String(open));
        });
        editor.querySelector('[data-po-zone-empty]').hidden = anyVisible;
    }

    /* Zone-wise view of the localities the professional serves — same
     grouping as the onboarding picker ("Localities you serve"), read-only.
     Each item carries `zone` (fks_neighbourhoods.zone); a blank zone falls
     into "Other localities", listed last. The "All Localities" sentinel
     (-1) is shown as a single banner instead of zone groups. */
    const UNZONED_LABEL = 'Other localities';
    const ZONES_OPEN_BY_DEFAULT_MAX = 40;   // collapse zones when the list is long

    function zoneOf(n) {
        const zone = n && n.zone != null ? String(n.zone).trim() : '';
        return zone || UNZONED_LABEL;
    }

    function groupByZone(neighbourhoods) {
        const groups = new Map();
        neighbourhoods
                .slice()
                .sort((a, b) => String(a.locality || '').localeCompare(String(b.locality || ''), undefined, {numeric: true, sensitivity: 'base'}))
                .forEach(n => {
                    const zone = zoneOf(n);
                    if (!groups.has(zone))
                        groups.set(zone, []);
                    groups.get(zone).push(n);
                });
        return Array.from(groups.entries()).sort(([a], [b]) => {
            if (a === UNZONED_LABEL)
                return 1;
            if (b === UNZONED_LABEL)
                return -1;
            return a.localeCompare(b, undefined, {sensitivity: 'base'});
        });
    }

    function renderNeighbourhoodZones(container, nbhoods) {
        const servesAll = nbhoods.some(n => String(n.neighbourhoodId) === ALL_LOCALITIES_ID);
        if (servesAll) {
            container.innerHTML = `
      <div class="pp-zone-allbanner">
        <span class="pp-zone-allbanner-icon" aria-hidden="true">★</span>
        <div>
          <strong>All Localities</strong>
          <span>You take bookings in every locality of your city.</span>
        </div>
      </div>`;
            return;
        }

        const zones = groupByZone(nbhoods);
        const openByDefault = nbhoods.length <= ZONES_OPEN_BY_DEFAULT_MAX || zones.length === 1;
        const total = nbhoods.length;

        const blocks = zones.map(([zone, list], idx) => {
            const bodyId = `ppZoneBody${idx}`;
            const rows = list.map(n => {
                const name = n.locality || n.name || n.neighbourhoodId;
                const search = `${name} ${n.pincode || ''} ${zone}`.toLowerCase();
                return `
            <li class="pp-loc" data-pp-loc-search="${esc(search)}">
              <span class="pp-loc-dot" aria-hidden="true"></span>
              <span class="pp-loc-name">${esc(name)}</span>
              ${n.pincode ? `<span class="pp-loc-pin">${esc(n.pincode)}</span>` : ''}
            </li>`;
            }).join('');
            return `
        <section class="pp-zone${openByDefault ? ' is-open' : ''}" data-pp-zone="${esc(zone)}">
          <button type="button" class="pp-zone-toggle" data-pp-zone-toggle aria-expanded="${openByDefault}" aria-controls="${bodyId}">
            <span class="pp-zone-chevron" aria-hidden="true"></span>
            <span class="pp-zone-name">${esc(zone)}</span>
            <span class="pp-zone-count">${list.length} ${list.length === 1 ? 'locality' : 'localities'}</span>
          </button>
          <ul class="pp-zone-body" id="${bodyId}" ${openByDefault ? '' : 'hidden'}>${rows}
          </ul>
        </section>`;
        }).join('');

        container.innerHTML = `
      <div class="pp-zone-toolbar">
        <input type="search" class="pp-zone-search" data-pp-zone-search placeholder="Search locality or pincode" autocomplete="off" aria-label="Search your localities">
        <button type="button" class="pp-zone-expand" data-pp-zone-expand>${openByDefault ? 'Collapse all' : 'Expand all'}</button>
      </div>
      <p class="pp-zone-summary">${total} ${total === 1 ? 'locality' : 'localities'} across ${zones.length} ${zones.length === 1 ? 'zone' : 'zones'}</p>
      <div class="pp-zone-list">${blocks}
        <p class="pp-zone-empty" data-pp-zone-empty hidden>No localities match your search.</p>
      </div>`;

        const openZones = new Set(openByDefault ? zones.map(([z]) => z) : []);
        const searchInput = container.querySelector('[data-pp-zone-search]');
        const expandBtn = container.querySelector('[data-pp-zone-expand]');

        const setOpen = (zoneEl, open) => {
            zoneEl.querySelector('.pp-zone-body').hidden = !open;
            zoneEl.classList.toggle('is-open', open);
            zoneEl.querySelector('[data-pp-zone-toggle]').setAttribute('aria-expanded', String(open));
        };

        const syncExpandLabel = () => {
            expandBtn.textContent = openZones.size === zones.length ? 'Collapse all' : 'Expand all';
        };

        // Filters rows; matching zones open while searching and go back to
        // the user's own open/closed state once the search is cleared.
        const applySearch = () => {
            const query = searchInput.value.trim().toLowerCase();
            let anyVisible = false;
            container.querySelectorAll('[data-pp-zone]').forEach(zoneEl => {
                let matches = 0;
                zoneEl.querySelectorAll('.pp-loc').forEach(row => {
                    const hit = !query || row.getAttribute('data-pp-loc-search').includes(query);
                    row.hidden = !hit;
                    if (hit)
                        matches++;
                });
                zoneEl.hidden = matches === 0;
                anyVisible = anyVisible || matches > 0;
                setOpen(zoneEl, query ? matches > 0 : openZones.has(zoneEl.getAttribute('data-pp-zone')));
            });
            container.querySelector('[data-pp-zone-empty]').hidden = anyVisible;
            expandBtn.disabled = !!query;
        };

        container.querySelectorAll('[data-pp-zone]').forEach(zoneEl => {
            const zone = zoneEl.getAttribute('data-pp-zone');
            zoneEl.querySelector('[data-pp-zone-toggle]').addEventListener('click', () => {
                const open = !openZones.has(zone);
                if (open)
                    openZones.add(zone);
                else
                    openZones.delete(zone);
                setOpen(zoneEl, open);
                syncExpandLabel();
            });
        });

        expandBtn.addEventListener('click', () => {
            const openAll = openZones.size !== zones.length;
            openZones.clear();
            if (openAll)
                zones.forEach(([z]) => openZones.add(z));
            container.querySelectorAll('[data-pp-zone]').forEach(zoneEl =>
                setOpen(zoneEl, openZones.has(zoneEl.getAttribute('data-pp-zone'))));
            syncExpandLabel();
        });

        searchInput.addEventListener('input', applySearch);
    }

    /* =====================================================================
     MY SERVICES
     ===================================================================== */
    async function loadServices() {
        // alert('Loading Services ...');

        hide('ppServicesError');
        show('ppServicesLoading');

        // The category hierarchy (category › sub-category › services, each
        // service with its image) drives both the read view and the editor.
        // The professional's own services only decide which sub-categories
        // are selected.
        const [catRes, svcRes] = await Promise.all([
            ctx.hierarchy ? Promise.resolve({success: true, result: {items: ctx.hierarchy}}) : HearthAPI.viewCategories(),
            HearthAPI.viewProfessionalServices()
        ]);
        hide('ppServicesLoading');

        if (!catRes.success || !svcRes.success) {
            ctx.loaded.services = false;
            showErr('ppServicesError', (!catRes.success ? catRes.message : svcRes.message) || 'Could not load your services. Please try again.');
            return;
        }

        ctx.hierarchy = (catRes.result && catRes.result.items) || [];
        ctx.selectedSubIds = selectedSubCategoryIds(ctx.hierarchy, (svcRes.result && svcRes.result.items) || []);

        wireServicesEditor();
        renderServicesView();
    }

    /** Works out which sub-categories the professional has selected from the
     *  services GET /professionalServices returns. Matches on, in order: an
     *  explicit sub-category id on the item, the serviceId, then the service
     *  name — whichever the backend provides. */
    function selectedSubCategoryIds(hierarchy, items) {
        const bySubId = new Map(), byServiceId = new Map(), byName = new Map();
        const norm = v => String(v || '').trim().toLowerCase();
        hierarchy.forEach(cat => (cat.subCategories || []).forEach(sub => {
            bySubId.set(String(sub.categoryId), sub.categoryId);
            (sub.services || []).forEach(svc => {
                byServiceId.set(String(svc.serviceId), sub.categoryId);
                byName.set(norm(svc.name), sub.categoryId);
            });
        }));

        const selected = new Set();
        items.forEach(it => {
            const subId = [it.subCategoryId, it.categoryId].find(v => v !== undefined && v !== null && bySubId.has(String(v)));
            if (subId !== undefined) {
                selected.add(String(subId));
                return;
            }
            if (it.serviceId !== undefined && byServiceId.has(String(it.serviceId))) {
                selected.add(String(byServiceId.get(String(it.serviceId))));
                return;
            }
            const name = norm(it.serviceName || it.name);
            if (byName.has(name))
                selected.add(String(byName.get(name)));
        });
        return selected;
    }

    /* ---- read view: category › sub-category › service cards -------------- */
    function renderServicesView() {
        const container = document.getElementById('ppServices');
        const empty = document.getElementById('ppServicesEmpty');

        document.getElementById('ppServicesEditor').hidden = true;
        container.hidden = false;
        document.getElementById('ppServicesEditBtn').hidden = false;
        document.getElementById('ppServicesCancelBtn').hidden = true;
        document.getElementById('ppServicesSaveBtn').hidden = true;
        document.getElementById('ppServicesHint').textContent =
                'Services you\'re set up to take bookings for, grouped by category and sub-category.';

        const groups = ctx.hierarchy
                .map(cat => ({cat, subs: (cat.subCategories || []).filter(sub => ctx.selectedSubIds.has(String(sub.categoryId)))}))
                .filter(g => g.subs.length > 0);

        if (groups.length === 0) {
            container.innerHTML = '';
            empty.hidden = false;
            return;
        }
        empty.hidden = true;

        container.innerHTML = groups.map(({cat, subs}) => `
      <section class="pp-svc-cat">
        <h3 class="pp-svc-cat-title">${esc(cat.name)}</h3>
        ${subs.map(sub => {
            const services = sub.services || [];
            return `
          <div class="pp-svc-sub">
            <div class="pp-svc-sub-head">
              <span class="pp-svc-sub-name">${esc(sub.name)}</span>
              <span class="pp-svc-sub-count">${services.length} service${services.length === 1 ? '' : 's'}</span>
            </div>
            ${services.length ? `
            <div class="pp-svc-grid">
              ${services.map(svc => `
                <div class="pp-svc-card">
                  <img src="${esc(svc.image || sub.image || cat.image || '')}" alt="${esc(svc.name)}" loading="lazy">
                  <span>${esc(svc.name)}</span>
                </div>`).join('')}
            </div>` : '<p class="modal-hint">No services listed under this sub-category yet.</p>'}
          </div>`;
        }).join('')}
      </section>`).join('');
    }

    /* ---- edit view: choose sub-categories under each category ------------ */
    function renderServicesEditor() {
        const editor = document.getElementById('ppServicesEditor');
        document.getElementById('ppServices').hidden = true;
        document.getElementById('ppServicesEmpty').hidden = true;
        editor.hidden = false;
        document.getElementById('ppServicesEditBtn').hidden = true;
        document.getElementById('ppServicesCancelBtn').hidden = false;
        document.getElementById('ppServicesSaveBtn').hidden = false;
        document.getElementById('ppServicesHint').textContent =
                'Tap a sub-category to select it — you\'ll take bookings for every service under it. Tap a selected one again to remove it.';

        // Each sub-category is a clickable image tile wrapping a real (visually
        // hidden) checkbox, so it works with mouse, touch and keyboard.
        editor.innerHTML = ctx.hierarchy.map(cat => `
      <section class="pp-svc-cat pp-svc-edit-cat">
        <h3 class="pp-svc-cat-title">${esc(cat.name)}</h3>
        <div class="pp-sub-grid">
          ${(cat.subCategories || []).map(sub => {
            const count = (sub.services || []).length;
            return `
            <label class="pp-sub-tile">
              <input type="checkbox" value="${esc(sub.categoryId)}" data-pp-sub ${ctx.draftSubIds.has(String(sub.categoryId)) ? 'checked' : ''}>
              <span class="pp-sub-tile-media">
                <img src="${esc(sub.image || cat.image || '')}" alt="" loading="lazy">
                <span class="pp-sub-tile-check" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
              </span>
              <span class="pp-sub-tile-body">
                <span class="pp-sub-tile-name">${esc(sub.name)}</span>
                <span class="pp-sub-tile-count">${count} service${count === 1 ? '' : 's'}</span>
              </span>
            </label>`;
          }).join('')}
        </div>
      </section>`).join('');

        editor.querySelectorAll('[data-pp-sub]').forEach(cb => {
            cb.addEventListener('change', () => {
                if (cb.checked)
                    ctx.draftSubIds.add(cb.value);
                else
                    ctx.draftSubIds.delete(cb.value);
                hide('ppServicesError');
            });
        });
    }

    function wireServicesEditor() {
        if (ctx.servicesEditorWired)
            return;
        ctx.servicesEditorWired = true;

        const editBtn = document.getElementById('ppServicesEditBtn');
        const cancelBtn = document.getElementById('ppServicesCancelBtn');
        const saveBtn = document.getElementById('ppServicesSaveBtn');

        editBtn.addEventListener('click', () => {
            ctx.draftSubIds = new Set(ctx.selectedSubIds);
            hide('ppServicesError');
            renderServicesEditor();
        });

        cancelBtn.addEventListener('click', () => {
            hide('ppServicesError');
            renderServicesView();
        });

        saveBtn.addEventListener('click', async () => {
            hide('ppServicesError');
            if (ctx.draftSubIds.size === 0) {
                showErr('ppServicesError', 'Select at least one sub-category to keep taking bookings.');
                return;
            }

            // Keep the ids' original type (number vs string) as the hierarchy has them.
            const ids = [];
            ctx.hierarchy.forEach(cat => (cat.subCategories || []).forEach(sub => {
                if (ctx.draftSubIds.has(String(sub.categoryId)))
                    ids.push(sub.categoryId);
            }));

            saveBtn.disabled = true;
            cancelBtn.disabled = true;
            saveBtn.textContent = 'Saving…';
            
            // alert(JSON.stringify(ids));
            const res = await HearthAPI.updateProfessionalServices(ids);
            
            saveBtn.disabled = false;
            cancelBtn.disabled = false;
            saveBtn.textContent = 'Save';

            if (!res.success) {
                showErr('ppServicesError', res.message || 'Could not save your services. Please try again.');
                return;
            }

            // Re-read from the server rather than trusting the local draft, so
            // the view always shows what was actually stored.
            const svcRes = await HearthAPI.viewProfessionalServices();
            if (svcRes.success) {
                ctx.selectedSubIds = selectedSubCategoryIds(ctx.hierarchy, (svcRes.result && svcRes.result.items) || []);
            } else {
                ctx.selectedSubIds = new Set(ctx.draftSubIds);
            }
            renderServicesView();
        });
    }

    /* =====================================================================
     MY EARNINGS
     ===================================================================== */
    async function loadEarnings() {
        // alert('Loading Earnings ...');
        
        show('ppEarningsLoading');
        hide('ppEarningsError');
        const result = await fetchBookings();
        hide('ppEarningsLoading');
        if (!result.success) {
            ctx.loaded.earnings = false;
            showErr('ppEarningsError', result.message || 'Could not load your earnings. Please try again.');
            return;
        }

        const completed = ctx.bookings.filter(b => b._tab === 'past');
        const upcoming = ctx.bookings.filter(b => b._tab === 'upcoming');
        const sum = list => list.reduce((total, b) => total + (amountOf(b) || 0), 0);

        document.getElementById('ppEarnCompleted').textContent = formatInr(sum(completed));
        document.getElementById('ppEarnUpcoming').textContent = formatInr(sum(upcoming));
        document.getElementById('ppEarnJobs').textContent = completed.length;

        const listEl = document.getElementById('ppEarningsList');
        if (completed.length === 0) {
            listEl.innerHTML = '';
            show('ppEarningsEmpty');
            return;
        }
        hide('ppEarningsEmpty');
        listEl.innerHTML = completed
                .slice()
                .sort((a, b) => new Date(b.scheduledAt || 0) - new Date(a.scheduledAt || 0))
                .map(b => `
      <div class="profile-field" style="flex-direction: row; align-items: center; justify-content: space-between; gap: var(--space-sm); border-bottom: 1px solid var(--color-line); padding-block: 0.6rem;">
        <span>
          <span class="profile-field-value" style="padding-block: 0; display:block;">${esc(b.serviceName || 'Service')}</span>
          <span class="profile-field-label" style="text-transform:none; letter-spacing:0;">${esc(formatDate(b.scheduledAt))}</span>
        </span>
        <span class="sku-price">${formatInr(amountOf(b) || 0)}</span>
      </div>`).join('');
    }

    /* ---- helpers --------------------------------------------------------- */
    function amountOf(booking) {
        const value = booking.totalAmount !== undefined ? booking.totalAmount : booking.amount;
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    function formatInr(n) {
        return '₹' + Number(n || 0).toLocaleString('en-IN');
    }

    function statusMeta(status) {
        const s = String(status || '').toLowerCase();
        if (s.includes('approve') || s.includes('active') || s.includes('verified'))
            return {bg: 'var(--color-sage-20)', color: 'var(--color-sage)'};
        if (s.includes('reject') || s.includes('declin') || s.includes('suspend'))
            return {bg: 'var(--color-error-10)', color: 'var(--color-error)'};
        return {bg: 'var(--color-gold-20)', color: 'var(--color-clay-dark)'};
    }

    function field(label, value) {
        const v = value !== undefined && value !== null && value !== '' ? value : '—';
        return `
    <div class="profile-field">
      <span class="profile-field-label">${esc(label)}</span>
      <span class="profile-field-value">${esc(v)}</span>
    </div>`;
    }

    function chip(text) {
        return `
    <span class="pro-expertise-chip">
      <span style="background: var(--color-clay); border-color: var(--color-clay); color: var(--color-cream);">${esc(text)}</span>
    </span>`;
    }

    function formatDate(value) {
        if (!value)
            return null;
        const d = new Date(value);
        if (isNaN(d.getTime()))
            return String(value);
        return d.toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'});
    }

    function show(id) {
        const el = document.getElementById(id);
        if (el)
            el.hidden = false;
    }
    function hide(id) {
        const el = document.getElementById(id);
        if (el)
            el.hidden = true;
    }
    function showErr(id, msg) {
        const el = document.getElementById(id);
        if (!el)
            return;
        el.textContent = msg;
        el.hidden = false;
    }
    function esc(str) {
        const div = document.createElement('div');
        div.textContent = String(str === undefined || str === null ? '' : str);
        return div.innerHTML;
    }
})();
