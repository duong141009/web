// SHOP KEY backend v3 - file JSON (users, deposits, keys)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== JSON file storage =====
const DATA_FILE = process.env.DATA_FILE || 'data.json';
const dataPath = path.join(__dirname, DATA_FILE);

let db = {
  users: [],     // {id, username, password_hash, email, balance, is_admin, created_at, last_login_at, last_active_at}
  deposits: [],  // {id, user_id, amount, note, status, created_at}
  keys: [],      // {id, user_id, code, pack_type, duration_minutes, created_at, expires_at, device_id}
  seq: { user: 1, deposit: 1, key: 1 }
};

function saveData() {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving data.json:', e);
  }
}

async function ensureAdmin() {
  const adminExists = db.users.find(u => u.username === 'admin');
  if (!adminExists) {
    const hash = await bcrypt.hash('admin123', 10);
    const user = {
      id: db.seq.user++,
      username: 'admin',
      password_hash: hash,
      email: 'admin@example.com',
      balance: 0,
      is_admin: 1,
      created_at: new Date().toISOString(),
      last_login_at: null,
      last_active_at: null
    };
    db.users.push(user);
    saveData();
    console.log('Created default admin: admin / admin123');
  }
}

function loadData() {
  if (!fs.existsSync(dataPath)) {
    console.log('No existing data.json, creating new one.');
    saveData();
    ensureAdmin();
    return;
  }
  try {
    const raw = fs.readFileSync(dataPath, 'utf8');
    db = JSON.parse(raw);
    if (!db.seq) db.seq = { user: 1, deposit: 1, key: 1 };
    db.seq.user = db.seq.user || 1;
    db.seq.deposit = db.seq.deposit || 1;
    db.seq.key = db.seq.key || 1;

    if (!Array.isArray(db.users)) db.users = [];
    if (!Array.isArray(db.deposits)) db.deposits = [];
    if (!Array.isArray(db.keys)) db.keys = [];

    // ensure user fields
    db.users.forEach(u => {
      if (typeof u.balance !== 'number') u.balance = Number(u.balance || 0);
      if (typeof u.is_admin === 'undefined') u.is_admin = 0;
      if (!u.created_at) u.created_at = new Date().toISOString();
      if (!('last_login_at' in u)) u.last_login_at = null;
      if (!('last_active_at' in u)) u.last_active_at = null;
    });

    // ensure key fields
    db.keys.forEach(k => {
      if (!('duration_minutes' in k)) k.duration_minutes = 0;
      if (!('pack_type' in k)) k.pack_type = '';
      if (!('device_id' in k)) k.device_id = null;
      if (!k.created_at) k.created_at = new Date().toISOString();
      // expires_at có thể null
    });

    ensureAdmin();
  } catch (e) {
    console.error('Error reading data.json, resetting DB:', e);
    db = { users: [], deposits: [], keys: [], seq: { user: 1, deposit: 1, key: 1 } };
    ensureAdmin();
  }
}

loadData();

// ===== Helpers =====
function sendError(res, msg, status) {
  res.status(status || 400).json({ error: msg });
}

function authRequired(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return sendError(res, 'Chưa đăng nhập (thiếu token)', 401);
  }
  const token = parts[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = payload;
    next();
  } catch (err) {
    return sendError(res, 'Token không hợp lệ hoặc đã hết hạn', 401);
  }
}

function adminRequired(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return sendError(res, 'Không có quyền admin', 403);
  }
  next();
}

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

// ===== CẤU HÌNH GÓI KEY =====
const PACKS = {
  '1d':   { price: 15000,  minutes: 1 * 24 * 60,  label: '1d'   }, // 15k / 1 ngày
  '3d':   { price: 35000,  minutes: 3 * 24 * 60,  label: '3d'   }, // 35k / 3 ngày
  '30d':  { price: 80000,  minutes: 30 * 24 * 60, label: '30d'  }, // 80k / 1 tháng
  'life': { price: 150000, minutes: 0,            label: 'life' }  // 150k / vĩnh viễn
};

