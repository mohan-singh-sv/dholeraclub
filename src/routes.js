const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('./db');
const { sign, memberAuth, adminAuth } = require('./auth');

const router = express.Router();
const NOT_REGISTERED = 'The entered credentials do not match any registered members. Please note that only registered members can log in.';

const FIELDS = {
  banners: ['title', 'subtitle', 'image_url', 'link', 'sort_order', 'active'],
  clubs: ['name', 'city', 'address', 'phone', 'email', 'description', 'image_url', 'sort_order', 'active'],
  notices: ['title', 'body', 'notice_date', 'pinned', 'active'],
  facilities: ['name', 'description', 'icon', 'image_url', 'bookable', 'sort_order', 'active'],
  events: ['title', 'description', 'venue', 'start_at', 'end_at', 'image_url', 'fee', 'active'],
  event_bookings: ['member_id', 'event_id', 'status'],
  gallery: ['title', 'album', 'image_url', 'sort_order'],
  packages: ['name', 'description', 'member_price', 'non_member_price', 'valid_from', 'valid_to', 'active'],
  enquiries: ['member_id', 'package_id', 'message', 'status'],
  directory: ['department', 'contact_name', 'email', 'phone', 'icon', 'sort_order', 'active'],
  transactions: ['member_id', 'amount', 'direction', 'remark', 'txn_date'],
  tickets: ['member_id', 'event_id', 'title', 'venue', 'show_time', 'qty', 'status', 'code'],
  room_bookings: ['member_id', 'facility_id', 'date', 'from_time', 'to_time', 'purpose', 'status'],
  notifications: ['member_id', 'title', 'body'],
  masters: ['type', 'name', 'sort_order', 'active'],
};

const MEMBER_FIELDS = [
  'full_name', 'father_name', 'dob', 'mobile', 'email', 'pan', 'aadhaar', 'category', 'club_id', 'status',
  'address', 'city', 'state', 'pin', 'correspondence_address', 'firm', 'designation', 'office_address',
  'nature_of_business', 'rera_no', 'gst_no', 'years_experience', 'area_of_operation', 'balance',
];

const BOOLS = new Set(['active', 'pinned', 'bookable']);
const NUMS = new Set([
  'sort_order', 'fee', 'member_price', 'non_member_price', 'qty', 'member_id', 'club_id', 'facility_id',
  'event_id', 'package_id', 'years_experience', 'balance', 'amount',
]);

