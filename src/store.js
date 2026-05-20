const records = new Map();
const commentsByRecord = new Map();
const attachmentsByRecord = new Map();

let commentCounter = 0;
let attachmentCounter = 0;
let recordCounter = 0;

function nowIso() {
  return new Date().toISOString();
}

function listRecords({ updatedSince, ids, limit = 10, offset = 0 } = {}) {
  let result = Array.from(records.values());

  if (ids && ids.length > 0) {
    const idSet = new Set(ids);
    result = result.filter((r) => idSet.has(r.id));
  }

  if (updatedSince) {
    const cutoff = new Date(updatedSince).getTime();
    result = result.filter((r) => new Date(r.updatedAt).getTime() > cutoff);
  }

  result.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  const total = result.length;
  const page = result.slice(offset, offset + limit);
  return { items: page, total, limit, offset };
}

function getRecord(id) {
  return records.get(id) || null;
}

function createRecord({ fields }) {
  recordCounter += 1;
  const id = `REQ-${String(100 + recordCounter).padStart(3, "0")}`;
  const record = {
    id,
    displayId: id,
    updatedAt: nowIso(),
    url: `https://partner.example.com/records/${id}`,
    fields: fields || {},
  };
  records.set(id, record);
  commentsByRecord.set(id, []);
  attachmentsByRecord.set(id, []);
  return record;
}

function updateRecord(id, { fields }) {
  const existing = records.get(id);
  if (!existing) return null;
  const updated = {
    ...existing,
    fields: { ...existing.fields, ...(fields || {}) },
    updatedAt: nowIso(),
  };
  records.set(id, updated);
  return updated;
}

function listComments(recordId) {
  const list = commentsByRecord.get(recordId);
  if (!list) return null;
  return list.slice();
}

function addComment(recordId, { message, sender, visibility }) {
  if (!records.has(recordId)) return null;
  commentCounter += 1;
  const comment = {
    id: `CMT-${commentCounter}`,
    message,
    sender,
    visibility: visibility || "public",
    dateSent: nowIso(),
  };
  const list = commentsByRecord.get(recordId);
  list.push(comment);
  bumpUpdatedAt(recordId);
  return comment;
}

function listAttachments(recordId) {
  const list = attachmentsByRecord.get(recordId);
  if (!list) return null;
  return list.slice();
}

function getAttachment(recordId, attachmentId) {
  const list = attachmentsByRecord.get(recordId);
  if (!list) return null;
  return list.find((a) => a.id === attachmentId) || null;
}

function addAttachment(recordId, { name, description, fileType, size, downloadUrl, visibility }) {
  if (!records.has(recordId)) return null;
  attachmentCounter += 1;
  const attachment = {
    id: `ATT-${attachmentCounter}`,
    name,
    description: description || undefined,
    fileType,
    size,
    visibility: visibility || "public",
    dateUploaded: nowIso(),
    downloadUrl,
  };
  const list = attachmentsByRecord.get(recordId);
  list.push(attachment);
  bumpUpdatedAt(recordId);
  return attachment;
}

function bumpUpdatedAt(recordId) {
  const record = records.get(recordId);
  if (record) record.updatedAt = nowIso();
}

function _seed({ record, comments = [], attachments = [] }) {
  records.set(record.id, record);
  commentsByRecord.set(record.id, comments);
  attachmentsByRecord.set(record.id, attachments);
  commentCounter += comments.length;
  attachmentCounter += attachments.length;
  const idNum = parseInt(record.id.replace(/\D/g, ""), 10);
  if (!Number.isNaN(idNum) && idNum - 100 > recordCounter) {
    recordCounter = idNum - 100;
  }
}

module.exports = {
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  listComments,
  addComment,
  listAttachments,
  getAttachment,
  addAttachment,
  _seed,
};
