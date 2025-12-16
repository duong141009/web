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
// Cho phép các domain khác (frontend) truy cập
app.use(cors()); 
// Cho phép server đọc dữ liệu JSON từ request body
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
// ENDPOINT ĐĂNG KÝ
// ===========================================
app.post('/api/register', (req, res) => {
    const { username, password, fullname, email, phone } = req.body;

    // 1. Validation cơ bản (Sử dụng lại logic từ frontend là tốt nhất)
    if (!username || !password || !fullname) {
        return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin bắt buộc.' });
    }

    let users = readUsers();

    // 2. Kiểm tra trùng lặp
    if (users.some(u => u.username === username)) {
        return res.status(409).json({ success: false, message: 'Tên đăng nhập đã tồn tại.' });
    }

    // 3. Tạo người dùng mới
    const newUser = {
        username,
        password, // LƯU Ý: Trong thực tế, KHÔNG BAO GIỜ lưu mật khẩu dưới dạng plaintext! Phải dùng bcrypt.
        fullname,
        email: email || '',
        phone,
        balance: 0, 
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    writeUsers(users); // Ghi lại vào file

    console.log(`Người dùng mới đã đăng ký: ${username}`);
    res.status(201).json({ 
        success: true, 
        message: 'Đăng ký thành công.',
        user: { username, fullname } // Trả về thông tin an toàn
    });
});

// ===========================================
// ENDPOINT ĐĂNG NHẬP
// ===========================================
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập Tên đăng nhập và Mật khẩu.' });
    }

    const users = readUsers();
    
    // 1. Tìm người dùng
    const user = users.find(u => u.username === username);

    if (!user) {
        return res.status(401).json({ success: false, message: 'Tên đăng nhập không tồn tại.' });
    }

    // 2. Kiểm tra mật khẩu (Giả lập kiểm tra mật khẩu plaintext)
    if (user.password !== password) {
        return res.status(401).json({ success: false, message: 'Mật khẩu không đúng.' });
    }

    // 3. Đăng nhập thành công
    console.log(`Người dùng đã đăng nhập: ${username}`);
    res.status(200).json({
        success: true,
        message: 'Đăng nhập thành công.',
        token: 'mock-jwt-token-12345', // Trong thực tế, trả về JWT
        user: { 
            username: user.username, 
            fullname: user.fullname,
            balance: user.balance // Trả về số dư
        }
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
