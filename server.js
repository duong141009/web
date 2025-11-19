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

// ====== Simple JSON file storage ======
const DATA_FILE = process.env.DATA_FILE || 'data.json';
const dataPath = path.join(__dirname, DATA_FILE);

let db = {
  users: [],
  deposits: [],
  keys: [],
  seq: {
    user: 1,
    deposit: 1,
    key: 1
  }
};

function loadData() {
  if (!fs.existsSync(dataPath)) {
    console.log('No data.json, will create with default admin.');
    saveData();
    ensureAdmin();
    return;
  }
  try {
    const raw = fs.readFileSync(dataPath, 'utf8');
    db = JSON.parse(raw);
    ensureAdmin();
  } catch (e) {
    console.error('Error reading data.json, using empty DB:', e);
    db = { users: [], deposits: [], keys: [], seq: { user: 1, deposit: 1, key: 1 } };
    ensureAdmin();
  }
}

function saveData() {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving data.json:', e);
  }
}

// Create default admin if not exist
async function ensureAdmin() {
  const exists = db.users.find(u => u.username === 'admin');
  if (!exists) {
    const hash = await bcrypt.hash('admin123', 10);
    const user = {
      id: db.seq.user++,
      username: 'admin',
      password_hash: hash,
      email: 'admin@example.com',
      balance: 0,
      is_admin: 1,
      created_at: new Date().toISOString()
    };
    db.users.push(user);
    saveData();
    console.log('Created default admin: admin / admin123');
  }
}

loadData();

// ====== Helpers ======
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

// ====== ROUTES ======
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'SHOP KEY API (Node + JSON file)' });
});

// Đăng ký
app.post('/api/register', async (req, res) => {
  const { username, password, email } = req.body;
  if (!username || !password) {
    return sendError(res, 'Thiếu username hoặc password');
  }
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
    created_at: new Date().toISOString()
  };
  db.users.push(user);
  saveData();
  res.json({ success: true, message: 'Đăng ký thành công' });
});

// Đăng nhập
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return sendError(res, 'Thiếu username hoặc password');
  }
  const user = db.users.find(u => u.username === username);
  if (!user) {
    return sendError(res, 'Sai tài khoản hoặc mật khẩu', 401);
  }
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return sendError(res, 'Sai tài khoản hoặc mật khẩu', 401);
  }

  const payload = {
    id: user.id,
    username: user.username,
    is_admin: !!user.is_admin
  };
  const token = jwt.sign(
    payload,
    process.env.JWT_SECRET || 'secret',
    { expiresIn: process.env.JWT_EXPIRES || '7d' }
  );

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      balance: user.balance || 0,
      is_admin: !!user.is_admin
    }
  });
});

// Thông tin user
app.get('/api/me', authRequired, (req, res) => {
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) {
    return sendError(res, 'Không tìm thấy user', 404);
  }
  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    balance: user.balance || 0,
    is_admin: !!user.is_admin
  });
});

// Tạo yêu cầu nạp
app.post('/api/create-deposit', authRequired, (req, res) => {
  const amount = parseInt(req.body.amount, 10);
  const note = (req.body.note || '').toString().trim();
  if (!amount || amount <= 0) {
    return sendError(res, 'Số tiền không hợp lệ');
  }
  const dep = {
    id: db.seq.deposit++,
    user_id: req.user.id,
    amount,
    note,
    status: 'pending',
    created_at: new Date().toISOString()
  };
  db.deposits.push(dep);
  saveData();
  res.json({ success: true, message: 'Đã tạo yêu cầu nạp (pending)' });
});

// Lịch sử nạp của user
app.get('/api/my-deposits', authRequired, (req, res) => {
  const items = db.deposits
    .filter(d => d.user_id === req.user.id)
    .sort((a, b) => b.id - a.id);
  res.json({ items });
});

// Admin: list all deposits
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
        created_at: d.created_at
      };
    });
  res.json({ items });
});

// Admin: approve
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
  res.json({ success: true, message: 'Đã duyệt và cộng tiền' });
});

// Admin: reject
app.post('/api/admin/deposits/:id/reject', authRequired, adminRequired, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const dep = db.deposits.find(d => d.id === id);
  if (!dep) return sendError(res, 'Không tìm thấy đơn nạp', 404);
  if (dep.status !== 'pending') return sendError(res, 'Đơn đã được xử lý trước đó');

  dep.status = 'rejected';
  saveData();
  res.json({ success: true, message: 'Đã từ chối đơn nạp' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('SHOP KEY file-backend đang chạy trên port', PORT);
});
