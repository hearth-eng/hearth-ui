/* =========================================================================
 HEARTH — script.js
 Vanilla JS only. Progressive enhancement — page works without it.
 ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
    initStickyHeader();
    initMobileNav();
    initAccordion();
    initRipple();
    initScrollReveal();
    initCounters();
    initBackToTop();
    initSearchForm();
    initAuthState();
    initSignupFlow();
    initLoginFlow();
    initProfessionalLinkGate();
    initFavouriteToggles();
});

/* -------------------------------------------------------------------------
 Sticky header shadow on scroll
 ------------------------------------------------------------------------- */
function initStickyHeader() {
    const header = document.getElementById('siteHeader');
    if (!header)
        return;
    const onScroll = () => {
        header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, {passive: true});
}

/* -------------------------------------------------------------------------
 Mobile navigation toggle
 ------------------------------------------------------------------------- */
function initMobileNav() {
    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');
    const actions = document.querySelector('.nav-actions');
    if (!toggle || !links)
        return;

    const closeMenu = () => {
        toggle.setAttribute('aria-expanded', 'false');
        links.classList.remove('is-open');
        if (actions)
            actions.classList.remove('is-open');
    };

    toggle.addEventListener('click', () => {
        const isOpen = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!isOpen));
        links.classList.toggle('is-open', !isOpen);
        if (actions)
            actions.classList.toggle('is-open', !isOpen);
    });

    // Close menu when a link is clicked (mobile)
    links.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', closeMenu);
    });

    // Close on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape')
            closeMenu();
    });

    // Close when resizing up to desktop
    window.addEventListener('resize', () => {
        if (window.innerWidth >= 768)
            closeMenu();
    });
}

/* -------------------------------------------------------------------------
 FAQ accordion — single-open, accessible
 ------------------------------------------------------------------------- */
function initAccordion() {
    const accordion = document.getElementById('accordion');
    if (!accordion)
        return;
    const triggers = accordion.querySelectorAll('.accordion-trigger');

    triggers.forEach(trigger => {
        trigger.addEventListener('click', () => {
            const expanded = trigger.getAttribute('aria-expanded') === 'true';
            const panel = document.getElementById(trigger.getAttribute('aria-controls'));

            // Close all others
            triggers.forEach(t => {
                if (t !== trigger) {
                    t.setAttribute('aria-expanded', 'false');
                    const p = document.getElementById(t.getAttribute('aria-controls'));
                    if (p)
                        p.hidden = true;
                }
            });

            // Toggle current
            trigger.setAttribute('aria-expanded', String(!expanded));
            if (panel)
                panel.hidden = expanded;
        });
    });
}

/* -------------------------------------------------------------------------
 Button ripple effect (CSS-driven, JS sets origin point)
 ------------------------------------------------------------------------- */
function initRipple() {
    document.querySelectorAll('.btn-ripple').forEach(btn => {
        if (btn.dataset.rippleBound)
            return; // avoid double-binding on re-init
        btn.dataset.rippleBound = 'true';
        btn.addEventListener('click', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            btn.style.setProperty('--rx', `${x}%`);
            btn.style.setProperty('--ry', `${y}%`);
            btn.classList.remove('is-rippling');
            // Force reflow so the animation can restart
            void btn.offsetWidth;
            btn.classList.add('is-rippling');
            setTimeout(() => btn.classList.remove('is-rippling'), 600);
        });
    });
}

/* -------------------------------------------------------------------------
 Scroll-reveal using IntersectionObserver, with a light stagger
 ------------------------------------------------------------------------- */
function initScrollReveal() {
    const items = document.querySelectorAll('.reveal');
    if (!items.length)
        return;

    if (!('IntersectionObserver' in window)) {
        items.forEach(el => el.classList.add('is-visible'));
        return;
    }

    // Stagger items that share a parent grid/container
    const groups = new Map();
    items.forEach(el => {
        const parent = el.parentElement;
        if (!groups.has(parent))
            groups.set(parent, []);
        groups.get(parent).push(el);
    });
    groups.forEach(group => {
        group.forEach((el, i) => {
            el.style.transitionDelay = `${Math.min(i * 80, 400)}ms`;
        });
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, {threshold: 0.15, rootMargin: '0px 0px -40px 0px'});

    items.forEach(el => observer.observe(el));
}

/* -------------------------------------------------------------------------
 Animated statistic counters
 ------------------------------------------------------------------------- */
function initCounters() {
    const counters = document.querySelectorAll('[data-count]');
    if (!counters.length)
        return;

    const animateCounter = (el) => {
        const target = parseInt(el.getAttribute('data-count'), 10) || 0;
        const duration = 1400;
        const start = performance.now();
        const easeOutQuad = t => t * (2 - t);

        function tick(now) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = easeOutQuad(progress);
            const value = Math.floor(eased * target);
            el.textContent = value.toLocaleString('en-IN');
            if (progress < 1) {
                requestAnimationFrame(tick);
            } else {
                el.textContent = target.toLocaleString('en-IN');
            }
        }
        requestAnimationFrame(tick);
    };

    if (!('IntersectionObserver' in window)) {
        counters.forEach(animateCounter);
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, {threshold: 0.5});

    counters.forEach(el => observer.observe(el));
}

/* -------------------------------------------------------------------------
 Back-to-top button
 ------------------------------------------------------------------------- */
function initBackToTop() {
    const btn = document.getElementById('backToTop');
    if (!btn)
        return;

    window.addEventListener('scroll', () => {
        btn.classList.toggle('is-visible', window.scrollY > 600);
    }, {passive: true});

    btn.addEventListener('click', () => {
        window.scrollTo({top: 0, behavior: 'smooth'});
    });
}

/* -------------------------------------------------------------------------
 Search form — lightweight client-side validation stub
 ------------------------------------------------------------------------- */
function initSearchForm() {
    const form = document.querySelector('.search-card');
    if (!form)
        return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const service = document.getElementById('serviceInput');
        const location = document.getElementById('locationInput');

        if (!service.value.trim()) {
            service.focus();
            return;
        }
        if (!location.value.trim()) {
            location.focus();
            return;
        }

        // In production this would route to a results page.
        const servicesSection = document.getElementById('services');
        if (servicesSection) {
            servicesSection.scrollIntoView({behavior: 'smooth'});
        }
    });
}

/**
 * "Become a Professional" always goes to the dedicated professional
 * onboarding page, which runs its own OTP verification and then routes
 * to the application form or, for an already-registered professional,
 * to the professional dashboard (professional-portal.html).
 * A logged-in customer is asked to confirm a logout first.
 */
function initProfessionalLinkGate() {
    const ONBOARDING_PAGE = 'professional-onboarding';

    document.addEventListener('click', async (e) => {
        const trigger = e.target.closest('.nav-link-pro');
        if (!trigger)
            return;

        e.preventDefault();

        // A logged-in customer has to be logged out first: the onboarding
        // page runs its own OTP login, and the server refuses a new OTP
        // request while a session cookie is still active.
        const user = getCurrentUser();
        const isCustomerSession = (await isLoggedIn()) && user &&
                String(user.role || '').toUpperCase() !== 'PROFESSIONAL';

        if (!isCustomerSession) {
            window.location.href = ONBOARDING_PAGE;
            return;
        }

        showConfirmDialog({
            title: 'Log out to continue?',
            message: 'Becoming a professional needs a separate sign-in. You will be logged out of your current Hearth account before continuing to professional onboarding.',
            confirmLabel: 'Log out & continue',
            cancelLabel: 'Cancel',
            danger: false,
            onConfirm: async () => {
                const res = await HearthAPI.logout();
                // 401 means the server-side session had already expired —
                // nothing left to clear there, so it's safe to continue.
                if (res.success || res.code === 401) {
                    postLogout();
                    window.location.href = ONBOARDING_PAGE;
                    return;
                }
                showConfirmDialog({
                    title: 'Could not log you out',
                    message: res.message || 'Please try again in a moment.',
                    confirmLabel: 'OK',
                    danger: false,
                    onConfirm: () => {}
                });
            }
        });
    });
}


