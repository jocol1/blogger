# Hướng dẫn triển khai Phí công đoàn kết nối SePay

Tài liệu này mô tả cách chuyển chức năng **Phí công đoàn** và tự động đối soát giao dịch qua **SePay** sang một dự án khác.

## 1. Luồng nghiệp vụ

1. Người quản lý tạo kỳ thu theo tháng và cấu hình tài khoản nhận tiền.
2. Hệ thống sinh nghĩa vụ phí cho các thành viên công đoàn đang hoạt động.
3. Mỗi nghĩa vụ được cấp một mã thanh toán duy nhất, dạng `DH` + 7 chữ số, ví dụ `DH4829103`.
4. Thành viên mở QR, nhập số tiền bằng **1% tổng thực nhận**, giữ nguyên nội dung chuyển khoản có mã `DH` rồi chuyển tiền.
5. SePay gửi webhook khi tài khoản nhận được tiền.
6. Server xác thực webhook, lấy mã `DH`, tìm đúng nghĩa vụ và tự động chuyển trạng thái sang `paid`.
7. Hệ thống lưu log giao dịch, lịch sử nghĩa vụ và gửi thông báo cho thành viên.

Số tiền không dùng để ghép nghĩa vụ; mã `DH` là khóa đối soát chính. Vì vậy QR không cố định amount, người đóng tự nhập 1%.

## 2. Các bảng và trường cần có

### `union_members`

- `profile_id`: liên kết nhân sự.
- `is_active`: thành viên có tham gia thu phí hay không.

### `union_fee_periods`

- `year`, `month`, `due_date`, `status` (`open`/`closed`).
- `amount_note`: ghi chú công thức, mặc định “Phí công đoàn bằng 1% tổng thực nhận”.
- `bank_name`, `bank_account_no`, `bank_account_name`.

Giá trị đang dùng trong dự án này:

```text
Ngân hàng: MB
Số tài khoản: 6999912092003
Tên tài khoản: LY TAN LOC
```

Khi chuyển dự án, thay bằng tài khoản nhận tiền thực tế.

### `union_fee_dues`

Các trường chính:

- `period_id`, `profile_id`, `status`.
- `payment_code` — duy nhất, ví dụ `DH4829103`.
- `paid_amount`, `paid_via` (`manual`/`sepay`).
- `sepay_transaction_id` — duy nhất khi có giao dịch SePay.
- `confirmed_at`, `confirmed_by`.

### `union_fee_due_events`

Lưu lịch sử `created`, `reported`, `confirmed`, `rejected`, `reminded`, `sepay_paid`.

### `union_fee_sepay_events`

Đây là bảng audit/idempotency của webhook:

- `sepay_id` — unique, chống xử lý trùng webhook.
- `payment_code`, `transfer_amount`, `transfer_content`, `transfer_type`.
- `account_number`, `gateway`, `reference_code`, `payload`.
- `due_id`, `result`, `created_at`.

Các kết quả thường gặp: `matched_paid`, `already_paid`, `unmatched`, `ignored_out`, `extra`.

## 3. Migration Supabase

Chạy theo đúng thứ tự thời gian:

```text
supabase/migrations/20261424140000_union_fee.sql
supabase/migrations/20261424140100_inbox_action_union_fee.sql
supabase/migrations/20261424140200_fix_generate_union_fee_dues_ambiguous.sql
supabase/migrations/20261425120000_union_fee_reminder_d1.sql
supabase/migrations/20261427120000_union_fee_payment_code.sql
supabase/migrations/20261427130000_union_fee_mb_bank.sql
supabase/migrations/20261427140000_union_fee_payment_code_no_hyphen.sql
supabase/migrations/20261427150000_union_fee_payment_code_dh.sql
supabase/migrations/20261501120000_union_fee_payment_method.sql
supabase/migrations/20261501130000_union_fee_report_amount.sql
```

Migration cuối phải đảm bảo hàm sinh mã trả về dạng `DH` + 7 chữ số và có unique index trên `union_fee_dues.payment_code`.

## 4. Biến môi trường

Đặt ở server/production, không đưa vào client:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SEPAY_WEBHOOK_API_KEY=<random-secret>
```

`SUPABASE_SERVICE_ROLE_KEY` chỉ được dùng trong route/server service xử lý webhook. Không commit file `.env.local` và không expose key qua `NEXT_PUBLIC_*`.

## 5. QR thanh toán

QR được tạo từ các giá trị:

```ts
{
  bankName,
  accountNo,
  accountName,
  addInfo: paymentCode,
}
```

URL VietQR mẫu:

```text
https://img.vietqr.io/image/MB-6999912092003-compact2.png
  ?addInfo=DH4829103
  &accountName=LY%20TAN%20LOC
