const express = require('express');
const httpClient = require('./../util/http_client');
const {getLogger} = require('./../util/logger');

const route = express.Router();

const log = getLogger(__filename);

async function query(req, res) {
    let payload = req.body;

    if (! payload || Object.keys(payload).length === 0) {
        return res.status(400)
                .set('Content-Type', 'application/json')
                .json({message: 'Missing or empty json payload'});
    }
    
    try {
        const response = await httpClient.post(
            '/admin/query'
            , payload
            , {
                headers: {
                    Authorization: `Bearer ${req.token}`
                }
            }
        );
        if (response.status === 200) {
            let result = response.data;
            
            if (log.isDebugEnabled()) {
                log.debug('Successfully executed query api.');
            }
            return res.status(response.status)
                    .json(result);
        }
        else {
            let result = response.data;
            log.error('Unable execute query api. Status code: %d. Error Msg: %s', response.status, result);
            
            return res.status(response.status)
                    .json(result);
        }
        
    }
    catch (err) {
        handleError(req, res, err, 'Error in registering new user');
    }
}

async function handleError(req, res, err, msg) {
    log.error(msg, err);

    // token acquisition failed OR the backend location service is unreachable.
    if (err.response) {
        return res.status(err.response.status).json(err.response.data);
    }
    return res.status(503).json({
        message: 'Service temporarily unavailable'
    });
}

route.post('/', query);

module.exports = route;
