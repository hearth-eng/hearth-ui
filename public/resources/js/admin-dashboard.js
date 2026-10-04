/* =========================================================================
 HEARTH — admin-dashboard.js
 Drives admin-dashboard.html: the left-nav tab shell plus one loader/render
 pair per tab. No client-side router/history — tabs are plain show/hide,
 matching the rest of this codebase's "no framework" approach.

 Each tab is only fetched the first time it's opened (see ADMIN_TABS below);
 the filter pills on Professional Applications / Bookings re-fetch with a
 status query param each time they're clicked, since that's a different
 slice of data, not just a client-side re-render.

 ASSUMPTIONS flagged inline below are places this reads a handful of likely
 backend field names/shapes defensively because the exact Vert.x response
 contract for the admin list endpoints isn't confirmed yet. Once it is,
 trim each spot down to the one real field name instead of guessing.
 ========================================================================= */

/**
 * One entry per left-nav tab. `load(status)` does the fetch + render for
 * that tab; `loaded` tracks whether it's already been fetched once (so
 * switching tabs back and forth doesn't re-hit the network). Adding a new
 * tab later is: a nav button + panel in the HTML, and one more entry here.
 */
const ADMIN_TABS = {
    overview: {title: 'Overview', loaded: false, load: loadOverview},
    professionals: {title: 'Professional Applications', loaded: false, load: loadProfessionals},
    bookings: {title: 'Bookings', loaded: false, load: loadBookings},
    customers: {title: 'Customers', loaded: false, load: loadCustomers},
    locations: {title: 'Provinces & Cities', loaded: false, load: loadProvinces}
};

document.addEventListener('DOMContentLoaded', () => {
    if (!adminIsLoggedIn() || !getCurrentAdmin()) {
        document.getElementById('adminGate').hidden = false;
        document.getElementById('adminShell').hidden = true;
        return;
    }

    document.getElementById('adminGate').hidden = true;
    document.getElementById('adminShell').hidden = false;

    initAdminTopbar();
    initAdminNav();
    initFilterBar('professionalsFilterBar', (status) => loadProfessionals(status));
    initFilterBar('bookingsFilterBar', (status) => loadBookings(status));
    initProfessionalsActions();
    initFilterBar('provincesFilterBar', (status) => {
        locationState.provinceFilter = status;
        renderProvinces();
    });
    initFilterBar('citiesFilterBar', (status) => {
        locationState.cityFilter = status;
        renderCities();
    });
    initLocationActions();
    initAdminLogout();

    // Overview is the default open tab.
    switchAdminTab('overview');
});

/* ---- topbar: who's logged in ------------------------------------------- */
function initAdminTopbar() {
    const admin = getCurrentAdmin() || {};
    const name = admin.fullName || admin.externalId || 'Admin';
    document.getElementById('adminTopbarName').textContent = name;
    document.getElementById('adminTopbarAvatar').textContent = name.charAt(0).toUpperCase();
}

/* ---- left nav: tab switching -------------------------------------------- */
function initAdminNav() {
    document.querySelectorAll('.admin-nav-item[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => switchAdminTab(btn.dataset.tab));
    });
}

function switchAdminTab(tab) {
    const entry = ADMIN_TABS[tab];
    if (!entry) return;

    document.querySelectorAll('.admin-nav-item[data-tab]').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.admin-panel').forEach(panel => {
        panel.hidden = panel.id !== `adminPanel-${tab}`;
    });
    document.getElementById('adminTopbarTitle').textContent = entry.title;

    if (!entry.loaded) {
        entry.loaded = true;
        entry.load();
    }
}

/* ---- filter pills (Professional Applications / Bookings) --------------- */
function initFilterBar(containerId, onChange) {
    const bar = document.getElementById(containerId);
    if (!bar) return;
    bar.addEventListener('click', (e) => {
        const pill = e.target.closest('.admin-filter-pill');
        if (!pill) return;
        bar.querySelectorAll('.admin-filter-pill').forEach(p => p.classList.toggle('is-active', p === pill));
        onChange(pill.dataset.status || '');
    });
}