function normMobile(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function on(row) {
  return row.active !== false;
}

function clean(fields, body) {
  const out = {};
  fields.forEach((key) => {
    if (body[key] === undefined) return;
    let value = body[key];
    if (BOOLS.has(key)) {
      value = value === true || value === 1 || value === '1' || value === 'true';
    } else if (NUMS.has(key)) {
      if (value === '' || value === null) value = null;
      else value = Number(value);
      if (value !== null && Number.isNaN(value)) value = null;
    } else if (typeof value === 'string') {
      value = value.trim();
    }
    out[key] = value;
  });
  return out;
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function clubName(id) {
  const club = await db.find('clubs', id);
  return club ? club.name : '';
}

async function memberName(id) {
  const member = await db.find('members', id);
  return member ? member.full_name : '';
}

async function presentMember(member, { includePrivate = false } = {}) {
  if (!member) return null;
  const { password_hash, aadhaar, ...rest } = member;
  return {
    ...rest,
    club_name: await clubName(member.club_id),
    aadhaar: includePrivate ? aadhaar || '' : undefined,
    aadhaar_masked: aadhaar ? 'XXXX-XXXX-' + String(aadhaar).replace(/\D/g, '').slice(-4) : '',
  };
}

async function present(resource, row) {
  if (resource === 'members') return presentMember(row, { includePrivate: true });
  if (resource === 'transactions' || resource === 'tickets' || resource === 'event_bookings' || resource === 'enquiries' || resource === 'notifications' || resource === 'room_bookings') {
    const extra = { member_name: await memberName(row.member_id) };
    if (row.facility_id) extra.facility_name = ((await db.find('facilities', row.facility_id)) || {}).name || '';
    if (row.event_id) extra.event_title = ((await db.find('events', row.event_id)) || {}).title || '';
    if (row.package_id) extra.package_name = ((await db.find('packages', row.package_id)) || {}).name || '';
    return { ...row, ...extra };
  }
  return row;
}

async function unreadCount(memberId) {
  const rows = await db.all('notifications');
  return rows.filter((item) => {
    const mine = item.member_id == null || Number(item.member_id) === Number(memberId);
    return mine && !(item.read_ids || []).includes(Number(memberId));
  }).length;
}

async function clash(mobile, email, exceptId) {
  const mobileKey = normMobile(mobile);
  const emailKey = String(email || '').trim().toLowerCase();
  const members = await db.all('members');
  return members.find((member) => {
    if (Number(member.id) === Number(exceptId)) return false;
    return (mobileKey && normMobile(member.mobile) === mobileKey) || (emailKey && member.email.toLowerCase() === emailKey);
  });
}

async function findMemberByIdentifier(identifier) {
  const raw = String(identifier || '').trim().toLowerCase();
  const mobileKey = normMobile(raw);
  const members = await db.all('members');
  return members.find((member) => member.email.toLowerCase() === raw || (mobileKey && normMobile(member.mobile) === mobileKey)) || null;
}

function memberToken(member) {
  return sign({ typ: 'member', id: member.id, name: member.full_name }, '30d');
}

function gateMember(member, res) {
  if (!member) {
    res.status(401).json({ ok: false, code: 'NOT_REGISTERED', message: NOT_REGISTERED });
    return false;
  }
  if (member.status === 'pending') {
    res.status(403).json({
      ok: false,
      code: 'PENDING',
      message: 'Your membership application is awaiting approval by Dholera Dealers Association of India.',
    });
    return false;
  }
  if (member.status !== 'active') {
    res.status(403).json({ ok: false, code: 'INACTIVE', message: 'This membership is not active. Please contact the association.' });
    return false;
  }
  return true;
}

async function nextMemberCode() {
  const members = await db.all('members');
  const numbers = members.map((member) => Number(String(member.member_code || '').replace(/\D/g, '')) || 1000);
  return 'DDA-' + (Math.max(1000, ...numbers, 1000) + 1);
}

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname || '').toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/) || ['.jpg'])[0];
      cb(null, Date.now() + '-' + Math.random().toString(16).slice(2) + ext);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error('Upload a JPG, PNG, WEBP, or GIF image.'), { status: 400 }));
  },
});

router.get('/health', asyncRoute(async (req, res) => {
  await db.ping();
  res.json({ ok: true, database: 'mongodb', name: 'Dholera', fullName: 'Dholera Dealers Association of India' });
}));

router.get('/config', asyncRoute(async (req, res) => {
  const masters = (await db.all('masters')).filter(on);
  const byType = (type) => masters.filter((item) => item.type === type).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const clubs = (await db.all('clubs')).filter(on).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  res.json({
    ok: true,
    appName: 'Dholera',
    fullName: 'Dholera Dealers Association of India',
    tagline: 'Promoting Professionalism • Integrity • Cooperation • Responsible Real Estate Practice',
    logo: '/logo.jpeg',
    colors: { navy: '#0C2C6E', background: '#071426', ink: '#F4F7FB' },
    categories: byType('membership_category'),
    natures: byType('business_nature'),
    clubs: clubs.map((club) => ({ id: club.id, name: club.name, city: club.city })),
  });
}));

router.post('/auth/login', asyncRoute(async (req, res) => {
  const member = await findMemberByIdentifier(req.body.identifier);
  if (!gateMember(member, res)) return;
  if (!bcrypt.compareSync(String(req.body.password || ''), member.password_hash)) {
    return res.status(401).json({ ok: false, code: 'INVALID_PASSWORD', message: 'Incorrect password.' });
  }
  res.json({ ok: true, token: memberToken(member), member: await presentMember(member), unread: await unreadCount(member.id) });
}));

