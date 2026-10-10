const express = require('express');
const httpClient = require('./../util/http_client');
const {getLogger} = require('./../util/logger');

const route = express.Router();

const log = getLogger(__filename);

/**
 * POST /admin/availabilities/calendar — admin-only. Triggers hearth-app's
 * async calendar generation (fire-and-forget: hearth-app returns 202 and
 * does the actual work off the event bus, not synchronously - see
 * AvailabilityMgmtHandler.generate()). Body: { numberOfDays, professionalIds }
 * - both optional, numberOfDays defaults to 5 server-side.
 */
async function generate(req, res) {
    let payload = req.body || {};

    try {
        const response = await httpClient.post(
            '/admin/availabilities/calendar'
            , payload
            , {
                headers: {
                    Authorization: `Bearer ${req.token}`
                }
            }
        );
        let result = response.data;

        if (log.isDebugEnabled()) {
            log.debug('Calendar generation request accepted. Status code: %d', response.status);
        }
        return res.status(response.status)
                .json(result);
    }
    catch (err) {
        handleError(req, res, err, 'Error in requesting calendar generation');
    }
}

/**
 * GET /admin/availabilities/professionals — admin-only. req.query is
 * forwarded as-is: serviceId, date (yyyy-MM-dd), start/end (optional slot
 * bounds), neighbourhoodId (optional) - whatever hearth-app's
 * AvailabilityMgmtBO.viewProfessionalAvailability() actually reads.
 */
async function viewProfessionalAvailability(req, res) {
    try {
        const response = await httpClient.get(
            '/admin/availabilities/professionals'
            , {
                headers: {
                    Authorization: `Bearer ${req.token}`
                },
                params: req.query
            }
        );
        if (response.status === 200) {
            let result = response.data;

            if (log.isDebugEnabled()) {
                log.debug('Successfully fetched professional availability.');
            }
            return res.status(response.status)
                    .json(result);
        }
        else {
            let result = response.data;
            log.error('Unable to fetch professional availability. Status code: %d. Error Msg: %s', response.status, result);

            return res.status(response.status)
                    .json(result);
        }
    }
    catch (err) {
        handleError(req, res, err, 'Error in fetching professional availability');
    }
}

async function handleError(req, res, err, msg) {
    log.error(msg, err);

    if (err.response) {
        return res.status(err.response.status).json(err.response.data);
    }
    return res.status(503).json({
        message: 'Service temporarily unavailable'
    });
}

route.post('/calendar', generate);
route.get('/professionals', viewProfessionalAvailability);

module.exports = route;
