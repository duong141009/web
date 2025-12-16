const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_KEY_REPLACE_ME"; // Rất quan trọng: Phải thay thế!
const SALT_ROUNDS = 10;

app.use(cors());
app.use(express.json());

// =====================================
// FIREBASE INIT
// =====================================
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  // LƯU Ý: Nếu chạy cục bộ, bạn có thể cần load file .json service account
  // throw new Error("Missing FIREBASE_SERVICE_ACCOUNT env");
  console.warn("WARNING: FIREBASE_SERVICE_ACCOUNT env not set. Using mocked service account for local testing.");
}

// **Quan trọng:** Thay thế bằng logic load service account thực tế của bạn
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
    : {}; 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const usersCol = db.collection("users");

// =====================================
// CONFIG - CẤU HÌNH VIP
// =====================================
const VIP_CONFIG = {
    VIP0: { name: "Người chơi mới", depositRequirement: 0, bonusRate: 0, weeklyReward: 0 },
    VIP1: { name: "Đồng", depositRequirement: 1000000, bonusRate: 0.01, weeklyReward: 10000 },
    VIP2: { name: "Bạc", depositRequirement: 5000000, bonusRate: 0.03, weeklyReward: 50000 },
    VIP3: { name: "Vàng", depositRequirement: 20000000, bonusRate: 0.05, weeklyReward: 200000 },
    VIP4: { name: "Kim Cương", depositRequirement: 50000000, bonusRate: 0.08, weeklyReward: 500000 },
    // Thêm các cấp độ khác tại đây
};
const VIP_LEVELS = Object.keys(VIP_CONFIG);

// =====================================
// TIỆN ÍCH / LOGIC VIP
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

function determineVipLevel(depositAmount) {
    let currentVip = "VIP0";
    for (let i = VIP_LEVELS.length - 1; i >= 0; i--) {
        const levelKey = VIP_LEVELS[i];
        if (depositAmount >= VIP_CONFIG[levelKey].depositRequirement) {
            currentVip = levelKey;
            break;
        }
    }
    return currentVip;
}

function getNextVipInfo(currentVipKey) {
    const currentIndex = VIP_LEVELS.indexOf(currentVipKey);
    if (currentIndex >= 0 && currentIndex < VIP_LEVELS.length - 1) {
        const nextKey = VIP_LEVELS[currentIndex + 1];
        return {
            levelKey: nextKey,
            name: VIP_CONFIG[nextKey].name,
            requirement: VIP_CONFIG[nextKey].depositRequirement,
        };
    }
    return null;
}

// =====================================
// MIDDLEWARE BẢO MẬT: XÁC THỰC JWT
// =====================================
const protect = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1]; // Expects: Bearer <token>

    if (!token) {
        return res.status(401).json({ success: false, message: "Không có Token. Vui lòng đăng nhập." });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Gắn thông tin người dùng từ token vào request
        next();
    } catch (e) {
        return res.status(401).json({ success: false, message: "Token không hợp lệ hoặc đã hết hạn." });
    }
};

// =====================================
// HEALTH CHECK
// =====================================
app.get("/", (req, res) => res.send("API OK - Firebase v2.0 (VIP & Secure)"));

// =====================================
// REGISTER
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

    // Validate inputs
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
      
    // **Bảo mật**: Hash mật khẩu
    const hashedPassword = await bcrypt.hash(p, SALT_ROUNDS);

    const now = new Date().toISOString();

    await userRef.set({
      username: u,
      password: hashedPassword, // Đã hash
      fullname: fn,
      email: em,
      phone: ph,
      rank: "Thứ hạng 100 khác",
      createdAt: now,
      lastLogin: null,
      // Logic VIP/Balance Init
      balance: 0, 
      lifetimeDepositAmount: 0,
      currentVipLevel: "VIP0",
    });

    res.status(201).json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// =====================================
