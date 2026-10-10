/* =========================================================================
 HEARTH — api.js
 All network / AJAX calls live in this file, kept separate from script.js
 which only handles UI behaviour. Exposed as the HearthAPI namespace so
 script.js (loaded after this file) can call HearthAPI.requestOtp(), etc.
 ========================================================================= */

const HearthAPI = (function () {
    const DEMO_MODE = false;
    const BASE_URL = '/gateway/v1';
    const LOGGING = true;

    /**
     * Sends an HTTP request to the API and returns a normalized response.
     *
     * The request is sent to the URL constructed from {@code BASE_URL} and the
     * provided URI. Cookies are included with the request and, when supplied,
     * the payload is serialized as JSON.
     *
     * HTTP status codes 200, 201, 202, and 204 are treated as successful
     * responses. API errors, authentication expiration, and unexpected request
     * failures are returned as normalized error objects rather than being thrown
     * to the caller.
     *
     * @async
     * @param {string} uri - API endpoint URI relative to {@code BASE_URL}.
     * @param {string} method - HTTP method to use, such as GET, POST, PUT, or DELETE.
     * @param {Object} [payload] - Optional request payload. The payload is serialized
     *                             to JSON before being sent.
     *
     * @returns {Promise<{
     *     success: boolean,
     *     result?: Object|Array,
     *     message?: string,
     *     authExpired?: boolean
     * }>} A promise that resolves with a normalized API response.
     *
     * @example
     * const response = await invoke('/users/me', 'GET');
     *
     * if (response.success) {
     *     console.log(response.result);
     * } else {
     *     console.error(response.message);
     * }
     *
     * @example
     * const response = await invoke('/users/me', 'PUT', {
     *     firstName: 'John',
     *     lastName: 'Doe'
     * });
     */
    async function invoke(uri, method, payload) {
        let url = BASE_URL + (uri.charAt(0) !== '/' ? '/' + uri : uri);

        let config = {
            method: method,
            credentials: 'include',
            headers: {'Content-Type': 'application/json'}
        };
        if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
            if (payload) {
                config.body = payload ? JSON.stringify(payload) : '';
            }
        }

        try {
            if (LOGGING) {
                console.log(
                        'Calling ' + method + ' ' + url +
                        '. Payload: ' + (payload ? payload : 'N/A')
                    );
            }

            // Call the node backend.
            const res = await fetch(url, config);
            
            if (res.status === 403) {
                let txt = await res.text();
                if (txt === '403 Forbidden') {
                    return {
                        success: false,
                        message: 'Please refresh the page and try again. If the problem continues, contact support.'
                    };
                }
            }
            let json = {message: 'Operation executed successfully'};    // A fixed message for http code 204
            
            if (res.status !== 204) {
                json = await res.json();
            }
            
            if (res.status === 200 ||
                    res.status === 201 ||
                    res.status === 202 ||
                    res.status === 204) {

                return {
                    success: true
                    , code: res.status
                    , headers: res.headers
                    , result: json
                };
            }
            else {
                if (res.status === 401 && res.message === 'Cookie expired') {
                    return {
                        success: false
                        , code: res.status
                        , authExpired: true
                        , message: json.message
                    };
                }
                else if (res.status >= 500) {
                    // "We're sorry, our system encountered an unexpected problem.
                    // We've been notified and are working to fix it. Please try again later."
                    return {
                        success: false
                        , code: res.status
                        , message: 'Unable to complete your request right now. Please try again later.'
                    };
                }
                return {success: false, code: res.status, message: json.message};
            }
        }
        catch (e) {
            alert(e.message);
            console.error(e.message, e);
            return {success: false, message: e.message};
        }
    }

    /**
     * POST /api/v1/signup/otp/dispatch
     * Payload: { mobile: string }
     * Triggers OTP generation + delivery to the customer's mobile device.
     * @returns {Promise<{success: boolean, message?: string, demoOtp?: string}>}
     */
    async function requestOtp(op, mobile) {
        const payload = {
            op: op,
            input: mobile
        };
        return await invoke(op + '/otp/request', 'POST', payload);
    }

    /**
     * POST /api/v1/signup/otp/verify
     * Payload: { mobile: string, otp: string }
     * @returns {Promise<{success: boolean, message?: string, token?: string}>}
     */
    async function verifyOtp(op, mobile, otp) {
        const payload = {
            op: op,
            input: mobile,
            otp: otp
        };
        let result = await invoke(op + '/otp/verify', 'POST', payload);
        
        if (result.code === 200) {
            if (op === 'signup') {
                return result;
            } else {
                // Post successful login, the response object will have the user details.
                result.expiresOn = result.headers.get('expiresOn');
                return result;
            }
        }
        return result;
    }

    /**
     * POST /api/v1/logout
     * Payload: { mobile: string, name: string, email: string }
     * @returns {Promise<{success: boolean, message?: string, user?: object}>}
     */
    async function logout() {
        return await invoke('/logout', 'POST');
    }

    /**
     * POST /api/v1/registration
     * Payload: { mobile: string, name: string, email: string }
     * @returns {Promise<{success: boolean, message?: string, user?: object}>}
     */
    async function createUser(payload) {
        let result = await invoke('/users', 'POST', payload);
        if (result.code === 200) {
            result.expiresOn = result.headers.get('expiresOn');
        }
        return result;
    }

    /**
     * Updates the currently authenticated user's information.
     *
     * @async
     * @param {Object} payload - User information to update.
     * @returns {Promise<Object>} A promise that resolves with the updated user data.
     */
    async function updateUser(id, payload) {
        return await invoke('/users/me', 'PUT', payload);
    }

    /**
     * Retrieves information for the currently authenticated user.
     *
     * @async
     * @returns {Promise<Object>} A promise that resolves with the user's information.
     */
    async function viewUser() {
        return await invoke('/users/me', 'GET');
    }

    /**
     * Creates a new address for the currently authenticated user.
     * 
     * Standard REST API best practices dictate using them for two entirely different use cases.
     * Choosing between a nested path (/users/me/addresses) and a flat path (/addresses) depends on whether the
     * resource can exist independently and if you are dealing with a collection vs. a specific item.
     * 
     * For resources that have a lifecycle tied to a user (like bookings or addresses), one should use a hybrid approach.
     * Thus all GET and POST API will use the nested approach.
     * And for GET, PUT and DELETE use the flat url.
     * 
     *  1. Why use /users/me/addresses for listing and creating?
     *  When you want to see your addresses or add a new one, the relationship is hierarchical.
     *  
     *  a) Contextual Safety: Calling POST /users/me/addresses tells the backend explicitly to tie this new address 
     *     to the authenticated session user. The frontend doesn't need to pass a userId inside the request body payload.
     *  b) Clarity: It explicitly implies, "Give me the collection of addresses scoped down to me."
     *  
     *  2. Why use /addresses/{addressId} for updates and deletions?
     *  Once an address (or booking, or coupon) is created, it receives its own unique identifier (e.g., addr_12345).
     *  At that point, nesting it under a user becomes redundant and leads to deeply nested URLs.
     *  
     *  a) Avoids Redundant Paths: URLs like PUT /users/me/addresses/123 are unnecessarily long. The backend only needs 
     *     the addressId to update it; it doesn't need the user context in the path to identify the specific record.
     *  b) Separation of Concerns: The backend database query can look up the address directly by its primary key (addressId).
     *    (Security tip: The backend should still verify that the userId from the session cookie owns that addressId before executing the change).
     *
     * @async
     * @param {Object} payload - Address information to create.
     * @returns {Promise<Object>} A promise that resolves with the newly created address.
     */
    async function createAddress(payload) {
        return await invoke('/addresses', 'POST', payload);
    }

    /**
     * Retrieves all addresses associated with the currently authenticated user.
     *
     * @async
     * @returns {Promise<Array<Object>>} A promise that resolves with the user's addresses.
     */
    async function viewAddresses() {
        return await invoke('/addresses', 'GET');
    }

    /**
     * Updates an existing address.
     *
     * @async
     * @param {string|number} id - The unique identifier of the address to update.
     * @param {Object} payload - Address information to update.
     * @returns {Promise<Object>} A promise that resolves with the updated address.
     */
    async function updateAddress(id, payload) {
        return await invoke('/addresses/' + id, 'PUT', payload);
    }

    /**
     * Deletes an existing address.
     *
     * @async
     * @param {string|number} id - The unique identifier of the address to delete.
     * @returns {Promise<*>} A promise that resolves when the address has been deleted.
     */
    async function deleteAddress(id) {
        return await invoke('/addresses/' + id, 'DELETE');
    }

    /**
     * GET /api/v1/provinces
     * Returns every state/province Hearth recognises, for the state → city →
     * locality picker shown before a customer can add an address.
     * @returns {Promise<{success: boolean, message?: string, result?: object}>}
     */
    async function viewProvinces(...params) {
        const searchParams = new URLSearchParams();

        // Loop through parameters two at a time (Key, Value)
        for (let i = 0; i < params.length; i += 2) {
            if (params[i] && params[i + 1] !== undefined) {
                searchParams.append(params[i], params[i + 1]);
            }
        }
        return await invoke('/provinces?' + searchParams.toString(), 'GET');
    }

    /**
     * GET /api/v1/cities?provinceId={provinceId}
     * Returns the cities within the given state that Hearth operates in.
     * @returns {Promise<{success: boolean, message?: string, result?: object}>}
     */
    async function viewCities(...params) {
        const searchParams = new URLSearchParams();

        // Loop through parameters two at a time (Key, Value)
        for (let i = 0; i < params.length; i += 2) {
            if (params[i] && params[i + 1] !== undefined) {
                searchParams.append(params[i], params[i + 1]);
            }
        }
        return await invoke('/cities?' + searchParams.toString(), 'GET');
    }

    /**
     * GET /api/v1/neighbourhoods?cityId={cityId}
     * Returns the localities/neighbourhoods within the given city. Each item
     * is expected to carry a `serviceable` flag so the UI can tell the
     * customer whether Hearth has actually launched there yet.
     * @returns {Promise<{success: boolean, message?: string, result?: object}>}
     */
    async function viewNeighbourhoods(cityId) {
        return invoke('/neighbourhoods?cityId=' + encodeURIComponent(cityId), 'GET');
    }

    /**
     * GET /api/v1/neighbourhoods?pincode={pincode}
     * Quick serviceability check by pincode — the fast path shown before the
     * state → city → locality picker. Returns every neighbourhood matching
     * that pincode (usually one, but a pincode can span more than one
     * locality); each item is expected to carry its parent cityId/cityName
     * and provinceId/provinceName so the picker can be filled in without a
     * further lookup, plus the same `serviceable` flag as viewNeighbourhoods.
     * @returns {Promise<{success: boolean, message?: string, result?: object}>}
     */
    async function checkPincode(pincode) {
        return await invoke('/neighbourhoods?pincode=' + encodeURIComponent(pincode), 'GET');
    }

    /**
     * Retrieves the category hierarchy.
     *
     * @async
     * @returns {Promise<Object>} A promise that resolves with the category hierarchy.
     */
    async function viewCategories() {
        return await invoke('/categories/hierarchy', 'GET');
    }

    /**
     * Retrieves available slots for a specific date and service.
     *
     * @async
     * @param {string} dateKey - The date for which available slots should be retrieved.
     * @param {string|number} serviceId - The unique identifier of the service.
     * @returns {Promise<Array<Object>>} A promise that resolves with the available slots.
     */
    async function viewSlots(dateKey, serviceId) {
        return await invoke('/availabilities/slots?date=' + dateKey + '&serviceId=' + serviceId, 'GET');
    }

    /**
     * POST /api/v1/bookings
     * Payload: { services: [{ name, date, timeSlot, quantity, price, address }], paymentMethod, amount }
     * Note: no `customer` field — the server identifies who's booking from
     * the JWT cookie set at OTP-verify / signup time, not from the request
     * body. This keeps the browser from ever having to (re)send identity
     * details it already proved once.
     * @returns {Promise<{success: boolean, message?: string, booking?: object}>}
     */
    async function createBooking(payload) {
        return await invoke('/bookings', 'POST', payload);
    }

    /**
     * GET /api/v1/bookings
     * Returns every booking (current and past) belonging to the signed-in
     * customer. The server identifies who that is from the JWT cookie, not
     * from a query parameter — `userId` is only still accepted here to keep
     * the demo-mode fallback (which has no server-side session) working.
     * @returns {Promise<{success: boolean, message?: string, bookings?: object[]}>}
     */
    async function getBookings() {
        return await invoke('/bookings?fetchDependency=true', 'GET');
    }

    /**
     * PUT /api/v1/bookings/{id}
     * Cancels an upcoming booking. Payload: { status: 'cancelled' }
     * @returns {Promise<{success: boolean, message?: string, booking?: object}>}
     */
    async function cancelBooking(bookingId) {
        return await invoke('/bookings/' + encodeURIComponent(bookingId), 'DELETE');
    }

    /**
     * POST /api/v1/professionals
     * Payload: { bio, documents: [{nameOnDocument, documentType, documentNumber}],
     *            address: { addressLine1, provinceId, province, cityId, city,
     *                       neighbourhoodId, locality, pincode },
     *            experienceYears, servingCities, expertise: string[],
     *            neighbourhoodIds: (string|number)[] }
     * `address` is the professional's current/working address, picked via the
     * state -> city -> locality cascade (same confirmed field names as the
     * customer address picker in profile.js). `neighbourhoodIds` is the
     * separate multi-select of localities, within that same city, the
     * professional wants to take bookings in — always an array, even for a
     * single locality. A professional willing to serve every locality in
     * the city sends the sentinel value -1 instead of listing each
     * neighbourhoodId individually: neighbourhoodIds: ["-1"].
     * @returns {Promise<{success: boolean, message?: string, application?: object}>}
     */
    async function applyAsProfessional(payload) {
        return await invoke('/professionals', 'POST', payload);
    }

    /**
     * Retrieves the details of a professional by their unique identifier.
     *
     * @async
     * @returns {Promise<{
     *     success: boolean,
     *     result?: Object,
     *     message?: string,
     *     authExpired?: boolean
     * }>} A promise that resolves with the professional details or error information.
     */
    async function viewProfessional() {
        return await invoke('/professionals/me', 'GET');
    }

    /**
     * Retrieves the available documents.
     *
     * @async
     * @returns {Promise<{
     *     success: boolean,
     *     result?: Array<Object>,
     *     message?: string,
     *     authExpired?: boolean
     * }>} A promise that resolves with the list of documents or error information.
     */
    async function viewDocuments() {
        return await invoke('/documents', 'GET');
    }

    /**
     * Retrieves the services associated with the current professional.
     *
     * @async
     * @returns {Promise<{
     *     success: boolean,
     *     result?: Array<Object>,
     *     message?: string,
     *     authExpired?: boolean
     * }>} A promise that resolves with the list of professional services or error information.
     */
    async function viewProfessionalServices() {
        return await invoke('/professionalServices', 'GET');
    }

    async function updateProfessionalServices(subCategoryIds) {
        return await invoke('/professionalServices', 'PATCH', subCategoryIds);
    }

    /**
     * Retrieves the neighbourhoods associated with the current professional.
     *
     * @async
     * @returns {Promise<{
     *     success: boolean,
     *     result?: Array<Object>,
     *     message?: string,
     *     authExpired?: boolean
     * }>} A promise that resolves with the list of professional services or error information.
     */
    /**
     * PATCH /professionals/me
     * Payload: { expertise: (string|number)[] }  — sub-category ids.
     * Replaces the signed-in professional's areas of expertise. Selection is
     * always at sub-category level (same `expertise` field the application
     * form sends to POST /professionals); the services offered are every
     * service under the selected sub-categories.
     * @returns {Promise<{success: boolean, message?: string, result?: object}>}
     */
    async function viewProfessionalNeighbourhoods() {
        return await invoke('/professionalNeighbourhoods', 'GET');
    }

    /**
     * PATCH /professionalNeighbourhoods
     * Payload: neighbourhood ids (array), e.g. [12, 45, 78] — or [-1] for
     * "All Localities". Replaces the localities the signed-in professional
     * serves (same shape as updateProfessionalServices).
     * @param {Array<number|string>} neighbourhoodIds
     * @returns {Promise<{success: boolean, message?: string, result?: object}>}
     */
    async function updateProfessionalNeighbourhoods(neighbourhoodIds) {
        return await invoke('/professionalNeighbourhoods', 'PATCH', neighbourhoodIds);
    }

    /**
     * Retrieves the available vouchers/coupons.
     *
     * @async
     * @returns {Promise<{
     *     success: boolean,
     *     result?: Array<Object>,
     *     message?: string,
     *     authExpired?: boolean
     * }>} A promise that resolves with the list of available vouchers or error information.
     */
    async function viewVouchers() {
        return await invoke('/coupons', 'GET');
    }
    
    async function updateProvince(id, payload) {
        return await invoke('/provinces/' + id, 'PATCH', payload);
    }
    
    async function updateCity(id, payload) {
        return await invoke('/cities/' + id, 'PATCH', payload);
    }

    /* =====================================================================
     ADMIN
     Everything below is used only by admin-login.html / admin-dashboard.html.
     Kept in the same HearthAPI namespace (same fetch conventions, same
     BASE_URL) rather than a separate file, since it's the same backend
     contract style as the rest of this file — just a different caller.
     ===================================================================== */

    /**
     * POST /login/admin
     * Payload: { userid, password }
     * Username/password admin login — no OTP step, unlike the customer/
     * professional flow above. On success the server sets the same _fks
     * session cookie it always does, just with an extra `priv: "admin"`
     * claim baked in server-side; the browser never sees or stores that
     * claim directly.
     * @returns {Promise<{success: boolean, message?: string, result?: {externalId, fullName, role}}>}
     */
    async function adminLogin(userid, password) {
        try {
            const res = await fetch(
                    BASE_URL + '/login/admin',
                    {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({userid, password})
                    }
            );
            let json = await res.json();
            if (res.status === 200) {
                return {success: true, result: json};
            } else {
                return {success: false, message: json.message || 'Invalid username or password'};
            }
        } catch (e) {
            console.error('[Hearth] Admin login failed:', e);
            return {success: false, message: e.message};
        }
    }

    /**
     * GET /professionals — admin-only. `params` (optional) is forwarded as a
     * query string as-is, e.g. { status: 'PENDING', page: 2 } — whatever the
     * backend actually supports.
     * @returns {Promise<{success: boolean, message?: string, result?: {count, items}}>}
     */
    async function query(payload) {
        try {
            const res = await fetch(BASE_URL + '/admin/query', {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            let json = await res.json();

            if (res.status === 200) {
                return {success: true, result: json};
            } else {
                return {success: false, message: json.message};
            }
        } catch (e) {
            console.error('[Hearth] Failed to execute query:', e);
            return {success: false, message: e.message};
        }
    }

    /**
     * POST /admin/dbQuery — admin-only. Runs a raw SQL statement and returns
     * the result as a bare array of row-arrays (no column names - see
     * DBQueryHandler on the backend). `sql` is the query text as a string.
     * @returns {Promise<{success: boolean, message?: string, result?: Array}>}
     */
    async function dbQuery(sql) {
        try {
            const res = await fetch(BASE_URL + '/admin/dbQuery', {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({sql})
            });
            let json = await res.json();

            if (res.status === 200) {
                return {success: true, result: json};
            } else {
                return {success: false, message: json.message};
            }
        } catch (e) {
            console.error('[Hearth] Failed to execute db query:', e);
            return {success: false, message: e.message};
        }
    }

    /**
     * POST /admin/availabilities/calendar — admin-only. Triggers hearth-app's
     * async calendar generation job. `numberOfDays` and `professionalIds` are
     * both optional (numberOfDays defaults to 5 server-side) - pass {} to
     * accept all server defaults.
     * @returns {Promise<{success: boolean, message?: string, result?: Object}>}
     */
    async function generateAvailabilityCalendar(payload) {
        try {
            const res = await fetch(BASE_URL + '/admin/availabilities/calendar', {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload || {})
            });
            let json = await res.json();

            if (res.status === 200 || res.status === 202) {
                return {success: true, result: json};
            } else {
                return {success: false, message: json.message};
            }
        } catch (e) {
            console.error('[Hearth] Failed to request calendar generation:', e);
            return {success: false, message: e.message};
        }
    }

    /**
     * GET /admin/availabilities/professionals — admin-only. `params` is an
     * object forwarded as the query string as-is, e.g. { serviceId, date,
     * start, end, neighbourhoodId } - whatever the backend actually supports;
     * only non-empty values are included.
     * @returns {Promise<{success: boolean, message?: string, result?: Object}>}
     */
    async function viewProfessionalAvailability(params) {
        const searchParams = new URLSearchParams();
        Object.entries(params || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                searchParams.append(key, value);
            }
        });

        try {
            const res = await fetch(BASE_URL + '/admin/availabilities/professionals?' + searchParams.toString(), {
                method: 'GET',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'}
            });
            let json = await res.json();

            if (res.status === 200) {
                return {success: true, result: json};
            } else {
                return {success: false, message: json.message};
            }
        } catch (e) {
            console.error('[Hearth] Failed to fetch professional availability:', e);
            return {success: false, message: e.message};
        }
    }

    async function queryApplication(status) {
        try {
            const param = '?' + status;
            const res = await fetch(BASE_URL + '/documents' + param, {
                method: 'GET',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'}
            });
            let json = await res.json();

            if (res.status === 200) {
                return {success: true, result: json};
            } else {
                return {success: false, message: json.message};
            }
        } catch (e) {
            console.error('[Hearth] Failed to fetch all professionals:', e);
            return {success: false, message: e.message};
        }
    }

    async function queryCustomer() {
        try {
            const res = await fetch(BASE_URL + '/users?role=CUSTOMER', {
                method: 'GET',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'}
            });
            let json = await res.json();

            if (res.status === 200) {
                return {success: true, result: json};
            } else {
                return {success: false, message: json.message};
            }
        } catch (e) {
            console.error('[Hearth] Failed to fetch all professionals:', e);
            return {success: false, message: e.message};
        }
    }

    async function queryBooking(status) {
        try {
            const param = '?' + status;
            const res = await fetch(BASE_URL + '/bookings' + param, {
                method: 'GET',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'}
            });
            let json = await res.json();

            if (res.status === 200) {
                return {success: true, result: json};
            } else {
                return {success: false, message: json.message};
            }
        } catch (e) {
            console.error('[Hearth] Failed to fetch all professionals:', e);
            return {success: false, message: e.message};
        }
    }

    /**
     * POST /admin/professionals
     * Payload: { applicationId, status: 'APPROVED' | 'REJECTED' }
     * Approves or rejects a pending professional application from the
     * Professional Applications tab.
     * @returns {Promise<{success: boolean, message?: string, result?: object}>}
     */
    async function setApplicationStatus(applicationId, status) {
        try {
            const res = await fetch(BASE_URL + '/admin/professionals', {
                method: 'POST',
                credentials: 'include',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({applicationId, status})
            });
            let json = await res.json();

            if (res.status === 200) {
                return {success: true, result: json};
            } else {
                return {success: false, message: json.message};
            }
        } catch (e) {
            console.error('[Hearth] Failed to update application status:', e);
            return {success: false, message: e.message};
        }
    }

    function delay(value, ms) {
        return new Promise(resolve => setTimeout(() => resolve(value), ms));
    }

    return {
        DEMO_MODE,
        requestOtp,
        verifyOtp,
        logout,
        createUser,
        updateUser,
        viewUser,
        createAddress,
        updateAddress,
        viewAddresses,
        deleteAddress,
        viewProvinces,
        viewCities,
        updateProvince,
        updateCity,
        viewNeighbourhoods,
        checkPincode,
        viewCategories,
        viewSlots,
        createBooking,
        getBookings,
        cancelBooking,
        applyAsProfessional,
        viewProfessional,
        viewProfessionalServices,
        updateProfessionalServices,
        viewProfessionalNeighbourhoods,
        updateProfessionalNeighbourhoods,
        viewDocuments,
        viewVouchers,
        adminLogin,
        query,
        dbQuery,
        generateAvailabilityCalendar,
        viewProfessionalAvailability,
        queryApplication,
        queryBooking,
        queryCustomer,
        setApplicationStatus
    };
})();
