/* =========================================================================
 HEARTH — professional-onboarding.js
 Drives professional-onboarding.html, the page "Become a Professional"
 now lands on. Three steps:

   1. OTP verification — same UX as the login popup in script.js
      (mobile -> waiting -> otp -> waiting -> success), rendered inline.
   2. Routing once the number is verified:
        - already a registered professional  -> professional-portal.html
        - existing account, no application   -> application form (step 3)
        - no Hearth account for this number   -> name/email, one more OTP
          via the signup endpoint, account created with role PROFESSIONAL,
          then the application form (step 3)
   3. Application form — ported from become-professional.js (identity,
      current address cascade, expertise, serving localities, declaration)
      and submitted via HearthAPI.applyAsProfessional().

 Reuses, without modifying:
   - api.js    : HearthAPI.requestOtp / verifyOtp / createUser /
                 viewProfessional / applyAsProfessional / viewProvinces /
                 viewCities / viewNeighbourhoods / viewCategories
   - script.js : isLoggedIn, getCurrentUser, saveCurrentUser, setLoggedIn,
                 renderUserChip, postLogout, getStoredAddress, initRipple

 Everything lives inside this IIFE so none of its helpers can collide with
 the globals defined by script.js / become-professional.js. No network
 calls happen directly in this file.
 ========================================================================= */