/* ---- logout -------------------------------------------------------------- */
function initAdminLogout() {
    document.getElementById('adminLogoutBtn')?.addEventListener('click', async () => {
        await HearthAPI.logout(); // clears the shared _fks cookie server-side
        clearAdminSession();
        window.location.replace('admin-login.html');
    });
}

/* =========================================================================
 OVERVIEW
 Pulls all three list endpoints unfiltered/unpaged and either reads an
 aggregate count field off the response if the backend provides one, or
 falls back to tallying the returned items client-side. Whichever endpoints
 actually paginate by default will undercount the tally fallback until
 that's confirmed — flagged below at the point it matters.
 ========================================================================= */
async function loadOverview() {
    const loading = document.getElementById('overviewLoading');
    const errorEl = document.getElementById('overviewError');
    loading.hidden = false;
    errorEl.hidden = true;
    
    const profPayload = {
        dataset: "Professional",
        dimension: "is_verified",
        metric: "COUNT"
    };
    
    const userPayload = {
        dataset: "User",
        metric: "COUNT",
        filters: [
            {
                col: "role",
                val: "CUSTOMER"
            }
        ]
    };
    
    const bookPayload = {
        dataset: "Booking",
        dimension: "status",
        metric: "COUNT"
    };

    const [proResult, userResult, bookingResult] = await Promise.all([
        HearthAPI.query(profPayload),
        HearthAPI.query(userPayload),
        HearthAPI.query(bookPayload)
    ]);

    loading.hidden = true;

    if (!proResult.success || !userResult.success || !bookingResult.success) {
        errorEl.textContent = [proResult, userResult, bookingResult].find(r => !r.success)?.message
            || 'Could not load the dashboard summary. Please try again.';
        errorEl.hidden = false;
        return;
    }
    const proRes = proResult.result;
    const userRes = userResult.result;
    const bookingRes = bookingResult.result;
    
    // By Sudip
    // const professionals = itemsOf(proRes.result);
    // const bookings = itemsOf(bookingRes.result);
    // const users = itemsOf(userRes.result);
    
    // ASSUMPTION: prefer an aggregate count field (count/total) over
    // items.length, since items.length only reflects one page if the
    // backend paginates by default.
    // 
    // By Sudip
    // const totalProfessionals = countOf(proRes.result, professionals);
    // const totalCustomers = countOf(userRes.result, users);
    
    
    // By Sudip
    // const totalBookings = countOf(bookingRes.result, bookings);
    // const bookingStatusCounts = tallyByField(bookings, ['status']);
    // const proStatusCounts = tallyByField(professionals, ['status', 'verificationStatus', 'applicationStatus']);
    
    let profTotal = 0;
    for (let j = 0; j < proRes.rows.length; j ++) {
        profTotal += proRes.rows[j].count;
        if (proRes.rows[j].is_verified === 0) {
            setText('statPendingProfessionals', proRes.rows[j].count);
        }
        else if (proRes.rows[j].is_verified === 1) {
            setText('statApprovedProfessionals', proRes.rows[j].count);
        }
    }
    setText('statTotalProfessionals', profTotal);
    
    // By Sudip
    // setText('statTotalProfessionals', totalProfessionals);
    // setText('statPendingProfessionals', proStatusCounts.PENDING || 0);
    // setText('statApprovedProfessionals', proStatusCounts.APPROVED || proStatusCounts.ACTIVE || 0);
    
    
    setText('statTotalCustomers', userRes.rows[0].count);

    let bookingTotal = 0;
    for (let j = 0; j < bookingRes.rows.length; j ++) {
        bookingTotal += bookingRes.rows[j].count;
        if (bookingRes.rows[j].status === 'PENDING') {
            setText('statPendingBookings', bookingRes.rows[j].count);
        }
        else if (bookingRes.rows[j].status === 'CONFIRMED') {
            // setText('statPendingBookings', bookingRes.rows[j].count);
        }
        else if (bookingRes.rows[j].status === 'COMPLETED') {
            setText('statCompletedBookings', bookingRes.rows[j].count);
        }
        else if (bookingRes.rows[j].status === 'CANCELLED') {
            setText('statCancelledBookings', bookingRes.rows[j].count);
        }
    }
    setText('statTotalBookings', bookingTotal);
    
    // By Sudip
    // setText('statPendingBookings', bookingStatusCounts.PENDING || 0);
    // setText('statCompletedBookings', bookingStatusCounts.COMPLETED || 0);
    // setText('statCancelledBookings', bookingStatusCounts.CANCELLED || 0);
}

