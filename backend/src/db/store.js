/**
 * Tiny JSON-file data store.
 *
 * Deliberately dependency-free (no native modules) so the project runs on any
 * machine with only Node installed. It persists a single JSON object to disk
 * and keeps an in-memory copy for fast reads. This is fine for a demo / academic
 * project; a production system would use a real database.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: [] }, null, 2));
  }
}

function load() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { users: [] };
  }
}

function persist(db) {
  ensureFile();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// In-memory cache, hydrated once at startup.
const db = load();

function save() {
  persist(db);
}

module.exports = {
  /** Return the user with this username (case-insensitive), or undefined. */
  findUserByUsername(username) {
    const u = String(username || '').toLowerCase();
    return db.users.find((x) => x.username.toLowerCase() === u);
  },

  /** Return the user with this email (case-insensitive), or undefined. */
  findUserByEmail(email) {
    const e = String(email || '').toLowerCase();
    return db.users.find((x) => x.email.toLowerCase() === e);
  },

  /** Return the user by id, or undefined. */
  findUserById(id) {
    return db.users.find((x) => x.id === id);
  },

  /** Insert a new user record and persist. */
  createUser(user) {
    db.users.push(user);
    save();
    return user;
  },

  /** Persist any in-place mutations to an existing user record. */
  saveUser() {
    save();
  },
};