/* =========================================================================
 SIGNUP / REGISTRATION FLOW
 A mobile-screen-sized popup that behaves like real app navigation: each
 step is its own "page" that slides in/out, with a dedicated waiting page
 shown while a network call is in flight. All network calls themselves
 live in api.js (see the HearthAPI namespace) — this file only handles
 screen navigation and UI state.
 
 Screen sequence:
 mobile -> waiting -> otp -> waiting -> profile -> waiting -> success
 with backward navigation on error (waiting -> mobile / otp / profile).
 ========================================================================= */

function initSignupFlow() {
    injectSignupModalMarkup();
    initRipple(); // re-run so the newly-injected modal buttons get the ripple effect

    const overlay = document.getElementById('signupOverlay');
    const modal = document.getElementById('signupModal');
    const closeBtn = document.getElementById('signupCloseBtn');
    const screens = {
        mobile: modal.querySelector('[data-screen="mobile"]'),
        waiting: modal.querySelector('[data-screen="waiting"]'),
        otp: modal.querySelector('[data-screen="otp"]'),
        profile: modal.querySelector('[data-screen="profile"]'),
        success: modal.querySelector('[data-screen="success"]'),
    };
    const waitingLabel = document.getElementById('waitingLabel');

    const state = {
        mobile: '',
        activeScreen: screens.mobile,
        resendTimer: null,
        resendSecondsLeft: 30,
    };

    // ---- screen navigation (slide transitions) ---------------------------
    /**
     * Navigate from the current screen to `targetScreen`.
     * direction 'forward' slides the new screen in from the right (and the
     * old one out to the left) — like moving deeper into a flow.
     * direction 'back' does the reverse — like returning to a previous step.
     */
    function goTo(targetScreen, direction) {
        const outgoing = state.activeScreen;
        if (outgoing === targetScreen)
            return;

        targetScreen.classList.remove('screen-off-left', 'screen-off-right');
        targetScreen.classList.add(direction === 'forward' ? 'screen-off-right' : 'screen-off-left');
        targetScreen.inert = false;
        targetScreen.removeAttribute('aria-hidden');

        // Force reflow so the starting position is committed before animating.
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

    function setStepDots(stepNumber) {
        const indicator = modal.querySelector('.modal-steps-indicator');
        if (indicator)
            indicator.hidden = stepNumber === 0;
        modal.querySelectorAll('.step-dot').forEach(dot => {
            const dotStep = Number(dot.dataset.step);
            dot.classList.toggle('is-complete', dotStep < stepNumber);
            dot.classList.toggle('is-active', dotStep <= stepNumber);
        });
    }

    // ---- open / close ------------------------------------------------------
    function resetModal() {
        Object.values(screens).forEach(screen => {
            screen.classList.remove('screen-current', 'screen-off-left', 'screen-off-right');
            screen.classList.add('screen-off-right');
            screen.inert = true;
            screen.setAttribute('aria-hidden', 'true');
        });
        screens.mobile.classList.remove('screen-off-right');
        screens.mobile.classList.add('screen-current');
        screens.mobile.inert = false;
        screens.mobile.removeAttribute('aria-hidden');
        state.activeScreen = screens.mobile;
        setStepDots(1);

        document.getElementById('signupMobile').value = '';
        document.getElementById('signupEmailIdentity').value = '';
        document.getElementById('signupName').value = '';
        document.getElementById('signupEmail').value = '';
        document.getElementById('signupMobileProfile').value = '';
        state.identityMode = 'mobile';
        document.getElementById('signupMobileField').hidden = false;
        document.getElementById('signupEmailField').hidden = true;
        document.getElementById('signupIdentitySub').textContent =
            'Enter your mobile number and we\'ll send a one-time password to verify it\'s you.';
        document.getElementById('signupUseEmailBtn').textContent = 'Use email address instead';
        modal.querySelectorAll('.otp-box').forEach(b => {
            b.value = '';
            b.classList.remove('is-filled');
        });
        hideError('mobileError');
        hideError('otpError');
        hideError('profileError');
        clearInterval(state.resendTimer);
    }

    function openModal() {
        resetModal();
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        setTimeout(() => document.getElementById('signupMobile')?.focus(), 300);
    }

    function closeModal() {
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        clearInterval(state.resendTimer);
    }

    // Event delegation, not a direct element binding: the header's #signupBtn
    // can be destroyed and recreated later (e.g. after logout rebuilds
    // nav-actions), so we listen on document and check the click target at
    // click-time rather than binding to one specific node up front.
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('#signupBtn');
        if (trigger) {
            e.preventDefault();
            openModal();
        }
    });

    document.getElementById('switchToLoginBtn')?.addEventListener('click', () => {
        closeModal();
        document.dispatchEvent(new CustomEvent('hearth:open-login', {detail: {mobile: mobileInput.value.trim()}}));
    });

    document.addEventListener('hearth:open-signup', (e) => {
        openModal();
        if (e.detail && e.detail.mobile) {
            setTimeout(() => {
                mobileInput.value = e.detail.mobile;
            }, 50);
        }
    });

    closeBtn.addEventListener('click', closeModal);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay)
            closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('is-open'))
            closeModal();
    });

    function showError(fieldId, message) {
        const el = document.getElementById(fieldId);
        if (!el)
            return;
        el.textContent = message;
        el.hidden = false;
    }

    function hideError(fieldId) {
        const el = document.getElementById(fieldId);
        if (!el)
            return;
        el.hidden = true;
        el.textContent = '';
    }

    // ---- SCREEN 1: mobile/email identity -> waiting -> otp -----------------
    const mobileInput = document.getElementById('signupMobile');
    const emailIdentityInput = document.getElementById('signupEmailIdentity');
    const mobileField = document.getElementById('signupMobileField');
    const emailField = document.getElementById('signupEmailField');
    const identitySub = document.getElementById('signupIdentitySub');
    const useEmailBtn = document.getElementById('signupUseEmailBtn');
    const sendOtpBtn = document.getElementById('sendOtpBtn');

    state.identityMode = 'mobile';

    mobileInput.addEventListener('input', () => {
        mobileInput.value = mobileInput.value.replace(/\D/g, '').slice(0, 10);
    });

    useEmailBtn.addEventListener('click', () => {
        const toEmail = state.identityMode === 'mobile';
        state.identityMode = toEmail ? 'email' : 'mobile';
        mobileField.hidden = toEmail;
        emailField.hidden = !toEmail;
        hideError('mobileError');
        identitySub.textContent = toEmail
            ? 'Enter your email address and we\'ll send a one-time password to verify it\'s you.'
            : 'Enter your mobile number and we\'ll send a one-time password to verify it\'s you.';
        useEmailBtn.textContent = toEmail ? 'Use mobile number instead' : 'Use email address instead';
        setTimeout(() => (toEmail ? emailIdentityInput : mobileInput).focus(), 50);
    });

    sendOtpBtn.addEventListener('click', async () => {
        hideError('mobileError');

        let identity;
        if (state.identityMode === 'email') {
            identity = emailIdentityInput.value.trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity)) {
                showError('mobileError', 'Enter a valid email address.');
                emailIdentityInput.focus();
                return;
            }
        }
        else {
            identity = mobileInput.value.trim();
            if (!/^[6-9]\d{9}$/.test(identity)) {
                showError('mobileError', 'Enter a valid 10-digit mobile number.');
                mobileInput.focus();
                return;
            }
        }

        state.mobile = identity;
        goToWaiting('Sending your OTP…', 'forward');

        // make the REST API call
        const result = await HearthAPI.requestOtp('signup', identity);

        if (! result.success) {
            goTo(screens.mobile, 'back');
            showError('mobileError', result.message || 'Could not send OTP. Please try again.');
            return;
        }

        document.getElementById('otpMobileDisplay').textContent =
            state.identityMode === 'email' ? identity : `+91 ${identity}`;
        const hint = document.getElementById('otpDemoHint');
        if (hint) {
            if (result.demoOtp) {
                hint.hidden = false;
                hint.textContent = `Demo mode — no SMS gateway connected. Your OTP is ${result.demoOtp}.`;
            }
            else {
                hint.hidden = true;
            }
        }

        setStepDots(2);
        goTo(screens.otp, 'forward');
        startResendCountdown();
        setTimeout(() => modal.querySelector('.otp-box[data-otp-index="0"]')?.focus(), 300);
    });

    // ---- SCREEN 2: OTP entry -> waiting -> profile -------------------------
    const otpBoxes = Array.from(modal.querySelectorAll('.otp-box'));
    const verifyOtpBtn = document.getElementById('verifyOtpBtn');
    const changeMobileBtn = document.getElementById('changeMobileBtn');
    const resendOtpBtn = document.getElementById('resendOtpBtn');
    const resendTimerLabel = document.getElementById('resendTimer');

    otpBoxes.forEach((box, index) => {
        box.addEventListener('input', () => {
            box.value = box.value.replace(/\D/g, '').slice(0, 1);
            box.classList.toggle('is-filled', box.value !== '');
            if (box.value && index < otpBoxes.length - 1) {
                otpBoxes[index + 1].focus();
            }
        });
        box.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !box.value && index > 0) {
                otpBoxes[index - 1].focus();
            }
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

    changeMobileBtn.addEventListener('click', () => {
        clearInterval(state.resendTimer);
        setStepDots(1);
        goTo(screens.mobile, 'back');
        setTimeout(() => mobileInput.focus(), 300);
    });

    function startResendCountdown() {
        state.resendSecondsLeft = 30;
        resendOtpBtn.disabled = true;
        resendTimerLabel.textContent = state.resendSecondsLeft;
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
        const result = await HearthAPI.requestOtp(state.mobile);
        const hint = document.getElementById('otpDemoHint');
        if (hint && result.demoOtp) {
            hint.hidden = false;
            hint.textContent = `Demo mode — no SMS gateway connected. Your new OTP is ${result.demoOtp}.`;
        }
        resendOtpBtn.textContent = 'Resend in ';
        resendOtpBtn.appendChild(resendTimerLabel);
        startResendCountdown();
    });

    verifyOtpBtn.addEventListener('click', async () => {
        hideError('otpError');
        const otp = otpBoxes.map(b => b.value).join('');

        if (otp.length !== 6) {
            showError('otpError', 'Enter the full 6-digit OTP.');
            return;
        }

        clearInterval(state.resendTimer);
        goToWaiting('Verifying your code…', 'forward');

        const result = await HearthAPI.verifyOtp('signup', state.mobile, otp);

        if (! result.success) {
            goTo(screens.otp, 'back');
            showError('loginOtpError', result.message);
            otpBoxes.forEach(b => {
                b.value = '';
                b.classList.remove('is-filled');
            });
            otpBoxes[0].focus();
            startResendCountdown();
        }
        else {  // success = true
            setStepDots(3);
            // Collect whichever identity wasn't already verified via OTP.
            emailFormField.hidden = state.identityMode === 'email';
            mobileFormField.hidden = state.identityMode !== 'email';
            goTo(screens.profile, 'forward');
            setTimeout(() => document.getElementById('signupName')?.focus(), 300);
        }
    });

    // ---- SCREEN 3: profile -> waiting -> success ---------------------------
    const nameInput = document.getElementById('signupName');
    const emailInput = document.getElementById('signupEmail');
    const emailFormField = document.getElementById('signupEmailFormField');
    const mobileProfileInput = document.getElementById('signupMobileProfile');
    const mobileFormField = document.getElementById('signupMobileFormField');
    const completeRegBtn = document.getElementById('completeRegBtn');

    mobileProfileInput.addEventListener('input', () => {
        mobileProfileInput.value = mobileProfileInput.value.replace(/\D/g, '').slice(0, 10);
    });

    completeRegBtn.addEventListener('click', async () => {
        hideError('profileError');
        const name = nameInput.value.trim();

        if (name.length < 2) {
            showError('profileError', 'Please enter your full name.');
            nameInput.focus();
            return;
        }

        // Whichever identity OTP verification used (state.identityMode) is already
        // known - collect the OTHER one here, not the same one twice.
        let phone1, email;
        if (state.identityMode === 'email') {
            email = state.mobile;
            phone1 = mobileProfileInput.value.trim();
            if (!/^[6-9]\d{9}$/.test(phone1)) {
                showError('profileError', 'Please enter a valid 10-digit mobile number.');
                mobileProfileInput.focus();
                return;
            }
        }
        else {
            phone1 = state.mobile;
            email = emailInput.value.trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                showError('profileError', 'Please enter a valid email address.');
                emailInput.focus();
                return;
            }
        }

        goToWaiting('Setting up your profile…', 'forward');
        const redirectTo = safeStorageGet(HEARTH_STORAGE_KEYS.postSignupRedirect);
        let role = 'CUSTOMER';
        if (redirectTo && redirectTo === 'become-professional') {
            role = 'PROFESSIONAL';
        }

        const result = await HearthAPI.createUser({
            phone1: phone1,
            fullName: name,
            email: email,
            role: role
        });

        if (result.success) {
            document.getElementById('successMessage').textContent =
                `You're all set to browse services, ${result.result.fullName.split(' ')[0]}.`;
            setStepDots(0);
            goTo(screens.success, 'forward');
            completeLogin(result.result, result.expiresOn);
            setTimeout(closeModal, 1200);
        }
        else {
            if (result.message.startsWith('Your mobile/email is already registered')) {
                goTo(screens.profile, 'back');
                showError('profileError', result.message + ' Please close this window and click on Log In to continue.');
            }
            else {
                goTo(screens.profile, 'back');
                showError('profileError', 'Could not complete registration. Please try again.');
            }
        }
    });
}

