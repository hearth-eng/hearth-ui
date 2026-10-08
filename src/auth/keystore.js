const fs = require('fs');
const path = require('path');
const forge = require('node-forge');

const { getLogger } = require('./../util/logger');
const pemutil = require('./../util/pemutil');

const log = getLogger(path.basename(__filename, '.js'));

const keystoreFile = path.join(__dirname, '..', '..', process.env.JWT_KEYSTORE);
const TARGET_ALIAS = 'RS256';

class KeyStore {

    constructor() {
        this.privateKey = null;
        this.publicKey = null;
        this.certificatePem = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) {
            return;
        }

        const password = process.env.HEARTH_KEYSTORE_PASSWORD || 'secret';
        if (! password) {
            throw new Error('HEARTH_KEYSTORE_PASSWORD is not set');
        }

        // 1. Read the binary .pkcs file from disk
        const pkcs12Der = fs.readFileSync(keystoreFile, 'binary');

        // 2. Parse the PKCS12 data using node-forge
        const p12Asn1 = forge.asn1.fromDer(pkcs12Der);
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

        // 3. Look for the Key bags inside the PKCS12 structure
        const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
        const shroudBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];

        if (shroudBag && shroudBag.length > 0) {
            // Find by alias or fall back to the first private key found
            const targetBag = shroudBag.find(bag => bag.attributes.friendlyName?.[0] === TARGET_ALIAS) || shroudBag[0];

            if (targetBag && targetBag.key) {
                // Extract and convert Private Key to standard PEM string format
                this.privateKey = forge.pki.privateKeyToPem(targetBag.key);
            }
        }

        // 4. Look for the Cert bags to extract the matching Public Key
        const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
        const standardCertBag = certBags[forge.pki.oids.certBag];

        if (standardCertBag && standardCertBag.length > 0) {
            // Find by alias or fall back to the first certificate found
            const targetCertBag = standardCertBag.find(bag => bag.attributes.friendlyName?.[0] === TARGET_ALIAS) || standardCertBag[0];

            if (targetCertBag && targetCertBag.cert) {
                const certificate = targetCertBag.cert;
                // Extract the public key out of the certificate structure
                const publicKey = certificate.publicKey;

                // Convert Public Key to standard PEM string format
                this.publicKey = forge.pki.publicKeyToPem(publicKey);

                // Kept for logKeystoreInfo() below (cert validity/subject/signature/...)
                this.certificatePem = forge.pki.certificateToPem(certificate);
            }
        }

        if (log.isInfoEnabled()) {
            log.info('Initialized keystore %s', keystoreFile);
        }

        this.initialized = true;
        this.log();
    }

    log() {
        const info = [pemutil.describeKeyPair(TARGET_ALIAS.toLowerCase(), this.privateKey, this.publicKey, this.certificatePem)];

        if (log.isInfoEnabled()) {
            log.info('JWT Keystore: %s', JSON.stringify(info, null, 2));
        }
        return info;
    }

    getPrivateKey() {
        return this.privateKey;
    }

    getPublicKey() {
        return this.publicKey;
    }
}

// Every require('./keystore') gets the same instance.
module.exports = new KeyStore();