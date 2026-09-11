# Triple Factor Authentication for Social Media

A demonstration social-media sign-in that requires **three independent
authentication factors** before issuing a session:

| # | Factor | Category | Technology |
|---|--------|----------|------------|
| 1 | Password | Something you **know** | bcrypt-hashed password |
| 2 | Email OTP | Something you **have** | 6-digit one-time code via email |
| 3 | Crypto challenge | Something you **hold** | ECDSA P-256 sign/verify (device key) |

After all three succeed, the server issues a **JWT** that authorises access to
protected routes (the "feed").

## Prerequisites

- **Node.js 18 or newer** (developed on Node 20). Check with `node --version`.

## Setup & run

Open **two terminals**.

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env        # Windows PowerShell: copy .env.example .env
npm start
```

The API listens on <http://localhost:4000>. By default it uses an **Ethereal**
test inbox — no real email is sent; a preview link for each OTP email is printed
in the backend console (and surfaced in the UI).

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the printed URL (default <http://localhost:5173>). Vite proxies `/api`
calls to the backend automatically.

## Trying it out

1. **Register** — creates the account, hashes the password, and generates an
   ECDSA key pair in your browser. The private key is saved in this browser's
   `localStorage`; only the public key is sent to the server.
2. **Sign in — Factor 1:** enter username + password.
3. **Factor 2:** an OTP email is generated. In Ethereal mode, click the
   "open the OTP email" link (or read the preview URL in the backend console)
   and enter the 6-digit code.
4. **Factor 3:** click *Sign challenge* — the browser signs the server's nonce
   with your private key.
5. You land on the JWT-protected feed. 🎉

> Because the private key lives in the browser, log in on the **same browser**
> you registered with. (A real product would use a hardware authenticator or a
> key-export/backup flow.)

## Configuration (`backend/.env`)

| Variable | Purpose |
|----------|---------|
| `PORT` | API port (default 4000) |
| `JWT_SECRET` | Secret for signing JWTs — use a long random string |
| `JWT_EXPIRES_IN` | Session lifetime (e.g. `1h`) |
| `EMAIL_MODE` | `ethereal` (fake test inbox) or `smtp` (real email) |
| `SMTP_*`, `MAIL_FROM` | SMTP credentials when `EMAIL_MODE=smtp` |
| `DEV_RETURN_OTP` | `1` returns the OTP in the API response for testing only — never in production |

## Testing

With the backend running (set `DEV_RETURN_OTP=1` so the test can read the code):

```bash
cd backend
DEV_RETURN_OTP=1 npm start        # terminal 1
node smoke-test.js                # terminal 2
```

The smoke test walks through registration and all three factors, accesses the
protected route, and confirms a **forged signature is rejected**.

## Project layout

```
backend/
  server.js                 Express app + route mounting
  src/routes/auth.js        register + the 3-factor login endpoints
  src/routes/protected.js   JWT-protected "feed"
  src/middleware/auth.js    session-JWT guard
  src/utils/tokens.js       stage tokens + session JWT helpers
  src/utils/email.js        OTP email (Ethereal / SMTP)
  src/utils/crypto.js       challenge generation + signature verification
  src/db/store.js           JSON-file data store
  smoke-test.js             end-to-end test of the whole flow
frontend/
  src/App.jsx               multi-step login wizard
  src/crypto.js             Web Crypto keygen + challenge signing
  src/api.js                API client
```

## Security notes (see the report for detail)

- Passwords are stored only as bcrypt hashes.
- OTPs are stored only as SHA-256 hashes, single-use, 5-minute expiry.
- The private key never leaves the client; the server only ever verifies.
- Challenges are single-use random nonces with a 5-minute expiry.
- Progress between factors is carried in short-lived signed **stage tokens**, so
  a client cannot skip a factor.