/* =========================================================================
 LOGIN FLOW
 A mobile-screen-sized popup mirroring the signup flow's navigation style
 (mobile -> waiting -> otp -> waiting -> success), but shorter — no
 profile step, since the person already has one. Reuses the same
 HearthAPI.requestOtp / verifyOtp endpoints signup uses (a real backend
 would share OTP delivery between login and signup too).
 
 This demo has no server-side user registry, so "is this number
 registered?" is answered by checking the locally-stored account
 (getCurrentUser()) for a matching mobile number. If it matches, the
 session is restored. If not, a dedicated screen offers to sign up
 instead — it does not fabricate an account for an unrecognized number.
 ========================================================================= */

function initLoginFlow() {
    injectLoginModalMarkup();
    initRipple();

    const overlay = document.getElementById('loginOverlay');
    const modal = document.getElementById('loginModal');
    const closeBtn = document.getElementById('loginCloseBtn');
    const screens = {
        mobile: modal.querySelector('[data-screen="login-mobile"]'),
        waiting: modal.querySelector('[data-screen="login-waiting"]'),
        otp: modal.querySelector('[data-screen="login-otp"]'),
        notFound: modal.querySelector('[data-screen="login-not-found"]'),
        success: modal.querySelector('[data-screen="login-success"]'),
    };
    const waitingLabel = document.getElementById('loginWaitingLabel');

    const state = {
        mobile: '',
        activeScreen: screens.mobile,
        resendTimer: null,
        resendSecondsLeft: 30,
    };

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

    function resetModal() {
        Object.values(screens).forEach(screen => {
            screen.classList.remove('screen-current', 'screen-off-left', 'screen-off-right');
            screen.classList.add('screen-off-right');
            screen.inert = true;
            screen.setAttribute('aria-hidden', 'true');
        });
        screens.mobile.classList.remove('screen-off-right');
        screens.mobile.classList.add('screen-current');
        screens.mobile.inert = false;
        screens.mobile.removeAttribute('aria-hidden');
        state.activeScreen = screens.mobile;

        document.getElementById('loginMobile').value = '';
        document.getElementById('loginEmailIdentity').value = '';
        state.identityMode = 'mobile';
        document.getElementById('loginMobileField').hidden = false;
        document.getElementById('loginEmailField').hidden = true;
        document.getElementById('loginIdentitySub').textContent =
            'Enter your registered mobile number and we\'ll send you a one-time password.';
        document.getElementById('loginUseEmailBtn').textContent = 'Use email address instead';
        modal.querySelectorAll('.otp-box').forEach(b => {
            b.value = '';
            b.classList.remove('is-filled');
        });
        hideError('loginMobileError');
        hideError('loginOtpError');
        clearInterval(state.resendTimer);
    }

    function openModal(presetMobile) {
        resetModal();
        if (presetMobile)
            document.getElementById('loginMobile').value = presetMobile;
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        setTimeout(() => document.getElementById('loginMobile')?.focus(), 300);
    }

    function closeModal() {
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        clearInterval(state.resendTimer);
    }

    // Event delegation so this keeps working even if #loginBtn is destroyed
    // and recreated later (e.g. after logout rebuilds nav-actions).
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('#loginBtn');
        if (trigger) {
            e.preventDefault();
            openModal();
        }
    });

    document.addEventListener('hearth:open-login', (e) => {
        openModal(e.detail && e.detail.mobile);
    });

    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay)
            closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('is-open'))
            closeModal();
    });

    function showError(fieldId, message) {
        const el = document.getElementById(fieldId);
        if (!el)
            return;
        el.textContent = message;
        el.hidden = false;
    }
    function hideError(fieldId) {
        const el = document.getElementById(fieldId);
        if (!el)
            return;
        el.hidden = true;
        el.textContent = '';
    }

    // ---- SCREEN 1: mobile/email identity -> waiting -> otp -----------------
    const mobileInput = document.getElementById('loginMobile');
    const emailIdentityInput = document.getElementById('loginEmailIdentity');
    const mobileField = document.getElementById('loginMobileField');
    const emailField = document.getElementById('loginEmailField');
    const identitySub = document.getElementById('loginIdentitySub');
    const useEmailBtn = document.getElementById('loginUseEmailBtn');
    const sendOtpBtn = document.getElementById('loginSendOtpBtn');

    state.identityMode = 'mobile';

    mobileInput.addEventListener('input', () => {
        mobileInput.value = mobileInput.value.replace(/\D/g, '').slice(0, 10);
    });

    useEmailBtn.addEventListener('click', () => {
        const toEmail = state.identityMode === 'mobile';
        state.identityMode = toEmail ? 'email' : 'mobile';
        mobileField.hidden = toEmail;
        emailField.hidden = !toEmail;
        hideError('loginMobileError');
        identitySub.textContent = toEmail
            ? 'Enter your registered email address and we\'ll send you a one-time password.'
            : 'Enter your registered mobile number and we\'ll send you a one-time password.';
        useEmailBtn.textContent = toEmail ? 'Use mobile number instead' : 'Use email address instead';
        setTimeout(() => (toEmail ? emailIdentityInput : mobileInput).focus(), 50);
    });

    document.getElementById('switchToSignupBtn')?.addEventListener('click', () => {
        closeModal();
        document.dispatchEvent(new CustomEvent('hearth:open-signup', {detail: {mobile: mobileInput.value.trim()}}));
    });
    document.getElementById('switchToSignupFromNotFoundBtn')?.addEventListener('click', () => {
        closeModal();
        document.dispatchEvent(new CustomEvent('hearth:open-signup', {detail: {mobile: state.mobile}}));
    });
    document.getElementById('loginTryAnotherNumberBtn')?.addEventListener('click', () => {
        goTo(screens.mobile, 'back');
        setTimeout(() => mobileInput.focus(), 300);
    });

    sendOtpBtn.addEventListener('click', async () => {
        hideError('loginMobileError');

        let identity;
        if (state.identityMode === 'email') {
            identity = emailIdentityInput.value.trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity)) {
                showError('loginMobileError', 'Enter a valid email address.');
                emailIdentityInput.focus();
                return;
            }
        }
        else {
            identity = mobileInput.value.trim();
            if (!/^[6-9]\d{9}$/.test(identity)) {
                showError('loginMobileError', 'Enter a valid 10-digit mobile number.');
                mobileInput.focus();
                return;
            }
        }

        state.mobile = identity;
        goToWaiting('Sending your OTP…', 'forward');

        const result = await HearthAPI.requestOtp('login', identity);

        if (! result.success) {
            goTo(screens.mobile, 'back');
            showError('loginMobileError', result.message || 'Could not send OTP. Please try again.');
            return;
        }

        document.getElementById('loginOtpMobileDisplay').textContent =
            state.identityMode === 'email' ? identity : `+91 ${identity}`;
        const hint = document.getElementById('loginOtpDemoHint');
        if (hint) {
            if (result.demoOtp) {
                hint.hidden = false;
                hint.textContent = `Demo mode — no SMS gateway connected. Your OTP is ${result.demoOtp}.`;
            } else {
                hint.hidden = true;
            }
        }

        goTo(screens.otp, 'forward');
        startResendCountdown();
        setTimeout(() => modal.querySelector('.otp-box[data-otp-index="0"]')?.focus(), 300);
    });

    // ---- SCREEN 2: OTP entry -> waiting -> success / not-found -------------
    const otpBoxes = Array.from(modal.querySelectorAll('.otp-box'));
    const verifyOtpBtn = document.getElementById('loginVerifyOtpBtn');
    const changeMobileBtn = document.getElementById('loginChangeMobileBtn');
    const resendOtpBtn = document.getElementById('loginResendOtpBtn');
    const resendTimerLabel = document.getElementById('loginResendTimer');

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

    changeMobileBtn.addEventListener('click', () => {
        clearInterval(state.resendTimer);
        goTo(screens.mobile, 'back');
        setTimeout(() => mobileInput.focus(), 300);
    });

    function startResendCountdown() {
        state.resendSecondsLeft = 30;
        resendOtpBtn.disabled = true;
        resendTimerLabel.textContent = state.resendSecondsLeft;
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
        const result = await HearthAPI.requestOtp(state.mobile);
        const hint = document.getElementById('loginOtpDemoHint');
        if (hint && result.demoOtp) {
            hint.hidden = false;
            hint.textContent = `Demo mode — no SMS gateway connected. Your new OTP is ${result.demoOtp}.`;
        }
        resendOtpBtn.textContent = 'Resend in ';
        resendOtpBtn.appendChild(resendTimerLabel);
        startResendCountdown();
    });

    verifyOtpBtn.addEventListener('click', async () => {
        hideError('loginOtpError');
        const otp = otpBoxes.map(b => b.value).join('');

        if (otp.length !== 6) {
            showError('loginOtpError', 'Enter the full 6-digit OTP.');
            return;
        }

        clearInterval(state.resendTimer);
        goToWaiting('Verifying your code…', 'forward');

        // Verify the otp for login process.
        const result = await HearthAPI.verifyOtp('login', state.mobile, otp);
        
        if (! result.success) {
            if (result.code === 404) {
                goTo(screens.notFound, 'forward');
            }
            else if (result.code === 401) {
                goTo(screens.otp, 'back');
                showError('loginOtpError', 'Your session is expired. Please refresh the browser and try again');
                otpBoxes.forEach(b => {
                    b.value = '';
                    b.classList.remove('is-filled');
                });
                otpBoxes[0].focus();
            }
            else {
                goTo(screens.otp, 'back');
                showError('loginOtpError', result.message);
                otpBoxes.forEach(b => {
                    b.value = '';
                    b.classList.remove('is-filled');
                });
                otpBoxes[0].focus();
                startResendCountdown();
            }
        }
        else {
            // success = true
            const loggedInUser = result.result;
            
            document.getElementById('loginSuccessMessage').textContent = `Good to see you again, ${loggedInUser.fullName.split(' ')[0]}.`;
            goTo(screens.success, 'forward');
            completeLogin(loggedInUser, result.expiresOn);

            // The OTP-verify response only carries {externalId, fullName} —
            // not role — so a professional returning to the site needs a
            // quick lookup here before we know to send them to their
            // dashboard instead of wherever "Become a Professional" (or
            // nothing in particular) wanted them to land.
            // 
            // HearthAPI.viewUser(loggedInUser.externalId).then((res) => {
            //     if (res.success && res.result && String(res.result.role || '').toUpperCase() === 'PROFESSIONAL') {
            //         saveCurrentUser(res.result);
            //         renderUserChip(res.result);
            //         safeStorageRemove(HEARTH_STORAGE_KEYS.postSignupRedirect);
            //         setTimeout(() => {
            //             window.location.href = 'professional-dashboard.html';
            //         }, 1800);
            //     }
            // });

            setTimeout(closeModal, 1000);
        }
        
        // Demo code
        // OTP is verified — a real phone, but is there an account behind it?
        // const existingUser = getCurrentUser();
        // if (existingUser && existingUser.mobile === state.mobile) {
        //     document.getElementById('loginSuccessMessage').textContent =
        //             `Good to see you again, ${existingUser.name.split(' ')[0]}.`;
        //     goTo(screens.success, 'forward');
        //     completeLogin(existingUser);
        //     setTimeout(closeModal, 1800);
        // } else {
        //     goTo(screens.notFound, 'forward');
        // }
    });
}

