const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
// Sử dụng port được cung cấp bởi môi trường (như Render) hoặc mặc định 3000
const PORT = process.env.PORT || 3000; 

// Đường dẫn tới file lưu trữ người dùng
const USERS_FILE = path.join(__dirname, 'users.json');

// Middleware
app.use(cors()); 
app.use(express.json()); 

/**
 * Hàm đọc dữ liệu người dùng từ file users.json
 * @returns {Array} Danh sách người dùng
 */
function readUsers() {
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Nếu file không tồn tại hoặc lỗi đọc, trả về mảng rỗng
        return []; 
    }
}

/**
 * Hàm ghi dữ liệu người dùng vào file users.json
 * @param {Array} users - Danh sách người dùng mới
 */
function writeUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

// ===========================================
// ENDPOINT ĐĂNG KÝ (Bổ sung lastLogin và createdAt)
// ===========================================
app.post('/api/register', (req, res) => {
    const { username, password, fullname, email, phone } = req.body;

    // 1. Validation cơ bản (Yêu cầu có SĐT và Họ tên)
    if (!username || !password || !fullname || !phone) {
        return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin bắt buộc: Username, Password, Họ tên, và SĐT.' });
    }

    let users = readUsers();

    // 2. Kiểm tra trùng lặp
    if (users.some(u => u.username === username)) {
        return res.status(409).json({ success: false, message: 'Tên đăng nhập đã tồn tại.' });
    }

    const now = new Date().toISOString();
    
    // 3. Tạo người dùng mới với các trường dữ liệu chi tiết
    const newUser = {
        username,
        password, 
        fullname,
        email: email || '',
        phone,
        balance: 0, 
        createdAt: now,   // Thời gian đăng ký lần đầu
        lastLogin: now    // Lần đăng nhập cuối (ngay sau khi đăng ký)
    };

    users.push(newUser);
    writeUsers(users); 

    console.log(`Người dùng mới đã đăng ký: ${username}`);
    res.status(201).json({ 
        success: true, 
        message: 'Đăng ký thành công.',
        user: { username, fullname } 
    });
});

// ===========================================
// ENDPOINT ĐĂNG NHẬP (CẬP NHẬT lastLogin)
// ===========================================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập Tên đăng nhập và Mật khẩu.' });
    }

    let users = readUsers();
    
    const userIndex = users.findIndex(u => u.username === username);

    if (userIndex === -1) {
        return res.status(401).json({ success: false, message: 'Tên đăng nhập không tồn tại.' });
    }

    const user = users[userIndex];

    if (user.password !== password) {
        return res.status(401).json({ success: false, message: 'Mật khẩu không đúng.' });
    }

    // 3. Đăng nhập thành công và CẬP NHẬT LAST LOGIN
    const now = new Date().toISOString();
    
    users[userIndex].lastLogin = now; 
    writeUsers(users); // Ghi lại vào file

    console.log(`Người dùng đã đăng nhập và cập nhật lastLogin: ${username} lúc ${now}`);
    res.status(200).json({
        success: true,
        message: 'Đăng nhập thành công.',
        token: 'mock-jwt-token-12345', 
        user: { 
            username: user.username, 
            fullname: user.fullname,
            balance: user.balance 
        }
    });
});


// ===========================================
// ENDPOINT LẤY CHI TIẾT NGƯỜI DÙNG (Cho trang Cài đặt)
// ===========================================
app.get('/api/user-details/:username', (req, res) => {
    const { username } = req.params; 

    if (!username) {
        return res.status(400).json({ success: false, message: 'Thiếu tên đăng nhập.' });
    }

    const users = readUsers();
    
    const user = users.find(u => u.username === username);

    if (!user) {
        return res.status(404).json({ success: false, message: 'Người dùng không tồn tại.' });
    }

    // Trả về đầy đủ các thông tin bạn yêu cầu
    const userDetails = {
        username: user.username,
        fullname: user.fullname,
        phone: user.phone,
        email: user.email,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin // <--- Dữ liệu Đăng nhập cuối
    };

    res.status(200).json({
        success: true,
        data: userDetails
    });
});

// Endpoint mặc định (Health Check)
app.get('/', (req, res) => {
    res.send('K89 API Backend đang hoạt động!');
});

// Khởi động Server
app.listen(PORT, () => {
    console.log(`Server đang chạy trên cổng ${PORT}`);
});
