/* ============================================================================
   cnk_db.js — ชั้นข้อมูลกลางของทุกหน้า
   ใช้ร่วมกันโดย index.html, cnk_crm.html, cnk_pricing.html, cnk_draft.html

   ทำไมต้องแยกไฟล์:
   ก่อนหน้านี้ config + สคีมา + ตัวอ่าน/เขียน Supabase ถูกคัดลอกไว้ในทั้ง 4 หน้า
   เวลาแก้อะไรต้องไล่แก้ 4 ที่ และที่ผ่านมาก็ลืมจริงๆ — cnk_pricing.html เคยดึง
   รายชื่อลูกค้าจาก Apps Script โดยไม่มี guard !IS_PROD ทั้งที่บันทึกงานลง DB staging
   ตัวคูณราคาเลยมาจากคนละที่กับที่เขียน

   ข้อบังคับของไฟล์นี้: ใช้ var + function declaration เท่านั้น ห้าม const/let ที่ระดับบนสุด
   เพราะ const ที่ top-level ของ classic script สร้าง binding ใน global lexical scope
   ถ้าหน้าไหนยังมี var ชื่อเดียวกันหลงเหลือ จะ SyntaxError ทั้งหน้า ไม่ใช่แค่พังฟังก์ชันเดียว
   ส่วน var/function เป็น property ของ window มองเห็นข้าม <script> ได้เสมอ

   ต้องโหลดไฟล์นี้ "ก่อน" <script> ตัวหลักของแต่ละหน้า (plain script ไม่ใส่ async/defer)
   ============================================================================ */

var API = 'https://script.google.com/macros/s/AKfycbzFPMqVCZ783-LIyxbDjqxroE-VpP8gIVPYh7uTeTAoYReKKmnjdMz5C5lvI3_FMPgT/exec';

/* ===== Environment =====
   production คือ hostname เดียวเท่านั้น — preview ของ Vercel, localhost, เปิดไฟล์ตรงๆ = staging ทั้งหมด
   เลือกทางนี้เพราะ "ลืมสลับ" แล้วพลาดไปทาง staging (ไม่มีอะไรเสีย) ดีกว่าพลาดไปเขียนทับของจริง */
var IS_PROD = (location.hostname === 'cnk-billing.vercel.app');

/* ===== Supabase ===== */
var SB_URL = IS_PROD ? 'https://mksaqrbcjuumgafxlznn.supabase.co'
                     : 'https://yuzezknnslzyyzbrtoxq.supabase.co';
var SB_KEY = IS_PROD ? 'sb_publishable_X3vWm8LmZUIUfgo2Vwgs2A_Fw75Y7j7'
                     : 'sb_publishable_i42KYa1z_58Xvm2KnSZMwg_ML5bVwzu';
var SB_H = {'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json'};

/* Cloudinary มีบัญชีเดียว staging เลยอัปรูปปนเข้าโฟลเดอร์ของจริงมาตลอด
   แยกเป็นโฟลเดอร์ย่อย staging/ เพื่อให้กวาดทิ้งทีหลังได้โดยไม่แตะรูปบิลจริง
   (ใช้ preset เดิม เพราะ preset แบบ unsigned ยอมให้ override folder ได้) */
function cldFolder(base){ return IS_PROD ? base : base + '/staging'; }

/* แถบเตือน staging: วางไว้ล่างสุดแบบ fixed เพื่อไม่ไปดัน nav/sub-bar ที่เป็น sticky แล้วเลย์เอาต์เพี้ยน */
if (!IS_PROD) {
  document.addEventListener('DOMContentLoaded', function(){
    var b = document.createElement('div');
    b.textContent = '⚠️ STAGING — ข้อมูลทดลอง ไม่กระทบของจริง · ' + location.hostname;
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#dc2626;color:#fff;text-align:center;font-family:Sarabun,sans-serif;font-size:13px;font-weight:600;padding:6px 10px;box-shadow:0 -2px 8px rgba(0,0,0,.25);';
    document.body.appendChild(b);
    document.title = '[STAGING] ' + document.title;
  });
}

/* ===== สคีมา =====
   คอลัมน์ + ชนิดข้อมูล (ตรงกับสคีมา Postgres) แยกตามตาราง สำหรับล้างค่าก่อนเขียน
   เป็นการรวม SB_COLS ของ index.html (9 ตาราง) กับของ cnk_crm.html (2 ตาราง)
   ไม่มีชื่อตารางชนกัน — หน้าไหนไม่เขียนตารางไหน การมีสคีมาเกินมาก็ไม่ทำอะไร
   หมายเหตุ: SB_TABLES/SB_MIRROR ไม่ได้อยู่ที่นี่ เพราะเป็น "นโยบายของแต่ละหน้า"
   ว่าหน้านั้นอ่าน/เขียนตารางไหน ไม่ใช่โครงสร้างข้อมูล */
