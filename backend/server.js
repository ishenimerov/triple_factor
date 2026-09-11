require('dotenv').config();

const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/routes/auth');
const protectedRoutes = require('./src/routes/protected');

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api', protectedRoutes);

// Fallback 404 for unknown API routes
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`[server] 3FA backend listening on http://localhost:${PORT}`);
  if (!process.env.JWT_SECRET) {
    console.warn('[server] WARNING: JWT_SECRET not set — using an insecure default. Create a .env file.');
  }
});