/* =========================================================================
 PROFESSIONAL APPLICATIONS
 ========================================================================= */
async function loadProfessionals(status) {
    const loading = document.getElementById('professionalsLoading');
    const errorEl = document.getElementById('professionalsError');
    const emptyEl = document.getElementById('professionalsEmpty');
    const body = document.getElementById('professionalsTableBody');

    loading.hidden = false;
    errorEl.hidden = true;
    emptyEl.hidden = true;
    body.innerHTML = '';

    const res = await HearthAPI.queryApplication(status ? 'verificationStatus=' + status : 'verificationStatus=PENDING&verificationStatus=APPROVED&verificationStatus=REJECTED');
    loading.hidden = true;

    if (!res.success) {
        errorEl.textContent = res.message || 'Could not load professional applications. Please try again.';
        errorEl.hidden = false;
        return;
    }

    const items = itemsOf(res.result);
    if (items.length === 0) {
        emptyEl.hidden = false;
        return;
    }

    body.innerHTML = items.map(p => {
        // ASSUMPTION: field names below (name/appliedOn/status) are the most
        // likely candidates based on professional-dashboard.js's usage of
        // the single-record GET /professionals/:id and GET /documents
        // responses — confirm against the real admin list response.
        const applicationId = p.applicationId;
        const name = p.nameOnDocument;
        const appliedOn = formatAdminDate(p.createdAt);
        const experience = p.experienceYears;
        const cities = p.servingCities || '—';
        const status = p.verificationStatus;

        return `
      <tr>
        <td>${escapeAdminHtml(applicationId)}</td>
        <td>${escapeAdminHtml(name)}</td>
        <td>${appliedOn}</td>
        <td>${escapeAdminHtml(String(experience))}</td>
        <td>${escapeAdminHtml(String(cities))}</td>
        <td>${adminBadge(status)}</td>
        <td>${renderApplicationActions(applicationId, status)}</td>
      </tr>
    `;
    }).join('');
}

/**
 * Approve/Reject links, shown only for a PENDING application and only when
 * it actually carries an applicationId — if that field ever comes back
 * missing, showing an action that would silently PATCH the wrong record
 * (or none) is worse than showing nothing, so it's left blank instead of
 * guessing another field.
 */
function renderApplicationActions(applicationId, status) {
    const isPending = String(status || '').toUpperCase() === 'PENDING';
    if (!isPending) return '—';
    if (!applicationId) {
        console.warn('[Hearth Admin] PENDING application with no applicationId — cannot offer approve/reject.');
        return '—';
    }
    const id = escapeAdminHtml(applicationId);
    return `
    <div class="admin-row-actions">
      <button type="button" class="admin-action-link admin-action-approve" data-app-id="${id}" data-action="APPROVED">Approve</button>
      <button type="button" class="admin-action-link admin-action-reject" data-app-id="${id}" data-action="REJECTED">Reject</button>
    </div>
  `;
}

/* ---- Approve/Reject wiring ---------------------------------------------
 Delegated once on the tbody (rows are fully replaced on every load/filter
 change, so a per-row listener would leak); resolves which button was
 clicked from its data-app-id/data-action, confirms, then calls the API and
 refreshes just the professionals table with whatever filter is active. --- */