/* ---- inject login modal markup once per page --------------------------- */
function injectLoginModalMarkup() {
    if (document.getElementById('loginOverlay'))
        return;

    const markup = `
<div class="modal-overlay" id="loginOverlay" aria-hidden="true">
  <div class="modal-phone" id="loginModal" role="dialog" aria-modal="true" aria-labelledby="loginModalTitle">
    <button type="button" class="modal-close" id="loginCloseBtn" aria-label="Close log in">&times;</button>

    <div class="modal-screens">

      <div class="modal-screen screen-current" data-screen="login-mobile">
        <h2 id="loginModalTitle" class="modal-title">Welcome back</h2>
        <p class="modal-sub" id="loginIdentitySub">Enter your registered mobile number and we'll send you a one-time password.</p>
        <div class="otp-mobile-field" id="loginMobileField">
          <span class="otp-country-code">+91</span>
          <input type="tel" inputmode="numeric" maxlength="10" id="loginMobile" placeholder="98765 43210" autocomplete="tel">
        </div>
        <div class="otp-mobile-field" id="loginEmailField" hidden>
          <input type="email" id="loginEmailIdentity" placeholder="[REDACTED_EMAIL_ADDRESS_11]" autocomplete="email">
        </div>
        <p class="modal-error" id="loginMobileError" hidden></p>
        <button type="button" class="btn btn-primary btn-ripple modal-submit" id="loginSendOtpBtn">Send OTP</button>
        <p class="modal-switch"><button type="button" class="link-btn" id="loginUseEmailBtn">Use email address instead</button></p>
        <p class="modal-switch">New to Hearth? <button type="button" class="link-btn" id="switchToSignupBtn">Sign up</button></p>
      </div>

      <div class="modal-screen screen-off-right" data-screen="login-waiting" inert aria-hidden="true">
        <div class="modal-waiting">
          <span class="modal-spinner" aria-hidden="true"></span>
          <p class="modal-waiting-label" id="loginWaitingLabel">Just a moment…</p>
        </div>
      </div>

      <div class="modal-screen screen-off-right" data-screen="login-otp" inert aria-hidden="true">
        <h2 class="modal-title">Verify your number</h2>
        <p class="modal-sub">Enter the 6-digit code sent to <strong id="loginOtpMobileDisplay"></strong> ·
          <button type="button" class="link-btn" id="loginChangeMobileBtn">Change</button>
        </p>
        <p class="modal-hint" id="loginOtpDemoHint" hidden></p>
        <div class="otp-boxes">
          <input type="text" inputmode="numeric" maxlength="1" class="otp-box" data-otp-index="0">
          <input type="text" inputmode="numeric" maxlength="1" class="otp-box" data-otp-index="1">
          <input type="text" inputmode="numeric" maxlength="1" class="otp-box" data-otp-index="2">
          <input type="text" inputmode="numeric" maxlength="1" class="otp-box" data-otp-index="3">
          <input type="text" inputmode="numeric" maxlength="1" class="otp-box" data-otp-index="4">
          <input type="text" inputmode="numeric" maxlength="1" class="otp-box" data-otp-index="5">
        </div>
        <p class="modal-error" id="loginOtpError" hidden></p>
        <button type="button" class="btn btn-primary btn-ripple modal-submit" id="loginVerifyOtpBtn">Verify OTP</button>
        <p class="modal-resend">Didn't get it? <button type="button" class="link-btn" id="loginResendOtpBtn" disabled>Resend in <span id="loginResendTimer">30</span>s</button></p>
      </div>

      <div class="modal-screen screen-off-right" data-screen="login-not-found" inert aria-hidden="true">
        <div class="modal-notfound-icon" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 15l6 6M15 15l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <h2 class="modal-title">No account found</h2>
        <p class="modal-sub">We verified your number, but couldn't find a Hearth account for it yet.</p>
        <button type="button" class="btn btn-primary btn-ripple modal-submit" id="switchToSignupFromNotFoundBtn">Sign up instead</button>
        <p class="modal-resend"><button type="button" class="link-btn" id="loginTryAnotherNumberBtn">Try another number</button></p>
      </div>

      <div class="modal-screen screen-off-right" data-screen="login-success" inert aria-hidden="true">
        <div class="modal-success-icon" aria-hidden="true">&check;</div>
        <h2 class="modal-title">You're logged in!</h2>
        <p class="modal-sub" id="loginSuccessMessage">Good to see you again.</p>
      </div>

    </div>
  </div>
</div>`;

    document.body.insertAdjacentHTML('beforeend', markup);
}

