import React, { useEffect, useState } from 'react';
import { api } from './api';
import { MENU, PAGES, optionsFor } from './schema';

const emptyLookups = { clubs: [], masters: [], members: [], facilities: [], events: [], packages: [], masterTypes: [] };

function titleFor(page) {
  return (MENU.find((item) => item[0] === page) || ['', 'Admin'])[1];
}

function cell(row, key) {
  const value = row[key];
  if (key === 'image_url' && value) return <img className="thumb" src={value} alt="" />;
  if (typeof value === 'boolean' || ['status', 'direction', 'active', 'pinned', 'bookable'].includes(key)) {
    const text = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value;
    return <span className={'badge ' + String(value)}>{text ?? ''}</span>;
  }
  return value ?? '';
}

function displayValue(type, value) {
  if ((type === 'datetime-local' || type === 'date') && value) return String(value).slice(0, type === 'date' ? 10 : 16);
  if (typeof value === 'boolean') return value;
  return value ?? '';
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('ddaoi_admin_token') || '');
  const [admin, setAdmin] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ddaoi_admin') || 'null'); } catch { return null; }
  });
  const [page, setPage] = useState('dashboard');
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [masterType, setMasterType] = useState('membership_category');
  const [dash, setDash] = useState(null);
  const [lookups, setLookups] = useState(emptyLookups);
  const [sidebar, setSidebar] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState('');

  function notify(message) {
    setToast(message);
    setTimeout(() => setToast(''), 2200);
  }

  function logout() {
    localStorage.removeItem('ddaoi_admin_token');
    localStorage.removeItem('ddaoi_admin');
    setToken('');
    setAdmin(null);
  }

  async function loadLookups() {
    const [clubs, masters, members, facilities, events, packages, meta] = await Promise.all([
      api('/api/admin/clubs'),
      api('/api/admin/masters'),
      api('/api/admin/members'),
      api('/api/admin/facilities'),
      api('/api/admin/events'),
      api('/api/admin/packages'),
      api('/api/admin/meta'),
    ]);
    setLookups({
      clubs: clubs.data,
      masters: masters.data,
      members: members.data,
      facilities: facilities.data,
      events: events.data,
      packages: packages.data,
      masterTypes: meta.masterTypes,
    });
  }

  async function loadPage(nextPage = page, nextQuery = query, nextType = masterType) {
    setError('');
    if (nextPage === 'dashboard') {
      setDash(await api('/api/admin/dashboard'));
      return;
    }
    const params = new URLSearchParams();
    if (nextQuery) params.set('q', nextQuery);
    if (nextPage === 'masters' && nextType) params.set('type', nextType);
    const data = await api('/api/admin/' + nextPage + (params.toString() ? '?' + params : ''));
    setRows(data.data);
  }

  useEffect(() => {
    if (!token) return;
    loadLookups()
      .then(() => loadPage())
      .catch((err) => setError(err.message));
  }, [token]);

  async function signIn(event) {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      const data = await api('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      localStorage.setItem('ddaoi_admin_token', data.token);
      localStorage.setItem('ddaoi_admin', JSON.stringify(data.admin));
      setAdmin(data.admin);
      setError('');
      setToken(data.token);
    } catch (err) {
      setError(err.message);
    }
  }

  async function save(payload) {
    const method = editing && editing.id ? 'PUT' : 'POST';
    const url = '/api/admin/' + page + (editing && editing.id ? '/' + editing.id : '');
    await api(url, { method, body: JSON.stringify(payload) });
    setEditing(null);
    notify('Saved');
    await loadLookups();
    await loadPage();
  }

  async function approve(id) {
    await api('/api/admin/members/' + id, { method: 'PUT', body: JSON.stringify({ status: 'active' }) });
    notify('Member approved');
    await loadLookups();
    await loadPage();
  }

  async function remove(id) {
    const label = page === 'members' ? 'Deactivate this member?' : 'Delete this record?';
    if (!window.confirm(label)) return;
    await api('/api/admin/' + page + '/' + id, { method: 'DELETE' });
    notify('Saved');
    await loadLookups();
    await loadPage();
  }

  if (!token) {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={signIn}>
          <img src="/logo.jpeg" alt="Dholera logo" />
          <h1>DHOLERA</h1>
          <div className="full">Dealers Association of India · Superadmin</div>
          <label>Email</label>
          <input name="email" type="email" defaultValue="admin@ddaoi.org" required />
          <label>Password</label>
          <input name="password" type="password" defaultValue="Admin@123" required />
          {error ? <div className="error">{error}</div> : null}
          <button className="btn block" type="submit">Sign in</button>
          <div className="hint">This React panel uses the Express APIs. API docs live at <a href="/api-docs">/api-docs</a>.</div>
        </form>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className={'sidebar' + (sidebar ? ' open' : '')}>
        <div className="brand">
          <img src="/logo.jpeg" alt="" />
          <div><strong>DHOLERA</strong><span>Superadmin panel</span></div>
        </div>
        {MENU.map(([id, label]) => (
          <button
            key={id}
            className={'nav-btn' + (id === page ? ' active' : '')}
            type="button"
            onClick={() => {
              setPage(id);
              setQuery('');
              setSidebar(false);
              setEditing(null);
              loadPage(id, '', masterType).catch((err) => setError(err.message));
            }}
          >{label}</button>
        ))}
      </aside>
      <section className="main">
        <header className="topbar">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn light small menu-toggle" type="button" onClick={() => setSidebar((open) => !open)}>Menu</button>
            <h2>{titleFor(page)}</h2>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="who">{admin && admin.email}</span>
            <button className="btn light small" type="button" onClick={logout}>Log out</button>
          </div>
        </header>
        <div className="content">
          {error ? <div className="error">{error}</div> : null}
          {page === 'dashboard' ? <Dashboard dash={dash} /> : (
            <Resource
              page={page}
              rows={rows}
              query={query}
              masterType={masterType}
              lookups={lookups}
              onSearch={(value) => {
                setQuery(value);
                loadPage(page, value, masterType).catch((err) => notify(err.message));
              }}
              onType={(value) => {
                setMasterType(value);
                loadPage(page, query, value).catch((err) => notify(err.message));
              }}
              onAdd={() => setEditing(page === 'masters' ? { type: masterType, active: true } : { active: true })}
              onEdit={setEditing}
              onApprove={(id) => approve(id).catch((err) => notify(err.message))}
              onDelete={(id) => remove(id).catch((err) => notify(err.message))}
            />
          )}
        </div>
      </section>
      {editing ? (
        <Editor
          page={page}
          record={editing}
          lookups={lookups}
          onCancel={() => setEditing(null)}
          onSave={(payload) => save(payload).catch((err) => notify(err.message))}
        />
      ) : null}
      <div className={'toast' + (toast ? ' show' : '')}>{toast}</div>
    </div>
  );
}