// ===== BASIC ROUTES =====
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'SHOP KEY API v3 (file storage)' });
});

// Đăng ký
app.post('/api/register', async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password) return sendError(res, 'Thiếu username hoặc password');
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendError(res, 'Email không hợp lệ');
  }
  if (password.length < 6) {
    return sendError(res, 'Mật khẩu phải từ 6 ký tự');
  }
  if (db.users.find(u => u.username === username)) {
    return sendError(res, 'Tên tài khoản đã tồn tại');
  }

  const hash = await bcrypt.hash(password, 10);
  const user = {
    id: db.seq.user++,
    username,
    password_hash: hash,
    email,
    balance: 0,
    is_admin: 0,
    created_at: new Date().toISOString(),
    last_login_at: null,
    last_active_at: null
  };
  db.users.push(user);
  saveData();
  res.json({ success: true, message: 'Đăng ký thành công' });
});

// Đăng nhập
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return sendError(res, 'Thiếu username hoặc password');

  const user = db.users.find(u => u.username === username);
  if (!user) return sendError(res, 'Sai tài khoản hoặc mật khẩu', 401);

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return sendError(res, 'Sai tài khoản hoặc mật khẩu', 401);

  user.last_login_at = new Date().toISOString();
  user.last_active_at = user.last_login_at;
  saveData();

  const payload = { id: user.id, username: user.username, is_admin: !!user.is_admin };
  const token = jwt.sign(payload, process.env.JWT_SECRET || 'secret', {
    expiresIn: process.env.JWT_EXPIRES || '7d',
  });

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      balance: user.balance || 0,
      is_admin: !!user.is_admin,
    },
  });
});

// Info user hiện tại
app.get('/api/me', authRequired, (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return sendError(res, 'Không tìm thấy user', 404);

  user.last_active_at = new Date().toISOString();
  saveData();

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    balance: user.balance || 0,
    is_admin: !!user.is_admin,
    created_at: user.created_at,
    last_login_at: user.last_login_at,
    last_active_at: user.last_active_at
  });
});