```

Không truyền `amount`. Nếu ảnh VietQR lỗi, tạo payload EMVCo VietQR ở server/client bằng thư viện QR local làm phương án dự phòng.

Trên giao diện phải hiển thị rõ:

- số tiền cần chuyển = 1% tổng thực nhận;
- ngân hàng, số tài khoản, tên tài khoản;
- nội dung chuyển khoản chính xác, có mã `DH`;
- nút sao chép nội dung và tải QR.

## 6. Webhook SePay

### Endpoint

```text
POST https://<domain>/api/webhooks/sepay
```

Trong SePay cấu hình sự kiện **Có tiền vào** và gửi header:

```http
Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>
```

Code hiện tại cũng chấp nhận `Bearer <key>` hoặc `x-sepay-api-key`, nhưng nên dùng `Authorization: Apikey` theo cấu hình chuẩn.

### Payload tối thiểu

```json
{
  "id": 123456789,
  "gateway": "MB",
  "transactionDate": "2026-10-05 10:30:00",
  "accountNumber": "6999912092003",
  "code": "DH4829103",
  "content": "DH4829103 NGUYEN VAN A",
  "transferType": "in",
  "transferAmount": 500000,
  "referenceCode": "FT..."
}
```

Server xử lý theo thứ tự:

1. Kiểm tra `SEPAY_WEBHOOK_API_KEY` đã cấu hình.
2. So sánh API key bằng SHA-256 + `timingSafeEqual`.
3. Parse JSON và lấy `id`.
4. Bỏ qua giao dịch `transferType != in`.
5. Tìm `DHxxxxx` trong `code` hoặc `content` (chấp nhận `DH-xxxxx`, chuẩn hóa thành `DHxxxxx`).
6. Tìm `union_fee_dues.payment_code`.
7. Nếu chưa thanh toán, cập nhật:

```text
status = paid
paid_via = sepay
payment_method = qr
paid_amount = transferAmount
sepay_transaction_id = id
confirmed_at = now()
```

8. Ghi `sepay_paid`, ghi bảng `union_fee_sepay_events`, gửi inbox xác nhận.

Nếu cùng `sepay_id` được gửi lại, trả kết quả `duplicate` và không cộng tiền lần hai.

## 7. Mã xử lý tham khảo

Các module tương ứng trong dự án hiện tại:

```text
app/api/webhooks/sepay/route.ts
features/communicate/union-fee/utils/paymentCode.ts
features/communicate/union-fee/utils/sepayPayload.ts
features/communicate/union-fee/utils/vietQr.ts
features/communicate/union-fee/server/verifySepayWebhook.server.ts
features/communicate/union-fee/server/applySepayUnionFeePayment.server.ts
```

Tách phần xử lý thành service server riêng để route chỉ làm nhiệm vụ xác thực, parse payload và trả HTTP response.

## 8. Phân quyền

- Thành viên chỉ xem nghĩa vụ của chính mình, QR và trạng thái thanh toán.
- Quản lý công đoàn được tạo kỳ, sinh nghĩa vụ, xem danh sách và xử lý thủ công.
- Bảng `union_fee_sepay_events` chỉ cho quản lý công đoàn đọc qua RLS.
- Webhook không dùng session người dùng; dùng `SUPABASE_SERVICE_ROLE_KEY` ở server.
- Không cho client tự ghi `status = paid` hoặc `sepay_transaction_id`.

## 9. Checklist kiểm thử

1. Tạo kỳ thu, thêm thành viên hoạt động, chạy sinh nghĩa vụ.
2. Kiểm tra mỗi nghĩa vụ có mã `DH` duy nhất.
3. Mở QR và kiểm tra đúng tài khoản + đúng nội dung chuyển khoản.
4. Gửi payload test có `transferType: in`, mã đúng, số tiền bất kỳ.
5. Kiểm tra nghĩa vụ chuyển sang `paid`, có `paid_via = sepay` và có log.
6. Gửi lại cùng `id` → kết quả `duplicate`, không tạo thanh toán lần hai.
7. Gửi giao dịch không có mã → `unmatched`.
8. Gửi giao dịch `transferType: out` → `ignored_out`.
9. Gửi mã không tồn tại → `unmatched`.
10. Gửi sai API key → HTTP 401; thiếu secret server → HTTP 503.

## 10. Lưu ý vận hành

- Không đối soát bằng số tiền vì người đóng tự nhập 1%; đối soát bằng mã `DH`.
- Không xóa log SePay; log dùng để tra soát và chống webhook trùng.
- Nếu đổi tài khoản ngân hàng, cập nhật giá trị mặc định và các kỳ thu đã tạo.
- Khi triển khai production, cấu hình HTTPS và kiểm tra SePay gọi được endpoint công khai.
- Sau khi đổi schema, chạy generate database types và test webhook trước khi bật thu thật.
