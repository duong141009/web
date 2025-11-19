require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ====== SQLite setup ======
const DB_FILE = process.env.DB_FILE || 'database.sqlite';
const dbPath = path.join(__dirname, DB_FILE);

const db = new sqlite3.Database(dbPath);

// Tạo bảng nếu chưa có
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    email TEXT,
    balance INTEGER NOT NULL DEFAULT 0,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    note TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );`);

  db.run(`CREATE TABLE IF NOT EXISTS keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    pack_type TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );`);

  // Tạo admin mặc định nếu chưa có
  db.get('SELECT id FROM users WHERE username = ?', ['admin'], async (err, row) => {
    if (err) {
      console.error('Error checking admin:', err);
      return;
    }
    if (!row) {
      const defaultPass = 'admin123';
      const hash = await bcrypt.hash(defaultPass, 10);
      db.run(
        'INSERT INTO users (username, password_hash, email, balance, is_admin) VALUES (?, ?, ?, ?, ?)',
        ['admin', hash, 'admin@example.com', 0, 1],
        (err2) => {
          if (err2) {
            console.error('Error creating default admin:', err2);
          } else {
            console.log('Default admin created: admin / admin123');
          }
        }
      );
    }
  });
});

// ====== Helper ======
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
    req.user = payload; // { id, username, is_admin }
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
  res.json({ status: 'ok', message: 'SHOP KEY API (Node + SQLite)' });
});

// Đăng ký
app.post('/api/register', (req, res) => {
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

  db.get('SELECT id FROM users WHERE username = ?', [username], async (err, row) => {
    if (err) {
      console.error(err);
      return sendError(res, 'Lỗi database');
    }
    if (row) {
      return sendError(res, 'Tên tài khoản đã tồn tại');
    }

    try {
      const hash = await bcrypt.hash(password, 10);
      db.run(
        'INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)',
        [username, hash, email],
        function (err2) {
          if (err2) {
            console.error(err2);
            return sendError(res, 'Lỗi tạo user');
          }
          res.json({ success: true, message: 'Đăng ký thành công' });
        }
      );
    } catch (e) {
      console.error(e);
      return sendError(res, 'Lỗi server', 500);
    }
  });
});

// Đăng nhập
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return sendError(res, 'Thiếu username hoặc password');
  }

  db.get(
    'SELECT id, username, password_hash, balance, is_admin FROM users WHERE username = ?',
    [username],
    async (err, row) => {
      if (err) {
        console.error(err);
        return sendError(res, 'Lỗi database');
      }
      if (!row) {
        return sendError(res, 'Sai tài khoản hoặc mật khẩu', 401);
      }

      const ok = await bcrypt.compare(password, row.password_hash);
      if (!ok) {
        return sendError(res, 'Sai tài khoản hoặc mật khẩu', 401);
      }

      const payload = {
        id: row.id,
        username: row.username,
        is_admin: !!row.is_admin,
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
          id: row.id,
          username: row.username,
          balance: Number(row.balance) || 0,
          is_admin: !!row.is_admin,
        },
      });
    }
  );
});

// Thông tin user hiện tại
app.get('/api/me', authRequired, (req, res) => {
  db.get(
    'SELECT id, username, email, balance, is_admin FROM users WHERE id = ?',
    [req.user.id],
    (err, row) => {
      if (err) {
        console.error(err);
        return sendError(res, 'Lỗi database', 500);
      }
      if (!row) {
        return sendError(res, 'Không tìm thấy user', 404);
      }
      res.json({
        id: row.id,
        username: row.username,
        email: row.email,
        balance: Number(row.balance) || 0,
        is_admin: !!row.is_admin,
      });
    }
  );
});

// Tạo yêu cầu nạp
app.post('/api/create-deposit', authRequired, (req, res) => {
  const amount = parseInt(req.body.amount, 10);
  const note = (req.body.note || '').toString().trim();
  if (!amount || amount <= 0) {
    return sendError(res, 'Số tiền không hợp lệ');
  }

  db.run(
    'INSERT INTO deposits (user_id, amount, note) VALUES (?, ?, ?)',
    [req.user.id, amount, note],
    function (err) {
      if (err) {
        console.error(err);
        return sendError(res, 'Lỗi database');
      }
      res.json({ success: true, message: 'Đã tạo yêu cầu nạp (pending)' });
    }
  );
});

// Lịch sử nạp của user
app.get('/api/my-deposits', authRequired, (req, res) => {
  db.all(
    'SELECT id, amount, note, status, created_at FROM deposits WHERE user_id = ? ORDER BY id DESC',
    [req.user.id],
    (err, rows) => {
      if (err) {
        console.error(err);
        return sendError(res, 'Lỗi database');
      }
      res.json({ items: rows });
    }
  );
});

// Admin: list all deposits
app.get('/api/admin/deposits', authRequired, adminRequired, (req, res) => {
  db.all(
    `SELECT d.id, d.amount, d.note, d.status, d.created_at, u.username
     FROM deposits d
     JOIN users u ON d.user_id = u.id
     ORDER BY d.id DESC`,
    [],
    (err, rows) => {
      if (err) {
        console.error(err);
        return sendError(res, 'Lỗi database', 500);
      }
      res.json({ items: rows });
    }
  );
});

// Admin: approve (cộng tiền)
app.post('/api/admin/deposits/:id/approve', authRequired, adminRequired, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return sendError(res, 'Thiếu id');

  db.get('SELECT * FROM deposits WHERE id = ?', [id], (err, dep) => {
    if (err) {
      console.error(err);
      return sendError(res, 'Lỗi database', 500);
    }
    if (!dep) return sendError(res, 'Không tìm thấy đơn nạp', 404);
    if (dep.status !== 'pending') return sendError(res, 'Đơn đã được xử lý trước đó');

    db.serialize(() => {
      db.run('UPDATE deposits SET status = "approved" WHERE id = ?', [id]);
      db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [dep.amount, dep.user_id]);
    });

    res.json({ success: true, message: 'Đã duyệt và cộng tiền' });
  });
});

// Admin: reject
app.post('/api/admin/deposits/:id/reject', authRequired, adminRequired, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return sendError(res, 'Thiếu id');

  db.run(
    'UPDATE deposits SET status = "rejected" WHERE id = ? AND status = "pending"',
    [id],
    function (err) {
      if (err) {
        console.error(err);
        return sendError(res, 'Lỗi database', 500);
      }
      if (this.changes === 0) {
        return sendError(res, 'Không thể từ chối (có thể đã xử lý trước đó)');
      }
      res.json({ success: true, message: 'Đã từ chối đơn nạp' });
    }
  );
});

// ====== START SERVER ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('SHOP KEY SQLite backend chạy trên port', PORT);
});