function initProfessionalsActions() {
    const body = document.getElementById('professionalsTableBody');
    if (!body) return;

    body.addEventListener('click', (e) => {
        const btn = e.target.closest('.admin-action-link');
        if (!btn || btn.disabled) return;

        const applicationId = btn.dataset.appId;
        const action = btn.dataset.action; // 'APPROVED' | 'REJECTED'
        if (!applicationId || !action) return;

        confirmApplicationStatusChange(applicationId, action);
    });
}

function confirmApplicationStatusChange(applicationId, status) {
    const approving = status === 'APPROVED';
    showAdminConfirmDialog({
        title: approving ? 'Approve this application?' : 'Reject this application?',
        message: approving
            ? "This professional will be marked approved and able to take bookings."
            : "This application will be marked rejected. The applicant is not notified automatically by this screen.",
        confirmLabel: approving ? 'Approve' : 'Reject',
        danger: !approving,
        onConfirm: () => applyApplicationStatusChange(applicationId, status)
    });
}

async function applyApplicationStatusChange(applicationId, status) {
    const errorEl = document.getElementById('professionalsError');
    errorEl.hidden = true;

    // Disable both buttons on this row while the request is in flight, so a
    // second click can't fire a duplicate approve/reject before the table
    // re-renders.
    const rowButtons = document.querySelectorAll(`.admin-action-link[data-app-id="${cssEscapeAdmin(applicationId)}"]`);
    rowButtons.forEach(b => b.disabled = true);

    const res = await HearthAPI.setApplicationStatus(applicationId, status);

    if (!res.success) {
        rowButtons.forEach(b => b.disabled = false);
        errorEl.textContent = res.message || 'Could not update this application. Please try again.';
        errorEl.hidden = false;
        return;
    }

    // The Overview tab's pending/approved counts are now stale — refetch
    // next time it's opened rather than trying to patch them in place here.
    ADMIN_TABS.overview.loaded = false;

    // Re-render whichever filter slice is currently active so the row
    // reflects its new status (or drops out, if a status filter is active).
    const activePill = document.querySelector('#professionalsFilterBar .admin-filter-pill.is-active');
    loadProfessionals(activePill ? (activePill.dataset.status || '') : '');
}

/* ---- lightweight confirm dialog -----------------------------------------
 admin-dashboard.html doesn't load script.js (see admin-session.js's header
 comment on why the admin area stays decoupled from the customer site), so
 script.js's showConfirmDialog() isn't available here. This is the same
 markup/CSS classes (styles.css's "CONFIRMATION DIALOG" section), just a
 second, self-contained instance for the admin pages. -------------------- */
let _adminConfirmCallback = null;

function injectAdminConfirmMarkup() {
    if (document.getElementById('adminConfirmOverlay')) return;

    const markup = `
<div class="confirm-dialog-overlay" id="adminConfirmOverlay" aria-hidden="true">
  <div class="confirm-dialog-box" role="alertdialog" aria-modal="true" aria-labelledby="adminConfirmTitle" aria-describedby="adminConfirmMessage">
    <h3 class="confirm-dialog-title" id="adminConfirmTitle">Are you sure?</h3>
    <p class="confirm-dialog-message" id="adminConfirmMessage"></p>
    <div class="confirm-dialog-actions">
      <button type="button" class="btn btn-ghost btn-sm" id="adminConfirmCancelBtn">Cancel</button>
      <button type="button" class="btn btn-sm" id="adminConfirmConfirmBtn">Confirm</button>
    </div>
  </div>
</div>`;
    document.body.insertAdjacentHTML('beforeend', markup);

    const overlay = document.getElementById('adminConfirmOverlay');
    const cancelBtn = document.getElementById('adminConfirmCancelBtn');
    const confirmBtn = document.getElementById('adminConfirmConfirmBtn');

    function close() {
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        _adminConfirmCallback = null;
    }

    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
    });
    confirmBtn.addEventListener('click', () => {
        const cb = _adminConfirmCallback;
        close();
        if (cb) cb();
    });

    window.__openAdminConfirmInternal = function (options) {
        document.getElementById('adminConfirmTitle').textContent = options.title || 'Are you sure?';
        document.getElementById('adminConfirmMessage').textContent = options.message || '';
        confirmBtn.textContent = options.confirmLabel || 'Confirm';
        cancelBtn.textContent = options.cancelLabel || 'Cancel';
        // Red "confirm" for a destructive action (danger !== false, matching
        // script.js's own default), clay/primary for a non-destructive one.
        confirmBtn.classList.toggle('confirm-dialog-danger-btn', options.danger !== false);
        confirmBtn.classList.toggle('btn-primary', options.danger === false);
        _adminConfirmCallback = options.onConfirm;

        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    };
}

