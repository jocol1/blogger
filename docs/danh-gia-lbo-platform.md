# Đánh giá LBO Platform (lbobusiness.duckdns.org)

> Ngày kiểm tra: 13/11/2026 · Phạm vi: quan sát từ phía client (đã đăng nhập ADMIN, qua CAPTCHA của BunkerWeb). Không chạm vào nội dung token, không test xâm nhập.

Ứng dụng là SPA (React/Vite), API tại `/api/*`, đứng sau WAF **BunkerWeb** + CAPTCHA. Các trang: Dashboard, Lead, Maps & Phân cụm, Xác thực/Bằng chứng, N.A.P & SEO, Khách hàng, Đánh giá, Chiến dịch (Nội dung/Media), Grid Rank, Lịch sử đo lưới, So sánh đối thủ, Helpdesk, Báo cáo, Phân quyền, Nhật ký, Tài khoản.

---

## 1. Bảo mật

### Điểm tốt
- **API bắt buộc xác thực phía server**: gọi `/api/customers` không có token → **401** (no-store). Không rò dữ liệu khi thiếu auth.
- **HSTS mạnh**: `max-age=63072000; includeSubDomains; preload`.
- **Chống clickjacking & MIME-sniffing**: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`.
- **Cookie WAF an toàn**: `HttpOnly; Secure; SameSite=Lax`.
- **WAF + CAPTCHA** đứng trước toàn bộ app; hỗ trợ HTTP/3.
- Có khái niệm **MFA** (`mfaEnabled` trong hồ sơ user) — hạ tầng cho xác thực 2 lớp.
- API trả `Cache-Control: no-cache, no-store, must-revalidate` → không cache dữ liệu nhạy cảm.

### Cần khắc phục
| Mức | Vấn đề | Khuyến nghị |
|-----|--------|-------------|
| **Cao** | **JWT access token + refresh token lưu trong `localStorage`** (`lbo-auth`). Bất kỳ lỗ hổng XSS nào cũng đọc được token → chiếm phiên. | Chuyển token sang **cookie `HttpOnly; Secure; SameSite`**, hoặc tối thiểu giữ access token trong bộ nhớ (memory) + refresh token trong cookie HttpOnly. |
| **Cao** | **Không có `Content-Security-Policy`**. Đây là lớp phòng XSS quan trọng, càng cần khi token nằm ở localStorage. | Thêm CSP chặt (`default-src 'self'`, khai báo rõ nguồn script/style/img, tránh `unsafe-inline`). |
| **Trung bình** | **CORS `Access-Control-Allow-Origin: *`** trên `/api/auth/login` (OPTIONS trả 204 cho origin lạ). Mọi origin gọi được API. Vì auth dùng Bearer (không cookie) nên tác động hạn chế, nhưng không nên để `*` cho endpoint đăng nhập. | Giới hạn `Access-Control-Allow-Origin` theo danh sách origin tin cậy. |
| Thấp | Thiếu một số header gia cố: `Permissions-Policy`, `Cross-Origin-Opener-Policy`, `X-Frame-Options` nên nâng lên `frame-ancestors` trong CSP. | Bổ sung khi thêm CSP. |
| Thấp | `Referrer-Policy: no-referrer-when-downgrade` khá lỏng. | Dùng `strict-origin-when-cross-origin` hoặc `no-referrer`. |

---

## 2. Tối ưu (hiệu năng)

### Điểm tốt
- **Nén bật sẵn**: JS 939 KB → **327 KB** (gzip/brotli), CSS 116 KB → **27 KB**.
- **Filename có hash** (`index-B70Cmuji.js`) → cache lâu dài an toàn; lần tải lại `transferSize = 0` (phục vụ từ cache).
- **Phân trang phía server** cho danh sách khách hàng (`?page=1&pageSize=10`).
- **TTFB rất thấp** khi đã cache; Dashboard gọi song song nhiều API (map-pins, cases, approvals, reviews/stats).

### Cần cải thiện
| Mức | Vấn đề | Khuyến nghị |
|-----|--------|-------------|
| **Trung bình** | **Bundle JS gộp 1 khối ~939 KB** (327 KB nén), không chia theo route. Lần tải đầu phải nạp toàn bộ app cho dù chỉ mở 1 trang. | **Code-splitting theo route** (`React.lazy` / dynamic import), tách thư viện nặng (bản đồ Leaflet, chart) thành chunk riêng, lazy-load. |
| Thấp | Leaflet/OpenStreetMap tải cả trên Dashboard dù bản đồ nằm giữa trang. | Lazy-load bản đồ khi cuộn tới / khi cần. |
| Thấp | Chưa xác nhận `Cache-Control: immutable` cho asset có hash. | Đặt `Cache-Control: public, max-age=31536000, immutable` cho `/assets/*`. |

---

## 3. Logic & Trải nghiệm

### Vấn đề nổi bật
- 🔴 **[NGHIÊM TRỌNG] Sập trắng toàn bộ app (white screen of death) — không có Error Boundary**: mở `/audit-logs` (Nhật ký hệ thống) làm **toàn bộ React tree unmount → màn hình trắng, body rỗng**. Console: `Uncaught TypeError: n.map is not a function`. Nguyên nhân: trang gọi `.map()` trực tiếp lên response của API, nhưng response không phải mảng (xem root cause bên dưới). Vì **không có React Error Boundary**, một lỗi ở 1 component kéo sập cả ứng dụng thay vì chỉ hỏng 1 vùng.
  - **Khắc phục:** (1) Bọc **Error Boundary** quanh router/layout để cô lập lỗi, hiện fallback thay vì trắng trang. (2) **Không `.map()` trực tiếp** lên dữ liệu chưa kiểm tra — dùng `Array.isArray(x) ? x.map() : []` hoặc chuẩn hoá response ở tầng API.
- 🟠 **[CAO] Xử lý response API không nhất quán giữa các trang**: cùng tình huống WAF trả HTML, trang **Khách hàng / Người dùng** "nuốt" lỗi thành **"0 bản ghi"** (sai nhưng không sập), còn **audit-logs** thì **sập trắng**. Mỗi trang tự xử lý một kiểu → cần **một lớp HTTP client chung** có: kiểm tra `content-type`, bắt lỗi parse JSON, phát hiện phiên/challenge hết hạn và điều hướng đăng nhập lại.
- ⚠️ **Root cause — WAF trả HTML cho mọi `/api/*`**: khi cookie challenge của BunkerWeb hết hạn giữa phiên, **tất cả** request `/api/*` bị trả **trang challenge HTML với HTTP 200** thay vì JSON (đã kiểm chứng: `/api/audit-logs`, `/api/leads`, `/api/reviews`, `/api/reports` đều `200 · text/html`; network log có `GET /challenge?next=%2Fapi%2Fcustomers → 200` lặp lại). Đây là ngòi nổ cho cả 2 lỗi trên.
  - **Khắc phục phía app**: khi `fetch` trả `content-type: text/html` hoặc parse JSON thất bại → coi là phiên/challenge hết hạn, hiện thông báo và yêu cầu xác thực lại, **không** render thành danh sách rỗng và **không** để `.map()` nổ.
  - **Khắc phục phía WAF**: loại `/api/*` khỏi CAPTCHA (dùng rate-limit/bot-score cho XHR), hoặc trả **401/403 JSON** cho API thay vì HTML.
- **CAPTCHA thủ công chặn mọi lần vào/refresh**: mở trang bằng link trực tiếp hoặc refresh đều bị challenge lại (cookie hết hạn rất nhanh — trong lúc kiểm tra bị hỏi mã nhiều lần chỉ sau vài phút). Với công cụ quản trị nội bộ đây là ma sát lớn. Cân nhắc challenge không thao tác (JavaScript challenge / Turnstile) hoặc whitelist IP nội bộ. *(Điều hướng trong SPA bằng bấm menu thì không bị — chỉ full-load/refresh mới dính.)*

### Điểm tốt
- **Mobile responsive sạch**: sidebar thu thành menu hamburger, bảng chuyển thành thẻ (card), **không tràn ngang** (overflow = 0) ở 375px.
- **Dashboard phong phú & hữu ích**: bản đồ 50 chi nhánh (Leaflet, có cluster), lọc theo tỉnh/khu vực, funnel chuyển đổi sang Verified, Review Tracker, Early Warning.
- **RBAC có thật**: role (ADMIN...), `user_kind`, `roleCode`, nút "Gán khách" — có mô hình phân quyền; phân trang phía server nhất quán trên các bảng.
- Có empty-state và phân trang rõ ràng; breadcrumb nhất quán.
- Hiệu ứng fade-in khi vào trang (nhẹ, nhưng gây "nháy" nội dung mờ lúc đầu — có thể bỏ hoặc rút ngắn).

---

## Tóm tắt ưu tiên
1. 🔴 **Thêm Error Boundary + chuẩn hoá response API** — chặn "sập trắng toàn app" ở `/audit-logs` (và mọi nơi `.map()` trực tiếp lên dữ liệu chưa validate). Lỗi nặng nhất hiện tại.
2. 🟠 **Lớp HTTP client chung xử lý challenge/HTML-thay-JSON** — phát hiện phiên hết hạn, báo đăng nhập lại; không "nuốt" thành danh sách rỗng, không để crash.
3. 🟠 **Chuyển token khỏi localStorage + thêm CSP** (bảo mật, mức cao).
4. **Loại `/api/*` khỏi CAPTCHA** / trả JSON 401-403 thay vì HTML, và dùng challenge không thao tác cho người dùng nội bộ (WAF).
5. **Code-splitting theo route** để giảm bundle tải lần đầu; siết CORS khỏi `*`.

---

## Phụ lục — Bằng chứng (kiểm tra sâu 13/11)
- `/audit-logs`: `Uncaught TypeError: n.map is not a function` tại `assets/index-B70Cmuji.js` → `document.body.innerText.length === 0` (trắng trang, React tree unmount, không recover được nếu không reload).
- Probe API khi cookie challenge hết hạn (kèm Bearer token hợp lệ):
  `/api/audit-logs`, `/api/audit-logs?page=1&pageSize=20`, `/api/leads`, `/api/reviews`, `/api/reports` → tất cả **`200 · content-type: text/html`** (trang challenge), không phải JSON.
- `/api/customers` không token → **401** (đúng), có token → 200 JSON `{items,total,...}` phân trang.
- Network: nhiều `GET /challenge?next=%2Fapi%2Fcustomers → 200` xen giữa các lời gọi API.
