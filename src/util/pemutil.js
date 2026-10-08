const crypto = require('crypto');
const forge = require('node-forge');

function sha256Fingerprint(buffer) {
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').toUpperCase();
    return hash.match(/.{1,2}/g).join(':');
}

// node-forge represents a DN as a flat list of {shortName, value} attributes;
// Java's X500Principal.getName() renders the same DN as "CN=...,OU=...,...".
// Rebuild that comma-joined, most-specific-first form here for an equivalent string.
function forgeAttributesToDn(attributes) {
    return attributes
        .map(attr => `${attr.shortName}=${attr.value}`)
        .join(',');
}

// node-forge exposes the cert's signature OID (e.g. "1.2.840.113549.1.1.11"),
// not the human-readable name Java's X509Certificate.getSigAlgName() returns
// (e.g. "SHA256withRSA") - translate the handful this project's own
// gen-jwt-keystore.sh / keytool can actually produce.
const SIG_ALG_OID_NAMES = {
    '1.2.840.113549.1.1.11': 'SHA256withRSA',
    '1.2.840.113549.1.1.12': 'SHA384withRSA',
    '1.2.840.113549.1.1.13': 'SHA512withRSA',
    '1.2.840.113549.1.1.5': 'SHA1withRSA'
};

function forgeSigAlgName(forgeCert) {
    return SIG_ALG_OID_NAMES[forgeCert.signatureOid] || forgeCert.signatureOid;
}

// Shared by describeKeyPair (which also has priv/pub) and describeCertificate
// (cert-only, e.g. a CA cert with no private key available at all).
function describeCert(forgeCert) {
    const now = new Date();
    const validFrom = forgeCert.validity.notBefore;
    const validUntil = forgeCert.validity.notAfter;
    const status = (now < validFrom || now > validUntil) ? 'EXPIRED' : 'VALID';

    let keySizeBits;
    if (forgeCert.publicKey && forgeCert.publicKey.n) {
        keySizeBits = forgeCert.publicKey.n.bitLength();
    }

    return {
        validFrom: validFrom.toString(),
        validUntil: validUntil.toString(),
        status: status,
        subject: forgeAttributesToDn(forgeCert.subject.attributes),
        issuer: forgeAttributesToDn(forgeCert.issuer.attributes),
        serialNumber: forgeCert.serialNumber.toUpperCase(),
        algorithm: 'RSA',
        signAlgorithm: forgeSigAlgName(forgeCert),
        keySizeBits: keySizeBits,
        signature: Buffer.from(forgeCert.signature, 'binary').toString('base64')
    };
}

/**
 * Node equivalent of hearth-app's KeyStorage.log() (see
 * com.hearth.app.core.KeyStorage / CryptoUtil.serialize). Builds the same
 * shape: alias, priv (algorithm/format/encodedBase64/fingerprint*), pub
 * (same shape), cert (validity/subject/issuer/signature/...).
 *
 * privateKeyPem/publicKeyPem/certificatePem are PEM strings (not paths).
 * alias is just a label carried into the output, same role as a keystore
 * alias - this function itself has no keystore/PKCS12 dependency, so it
 * works for any RSA key + cert PEM trio.
 *
 * SECURITY NOTE: priv.encodedBase64 is the raw PKCS#8 private key,
 * base64-encoded - logging or otherwise exposing it hands over the key to
 * anything with access to wherever the caller sends this output (e.g.
 * CloudWatch, stdout). This mirrors KeyStorage.java's current behavior
 * exactly, on request, but is not a safe pattern for production. If
 * hearth-app's logging is ever tightened to drop priv.encodedBase64, this
 * should be updated to match.
 */
function describeKeyPair(alias, privateKeyPem, publicKeyPem, certificatePem) {
    const nativePrivKey = crypto.createPrivateKey(privateKeyPem);
    const privDer = nativePrivKey.export({ type: 'pkcs8', format: 'der' });

    const nativePubKey = crypto.createPublicKey(publicKeyPem);
    const pubDer = nativePubKey.export({ type: 'spki', format: 'der' });

    const forgeCert = forge.pki.certificateFromPem(certificatePem);

    return {
        alias: alias,
        priv: {
            algorithm: 'RSA',
            format: 'PKCS#8',
            encodedBase64: privDer.toString('base64'),
            fingerprintAlgo: 'SHA-256',
            fingerprint: sha256Fingerprint(privDer)
        },
        pub: {
            algorithm: 'RSA',
            format: 'X.509',
            encodedBase64: pubDer.toString('base64'),
            fingerprintAlgo: 'SHA-256',
            fingerprint: sha256Fingerprint(pubDer)
        },
        cert: describeCert(forgeCert)
    };
}

/**
 * Cert-only counterpart to describeKeyPair, for material where no private
 * key is available at all - e.g. a CA certificate (castore.js): you hold the
 * CA's public cert to validate against, never its private key (that stays
 * offline with whoever signs certs). Same "cert" shape as describeKeyPair,
 * no priv/pub sections since there's no key pair here to speak of, only the
 * cert's own (already-public) key embedded in the subject.
 */
function describeCertificate(alias, certificatePem) {
    const forgeCert = forge.pki.certificateFromPem(certificatePem);

    return {
        alias: alias,
        cert: describeCert(forgeCert)
    };
}

module.exports = {
    describeKeyPair,
    describeCertificate
};