/** @param {{title?: string, message?: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean, onConfirm: () => void}} options */
function showAdminConfirmDialog(options) {
    injectAdminConfirmMarkup();
    window.__openAdminConfirmInternal(options);
}

/* =========================================================================
 BOOKINGS
 ========================================================================= */
async function loadBookings(status) {
    const loading = document.getElementById('bookingsLoading');
    const errorEl = document.getElementById('bookingsError');
    const emptyEl = document.getElementById('bookingsEmpty');
    const body = document.getElementById('bookingsTableBody');

    loading.hidden = false;
    errorEl.hidden = true;
    emptyEl.hidden = true;
    body.innerHTML = '';

    const res = await HearthAPI.queryBooking(status ? 'status=' + status : 'status=PENDING&status=CONFIRMED&status=IN_PROGRESS&status=COMPLETED&status=CANCELLED');
    loading.hidden = true;

    if (!res.success) {
        errorEl.textContent = res.message || 'Could not load bookings. Please try again.';
        errorEl.hidden = false;
        return;
    }

    const items = itemsOf(res.result);
    if (items.length === 0) {
        emptyEl.hidden = false;
        return;
    }

    body.innerHTML = items.map(b => {
        const id = b.bookingId || b.id || '—';
        const customer = b.customerId || '—';
        const professional = b.professionalId === -1 ? 'Not Assigned' : b.professionalId;
        const service = b.serviceName || '—';
        const scheduled = formatAdminDate(b.scheduledAt);
        const status = b.status;

        return `
      <tr>
        <td>${escapeAdminHtml(String(id))}</td>
        <td>${escapeAdminHtml(customer)}</td>
        <td>${escapeAdminHtml(professional)}</td>
        <td>${escapeAdminHtml(service)}</td>
        <td>${scheduled}</td>
        <td>${adminBadge(status)}</td>
      </tr>
    `;
    }).join('');
}

/* =========================================================================
 CUSTOMERS
 ========================================================================= */
async function loadCustomers() {
    const loading = document.getElementById('customersLoading');
    const errorEl = document.getElementById('customersError');
    const emptyEl = document.getElementById('customersEmpty');
    const body = document.getElementById('customersTableBody');

    loading.hidden = false;
    errorEl.hidden = true;
    emptyEl.hidden = true;
    body.innerHTML = '';

    const res = await HearthAPI.queryCustomer();
    loading.hidden = true;

    if (!res.success) {
        errorEl.textContent = res.message || 'Could not load customers. Please try again.';
        errorEl.hidden = false;
        return;
    }

    const items = itemsOf(res.result);
    if (items.length === 0) {
        emptyEl.hidden = false;
        return;
    }

    body.innerHTML = items.map(u => {
        const name = u.fullName;
        const mobile = u.phone1;
        const email = u.email;
        const joined = formatAdminDate(u.createdAt);
        const status = u.status;

        return `
      <tr>
        <td>${escapeAdminHtml(name)}</td>
        <td>${escapeAdminHtml(String(mobile))}</td>
        <td>${escapeAdminHtml(email)}</td>
        <td>${joined}</td>
        <td>${escapeAdminHtml(status)}</td>
      </tr>
    `;
    }).join('');
}

