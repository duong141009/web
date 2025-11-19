# SHOP KEY Backend (Node.js + Express + JSON file storage)

Không cần MySQL, không cần SQLite. Dữ liệu lưu trong file `data.json` trong cùng thư mục.

## File

- `server.js`
- `package.json`
- `.env.example`
- `data.json` sẽ được tạo tự động (lần đầu chạy)

Admin mặc định:

- username: `admin`
- password: `admin123`

## API

- `POST /api/register` – đăng ký
- `POST /api/login` – đăng nhập, trả `token`
- `GET /api/me` – info user (cần `Authorization: Bearer <token>`)
- `POST /api/create-deposit` – user tạo yêu cầu nạp
- `GET /api/my-deposits` – user xem lịch sử nạp
- `GET /api/admin/deposits` – admin xem toàn bộ
- `POST /api/admin/deposits/:id/approve` – duyệt + cộng tiền
- `POST /api/admin/deposits/:id/reject` – từ chối

## Chạy local

```bash
npm install
cp .env.example .env   # sửa JWT_SECRET nếu muốn
npm start
```

Server chạy ở `http://localhost:3000`.

## Deploy Render

1. Up toàn bộ file lên GitHub
2. Render → New → Web Service → repo này
3. Build command: `npm install`
4. Start command: `npm start`
5. Env:
   - `JWT_SECRET` (bắt buộc)
   - `JWT_EXPIRES` (ví dụ `7d`)
   - `DATA_FILE` (mặc định `data.json`)

Không cần database bên ngoài.
