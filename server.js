require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { marked } = require('marked');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const root = __dirname;
const dataDir = path.join(root, 'data');
const uploadDir = path.join(root, 'uploads');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });
const dbFile = path.join(dataDir, 'store.json');
const store = fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile, 'utf8')) : { posts: [], notes: [] };
function save() { fs.writeFileSync(dbFile, JSON.stringify(store, null, 2), { mode: 0o600 }); }
const adminPasswordHash = process.env.ADMIN_PASSWORD ? bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12) : null;

function deriveNoteKey(password, salt) { return crypto.pbkdf2Sync(password, salt, 210000, 32, 'sha256'); }
function encryptNote(value, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveNoteKey(password, salt), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), value: encrypted.toString('base64') };
}
function decryptNote(payload, password) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveNoteKey(password, Buffer.from(payload.salt, 'base64')), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(payload.value, 'base64')), decipher.final()]).toString('utf8');
}
function id() { return crypto.randomUUID(); }
function auth(req, res, next) { if (req.session.user) return next(); res.redirect('/login'); }
function layout(title, body, req) { return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Blogger</title><style>${css}</style></head><body><header><a href="/">Blogger</a><nav><a href="/">Bài viết</a><a href="/files">Tệp</a>${req?.session?.user ? '<a href="/notes">Note riêng</a><a href="/admin/new">Viết bài</a><form method="post" action="/logout"><button>Đăng xuất</button></form>' : '<a href="/login">Đăng nhập</a>'}</nav></header><main>${body}</main></body></html>`; }
function esc(s='') { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const css = `:root{font-family:system-ui,sans-serif;color:#172033;background:#f6f7fb}*{box-sizing:border-box}body{margin:0}header{background:#172033;color:white;padding:16px max(20px,calc((100% - 1000px)/2));display:flex;justify-content:space-between;gap:20px;align-items:center}header a{color:white;text-decoration:none;font-weight:700}nav{display:flex;gap:16px;align-items:center}nav a{font-weight:500}form{display:inline}button,.button{border:0;border-radius:8px;background:#315efb;color:#fff;padding:10px 14px;cursor:pointer;text-decoration:none;display:inline-block}header button{background:transparent;padding:0}main{max-width:1000px;margin:38px auto;padding:0 20px}.card{background:#fff;border:1px solid #e5e8f0;border-radius:14px;padding:22px;margin:14px 0;box-shadow:0 4px 16px #1720330a}input,textarea{width:100%;padding:11px;border:1px solid #ccd2df;border-radius:8px;margin:6px 0 16px;font:inherit}textarea{min-height:260px}label{font-weight:650}.muted{color:#667085}.danger{color:#b42318}.actions{display:flex;gap:10px;align-items:center}.markdown{line-height:1.7}.markdown pre{background:#172033;color:#e8edf7;padding:14px;border-radius:8px;overflow:auto}.markdown code{background:#eef1f7;padding:2px 5px;border-radius:4px}.row{display:flex;justify-content:space-between;gap:20px;align-items:center}.secret{display:none}.secret.visible{display:inline;font-family:monospace}`;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: process.env.SESSION_SECRET || 'dev-only-change-me', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 } }));
const upload = multer({ dest: uploadDir, limits: { fileSize: 25 * 1024 * 1024 } });

app.get('/', (req,res) => { const posts = [...store.posts].sort((a,b) => b.createdAt.localeCompare(a.createdAt)); res.send(layout('Bài viết', `<h1>Kho hướng dẫn</h1><p class="muted">Lưu các bài viết kỹ thuật và tài liệu cá nhân.</p>${posts.length ? posts.map(p => `<article class="card"><h2><a href="/posts/${p.id}">${esc(p.title)}</a></h2><p class="muted">${new Date(p.createdAt).toLocaleString('vi-VN')}</p><p>${esc(p.excerpt || '')}</p></article>`).join('') : '<div class="card">Chưa có bài viết. <a href="/admin/new">Tạo bài đầu tiên</a></div>'}`, req)); });
app.get('/posts/:id', (req,res) => { const p=store.posts.find(x=>x.id===req.params.id); if(!p) return res.status(404).send('Không tìm thấy bài viết'); res.send(layout(p.title, `<article class="card"><h1>${esc(p.title)}</h1><p class="muted">${new Date(p.createdAt).toLocaleString('vi-VN')}</p><div class="markdown">${marked.parse(p.body)}</div></article>`,req)); });
app.get('/login',(req,res)=>res.send(layout('Đăng nhập',`<div class="card"><h1>Đăng nhập</h1><form method="post"><label>Mật khẩu quản trị</label><input type="password" name="password" required autofocus><button>Đăng nhập</button>${req.query.error?'<p class="danger">Mật khẩu không đúng.</p>':''}</form></div>`,req)));
app.post('/login',(req,res)=>{if(adminPasswordHash && bcrypt.compareSync(req.body.password || '', adminPasswordHash)) { req.session.user='admin'; return res.redirect('/'); } res.redirect('/login?error=1');});
app.post('/logout',(req,res)=>req.session.destroy(()=>res.redirect('/')));
app.get('/admin/new',auth,(req,res)=>res.send(layout('Viết bài',`<div class="card"><h1>Viết bài hướng dẫn</h1><form method="post"><label>Tiêu đề</label><input name="title" required><label>Tóm tắt</label><input name="excerpt"><label>Nội dung Markdown</label><textarea name="body" required placeholder="# Tiêu đề phụ\n\nNội dung..." ></textarea><button>Đăng bài</button></form></div>`,req)));
app.post('/admin/new',auth,(req,res)=>{store.posts.push({id:id(),title:req.body.title,excerpt:req.body.excerpt,body:req.body.body,createdAt:new Date().toISOString()});save();res.redirect('/');});
app.get('/files',(req,res)=>{const files=fs.readdirSync(uploadDir);res.send(layout('Tệp',`<h1>Tệp đính kèm</h1>${req.session.user?'<div class="card"><form method="post" action="/files" enctype="multipart/form-data"><input type="file" name="file" required><button>Tải lên</button></form></div>':''}<div class="card">${files.length?files.map(f=>`<p><a href="/files/${encodeURIComponent(f)}">${esc(f)}</a></p>`).join(''):'Chưa có tệp.'}</div>`,req));});
app.post('/files',auth,upload.single('file'),(req,res)=>res.redirect('/files'));
app.get('/files/:name',(req,res)=>{const name=path.basename(req.params.name);const file=path.join(uploadDir,name);if(!fs.existsSync(file))return res.sendStatus(404);res.download(file,name);});
app.get('/notes',auth,(req,res)=>{const rows=store.notes.map(n=>`<div class="card row"><div><strong>${esc(n.title)}</strong><br><span class="muted">🔒 Note được khóa bằng mật khẩu</span></div><a class="button" href="/notes/${n.id}">Mở note</a></div>`).join('');res.send(layout('Note riêng',`<h1>Note riêng</h1><p class="muted">Nội dung note được mã hóa. Mật khẩu không thể khôi phục nếu bạn quên.</p><div class="card"><form method="post"><label>Tên note</label><input name="title" required><label>Mật khẩu mở note</label><input type="password" name="password" minlength="8" required><label>Nội dung</label><textarea name="body" required></textarea><button>Tạo note</button></form></div>${rows||'<div class="card">Chưa có note.</div>'}`,req));});
app.post('/notes',auth,(req,res)=>{store.notes.push({id:id(),title:req.body.title,passwordHash:bcrypt.hashSync(req.body.password,12),payload:encryptNote(req.body.body,req.body.password),createdAt:new Date().toISOString()});save();res.redirect('/notes');});
app.get('/notes/:id',auth,(req,res)=>{const n=store.notes.find(x=>x.id===req.params.id);if(!n)return res.sendStatus(404);res.send(layout(n.title,`<div class="card"><h1>🔒 ${esc(n.title)}</h1><form method="post"><label>Nhập mật khẩu để mở note</label><input type="password" name="password" required autofocus><button>Mở note</button>${req.query.error?'<p class="danger">Mật khẩu không đúng.</p>':''}</form></div>`,req));});
app.post('/notes/:id',auth,(req,res)=>{const n=store.notes.find(x=>x.id===req.params.id);if(!n)return res.sendStatus(404);if(!bcrypt.compareSync(req.body.password||'',n.passwordHash))return res.redirect(`/notes/${n.id}?error=1`);try{const body=decryptNote(n.payload,req.body.password);res.send(layout(n.title,`<article class="card"><h1>${esc(n.title)}</h1><div class="markdown">${marked.parse(body)}</div></article>`,req));}catch{res.redirect(`/notes/${n.id}?error=1`);}});
app.use((err,req,res,next)=>{console.error(err);res.status(500).send(layout('Lỗi','<div class="card"><h1>Có lỗi xảy ra</h1><p>Kiểm tra log server để biết chi tiết.</p></div>',req));});
app.listen(PORT,()=>console.log(`Blogger chạy tại http://localhost:${PORT}`));