/* =========================================================================
 SESSION / AUTH STATE
 A lightweight, localStorage-backed stand-in for a real session/database.
 "Logging out" clears the active session flag but keeps the underlying
 user/address records in storage, so logging back in with the same
 mobile number (see the login flow above) restores the same account
 rather than losing it.
 ========================================================================= */

const HEARTH_STORAGE_KEYS = {
    user: 'hearth_user',
    address: 'hearth_address', // legacy single-address key, migrated on first read
    addresses: 'hearth_addresses',
    session: 'hearth_logged_in',
    expiry: 'hearth_expiry',
    cart: 'hearth_cart',
    postSignupRedirect: 'hearth_post_signup_redirect',
    favouritePros: 'hearth_favourite_pros',
    wishlist: 'hearth_wishlist'
};

function safeStorageGet(key) {
    try {
        return localStorage.getItem(key);
    } catch (err) {
        return null; // storage unavailable (private mode, sandboxed preview, etc.)
    }
}
function safeStorageSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (err) {
        console.warn('[Hearth] Could not persist to localStorage (safe to ignore):', err);
    }
}
function safeStorageRemove(key) {
    try {
        localStorage.removeItem(key);
    } catch (err) {
        /* no-op */
    }
}

async function isLoggedIn() {
    // Make call to to verify the cookie.
    const expiresOn = safeStorageGet(HEARTH_STORAGE_KEYS.expiry);
    if (! expiresOn) {
        return false;
    }
    // alert('Current data: ' + new Date(Date.now()).toISOString() + '. Expiry: ' + new Date(Number(expiresOn)).toISOString());
    if (Date.now() > Number(expiresOn)) {
        // alert('User session expired ...');
        postLogout();
        return false;
    }
    return true;
}
function getCurrentUser() {
    const raw = safeStorageGet(HEARTH_STORAGE_KEYS.user);
    if (! raw) {
        return null;
    }
    try {
        return JSON.parse(raw);
    } catch (err) {
        return null;
    }
}
function removeCurrentUser() {
    safeStorageRemove(HEARTH_STORAGE_KEYS.user);
    safeStorageRemove(HEARTH_STORAGE_KEYS.addresses);
    safeStorageRemove(HEARTH_STORAGE_KEYS.cart);
}
function saveCurrentUser(user) {
    safeStorageSet(HEARTH_STORAGE_KEYS.user, JSON.stringify(user));
}
function setLoggedIn(expiresOn) {
    safeStorageSet(HEARTH_STORAGE_KEYS.expiry, expiresOn);
    // if (flag) {
    //     safeStorageSet(HEARTH_STORAGE_KEYS.session, 'true');
    // }
    // else {
    //     safeStorageRemove(HEARTH_STORAGE_KEYS.session);
    // }
}
/* ---- saved addresses (a person can have several: Home, Work, etc.) -----
 getStoredAddress()/saveStoredAddress() are kept as thin wrappers around
 "the first saved address" so existing callers (become-professional.js's
 quick-fill, for instance) keep working unchanged. -------------------- */
