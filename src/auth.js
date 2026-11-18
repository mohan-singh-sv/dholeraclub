const jwt = require('jsonwebtoken');
const db = require('./db');

function secret() {
  return process.env.JWT_SECRET || 'ddaoi-dev-secret-change-me';
}

function sign(payload, expiresIn) {
  return jwt.sign(payload, secret(), { expiresIn });
}

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function memberAuth(req, res, next) {
  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, code: 'AUTH', message: 'Please sign in.' });
  }
  let payload;
  try {
    payload = jwt.verify(token, secret());
    if (payload.typ !== 'member') throw new Error('wrong token');
  } catch (err) {
    return res.status(401).json({ ok: false, code: 'AUTH', message: 'Session expired. Please sign in again.' });
  }
  db.find('members', payload.id).then((member) => {
    if (!member || member.status !== 'active') {
      return res.status(401).json({ ok: false, code: 'AUTH', message: 'Session is not valid.' });
    }
    req.member = member;
    next();
  }).catch(next);
}

function adminAuth(req, res, next) {
  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, code: 'AUTH', message: 'Please sign in as superadmin.' });
  }
  let payload;
  try {
    payload = jwt.verify(token, secret());
    if (payload.typ !== 'admin' || payload.role !== 'superadmin') throw new Error('wrong token');
  } catch (err) {
    return res.status(401).json({ ok: false, code: 'AUTH', message: 'Session expired. Please sign in again.' });
  }
  db.find('admins', payload.id).then((admin) => {
    if (!admin) {
      return res.status(401).json({ ok: false, code: 'AUTH', message: 'Session is not valid.' });
    }
    req.admin = admin;
    next();
  }).catch(next);
}

module.exports = { sign, memberAuth, adminAuth };
