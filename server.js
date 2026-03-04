const express = require('express');
const path = require('path');
const initSqlJs = require('sql.js');
const UAParser = require('ua-parser-js');
const fs = require('fs');

const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Simple token store (in-memory, survives until restart)
const validTokens = new Set();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Auth middleware for admin routes
function requireAuth(req, res, next) {
  const token = req.cookies?.admin_token || req.headers['x-admin-token'];
  if (token && validTokens.has(token)) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.redirect('/admin/login');
}

// Database setup
const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'analytics.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

let db;

async function initDB() {
  const SQL = await initSqlJs();

  // Load existing DB file if it exists
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS visitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      ip TEXT,
      country TEXT,
      city TEXT,
      user_agent TEXT,
      browser TEXT,
      browser_version TEXT,
      os TEXT,
      os_version TEXT,
      device_type TEXT,
      device_vendor TEXT,
      device_model TEXT,
      screen_width INTEGER,
      screen_height INTEGER,
      viewport_width INTEGER,
      viewport_height INTEGER,
      language TEXT,
      referrer TEXT,
      referrer_domain TEXT,
      utm_source TEXT,
      utm_medium TEXT,
      utm_campaign TEXT,
      landing_page TEXT,
      is_mobile INTEGER DEFAULT 0,
      is_bot INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pageviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      visitor_id INTEGER,
      page_url TEXT,
      page_title TEXT,
      time_on_page INTEGER DEFAULT 0,
      scroll_depth INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (visitor_id) REFERENCES visitors(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      visitor_id INTEGER,
      event_type TEXT,
      event_target TEXT,
      event_data TEXT,
      page_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (visitor_id) REFERENCES visitors(id)
    )
  `);

  db.run("CREATE INDEX IF NOT EXISTS idx_visitors_created_at ON visitors(created_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_visitors_session ON visitors(session_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_pageviews_session ON pageviews(session_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_pageviews_created ON pageviews(created_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)");

  saveDB();
  console.log('Database initialized at', dbPath);
}

// Save DB to disk
function saveDB() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// Auto-save every 30 seconds
setInterval(() => {
  if (db) saveDB();
}, 30000);

// Helper: run query and return results as array of objects
function queryAll(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

function runSQL(sql, params) {
  if (params) {
    db.run(sql, params);
  } else {
    db.run(sql);
  }
}

function getLastInsertId() {
  const row = queryOne("SELECT last_insert_rowid() as id");
  return row ? row.id : 0;
}

// Middleware
app.use(express.json({ limit: '1mb' }));

// Cookie parser (simple, no dependency)
app.use((req, res, next) => {
  req.cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach(c => {
      const [key, val] = c.trim().split('=');
      if (key && val) req.cookies[key.trim()] = val.trim();
    });
  }
  next();
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// --- Admin Auth ---
app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = generateToken();
    validTokens.add(token);
    res.setHeader('Set-Cookie', `admin_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Falsches Passwort' });
});

app.post('/api/admin/logout', (req, res) => {
  const token = req.cookies?.admin_token;
  if (token) validTokens.delete(token);
  res.setHeader('Set-Cookie', 'admin_token=; Path=/; HttpOnly; Max-Age=0');
  res.json({ ok: true });
});

// Protect all admin routes
app.use('/admin', (req, res, next) => {
  if (req.path === '/login' || req.path === '/login.html') return next();
  requireAuth(req, res, next);
});
app.use('/api/admin', (req, res, next) => {
  if (req.path === '/login') return next();
  requireAuth(req, res, next);
});

// Bot detection
function isBot(ua) {
  const botPatterns = /bot|crawler|spider|scraper|facebook|twitter|telegram|whatsapp|slack|discord|preview|fetch|curl|wget|python|java|php|ruby|go-http/i;
  return botPatterns.test(ua || '');
}

// Extract referrer domain
function getReferrerDomain(referrer) {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname;
  } catch { return null; }
}

// Extract UTM params
function getUtmParams(url) {
  try {
    const u = new URL(url, 'https://example.com');
    return {
      source: u.searchParams.get('utm_source'),
      medium: u.searchParams.get('utm_medium'),
      campaign: u.searchParams.get('utm_campaign')
    };
  } catch { return { source: null, medium: null, campaign: null }; }
}

// Get client IP
function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.connection?.remoteAddress || req.ip;
}

// --- API Endpoints ---

