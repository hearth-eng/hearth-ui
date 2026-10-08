const axios = require('axios');
const https = require('https');
const fs = require('fs');

const errorHandler = require('./error');
const {getLogger} = require('./logger');

const log = getLogger(__filename);

class HttpClient {

    constructor() {
        this.server = process.env.HEARTH_SERVER || 'http://localhost:8080';
        this.contextRoot = process.env.HEARTH_CONTEXT_ROOT || '/api/v1';
        
        // 1. key + cert: This is hearth-ui's own client identity. In mutual TLS, the client has to prove who it is too,
        //    not just the server. When Node (as the TLS client here) connects to hearth-app, hearth-app's server will
        //    request a client certificate during the handshake; Node presents cert (signed by the CA) and proves it holds
        //    the matching key by signing part of the handshake with it.
        //    key and cert are read from one combined PEM file (private key block followed by the cert block) rather
        //    than two separate files - Node's https.Agent accepts PEM content directly, so there's no need for a
        //    PKCS12-style keystore to deliver these two together the way Java does.
        //
        // 2. ca: This is what lets Node (the client) validate hearth-app's server certificate.
        //    Since rejectUnauthorized: true is set, Node will refuse the connection unless hearth-app's presented server
        //    cert chains up to a CA it trusts. hearth-app's server cert is signed by our private/self-signed mTLS CA
        //    (not a public CA like Let's Encrypt), so the public Node's trust store has no idea who that CA is — we
        //    have to hand Node that CA cert explicitly via ca, or every connection would throw UNABLE_TO_VERIFY_LEAF_SIGNATURE.
        const clientBundle = fs.readFileSync(process.env.MTLS_CLIENT_STORE, 'utf8');
        const clientKey = clientBundle.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/);
        const clientCert = clientBundle.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);

        if (! clientKey || ! clientCert) {
            throw new Error('MTLS_CLIENT_PATH must contain both a PRIVATE KEY and a CERTIFICATE PEM block');
        }

        const httpsAgent = new https.Agent({
            key: clientKey[0],
            cert: clientCert[0],
            ca: fs.readFileSync(process.env.MTLS_CA_STORE),

            rejectUnauthorized: true,
            servername: process.env.MTLS_SERVER_NAME || 'localhost',
            minVersion: 'TLSv1.2'
        });

        // Create a custom configured instance.
        this.client = axios.create({
            baseURL: this.server,
            timeout: 5000,
            httpsAgent,
            headers: {
                'Content-Type': 'application/json'
            },
            paramsSerializer: {
                indexes: null
            }
        });

        this.client.interceptors.request.use(config => {
            let dump = '\n============================ REQUEST ============================' + '\n';
            dump += config.method.toUpperCase() + ' ' + (config.baseURL + config.url) + '\n';
            dump += 'URI: ' + axios.getUri(config) + '\n';
            dump += config.headers + '\n';
            if (! (typeof config.params === 'undefined')) {
                dump += JSON.stringify(config.params) + '\n';
            }
            
            if (config.data instanceof URLSearchParams) {
                dump += 'Body (string): ' + config.data.toString() + '\n';
                dump += 'Body (entries): ' + Object.fromEntries(config.data) + '\n';
            }
            else if (! (typeof config.data === 'undefined')) {
                dump += (typeof config.data === 'string' ? config.data : JSON.stringify(config.data, null, 2)) + '\n';
            }
            dump += '=================================================================' + '\n';

            if (log.isDebugEnabled()) {
                log.debug(dump);
            }
            return config;
        });
        
        this.client.interceptors.response.use(response => {
            let dump = '\n============================ RESPONSE ============================' + '\n';
            dump += response.status + '\n';
            dump += response.headers + '\n';
            dump += (typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2)) + '\n';
            dump += '=================================================================' + '\n';

            if (log.isDebugEnabled()) {
                log.debug(dump);
            }
            return response;
        });
        
        if (log.isInfoEnabled()) {
            log.info('Initialized http client and added request and response interceptors');
        }
    }

    _buildUrl(uri) {
        if (/^https?:\/\//i.test(uri)) {
            return uri;
        }
        return this.contextRoot + uri;
    }
    
    async rpc(uri, method, payload, config = {}) {
        const url = this._buildUrl(uri);
        
        let param = {
            ...config
        };
        param.method = method;
        param.url = url;
        if (payload !== null) {
            param.data = payload;
        }
        
        return await this.client.request(param);
    }

    async post(uri, payload, config = {}) {
        return this.rpc(uri, 'POST', payload, config);
    }

    async get(uri, config = {}) {
        return this.rpc(uri, 'GET', null, config);
    }

    async put(uri, payload, config = {}) {
        return this.rpc(uri, 'PUT', payload, config);
    }

    async patch(uri, payload, config = {}) {
        return this.rpc(uri, 'PATCH', payload, config);
    }

    async delete(uri, config = {}) {
        return this.rpc(uri, 'DELETE', null, config);
    }

    legacyPost(req, res, uri, payload, config, onSuccess) {
        let promise = this.client.post(
            this.contextRoot + uri,
                payload,
                config);

        promise.then(response => {
            onSuccess(response);
            
        }).catch(err => {
            errorHandler.handleError(res, err, true);
        });
    }

    legacyGet(req, res, uri, config, onSuccess) {
        let promise = this.client.get(
            this.contextRoot + uri,
                config);

        promise.then(response => {
            onSuccess(response);
            
        }).catch(err => {
            errorHandler.handleError(res, err, true);
        });
    }
}

module.exports = new HttpClient();
