const fs = require('fs');
const path = require('path');

const { getLogger } = require('./../util/logger');
const pemutil = require('./../util/pemutil');

const log = getLogger(path.basename(__filename, '.js'));

const certFile = path.join(__dirname, '..', '..', process.env.MTLS_CA_STORE || 'store/ca_javalabs.crt');
const ALIAS = 'ca_javalabs';

class CaStore {

    constructor() {
        this.certificatePem = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) {
            return;
        }

        // CA certificate only - no private key here (the CA's private key stays
        // offline with whoever signs certs; see hearth-app's ca_javalabs.key for
        // the same split). This file is purely for trusting/validating certs that
        // this CA signed, e.g. hearth-app's incoming mTLS client cert.
        this.certificatePem = fs.readFileSync(certFile, 'utf8');

        if (log.isInfoEnabled()) {
            log.info('Initialized CA store %s', certFile);
        }

        this.initialized = true;
        this.log();
    }

    log() {
        const info = [pemutil.describeCertificate(ALIAS, this.certificatePem)];

        if (log.isInfoEnabled()) {
            log.info('CA Store: %s', JSON.stringify(info, null, 2));
        }
        return info;
    }

    getCertificate() {
        return this.certificatePem;
    }
}

// Every require('./castore') gets the same instance.
module.exports = new CaStore();