var SB_COLS = {
  worklist:{
    text:['id','custName','note','jobSource','bladeCut','bladeCrease','woodType','status','memo','bladeCount','woodCount'],
    num:['cutMM','creaseMM','woodW','woodH','price','priceBeforeLaser','rawPrice','finalPrice','costPerf','laserAdd','bladeChangeAdd','woodChangeAdd','holeAdd','holeCount','perfMM','perfCount'],
    bool:['laser','bladeChange','woodChange','manual','statusDesigned','statusWorking','statusComplete','statusShipped','statusPaid'],
    jsonb:['holes','perfs'],
    ts:['ts']
  },
  bills:{
    text:['id','no','date','type','createdBy','cn','cc','ca','tax','discType','status','paidDate','remark'],
    num:['sub','discVal','discAmt','vat','grand'],
    bool:['hasVat'],
    jsonb:['items'],
    ts:['ts']
  },
  customers:{
    text:['id','n','a','c','t','ty','no','tax'],
    num:['multiplier'],
    bool:['tax3'],
    jsonb:[],
    ts:['ts']
  },
  invoices:{
    text:['id','no','date','custName','custAddr','custTel','discType','remark','status','payMethod','payDate','paidDate','chequeDate','actualDate','payRemark','paidNote'],
    num:['rawTotal','tax3amt','total','discVal','discAmt'],
    bool:[],
    jsonb:['billNos','bills'],
    ts:['ts']
  },
  pricing:{
    text:['id','blade','type'],
    num:['cost_per_mm','var1','wood_cost_per_mm2','sort'],
    bool:[],
    jsonb:[],
    ts:['ts']
  },
  profiles:{
    text:['id','email','displayName','lastSeen'],
    num:[],
    bool:[],
    jsonb:[],
    ts:['ts']
  },
  quotations:{
    text:['id','no','date','expireDate','remark','status','cn','cc','ca','createdBy'],
    num:['sub','vat','grand'],
    bool:[],
    jsonb:['items'],
    ts:['ts']
  },
  draft_queue:{
    text:['id','wlId','custName','jobName','tech','fileUrl','fileName','instrText','instrImgUrl','status','createdBy','createdAt','doneAt','bladeCut'],
    num:[],
    bool:[],
    jsonb:[],
    ts:[]
  },
  // อ่านอย่างเดียว ไม่มีโค้ดเขียนลงตารางนี้ (เป็นยอดสะสมก่อน ST_LIVE_FROM)
  // id สังเคราะห์จาก date+customer+sales+qty เพราะชีทไม่มีคีย์ วันเดียวกันยอดเท่ากันมี 68 จุด
  bills_history:{
    text:['id','date','customer'],
    num:['sales','qty'],
    bool:[],
    jsonb:[],
    ts:[]
  },
  // --- จาก cnk_crm.html (crm_logs เป็น text ทุกคอลัมน์) ---
  // prospects.ts เป็น timestamptz ไม่ใช่ text: ส่ง '' เข้าไปจะ error ต้องเป็น null
  crm_logs:{
    text:['id','custId','custName','date','method','result','note','followupDate','by','ts'],
    num:[], bool:[], jsonb:[], ts:[]
  },
  prospects:{
    text:['id','name','contact','channel','address','bizType','status','nextFollowup','lastContactNote','createdBy'],
    num:[], bool:[], jsonb:[], ts:['ts']
  }
};

/* ล้าง/แปลงชนิดค่าเฉพาะคีย์ที่มีจริงใน row (รองรับทั้ง full-row และ partial update)
   ตารางที่ไม่รู้จัก = คืนค่าเดิมไปตรงๆ (พฤติกรรมเดิมของ cnk_crm.html)
   ไม่ระบุตาราง = worklist (พฤติกรรมเดิมของ index.html/cnk_pricing.html) */
function sbClean(row, table){
  var c = SB_COLS[table || 'worklist'];
  if(!c) return row;
  var o = {};
  for(var k in row){
    if(!row.hasOwnProperty(k)) continue;
    var v = row[k];
    if(v === undefined) continue;
    if(c.num.indexOf(k) >= 0){ o[k] = (v===''||v===null) ? null : Number(v); if(typeof o[k]==='number' && isNaN(o[k])) o[k]=null; }
    else if(c.bool.indexOf(k) >= 0){ o[k] = (v===true||v==='true'||v===1||v==='1'); }
    else if(c.jsonb && c.jsonb.indexOf(k) >= 0){ o[k] = (v===''||v===null) ? null : v; }
    else if(c.ts && c.ts.indexOf(k) >= 0){ o[k] = (v===''||v===null) ? null : v; }
    else if(c.text.indexOf(k) >= 0){ o[k] = (v===null) ? null : String(v); }
    // คีย์ที่ไม่อยู่ในสคีมา = ข้ามไป (กัน PostgREST error)
  }
  return o;
}