router.post('/auth/otp/request', asyncRoute(async (req, res) => {
  const member = await findMemberByIdentifier(req.body.mobile);
  if (!gateMember(member, res)) return;
  const mobile = normMobile(member.mobile);
  const existing = (await db.all('otps')).filter((otp) => otp.mobile === mobile);
  for (const otp of existing) await db.remove('otps', otp.id);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await db.insert('otps', { mobile, code, expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
  const payload = { ok: true, message: 'OTP generated for the registered mobile number.' };
  if (process.env.DEMO_OTP !== 'false') payload.demoOtp = code;
  res.json(payload);
}));

router.post('/auth/otp/verify', asyncRoute(async (req, res) => {
  const member = await findMemberByIdentifier(req.body.mobile);
  if (!gateMember(member, res)) return;
  const mobile = normMobile(member.mobile);
  const code = String(req.body.otp || '').trim();
  const otp = (await db.all('otps')).reverse().find((item) => item.mobile === mobile && item.code === code);
  if (!otp) return res.status(401).json({ ok: false, code: 'OTP', message: 'Incorrect OTP.' });
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    await db.remove('otps', otp.id);
    return res.status(401).json({ ok: false, code: 'OTP', message: 'This OTP has expired. Request a new one.' });
  }
  await db.remove('otps', otp.id);
  res.json({ ok: true, token: memberToken(member), member: await presentMember(member), unread: await unreadCount(member.id) });
}));

router.post('/auth/register', asyncRoute(async (req, res) => {
  const body = req.body || {};
  const fullName = String(body.full_name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const mobile = normMobile(body.mobile);
  const password = String(body.password || '');
  if (!fullName || mobile.length < 10 || !email.includes('@') || password.length < 6) {
    return res.status(400).json({ ok: false, message: 'Enter your full name, a 10-digit mobile, a valid email, and a password of at least 6 characters.' });
  }
  if (await clash(mobile, email)) {
    return res.status(409).json({ ok: false, message: 'A member with this mobile or email already exists.' });
  }
  const row = clean(MEMBER_FIELDS, { ...body, mobile, email, status: 'pending', balance: 0 });
  row.full_name = fullName;
  row.status = 'pending';
  row.balance = 0;
  row.member_code = await nextMemberCode();
  row.password_hash = bcrypt.hashSync(password, 10);
  const created = await db.insert('members', row);
  res.json({
    ok: true,
    message: 'Your membership application has been submitted. You can sign in after the association approves it.',
    member: await presentMember(created),
  });
}));

router.get('/auth/me', memberAuth, asyncRoute(async (req, res) => {
  res.json({ ok: true, member: await presentMember(req.member), unread: await unreadCount(req.member.id) });
}));

router.get('/home', memberAuth, asyncRoute(async (req, res) => {
  const banners = (await db.all('banners')).filter(on).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  res.json({
    ok: true,
    member: await presentMember(req.member),
    banners,
    balance: Number(req.member.balance) || 0,
    unread: await unreadCount(req.member.id),
  });
}));

router.get('/notices', memberAuth, asyncRoute(async (req, res) => {
  const rows = (await db.all('notices')).filter(on).sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true) || String(b.notice_date).localeCompare(String(a.notice_date)));
  res.json({ ok: true, data: rows });
}));

router.get('/facilities', memberAuth, asyncRoute(async (req, res) => {
  const rows = (await db.all('facilities')).filter(on).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  res.json({ ok: true, data: rows });
}));

router.get('/clubs', memberAuth, asyncRoute(async (req, res) => {
  const rows = (await db.all('clubs')).filter(on).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  res.json({ ok: true, data: rows });
}));

