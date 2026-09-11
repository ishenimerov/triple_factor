/**
 * Authentication routes implementing the Triple-Factor flow.
 *
 *   register                 -> create account (password hash + public key)
 *   POST /login/password     -> Factor 1: verify password, email an OTP,
 *                               return a stage token (stage=otp)
 *   POST /login/otp          -> Factor 2: verify OTP, create a crypto challenge,
 *                               return a stage token (stage=challenge) + nonce
 *   POST /login/challenge    -> Factor 3: verify signature, issue SESSION JWT
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const store = require('../db/store');
const { sendOtpEmail } = require('../utils/email');
const {
  makeChallenge,
  verifyChallengeSignature,
  isValidP256PublicJwk,
} = require('../utils/crypto');
const {
  STAGES,
  signStageToken,
  verifyStageToken,
  signSessionToken,
} = require('../utils/tokens');

const router = express.Router();

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
router.post('/register', async (req, res) => {
  const { username, email, password, publicKey } = req.body || {};

  if (!username || !email || !password || !publicKey) {
    return res
      .status(400)
      .json({ error: 'username, email, password and publicKey are required' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (!isValidP256PublicJwk(publicKey)) {
    return res.status(400).json({ error: 'Invalid public key (expected P-256 public JWK)' });
  }
  if (store.findUserByUsername(username)) {
    return res.status(409).json({ error: 'Username already taken' });
  }
  if (store.findUserByEmail(email)) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(String(password), 10);

  const user = store.createUser({
    id: crypto.randomUUID(),
    username,
    email,
    passwordHash,
    publicKey, // stored as a JWK; the private key never reaches us
    createdAt: new Date().toISOString(),
    otp: null, // { hash, expiresAt }
    challenge: null, // { value, expiresAt }
  });

  return res.status(201).json({
    message: 'Registered. You can now log in with all three factors.',
    username: user.username,
  });
});

// ---------------------------------------------------------------------------
// Factor 1: password
// ---------------------------------------------------------------------------
router.post('/login/password', async (req, res) => {
  const { username, password } = req.body || {};
  const user = store.findUserByUsername(username);

  // Verify password. Use a constant-ish path to avoid leaking which part failed.
  const ok = user && (await bcrypt.compare(String(password || ''), user.passwordHash));
  if (!ok) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Generate a 6-digit OTP, store only its hash + expiry.
  const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  user.otp = {
    hash: crypto.createHash('sha256').update(otp).digest('hex'),
    expiresAt: Date.now() + OTP_TTL_MS,
  };
  store.saveUser();

  let previewUrl = null;
  try {
    previewUrl = await sendOtpEmail(user.email, otp);
  } catch (err) {
    console.error('[auth] Failed to send OTP email:', err.message);
    return res.status(502).json({ error: 'Could not send OTP email' });
  }

  return res.json({
    message: 'Password accepted. An OTP has been emailed to you.',
    stageToken: signStageToken(user.id, STAGES.OTP),
    // Ethereal preview URL (only present in ethereal mode) so you can read the
    // emailed code in the browser during a demo.
    otpPreviewUrl: previewUrl,
    // Testing convenience ONLY. Off unless DEV_RETURN_OTP=1 is set. Never enable
    // in production — it defeats the second factor.
    ...(process.env.DEV_RETURN_OTP === '1' ? { devOtp: otp } : {}),
  });
});

// ---------------------------------------------------------------------------
// Factor 2: email OTP
// ---------------------------------------------------------------------------
router.post('/login/otp', (req, res) => {
  const { stageToken, otp } = req.body || {};

  let payload;
  try {
    payload = verifyStageToken(stageToken, STAGES.OTP);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired stage token' });
  }

  const user = store.findUserById(payload.sub);
  if (!user || !user.otp) {
    return res.status(400).json({ error: 'No pending OTP. Restart login.' });
  }
  if (Date.now() > user.otp.expiresAt) {
    user.otp = null;
    store.saveUser();
    return res.status(401).json({ error: 'OTP expired. Restart login.' });
  }

  const providedHash = crypto.createHash('sha256').update(String(otp || '')).digest('hex');
  const match =
    providedHash.length === user.otp.hash.length &&
    crypto.timingSafeEqual(Buffer.from(providedHash), Buffer.from(user.otp.hash));
  if (!match) {
    return res.status(401).json({ error: 'Incorrect OTP' });
  }

  // OTP consumed. Now create the crypto challenge for factor 3.
  user.otp = null;
  const challenge = makeChallenge();
  user.challenge = { value: challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS };
  store.saveUser();

  return res.json({
    message: 'OTP verified. Sign the challenge with your private key.',
    stageToken: signStageToken(user.id, STAGES.CHALLENGE),
    challenge,
  });
});

// ---------------------------------------------------------------------------
// Factor 3: cryptographic challenge-response
// ---------------------------------------------------------------------------
router.post('/login/challenge', (req, res) => {
  const { stageToken, signature } = req.body || {};

  let payload;
  try {
    payload = verifyStageToken(stageToken, STAGES.CHALLENGE);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired stage token' });
  }

  const user = store.findUserById(payload.sub);
  if (!user || !user.challenge) {
    return res.status(400).json({ error: 'No pending challenge. Restart login.' });
  }
  if (Date.now() > user.challenge.expiresAt) {
    user.challenge = null;
    store.saveUser();
    return res.status(401).json({ error: 'Challenge expired. Restart login.' });
  }

  const valid = verifyChallengeSignature(user.publicKey, user.challenge.value, signature);

  // Consume the challenge whether or not it verified (single use).
  user.challenge = null;
  store.saveUser();

  if (!valid) {
    return res.status(401).json({ error: 'Signature verification failed' });
  }

  // All three factors passed -> issue the real session token.
  return res.json({
    message: 'All three factors verified. Welcome!',
    token: signSessionToken(user),
    user: { username: user.username, email: user.email },
  });
});

module.exports = router;
