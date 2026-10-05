const path = require('path');
const redis = require('redis');

const {getLogger} = require('./../util/logger');

const log = getLogger(path.basename(__filename, ".js"));

class RedisClient {
    
    constructor() {
        this.client = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) {
            return;
        }
        
        const host = process.env.REDIS_HOST || 'localhost';
        const port = process.env.REDIS_PORT || '6379';
        const url = process.env.REDIS_URL || `redis://${host}:${port}`;
        // Safe-for-logging form: redact any embedded auth token (e.g. rediss://:TOKEN@host:port)
        // before it ever reaches the logs.
        const safeUrl = url.replace(/\/\/[^@/]*@/, '//<redacted>@');

        const start = Date.now();

        this.client = redis.createClient({url});

        this.client.on('connect', () => {
            if (log.isInfoEnabled()) {
                log.info(`Connecting to redis [ Url: ${safeUrl} ] ... `);
            }
        });

        this.client.on('ready', () => {
            if (log.isInfoEnabled()) {
                log.info('Successfully connected to redis server. Elapsed time(ms): %d', (Date.now() - start));
            }
        });

        this.client.on('error', (err) => {
            log.error('Error while connecting to redis', err);
        });

        await this.client.connect();
        this.initialized = true;
    }

    async setValue(key, val, ttlMin) {
        if (ttlMin) {
            return this.client.set(key, val, {EX: ttlMin * 60});
        }
        return this.client.set(key, val);
    }

    async getValue(key) {
        return this.client.get(key);
    }

    async remove(key) {
        return this.client.del(key);
    }
}

module.exports = new RedisClient();
