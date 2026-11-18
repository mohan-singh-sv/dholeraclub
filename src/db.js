const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const COLLECTIONS = [
  'admins',
  'members',
  'banners',
  'clubs',
  'notices',
  'facilities',
  'events',
  'event_bookings',
  'gallery',
  'packages',
  'enquiries',
  'directory',
  'transactions',
  'tickets',
  'room_bookings',
  'masters',
  'otps',
  'notifications',
];

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.MONGODB_DB || 'dholera';

let client;
let database;

function collection(name) {
  return database.collection(name);
}

function strip(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
}

async function nextId(name) {
  const counter = await database.collection('counters').findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const doc = counter && counter.value !== undefined ? counter.value : counter;
  return doc.seq;
}

async function all(name) {
  const rows = await collection(name).find({}).toArray();
  return rows.map(strip);
}

async function find(name, id) {
  return strip(await collection(name).findOne({ id: Number(id) }));
}

async function insert(name, row) {
  const rec = { id: await nextId(name), created_at: new Date().toISOString(), ...row };
  await collection(name).insertOne(rec);
  return strip(rec);
}

async function update(name, id, patch) {
  const updated = await collection(name).findOneAndUpdate(
    { id: Number(id) },
    { $set: { ...patch, updated_at: new Date().toISOString() } },
    { returnDocument: 'after' }
  );
  const doc = updated && updated.value !== undefined ? updated.value : updated;
  return strip(doc);
}

async function remove(name, id) {
  const result = await collection(name).deleteOne({ id: Number(id) });
  return result.deletedCount > 0;
}

