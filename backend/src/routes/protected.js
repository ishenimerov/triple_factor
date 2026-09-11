/** Example protected resource — a stand-in for the "social media" feed. */

const express = require('express');
const requireSession = require('../middleware/auth');

const router = express.Router();

// Only reachable with a valid session JWT (i.e. after all 3 factors passed).
router.get('/feed', requireSession, (req, res) => {
  res.json({
    message: `Welcome to your feed, @${req.user.username}!`,
    posts: [
      { id: 1, author: 'alice', text: 'Just secured my account with 3 factors 🔐' },
      { id: 2, author: 'bob', text: 'OTP + crypto challenge = peace of mind.' },
    ],
  });
});

router.get('/me', requireSession, (req, res) => {
  res.json({ id: req.user.sub, username: req.user.username });
});

module.exports = router;
