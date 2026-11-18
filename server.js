'use strict';
/* เซิร์ฟเวอร์เกมผีนางรำ — ไม่มี dependency ภายนอก (Node 18+)
   - ส่งไฟล์เกมจาก public/
   - ห้องออนไลน์ผ่าน WebSocket ที่ /ws?room=nr-xxxxx  */
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=parseInt(process.env.PORT,10)||3000;
/* หาโฟลเดอร์ไฟล์เกม: ใช้ public/ ถ้ามี index.html ในนั้น ไม่งั้นใช้โฟลเดอร์เดียวกับ server.js */
const PUB=fs.existsSync(path.join(__dirname,'public','index.html'))?path.join(__dirname,'public'):__dirname;
console.log('serving game files from',PUB);
const MAX_PEERS=6,MAX_MSG=32*1024,MAX_PRESENCE=48*1024,RATE=60; // ข้อความ/วินาที ต่อคน
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.ico':'image/x-icon','.mp3':'audio/mpeg','.json':'application/json'};

const rooms=new Map(); // name -> Map(id -> peer)
let nextId=1;

const server=http.createServer((req,res)=>{
  let p=decodeURIComponent((req.url||'/').split('?')[0]);
  if(p==='/healthz'){res.writeHead(200,{'content-type':'text/plain'});res.end('ok');return;}
  if(p==='/')p='/index.html';
  if(/^\/(server\.js|package\.json|render\.yaml|README\.md|\.gitignore|netshim\.js)$/.test(p)){res.writeHead(404);res.end('not found');return;}
  const f=path.normalize(path.join(PUB,p));
  if(f.indexOf(PUB)!==0){res.writeHead(403);res.end();return;}
  fs.readFile(f,(e,buf)=>{
    if(e){res.writeHead(404,{'content-type':'text/plain'});res.end('not found');return;}
    res.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream','cache-control':'no-cache'});
    res.end(buf);
  });
});

/* ---------- WebSocket (RFC 6455, ข้อความตัวอักษรเท่านั้น) ---------- */
function frame(op,payload){
  const len=payload.length;let h;
  if(len<126){h=Buffer.from([0x80|op,len]);}
  else if(len<65536){h=Buffer.alloc(4);h[0]=0x80|op;h[1]=126;h.writeUInt16BE(len,2);}
  else{h=Buffer.alloc(10);h[0]=0x80|op;h[1]=127;h.writeBigUInt64BE(BigInt(len),2);}
  return Buffer.concat([h,payload]);
}
function wsSend(p,obj){
  if(p.closed)return;
  try{p.sock.write(frame(1,Buffer.from(typeof obj==='string'?obj:JSON.stringify(obj))));}catch(e){}
}
function wsClose(p){
  if(p.closed)return;p.closed=true;
  try{p.sock.write(frame(8,Buffer.alloc(0)));}catch(e){}
  try{p.sock.destroy();}catch(e){}
  leave(p);
}
function leave(p){
  const room=rooms.get(p.room);if(!room||!room.has(p.id))return;
  room.delete(p.id);
  room.forEach(q=>wsSend(q,{t:'l',peer:p.id}));
  if(!room.size)rooms.delete(p.room);
}
function sizeOf(o){try{return JSON.stringify(o).length;}catch(e){return 1e9;}}

function onMessage(p,text){
  const now=Date.now();
  if(now-p.rt>1000){p.rt=now;p.rc=0;}
  if(++p.rc>RATE)return;
  let m;try{m=JSON.parse(text);}catch(e){return;}
  if(!m||m.t!=='p'||!m.patch||typeof m.patch!=='object'||Array.isArray(m.patch))return;
  const patch={};
  Object.keys(m.patch).slice(0,40).forEach(k=>{if(/^[a-zA-Z0-9_]{1,12}$/.test(k))patch[k]=m.patch[k];});
  const next=Object.assign({},p.presence);
  Object.keys(patch).forEach(k=>{if(patch[k]===null)delete next[k];else next[k]=patch[k];});
  if(sizeOf(next)>MAX_PRESENCE)return;
  p.presence=next;
  const room=rooms.get(p.room);if(!room)return;
  const out=JSON.stringify({t:'u',peer:p.id,patch:patch});
  room.forEach(q=>{if(q!==p)wsSend(q,out);});
}