router.get('/members/circle', memberAuth, asyncRoute(async (req, res) => {
  const members = (await db.all('members')).filter((member) => member.status === 'active');
  const rows = [];
  for (const member of members) {
    rows.push({
      id: member.id,
      full_name: member.full_name,
      firm: member.firm,
      designation: member.designation,
      city: member.city,
      state: member.state,
      category: member.category,
      area_of_operation: member.area_of_operation,
      club_name: await clubName(member.club_id),
    });
  }
  res.json({ ok: true, data: rows });
}));

function eventTiming(event) {
  return new Date(event.end_at || event.start_at).getTime() < Date.now() ? 'past' : 'upcoming';
}

router.get('/events', memberAuth, asyncRoute(async (req, res) => {
  const bookings = (await db.all('event_bookings')).filter((item) => item.member_id === req.member.id && item.status !== 'cancelled');
  const bookedIds = new Set(bookings.map((item) => item.event_id));
  let rows = (await db.all('events')).filter(on).map((event) => ({ ...event, booked: bookedIds.has(event.id), timing: eventTiming(event) }));
  const tab = req.query.tab || 'upcoming';
  if (tab === 'booked') rows = rows.filter((event) => event.booked && event.timing !== 'past');
  else if (tab === 'past') rows = rows.filter((event) => event.timing === 'past');
  else rows = rows.filter((event) => event.timing === 'upcoming');
  rows.sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)));
  res.json({ ok: true, data: rows });
}));

router.post('/events/:id/book', memberAuth, asyncRoute(async (req, res) => {
  const event = await db.find('events', req.params.id);
  if (!event || !on(event)) return res.status(404).json({ ok: false, message: 'Event not found.' });
  if (eventTiming(event) === 'past') return res.status(400).json({ ok: false, message: 'This event has already ended.' });
  const existing = (await db.all('event_bookings')).find((item) => item.member_id === req.member.id && item.event_id === event.id && item.status !== 'cancelled');
  if (existing) return res.status(409).json({ ok: false, message: 'You have already booked this event.' });
  const booking = await db.insert('event_bookings', { member_id: req.member.id, event_id: event.id, status: 'booked' });
  const ticket = await db.insert('tickets', {
    member_id: req.member.id,
    event_id: event.id,
    title: event.title,
    venue: event.venue,
    show_time: event.start_at,
    qty: 1,
    status: 'valid',
    code: 'DDA' + String(100000 + booking.id),
  });
  await db.insert('notifications', {
    member_id: req.member.id,
    title: 'Event booked',
    body: event.title + ' is confirmed. Your pass is in My Tickets.',
    read_ids: [],
  });
  res.json({ ok: true, booking, ticket });
}));

router.get('/gallery', memberAuth, asyncRoute(async (req, res) => {
  const rows = (await db.all('gallery')).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  res.json({ ok: true, data: rows });
}));

router.get('/packages', memberAuth, asyncRoute(async (req, res) => {
  res.json({ ok: true, data: (await db.all('packages')).filter(on) });
}));

router.post('/packages/:id/enquire', memberAuth, asyncRoute(async (req, res) => {
  const item = await db.find('packages', req.params.id);
  if (!item || !on(item)) return res.status(404).json({ ok: false, message: 'Package not found.' });
  const enquiry = await db.insert('enquiries', {
    member_id: req.member.id,
    package_id: item.id,
    message: String(req.body.message || '').trim(),
    status: 'open',
  });
  await db.insert('notifications', {
    member_id: req.member.id,
    title: 'Package request received',
    body: 'We received your request for ' + item.name + '.',
    read_ids: [],
  });
  res.json({ ok: true, data: enquiry });
}));

router.get('/directory', memberAuth, asyncRoute(async (req, res) => {
  const rows = (await db.all('directory')).filter(on).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  res.json({ ok: true, data: rows });
}));

router.get('/transactions', memberAuth, asyncRoute(async (req, res) => {
  const rows = (await db.all('transactions')).filter((item) => item.member_id === req.member.id).sort((a, b) => String(b.txn_date).localeCompare(String(a.txn_date)) || b.id - a.id);
  res.json({ ok: true, balance: Number(req.member.balance) || 0, data: rows });
}));

