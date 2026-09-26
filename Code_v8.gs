const SS = SpreadsheetApp.getActiveSpreadsheet();
const DRIVE_FOLDER_NAME = 'CNK_Bill_Images';

function getOrCreateFolder() {
  var folders = DriveApp.getFoldersByName(DRIVE_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(DRIVE_FOLDER_NAME);
}

function getSheet(name) { return SS.getSheetByName(name); }

function sheetToJson(sheet, dateField, monthsBack) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  var cutoff = null;
  if (dateField && monthsBack) {
    var d = new Date();
    d.setMonth(d.getMonth() - monthsBack);
    cutoff = d.toISOString().slice(0,7);
  }
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    headers.forEach(function(h, j) {
      try { obj[h] = JSON.parse(data[i][j]); }
      catch(e) { obj[h] = data[i][j]; }
    });
    if (cutoff && dateField && obj[dateField]) {
      if (String(obj[dateField]).slice(0,7) < cutoff) continue;
    }
    rows.push(obj);
  }
  return rows;
}

function findRowById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return -1;
  const headers = data[0];
  var idStr = String(id).trim();
  var idCol = headers.indexOf('id');
  if (idCol === -1) idCol = 0;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === idStr) return i + 1;
  }
  return -1;
}

function makeRes(data) {
  const out = ContentService.createTextOutput(JSON.stringify(data));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

// clean ชื่อลูกค้า
function cleanName(s) {
  return String(s || '')
    .replace(/ /g, ' ')
    .replace(/​/g, '')
    .replace(/　/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// หา key ที่ match ใน salesMap: exact -> case-insensitive -> prefix
function findMatchedKey(cn, salesMap) {
  if (salesMap[cn]) return cn;
  var cnLower = cn.toLowerCase();
  var keys = Object.keys(salesMap);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === cnLower) return keys[i];
  }
  for (var j = 0; j < keys.length; j++) {
    var kLower = keys[j].toLowerCase();
    if (cnLower.indexOf(kLower) === 0 || kLower.indexOf(cnLower) === 0) return keys[j];
  }
  return null;
}

function toYearMonth(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return val.getFullYear() + '-' + String(val.getMonth() + 1).padStart(2, '0');
  }
  var s = String(val).trim();
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  // รองรับ d/m/yy หรือ d/m/yyyy (พ.ศ. หรือ ค.ศ.)
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    var y = parseInt(m[3], 10);
    if (y < 100) y += 2500;       // 69 -> 2569
    if (y > 2400) y -= 543;       // พ.ศ. -> ค.ศ.
    return y + '-' + String(parseInt(m[2], 10)).padStart(2, '0');
  }
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  return '';
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    const table  = e.parameter.table;
    const method = e.parameter._method;
    const months = e.parameter.months ? parseInt(e.parameter.months) : null;

    // CRM endpoints
    if (action === 'getCrmDashboard')    return makeRes(getCrmDashboard());
    if (action === 'getCrmSalesHistory') return makeRes(getCrmSalesHistory(e.parameter.custName));
    if (action === 'getCrmLogs')         return makeRes(getCrmLogs(e.parameter.custName));
    if (action === 'getTargets')         return makeRes(getTargets());
    if (action === 'debugCust')          return makeRes(debugCust(e.parameter.name));

    // Commission endpoints
    if (action === 'getMonthBills')        return makeRes(getMonthBills(e.parameter.month));
    if (action === 'getLoyalNewCustomers') return makeRes({ customers: getLoyalNewCustomers(e.parameter.salesName) });
    if (action === 'getSavedCommissions')  return makeRes({ rows: getSavedCommissions(e.parameter.month, e.parameter.salesName) });
    if (action === 'saveCommissions')      return makeRes(saveCommissions(JSON.parse(e.parameter.data)));

    // Billing endpoints
    if (method === 'save')           return makeRes(saveRow(table, JSON.parse(e.parameter.data)));
    if (method === 'update')         return makeRes(updateRow(table, e.parameter.id, JSON.parse(e.parameter.data)));
    if (method === 'delete')         return makeRes(deleteRow(table, e.parameter.id));
    if (method === 'uploadChunk')    return makeRes(uploadChunk(e.parameter.uploadId, parseInt(e.parameter.chunkIdx), e.parameter.data));
    if (method === 'finalizeUpload') return makeRes(finalizeUpload(e.parameter.uploadId, e.parameter.filename, e.parameter.mime, parseInt(e.parameter.totalChunks)));

    if (action === 'getAll') {
          var dateField = (table === 'bills' || table === 'invoices' || table === 'quotations') ? 'date'
                    : (table === 'worklist') ? 'ts' : null;
      return makeRes(getAll(table, dateField, months));
    }

    return makeRes({ error: 'Unknown action' });
  } catch(err) {
    return makeRes({ error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { action, table, data, id } = body;
    if (action === 'save')        return makeRes(saveRow(table, data));
    if (action === 'update')      return makeRes(updateRow(table, id, data));
    if (action === 'delete')      return makeRes(deleteRow(table, id));
    if (action === 'uploadImage') return makeRes(uploadImage(body.filename, body.base64, body.mime));
    if (action === 'deleteImage') return makeRes(deleteImage(body.fileId));
    return makeRes({ error: 'Unknown' });
  } catch(err) {
    return makeRes({ error: err.message });
  }
}

function getAll(table, dateField, monthsBack) {
  const sheet = getSheet(table);
  if (!sheet) return [];
  return sheetToJson(sheet, dateField, monthsBack);
}

function saveRow(table, data) {
  const sheet = getSheet(table);
  if (!sheet) throw new Error('Sheet not found: ' + table);

  // ล็อกกันหลาย request (เช่น GET ที่ browser retry ตอนเน็ตช้า) เขียนพร้อมกัน
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch(e) {}

  try {
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(Object.keys(data));
    }

    // กันแถว id ซ้ำ: ถ้ามี id นี้อยู่แล้ว (แปลว่าเป็น request ซ้ำ) -> update แถวเดิมแทนการ append
    if (data && data.id !== undefined && data.id !== null && String(data.id) !== '') {
      var existing = findRowById(sheet, data.id);
      if (existing !== -1) {
        return updateRow(table, data.id, data);
      }
    }

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var newKeys = Object.keys(data).filter(function(k) { return headers.indexOf(k) === -1; });
    if (newKeys.length > 0) {
      newKeys.forEach(function(k) {
        headers.push(k);
        sheet.getRange(1, headers.length).setValue(k);
      });
    }
    var row = headers.map(function(h) {
      var v = data[h];
      return (typeof v === 'object' && v !== null) ? JSON.stringify(v) : (v !== undefined ? v : '');
    });
    sheet.appendRow(row);
    SpreadsheetApp.flush();   // เขียนให้เสร็จก่อนปล่อยล็อก เพื่อให้ request ถัดไปเห็น id นี้
    return { success: true };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function updateRow(table, id, data) {
  const sheet = getSheet(table);
  if (!sheet) throw new Error('Sheet not found: ' + table);
  const rowNum = findRowById(sheet, id);
  if (rowNum === -1) return { error: 'Row not found for id: ' + id };
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var newKeys = Object.keys(data).filter(function(k) { return headers.indexOf(k) === -1; });
  if (newKeys.length > 0) {
    newKeys.forEach(function(k) {
      headers.push(k);
      sheet.getRange(1, headers.length).setValue(k);
    });
  }
  headers.forEach(function(h, i) {
    if (data[h] !== undefined) {
      var v = data[h];
      sheet.getRange(rowNum, i + 1).setValue(
        (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v
      );
    }
  });
  return { success: true };
}

function deleteRow(table, id) {
  const sheet = getSheet(table);
  if (!sheet) return { success: true };
  const rowNum = findRowById(sheet, id);
  if (rowNum !== -1) sheet.deleteRow(rowNum);
  return { success: true };
}

// ===== CHUNKED IMAGE UPLOAD =====
function uploadChunk(uploadId, chunkIdx, data) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('chunk_' + uploadId + '_' + chunkIdx, data);
  return { success: true };
}

function finalizeUpload(uploadId, filename, mimeType, totalChunks) {
  try {
    var props = PropertiesService.getScriptProperties();
    var base64 = '';
    for (var i = 0; i < totalChunks; i++) {
      var key = 'chunk_' + uploadId + '_' + i;
      var chunk = props.getProperty(key);
      if (!chunk) throw new Error('Missing chunk ' + i);
      base64 += chunk;
      props.deleteProperty(key);
    }
    return uploadImage(filename, base64, mimeType);
  } catch(err) {
    return { error: err.message };
  }
}

function uploadImage(filename, base64, mimeType) {
  try {
    var folder = getOrCreateFolder();
    var decoded = Utilities.base64Decode(base64);
    var blob = Utilities.newBlob(decoded, mimeType || 'image/jpeg', filename);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var fileId = file.getId();
    var url = 'https://drive.google.com/uc?export=view&id=' + fileId;
    return { success: true, url: url, fileId: fileId };
  } catch(err) {
    return { error: err.message };
  }
}

function deleteImage(fileId) {
  try {
    DriveApp.getFileById(fileId).setTrashed(true);
    return { success: true };
  } catch(err) {
    return { error: err.message };
  }
}

// ===== CRM FUNCTIONS =====

function getCrmSalesHistory(custName) {
  var result = [];
  var billSet = {};
  var billMap = {};
  var billSheet = getSheet('bills');
  if (billSheet) {
    sheetToJson(billSheet, null, null).forEach(function(b) {
      if (b.status === 'cancelled') return;
      var cn = cleanName(b.cn);
      if (!cn) return;
      if (custName && cn !== String(custName).trim()) return;
      var month = toYearMonth(b.date);
      if (!month) return;
      var key = cn + '|' + month;
      billSet[key] = true;
      if (!billMap[key]) billMap[key] = { custName: cn, month: month, amount: 0, source: 'billing' };
      billMap[key].amount += Number(b.grand) || 0;
    });
  }
  var histSheet = getSheet('sales_history');
  if (histSheet) {
    sheetToJson(histSheet, null, null).forEach(function(r) {
      var cn = cleanName(r.custName);
      if (!cn) return;
      if (custName && cn !== String(custName).trim()) return;
      var month = toYearMonth(r.month);
      if (!month) return;
      var key = cn + '|' + month;
      if (billSet[key]) return;
      result.push({ custName: cn, shop: String(r.shop || '').trim(), month: month, amount: Number(r.amount) || 0, source: 'manual' });
    });
  }
  Object.values(billMap).forEach(function(v) { result.push(v); });
  result.sort(function(a, b) { return a.month < b.month ? -1 : 1; });
  return result;
}

function getCrmLogs(custName) {
  var sheet = getSheet('crm_logs');
  if (!sheet) return [];
  var rows = sheetToJson(sheet, null, null);
  if (custName) {
    rows = rows.filter(function(r) { return String(r.custName || '').trim() === String(custName).trim(); });
  }
  rows.sort(function(a, b) { return String(a.date) > String(b.date) ? -1 : 1; });
  return rows;
}

function getTargets() {
  var salesMap = {};
  var histSheet = getSheet('sales_history');
  if (histSheet) {
    sheetToJson(histSheet, null, null).forEach(function(r) {
      var cn = cleanName(r.custName);
      if (!cn) return;
      var month = toYearMonth(r.month);
      if (!month) return;
      var shop = String(r.shop || '').trim();
      var amt = Number(r.amount) || 0;
      // บันทึก shop ไว้เสมอ แม้ยอดเป็น 0 (ลูกค้ามีร้านกำหนดแล้ว ไม่ควรกลายเป็น CNK)
      if (!salesMap[cn]) salesMap[cn] = { shop: shop, months: {} };
      if (!salesMap[cn].shop && shop) salesMap[cn].shop = shop;
      if (amt <= 0) return;  // ยอด 0 ไม่ต้องบวกเข้า months แต่ shop เก็บไปแล้ว
      salesMap[cn].months[month] = (salesMap[cn].months[month] || 0) + amt;
    });
  }
  var billMonths = {};
  var billSheet = getSheet('bills');
  if (billSheet) {
    sheetToJson(billSheet, null, null).forEach(function(b) {
      if (b.status === 'cancelled') return;
      var cn = cleanName(b.cn);
      if (!cn) return;
      var month = toYearMonth(b.date);
      if (!month) return;
      var amt = Number(b.grand) || 0;
      if (amt <= 0) return;
      var matchedKey = findMatchedKey(cn, salesMap) || cn;
      if (!salesMap[matchedKey]) salesMap[matchedKey] = { shop: '', months: {} };
      var key = matchedKey + '|' + month;
      if (!billMonths[key]) { billMonths[key] = 0; salesMap[matchedKey].months[month] = 0; }
      billMonths[key] += amt;
      salesMap[matchedKey].months[month] = billMonths[key];
    });
  }
  var thisMonth = (function() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  })();
  var targets = {};
  Object.keys(salesMap).forEach(function(cn) {
    var info = salesMap[cn];
    var amounts = Object.keys(info.months)
      .filter(function(m) { return m !== thisMonth && info.months[m] > 0; })
      .map(function(m) { return info.months[m]; })
      .sort(function(a, b) { return b - a; });
    if (amounts.length === 0) {
      // ไม่มียอด แต่ถ้ามี shop จาก history ให้ส่ง target=0 ไปด้วย (shop จะได้ไม่หาย -> ไม่กลายเป็น CNK)
      if (info.shop) targets[cn] = { shop: info.shop, target: 0 };
      return;
    }
    var top3 = amounts.slice(0, 3);
    var avg = Math.round(top3.reduce(function(s, v) { return s + v; }, 0) / top3.length);
    targets[cn] = { shop: info.shop, target: avg };
  });
  return targets;
}

function debugCust(searchName) {
  var result = { historyNames: [], billNames: [] };
  var histSheet = getSheet('sales_history');
  if (histSheet) {
    sheetToJson(histSheet, null, null).forEach(function(r) {
      var cn = cleanName(r.custName);
      if (cn.indexOf(searchName) >= 0 || searchName.indexOf(cn) >= 0) {
        result.historyNames.push({ raw: String(r.custName), clean: cn, len: cn.length });
      }
    });
  }
  var billSheet = getSheet('bills');
  if (billSheet) {
    sheetToJson(billSheet, null, null).forEach(function(b) {
      var cn = cleanName(b.cn);
      if (cn.indexOf(searchName) >= 0 || searchName.indexOf(cn) >= 0) {
        if (!result.billNames.find(function(x){return x.clean===cn;})) {
          result.billNames.push({ raw: String(b.cn), clean: cn, len: cn.length, month: toYearMonth(b.date) });
        }
      }
    });
  }
  return result;
}

// Dashboard v8
function getCrmDashboard() {
  var today = new Date();
  var todayDay = today.getDate();
  var thisMonthStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
  var prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  var prevMonthStr = prevDate.getFullYear() + '-' + String(prevDate.getMonth() + 1).padStart(2, '0');
  var salesMap = {};

  // STEP 1: sales_history
  var histSheet = getSheet('sales_history');
  if (histSheet) {
    sheetToJson(histSheet, null, null).forEach(function(r) {
      var cn = cleanName(r.custName);
      if (!cn) return;
      var month = toYearMonth(r.month);
      if (!month) return;
      var shop = String(r.shop || '').trim();
      if (!salesMap[cn]) salesMap[cn] = { shop: shop, months: {} };
      if (!salesMap[cn].shop) salesMap[cn].shop = shop;
      salesMap[cn].months[month] = (salesMap[cn].months[month] || 0) + (Number(r.amount) || 0);
    });
  }

  // STEP 2: bills override
  var billThisMonth = {};
  var billSheet = getSheet('bills');
  if (billSheet) {
    sheetToJson(billSheet, null, null).forEach(function(b) {
      if (b.status === 'cancelled') return;
      var cn = cleanName(b.cn);
      if (!cn) return;
      var month = toYearMonth(b.date);
      if (!month) return;
      var matchedKey = findMatchedKey(cn, salesMap) || cn;
      if (!salesMap[matchedKey]) salesMap[matchedKey] = { shop: '', months: {} };
      if (!salesMap[matchedKey]._billMonths) salesMap[matchedKey]._billMonths = {};
      if (!salesMap[matchedKey]._billMonths[month]) {
        salesMap[matchedKey]._billMonths[month] = 0;
        salesMap[matchedKey].months[month] = 0;
      }
      var amt = Number(b.grand) || 0;
      salesMap[matchedKey]._billMonths[month] += amt;
      salesMap[matchedKey].months[month] = salesMap[matchedKey]._billMonths[month];
      if (month === thisMonthStr) {
        billThisMonth[matchedKey] = (billThisMonth[matchedKey] || 0) + amt;
      }
    });
  }

  // STEP 3: crm_logs
  var lastContactMap = {};
  var logSheet = getSheet('crm_logs');
  if (logSheet) {
    sheetToJson(logSheet, null, null).forEach(function(r) {
      var cn = cleanName(r.custName);
      if (!lastContactMap[cn] || String(r.date) > String(lastContactMap[cn].date)) {
        lastContactMap[cn] = { date: String(r.date).slice(0,10), result: r.result };
      }
    });
  }

  // STEP 4: คำนวณ flag
  var flags = [];
  var allCustomers = [];

  Object.keys(salesMap).forEach(function(cn) {
    var info = salesMap[cn];
    var allMonths = Object.keys(info.months).filter(function(m) { return m !== '_billMonths'; }).sort();
    if (allMonths.length === 0) return;
    var activeMonths = allMonths.filter(function(m) { return info.months[m] > 0; });
    if (activeMonths.length === 0) return;
    var lastActiveMonth = activeMonths[activeMonths.length - 1];
    var peakMonths = activeMonths.filter(function(m) { return m !== thisMonthStr; });
    var peakAmount = peakMonths.length > 0
      ? Math.max.apply(null, peakMonths.map(function(m) { return info.months[m]; }))
      : Math.max.apply(null, activeMonths.map(function(m) { return info.months[m]; }));
    if (!isFinite(peakAmount)) peakAmount = 0;
    var frequency = activeMonths.length / Math.max(allMonths.length, 1);
    var parts = lastActiveMonth.split('-');
    var prevParts = prevMonthStr.split('-');
    var diffMonths = (parseInt(prevParts[0]) - parseInt(parts[0])) * 12 + (parseInt(prevParts[1]) - parseInt(parts[1]));
    var recentAmount = info.months[prevMonthStr] || 0;
    var thisMonthActual = billThisMonth[cn] || 0;
    if (!thisMonthActual) {
      var cnLower = cn.toLowerCase();
      Object.keys(billThisMonth).forEach(function(k) {
        if (k.toLowerCase() === cnLower) thisMonthActual = billThisMonth[k] || 0;
      });
    }
    var lastContact = lastContactMap[cn] || null;
    var status = 'ok';
    var reason = '';

    if (frequency >= 0.6) {
      if (diffMonths >= 1) {
        if (thisMonthActual > 0) { status = 'ok'; }
        else { status = 'red'; reason = 'ปกติสั่งทุกเดือน ไม่มียอด ' + diffMonths + ' เดือน'; }
      }
    } else {
      if (diffMonths >= 2) {
        if (thisMonthActual > 0) { status = 'ok'; }
        else { status = 'orange'; reason = 'ไม่มียอดมา ' + diffMonths + ' เดือน'; }
      }
    }

    if (status === 'ok' && frequency >= 0.6 && todayDay >= 15 && thisMonthActual === 0 && diffMonths === 0) {
      status = 'orange';
      reason = 'ปกติสั่งทุกเดือน แต่เดือนนี้ยังไม่มียอด (ผ่านวันที่ 15 แล้ว)';
    }

    allCustomers.push({
      custName: cn, shop: info.shop, status: status, reason: reason,
      lastMonth: lastActiveMonth, monthsGone: diffMonths,
      peakAmount: peakAmount, recentAmount: recentAmount,
      thisMonthActual: thisMonthActual, lastContact: lastContact
    });

    if (status !== 'ok') flags.push(allCustomers[allCustomers.length - 1]);
  });

  var order = { red: 0, orange: 1, yellow: 2 };
  flags.sort(function(a, b) {
    var diff = (order[a.status] || 9) - (order[b.status] || 9);
    return diff !== 0 ? diff : b.peakAmount - a.peakAmount;
  });
  allCustomers.sort(function(a, b) {
    var sa = order[a.status] !== undefined ? order[a.status] : 9;
    var sb = order[b.status] !== undefined ? order[b.status] : 9;
    if (sa !== sb) return sa - sb;
    return a.custName.localeCompare(b.custName, 'th');
  });

  var billThisMonthArr = [];
  Object.keys(billThisMonth).forEach(function(cn) {
    billThisMonthArr.push({ custName: cn, amount: billThisMonth[cn] });
  });

  return { flags: flags, allCustomers: allCustomers, billThisMonth: billThisMonthArr, total: flags.length, generatedAt: today.toISOString() };
}

// ===== COMMISSION FUNCTIONS =====

// 1) ดึงบิลทั้งหมดของเดือน (กรอง cancelled ออก)
function getMonthBills(month) {
  var sheet = getSheet('bills');
  if (!sheet) return [];
  var out = [];
  sheetToJson(sheet, null, null).forEach(function(b) {
    if (b.status === 'cancelled') return;
    var ym = toYearMonth(b.date);
    if (ym !== month) return;
    out.push({
      id:    String(b.id || ''),
      no:    String(b.no || ''),
      date:  fmtBillDate(b.date),
      cn:    cleanName(b.cn),
      grand: Number(b.grand) || 0
    });
  });
  return out;
}

// 2) ลูกค้าที่เคยถูกตั้ง 5% มาก่อน "ของเซลล์คนนั้น" (ได้ 5% ตลอดไป)
function getLoyalNewCustomers(salesName) {
  var sheet = getSheet('commissions');
  if (!sheet) return [];
  var want = cleanName(salesName);
  var set = {};
  sheetToJson(sheet, null, null).forEach(function(r) {
    if (String(r.rateType || '') !== 'new') return;
    // ผูกกับเซลล์: ถ้าระบุชื่อเซลล์มา ต้องตรงกันเท่านั้น
    if (want && cleanName(r.salesName) !== want) return;
    set[cleanName(r.custName)] = true;
  });
  return Object.keys(set);
}

// 2b) ดึงค่าคอมที่เคยบันทึกไว้ของเดือนนั้น (เพื่อเติมเรทกลับตอนโหลด) — กรองตามเซลล์ถ้าระบุ
function getSavedCommissions(month, salesName) {
  var sheet = getSheet('commissions');
  if (!sheet) return [];
  var want = cleanName(salesName);
  var out = [];
  sheetToJson(sheet, null, null).forEach(function(r) {
    if (String(r.month || '') !== String(month)) return;
    if (want && cleanName(r.salesName) !== want) return;
    out.push({ billId: String(r.billId || ''), rateType: String(r.rateType || ''), salesName: String(r.salesName || '') });
  });
  return out;
}

// 3) บันทึกค่าคอมของเดือน (ลบของเดือน+เซลล์เดิมก่อน = บันทึกซ้ำได้ ไม่ทับเซลล์อื่น)
function saveCommissions(payload) {
  var sheet = getSheet('commissions');
  var HEAD = ['month','billId','billNo','custName','amount','rate','commission','rateType','salesName','ts'];
  if (!sheet) {
    sheet = SS.insertSheet('commissions');
    sheet.appendRow(HEAD);
  }
  var month = String(payload.month || '');
  var sales = cleanName(payload.salesName);
  var data = sheet.getDataRange().getValues();
  // คอลัมน์: 0=month ... 8=salesName
  for (var r = data.length - 1; r >= 1; r--) {
    if (String(data[r][0] || '') !== month) continue;
    if (cleanName(data[r][8]) !== sales) continue;  // ลบเฉพาะเซลล์คนนี้
    sheet.deleteRow(r + 1);
  }
  var ts = new Date();
  var rows = (payload.rows || []).map(function(x) {
    return [x.month, x.billId, x.billNo, x.custName, x.amount, x.rate, x.commission, x.rateType, x.salesName || '', ts];
  });
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEAD.length).setValues(rows);
  }
  return { success: true, saved: rows.length };
}

// helper: format วันที่บิล d/M/yy (พ.ศ.)
function fmtBillDate(val) {
  if (val instanceof Date) {
    return val.getDate() + '/' + (val.getMonth() + 1) + '/' + String((val.getFullYear() + 543)).slice(-2);
  }
  return String(val || '');
}
