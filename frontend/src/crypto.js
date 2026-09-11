/**
 * Client-side cryptography for the third factor.
 *
 * The private key is generated in the browser and stored ONLY in localStorage
 * on this device. It is never sent to the server. Think of it as the user's
 * device-bound "security key". Only the public key is registered server-side.
 */

const { subtle } = window.crypto;

const b64url = (buf) => {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const pkKey = (username) => `3fa_pk_${username.toLowerCase()}`;

/**
 * Generate an ECDSA P-256 key pair, persist the private key (as JWK) locally,
 * and return the public key JWK to register with the server.
 */
export async function generateAndStoreKey(username) {
  const keyPair = await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const publicJwk = await subtle.exportKey('jwk', keyPair.publicKey);
  const privateJwk = await subtle.exportKey('jwk', keyPair.privateKey);
  localStorage.setItem(pkKey(username), JSON.stringify(privateJwk));
  return publicJwk;
}

/** True if a private key for this username exists on this device. */
export function hasKey(username) {
  return Boolean(localStorage.getItem(pkKey(username)));
}

/** Sign a challenge string with the locally stored private key. */
export async function signChallenge(username, challenge) {
  const raw = localStorage.getItem(pkKey(username));
  if (!raw) {
    throw new Error(
      'No private key found on this device for that account. Register (or log in on the device where you registered).'
    );
  }
  const privateJwk = JSON.parse(raw);
  const privateKey = await subtle.importKey(
    'jwk',
    privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const sig = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(challenge)
  );
  return b64url(sig);
}