/* ===== อ่าน =====
   PostgREST จำกัด 1000 แถว/คำขอ — ต้องไล่ทีละหน้าด้วย Range ไม่งั้นข้อมูลหายเงียบ
   และต้องสั่ง order= เสมอ: Postgres ไม่รับประกันลำดับถ้าไม่สั่ง พอ bills เกิน 1000 แถว
   การไล่หน้า 2 คำขอจึงเป็นคนละลำดับได้ ถ้ามีคนแก้บิลคั่นกลาง แถวนั้นถูกเขียนใหม่ไปท้าย heap
   แล้วแถวตรงรอยต่อจะซ้ำ 1 หาย 1 แบบเงียบๆ (id.asc ของ bills = ลำดับเวลาอยู่แล้ว)

   sbGetAll   = คืน promise, throw ถ้าล้มเหลวหลัง retry ครบ (cnk_crm / cnk_pricing / cnk_draft)
   sbGetAllCB = แบบ callback, ไม่ throw, ล้มเหลวเรียก cb([], true) (index.html) */
function sbGetAll(table, _try){
  _try = _try || 0;
  var STEP = 1000;
  var all = [], from = 0;
  function page(){
    return fetch(SB_URL+'/rest/v1/'+table+'?select=*&order=id.asc',
                 {headers: Object.assign({}, SB_H, {'Range': from+'-'+(from+STEP-1)})})
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(d){
        var rows = Array.isArray(d) ? d : [];
        all = all.concat(rows);
        if(rows.length < STEP) return all;
        from += STEP;
        return page();
      });
  }
  return page().catch(function(e){
    if(_try < 4){
      return new Promise(function(rs){ setTimeout(rs, 800*(_try+1)); })
        .then(function(){ return sbGetAll(table, _try+1); });
    }
    throw e;
  });
}
function sbGetAllCB(table, cb){
  sbGetAll(table).then(function(rows){ cb(rows); })
    .catch(function(e){ console.error('sbGetAll failed:', table, e); cb([], true); });
}

/* ===== เขียน =====
   save = upsert, update = PATCH เฉพาะคอลัมน์, delete = DELETE

   sbWrite   = คืน promise, reject ถ้าไม่ ok — ใช้กับตารางที่ "อ่านจาก Supabase แล้ว"
               เพราะถ้ามิเรอร์เงียบๆ แล้วพลาด หน้าจอจะไม่เห็นสิ่งที่เพิ่งบันทึก
               (อาการเดียวกับที่ทำให้ draft_queue หายไป 1 แถวโดยไม่มีใครรู้)
   sbWriteCB = แบบ callback, ไม่ reject, log แล้วเรียก cb(err) — ใช้กับขามิเรอร์ที่พลาดได้ */
function sbWrite(method, table, id, data){
  var url = SB_URL+'/rest/v1/'+table, opt;
  if(method === 'delete'){
    opt = {method:'DELETE', headers:SB_H};
    url += '?id=eq.'+encodeURIComponent(id);
  } else if(method === 'update'){
    opt = {method:'PATCH', headers:Object.assign({}, SB_H, {'Prefer':'return=minimal'}), body:JSON.stringify(sbClean(data, table))};
    url += '?id=eq.'+encodeURIComponent(id);
  } else { // save = upsert
    var row = sbClean(data, table); if(id && !row.id) row.id = String(id);
    opt = {method:'POST', headers:Object.assign({}, SB_H, {'Prefer':'resolution=merge-duplicates,return=minimal'}), body:JSON.stringify(row)};
  }
  return fetch(url, opt).then(function(r){
    if(!r.ok){ return r.text().then(function(t){ throw new Error('HTTP '+r.status+': '+t.slice(0,200)); }); }
  });
}
function sbWriteCB(method, table, id, data, cb){
  return sbWrite(method, table, id, data)
    .then(function(){ if(cb) cb(); })
    .catch(function(e){ console.error('sbWrite '+method+' '+table+' error:', e); if(cb) cb(e); });
}

/* ===== เวลา =====
   ชีทเก็บวันที่เป็น Date ของกรุงเทพ พอผ่าน JSON มาเป็น instant UTC
   เที่ยงคืน 1 ก.ย. กรุงเทพ = "2026-08-31T17:00:00.000Z" -> ตัด 10 ตัวหน้าได้ 31 ส.ค. ผิดทั้งวันทั้งเดือน
   ต้องเลื่อน +7 ชม. แล้วอ่าน component แบบ UTC ถึงได้ปฏิทินกรุงเทพเท่าของเดิม
   เฉพาะค่าที่มีส่วนเวลา (มี T) เท่านั้น — "2026-04-15" เปล่าๆ ห้ามเลื่อน ไม่งั้นเพี้ยนกลับทางตรงข้าม */
function bkkParts(val){
  var s = String(val || '');
  if(!/^\d{4}-\d{2}/.test(s) || s.indexOf('T') < 0) return null;
  var d = new Date(s);
  if(isNaN(d.getTime())) return null;
  d = new Date(d.getTime() + 7*3600*1000);
  return { y:d.getUTCFullYear(), m:d.getUTCMonth()+1, d:d.getUTCDate() };
}
function p2(n){ return String(n).padStart(2,'0'); }