async function getAddresses() {
    const raw = safeStorageGet(HEARTH_STORAGE_KEYS.addresses);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch (err) { /* fall through to migration */
        }
    }
    else {
        // Query the backend to fetch address list.
        let res = await HearthAPI.viewAddresses();
        if (res.success) {
            if (res.result.items.length === 0) {
                return res.result.items;
            }
            else if (Array.isArray(res.result.items)) {
                safeStorageSet(HEARTH_STORAGE_KEYS.addresses, JSON.stringify(res.result.items));
                return res.result.items;
            }
        }
        // alert(JSON.stringify(res));
        throw new Error('Unable to fetch address. ' + res.message);
    }

    // Migrate a legacy single-address record into the new list, once.
    const legacyRaw = safeStorageGet(HEARTH_STORAGE_KEYS.address);
    if (legacyRaw) {
        try {
            const legacy = JSON.parse(legacyRaw);
            if (legacy && legacy.line1) {
                const migrated = [{id: legacy.id || `addr-${Date.now()}`, label: 'Home', ...legacy}];
                saveAddresses(migrated);
                return migrated;
            }
        } catch (err) { /* no-op */
        }
    }
    return [];
}
function saveAddresses(list) {
    safeStorageSet(HEARTH_STORAGE_KEYS.addresses, JSON.stringify(list));
}
async function getAddressById(id) {
    let list = await getAddresses();
    return list.find(a => a.addressId === id) || null;
}
async function addAddress(address) {
    const list = await getAddresses();
    const withId = {id: `addr-${Date.now()}`, label: address.label || 'Home', ...address};
    list.push(withId);
    saveAddresses(list);
    return withId;
}
async function updateAddressById(id, updates) {
    const list = await getAddresses();
    const idx = list.findIndex(a => a.addressIdd === id);
    if (idx === -1)
        return null;
    list[idx] = {...list[idx], ...updates, id};
    saveAddresses(list);
    return list[idx];
}
async function deleteAddressById(id) {
    let list = await getAddresses();
    saveAddresses(list.filter(a => a.addressIdd !== id));
}
function formatAddressSummary(address) {
    if (!address)
        return '';
    return [address.addressLine1, address.city].filter(Boolean).join(', ');
}

/** Back-compat wrappers: "the" saved address is just the first one. */
async function getStoredAddress() {
    const list = await getAddresses();
    return list.length ? list[0] : null;
}
async function saveStoredAddress(address) {
    const list = await getAddresses();
    if (list.length && list[0].id === address.addressId) {
        list[0] = address;
    } else if (list.length === 0) {
        list.push({id: address.addressId || `addr-${Date.now()}`, label: 'Home', ...address});
    }
    saveAddresses(list);
}

/* ---- cart persistence (shared between categories.html and checkout.html) --
 Stored as a flat array of line items, each self-contained (denormalized)
 so checkout.html doesn't need to re-cross-reference CATEGORY_DATA:
 { skuId, name, price, currency, categoryName, subCategoryName, duration,
 qty, date, timeSlotId, timeSlotLabel }
 ------------------------------------------------------------------------ */
function getCart() {
    const raw = safeStorageGet(HEARTH_STORAGE_KEYS.cart);
    
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (err) {
        return [];
    }
}
function saveCart(cartItems) {
    safeStorageSet(HEARTH_STORAGE_KEYS.cart, JSON.stringify(cartItems));
}
function clearCart() {
    safeStorageRemove(HEARTH_STORAGE_KEYS.cart);
}
function getCartTotal(cartItems) {
    return cartItems.reduce((sum, item) => sum + item.qty * item.price, 0);
}
function getCartCount(cartItems) {
    return cartItems.reduce((sum, item) => sum + item.qty, 0);
}

/* ---- favourite professionals + wishlisted services -----------------------
 Both are simple, self-contained lists a person can build up while
 browsing (home page pro cards, categories page service cards) and later
 review from the Favourites & Wishlist account page. ------------------- */
