const express = require('express');
const httpClient = require('./../util/http_client');
const {getLogger} = require('./../util/logger');

const route = express.Router();

const log = getLogger(__filename);

/**
 * POST /admin/dbQuery — admin-only. Browser sends JSON { sql: "..." }, same
 * shape as every other endpoint in this app. hearth-app's DBQueryHandler
 * .executeSql() reads the whole request body as a single raw string
 * (ctx.body().asString()) and executes it directly - no JSON there - so the
 * sql text is unwrapped from { sql } here and forwarded as a plain-text body.
 */
async function executeSql(req, res) {
    const sql = req.body && req.body.sql;

    if (! sql || typeof sql !== 'string' || sql.trim().length === 0) {
        return res.status(400)
                .set('Content-Type', 'application/json')
                .json({message: 'Missing or empty SQL query'});
    }

    try {
        const response = await httpClient.post(
            '/admin/dbQuery'
            , sql
            , {
                headers: {
                    Authorization: `Bearer ${req.token}`,
                    'Content-Type': 'text/plain'
                }
            }
        );
        if (response.status === 200) {
            let result = response.data;

            if (log.isDebugEnabled()) {
                log.debug('Successfully executed sql query');
            }
            return res.status(response.status)
                    .json(result);
        }
        else {
            let result = response.data;
            log.error('Unable to execute query. Status code: %d. Error Msg: %s', response.status, result);

            return res.status(response.status)
                    .json(result);
        }
    }
    catch (err) {
        handleError(req, res, err, 'Error in executing sql query');
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

route.post('/', executeSql);

module.exports = route;
