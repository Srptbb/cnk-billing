# CNK Billing System — CLAUDE.md

## Files
- `index.html` — ระบบบิลหลัก (billing, invoice, analytics, worklist tab)
- `cnk_crm.html` — ระบบ CRM (sales pace, red flag, contact log)
- `cnk_pricing.html` — ระบบตีราคา (SVG/DXF parser, worklist)
- `Code_v8.gs` — Google Apps Script backend (GET only, no POST)

## Deploy Flow
- push → GitHub (Srptbb/cnk-billing) → Vercel auto-deploy ~30s
- URL: cnk-billing.vercel.app
- Apps Script URL: AKfycbzFPMqVCZ783-LIyxbDjqxroE-VpP8gIVPYh7uTeTAoYReKKmnjdMz5C5lvI3_FMPgT

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