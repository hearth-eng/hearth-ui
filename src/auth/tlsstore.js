const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { getLogger } = require('./../util/logger');
const pemutil = require('./../util/pemutil');

const log = getLogger(path.basename(__filename, '.js'));

const bundleFile = path.join(__dirname, '..', '..', process.env.TLS_SERVER_STORE || 'store/node-tls.pem');
const ALIAS = 'node-ext';

class TlsStore {

    constructor() {
        this.privateKey = null;
        this.certificatePem = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) {
            return;
        }

        // Combined PEM bundle: private key block followed by the certificate block,
        // same format mtlsstore.js reads for the mTLS client identity - this one is
        // hearth-ui's own HTTPS server identity (the browser/ALB hop), kept separate
        // from the mTLS client cert used when calling hearth-app.
        const bundle = fs.readFileSync(bundleFile, 'utf8');

        const keyMatch = bundle.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/);
        const certMatch = bundle.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);

        if (! keyMatch || ! certMatch) {
            throw new Error(`${bundleFile} must contain both a PRIVATE KEY and a CERTIFICATE PEM block`);
        }

        this.privateKey = keyMatch[0];
        this.certificatePem = certMatch[0];

        if (log.isInfoEnabled()) {
            log.info('Initialized TLS store %s', bundleFile);
        }

        this.initialized = true;
        this.log();
    }

    log() {
        const publicKeyPem = crypto.createPublicKey(this.certificatePem)
            .export({ type: 'spki', format: 'pem' });

        const info = [pemutil.describeKeyPair(ALIAS, this.privateKey, publicKeyPem, this.certificatePem)];

        if (log.isInfoEnabled()) {
            log.info('TLS Store: %s', JSON.stringify(info, null, 2));
        }
        return info;
    }

    getPrivateKey() {
        return this.privateKey;
    }

    getCertificate() {
        return this.certificatePem;
    }
}

// Every require('./tlsstore') gets the same instance.
module.exports = new TlsStore();
