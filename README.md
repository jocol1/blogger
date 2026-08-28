# Blogger Vault

Blog cá nhân để viết hướng dẫn Markdown, tải file và tạo note riêng có mật khẩu.

## Chạy local

```powershell
npm install
Copy-Item .env.example .env
```

Mở `.env`, đặt `ADMIN_PASSWORD` và `SESSION_SECRET`. Sau đó:

```powershell
npm start
```

Mở http://localhost:3000. Không commit `.env`, thư mục `data/` hoặc `uploads/` lên GitHub.

Note riêng được mã hóa bằng mật khẩu của note; hệ thống chỉ lưu hash mật khẩu và ciphertext. Nếu quên mật khẩu, không thể mở note. Khi có đủ biến Firebase, bài viết và note sẽ lưu trong Firestore; nếu chưa cấu hình, app dùng file JSON local làm dự phòng. Không commit thông tin Firebase thật vào GitHub.
