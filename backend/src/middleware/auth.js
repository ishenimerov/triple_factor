/** Express middleware that requires a valid final SESSION JWT. */

const { verifySessionToken } = require('../utils/tokens');

module.exports = function requireSession(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }
  try {
    req.user = verifySessionToken(match[1]);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
};