function getFavouriteProfessionals() {
    const raw = safeStorageGet(HEARTH_STORAGE_KEYS.favouritePros);
    if (!raw)
        return [];
    try {
        const p = JSON.parse(raw);
        return Array.isArray(p) ? p : [];
    } catch (err) {
        return [];
    }
}
function saveFavouriteProfessionals(list) {
    safeStorageSet(HEARTH_STORAGE_KEYS.favouritePros, JSON.stringify(list));
}
/** Adds/removes a professional from favourites. Returns true if now favourited. */
function toggleFavouriteProfessional(pro) {
    let list = getFavouriteProfessionals();
    const exists = list.some(p => p.id === pro.id);
    list = exists ? list.filter(p => p.id !== pro.id) : [...list, pro];
    saveFavouriteProfessionals(list);
    return !exists;
}

function getWishlist() {
    const raw = safeStorageGet(HEARTH_STORAGE_KEYS.wishlist);
    if (!raw)
        return [];
    try {
        const p = JSON.parse(raw);
        return Array.isArray(p) ? p : [];
    } catch (err) {
        return [];
    }
}
function saveWishlist(list) {
    safeStorageSet(HEARTH_STORAGE_KEYS.wishlist, JSON.stringify(list));
}
/** Adds/removes a service from the wishlist. Returns true if now wishlisted. */
function toggleWishlistItem(item) {
    let list = getWishlist();
    const exists = list.some(i => i.skuId === item.skuId);
    list = exists ? list.filter(i => i.skuId !== item.skuId) : [...list, item];
    saveWishlist(list);
    return !exists;
}

/** Wires up the static professional cards on the home page. Categories.html's
 *  service-card wishlist buttons are wired separately in categories.js since
 *  those cards are re-rendered dynamically, not present at page load. */
function initFavouriteToggles() {
    document.querySelectorAll('[data-favourite-toggle]').forEach(btn => {
        const card = btn.closest('[data-pro-id]');
        if (!card)
            return;
        const pro = {
            id: card.dataset.proId,
            name: card.dataset.proName,
            role: card.dataset.proRole,
            price: card.dataset.proPrice,
            rating: card.dataset.proRating,
            photo: card.dataset.proPhoto || '',
        };
        const isFav = getFavouriteProfessionals().some(p => p.id === pro.id);
        btn.setAttribute('aria-pressed', String(isFav));

        btn.addEventListener('click', () => {
            const nowFav = toggleFavouriteProfessional(pro);
            btn.setAttribute('aria-pressed', String(nowFav));
        });
    });
}

/* =========================================================================
 CONFIRMATION DIALOG
 A small, generic "are you sure?" dialog any page can call — first use
 is cancelling a booking, but it's intentionally not booking-specific.
 ========================================================================= */
let _confirmDialogCallback = null;

function injectConfirmDialogMarkup() {
    if (document.getElementById('confirmDialogOverlay'))
        return;

    const markup = `
<div class="confirm-dialog-overlay" id="confirmDialogOverlay" aria-hidden="true">
  <div class="confirm-dialog-box" role="alertdialog" aria-modal="true" aria-labelledby="confirmDialogTitle" aria-describedby="confirmDialogMessage">
    <h3 class="confirm-dialog-title" id="confirmDialogTitle">Are you sure?</h3>
    <p class="confirm-dialog-message" id="confirmDialogMessage"></p>
    <div class="confirm-dialog-actions">
      <button type="button" class="btn btn-ghost btn-sm" id="confirmDialogCancelBtn">Cancel</button>
      <button type="button" class="btn btn-sm btn-ripple confirm-dialog-danger-btn" id="confirmDialogConfirmBtn">Confirm</button>
    </div>
  </div>
</div>`;

    document.body.insertAdjacentHTML('beforeend', markup);

    const overlay = document.getElementById('confirmDialogOverlay');
    const cancelBtn = document.getElementById('confirmDialogCancelBtn');
    const confirmBtn = document.getElementById('confirmDialogConfirmBtn');

    function close() {
        overlay.classList.remove('is-open');
        overlay.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        _confirmDialogCallback = null;
    }

    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay)
            close();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('is-open'))
            close();
    });
    confirmBtn.addEventListener('click', () => {
        const cb = _confirmDialogCallback;
        close();
        if (cb)
            cb();
    });

    window.__openConfirmDialogInternal = function (options) {
        document.getElementById('confirmDialogTitle').textContent = options.title || 'Are you sure?';
        document.getElementById('confirmDialogMessage').textContent = options.message || '';
        confirmBtn.textContent = options.confirmLabel || 'Confirm';
        cancelBtn.textContent = options.cancelLabel || 'Cancel';
        confirmBtn.classList.toggle('confirm-dialog-danger-btn', options.danger !== false);
        _confirmDialogCallback = options.onConfirm;

        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    };
}

/**
 * @param {{title?: string, message?: string, confirmLabel?: string, cancelLabel?: string, danger?: boolean, onConfirm: () => void}} options
 */
function showConfirmDialog(options) {
    injectConfirmDialogMarkup();
    initRipple();
    window.__openConfirmDialogInternal(options);
}

/** Called once at signup success: persists the session and swaps the header. */
function completeLogin(user, expiresOn) {
    // alert('Expires On: ' + expiresOn);
    // alert('Current Date: ' + Date.now());
    
    saveCurrentUser(user);
    setLoggedIn(expiresOn);
    renderUserChip(user);

    // If the sign-up flow was triggered mid-checkout ("Continue" on the cart
    // bar), resume that journey now instead of leaving the user on whatever
    // page they signed up from.
    const redirectTo = safeStorageGet(HEARTH_STORAGE_KEYS.postSignupRedirect);
    if (redirectTo) {
        safeStorageRemove(HEARTH_STORAGE_KEYS.postSignupRedirect);
        setTimeout(() => {
            window.location.href = redirectTo;
        }, 1900);
    }
}

/** Called on every page load to restore the header if a session exists. */
function initAuthState() {
    if (! isLoggedIn()) {
        // alert('JS:initAuthState - User is not logged in');
        return;
    }
    const user = getCurrentUser();
    if (! user) {
        // alert('JS:initAuthState - User is not logged in');
        return;
    }
    // alert('JS:initAuthState - User is already logged in');
    renderUserChip(user);
}

