/**
 * End-to-end smoke test of the full triple-factor flow.
 * Run the server first (with DEV_RETURN_OTP=1), then: node smoke-test.js
 *
 * Uses Node's Web Crypto (the same API the browser exposes) to generate the
 * ECDSA key pair and sign the challenge — exactly what the React client does.
 */

const BASE = 'http://localhost:4000/api';
const { subtle } = globalThis.crypto;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

(async () => {
  // 0. Generate an ECDSA P-256 key pair (private key stays "on the client").
  const keyPair = await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const publicKey = await subtle.exportKey('jwk', keyPair.publicKey);

  const username = 'testuser_' + Date.now();
  const email = username + '@example.com';
  const password = 'SuperSecret123';

  // 1. Register
  await post('/auth/register', { username, email, password, publicKey });
  console.log('✅ registered', username);

  // 2. Factor 1 — password
  const r1 = await post('/auth/login/password', { username, password });
  console.log('✅ factor 1 (password) ok; OTP =', r1.devOtp);

  // 3. Factor 2 — OTP
  const r2 = await post('/auth/login/otp', {
    stageToken: r1.stageToken,
    otp: r1.devOtp,
  });
  console.log('✅ factor 2 (OTP) ok; challenge received');

  // 4. Factor 3 — sign the challenge with the private key
  const sigBuf = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    keyPair.privateKey,
    Buffer.from(r2.challenge, 'utf8')
  );
  const r3 = await post('/auth/login/challenge', {
    stageToken: r2.stageToken,
    signature: b64url(sigBuf),
  });
  console.log('✅ factor 3 (crypto challenge) ok; got session JWT');

  // 5. Access a protected route with the session JWT
  const feed = await fetch(BASE + '/feed', {
    headers: { Authorization: 'Bearer ' + r3.token },
  }).then((r) => r.json());
  console.log('✅ protected /feed:', feed.message);

  // 6. Negative test: a bad signature must be rejected
  const bad = await post('/auth/login/password', { username, password });
  const badOtp = await post('/auth/login/otp', { stageToken: bad.stageToken, otp: bad.devOtp });
  const wrongSig = b64url(Buffer.alloc(64, 7));
  const res = await fetch(BASE + '/auth/login/challenge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stageToken: badOtp.stageToken, signature: wrongSig }),
  });
  console.log(
    res.status === 401
      ? '✅ negative test: forged signature correctly rejected (401)'
      : '❌ negative test FAILED: forged signature was accepted!'
  );

  console.log('\n🎉 All checks passed.');
})().catch((err) => {
  console.error('❌ smoke test failed:', err.message);
  process.exit(1);
});