async function seed() {
  const dholera = await insert('clubs', {
    name: 'Dholera City Chapter',
    city: 'Dholera',
    address: 'Association Office, Dholera SIR, Gujarat',
    phone: '+91 9876500101',
    email: 'dholera.chapter@example.com',
    description: 'Primary chapter for dealers operating inside Dholera SIR.',
    image_url: '',
    sort_order: 1,
    active: true,
  });
  await insert('clubs', {
    name: 'Ahmedabad Chapter',
    city: 'Ahmedabad',
    address: 'Business Plaza, SG Highway, Ahmedabad',
    phone: '+91 9876500102',
    email: 'ahmedabad.chapter@example.com',
    description: 'City chapter for members based in Ahmedabad.',
    image_url: '',
    sort_order: 2,
    active: true,
  });
  await insert('clubs', {
    name: 'Gandhinagar Chapter',
    city: 'Gandhinagar',
    address: 'Sector 11, Gandhinagar, Gujarat',
    phone: '+91 9876500103',
    email: 'gandhinagar.chapter@example.com',
    description: 'Chapter for members working across Gandhinagar and Gift City.',
    image_url: '',
    sort_order: 3,
    active: true,
  });

  await insert('admins', {
    name: 'Super Admin',
    email: 'admin@ddaoi.org',
    password_hash: bcrypt.hashSync('Admin@123', 10),
    role: 'superadmin',
  });

  await insert('masters', { type: 'membership_category', name: 'Executive Member', sort_order: 1, active: true });
  await insert('masters', { type: 'membership_category', name: 'Associate Member', sort_order: 2, active: true });
  await insert('masters', { type: 'membership_category', name: 'Patron Member', sort_order: 3, active: true });
  for (const [index, name] of ['Realtor', 'Real Estate Broker', 'Consultant', 'Developer', 'Investor'].entries()) {
    await insert('masters', { type: 'business_nature', name, sort_order: index + 1, active: true });
  }

  const member = await insert('members', {
    member_code: 'DDA-1001',
    full_name: 'Arjun Mehta',
    father_name: 'Kishore Mehta',
    dob: '1988-04-12',
    mobile: '9876543210',
    email: 'arjun.mehta@example.com',
    pan: 'ABCDE1234F',
    aadhaar: '999988887777',
    password_hash: bcrypt.hashSync('Member@123', 10),
    category: 'Executive Member',
    club_id: dholera.id,
    status: 'active',
    address: '21, Riverfront Business Bay',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pin: '380015',
    correspondence_address: '',
    firm: 'Mehta Realty',
    designation: 'Director',
    office_address: '21, Riverfront Business Bay, Ahmedabad',
    nature_of_business: 'Developer',
    rera_no: 'GJ/RERA/2024/0001',
    gst_no: '24ABCDE1234F1Z5',
    years_experience: 11,
    area_of_operation: 'Dholera',
    balance: 0,
  });
  await insert('members', {
    member_code: 'DDA-1002',
    full_name: 'Priya Shah',
    father_name: 'Nilesh Shah',
    dob: '1992-09-03',
    mobile: '9876543211',
    email: 'priya.shah@example.com',
    pan: 'NOPQR1234S',
    aadhaar: '999977776666',
    password_hash: bcrypt.hashSync('Member@123', 10),
    category: 'Associate Member',
    club_id: dholera.id,
    status: 'pending',
    address: '14, Science City Road',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pin: '380060',
    correspondence_address: '',
    firm: 'Shah Consultants',
    designation: 'Consultant',
    office_address: '14, Science City Road, Ahmedabad',
    nature_of_business: 'Consultant',
    rera_no: '',
    gst_no: '',
    years_experience: 6,
    area_of_operation: 'Dholera',
    balance: 0,
  });

  const banners = [
    ['Dholera Membership Drive', 'Executive and associate applications are open for 2026-27.', 1],
    ['Annual General Meeting', '5 December 2026 · Conference Hall · 10:00 AM', 2],
    ['SIR Site Visit', 'Walk the activation zone with the projects committee.', 3],
  ];
  for (const [title, subtitle, sort_order] of banners) {
    await insert('banners', { title, subtitle, image_url: '', link: '', sort_order, active: true });
  }

  await insert('notices', {
    title: 'Membership renewal window',
    body: 'Executive and associate dues for 2026-27 can be paid from the Transactions screen. Receipts appear in transaction history the same day.',
    notice_date: '2026-11-01',
    pinned: true,
    active: true,
  });
  await insert('notices', {
    title: 'Document checklist for new applicants',
    body: 'Keep PAN, a government photo ID, firm details, and RERA or GST numbers ready. The office verifies every application before membership is granted.',
    notice_date: '2026-10-20',
    pinned: false,
    active: true,
  });
  await insert('notices', {
    title: 'Office hours during the AGM week',
    body: 'The association office will close at 4:00 PM from 3 December to 5 December 2026.',
    notice_date: '2026-10-12',
    pinned: false,
    active: true,
  });

  const facilities = [
    ['Meeting Rooms', 'Two private rooms for member meetings. Book a slot from Room Booking.', 'people-outline', true, 1],
    ['Conference Hall', 'Hall for briefings, AGM sessions, and dealer roundtables.', 'easel-outline', true, 2],
    ['Business Lounge', 'Work tables and a quiet lounge for visiting members.', 'cafe-outline', false, 3],
    ['Site Visit Desk', 'Coordinate plot and project visits inside Dholera SIR.', 'map-outline', false, 4],
    ['Documentation Cell', 'Help with membership papers, RERA references, and receipts.', 'document-text-outline', false, 5],
  ];
  for (const [name, description, icon, bookable, sort_order] of facilities) {
    await insert('facilities', { name, description, icon, image_url: '', bookable, sort_order, active: true });
  }

  const agm = await insert('events', {
    title: 'Annual General Meeting',
    description: 'Membership review, accounts, and the 2027 work plan.',
    venue: 'Conference Hall, Dholera City Chapter',
    start_at: '2026-12-05T10:00:00',
    end_at: '2026-12-05T13:00:00',
    image_url: '',
    fee: 0,
    active: true,
  });
  await insert('events', {
    title: 'Activation Zone Site Visit',
    description: 'Guided visit for executive members. Carry a photo ID.',
    venue: 'Dholera SIR Activation Zone',
    start_at: '2026-11-28T08:30:00',
    end_at: '2026-11-28T13:00:00',
    image_url: '',
    fee: 500,
    active: true,
  });
  await insert('events', {
    title: 'Dealer Roundtable',
    description: 'Closed-door discussion on plotted development.',
    venue: 'Ahmedabad Chapter',
    start_at: '2026-10-02T16:00:00',
    end_at: '2026-10-02T18:00:00',
    image_url: '',
    fee: 0,
    active: true,
  });

  await insert('event_bookings', { member_id: member.id, event_id: agm.id, status: 'booked' });
  await insert('tickets', {
    member_id: member.id,
    event_id: agm.id,
    title: 'Annual General Meeting',
    venue: 'Conference Hall, Dholera City Chapter',
    show_time: '2026-12-05T10:00:00',
    qty: 1,
    status: 'valid',
    code: 'DDA160492',
  });

  const photos = [
    ['Chapter office', 'Office', 1],
    ['Dealer roundtable', 'Events', 2],
    ['SIR approach road', 'Sites', 3],
    ['Members meetup', 'Events', 4],
  ];
  for (const [title, album, sort_order] of photos) {
    await insert('gallery', { title, album, image_url: '', sort_order });
  }

  await insert('packages', {
    name: 'Executive Renewal',
    description: 'One-year executive membership, notice board access, and AGM entry.',
    member_price: 15000,
    non_member_price: 0,
    valid_from: '2026-04-01',
    valid_to: '2027-03-31',
    active: true,
  });
  await insert('packages', {
    name: 'Site Visit Pack',
    description: 'Two guided SIR visits and a printed brief for your team.',
    member_price: 2500,
    non_member_price: 4000,
    valid_from: '2026-11-01',
    valid_to: '2027-01-31',
    active: true,
  });
  await insert('packages', {
    name: 'Conference Day Pass',
    description: 'Day pass for a guest at a chapter briefing.',
    member_price: 999,
    non_member_price: 1499,
    valid_from: '2026-11-01',
    valid_to: '2026-12-31',
    active: true,
  });

  const directory = [
    ['Membership', 'Membership Desk', 'membership@example.com', '+91 9876500101', 'card', 1],
    ['Relationship Manager', 'Member Relations', 'relations@example.com', '+91 9876500104', 'handshake', 2],
    ['Accounts', 'Accounts Desk', 'accounts@example.com', '+91 9876500105', 'wallet', 3],
    ['Meetings & Events', 'Events Desk', 'events@example.com', '+91 9876500106', 'calendar', 4],
    ['Office', 'Front Office', '', '+91 9876500107', 'business', 5],
  ];
  for (const [department, contact_name, email, phone, icon, sort_order] of directory) {
    await insert('directory', { department, contact_name, email, phone, icon, sort_order, active: true });
  }

  const ledger = [
    ['2026-09-18', 'debit', 1200, 'Workshop Charges', '160201'],
    ['2026-10-01', 'debit', 2500, 'Membership Fee', '160318'],
    ['2026-10-12', 'debit', 496, 'Annual Subscription', '160404'],
    ['2026-10-29', 'credit', 4196, 'Payment Receipt - ARJUN MEHTA', '160492'],
  ];
  let running = 0;
  for (const [txn_date, direction, amount, remark, ref_id] of ledger) {
    running = direction === 'debit' ? running + amount : running - amount;
    await insert('transactions', {
      member_id: member.id,
      amount,
      direction,
      remark,
      ref_id,
      balance_after: running,
      txn_date,
    });
  }

  await insert('notifications', {
    member_id: member.id,
    title: 'Welcome to Dholera',
    body: 'Your executive membership is active. Dues are visible under Transactions.',
    read_ids: [],
  });
  await insert('notifications', {
    member_id: null,
    title: 'AGM registration is open',
    body: 'Book the 5 December annual general meeting from the Events tab.',
    read_ids: [],
  });
}

async function connect() {
  if (database) return database;
  client = new MongoClient(uri);
  await client.connect();
  database = client.db(dbName);
  for (const name of COLLECTIONS) {
    await collection(name).createIndex({ id: 1 }, { unique: true });
  }
  if (await collection('admins').countDocuments() === 0) await seed();
  return database;
}

async function ping() {
  await database.command({ ping: 1 });
}

function label() {
  return uri.replace(/\/\/.*@/, '//') + '/' + dbName;
}

module.exports = { connect, ping, all, find, insert, update, remove, label, COLLECTIONS };