server.on('upgrade',(req,sock)=>{
  const u=new URL(req.url,'http://x');
  const name=u.searchParams.get('room')||'';
  const key=req.headers['sec-websocket-key'];
  if(u.pathname!=='/ws'||!key||!/^nr-[a-z0-9]{5}$/.test(name)){sock.write('HTTP/1.1 400 Bad Request\r\n\r\n');sock.destroy();return;}
  const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: '+accept+'\r\n\r\n');
  sock.setNoDelay(true);
  const p={sock:sock,room:name,id:'p'+(nextId++).toString(36)+crypto.randomBytes(2).toString('hex'),presence:{},closed:false,alive:true,rt:0,rc:0,buf:Buffer.alloc(0),frag:null};
  let room=rooms.get(name);if(!room){room=new Map();rooms.set(name,room);}
  if(room.size>=MAX_PEERS){wsSend(p,{t:'full'});p.closed=true;sock.destroy();return;}
  const others=[];room.forEach(q=>others.push({peer:q.id,presence:q.presence}));
  room.set(p.id,p);
  wsSend(p,{t:'hello',me:p.id,peers:others.concat([{peer:p.id,presence:{}}])});
  room.forEach(q=>{if(q!==p)wsSend(q,{t:'join',peer:p.id,presence:{}});});

  sock.on('data',chunk=>{
    p.buf=Buffer.concat([p.buf,chunk]);
    if(p.buf.length>MAX_MSG*2){wsClose(p);return;}
    for(;;){
      const b=p.buf;if(b.length<2)return;
      const fin=!!(b[0]&0x80),op=b[0]&0x0f,masked=!!(b[1]&0x80);let len=b[1]&0x7f,off=2;
      if(!masked){wsClose(p);return;}
      if(len===126){if(b.length<4)return;len=b.readUInt16BE(2);off=4;}
      else if(len===127){if(b.length<10)return;const big=b.readBigUInt64BE(2);if(big>BigInt(MAX_MSG)){wsClose(p);return;}len=Number(big);off=10;}
      if(len>MAX_MSG){wsClose(p);return;}
      if(b.length<off+4+len)return;
      const mask=b.slice(off,off+4),data=Buffer.from(b.slice(off+4,off+4+len));
      for(let i=0;i<data.length;i++)data[i]^=mask[i&3];
      p.buf=b.slice(off+4+len);
      if(op===8){wsClose(p);return;}
      if(op===9){try{sock.write(frame(10,data));}catch(e){}continue;}
      if(op===10){p.alive=true;continue;}
      if(op===1||op===0){
        if(op===1)p.frag=[];
        if(!p.frag)continue;
        p.frag.push(data);
        if(fin){const txt=Buffer.concat(p.frag).toString('utf8');p.frag=null;onMessage(p,txt);}
      }
    }
  });
  sock.on('close',()=>{p.closed=true;leave(p);});
  sock.on('error',()=>{p.closed=true;try{sock.destroy();}catch(e){}leave(p);});
});

/* ping ทุก 25 วิ กันโฮสต์ตัดการเชื่อมต่อที่เงียบ */
setInterval(()=>{
  rooms.forEach(room=>room.forEach(p=>{
    if(!p.alive){wsClose(p);return;}
    p.alive=false;try{p.sock.write(frame(9,Buffer.alloc(0)));}catch(e){}
  }));
},25000).unref();

server.listen(PORT,'0.0.0.0',()=>console.log('ผีนางรำ listening on '+PORT));
