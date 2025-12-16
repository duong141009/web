const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// =========================
// MIDDLEWARE
// =========================
app.use(cors());
app.use(express.json());

// =========================
// FILE DATA
// =========================
const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, "[]");
}
function readUsers() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
}
function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// =========================
// VALIDATION
// =========================
function normalizePhone(phone) {
  let p = String(phone || "").replace(/\D/g, "");
  if (p.startsWith("0")) p = p.slice(1);
  return p;
}
function isValidPhone(p) {
  return /^\d{9}$/.test(p);
}
function isValidEmail(email) {
  return !email || email.includes("@");
}

// =========================
// HEALTH CHECK
// =========================
app.get("/", (req, res) => res.send("API OK"));

// ======================================================
// AUTH – REGISTER
// POST /api/register
// POST /api/auth/register
// ======================================================
app.post(["/api/register", "/api/auth/register"], (req, res) => {
  const { username, password, fullname, email = "", phone } = req.body;

  if (!username || !password || !fullname || !phone)
    return res.status(400).json({ success: false, message: "Thiếu dữ liệu" });

  const u = username.trim();
  const p = password;
  const fn = fullname.trim();
  const em = email.trim();
  const ph = normalizePhone(phone);

  if (u.length < 6 || u.length > 15 || !/^[a-zA-Z0-9]+$/.test(u))
    return res.status(400).json({ success: false, message: "Username không hợp lệ" });

  if (p.length < 8 || p.length > 20)
    return res.status(400).json({ success: false, message: "Mật khẩu không hợp lệ" });

  if (!fn)
    return res.status(400).json({ success: false, message: "Họ tên không hợp lệ" });

  if (!isValidEmail(em))
    return res.status(400).json({ success: false, message: "Email phải có @" });

  if (!isValidPhone(ph))
    return res.status(400).json({ success: false, message: "SĐT phải 9 số, bỏ số 0 đầu" });

  const users = readUsers();
  if (users.find(x => x.username === u))
    return res.status(409).json({ success: false, message: "Username đã tồn tại" });

  const now = new Date().toISOString();
  users.push({
    username: u,
    password: p,          // GĐ1: plain text
    fullname: fn,
    email: em,
    phone: ph,
    rank: "Thứ hạng 100 khác",
    createdAt: now,
    lastLogin: null
  });

  saveUsers(users);
  res.status(201).json({ success: true });
});

// ======================================================
// AUTH – LOGIN
// POST /api/login
// POST /api/auth/login
// ======================================================
app.post(["/api/login", "/api/auth/login"], (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: "Thiếu dữ liệu" });

  const users = readUsers();
  const user = users.find(u => u.username === username && u.password === password);

  if (!user)
    return res.status(401).json({ success: false, message: "Sai tài khoản hoặc mật khẩu" });

  user.lastLogin = new Date().toISOString();
  saveUsers(users);

  res.json({ success: true, user: { username: user.username } });
});

// ======================================================
// USER DETAILS
// GET /api/users/:username
// GET /api/user-details/:username   (legacy frontend)
// ======================================================
app.get(["/api/users/:username", "/api/user-details/:username"], (req, res) => {
  const username = req.params.username;
  const users = readUsers();
  const user = users.find(u => u.username === username);

  if (!user)
    return res.status(404).json({ success: false, message: "Không tìm thấy user" });

  res.json({
    success: true,
    data: {
      username: user.username,
      fullname: user.fullname,
      email: user.email,
      phone: user.phone,
      rank: user.rank,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    }
  });
});

// ======================================================
// CHANGE PASSWORD
// PUT /api/settings/:username/password
// ======================================================
app.put("/api/settings/:username/password", (req, res) => {
  const { username } = req.params;
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword)
    return res.status(400).json({ success: false, message: "Thiếu dữ liệu" });

  const users = readUsers();
  const user = users.find(u => u.username === username);

  if (!user)
    return res.status(404).json({ success: false, message: "Không tìm thấy user" });

  if (user.password !== oldPassword)
    return res.status(401).json({ success: false, message: "Mật khẩu cũ sai" });

  if (newPassword.length < 8 || newPassword.length > 20)
    return res.status(400).json({ success: false, message: "Mật khẩu mới không hợp lệ" });

  user.password = newPassword;
  saveUsers(users);

  res.json({ success: true });
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
