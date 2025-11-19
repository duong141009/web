# SHOP KEY Backend (Node.js + Express + SQLite)

Không cần MySQL, PlanetScale, Railway. Mọi dữ liệu lưu trong file `database.sqlite`.

## File trong project

- `server.js` – code backend (Express + SQLite)
- `package.json` – dependency
- `.env.example` – mẫu cấu hình
- (database sẽ nằm trong `database.sqlite` – tự tạo nếu chưa có)

Admin mặc định tạo sẵn khi server chạy lần đầu:

- username: `admin`
- password: `admin123`

## API

- `POST /api/register` – đăng ký (body JSON: `{ username, password, email }`)
- `POST /api/login` – đăng nhập, trả về `token` (JWT)
- `GET /api/me` – lấy info user (header: `Authorization: Bearer <token>`)
- `POST /api/create-deposit` – tạo yêu cầu nạp (body `{ amount, note }`)
- `GET /api/my-deposits` – xem lịch sử nạp của chính mình
- `GET /api/admin/deposits` – admin xem tất cả yêu cầu nạp
- `POST /api/admin/deposits/:id/approve` – admin duyệt + cộng tiền
- `POST /api/admin/deposits/:id/reject` – admin từ chối

## Chạy local

1. Tạo file `.env` từ `.env.example`
2. Cài thư viện:

   ```bash
   npm install
   ```

3. Chạy:

   ```bash
   npm start
   ```

Server sẽ chạy ở `http://localhost:3000`.

## Deploy lên Render

1. Đưa toàn bộ file lên GitHub
2. Render → New → Web Service → chọn repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Environment Variables:
   - `JWT_SECRET` – chuỗi bí mật bất kỳ (bắt buộc)
   - `JWT_EXPIRES` – ví dụ `7d`
   - `DB_FILE` – mặc định `database.sqlite` (có thể để trống)

Sau khi deploy, backend hoạt động không cần database bên ngoài.
