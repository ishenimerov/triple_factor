import { useState } from 'react';
import { api } from './api.js';
import { generateAndStoreKey, signChallenge } from './crypto.js';

const FACTORS = [
  { n: 1, label: 'Password', hint: 'something you know' },
  { n: 2, label: 'Email OTP', hint: 'something you have' },
  { n: 3, label: 'Crypto key', hint: 'something you hold' },
];

function Stepper({ step }) {
  return (
    <ol className="stepper">
      {FACTORS.map((f) => (
        <li
          key={f.n}
          className={step > f.n ? 'done' : step === f.n ? 'active' : ''}
        >
          <span className="dot">{step > f.n ? '✓' : f.n}</span>
          <div>
            <strong>{f.label}</strong>
            <em>{f.hint}</em>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function App() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [step, setStep] = useState(1); // 1=password 2=otp 3=challenge 4=done
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // form fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');

  // flow state
  const [stageToken, setStageToken] = useState('');
  const [challenge, setChallenge] = useState('');
  const [otpPreviewUrl, setOtpPreviewUrl] = useState('');
  const [session, setSession] = useState(null); // { token, user }
  const [feed, setFeed] = useState(null);

  const reset = () => {
    setStep(1);
    setError('');
    setNotice('');
    setOtp('');
    setPassword('');
    setStageToken('');
    setChallenge('');
    setOtpPreviewUrl('');
  };

  const wrap = (fn) => async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---- Registration -------------------------------------------------------
  const handleRegister = wrap(async () => {
    const publicKey = await generateAndStoreKey(username);
    await api.register({ username, email, password, publicKey });
    setNotice('Account created — a device key was generated and stored on this device. Now log in.');
    setMode('login');
    reset();
  });

  // ---- Factor 1: password -------------------------------------------------
  const handlePassword = wrap(async () => {
    const r = await api.loginPassword({ username, password });
    setStageToken(r.stageToken);
    setOtpPreviewUrl(r.otpPreviewUrl || '');
    if (r.devOtp) setOtp(r.devOtp); // dev convenience if server exposes it
    setNotice(r.message);
    setStep(2);
  });

  // ---- Factor 2: OTP ------------------------------------------------------
  const handleOtp = wrap(async () => {
    const r = await api.loginOtp({ stageToken, otp });
    setStageToken(r.stageToken);
    setChallenge(r.challenge);
    setNotice(r.message);
    setStep(3);
  });

  // ---- Factor 3: crypto challenge ----------------------------------------
  const handleChallenge = wrap(async () => {
    const signature = await signChallenge(username, challenge);
    const r = await api.loginChallenge({ stageToken, signature });
    setSession({ token: r.token, user: r.user });
    setNotice(r.message);
    setStep(4);
    const f = await api.feed(r.token);
    setFeed(f);
  });

  const logout = () => {
    setSession(null);
    setFeed(null);
    setUsername('');
    reset();
  };

  // ---- Logged-in view -----------------------------------------------------
  if (session && step === 4) {
    return (
      <div className="page">
        <div className="card">
          <div className="badge">🔓 Authenticated with 3 factors</div>
          <h1>Hi @{session.user.username}</h1>
          <p className="muted">{session.user.email}</p>
          {feed && (
            <>
              <p>{feed.message}</p>
              <div className="feed">
                {feed.posts.map((p) => (
                  <div className="post" key={p.id}>
                    <b>@{p.author}</b>
                    <span>{p.text}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <button className="secondary" onClick={logout}>Log out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card">
        <div className="brand">🔐 3FA Social</div>
        <h1>{mode === 'register' ? 'Create account' : 'Secure sign in'}</h1>
        <p className="muted">
          Triple-factor authentication: password + email OTP + a cryptographic
          device key.
        </p>

        {mode === 'login' && <Stepper step={step} />}

        {error && <div className="alert error">{error}</div>}
        {notice && <div className="alert notice">{notice}</div>}

        {/* ---------------- REGISTER ---------------- */}
        {mode === 'register' && (
          <form onSubmit={handleRegister}>
            <label>Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
            </label>
            <label>Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>Password (min 8 chars)
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
            </label>
            <p className="hint">A device key pair will be generated in your browser. The private key stays on this device.</p>
            <button disabled={busy}>{busy ? 'Creating…' : 'Register'}</button>
            <button type="button" className="link" onClick={() => { setMode('login'); reset(); }}>
              Already have an account? Sign in
            </button>
          </form>
        )}

        {/* ---------------- LOGIN STEP 1 ---------------- */}
        {mode === 'login' && step === 1 && (
          <form onSubmit={handlePassword}>
            <label>Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
            </label>
            <label>Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
            <button disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
            <button type="button" className="link" onClick={() => { setMode('register'); reset(); }}>
              Need an account? Register
            </button>
          </form>
        )}

        {/* ---------------- LOGIN STEP 2: OTP ---------------- */}
        {mode === 'login' && step === 2 && (
          <form onSubmit={handleOtp}>
            <label>Enter the 6-digit code emailed to you
              <input inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} required />
            </label>
            {otpPreviewUrl && (
              <p className="hint">
                Demo inbox: <a href={otpPreviewUrl} target="_blank" rel="noreferrer">open the OTP email ↗</a>
              </p>
            )}
            <button disabled={busy}>{busy ? 'Verifying…' : 'Verify code'}</button>
          </form>
        )}

        {/* ---------------- LOGIN STEP 3: CHALLENGE ---------------- */}
        {mode === 'login' && step === 3 && (
          <form onSubmit={handleChallenge}>
            <p>Final step: prove you hold this device's private key by signing a one-time challenge.</p>
            <div className="challenge">{challenge}</div>
            <button disabled={busy}>{busy ? 'Signing…' : 'Sign challenge & finish'}</button>
          </form>
        )}
      </div>
      <footer>Password · Email OTP · ECDSA P-256 challenge — sessions via JWT</footer>
    </div>
  );
}
