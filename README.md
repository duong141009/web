# SHOP KEY Backend v2 (Node.js + Express + JSON file)

Nâng cấp:
- Lưu users, deposits, keys trong `data.json`
- Admin có thể:
  - Xem tất cả yêu cầu nạp, duyệt / từ chối
  - Xem danh sách user
  - Xem chi tiết 1 user (kèm lịch sử nạp, keys)
  - Xoá key
  - Xoá user (kèm toàn bộ nạp & keys)

## API mới

- `GET /api/admin/users` – danh sách users
- `GET /api/admin/users/:id` – chi tiết 1 user (deposits + keys)
- `POST /api/admin/users/:id/delete` – xoá user (trừ admin)
- `POST /api/admin/keys/:id/delete` – xoá 1 key

Phần còn lại giống bản trước.

## Deploy Render

1. Up project lên GitHub
2. Render → Web Service
3. Build: `npm install`
4. Start: `npm start`
5. Env:
   - `JWT_SECRET`
   - `JWT_EXPIRES` (vd: `7d`)
   - `DATA_FILE` (vd: `data.json`)