(function () {
    'use strict';

    const PORTAL_PAGE = 'professional-portal.html';
    const REDIRECT_DELAY_MS = 1200;
    const RESEND_SECONDS = 30;

    // Sentinel id for "All Localities" (same contract as become-professional.js).
    const ALL_LOCALITIES_ID = '-1';
    // Group label for neighbourhoods whose zone is not set yet.
    const UNZONED_LABEL = 'Other localities';

    document.addEventListener('DOMContentLoaded', () => {
        if (typeof HearthAPI === 'undefined' || typeof getCurrentUser === 'undefined')
            return;
        if (!document.getElementById('poPhone'))
            return; // guard: only runs on this page
        initOtpFlow();
    });

    /* =====================================================================
     STEP 1 — OTP VERIFICATION
     ===================================================================== */
    function initOtpFlow() {
        const phone = document.getElementById('poPhone');
        const screens = {
            mobile: phone.querySelector('[data-screen="po-mobile"]'),
            waiting: phone.querySelector('[data-screen="po-waiting"]'),
            otp: phone.querySelector('[data-screen="po-otp"]'),
            account: phone.querySelector('[data-screen="po-account"]'),
            message: phone.querySelector('[data-screen="po-message"]'),
            success: phone.querySelector('[data-screen="po-success"]')
        };
        const waitingLabel = document.getElementById('poWaitingLabel');

        const state = {
            mobile: '',
            // 'login'  -> OTP for an existing account (POST login/otp/*)
            // 'signup' -> OTP to create a new account (POST signup/otp/*)
            mode: 'login',
            // Which identity the FIRST OTP (the one on po-mobile) was sent to -
            // 'mobile' or 'email'. The po-account screen collects whichever one
            // this isn't, same contract as the customer signup flow in script.js.
            identityMode: 'mobile',
            account: {fullName: '', email: ''},
            activeScreen: screens.mobile,
            resendTimer: null,
            resendSecondsLeft: RESEND_SECONDS,
            retry: null
        };

        /* ---- screen navigation (identical behaviour to the login popup) -- */
        function goTo(targetScreen, direction) {
            const outgoing = state.activeScreen;
            if (outgoing === targetScreen)
                return;

            targetScreen.classList.remove('screen-off-left', 'screen-off-right');
            targetScreen.classList.add(direction === 'forward' ? 'screen-off-right' : 'screen-off-left');
            targetScreen.inert = false;
            targetScreen.removeAttribute('aria-hidden');
            void targetScreen.offsetWidth;

            requestAnimationFrame(() => {
                outgoing.classList.remove('screen-current');
                outgoing.classList.add(direction === 'forward' ? 'screen-off-left' : 'screen-off-right');
                outgoing.inert = true;
                outgoing.setAttribute('aria-hidden', 'true');

                targetScreen.classList.remove('screen-off-left', 'screen-off-right');
                targetScreen.classList.add('screen-current');
            });

            state.activeScreen = targetScreen;
        }

        function goToWaiting(label, direction) {
            waitingLabel.textContent = label;
            goTo(screens.waiting, direction);
        }

        function showMessage(title, text, retryLabel, onRetry) {
            document.getElementById('poMessageTitle').textContent = title;
            document.getElementById('poMessageText').textContent = text;
            document.getElementById('poMessageRetryBtn').textContent = retryLabel || 'Try again';
            state.retry = onRetry;
            goTo(screens.message, 'forward');
        }

        function showSuccess(title, text) {
            document.getElementById('poSuccessTitle').textContent = title;
            document.getElementById('poSuccessMessage').textContent = text;
            goTo(screens.success, 'forward');
        }

        function clearOtpBoxes() {
            otpBoxes.forEach(b => {
                b.value = '';
                b.classList.remove('is-filled');
            });
        }

        function backToMobile() {
            clearInterval(state.resendTimer);
            state.mode = 'login';
            clearOtpBoxes();
            hideErr('poOtpError');
            goTo(screens.mobile, 'back');
            setTimeout(() => (state.identityMode === 'email' ? emailIdentityInput : mobileInput).focus(), 300);
        }

        document.getElementById('poMessageRetryBtn').addEventListener('click', () => {
            const fn = state.retry;
            state.retry = null;
            if (fn)
                fn();
        });

        /* ---- SCREEN: mobile/email identity -> waiting -> otp ------------- */
        const mobileInput = document.getElementById('poMobile');
        const emailIdentityInput = document.getElementById('poEmailIdentity');
        const mobileField = document.getElementById('poMobileField');
        const emailField = document.getElementById('poEmailField');
        const identitySub = document.getElementById('poIdentitySub');
        const useEmailBtn = document.getElementById('poUseEmailBtn');
        const sendOtpBtn = document.getElementById('poSendOtpBtn');

        mobileInput.addEventListener('input', () => {
            mobileInput.value = mobileInput.value.replace(/\D/g, '').slice(0, 10);
        });
        mobileInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                sendOtpBtn.click();
            }
        });
        emailIdentityInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                sendOtpBtn.click();
            }
        });

        useEmailBtn.addEventListener('click', () => {
            const toEmail = state.identityMode === 'mobile';
            state.identityMode = toEmail ? 'email' : 'mobile';
            mobileField.hidden = toEmail;
            emailField.hidden = !toEmail;
            hideErr('poMobileError');
            identitySub.textContent = toEmail
                ? 'We\'ll send a one-time password to verify your email. Already a Hearth professional? This takes you straight to your dashboard.'
                : 'We\'ll send a one-time password to verify it. Already a Hearth professional? This takes you straight to your dashboard.';
            useEmailBtn.textContent = toEmail ? 'Use mobile number instead' : 'Use email address instead';
            setTimeout(() => (toEmail ? emailIdentityInput : mobileInput).focus(), 50);
        });

        sendOtpBtn.addEventListener('click', async () => {
            hideErr('poMobileError');

            let identity;
            if (state.identityMode === 'email') {
                identity = emailIdentityInput.value.trim();
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity)) {
                    showErr('poMobileError', 'Enter a valid email address.');
                    emailIdentityInput.focus();
                    return;
                }
            }
            else {
                identity = mobileInput.value.trim();
                if (!/^[6-9]\d{9}$/.test(identity)) {
                    showErr('poMobileError', 'Enter a valid 10-digit mobile number.');
                    mobileInput.focus();
                    return;
                }
            }

            state.mobile = identity;
            state.mode = 'login';
            goToWaiting('Sending your OTP…', 'forward');

            const result = await HearthAPI.requestOtp('login', identity);

            if (!result.success) {
                goTo(screens.mobile, 'back');
                showErr('poMobileError', result.message || 'Could not send OTP. Please try again.');
                return;
            }
            openOtpScreen(result);
        });

        function openOtpScreen(result) {
            document.getElementById('poOtpMobileDisplay').textContent =
                state.identityMode === 'email' ? state.mobile : `+91 ${state.mobile}`;
            const hint = document.getElementById('poOtpHint');
            if (result && result.demoOtp) {
                hint.hidden = false;
                hint.textContent = `Demo mode — no SMS gateway connected. Your OTP is ${result.demoOtp}.`;
            } else {
                hint.hidden = true;
            }
            clearOtpBoxes();
            hideErr('poOtpError');
            goTo(screens.otp, 'forward');
            startResendCountdown();
            setTimeout(() => phone.querySelector('.otp-box[data-otp-index="0"]')?.focus(), 300);
        }

        /* ---- SCREEN: OTP entry ------------------------------------------- */
        const otpBoxes = Array.from(phone.querySelectorAll('.otp-box'));
        const verifyOtpBtn = document.getElementById('poVerifyOtpBtn');
        const resendOtpBtn = document.getElementById('poResendOtpBtn');
        const resendTimerLabel = document.getElementById('poResendTimer');

        otpBoxes.forEach((box, index) => {
            box.addEventListener('input', () => {
                box.value = box.value.replace(/\D/g, '').slice(0, 1);
                box.classList.toggle('is-filled', box.value !== '');
                if (box.value && index < otpBoxes.length - 1)
                    otpBoxes[index + 1].focus();
            });
            box.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !box.value && index > 0)
                    otpBoxes[index - 1].focus();
                if (e.key === 'Enter')
                    verifyOtpBtn.click();
            });
            box.addEventListener('paste', (e) => {
                e.preventDefault();
                const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').split('');
                digits.forEach((d, i) => {
                    if (otpBoxes[i]) {
                        otpBoxes[i].value = d;
                        otpBoxes[i].classList.add('is-filled');
                    }
                });
                const nextEmpty = otpBoxes.find(b => !b.value) || otpBoxes[otpBoxes.length - 1];
                nextEmpty.focus();
            });
        });

        document.getElementById('poChangeMobileBtn').addEventListener('click', backToMobile);

        function startResendCountdown() {
            state.resendSecondsLeft = RESEND_SECONDS;
            resendOtpBtn.disabled = true;
            resendOtpBtn.textContent = 'Resend in ';
            resendTimerLabel.textContent = state.resendSecondsLeft;
            resendOtpBtn.appendChild(resendTimerLabel);
            resendOtpBtn.appendChild(document.createTextNode('s'));
            clearInterval(state.resendTimer);
            state.resendTimer = setInterval(() => {
                state.resendSecondsLeft -= 1;
                if (state.resendSecondsLeft <= 0) {
                    clearInterval(state.resendTimer);
                    resendOtpBtn.disabled = false;
                    resendOtpBtn.textContent = 'Resend OTP';
                } else {
                    resendTimerLabel.textContent = state.resendSecondsLeft;
                }
            }, 1000);
        }

        resendOtpBtn.addEventListener('click', async () => {
            resendOtpBtn.disabled = true;
            resendOtpBtn.textContent = 'Resending…';
            hideErr('poOtpError');
            const result = await HearthAPI.requestOtp(state.mode, state.mobile);
            if (!result.success) {
                showErr('poOtpError', result.message || 'Could not resend OTP. Please try again.');
            }
            const hint = document.getElementById('poOtpHint');
            if (result.demoOtp) {
                hint.hidden = false;
                hint.textContent = `Demo mode — no SMS gateway connected. Your new OTP is ${result.demoOtp}.`;
            }
            startResendCountdown();
        });

        verifyOtpBtn.addEventListener('click', async () => {
            hideErr('poOtpError');
            const otp = otpBoxes.map(b => b.value).join('');

            if (otp.length !== 6) {
                showErr('poOtpError', 'Enter the full 6-digit OTP.');
                return;
            }

            clearInterval(state.resendTimer);
            goToWaiting('Verifying your code…', 'forward');

            const result = await HearthAPI.verifyOtp(state.mode, state.mobile, otp);

            if (!result.success) {
                if (state.mode === 'login' && result.code === 404) {
                    // Identity verified, but no Hearth account behind it.
                    // Collect whichever identity wasn't already verified via OTP.
                    emailFormField.hidden = state.identityMode === 'email';
                    mobileFormField.hidden = state.identityMode !== 'email';
                    poAccountSub.textContent = state.identityMode === 'email'
                        ? 'We verified your email, but there\'s no Hearth account for it yet. Add a couple of details and we\'ll send one more code to confirm it\'s you.'
                        : 'We verified your number, but there\'s no Hearth account for it yet. Add a couple of details and we\'ll send one more code to confirm it\'s you.';
                    goTo(screens.account, 'forward');
                    setTimeout(() => document.getElementById('poName')?.focus(), 300);
                    return;
                }
                goTo(screens.otp, 'back');
                clearOtpBoxes();
                otpBoxes[0].focus();
                if (result.code === 401) {
                    showErr('poOtpError', 'Your session is expired. Please refresh the browser and try again');
                } else {
                    showErr('poOtpError', result.message || 'Could not verify the OTP. Please try again.');
                    startResendCountdown();
                }
                return;
            }

            if (state.mode === 'signup') {
                await createProfessionalAccount();
                return;
            }

            // Logged in to an existing account.
            const user = result.result;
            startSession(user, result.expiresOn);
            await routeAfterLogin(user);
        });

        /* ---- SCREEN: new account details --------------------------------- */
        const nameInput = document.getElementById('poName');
        const emailInput = document.getElementById('poEmail');
        const emailFormField = document.getElementById('poEmailFormField');
        const mobileProfileInput = document.getElementById('poMobileProfile');
        const mobileFormField = document.getElementById('poMobileFormField');
        const poAccountSub = document.getElementById('poAccountSub');

        mobileProfileInput.addEventListener('input', () => {
            mobileProfileInput.value = mobileProfileInput.value.replace(/\D/g, '').slice(0, 10);
        });

        document.getElementById('poTryAnotherNumberBtn').addEventListener('click', backToMobile);

        document.getElementById('poCreateAccountBtn').addEventListener('click', async () => {
            hideErr('poAccountError');
            const fullName = nameInput.value.trim();

            if (fullName.length < 2) {
                showErr('poAccountError', 'Please enter your full name.');
                nameInput.focus();
                return;
            }

            // Collect whichever identity wasn't already verified via OTP.
            let email, phone1;
            if (state.identityMode === 'email') {
                email = state.mobile;
                phone1 = mobileProfileInput.value.trim();
                if (!/^[6-9]\d{9}$/.test(phone1)) {
                    showErr('poAccountError', 'Please enter a valid 10-digit mobile number.');
                    mobileProfileInput.focus();
                    return;
                }
            }
            else {
                phone1 = state.mobile;
                email = emailInput.value.trim();
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    showErr('poAccountError', 'Please enter a valid email address.');
                    emailInput.focus();
                    return;
                }
            }

            state.account = {fullName, email, phone1};
            state.mode = 'signup';
            goToWaiting('Sending your OTP…', 'forward');

            const result = await HearthAPI.requestOtp('signup', state.mobile);
            if (!result.success) {
                state.mode = 'login';
                goTo(screens.account, 'back');
                showErr('poAccountError', result.message || 'Could not send OTP. Please try again.');
                return;
            }
            openOtpScreen(result);
        });

        async function createProfessionalAccount() {
            goToWaiting('Setting up your account…', 'forward');

            const result = await HearthAPI.createUser({
                phone1: state.account.phone1,
                fullName: state.account.fullName,
                email: state.account.email,
                role: 'PROFESSIONAL'
            });

            if (!result.success) {
                state.mode = 'login';
                goTo(screens.account, 'back');
                const msg = String(result.message || '');
                showErr('poAccountError', msg.startsWith('Your mobile/email is already registered')
                        ? msg + ' Please use a different email, or go back and verify with the number you registered with.'
                        : 'Could not complete registration. Please try again.');
                return;
            }

            const user = result.result;
            startSession(user, result.expiresOn);
            showSuccess('Welcome to Hearth!', `Thanks, ${firstName(user)}. Next, tell us about your work.`);
            setTimeout(() => showApplicationForm(user), REDIRECT_DELAY_MS);
        }

        /* ---- after login: registered professional or new application? ---- */
        async function routeAfterLogin(user) {
            goToWaiting('Checking your professional account…', 'forward');

            const res = await HearthAPI.viewProfessional(user.externalId);

            if (res.success && hasProfessionalRecord(res.result)) {
                showSuccess('You\'re logged in!', `Good to see you again, ${firstName(user)}. Taking you to your dashboard…`);
                setTimeout(() => {
                    window.location.href = PORTAL_PAGE;
                }, REDIRECT_DELAY_MS);
                return;
            }

            // 403/404 (or an empty record) -> no professional profile yet.
            if (res.success || res.code === 404 || res.code === 403) {
                showSuccess('You\'re verified!', `Thanks, ${firstName(user)}. Next, tell us about your work.`);
                setTimeout(() => showApplicationForm(user), REDIRECT_DELAY_MS);
                return;
            }

            if (res.code === 401 || res.authExpired) {
                postLogout();
                showMessage('Session expired', 'Your session has expired. Please verify your number again.', 'Start again', backToMobile);
                return;
            }

            showMessage('Something went wrong',
                    res.message || 'We couldn\'t check your professional account right now.',
                    'Try again',
                    () => routeAfterLogin(user));
        }

        /* ---- already logged in when landing here: skip straight to routing */
        (async () => {
            let loggedIn = false;
            try {
                loggedIn = await isLoggedIn();
            } catch (err) {
                loggedIn = false;
            }
            const user = getCurrentUser();
            if (loggedIn && user && user.externalId) {
                await routeAfterLogin(user);
            } else {
                setTimeout(() => mobileInput.focus(), 300);
            }
        })();
    }

    /** Same session bookkeeping completeLogin() does, minus its
     *  postSignupRedirect hop — this page decides where to go next. */
    function startSession(user, expiresOn) {
        saveCurrentUser(user);
        setLoggedIn(expiresOn);
        renderUserChip(user);
    }

    function hasProfessionalRecord(result) {
        if (!result || typeof result !== 'object' || Object.keys(result).length === 0)
            return false;
        return Boolean(result.professionalId || result.applicationId || result.externalId || result.user);
    }

    function firstName(user) {
        return String((user && (user.fullName || user.name)) || 'there').trim().split(' ')[0];
    }

    /* =====================================================================
     STEP 3 — APPLICATION FORM (ported from become-professional.js)
     ===================================================================== */
    let formInitialised = false;

    const proLoc = {
        provinceId: '', province: '',
        cityId: '', city: '',
        neighbourhoodId: '', locality: '', pincode: '',
        provinces: [], cities: [], neighbourhoods: [],
        loadingNeighbourhoods: false,
        servingNeighbourhoodIds: [],
        openZones: new Set(),   // zones expanded in "Localities you serve"
        localitySearch: ''      // search text in "Localities you serve"
    };

    function showApplicationForm(user) {
        document.getElementById('poAuthSection').hidden = true;
        document.getElementById('poApplicationSuccess').hidden = true;
        document.getElementById('poFormContent').hidden = false;
        window.scrollTo({top: 0, behavior: 'smooth'});

        if (formInitialised)
            return;
        formInitialised = true;

        prefillFromExistingData(user);
        renderExpertiseGroups();
        initLocationPicker();
        wireSubmit();
        if (typeof initRipple === 'function')
            initRipple();
    }

    function localityOptionLabel(n) {
        return n.pincode ? `${n.locality} - ${n.pincode}` : n.locality;
    }

    function sortByLocalityOptionLabel(neighbourhoods) {
        return neighbourhoods.slice().sort((a, b) =>
            localityOptionLabel(a).localeCompare(localityOptionLabel(b), undefined, {numeric: true, sensitivity: 'base'})
        );
    }

    function sortByLocalityName(neighbourhoods) {
        return neighbourhoods.slice().sort((a, b) =>
            (a.locality || '').localeCompare(b.locality || '', undefined, {numeric: true, sensitivity: 'base'})
        );
    }

    function listFrom(res) {
        return (res.result && (res.result.items || res.result)) || [];
    }

    function cityOptions(cities) {
        return '<option value="">Select a city…</option>' +
                cities.map(c => `<option value="${escapeAttr(c.cityId)}">${escapeHtml(c.cityName)}</option>`).join('');
    }

    /* "Locality - pincode" options grouped into one <optgroup> per zone.
     Falls back to a flat list when the city has no zone data. */
    function localityOptions(neighbourhoods) {
        const option = n => `<option value="${escapeAttr(n.neighbourhoodId)}">${escapeHtml(localityOptionLabel(n))}</option>`;
        const zones = groupByZone(neighbourhoods);
        const body = zones.length === 1 && zones[0][0] === UNZONED_LABEL
                ? sortByLocalityOptionLabel(neighbourhoods).map(option).join('')
                : zones.map(([zone, list]) =>
                    `<optgroup label="${escapeAttr(zone)}">${sortByLocalityOptionLabel(list).map(option).join('')}</optgroup>`
                ).join('');
        return '<option value="">Select a locality…</option>' + body;
    }

    async function initLocationPicker() {
        const stateSel = document.getElementById('poState');
        const citySel = document.getElementById('poCity');
        const localitySel = document.getElementById('poLocality');

        const res = await HearthAPI.viewProvinces();
        if (res.success) {
            proLoc.provinces = listFrom(res);
            stateSel.innerHTML = '<option value="">Select a state…</option>' +
                    proLoc.provinces.map(p => `<option value="${escapeAttr(p.provinceId)}">${escapeHtml(p.provinceName)}</option>`).join('');
        } else {
            showErr('poAddressError', res.message || 'Could not load states. Please try again.');
        }

        stateSel.addEventListener('change', async () => {
            hideErr('poAddressError');
            proLoc.provinceId = stateSel.value;
            proLoc.province = stateSel.selectedOptions[0] ? stateSel.selectedOptions[0].textContent : '';
            resetCityAndBelow();
            localitySel.innerHTML = '<option value="">Select a city first…</option>';
            localitySel.disabled = true;
            renderServingLocalities();

            if (!proLoc.provinceId) {
                citySel.innerHTML = '<option value="">Select a state first…</option>';
                citySel.disabled = true;
                return;
            }
            citySel.disabled = true;
            citySel.innerHTML = '<option value="">Loading cities…</option>';
            const citiesRes = await HearthAPI.viewCities('provinceId', proLoc.provinceId);
            if (citiesRes.success) {
                proLoc.cities = listFrom(citiesRes);
                citySel.innerHTML = cityOptions(proLoc.cities);
                citySel.disabled = false;
            } else {
                citySel.innerHTML = '<option value="">Could not load cities</option>';
                showErr('poAddressError', citiesRes.message || 'Could not load cities for the selected state.');
            }
        });

        citySel.addEventListener('change', async () => {
            hideErr('poAddressError');
            proLoc.cityId = citySel.value;
            proLoc.city = citySel.selectedOptions[0] ? citySel.selectedOptions[0].textContent : '';
            resetLocalityAndBelow();

            if (!proLoc.cityId) {
                localitySel.innerHTML = '<option value="">Select a city first…</option>';
                localitySel.disabled = true;
                renderServingLocalities();
                return;
            }
            localitySel.disabled = true;
            localitySel.innerHTML = '<option value="">Loading localities…</option>';
            proLoc.loadingNeighbourhoods = true;
            renderServingLocalities();
            const neighbourhoodsRes = await HearthAPI.viewNeighbourhoods(proLoc.cityId);
            proLoc.loadingNeighbourhoods = false;
            if (neighbourhoodsRes.success) {
                proLoc.neighbourhoods = listFrom(neighbourhoodsRes);
                localitySel.innerHTML = localityOptions(proLoc.neighbourhoods);
                localitySel.disabled = false;
            } else {
                localitySel.innerHTML = '<option value="">Could not load localities</option>';
                showErr('poAddressError', neighbourhoodsRes.message || 'Could not load localities for the selected city.');
            }
            renderServingLocalities();
        });

        localitySel.addEventListener('change', () => {
            const match = proLoc.neighbourhoods.find(n => String(n.neighbourhoodId) === String(localitySel.value));
            proLoc.neighbourhoodId = localitySel.value;
            proLoc.locality = match ? match.locality : '';
            proLoc.pincode = match ? (match.pincode || '') : '';
            document.getElementById('poPincode').value = proLoc.pincode;
        });
    }

    function resetCityAndBelow() {
        proLoc.cityId = '';
        proLoc.city = '';
        proLoc.cities = [];
        resetLocalityAndBelow();
    }

    function resetLocalityAndBelow() {
        proLoc.neighbourhoodId = '';
        proLoc.locality = '';
        proLoc.pincode = '';
        proLoc.neighbourhoods = [];
        proLoc.servingNeighbourhoodIds = [];
        proLoc.openZones = new Set();
        proLoc.localitySearch = '';
        const pincodeInput = document.getElementById('poPincode');
        if (pincodeInput)
            pincodeInput.value = '';
    }

    /* ---------------------------------------------------------------
     Localities you serve — grouped by zone (fks_neighbourhoods.zone).
     Layout: [★ All Localities] [search]  ·  "N selected · Clear"
             then one collapsible block per zone with a tri-state
             "Select all" and a checklist of "Locality · pincode" rows.
     The DOM is built once per city (or when "All Localities" flips);
     ticking boxes, searching and expanding only patch the DOM so
     open/closed zones and the search text are never lost.
     Payload contract unchanged: proLoc.servingNeighbourhoodIds holds
     neighbourhoodIds, or [ALL_LOCALITIES_ID] for every locality.
     --------------------------------------------------------------- */
    function zoneOf(n) {
        const zone = n && n.zone != null ? String(n.zone).trim() : '';
        return zone || UNZONED_LABEL;
    }

    /** [[zoneName, neighbourhoods sorted by locality]] — zones A→Z, un-zoned last. */
    function groupByZone(neighbourhoods) {
        const groups = new Map();
        sortByLocalityName(neighbourhoods).forEach(n => {
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

    function servingSelectedSet() {
        return new Set(proLoc.servingNeighbourhoodIds.map(String));
    }

    function renderServingLocalities() {
        const container = document.getElementById('poServingLocalities');
        const hint = document.getElementById('poServingLocalitiesHint');

        const setHint = (text) => {
            container.innerHTML = '';
            hint.hidden = false;
            hint.textContent = text;
        };

        if (!proLoc.cityId)
            return setHint('Select your state and city above to see localities you can serve.');
        if (proLoc.loadingNeighbourhoods)
            return setHint('Loading localities…');
        if (proLoc.neighbourhoods.length === 0)
            return setHint('No localities found for this city yet.');
        hint.hidden = false;
        hint.textContent = 'Pick whole zones with “Select all”, or open a zone to choose individual localities. Choose “All Localities” to serve the entire city.';

        // "All Localities" is mutually exclusive with picking individual ones.
        const allSelected = proLoc.servingNeighbourhoodIds.includes(ALL_LOCALITIES_ID);
        const selected = servingSelectedSet();
        const zones = groupByZone(proLoc.neighbourhoods);

        // A city without zone data still gets one (open) group.
        if (zones.length === 1)
            proLoc.openZones.add(zones[0][0]);

        const zoneBlocks = zones.map(([zone, list], idx) => {
            const isOpen = proLoc.openZones.has(zone);
            const bodyId = `poZoneBody${idx}`;
            const rows = list.map(n => {
                const id = String(n.neighbourhoodId);
                const searchText = `${n.locality || ''} ${n.pincode || ''} ${zone}`.toLowerCase();
                return `
            <label class="po-loc" data-po-loc-search="${escapeAttr(searchText)}">
              <input type="checkbox" value="${escapeAttr(id)}" data-po-serving ${allSelected ? 'disabled' : ''} ${!allSelected && selected.has(id) ? 'checked' : ''}>
              <span class="po-loc-box" aria-hidden="true"></span>
              <span class="po-loc-name">${escapeHtml(n.locality)}</span>
              ${n.pincode ? `<span class="po-loc-pin">${escapeHtml(n.pincode)}</span>` : ''}
            </label>`;
            }).join('');
            return `
        <section class="po-zone${isOpen ? ' is-open' : ''}" data-po-zone="${escapeAttr(zone)}">
          <div class="po-zone-head">
            <button type="button" class="po-zone-toggle" data-po-zone-toggle aria-expanded="${isOpen}" aria-controls="${bodyId}">
              <span class="po-zone-chevron" aria-hidden="true"></span>
              <span class="po-zone-name">${escapeHtml(zone)}</span>
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

        container.innerHTML = `
      <div class="po-zone-toolbar">
        <label class="pro-expertise-chip pro-expertise-chip-all">
          <input type="checkbox" value="${ALL_LOCALITIES_ID}" data-po-serving-all ${allSelected ? 'checked' : ''}>
          <span>★ All Localities</span>
        </label>
        <input type="search" class="po-zone-search" data-po-zone-search placeholder="Search locality or pincode" autocomplete="off" aria-label="Search localities" value="${escapeAttr(proLoc.localitySearch)}" ${allSelected ? 'disabled' : ''}>
      </div>
      <div class="po-zone-summary">
        <span data-po-zone-summary></span>
        <button type="button" class="po-zone-clear" data-po-zone-clear hidden>Clear</button>
      </div>
      <div class="po-zone-list${allSelected ? ' is-disabled' : ''}">${zoneBlocks}
        <p class="po-zone-empty" data-po-zone-empty hidden>No localities match your search.</p>
      </div>`;

        // ★ All Localities
        const allCb = container.querySelector('[data-po-serving-all]');
        allCb.addEventListener('change', () => {
            proLoc.servingNeighbourhoodIds = allCb.checked ? [ALL_LOCALITIES_ID] : [];
            renderServingLocalities();
        });

        // Search (locality name, pincode or zone name)
        const searchInput = container.querySelector('[data-po-zone-search]');
        searchInput.addEventListener('input', () => {
            proLoc.localitySearch = searchInput.value;
            applyLocalitySearch(container);
        });

        // Clear selection
        container.querySelector('[data-po-zone-clear]').addEventListener('click', () => {
            proLoc.servingNeighbourhoodIds = [];
            container.querySelectorAll('[data-po-serving]').forEach(cb => { cb.checked = false; });
            syncServingZones(container);
        });

        container.querySelectorAll('[data-po-zone]').forEach(zoneEl => {
            const zone = zoneEl.getAttribute('data-po-zone');
            const toggle = zoneEl.querySelector('[data-po-zone-toggle]');
            const body = zoneEl.querySelector('.po-zone-body');

            // Expand / collapse
            toggle.addEventListener('click', () => {
                const open = body.hidden;
                body.hidden = !open;
                zoneEl.classList.toggle('is-open', open);
                toggle.setAttribute('aria-expanded', String(open));
                if (open)
                    proLoc.openZones.add(zone);
                else
                    proLoc.openZones.delete(zone);
            });

            // Select all localities in this zone
            const zoneAll = zoneEl.querySelector('[data-po-zone-all]');
            zoneAll.addEventListener('change', () => {
                zoneEl.querySelectorAll('[data-po-serving]').forEach(cb => {
                    cb.checked = zoneAll.checked;
                    setServing(cb.value, cb.checked);
                });
                syncServingZones(container);
            });

            // Individual localities
            zoneEl.querySelectorAll('[data-po-serving]').forEach(cb => {
                cb.addEventListener('change', () => {
                    setServing(cb.value, cb.checked);
                    syncServingZones(container);
                });
            });
        });

        syncServingZones(container);
        applyLocalitySearch(container);
    }

    function setServing(id, on) {
        id = String(id);
        const has = proLoc.servingNeighbourhoodIds.includes(id);
        if (on && !has)
            proLoc.servingNeighbourhoodIds.push(id);
        else if (!on && has)
            proLoc.servingNeighbourhoodIds = proLoc.servingNeighbourhoodIds.filter(x => x !== id);
    }

    /** Refreshes per-zone counts, tri-state "Select all" and the summary line. */
    function syncServingZones(container) {
        const summary = container.querySelector('[data-po-zone-summary]');
        const clearBtn = container.querySelector('[data-po-zone-clear]');
        if (!summary)
            return;

        if (proLoc.servingNeighbourhoodIds.includes(ALL_LOCALITIES_ID)) {
            summary.textContent = `You'll serve every locality in ${proLoc.city || 'this city'} (${proLoc.neighbourhoods.length}).`;
            clearBtn.hidden = true;
            container.querySelectorAll('[data-po-zone]').forEach(zoneEl => {
                const boxes = zoneEl.querySelectorAll('[data-po-serving]');
                zoneEl.querySelector('[data-po-zone-count]').textContent = `${boxes.length} localities`;
                const zoneAll = zoneEl.querySelector('[data-po-zone-all]');
                zoneAll.checked = true;
                zoneAll.indeterminate = false;
            });
            return;
        }

        let zonesTouched = 0;
        container.querySelectorAll('[data-po-zone]').forEach(zoneEl => {
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

        const total = proLoc.servingNeighbourhoodIds.length;
        summary.textContent = total === 0
                ? 'No localities selected yet.'
                : `${total} ${total === 1 ? 'locality' : 'localities'} selected across ${zonesTouched} ${zonesTouched === 1 ? 'zone' : 'zones'}.`;
        clearBtn.hidden = total === 0;
    }

    /** Filters rows by the search text; matching zones open automatically
     while searching and return to their own open/closed state when cleared. */
    function applyLocalitySearch(container) {
        const query = (proLoc.localitySearch || '').trim().toLowerCase();
        let anyVisible = false;

        container.querySelectorAll('[data-po-zone]').forEach(zoneEl => {
            const zone = zoneEl.getAttribute('data-po-zone');
            const body = zoneEl.querySelector('.po-zone-body');
            const toggle = zoneEl.querySelector('[data-po-zone-toggle]');
            let matches = 0;
            zoneEl.querySelectorAll('.po-loc').forEach(row => {
                const hit = !query || row.getAttribute('data-po-loc-search').includes(query);
                row.hidden = !hit;
                if (hit)
                    matches++;
            });
            zoneEl.hidden = matches === 0;
            if (matches > 0)
                anyVisible = true;

            const open = query ? matches > 0 : proLoc.openZones.has(zone);
            body.hidden = !open;
            zoneEl.classList.toggle('is-open', open);
            toggle.setAttribute('aria-expanded', String(open));
        });

        const empty = container.querySelector('[data-po-zone-empty]');
        if (empty)
            empty.hidden = anyVisible;
    }

    /* Best-effort pre-fill of the cascade from a saved address ("Use my saved
     address"). Leaves the selects untouched when the saved address has no
     provinceId/cityId/neighbourhoodId on file. */
    async function primeLocationFromSavedAddress(savedAddress) {
        const stateSel = document.getElementById('poState');
        const citySel = document.getElementById('poCity');
        const localitySel = document.getElementById('poLocality');
        if (!savedAddress.provinceId)
            return;

        stateSel.value = String(savedAddress.provinceId);
        if (stateSel.value !== String(savedAddress.provinceId))
            return;
        resetCityAndBelow();
        proLoc.provinceId = savedAddress.provinceId;
        proLoc.province = savedAddress.province || (stateSel.selectedOptions[0] ? stateSel.selectedOptions[0].textContent : '');

        if (!savedAddress.cityId)
            return;
        citySel.disabled = true;
        citySel.innerHTML = '<option value="">Loading cities…</option>';
        const citiesRes = await HearthAPI.viewCities('provinceId', savedAddress.provinceId);
        if (!citiesRes.success)
            return;
        proLoc.cities = listFrom(citiesRes);
        citySel.innerHTML = cityOptions(proLoc.cities);
        citySel.disabled = false;
        citySel.value = String(savedAddress.cityId);
        proLoc.cityId = savedAddress.cityId;
        proLoc.city = savedAddress.city || proLoc.city;

        if (!savedAddress.neighbourhoodId)
            return;
        localitySel.disabled = true;
        localitySel.innerHTML = '<option value="">Loading localities…</option>';
        const neighbourhoodsRes = await HearthAPI.viewNeighbourhoods(savedAddress.cityId);
        if (!neighbourhoodsRes.success)
            return;
        proLoc.neighbourhoods = listFrom(neighbourhoodsRes);
        localitySel.innerHTML = localityOptions(proLoc.neighbourhoods);
        localitySel.disabled = false;
        localitySel.value = String(savedAddress.neighbourhoodId);
        proLoc.neighbourhoodId = savedAddress.neighbourhoodId;
        const match = proLoc.neighbourhoods.find(n => String(n.neighbourhoodId) === String(savedAddress.neighbourhoodId));
        proLoc.locality = match ? match.locality : (savedAddress.locality || '');
        proLoc.pincode = match ? (match.pincode || '') : (savedAddress.pincode || '');
        document.getElementById('poPincode').value = proLoc.pincode;
        renderServingLocalities();
    }

    /* Deliberately NOT auto-filling the current address from the saved
     profile address (same reasoning as become-professional.js): the
     "Use my saved address" button is an opt-in shortcut instead. */
    function prefillFromExistingData(user) {
        const nameInput = document.getElementById('poNameOnId');
        const name = user && (user.fullName || user.name);
        if (nameInput && !nameInput.value && name)
            nameInput.value = name;

        const aadhaarInput = document.getElementById('poAadhaar');
        aadhaarInput.addEventListener('input', () => {
            const digits = aadhaarInput.value.replace(/\D/g, '').slice(0, 12);
            aadhaarInput.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
        });

        const panInput = document.getElementById('poPan');
        panInput.addEventListener('input', () => {
            panInput.value = panInput.value.toUpperCase().slice(0, 10);
        });

        if (typeof getStoredAddress !== 'function')
            return;
        Promise.resolve()
                .then(() => getStoredAddress())
                .then((savedAddress) => {
                    const useSavedBtn = document.getElementById('poUseSavedAddressBtn');
                    if (!savedAddress || !savedAddress.addressLine1 || !useSavedBtn)
                        return;
                    useSavedBtn.hidden = false;
                    useSavedBtn.addEventListener('click', () => {
                        document.getElementById('poAddressLine').value = savedAddress.addressLine1 || '';
                        primeLocationFromSavedAddress(savedAddress);
                    });
                })
                .catch(() => { /* no saved address available — shortcut stays hidden */ });
    }

    async function renderExpertiseGroups() {
        const container = document.getElementById('poExpertiseGroups');
        container.innerHTML = '<p class="modal-hint">Loading services…</p>';

        const res = await HearthAPI.viewCategories();
        if (!res.success) {
            container.innerHTML = '';
            showErr('poExpertiseError', res.message || 'Could not fetch categories. Please try again.');
            return;
        }
        const categories = (res.result && res.result.items) || [];

        // One clickable image tile per sub-category (a <label> wrapping a
        // visually hidden checkbox, so mouse, touch and keyboard all work).
        container.innerHTML = categories.map(cat => `
    <div class="pro-expertise-group po-exp-cat">
      <p class="pro-expertise-group-label">${escapeHtml(cat.name)}</p>
      <div class="pp-sub-grid">
        ${(cat.subCategories || []).map(sub => {
            const count = (sub.services || []).length;
            return `
          <label class="pp-sub-tile">
            <input type="checkbox" value="${escapeAttr(sub.categoryId)}" data-po-expertise>
            <span class="pp-sub-tile-media">
              <img src="${escapeAttr(sub.image || cat.image || '')}" alt="" loading="lazy">
              <span class="pp-sub-tile-check" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
            </span>
            <span class="pp-sub-tile-body">
              <span class="pp-sub-tile-name">${escapeHtml(sub.name)}</span>
              ${count ? `<span class="pp-sub-tile-count">${count} service${count === 1 ? '' : 's'}</span>` : ''}
            </span>
          </label>`;
        }).join('')}
      </div>
    </div>
  `).join('');
    }

    function wireSubmit() {
        const submitBtn = document.getElementById('poSubmitBtn');
        submitBtn.addEventListener('click', async () => {
            ['poIdentityError', 'poAddressError', 'poExpertiseError', 'poServingLocalitiesError', 'poDeclarationError'].forEach(hideErr);

            const aadhaar = document.getElementById('poAadhaar').value.replace(/\s/g, '');
            const nameOnId = document.getElementById('poNameOnId').value.trim();
            const pan = document.getElementById('poPan').value.trim();
            const addressLine = document.getElementById('poAddressLine').value.trim();
            const experience = document.getElementById('poExperience').value;
            const servingCities = document.getElementById('poServingCities').value;
            const expertise = Array.from(document.querySelectorAll('[data-po-expertise]:checked')).map(cb => cb.value);
            const servingNeighbourhoodIds = proLoc.servingNeighbourhoodIds.slice();
            const declared = document.getElementById('poDeclaration').checked;

            let firstError = null;
            const fail = (id, msg) => {
                showErr(id, msg);
                firstError = firstError || id;
            };

            if (!/^\d{12}$/.test(aadhaar))
                fail('poIdentityError', 'Enter a valid 12-digit Aadhaar number.');
            else if (nameOnId.length < 2)
                fail('poIdentityError', 'Enter your full name as printed on your Aadhaar card.');
            else if (pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan))
                fail('poIdentityError', 'PAN should look like ABCDE1234F, or leave it blank.');

            if (!addressLine)
                fail('poAddressError', 'Enter your current address line.');
            else if (!proLoc.provinceId)
                fail('poAddressError', 'Select your current state.');
            else if (!proLoc.cityId)
                fail('poAddressError', 'Select your current city.');
            else if (!proLoc.neighbourhoodId)
                fail('poAddressError', 'Select your current locality.');

            if (expertise.length === 0)
                fail('poExpertiseError', 'Select at least one area of expertise.');
            if (servingNeighbourhoodIds.length === 0)
                fail('poServingLocalitiesError', 'Select at least one locality you want to serve.');
            if (!declared)
                fail('poDeclarationError', 'Please confirm the declaration to continue.');

            if (firstError) {
                document.getElementById(firstError).scrollIntoView({behavior: 'smooth', block: 'center'});
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting your application…';

            // Same payload contract as become-professional.js.
            const payload = {
                bio: '',
                documents: [{
                        nameOnDocument: nameOnId,
                        documentType: 'AADHAAR',
                        documentNumber: aadhaar
                    }],
                address: {
                    addressLine1: addressLine,
                    neighbourhoodId: proLoc.neighbourhoodId
                },
                cityId: proLoc.cityId,
                experienceYears: experience ? Number(experience) : 0,
                servingCities: servingCities,
                expertise: expertise,
                neighbourhoodIds: servingNeighbourhoodIds
            };

            const result = await HearthAPI.applyAsProfessional(payload);

            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Application';

            if (!result.success) {
                showErr('poDeclarationError', result.message || 'Could not submit your application. Please try again.');
                return;
            }

            const application = result.result || {};
            document.getElementById('poFormContent').hidden = true;
            document.getElementById('poApplicationId').textContent = application.applicationId || '—';
            const success = document.getElementById('poApplicationSuccess');
            success.hidden = false;
            success.scrollIntoView({behavior: 'smooth', block: 'start'});
        });
    }

    /* ---- small helpers (scoped to this file) ------------------------------ */
    function showErr(id, msg) {
        const el = document.getElementById(id);
        if (!el)
            return;
        el.textContent = msg;
        el.hidden = false;
    }
    function hideErr(id) {
        const el = document.getElementById(id);
        if (!el)
            return;
        el.hidden = true;
        el.textContent = '';
    }
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str === undefined || str === null ? '' : str);
        return div.innerHTML;
    }
    function escapeAttr(str) {
        return escapeHtml(str).replace(/"/g, '&quot;');
    }
})();