// Track new visitor/session
app.post('/api/track/visit', (req, res) => {
  try {
    const { sessionId, screen, viewport, language, referrer, landingPage, pageTitle } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

    const ua = req.headers['user-agent'] || '';
    const parser = new UAParser(ua);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const device = parser.getDevice();
    const ip = getClientIP(req);
    const bot = isBot(ua);
    const refDomain = getReferrerDomain(referrer);
    const utm = getUtmParams(landingPage || '');
    const isMobile = device.type === 'mobile' || device.type === 'tablet' ? 1 : 0;

    runSQL(`INSERT INTO visitors (session_id, ip, country, city, user_agent, browser, browser_version, os, os_version,
      device_type, device_vendor, device_model, screen_width, screen_height, viewport_width, viewport_height,
      language, referrer, referrer_domain, utm_source, utm_medium, utm_campaign, landing_page, is_mobile, is_bot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, ip, null, null, ua,
      browser.name || 'Unknown', browser.version || '',
      os.name || 'Unknown', os.version || '',
      device.type || 'desktop', device.vendor || '', device.model || '',
      screen?.width || 0, screen?.height || 0,
      viewport?.width || 0, viewport?.height || 0,
      language || '', referrer || '', refDomain,
      utm.source, utm.medium, utm.campaign,
      landingPage || '', isMobile, bot ? 1 : 0]);

    const visitorId = getLastInsertId();

    runSQL(`INSERT INTO pageviews (session_id, visitor_id, page_url, page_title) VALUES (?, ?, ?, ?)`,
      [sessionId, visitorId, landingPage || '/', pageTitle || '']);

    const pageviewId = getLastInsertId();
    saveDB();

    res.json({ visitorId, pageviewId });
  } catch (err) {
    console.error('Track visit error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Track pageview
app.post('/api/track/pageview', (req, res) => {
  try {
    const { sessionId, visitorId, pageUrl, pageTitle } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

    runSQL(`INSERT INTO pageviews (session_id, visitor_id, page_url, page_title) VALUES (?, ?, ?, ?)`,
      [sessionId, visitorId || null, pageUrl || '', pageTitle || '']);
    const pageviewId = getLastInsertId();
    saveDB();

    res.json({ pageviewId });
  } catch (err) {
    console.error('Track pageview error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Track event (click, scroll, etc.)
app.post('/api/track/event', (req, res) => {
  try {
    const { sessionId, visitorId, eventType, eventTarget, eventData, pageUrl } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

    runSQL(`INSERT INTO events (session_id, visitor_id, event_type, event_target, event_data, page_url)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, visitorId || null, eventType || '', eventTarget || '', JSON.stringify(eventData || {}), pageUrl || '']);
    saveDB();

    res.json({ ok: true });
  } catch (err) {
    console.error('Track event error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Update pageview (time on page, scroll depth)
app.post('/api/track/update', (req, res) => {
  try {
    const { pageviewId, timeOnPage, scrollDepth } = req.body;
    if (!pageviewId) return res.status(400).json({ error: 'Missing pageviewId' });

    runSQL(`UPDATE pageviews SET time_on_page = ?, scroll_depth = ? WHERE id = ?`,
      [timeOnPage || 0, scrollDepth || 0, pageviewId]);
    saveDB();

    res.json({ ok: true });
  } catch (err) {
    console.error('Track update error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// --- Admin API ---

function getDateFilter(range) {
  switch (range) {
    case '24h': return "datetime('now', '-1 day')";
    case '7d': return "datetime('now', '-7 days')";
    case '30d': return "datetime('now', '-30 days')";
    case '90d': return "datetime('now', '-90 days')";
    case 'all': return "datetime('2020-01-01')";
    default: return "datetime('now', '-7 days')";
  }
}

// Dashboard stats
app.get('/api/admin/stats', (req, res) => {
  try {
    const df = getDateFilter(req.query.range);

    const totalVisitors = queryOne(`SELECT COUNT(*) as count FROM visitors WHERE created_at >= ${df} AND is_bot = 0`);
    const totalPageviews = queryOne(`SELECT COUNT(*) as count FROM pageviews WHERE created_at >= ${df}`);
    const totalEvents = queryOne(`SELECT COUNT(*) as count FROM events WHERE created_at >= ${df}`);
    const uniqueIPs = queryOne(`SELECT COUNT(DISTINCT ip) as count FROM visitors WHERE created_at >= ${df} AND is_bot = 0`);
    const mobileVsDesktop = queryAll(`SELECT is_mobile, COUNT(*) as count FROM visitors WHERE created_at >= ${df} AND is_bot = 0 GROUP BY is_mobile`);
    const avgScrollDepth = queryOne(`SELECT ROUND(AVG(scroll_depth), 1) as avg FROM pageviews WHERE created_at >= ${df} AND scroll_depth > 0`);
    const avgTimeOnPage = queryOne(`SELECT ROUND(AVG(time_on_page), 1) as avg FROM pageviews WHERE created_at >= ${df} AND time_on_page > 0`);
    const botCount = queryOne(`SELECT COUNT(*) as count FROM visitors WHERE created_at >= ${df} AND is_bot = 1`);

    const visitorsPerDay = queryAll(`SELECT DATE(created_at) as date, COUNT(*) as count FROM visitors WHERE created_at >= ${df} AND is_bot = 0 GROUP BY DATE(created_at) ORDER BY date`);
    const topBrowsers = queryAll(`SELECT browser, COUNT(*) as count FROM visitors WHERE created_at >= ${df} AND is_bot = 0 GROUP BY browser ORDER BY count DESC LIMIT 10`);
    const topOS = queryAll(`SELECT os, COUNT(*) as count FROM visitors WHERE created_at >= ${df} AND is_bot = 0 GROUP BY os ORDER BY count DESC LIMIT 10`);
    const topReferrers = queryAll(`SELECT referrer_domain, COUNT(*) as count FROM visitors WHERE created_at >= ${df} AND is_bot = 0 AND referrer_domain IS NOT NULL AND referrer_domain != '' GROUP BY referrer_domain ORDER BY count DESC LIMIT 10`);
    const topScreens = queryAll(`SELECT screen_width || 'x' || screen_height as resolution, COUNT(*) as count FROM visitors WHERE created_at >= ${df} AND is_bot = 0 AND screen_width > 0 GROUP BY resolution ORDER BY count DESC LIMIT 10`);
    const topLanguages = queryAll(`SELECT language, COUNT(*) as count FROM visitors WHERE created_at >= ${df} AND is_bot = 0 AND language != '' GROUP BY language ORDER BY count DESC LIMIT 10`);
    const topEvents = queryAll(`SELECT event_type, event_target, COUNT(*) as count FROM events WHERE created_at >= ${df} GROUP BY event_type, event_target ORDER BY count DESC LIMIT 20`);
    const pageviewsPerHour = queryAll(`SELECT strftime('%H', created_at) as hour, COUNT(*) as count FROM pageviews WHERE created_at >= ${df} GROUP BY hour ORDER BY hour`);
    const utmCampaigns = queryAll(`SELECT utm_source, utm_medium, utm_campaign, COUNT(*) as count FROM visitors WHERE created_at >= ${df} AND is_bot = 0 AND (utm_source IS NOT NULL AND utm_source != '') GROUP BY utm_source, utm_medium, utm_campaign ORDER BY count DESC LIMIT 10`);

    res.json({
      totalVisitors: totalVisitors?.count || 0,
      totalPageviews: totalPageviews?.count || 0,
      totalEvents: totalEvents?.count || 0,
      uniqueIPs: uniqueIPs?.count || 0,
      mobileVsDesktop,
      avgScrollDepth: avgScrollDepth?.avg || 0,
      avgTimeOnPage: avgTimeOnPage?.avg || 0,
      botCount: botCount?.count || 0,
      visitorsPerDay, topBrowsers, topOS, topReferrers, topScreens,
      topLanguages, topEvents, pageviewsPerHour, utmCampaigns
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Recent visitors (detailed)
app.get('/api/admin/visitors', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = parseInt(req.query.offset) || 0;

    const visitors = queryAll(`
      SELECT v.*,
        (SELECT COUNT(*) FROM pageviews WHERE visitor_id = v.id) as pageview_count,
        (SELECT MAX(scroll_depth) FROM pageviews WHERE visitor_id = v.id) as max_scroll_depth,
        (SELECT SUM(time_on_page) FROM pageviews WHERE visitor_id = v.id) as total_time
      FROM visitors v
      ORDER BY v.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const total = queryOne('SELECT COUNT(*) as count FROM visitors');

    res.json({ visitors, total: total?.count || 0 });
  } catch (err) {
    console.error('Admin visitors error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Visitor detail
app.get('/api/admin/visitor/:id', (req, res) => {
  try {
    const visitor = queryOne('SELECT * FROM visitors WHERE id = ?', [parseInt(req.params.id)]);
    if (!visitor) return res.status(404).json({ error: 'Not found' });

    const pageviews = queryAll('SELECT * FROM pageviews WHERE visitor_id = ? ORDER BY created_at', [parseInt(req.params.id)]);
    const events = queryAll('SELECT * FROM events WHERE visitor_id = ? ORDER BY created_at', [parseInt(req.params.id)]);

    res.json({ visitor, pageviews, events });
  } catch (err) {
    console.error('Admin visitor detail error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Live visitors (last 5 min)
app.get('/api/admin/live', (req, res) => {
  try {
    const live = queryAll(`
      SELECT v.*, MAX(p.created_at) as last_activity
      FROM visitors v
      LEFT JOIN pageviews p ON p.visitor_id = v.id
      WHERE v.created_at >= datetime('now', '-5 minutes') AND v.is_bot = 0
      GROUP BY v.id
      ORDER BY last_activity DESC
    `);

    res.json({ count: live.length, visitors: live });
  } catch (err) {
    console.error('Admin live error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Export data as CSV
app.get('/api/admin/export', (req, res) => {
  try {
    const visitors = queryAll('SELECT * FROM visitors ORDER BY created_at DESC');
    if (!visitors.length) return res.send('No data');
    const headers = Object.keys(visitors[0]).join(',');
    const rows = visitors.map(v => Object.values(v).map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(','));
    const csv = [headers, ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=visitors-export.csv');
    res.send(csv);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

// SPA fallback for public site
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/admin')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Start server after DB init
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Failed to init DB:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => { if (db) { saveDB(); db.close(); } process.exit(0); });
process.on('SIGTERM', () => { if (db) { saveDB(); db.close(); } process.exit(0); });
