const express = require('express');
const cache = require('./../util/cache');
const {getLogger} = require('./../util/logger');

const route = express.Router();

const log = getLogger(__filename);

/**
 * GET /admin/redis/keys?pattern=91* — admin-only, read-only key browser.
 * Returns [{key, type, ttl}] for every key matching the glob pattern
 * (defaults to "*" - everything). Values are NOT included here - the UI
 * fetches a key's value separately (see view() below) only when the admin
 * actually opens it, so listing a large keyspace doesn't pull every OTP
 * value over the wire at once.
 */
async function list(req, res) {
    try {
        const pattern = req.query.pattern;
        const keys = await cache.scanKeys(pattern);

        const items = await Promise.all(keys.map(async (key) => {
            const [type, ttl] = await Promise.all([cache.type(key), cache.ttl(key)]);
            return {key, type, ttl};
        }));

        if (log.isDebugEnabled()) {
            log.debug('Listed %d redis key(s) for pattern %s', items.length, pattern || '*');
        }
        return res.status(200).json({items});
    }
    catch (err) {
        handleError(req, res, err, 'Error listing redis keys');
    }
}

/**
 * GET /admin/redis/keys/:key — admin-only. Returns the raw value, type, and
 * remaining TTL (seconds; -1 = no expiry, -2 = key doesn't exist/expired
 * since the list call) for one key. Read-only: no write/delete endpoint is
 * exposed here by design - this is a debugging/support view, not a Redis
 * management console.
 */
async function view(req, res) {
    try {
        const key = req.params.key;
        const [type, ttl] = await Promise.all([cache.type(key), cache.ttl(key)]);

        if (type === 'none') {
            return res.status(404).json({message: 'Key not found (it may have expired)'});
        }

        // Only "string" values are supported for now - every key this app
        // currently writes (OTP records) is a plain string/JSON blob. Other
        // Redis types (hash/list/set/zset) would need their own read commands
        // (HGETALL/LRANGE/SMEMBERS/ZRANGE) - not needed until something in
        // this codebase actually starts writing one.
        const value = type === 'string' ? await cache.getValue(key) : null;

        if (log.isDebugEnabled()) {
            log.debug('Viewed redis key %s (type=%s, ttl=%d)', key, type, ttl);
        }
        return res.status(200).json({key, type, ttl, value});
    }
    catch (err) {
        handleError(req, res, err, 'Error viewing redis key');
    }
}

async function handleError(req, res, err, msg) {
    log.error(msg, err);
    return res.status(503).json({
        message: 'Service temporarily unavailable'
    });
}

route.get('/keys', list);
route.get('/keys/:key', view);

module.exports = route;