// ===== NẠP TIỀN (USER) =====
app.post('/api/create-deposit', authRequired, (req, res) => {
  const amount = parseInt(req.body.amount, 10);
  const note = (req.body.note || '').toString().trim();
  if (!amount || amount <= 0) return sendError(res, 'Số tiền không hợp lệ');

  const dep = {
    id: db.seq.deposit++,
    user_id: req.user.id,
    amount,
    note,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  db.deposits.push(dep);
  saveData();
  res.json({ success: true, message: 'Đã tạo yêu cầu nạp (pending)' });
});

app.get('/api/my-deposits', authRequired, (req, res) => {
  const items = db.deposits
    .filter(d => d.user_id === req.user.id)
    .sort((a, b) => b.id - a.id);
  res.json({ items });
});

// ====== MUA KEY (USER) ======
app.post('/api/buy-key', authRequired, (req, res) => {
  const packCode = (req.body.pack || '').toString().toLowerCase();
  const cfg = PACKS[packCode];
  if (!cfg) return sendError(res, 'Gói key không hợp lệ');

  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return sendError(res, 'Không tìm thấy user', 404);

  const balance = user.balance || 0;
  if (balance < cfg.price) {
    return sendError(res, 'Số dư không đủ để mua gói này');
  }

  // trừ tiền
  user.balance = balance - cfg.price;

  // tạo key: tooltx-<label>-<random>
  const randomPart = generateRandomString(16);
  const code = `tooltx-${cfg.label}-${randomPart}`;
  const now = new Date();
  let expires_at = null;

  if (cfg.minutes > 0) {
    expires_at = new Date(now.getTime() + cfg.minutes * 60000).toISOString();
  }

  const key = {
    id: db.seq.key++,
    user_id: user.id,
    code,
    pack_type: cfg.label,
    duration_minutes: cfg.minutes,
    created_at: now.toISOString(),
    expires_at,
    device_id: null
  };

  db.keys.push(key);
  saveData();

  res.json({
    success: true,
    price: cfg.price,
    balance: user.balance,
    key
  });
});

// Danh sách key của user hiện tại
app.get('/api/my-keys', authRequired, (req, res) => {
  const now = new Date();
  const items = db.keys
    .filter(k => k.user_id === req.user.id)
    .sort((a, b) => b.id - a.id)
    .map(k => ({
      ...k,
      is_expired: k.expires_at ? (new Date(k.expires_at) < now) : false
    }));
  res.json({ items });
});

// ===== ADMIN: DEPOSITS =====
app.get('/api/admin/deposits', authRequired, adminRequired, (req, res) => {
  const items = db.deposits
    .slice()
    .sort((a, b) => b.id - a.id)
    .map(d => {
      const u = db.users.find(x => x.id === d.user_id);
      return {
        id: d.id,
        user_id: d.user_id,
        username: u ? u.username : 'unknown',
        amount: d.amount,
        note: d.note,
        status: d.status,
        created_at: d.created_at,
      };
    });
  res.json({ items });
});

app.post('/api/admin/deposits/:id/approve', authRequired, adminRequired, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const dep = db.deposits.find(d => d.id === id);
  if (!dep) return sendError(res, 'Không tìm thấy đơn nạp', 404);
  if (dep.status !== 'pending') return sendError(res, 'Đơn đã được xử lý trước đó');

  const user = db.users.find(u => u.id === dep.user_id);
  if (!user) return sendError(res, 'Không tìm thấy user', 404);

  dep.status = 'approved';
  user.balance = (user.balance || 0) + dep.amount;
  saveData();
  res.json({ success: true, message: 'Đã duyệt và cộng tiền', balance: user.balance });
});

app.post('/api/admin/deposits/:id/reject', authRequired, adminRequired, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const dep = db.deposits.find(d => d.id === id);
  if (!dep) return sendError(res, 'Không tìm thấy đơn nạp', 404);
  if (dep.status !== 'pending') return sendError(res, 'Đơn đã được xử lý trước đó');

  dep.status = 'rejected';
  saveData();
  res.json({ success: true, message: 'Đã từ chối đơn nạp' });
});

// ===== ADMIN: USERS & KEYS =====

// Danh sách users (tổng tiền đã nạp + số key)
app.get('/api/admin/users', authRequired, adminRequired, (req, res) => {
  const approvedByUser = {};
  db.deposits.forEach(d => {
    if (d.status === 'approved') {
      approvedByUser[d.user_id] = (approvedByUser[d.user_id] || 0) + (d.amount || 0);
    }
  });

  const keyCountByUser = {};
  db.keys.forEach(k => {
    if (!k.user_id) return;
    keyCountByUser[k.user_id] = (keyCountByUser[k.user_id] || 0) + 1;
  });

  const items = db.users.map(u => ({
    id: u.id,
    username: u.username,
    email: u.email,
    balance: u.balance || 0,
    is_admin: !!u.is_admin,
    created_at: u.created_at,
    last_login_at: u.last_login_at,
    last_active_at: u.last_active_at,
    total_deposit_approved: approvedByUser[u.id] || 0,
    key_count: keyCountByUser[u.id] || 0,
  }));

  res.json({ items });
});

// Thông tin chi tiết 1 user (kèm deposits + keys)
app.get('/api/admin/users/:id', authRequired, adminRequired, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.users.find(u => u.id === id);
  if (!user) return sendError(res, 'Không tìm thấy user', 404);

  const userDeposits = db.deposits
    .filter(d => d.user_id === id)
    .sort((a, b) => b.id - a.id);

  const userKeys = db.keys
    .filter(k => k.user_id === id)
    .sort((a, b) => b.id - a.id);

  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      balance: user.balance || 0,
      is_admin: !!user.is_admin,
      created_at: user.created_at,
      last_login_at: user.last_login_at,
      last_active_at: user.last_active_at,
    },
    deposits: userDeposits,
    keys: userKeys,
  });
});