router.post('/payments', memberAuth, asyncRoute(async (req, res) => {
  const amount = Math.abs(Number(req.body.amount) || 0);
  if (!amount) return res.status(400).json({ ok: false, message: 'Enter an amount to pay.' });
  const balance = Number(req.member.balance || 0) - amount;
  const member = await db.update('members', req.member.id, { balance });
  const transaction = await db.insert('transactions', {
    member_id: member.id,
    amount,
    direction: 'credit',
    remark: 'Payment Receipt - ' + member.full_name.toUpperCase(),
    ref_id: String(Math.floor(100000 + Math.random() * 900000)),
    balance_after: balance,
    txn_date: new Date().toISOString().slice(0, 10),
  });
  res.json({ ok: true, balance, transaction, member: await presentMember(member) });
}));

router.get('/tickets', memberAuth, asyncRoute(async (req, res) => {
  const rows = (await db.all('tickets')).filter((item) => item.member_id === req.member.id).sort((a, b) => b.id - a.id);
  res.json({ ok: true, data: rows });
}));

router.get('/room-bookings', memberAuth, asyncRoute(async (req, res) => {
  const mine = (await db.all('room_bookings')).filter((item) => item.member_id === req.member.id);
  const rows = [];
  for (const item of mine) rows.push(await present('room_bookings', item));
  rows.sort((a, b) => b.id - a.id);
  res.json({ ok: true, data: rows });
}));

router.post('/room-bookings', memberAuth, asyncRoute(async (req, res) => {
  const facility = await db.find('facilities', req.body.facility_id);
  if (!facility || !facility.bookable || !on(facility)) {
    return res.status(400).json({ ok: false, message: 'Choose a bookable room.' });
  }
  if (!req.body.date || !req.body.from_time || !req.body.to_time) {
    return res.status(400).json({ ok: false, message: 'Date, start time, and end time are required.' });
  }
  const booking = await db.insert('room_bookings', {
    member_id: req.member.id,
    facility_id: facility.id,
    date: String(req.body.date),
    from_time: String(req.body.from_time),
    to_time: String(req.body.to_time),
    purpose: String(req.body.purpose || '').trim(),
    status: 'pending',
  });
  await db.insert('notifications', {
    member_id: req.member.id,
    title: 'Room request submitted',
    body: facility.name + ' on ' + booking.date + ' is waiting for confirmation.',
    read_ids: [],
  });
  res.json({ ok: true, data: await present('room_bookings', booking) });
}));

router.get('/notifications', memberAuth, asyncRoute(async (req, res) => {
  const rows = (await db.all('notifications')).filter((item) => item.member_id == null || Number(item.member_id) === req.member.id).map((item) => ({
    ...item,
    read: (item.read_ids || []).includes(req.member.id),
  })).sort((a, b) => b.id - a.id);
  res.json({ ok: true, data: rows, unread: rows.filter((item) => !item.read).length });
}));

router.post('/notifications/:id/read', memberAuth, asyncRoute(async (req, res) => {
  const item = await db.find('notifications', req.params.id);
  if (!item) return res.status(404).json({ ok: false, message: 'Notification not found.' });
  const readIds = Array.from(new Set([...(item.read_ids || []), req.member.id]));
  await db.update('notifications', item.id, { read_ids: readIds });
  res.json({ ok: true, unread: await unreadCount(req.member.id) });
}));