/* =========================================================================
 PROVINCES & CITIES
 Every province/city starts out PLANNED. Admin actions (PATCH
 /provinces/:id or /cities/:id): Activate -> ACTIVE (+ launchedAt),
 Pause -> PAUSED (service temporarily stopped), Resume -> ACTIVE again. Cities are loaded per province (GET
 /cities?provinceId=..), matching how the customer-side pickers call it.
 Status filter pills are applied client-side on the already-fetched list,
 so switching Planned/Active doesn't re-hit the network.
 ========================================================================= */
const locationState = {
    provinces: [],
    cities: [],
    provinceFilter: '',
    cityFilter: '',
    selectedProvince: null // {id, name}
};

async function loadProvinces() {
    const loading = document.getElementById('provincesLoading');
    const errorEl = document.getElementById('provincesError');
    const emptyEl = document.getElementById('provincesEmpty');

    loading.hidden = false;
    errorEl.hidden = true;
    emptyEl.hidden = true;
    document.getElementById('provincesTableBody').innerHTML = '';

    const res = await HearthAPI.viewProvinces('status', 'not_null');
    loading.hidden = true;

    if (!res.success) {
        errorEl.textContent = res.message || 'Could not load provinces. Please try again.';
        errorEl.hidden = false;
        return;
    }

    locationState.provinces = itemsOf(res.result);
    renderProvinces();
}

function renderProvinces() {
    const body = document.getElementById('provincesTableBody');
    const emptyEl = document.getElementById('provincesEmpty');
    const items = filterByStatus(locationState.provinces, locationState.provinceFilter);

    emptyEl.hidden = items.length !== 0;
    const selectedId = locationState.selectedProvince ? String(locationState.selectedProvince.id) : null;

    body.innerHTML = items.map(p => {
        const id = String(p.provinceId);
        const status = locationStatusOf(p);
        return `
      <tr${id === selectedId ? ' class="is-selected" style="background: var(--color-primary-10, rgba(0,0,0,0.04));"' : ''}>
        <td>${escapeAdminHtml(id)}</td>
        <td>${escapeAdminHtml(p.provinceName || '—')}</td>
        <td>${adminBadge(status)}</td>
        <td>${renderLaunchedAt(p, status)}</td>
        <td>
          <div class="admin-row-actions">
            ${renderLocationStatusActions('province', id, p.provinceName, status)}
            <button type="button" class="admin-action-link" data-kind="province" data-loc-action="view-cities"
                    data-id="${escapeAdminHtml(id)}" data-name="${escapeAdminHtml(p.provinceName || '')}">View cities</button>
          </div>
        </td>
      </tr>
    `;
    }).join('');
}

async function loadCities(provinceId, provinceName) {
    locationState.selectedProvince = {id: provinceId, name: provinceName};
    renderProvinces(); // highlight the selected row

    const loading = document.getElementById('citiesLoading');
    const errorEl = document.getElementById('citiesError');
    const emptyEl = document.getElementById('citiesEmpty');

    document.getElementById('citiesTitle').textContent = `Cities in ${provinceName || 'province ' + provinceId}`;
    document.getElementById('citiesHint').hidden = true;
    document.getElementById('citiesTableBody').innerHTML = '';
    loading.hidden = false;
    errorEl.hidden = true;
    emptyEl.hidden = true;

    const res = await HearthAPI.viewCities('provinceId', provinceId, 'status', 'not_null');

    // Ignore a stale response if the admin clicked another province meanwhile.
    if (!locationState.selectedProvince || String(locationState.selectedProvince.id) !== String(provinceId)) return;
    loading.hidden = true;

    if (!res.success) {
        errorEl.textContent = res.message || 'Could not load cities. Please try again.';
        errorEl.hidden = false;
        return;
    }

    locationState.cities = itemsOf(res.result);
    renderCities();
}