function Dashboard({ dash }) {
  const stats = (dash && dash.stats) || {};
  const cards = [
    ['Members', stats.members],
    ['Pending approval', stats.pending],
    ['Active', stats.active],
    ['Clubs', stats.clubs],
    ['Events', stats.events],
    ['Open enquiries', stats.enquiries],
    ['Room requests', stats.roomPending],
    ['Live banners', stats.banners],
  ];
  return (
    <>
      <div className="stats">
        {cards.map(([label, value]) => (
          <div className="stat" key={label}><span>{label}</span><strong>{value ?? 0}</strong></div>
        ))}
      </div>
      <div className="panel">
        <h3>Recent members</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Code</th><th>Name</th><th>Status</th></tr></thead>
            <tbody>
              {((dash && dash.recentMembers) || []).map((member) => (
                <tr key={member.id}><td>{member.member_code}</td><td>{member.full_name}</td><td><span className={'badge ' + member.status}>{member.status}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="panel">
        <h3>Recent transactions</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Member</th><th>Remark</th><th>Amount</th></tr></thead>
            <tbody>
              {((dash && dash.recentTransactions) || []).map((txn) => (
                <tr key={txn.id}><td>{txn.txn_date}</td><td>{txn.member_name}</td><td>{txn.remark}</td><td>{txn.direction} {txn.amount}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Resource({ page, rows, query, masterType, lookups, onSearch, onType, onAdd, onEdit, onApprove, onDelete }) {
  const config = PAGES[page];
  return (
    <>
      <div className="toolbar">
        <input placeholder="Search" defaultValue={query} key={page + query} onBlur={(event) => onSearch(event.target.value.trim())} onKeyDown={(event) => { if (event.key === 'Enter') onSearch(event.target.value.trim()); }} />
        {page === 'masters' ? (
          <select value={masterType} onChange={(event) => onType(event.target.value)}>
            {optionsFor('masterTypes', lookups).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        ) : null}
        <button className="btn" type="button" onClick={onAdd}>Add</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{config.columns.map(([key, label]) => <th key={key}>{label}</th>)}<th></th></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? <tr><td className="empty" colSpan={config.columns.length + 1}>Nothing in this list yet.</td></tr> : rows.map((row) => (
              <tr key={row.id}>
                {config.columns.map(([key]) => <td key={key}>{cell(row, key)}</td>)}
                <td>
                  <div className="actions">
                    {page === 'members' && row.status === 'pending' ? <button className="btn small" type="button" onClick={() => onApprove(row.id)}>Approve</button> : null}
                    <button className="btn light small" type="button" onClick={() => onEdit(row)}>Edit</button>
                    <button className="btn danger small" type="button" onClick={() => onDelete(row.id)}>{page === 'members' ? 'Deactivate' : 'Delete'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Editor({ page, record, lookups, onCancel, onSave }) {
  const config = PAGES[page];
  const fields = page === 'transactions' && record.id ? config.fields.filter((item) => item.key === 'remark') : config.fields;
  const [form, setForm] = useState(() => {
    const next = {};
    fields.forEach((item) => {
      if (item.type === 'checkbox') next[item.key] = record.id ? !!record[item.key] : item.key === 'active';
      else next[item.key] = displayValue(item.type, record[item.key]);
    });
    return next;
  });

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function upload(file) {
    const body = new FormData();
    body.append('file', file);
    const data = await api('/api/admin/upload', { method: 'POST', body });
    set('image_url', data.url);
  }

  return (
    <div className="backdrop" onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <form className="modal" onSubmit={(event) => {
        event.preventDefault();
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        onSave(payload);
      }}>
        <h3>{record.id ? 'Edit' : 'Add'} {titleFor(page).toLowerCase()}</h3>
        <div className="grid-2">
          {fields.map((item) => (
            <Field key={item.key} item={item} value={form[item.key]} lookups={lookups} onChange={(value) => set(item.key, value)} onUpload={upload} />
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn light" type="button" onClick={onCancel}>Cancel</button>
          <button className="btn" type="submit">Save</button>
        </div>
      </form>
    </div>
  );
}

function Field({ item, value, lookups, onChange, onUpload }) {
  if (item.type === 'checkbox') {
    return <label className="check"><input type="checkbox" checked={!!value} onChange={(event) => onChange(event.target.checked)} /> {item.label}</label>;
  }
  if (item.type === 'textarea') {
    return <><label>{item.label}</label><textarea value={value || ''} onChange={(event) => onChange(event.target.value)} /></>;
  }
  if (item.type === 'select') {
    return (
      <>
        <label>{item.label}</label>
        <select value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
          {optionsFor(item.source, lookups).map(([optValue, optLabel]) => <option key={String(optValue)} value={optValue}>{optLabel}</option>)}
        </select>
      </>
    );
  }
  if (item.type === 'image') {
    return (
      <>
        <label>{item.label}</label>
        <input value={value || ''} onChange={(event) => onChange(event.target.value)} />
        <input type="file" accept="image/*" style={{ marginTop: 8 }} onChange={(event) => event.target.files[0] && onUpload(event.target.files[0])} />
      </>
    );
  }
  return (
    <>
      <label>{item.label}{item.required ? ' *' : ''}</label>
      <input
        type={item.type === 'password' ? 'password' : item.type}
        value={value || ''}
        placeholder={item.type === 'password' ? 'Leave blank to keep the current password' : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    </>
  );
}