router.post('/admin/login', asyncRoute(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const admin = (await db.all('admins')).find((item) => item.email.toLowerCase() === email);
  if (!admin || admin.role !== 'superadmin' || !bcrypt.compareSync(String(req.body.password || ''), admin.password_hash)) {
    return res.status(401).json({ ok: false, message: 'Invalid superadmin credentials.' });
  }
  const token = sign({ typ: 'admin', id: admin.id, role: 'superadmin' }, '12h');
  res.json({ ok: true, token, admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
}));

router.get('/admin/me', adminAuth, (req, res) => {
  res.json({ ok: true, admin: { id: req.admin.id, name: req.admin.name, email: req.admin.email, role: req.admin.role } });
});

router.get('/admin/meta', adminAuth, (req, res) => {
  res.json({
    ok: true,
    masterTypes: [
      { id: 'membership_category', label: 'Membership category' },
      { id: 'business_nature', label: 'Nature of business' },
    ],
  });
});

router.get('/admin/dashboard', adminAuth, asyncRoute(async (req, res) => {
  const members = await db.all('members');
  const transactions = (await db.all('transactions')).sort((a, b) => b.id - a.id).slice(0, 6);
  const recentTransactions = [];
  for (const row of transactions) recentTransactions.push(await present('transactions', row));
  const recentMembers = [];
  for (const member of members.slice().sort((a, b) => b.id - a.id).slice(0, 5)) {
    recentMembers.push(await presentMember(member, { includePrivate: true }));
  }
  res.json({
    ok: true,
    stats: {
      members: members.length,
      active: members.filter((member) => member.status === 'active').length,
      pending: members.filter((member) => member.status === 'pending').length,
      clubs: (await db.all('clubs')).length,
      events: (await db.all('events')).length,
      enquiries: (await db.all('enquiries')).filter((item) => item.status === 'open').length,
      roomPending: (await db.all('room_bookings')).filter((item) => item.status === 'pending').length,
      banners: (await db.all('banners')).filter(on).length,
    },
    recentMembers,
    recentTransactions,
  });
}));

router.post('/admin/upload', adminAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, message: 'Choose an image.' });
  res.json({ ok: true, url: '/uploads/' + req.file.filename });
});

async function applyLedger(body) {
  const member = await db.find('members', body.member_id);
  if (!member) return { error: 'Choose a member.' };
  const amount = Math.abs(Number(body.amount) || 0);
  if (!amount) return { error: 'Enter an amount.' };
  const direction = body.direction === 'credit' ? 'credit' : 'debit';
  const balance = direction === 'debit' ? Number(member.balance || 0) + amount : Number(member.balance || 0) - amount;
  await db.update('members', member.id, { balance });
  return {
    row: {
      member_id: member.id,
      amount,
      direction,
      remark: body.remark || (direction === 'credit' ? 'Payment Receipt' : 'Charge'),
      ref_id: String(Math.floor(100000 + Math.random() * 900000)),
      balance_after: balance,
      txn_date: body.txn_date || new Date().toISOString().slice(0, 10),
    },
  };
}

router.get('/admin/:resource', adminAuth, asyncRoute(async (req, res) => {
  const resource = req.params.resource;
  if (!FIELDS[resource] && resource !== 'members') return res.status(404).json({ ok: false, message: 'Unknown section.' });
  let rows = await db.all(resource === 'members' ? 'members' : resource);
  if (req.query.type) rows = rows.filter((row) => row.type === req.query.type);
  if (req.query.q) {
    const q = String(req.query.q).toLowerCase();
    rows = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(q));
  }
  const presented = [];
  for (const row of rows) presented.push(await present(resource, row));
  presented.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || b.id - a.id);
  res.json({ ok: true, data: presented });
}));