// LOGIN
// =====================================
app.post(["/api/login", "/api/auth/login"], async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ success: false, message: "Thiếu dữ liệu" });

    const ref = usersCol.doc(username);
    const snap = await ref.get();

    if (!snap.exists)
      return res.status(401).json({ success: false, message: "Sai tài khoản hoặc mật khẩu" });

    const user = snap.data();
    
    // **Bảo mật**: So sánh mật khẩu đã hash
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid)
      return res.status(401).json({ success: false, message: "Sai tài khoản hoặc mật khẩu" });

    await ref.update({ lastLogin: new Date().toISOString() });
    
    // **Bảo mật**: Tạo JWT Token
    const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.json({ success: true, token, user: { username: user.username } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// =====================================
// USER DETAILS (Đã bảo vệ)
// =====================================
app.get(["/api/users/:username", "/api/user-details/:username"], protect, async (req, res) => {
  try {
    // **Bảo mật**: Đảm bảo user chỉ lấy được data của chính mình
    if (req.params.username !== req.user.username) {
        return res.status(403).json({ success: false, message: "Không có quyền truy cập thông tin này." });
    }

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
        balance: u.balance, // Thêm thông tin mới
        currentVipLevel: u.currentVipLevel, // Thêm thông tin mới
        lifetimeDepositAmount: u.lifetimeDepositAmount, // Thêm thông tin mới
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// =====================================
// VIP STATUS (Đã bảo vệ)
// =====================================
app.get("/api/vip-status/:username", protect, async (req, res) => {
    try {
        if (req.params.username !== req.user.username) {
            return res.status(403).json({ success: false, message: "Không có quyền truy cập thông tin này." });
        }

        const username = req.params.username;
        const ref = usersCol.doc(username);
        const snap = await ref.get();

        if (!snap.exists)
            return res.status(404).json({ success: false, message: "Không tìm thấy user" });

        const u = snap.data();
        
        const depositAmount = u.lifetimeDepositAmount || 0;
        const currentVipKey = determineVipLevel(depositAmount);
        const currentVipConfig = VIP_CONFIG[currentVipKey];
        const nextVipInfo = getNextVipInfo(currentVipKey);

        let progress = 100;
        let depositNeeded = 0;

        // Xử lý logic thăng cấp VIP (nên được thực hiện trong transaction)
        if (currentVipKey !== u.currentVipLevel) {
             // **TẠO TRANSACTION/BATCH WRITE Ở ĐÂY để cập nhật VIP Level**
             // Cập nhật cấp độ VIP mới
             await ref.update({
                 currentVipLevel: currentVipKey,
                 vipUpgradeAt: new Date().toISOString(),
             });
        }
        
        if (nextVipInfo) {
            const currentReq = currentVipConfig.depositRequirement;
            const nextReq = nextVipInfo.requirement;
            
            depositNeeded = nextReq - depositAmount;
            
            if (nextReq > currentReq) {
                progress = ((depositAmount - currentReq) / (nextReq - currentReq)) * 100;
            }
        }
        
        res.json({
            success: true,
            data: {
                currentVipLevel: currentVipKey,
                currentVipName: currentVipConfig.name,
                lifetimeDepositAmount: depositAmount,
                currentVipConfig: currentVipConfig,
                nextVip: nextVipInfo,
                progress: Math.min(100, Math.max(0, progress)), 
                depositNeeded: Math.max(0, depositNeeded),
                allVipLevels: VIP_CONFIG,
            },
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// =====================================
// CHANGE PASSWORD (Đã bảo vệ)
// =====================================
app.put("/api/settings/:username/password", protect, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const { username } = req.params;

    // **Bảo mật**: Đảm bảo user chỉ đổi pass của chính mình
    if (username !== req.user.username) {
        return res.status(403).json({ success: false, message: "Không có quyền thực hiện hành động này." });
    }

    if (!oldPassword || !newPassword)
      return res.status(400).json({ success: false, message: "Thiếu dữ liệu" });

    if (newPassword.length < 8 || newPassword.length > 20)
      return res.status(400).json({ success: false, message: "Mật khẩu mới không hợp lệ" });

    const ref = usersCol.doc(username);
    const snap = await ref.get();

    if (!snap.exists)
      return res.status(404).json({ success: false, message: "Không tìm thấy user" });

    const user = snap.data();
    
    // **Bảo mật**: So sánh mật khẩu cũ đã hash
    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);

    if (!isPasswordValid)
      return res.status(401).json({ success: false, message: "Mật khẩu cũ sai" });

    // **Bảo mật**: Hash mật khẩu mới
    const newHashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await ref.update({ password: newHashedPassword });

    res.json({ success: true, message: "Đổi mật khẩu thành công" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// =====================================
// API MOCK: Giao dịch nạp tiền (Cập nhật VIP/Balance)
// PUT /api/transactions/deposit (Để test logic VIP)
// =====================================
app.put("/api/transactions/deposit", protect, async (req, res) => {
    try {
        const { amount } = req.body;
        const username = req.user.username; // Lấy từ token

        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ success: false, message: "Số tiền nạp không hợp lệ" });
        }

        const ref = usersCol.doc(username);

        // **Quan trọng: Sử dụng Firestore Transaction để đảm bảo tính nhất quán**
        await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(ref);
            if (!snap.exists) throw new Error("User not found");

            const u = snap.data();
            const newLifetimeDeposit = u.lifetimeDepositAmount + amount;
            const newBalance = u.balance + amount;
            const newVipLevel = determineVipLevel(newLifetimeDeposit);

            const updateData = {
                balance: newBalance,
                lifetimeDepositAmount: newLifetimeDeposit,
            };

            // Nếu cấp VIP thay đổi, cập nhật thêm
            if (newVipLevel !== u.currentVipLevel) {
                updateData.currentVipLevel = newVipLevel;
                updateData.vipUpgradeAt = new Date().toISOString();
                // **TODO: Thêm logic cộng tiền thưởng thăng cấp VIP vào Balance**
                // Ví dụ: newBalance += amount_upgrade_bonus;
            }

            transaction.update(ref, updateData);
        });

        res.json({ success: true, message: "Nạp tiền thành công và cập nhật VIP/Balance" });

    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: e.message || "Server error in transaction" });
    }
});


// =====================================
app.listen(PORT, () => {
  console.log(`[BACKEND] Server running on port ${PORT}`);
  console.log(`[SECURITY] JWT Secret: ${JWT_SECRET}`);
});
