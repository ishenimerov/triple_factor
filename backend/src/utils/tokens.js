/**
 * JWT helpers.
 *
 * Two kinds of token are used:
 *
 *  1. STAGE tokens  - short-lived, issued between authentication factors. They
 *                     record how far through the 3-factor flow a user has
 *                     progressed (`stage`). They are NOT a valid session.
 *
 *  2. SESSION token - the final JWT issued only after ALL three factors pass.
 *                     This is what protects real API routes.
 */

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const SESSION_TTL = process.env.JWT_EXPIRES_IN || '1h';

// Ordered list of authentication stages.
const STAGES = { OTP: 'otp', CHALLENGE: 'challenge' };

function signStageToken(userId, stage) {
  // Stage tokens are intentionally short-lived (5 minutes) to bound the login
  // window across factors.
  return jwt.sign({ sub: userId, typ: 'stage', stage }, SECRET, {
    expiresIn: '5m',
  });
}

function verifyStageToken(token, expectedStage) {
  const payload = jwt.verify(token, SECRET);
  if (payload.typ !== 'stage') throw new Error('Not a stage token');
  if (payload.stage !== expectedStage) throw new Error('Wrong stage');
  return payload;
}

function signSessionToken(user) {
  return jwt.sign(
    { sub: user.id, typ: 'session', username: user.username },
    SECRET,
    { expiresIn: SESSION_TTL }
  );
}

function verifySessionToken(token) {
  const payload = jwt.verify(token, SECRET);
  if (payload.typ !== 'session') throw new Error('Not a session token');
  return payload;
}

module.exports = {
  STAGES,
  signStageToken,
  verifyStageToken,
  signSessionToken,
  verifySessionToken,
};
