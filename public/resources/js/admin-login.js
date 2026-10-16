/* =========================================================================
 HEARTH — admin-login.js
 Drives admin-login.html ONLY: the "already logged in? skip to dashboard"
 redirect and the login form submit handler. Loaded only on the login page
 — admin-dashboard.html must NOT include this file (it previously did, for
 the session helpers now in admin-session.js, and that caused the redirect
 check below to fire on the dashboard page too — redirecting it to itself,
 forever). Relies on admin-session.js (adminIsLoggedIn/saveAdminSession)
 being loaded first.
 ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
    // Already signed in on this browser — skip straight to the dashboard.
    if (adminIsLoggedIn()) {
        window.location.replace('admin-dashboard');
        return;
    }

    const form = document.getElementById('adminLoginForm');
    const errorEl = document.getElementById('adminLoginError');
    const submitBtn = document.getElementById('adminLoginSubmit');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.hidden = true;

        const userid = document.getElementById('adminLoginUserid').value.trim();
        const password = document.getElementById('adminLoginPassword').value;

        if (!userid || !password) {
            errorEl.textContent = 'Enter both a username and password.';
            errorEl.hidden = false;
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Logging in…';

        const res = await HearthAPI.adminLogin(userid, password);

        if (res.success) {
            saveAdminSession(res.result);
            window.location.replace('admin-dashboard');
            return;
        }

        submitBtn.disabled = false;
        submitBtn.textContent = 'Log In';
        errorEl.textContent = res.message || 'Invalid username or password.';
        errorEl.hidden = false;
    });
});