router.post('/admin/:resource', adminAuth, asyncRoute(async (req, res) => {
  const resource = req.params.resource;
  const body = req.body || {};
  if (resource === 'members') {
    const fullName = String(body.full_name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const mobile = normMobile(body.mobile);
    if (!fullName || mobile.length < 10 || !email.includes('@')) {
      return res.status(400).json({ ok: false, message: 'Name, mobile, and email are required.' });
    }
    if (await clash(mobile, email)) return res.status(409).json({ ok: false, message: 'Mobile or email is already used.' });
    const row = clean(MEMBER_FIELDS, { ...body, mobile, email, full_name: fullName });
    row.member_code = await nextMemberCode();
    row.status = row.status || 'pending';
    row.balance = Number(row.balance || 0);
    row.password_hash = bcrypt.hashSync(String(body.password || 'Member@123'), 10);
    return res.json({ ok: true, data: await presentMember(await db.insert('members', row), { includePrivate: true }) });
  }
  if (resource === 'transactions') {
    const ledger = await applyLedger(body);
    if (ledger.error) return res.status(400).json({ ok: false, message: ledger.error });
    return res.json({ ok: true, data: await present('transactions', await db.insert('transactions', ledger.row)) });
  }
  if (!FIELDS[resource]) return res.status(404).json({ ok: false, message: 'Unknown section.' });
  const row = clean(FIELDS[resource], body);
  if (resource === 'tickets' && !row.code) row.code = 'DDA' + Math.floor(100000 + Math.random() * 900000);
  if (resource === 'notifications') row.read_ids = [];
  if (resource === 'banners' && !row.title) return res.status(400).json({ ok: false, message: 'Title is required.' });
  if (resource === 'masters' && (!row.type || !row.name)) return res.status(400).json({ ok: false, message: 'Type and name are required.' });
  res.json({ ok: true, data: await present(resource, await db.insert(resource, row)) });
}));

router.put('/admin/:resource/:id', adminAuth, asyncRoute(async (req, res) => {
  const { resource, id } = req.params;
  const body = req.body || {};
  if (resource === 'members') {
    const current = await db.find('members', id);
    if (!current) return res.status(404).json({ ok: false, message: 'Member not found.' });
    const row = clean(MEMBER_FIELDS, body);
    if (row.mobile) row.mobile = normMobile(row.mobile);
    if (row.email) row.email = String(row.email).toLowerCase();
    if (await clash(row.mobile || current.mobile, row.email || current.email, current.id)) {
      return res.status(409).json({ ok: false, message: 'Mobile or email is already used.' });
    }
    if (body.password) row.password_hash = bcrypt.hashSync(String(body.password), 10);
    return res.json({ ok: true, data: await presentMember(await db.update('members', id, row), { includePrivate: true }) });
  }
  if (resource === 'transactions') {
    const current = await db.find('transactions', id);
    if (!current) return res.status(404).json({ ok: false, message: 'Transaction not found.' });
    const updated = await db.update('transactions', id, { remark: String(body.remark || current.remark) });
    return res.json({ ok: true, data: await present('transactions', updated) });
  }
  if (!FIELDS[resource]) return res.status(404).json({ ok: false, message: 'Unknown section.' });
  if (!(await db.find(resource, id))) return res.status(404).json({ ok: false, message: 'Record not found.' });
  const row = clean(FIELDS[resource], body);
  res.json({ ok: true, data: await present(resource, await db.update(resource, id, row)) });
}));

router.delete('/admin/:resource/:id', adminAuth, asyncRoute(async (req, res) => {
  const { resource, id } = req.params;
  if (resource === 'members') {
    const member = await db.find('members', id);
    if (!member) return res.status(404).json({ ok: false, message: 'Member not found.' });
    await db.update('members', id, { status: 'inactive' });
    return res.json({ ok: true, message: 'Member marked inactive.' });
  }
  if (resource === 'transactions') {
    const txn = await db.find('transactions', id);
    if (!txn) return res.status(404).json({ ok: false, message: 'Transaction not found.' });
    const member = await db.find('members', txn.member_id);
    if (member) {
      const balance = txn.direction === 'debit' ? Number(member.balance) - Number(txn.amount) : Number(member.balance) + Number(txn.amount);
      await db.update('members', member.id, { balance });
    }
    await db.remove('transactions', id);
    return res.json({ ok: true });
  }
  if (!FIELDS[resource]) return res.status(404).json({ ok: false, message: 'Unknown section.' });
  if (!(await db.remove(resource, id))) return res.status(404).json({ ok: false, message: 'Record not found.' });
  res.json({ ok: true });
}));

module.exports = router;
