const express = require('express');

const otpHandler = require('./otp');
const tokenMgr = require('./../auth/token_mgr');
const JwtUtil = require('./../auth/jwt');
const CookieUtil = require('./../util/cookie_util');
const Utility = require('./../util/utility');
const { getLogger } = require('../util/logger');
const httpClient = require('./../util/http_client');

const router = express.Router();
const log = getLogger(__filename);

async function requestOtp(req, res) {
    const input = req.body.input;
    const op = req.body.op;
    
    try {
        // otp {
        //   input,
        //   otp,
        //   ttlMin
        //   purpose
        //   createdAt
        //   jti
        // }
        const ret = await otpHandler.request(op, input);
        
        if (ret.status === 1) {
            // Otp has just been generated. Therefore generate the token.
            let token = JwtUtil.otpToken(input, ret.otp.jti);
            let cookieOpts = CookieUtil.prepare(ret.otp.ttlMin);
            
            res.status(200)
                .set('Accept', 'application/json')
                .cookie(CookieUtil.STD_COOKIE, token, cookieOpts)
                .send({message: 'Otp sent successfully'});
        }
        else {
            // res.status = 0
            // Otp has already been generated and sent
            res.status(200)
                .json({message: 'Otp has already been sent. Please wait for 5 minute before trying again'});
        }
    }
    catch (err) {
        res.status(500)
                .json({message: err.message});
    }
}

async function verifyOtp(req, res) {
    const op = req.body.op;
    const input = req.body.input;
    const type = Utility.getIdentityType(input);
    const otp = Number(req.body.otp);
    const user = req.user;
    
    try {
        const result = await otpHandler.verify(input, otp, user.jti);
        
        switch (result.state) {
            case 'VERIFIED':
                // Otp has been successfully verified. Next steps:
                // 1. Query the backend server to check if any user is associated with this phone/email
                // 
                // 1a. If found, generate the login token.
                // 1b. If not, send appropriate message to UI so that it can forward the registration screen.
                let response = await queryUser(input, type);

                if (response.status === 200) {
                    if (response.data.total === 1) {
                        const item = response.data.items[0];
                        
                        if (log.isInfoEnabled()) {
                            log.info('Successfully retrieved user %s against %s. Generating login token ...', item.fullName, input);
                        }
                        
                        let token = JwtUtil.loginToken(item.externalId, item.fullName, item.role.toLowerCase());
                        let ttlMin = process.env.TOKEN_TTL_MIN || 600;
                        let cookieOpts = CookieUtil.prepare(ttlMin);

                        return res.status(200)
                                .setHeader('expiresOn', (Date.now() + cookieOpts.maxAge))
                                .cookie(CookieUtil.STD_COOKIE, token, cookieOpts)
                                .json(item);
                    }
                    else {
                        // No associated user found.
                        // Clear the previous cookie.
                        log.warn('No user details found against %s. Forwarding to sign-up screen ...', input);
                        let cookieOpts = CookieUtil.COOKIE_OPTS;

                        res.clearCookie(CookieUtil.STD_COOKIE, cookieOpts);
                        return res.status(404)
                                .json({message: 'No user details found'});
                    }
                }
                else {
                    throw new Error('Error fetching user details for %s', input);
                }

            case 'INVALID':
                return res.status(400)
                        .json({message: 'Incorrect OTP. Please try again'});

            case 'EXPIRED':
                return res.status(400)
                        .json({message: 'OTP is expired. Go back to previous screen and try generating the OTP again'});

            default:
                log.error('Unexpected OTP verification status: %s', result.status);
                return res.status(500)
                        .json({message: 'There was a problem verifying the otp. Please try later'});
        }
    }
    catch (err) {
        log.error('Error in verifying otp for ' + input, err);
        res.clearCookie(CookieUtil.STD_COOKIE, CookieUtil.COOKIE_OPTS);
        res.status(500)
                .json({message: err.message});
    }
}

async function queryUser(input, type) {
    // Obtain the scope based short-lived token.
    // This call will get it from cache. If not token is present in cache, make call to token service end point.
    const mtls_jwt = await tokenMgr.getToken('user:create|user:query');
    if (log.isDebugEnabled()) {
        log.debug('Scope token is available. Proceed for query ...');
    }

    // Check if the mobile number or email address is already registered.
    const params = {};
    if (type === 'mobile') {
        params.phone1 = input;
    }
    else {
        params.email = input;
    }

    const response = await httpClient.get(
        '/users',
        {
            headers: {
                Authorization: `Bearer ${mtls_jwt}`
            },
            params: params
        }
    );
    return response;
}

/**
 * POST /login/admin
 * Body (JSON, from the browser): { userid, password }
 *
 * Admin login is username/password, not OTP — there's no mobile number to
 * verify. The credential check itself happens on the Vert.x side
 * (POST /api/v1/login, application/x-www-form-urlencoded), same as every
 * other piece of identity data this server relies on the backend for. Node
 * never checks the password itself and never sees it again after this call.
 *
 * Once Vert.x confirms the credentials, this still mints its *own* _fks
 * JWT locally (JwtUtil.loginToken), exactly like the OTP flow does after
 * queryUser() succeeds — a token signed by Vert.x couldn't be verified by
 * this server's authenticate() middleware anyway, since that only trusts
 * this server's own keypair (see keystore.js). The admin's identity is
 * carried forward as this local token's `priv: "admin"` claim, and that
 * same token is what gets forwarded as the bearer token on every later
 * admin API call, so the backend can also honor `priv` for its own
 * authorization if it chooses to.
 *
 * ASSUMPTION TO CONFIRM: the exact shape of Vert.x's 200 response from
 * POST /api/v1/login isn't nailed down yet. This reads a handful of likely
 * field names (externalId/userId/id, fullName/name/userid) defensively —
 * once the real response is known, trim this down to the actual field
 * names instead of guessing across several.
 */
async function adminLogin(req, res) {
    const userid = req.body && req.body.userid;
    const password = req.body && req.body.password;

    if (! userid || ! password) {
        return res.status(400)
                .set('Content-Type', 'application/json')
                .json({message: 'Username and password are required'});
    }

    try {
        const form = new URLSearchParams({userid, password});
        const grant = new URLSearchParams({
            grant_type: 'client_credentials'
            // scope: scope
        });

        const response = await httpClient.post(
            '/mgmt/login'
            , grant
            , {
                headers: {
                    'Authorization': 'Basic ' + Utility.encode(req.body.userid, req.body.password),
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        if (response.status === 200) {
            const data = response.data || {};
            
            return res.status(200)
                .cookie(CookieUtil.STD_COOKIE, data.access_token,
                    CookieUtil.prepare(parseInt(data.expires_in) / 60))
                .json({success: true});
        }
        else {
            log.error('Admin login rejected. Status code: %d', response.status);
            return res.status(response.status)
                    .json({message: (response.data && response.data.message) || 'Invalid username or password'});
        }
    }
    catch (err) {
        log.error('Error in admin login for user ' + userid, err);

        if (err.response) {
            // Vert.x rejected the credentials outright (401/403) — don't leak backend
            // error detail to the login screen beyond a generic message.
            return res.status(err.response.status)
                    .json({message: 'Invalid username or password'});
        }
        return res.status(503)
                .json({message: 'Service temporarily unavailable'});
    }
}

router.post('/otp/request', requestOtp);
router.post('/otp/verify', verifyOtp);
router.post('/admin', adminLogin);

module.exports = router;
