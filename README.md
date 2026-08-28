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

Note riêng được mã hóa bằng mật khẩu của note; hệ thống chỉ lưu hash mật khẩu và ciphertext. Nếu quên mật khẩu, không thể mở note. Bản đầu tiên dùng file JSON cục bộ, phù hợp để chạy cá nhân. Khi đưa lên internet nên thêm HTTPS, database riêng, giới hạn loại file và backup mã hóa.
