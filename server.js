Server.js
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// =====================================
// FIREBASE INIT
// =====================================
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("Missing FIREBASE_SERVICE_ACCOUNT env");
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const usersCol = db.collection("users");

// =====================================
// VALIDATION
// =====================================
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

// =====================================
// HEALTH CHECK
// =====================================
app.get("/", (req, res) => res.send("API OK - Firebase"));

// =====================================
// REGISTER
// POST /api/register
// POST /api/auth/register
// =====================================
app.post(["/api/register", "/api/auth/register"], async (req, res) => {
  try {
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

    const userRef = usersCol.doc(u);
    const snap = await userRef.get();

    if (snap.exists)
      return res.status(409).json({ success: false, message: "Username đã tồn tại" });

    const now = new Date().toISOString();

    await userRef.set({
      username: u,
      password: p, // GĐ1: chưa hash
      fullname: fn,
      email: em,
      phone: ph,
      rank: "Thứ hạng 100 khác",
      createdAt: now,
      lastLogin: null,
    });

    res.status(201).json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// =====================================
// LOGIN
// POST /api/login
// POST /api/auth/login
// =====================================
app.post(["/api/login", "/api/auth/login"], async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: "Thiếu dữ liệu" });

    const ref = usersCol.doc(username);
    const snap = await ref.get();

    if (!snap.exists || snap.data().password !== password)
      return res.status(401).json({ success: false, message: "Sai tài khoản hoặc mật khẩu" });

    await ref.update({ lastLogin: new Date().toISOString() });

    res.json({ success: true, user: { username } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// =====================================
// USER DETAILS
// GET /api/users/:username
// GET /api/user-details/:username
// =====================================
app.get(["/api/users/:username", "/api/user-details/:username"], async (req, res) => {
  try {
    const ref = usersCol.doc(req.params.username);
    const snap = await ref.get();

    if (!snap.exists)
      return res.status(404).json({ success: false, message: "Không tìm thấy user" });

    const u = snap.data();

    res.json({
      success: true,
      data: {
        username: u.username,
        fullname: u.fullname,
        email: u.email,
        phone: u.phone,
        rank: u.rank,
        createdAt: u.createdAt,
        lastLogin: u.lastLogin,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// =====================================
// CHANGE PASSWORD
// PUT /api/settings/:username/password
// =====================================
app.put("/api/settings/:username/password", async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const { username } = req.params;

    if (!oldPassword || !newPassword)
      return res.status(400).json({ success: false, message: "Thiếu dữ liệu" });

    if (newPassword.length < 8 || newPassword.length > 20)
      return res.status(400).json({ success: false, message: "Mật khẩu mới không hợp lệ" });

    const ref = usersCol.doc(username);
    const snap = await ref.get();

    if (!snap.exists)
      return res.status(404).json({ success: false, message: "Không tìm thấy user" });

    if (snap.data().password !== oldPassword)
      return res.status(401).json({ success: false, message: "Mật khẩu cũ sai" });

    await ref.update({ password: newPassword });

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// =====================================
app.listen(PORT, () => {
  console.log("Firebase backend running on", PORT);
});