/* ---- header state: swap Log In / Sign Up for a chip + dropdown menu ---- */
function renderUserChip(user) {
    document.querySelectorAll('#navActions').forEach(navActions => {
        const fullName = (user.fullName || 'Friend').trim();
        const firstInitial = fullName.charAt(0).toUpperCase() || 'F';
        const firstName = fullName.split(' ')[0];
        const isProfessional = String(user.role || '').toUpperCase() === 'PROFESSIONAL';

        // A professional account doesn't browse/book services, so its menu
        // is just "My Dashboard" (the left-nav professional portal, which
        // itself covers profile, bookings, etc.) plus "Log out" below.
        const accountMenuLinks = isProfessional ? `
          <a href="professional-portal" role="menuitem" class="user-dropdown-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" stroke-width="2"/><rect x="14" y="3" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="2"/><rect x="14" y="12" width="7" height="9" rx="1.5" stroke="currentColor" stroke-width="2"/><rect x="3" y="16" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="2"/></svg>
            My Dashboard
          </a>
        ` : `
          <a href="profile" role="menuitem" class="user-dropdown-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            View Profile
          </a>
          <a href="bookings" role="menuitem" class="user-dropdown-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            My Bookings
          </a>
        `;

        navActions.innerHTML = `
      <div class="user-menu">
        <button type="button" class="user-chip" id="userChipBtn" aria-haspopup="true" aria-expanded="false">
          <span class="user-chip-avatar" aria-hidden="true">${firstInitial}</span>
          <span class="user-chip-name">${escapeHtmlGlobal(firstName)}</span>
          <svg class="user-chip-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="user-dropdown" id="userDropdown" role="menu" aria-label="Account menu" hidden>
          ${accountMenuLinks}
          <button type="button" role="menuitem" class="user-dropdown-item user-dropdown-item-danger" id="logoutBtn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Log out
          </button>
        </div>
      </div>
    `;

        const chipBtn = navActions.querySelector('#userChipBtn');
        const dropdown = navActions.querySelector('#userDropdown');
        const logoutBtn = navActions.querySelector('#logoutBtn');

        const closeDropdown = () => {
            dropdown.hidden = true;
            chipBtn.setAttribute('aria-expanded', 'false');
        };
        const openDropdown = () => {
            dropdown.hidden = false;
            chipBtn.setAttribute('aria-expanded', 'true');
        };

        chipBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (dropdown.hidden)
                openDropdown();
            else
                closeDropdown();
        });
        document.addEventListener('click', (e) => {
            if (!navActions.contains(e.target))
                closeDropdown();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape')
                closeDropdown();
        });

        logoutBtn.addEventListener('click', async () => {
            const res = await HearthAPI.logout();
        
            if (res.success) {
                // setLoggedIn(false);
                safeStorageRemove(HEARTH_STORAGE_KEYS.expiry);
                removeCurrentUser();
                closeDropdown();
                restoreLoggedOutHeader(navActions);
                
                // Go to home screen
                window.location.replace("/"); 
            }
        });
    });
}

function postLogout() {
    // setLoggedIn(false);
    safeStorageRemove(HEARTH_STORAGE_KEYS.expiry);
    removeCurrentUser();
    // closeDropdown();
}

/** Rebuilds the default Log In / Sign Up buttons after logout. */
function restoreLoggedOutHeader(navActions) {
    navActions.innerHTML = `
    <a href="#login" class="btn btn-ghost" id="loginBtn">Log In</a>
    <a href="#signup" class="btn btn-primary btn-ripple" id="signupBtn">Sign Up</a>
  `;
    initRipple();
}

function escapeHtmlGlobal(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/* ---- inject modal markup once per page --------------------------------- */
function injectSignupModalMarkup() {
    if (document.getElementById('signupOverlay'))
        return;

    const markup = `
<div class="modal-overlay" id="signupOverlay" aria-hidden="true">
  <div class="modal-phone" id="signupModal" role="dialog" aria-modal="true" aria-labelledby="signupModalTitle">
    <button type="button" class="modal-close" id="signupCloseBtn" aria-label="Close sign up">&times;</button>

    <div class="modal-steps-indicator">
      <span class="step-dot is-active" data-step="1"></span>
      <span class="step-dot" data-step="2"></span>
      <span class="step-dot" data-step="3"></span>
    </div>

    <div class="modal-screens">

      <div class="modal-screen screen-current" data-screen="mobile">
        <h2 id="signupModalTitle" class="modal-title">Let's get you started</h2>
        <p class="modal-sub" id="signupIdentitySub">Enter your mobile number and we'll send a one-time password to verify it's you.</p>
        <div class="otp-mobile-field" id="signupMobileField">
          <span class="otp-country-code">+91</span>
          <input type="tel" inputmode="numeric" maxlength="10" id="signupMobile" placeholder="98765 43210" autocomplete="tel">
        </div>
        <div class="otp-mobile-field" id="signupEmailField" hidden>
          <input type="email" id="signupEmailIdentity" placeholder="[REDACTED_EMAIL_ADDRESS_11]" autocomplete="email">
        </div>
        <p class="modal-error" id="mobileError" hidden></p>
        <button type="button" class="btn btn-primary btn-ripple modal-submit" id="sendOtpBtn">Send OTP</button>
        <p class="modal-switch"><button type="button" class="link-btn" id="signupUseEmailBtn">Use email address instead</button></p>
        <p class="modal-switch">Already have an account? <button type="button" class="link-btn" id="switchToLoginBtn">Log in</button></p>
      </div>

      <div class="modal-screen screen-off-right" data-screen="waiting" inert aria-hidden="true">
        <div class="modal-waiting">
          <span class="modal-spinner" aria-hidden="true"></span>
          <p class="modal-waiting-label" id="waitingLabel">Just a moment…</p>
        </div>
      </div>

      <div class="modal-screen screen-off-right" data-screen="otp" inert aria-hidden="true">
        <h2 class="modal-title">Verify your number</h2>
        <p class="modal-sub">Enter the 6-digit code sent to <strong id="otpMobileDisplay"></strong> ·
          <button type="button" class="link-btn" id="changeMobileBtn">Change</button>
        </p>
        <p class="modal-hint" id="otpDemoHint" hidden></p>
        <div class="otp-boxes" id="otpBoxes">
          <input type="text" inputmode="numeric" maxlength="1" class="otp-box" data-otp-index="0">
          <input type="text" inputmode="numeric" maxlength="1" class="otp-box" data-otp-index="1">
          <input type="text" inputmode="numeric" maxlength="1" class="otp-box" data-otp-index="2">
          <input type="text" inputmode="numeric" maxlength="1" class="otp-box" data-otp-index="3">
          <input type="text" inputmode="numeric" maxlength="1" class="otp-box" data-otp-index="4">
          <input type="text" inputmode="numeric" maxlength="1" class="otp-box" data-otp-index="5">
        </div>
        <p class="modal-error" id="otpError" hidden></p>
        <button type="button" class="btn btn-primary btn-ripple modal-submit" id="verifyOtpBtn">Verify OTP</button>
        <p class="modal-resend">Didn't get it? <button type="button" class="link-btn" id="resendOtpBtn" disabled>Resend in <span id="resendTimer">30</span>s</button></p>
      </div>

      <div class="modal-screen screen-off-right" data-screen="profile" inert aria-hidden="true">
        <h2 class="modal-title">Complete your profile</h2>
        <p class="modal-sub">Just a couple of details and you're in.</p>
        <div class="form-field">
          <label for="signupName">Full name</label>
          <input type="text" id="signupName" placeholder="Your name" autocomplete="name">
        </div>
        <div class="form-field" id="signupEmailFormField">
          <label for="signupEmail">Email address</label>
          <input type="email" id="signupEmail" placeholder="you@email.com" autocomplete="email">
        </div>
        <div class="form-field" id="signupMobileFormField" hidden>
          <label for="signupMobileProfile">Mobile number</label>
          <input type="tel" inputmode="numeric" maxlength="10" id="signupMobileProfile" placeholder="98765 43210" autocomplete="tel">
        </div>
        <p class="modal-error" id="profileError" hidden></p>
        <button type="button" class="btn btn-primary btn-ripple modal-submit" id="completeRegBtn">Complete Registration</button>
      </div>

      <div class="modal-screen screen-off-right" data-screen="success" inert aria-hidden="true">
        <div class="modal-success-icon" aria-hidden="true">&check;</div>
        <h2 class="modal-title">Welcome to Hearth!</h2>
        <p class="modal-sub" id="successMessage">You're all set to browse services.</p>
      </div>

    </div>
  </div>
</div>`;

    document.body.insertAdjacentHTML('beforeend', markup);
}
