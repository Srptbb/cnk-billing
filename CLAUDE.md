# CNK Billing System — CLAUDE.md

## Files
- `index.html` — ระบบบิลหลัก (billing, invoice, analytics, worklist tab)
- `cnk_crm.html` — ระบบ CRM (sales pace, red flag, contact log)
- `cnk_pricing.html` — ระบบตีราคา (SVG/DXF parser, worklist)
- `Code_v8.gs` — Google Apps Script backend (GET only, no POST)

## Deploy Flow
- push → GitHub (Srptbb/cnk-billing) → Vercel auto-deploy ~30s
- Apps Script URL: AKfycbzFPMqVCZ783-LIyxbDjqxroE-VpP8gIVPYh7uTeTAoYReKKmnjdMz5C5lvI3_FMPgT

## Environments (2 branch)
| | URL | branch | Supabase |
|---|---|---|---|
| ของจริง | cnk-billing.vercel.app | `main` | mksaqrbcjuumgafxlznn |
| ระบบเทส | cnk-billing-staging.vercel.app | `staging` | yuzezknnslzyyzbrtoxq |

- โค้ดชุดเดียวกัน แยกด้วย `IS_PROD = location.hostname === 'cnk-billing.vercel.app'`
  hostname อื่นทั้งหมด = staging อัตโนมัติ (ต่อ DB staging + `apiPost` ไม่เขียน Google Sheet)
- **⚠️ แก้บั๊กบน `main` เสร็จเมื่อไหร่ ต้องเตือนผู้ใช้ให้ merge ลง `staging` ทันทีทุกครั้ง**
  ไม่งั้นพอ merge `staging` → `main` วันหลัง ของที่แก้ไว้จะถูกทับหาย บั๊กเดิมกลับมา
- ฟีเจอร์ใหม่ทำบน `staging` เท่านั้น เทสผ่านแล้วผู้ใช้สั่ง merge ขึ้น `main`
- ก่อน merge เช็คระยะห่างเสมอ: `git log --oneline main..staging` และ `git log --oneline staging..main`
- Google OAuth ใส่ wildcard ไม่ได้ → URL ของ staging ต้องคงที่ (ผูกโดเมนกับ branch ใน Vercel)
  ห้ามใช้ URL preview ที่ Vercel สุ่มให้ เพราะจะเจอ `400: origin_mismatch`
- repo อยู่ใน `C:\Windows\System32` → git ต้องรันผ่าน PowerShell ที่ยกสิทธิ์
  และ **ยืนยัน push ด้วย `git ls-remote origin`** เพราะ `git log origin/main` ค้างได้ (เขียน ref ไม่ได้)

## Key Info
- Cloudinary: cloud=daxjl6uik, preset=cnk_bills
- Delete password: CNK130269
- Admin: sorapot.tb@gmail.com
- Auth: Google OAuth

## Google Sheets
bills, customers, invoices, profiles, sales_history, crm_logs, pricing, worklist, commissions, bills_history

## Coding Rules
- Vanilla JS only — no framework
- Font: Sarabun
- ห้ามสร้าง New Deployment ใน Apps Script (ได้ URL ใหม่) — ใช้ Edit existing เท่านั้น
- แก้โค้ดทีละส่วน อย่า rewrite ทั้งไฟล์ถ้าไม่จำเป็น
- ก่อนแก้อะไร บอก root cause ก่อนเสมอ