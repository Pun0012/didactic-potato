# ผีนางรำ

เกมสยองขวัญเรือนไทย 3D รันบนเว็บ เล่นคนเดียวหรือเล่นกับเพื่อนผ่านรหัสห้อง (ไม่ต้องล็อกอิน ไม่ต้องเพิ่มเพื่อน)

## โครงสร้าง
- `server.js` — เซิร์ฟเวอร์ Node.js (ไม่มี dependency) ส่งไฟล์เกม + ห้องออนไลน์ผ่าน WebSocket
- `public/index.html` — ตัวเกมทั้งหมด (ไฟล์เดียว รวมเพลงและระบบห้องออนไลน์แล้ว)
- `netshim.js` — ซอร์สของระบบห้องฝั่งเบราว์เซอร์ (ถูกฝังใน index.html อยู่แล้ว เก็บไว้อ้างอิง)
- `render.yaml`, `package.json` — ตั้งค่าสำหรับ Render

## รันในเครื่อง
```
node server.js
```
แล้วเปิด http://localhost:3000 (ต้องใช้ Node 18 ขึ้นไป)

## ขึ้น GitHub
```
git init
git add .
git commit -m "ผีนางรำ"
git branch -M main
git remote add origin https://github.com/<ชื่อคุณ>/<ชื่อ repo>.git
git push -u origin main
```

## ขึ้น Render
1. เข้า https://dashboard.render.com → **New +** → **Web Service**
2. เลือก repo นี้จาก GitHub
3. ตั้งค่า: Runtime = **Node**, Build Command = `echo no build needed` (หรือเว้นว่าง/`npm install`), Start Command = `node server.js`, Instance Type = Free
   (ถ้าใช้ **Blueprint** ให้ Render อ่าน `render.yaml` แทน ก็ได้)
4. กด **Create Web Service** รอจนสถานะเป็น Live แล้วเปิดลิงก์ `https://<ชื่อ>.onrender.com`
5. ส่งลิงก์ให้เพื่อน คนหนึ่งกด "สร้างห้อง" อีกคนกด "เข้าร่วมห้อง" แล้วใส่รหัส

## หมายเหตุ
- แพ็กเกจฟรีของ Render จะหลับเมื่อไม่มีคนใช้ (คนแรกที่เปิดอาจรอประมาณครึ่งนาที) และห้องที่ค้างอยู่จะหายถ้าเซิร์ฟเวอร์รีสตาร์ต เงื่อนไขของ Render เปลี่ยนได้ ตรวจที่หน้าราคาของ Render
- ห้องรับสูงสุด 6 คน เก็บในหน่วยความจำของเซิร์ฟเวอร์ ไม่มีฐานข้อมูล
- เกมโหลด three.js จาก cdnjs.cloudflare.com และฟอนต์จาก Google Fonts ผู้เล่นต้องต่ออินเทอร์เน็ต
- โค้ดแอดมินในเกมตรวจฝั่งผู้เล่น ไม่ใช่ความปลอดภัยจริงจัง เหมาะกับเล่นกับเพื่อน
