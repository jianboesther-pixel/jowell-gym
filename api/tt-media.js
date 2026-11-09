/* 小程序侧的图片通道：上传后存成随机文件名，<image> 直接能取（不需要带 token）。
 * 只服务 <DATA_DIR>/tt-media 下的 jpg/png/webp，文件名是 32 位随机串。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIRNAME = 'tt-media';
const MAX_BYTES = 3 * 1024 * 1024;
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export const mediaDir = dataDir => path.join(dataDir, DIRNAME);

/** 把 base64 存成文件，返回文件名。 */
export function saveUpload(dataDir, base64, ext = 'jpg') {
  const clean = String(base64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!clean) return null;
  const buf = Buffer.from(clean, 'base64');
  if (!buf.length || buf.length > MAX_BYTES) return null;
  const dir = mediaDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const name = crypto.randomBytes(16).toString('hex') + '.' + (MIME[ext] ? ext : 'jpg');
  fs.writeFileSync(path.join(dir, name), buf);
  return name;
}

/** 直接存一段二进制（tt.uploadFile 的 multipart 拆出来的那种）。 */
export function saveBuffer(dataDir, buf, ext = 'jpg') {
  if (!buf || !buf.length || buf.length > MAX_BYTES) return null;
  const dir = mediaDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const name = crypto.randomBytes(16).toString('hex') + '.' + (MIME[ext] ? ext : 'jpg');
  fs.writeFileSync(path.join(dir, name), buf);
  return name;
}

/** 从 multipart/form-data 里抠出第一个文件的内容。 */
export function firstFilePart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType || ''));
  const boundary = m && (m[1] || m[2]);
  if (!boundary || !buf || !buf.length) return null;
  const sep = Buffer.from('--' + boundary);
  const start = buf.indexOf(sep);
  if (start < 0) return null;
  const headerEnd = buf.indexOf(Buffer.from('\r\n\r\n'), start);
  if (headerEnd < 0) return null;
  const bodyStart = headerEnd + 4;
  const next = buf.indexOf(sep, bodyStart);
  if (next < 0) return null;
  // 结尾会多一个 CRLF
  return buf.slice(bodyStart, Math.max(bodyStart, next - 2));
}

/** 读文件给 GET 用；只认白名单文件名。 */
export function readMedia(dataDir, file) {
  const name = String(file || '');
  if (!/^[a-z0-9]{6,40}\.(jpg|png|webp)$/.test(name)) return null;
  const p = path.join(mediaDir(dataDir), name);
  if (!p.startsWith(mediaDir(dataDir))) return null;
  if (!fs.existsSync(p)) return null;
  return { buf: fs.readFileSync(p), mime: MIME[name.split('.').pop()] || 'application/octet-stream' };
}

/** 删掉一个文件（删记录时顺手清）。 */
export function removeMedia(dataDir, file) {
  const name = String(file || '');
  if (!/^[a-z0-9]{6,40}\.(jpg|png|webp)$/.test(name)) return false;
  const p = path.join(mediaDir(dataDir), name);
  try { fs.unlinkSync(p); return true; } catch { return false; }
}