// Xoá 1 key
app.post('/api/admin/keys/:id/delete', authRequired, adminRequired, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const idx = db.keys.findIndex(k => k.id === id);
  if (idx === -1) return sendError(res, 'Không tìm thấy key', 404);
  db.keys.splice(idx, 1);
  saveData();
  res.json({ success: true, message: 'Đã xoá key' });
});

// Reset thiết bị cho key (mỗi key 1 thiết bị, reset = xoá device_id)
app.post('/api/admin/keys/:id/reset-device', authRequired, adminRequired, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const key = db.keys.find(k => k.id === id);
  if (!key) return sendError(res, 'Không tìm thấy key', 404);

  key.device_id = null;
  saveData();
  res.json({ success: true, message: 'Đã reset thiết bị cho key' });
});

// Xoá 1 tài khoản (và toàn bộ nạp, key liên quan)
app.post('/api/admin/users/:id/delete', authRequired, adminRequired, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const idx = db.users.findIndex(u => u.id === id);
  if (idx === -1) return sendError(res, 'Không tìm thấy user', 404);

  if (db.users[idx].is_admin) {
    return sendError(res, 'Không được xoá tài khoản admin', 403);
  }

  db.users.splice(idx, 1);
  db.deposits = db.deposits.filter(d => d.user_id !== id);
  db.keys = db.keys.filter(k => k.user_id !== id);

  saveData();
  res.json({ success: true, message: 'Đã xoá tài khoản và toàn bộ dữ liệu liên quan' });
});

// Admin + / - tiền
app.post('/api/admin/users/:id/adjust-balance', authRequired, adminRequired, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const delta = Number(req.body.delta || 0);
  const reason = (req.body.reason || '').toString();

  if (!delta || isNaN(delta)) return sendError(res, 'delta không hợp lệ');

  const user = db.users.find(u => u.id === id);
  if (!user) return sendError(res, 'Không tìm thấy user', 404);

  user.balance = (user.balance || 0) + delta;
  saveData();
  res.json({
    success: true,
    message: 'Đã chỉnh số dư (' + (reason || 'no reason') + ')',
    balance: user.balance
  });
});

// Admin tạo key thủ công
// body: { time_label, minutes, random_len, user_id }
app.post('/api/admin/keys/manual-create', authRequired, adminRequired, (req, res) => {
  let { time_label, minutes, random_len, user_id } = req.body;
  time_label = (time_label || 'custom').toString();
  minutes = parseInt(minutes, 10) || 0;
  random_len = parseInt(random_len, 10) || 12;

  let user = null;
  let uid = null;
  if (user_id !== null && user_id !== undefined && user_id !== '') {
    uid = parseInt(user_id, 10);
    user = db.users.find(u => u.id === uid);
    if (!user) return sendError(res, 'Không tìm thấy user để gán key', 404);
  }

  const randomPart = generateRandomString(random_len);
  const code = `tooltx-${time_label}-${randomPart}`;

  const now = new Date();
  let expires_at = null;
  if (minutes > 0) {
    expires_at = new Date(now.getTime() + minutes * 60000).toISOString();
  }

  const key = {
    id: db.seq.key++,
    user_id: uid,           // có thể null
    code,
    pack_type: time_label,
    duration_minutes: minutes,
    created_at: now.toISOString(),
    expires_at,
    device_id: null
  };

  db.keys.push(key);
  saveData();

  res.json({
    success: true,
    key
  });
});

// ===== START SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('SHOP KEY file-backend v3 đang chạy trên port', PORT);
});