function renderCities() {
    if (!locationState.selectedProvince) return;
    const body = document.getElementById('citiesTableBody');
    const emptyEl = document.getElementById('citiesEmpty');
    const items = filterByStatus(locationState.cities, locationState.cityFilter);

    emptyEl.hidden = items.length !== 0;
    body.innerHTML = items.map(c => {
        const id = String(c.cityId);
        const status = locationStatusOf(c);
        const actions = renderLocationStatusActions('city', id, c.cityName, status);
        return `
      <tr>
        <td>${escapeAdminHtml(id)}</td>
        <td>${escapeAdminHtml(c.cityName || '—')}</td>
        <td>${adminBadge(status)}</td>
        <td>${renderLaunchedAt(c, status)}</td>
        <td>${actions ? `<div class="admin-row-actions">${actions}</div>` : '—'}</td>
      </tr>
    `;
    }).join('');
}

/** launchedAt is only meaningful once a location has gone live, so it's shown
 * for ACTIVE rows and kept visible for PAUSED ones (they were launched, just
 * temporarily stopped); PLANNED rows show a dash. */
function renderLaunchedAt(item, status) {
    if (status !== 'ACTIVE' && status !== 'PAUSED') return '—';
    return formatAdminDate(item.launchedAt);
}

/**
 * Status lifecycle:  PLANNED --Activate--> ACTIVE --Pause--> PAUSED --Resume--> ACTIVE
 * Returns the one action link that applies to the current status.
 */
function renderLocationStatusActions(kind, id, name, status) {
    const action = {PLANNED: 'activate', ACTIVE: 'pause', PAUSED: 'resume'}[status];
    if (!action) return '';
    const cfg = LOCATION_ACTIONS[action];
    return `<button type="button" class="admin-action-link ${cfg.linkClass}" data-kind="${kind}"
              data-loc-action="${action}" data-id="${escapeAdminHtml(id)}"
              data-name="${escapeAdminHtml(name || '')}">${cfg.label}</button>`;
}

/** Per-action config: link text/style, confirm-dialog copy, and the PATCH
 * payload. Resume deliberately does NOT send launchedAt, so the original
 * launch date survives a pause/resume cycle. */
const LOCATION_ACTIONS = {
    activate: {
        label: 'Activate',
        linkClass: 'admin-action-approve',
        danger: false,
        title: (n) => `Activate ${n}?`,
        message: (l) => `This ${l} will be marked ACTIVE and become available for customers and professionals.`,
        payload: () => ({status: 'ACTIVE', launchedAt: Date.now()})
    },
    pause: {
        label: 'Pause',
        linkClass: 'admin-action-reject',
        danger: true,
        title: (n) => `Pause ${n}?`,
        message: (l) => `Service in this ${l} will be temporarily stopped. It will be marked PAUSED until you resume it.`,
        payload: () => ({status: 'PAUSED'})
    },
    resume: {
        label: 'Resume',
        linkClass: 'admin-action-approve',
        danger: false,
        title: (n) => `Resume ${n}?`,
        message: (l) => `Service in this ${l} will be restarted and it will be marked ACTIVE again. The original launch date is kept.`,
        payload: () => ({status: 'ACTIVE'})
    }
};

/* ---- delegated click handling for both tables ---------------------------- */
function initLocationActions() {
    const panel = document.getElementById('adminPanel-locations');
    if (!panel) return;

    panel.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-loc-action]');
        if (!btn || btn.disabled) return;

        const {kind, id, name, locAction} = btn.dataset;
        if (locAction === 'view-cities') {
            locationState.cityFilter = '';
            resetFilterBar('citiesFilterBar');
            loadCities(id, name);
        } else if (LOCATION_ACTIONS[locAction]) {
            confirmLocationStatusChange(kind, id, name, locAction, btn);
        }
    });
}

