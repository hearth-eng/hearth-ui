const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { getLogger } = require('./../util/logger');
const pemutil = require('./../util/pemutil');

const log = getLogger(path.basename(__filename, '.js'));

const bundleFile = path.join(__dirname, '..', '..', process.env.MTLS_CLIENT_STORE || 'store/hearth-ui.pem');
const ALIAS = 'hearth-ui';

class MtlsStore {

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
        // same format http_client.js reads for the outbound mTLS client identity -
        // see http_client.js's MTLS_CLIENT_BUNDLE_PATH handling for the matching regex.
        const bundle = fs.readFileSync(bundleFile, 'utf8');

        const keyMatch = bundle.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/);
        const certMatch = bundle.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);

        if (! keyMatch || ! certMatch) {
            throw new Error(`${bundleFile} must contain both a PRIVATE KEY and a CERTIFICATE PEM block`);
        }

        this.privateKey = keyMatch[0];
        this.certificatePem = certMatch[0];

        if (log.isInfoEnabled()) {
            log.info('Initialized mTLS store %s', bundleFile);
        }

        this.initialized = true;
        this.log();
    }

    log() {
        const publicKeyPem = crypto.createPublicKey(this.certificatePem)
            .export({ type: 'spki', format: 'pem' });

        const info = [pemutil.describeKeyPair(ALIAS, this.privateKey, publicKeyPem, this.certificatePem)];

        if (log.isInfoEnabled()) {
            log.info('mTLS Store: %s', JSON.stringify(info, null, 2));
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

// Every require('./mtlsstore') gets the same instance.
module.exports = new MtlsStore();
