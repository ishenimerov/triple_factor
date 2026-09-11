/**
 * Third factor: cryptographic challenge-response.
 *
 * At registration the client generates an ECDSA P-256 key pair in the browser
 * (Web Crypto API). The PRIVATE key never leaves the client. Only the PUBLIC
 * key (as a JWK) is sent to the server and stored.
 *
 * At login, after the password and OTP factors pass, the server issues a random
 * `challenge` (a nonce). The client signs the nonce with its private key and
 * returns the signature. The server verifies the signature against the stored
 * public key — proving the client possesses the private key WITHOUT it ever
 * being transmitted. This is "something you have" in a purely cryptographic form.
 */

const crypto = require('crypto');

/** Generate a random challenge nonce (base64url string). */
function makeChallenge(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Verify an ECDSA/SHA-256 signature over `challenge`.
 *
 * @param {object} publicJwk  Public key as a JWK (from the browser export).
 * @param {string} challenge  The base64url nonce that was signed.
 * @param {string} signatureB64url  Signature bytes, base64url encoded.
 * @returns {boolean}
 */
function verifyChallengeSignature(publicJwk, challenge, signatureB64url) {
  try {
    const keyObject = crypto.createPublicKey({ key: publicJwk, format: 'jwk' });
    const signature = Buffer.from(signatureB64url, 'base64url');
    return crypto.verify(
      'sha256',
      Buffer.from(challenge, 'utf8'),
      // Web Crypto produces raw (r||s) signatures — the IEEE P1363 format —
      // whereas Node defaults to DER. Tell Node to expect the P1363 form.
      { key: keyObject, dsaEncoding: 'ieee-p1363' },
      signature
    );
  } catch {
    return false;
  }
}

/** Lightweight sanity check that an object looks like a P-256 public JWK. */
function isValidP256PublicJwk(jwk) {
  return (
    jwk &&
    jwk.kty === 'EC' &&
    jwk.crv === 'P-256' &&
    typeof jwk.x === 'string' &&
    typeof jwk.y === 'string' &&
    jwk.d === undefined // must NOT contain the private component
  );
}

module.exports = { makeChallenge, verifyChallengeSignature, isValidP256PublicJwk };