function confirmLocationStatusChange(kind, id, name, action, btn) {
    const label = kind === 'province' ? 'province' : 'city';
    const cfg = LOCATION_ACTIONS[action];
    showAdminConfirmDialog({
        title: cfg.title(name || `this ${label}`),
        message: cfg.message(label),
        confirmLabel: cfg.label,
        danger: cfg.danger,
        onConfirm: () => applyLocationStatusChange(kind, id, action, btn)
    });
}

async function applyLocationStatusChange(kind, id, action, btn) {
    const isProvince = kind === 'province';
    const errorEl = document.getElementById(isProvince ? 'provincesError' : 'citiesError');
    errorEl.hidden = true;
    btn.disabled = true;

    const payload = LOCATION_ACTIONS[action].payload();
    const res = isProvince
        ? await HearthAPI.updateProvince(id, payload)
        : await HearthAPI.updateCity(id, payload);

    if (!res.success) {
        btn.disabled = false;
        errorEl.textContent = res.message
            || `Could not ${action} this ${isProvince ? 'province' : 'city'}. Please try again.`;
        errorEl.hidden = false;
        return;
    }

    // Patch the cached row with what was sent and re-render — no refetch needed.
    const list = isProvince ? locationState.provinces : locationState.cities;
    const idField = isProvince ? 'provinceId' : 'cityId';
    const row = list.find(r => String(r[idField]) === String(id));
    if (row) Object.assign(row, payload);

    isProvince ? renderProvinces() : renderCities();
}

function locationStatusOf(item) {
    return String(item.status || 'PLANNED').toUpperCase();
}

function filterByStatus(items, status) {
    if (!status) return items;
    return items.filter(i => locationStatusOf(i) === status);
}

function resetFilterBar(containerId) {
    document.querySelectorAll(`#${containerId} .admin-filter-pill`).forEach(p => {
        p.classList.toggle('is-active', !p.dataset.status);
    });
}

/* ---- shared helpers ------------------------------------------------------ */

/** Normalizes a list response to a plain array regardless of the wrapper
 * field name (items vs results vs data — ASSUMPTION: `items` is the
 * convention seen elsewhere in this codebase, e.g. GET /bookings, GET
 * /documents; kept flexible in case the admin endpoints differ). */
function itemsOf(result) {
    if (!result) return [];
    if (Array.isArray(result)) return result;
    return result.items || result.results || result.data || [];
}

/** Prefers an explicit aggregate count field over items.length. */
function countOf(result, items) {
    if (!result) return items.length;
    return result.count ?? result.total ?? items.length;
}

function tallyByField(items, candidateFields) {
    const counts = {};
    items.forEach(item => {
        const field = candidateFields.find(f => item[f] !== undefined && item[f] !== null);
        const value = field ? String(item[field]).toUpperCase() : null;
        if (value) counts[value] = (counts[value] || 0) + 1;
    });
    return counts;
}

function adminBadge(status) {
    const s = String(status || '').toUpperCase();
    const cls = {
        PENDING: 'admin-badge-pending',
        PLANNED: 'admin-badge-pending',
        PAUSED: 'admin-badge-neutral',
        APPROVED: 'admin-badge-approved',
        ACTIVE: 'admin-badge-active',
        COMPLETED: 'admin-badge-completed',
        REJECTED: 'admin-badge-rejected',
        CANCELLED: 'admin-badge-cancelled'
    }[s] || 'admin-badge-neutral';
    return `<span class="admin-badge ${cls}">${escapeAdminHtml(s || 'UNKNOWN')}</span>`;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = (value === undefined || value === null) ? '—' : value;
}

function formatAdminDate(value) {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleDateString('en-IN', {day: 'numeric', month: 'short', year: 'numeric'});
    } catch (err) {
        return String(value);
    }
}

function escapeAdminHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

/** Safe for building an attribute-value selector out of a backend-supplied
 * id (applicationId is expected to be a plain UUID, but this doesn't rely
 * on that). Falls back to a literal-safe manual escape if the CSS.escape
 * global isn't available. */
function cssEscapeAdmin(str) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(str);
    return String(str).replace(/["\\]/g, '\\$&');
}
