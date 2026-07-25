const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { Readable } = require('stream');

const cloudbase = require('@cloudbase/node-sdk');
const express = require('express');
const multer = require('multer');

const PORT = Number(process.env.PORT || 80);
const STUDIO_ADMIN_PORT = Number(process.env.STUDIO_ADMIN_PORT || 3000);
const ENV_ID =
  process.env.TCB_ENV_ID ||
  process.env.NEXT_PUBLIC_TCB_ENV_ID ||
  process.env.TCB_ENV ||
  'cloud1-8grodf5s3006f004';

const COLLECTIONS = {
  cases: 'website_cases',
  designers: 'website_designers',
  communities: 'website_communities',
};

const adminUsername = process.env.WEBSITE_ADMIN_USERNAME || 'PNZJ';
const adminPassword = process.env.WEBSITE_ADMIN_PASSWORD || 'PNZJ888888';
const adminToken =
  process.env.WEBSITE_ADMIN_TOKEN ||
  crypto.createHash('sha256').update(`${adminUsername}:${adminPassword}:${ENV_ID}`).digest('hex');

const cloudbaseConfig = {};
if (process.env.TCB_USE_CURRENT_ENV === '1') {
  // 微信云托管：使用当前环境 + 自动注入的密钥
  cloudbaseConfig.env = cloudbase.SYMBOL_CURRENT_ENV;
  if (process.env.TCB_SECRET_ID && process.env.TCB_SECRET_KEY) {
    cloudbaseConfig.secretId = process.env.TCB_SECRET_ID;
    cloudbaseConfig.secretKey = process.env.TCB_SECRET_KEY;
  }
  // 微信云托管运行时可能会通过其他变量名注入
  if (!cloudbaseConfig.secretId && process.env.SECRET_ID && process.env.SECRET_KEY) {
    cloudbaseConfig.secretId = process.env.SECRET_ID;
    cloudbaseConfig.secretKey = process.env.SECRET_KEY;
  }
} else {
  cloudbaseConfig.env = ENV_ID;
  if (process.env.TCB_SECRET_ID && process.env.TCB_SECRET_KEY) {
    cloudbaseConfig.secretId = process.env.TCB_SECRET_ID;
    cloudbaseConfig.secretKey = process.env.TCB_SECRET_KEY;
  }
}

let cloudApp;
let cloudDb;

function getCloudApp() {
  if (!cloudApp) {
    cloudApp = cloudbase.init(cloudbaseConfig);
  }
  return cloudApp;
}

function getDb() {
  if (!cloudDb) {
    cloudDb = getCloudApp().database();
  }
  return cloudDb;
}

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error('Only images are allowed'));
  },
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

const websiteDist = path.join(__dirname, 'website', 'dist');
const erpDist = path.join(__dirname, 'dist');
const studioAdminRoot = path.join(__dirname, 'studio-admin');
const studioAdminCli = path.join(studioAdminRoot, 'node_modules', 'vinext', 'dist', 'cli.js');
const seedPath = path.join(__dirname, 'website', 'api', 'database', 'db.json');
let seedDataCache;
let studioAdminProcess;

app.use('/api', express.json({ limit: '10mb' }));
app.use('/api', express.urlencoded({ extended: true, limit: '10mb' }));

function toPublicDoc(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  const publicDoc = { id: rest.id || _id, ...rest };
  Object.defineProperty(publicDoc, '_docId', { value: _id, enumerable: false });
  return publicDoc;
}

function getSeedData() {
  if (!seedDataCache) {
    seedDataCache = fs.existsSync(seedPath)
      ? JSON.parse(fs.readFileSync(seedPath, 'utf8'))
      : { cases: [], designers: [], communities: [] };
  }
  return seedDataCache;
}

function fallbackList(collection) {
  const seed = getSeedData();
  if (collection === COLLECTIONS.cases) return seed.cases || [];
  if (collection === COLLECTIONS.designers) return seed.designers || [];
  if (collection === COLLECTIONS.communities) return seed.communities || [];
  return [];
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const tokenBuffer = Buffer.from(token);
  const adminTokenBuffer = Buffer.from(adminToken);
  if (
    tokenBuffer.length === adminTokenBuffer.length &&
    crypto.timingSafeEqual(tokenBuffer, adminTokenBuffer)
  ) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

async function ensureCollection(name) {
  const db = getDb();
  try {
    await db.collection(name).limit(1).get();
    return;
  } catch (err) {
    // If the read fails because the collection is missing, try creating it.
  }
  try {
    await db.createCollection(name);
  } catch (err) {
    const message = String(err && err.message ? err.message : err);
    if (!message.includes('exist') && err.code !== 'DATABASE_COLLECTION_EXIST') {
      throw err;
    }
  }
}

async function count(collection) {
  const db = getDb();
  const result = await db.collection(collection).count();
  return result.total || 0;
}

async function seedCollection(collection, records) {
  const db = getDb();
  await ensureCollection(collection);
  if ((await count(collection)) > 0) return;

  for (const record of records) {
    await db.collection(collection).add({
      ...record,
      id: record.id || `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    });
  }
}

async function seedWebsiteData() {
  if (process.env.SKIP_WEBSITE_SEED === '1') return;
  if (!fs.existsSync(seedPath)) return;
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  await seedCollection(COLLECTIONS.cases, seed.cases || []);
  await seedCollection(COLLECTIONS.designers, seed.designers || []);
  await seedCollection(COLLECTIONS.communities, seed.communities || []);
}

async function list(collection) {
  const db = getDb();
  try {
    const result = await db.collection(collection).limit(1000).get();
    const data = (result.data || []).map(toPublicDoc);
    return data.length > 0 ? data : fallbackList(collection);
  } catch (err) {
    console.error(`Failed to read ${collection}; using seed fallback.`, err);
    return fallbackList(collection);
  }
}

async function findOne(collection, id) {
  const db = getDb();
  const result = await db.collection(collection).where({ id }).limit(1).get();
  return toPublicDoc((result.data || [])[0]);
}

async function addOne(collection, data, idPrefix = '') {
  const db = getDb();
  const now = new Date().toISOString();
  const record = {
    ...data,
    id: data.id || `${idPrefix}${Date.now()}`,
    createdAt: data.createdAt || now,
    updatedAt: now,
  };
  await db.collection(collection).add(record);
  return record;
}

async function updateOne(collection, id, data) {
  const db = getDb();
  const existing = await findOne(collection, id);
  if (!existing) return null;
  const update = { ...data, updatedAt: new Date().toISOString() };
  delete update._id;
  delete update._docId;
  delete update.id;
  await db.collection(collection).doc(existing._docId || existing.id).update(update);
  return { ...existing, ...update, id };
}

async function deleteOne(collection, id) {
  const db = getDb();
  const existing = await findOne(collection, id);
  if (!existing) return false;
  await db.collection(collection).doc(existing._docId || existing.id).remove();
  return true;
}

function withCount(items, cases, key) {
  return items.map((item) => ({
    ...item,
    casesCount: cases.filter((caseItem) => caseItem[key] === item.id || caseItem.community === item.name).length,
  }));
}

function encodeFileId(fileID) {
  return Buffer.from(fileID, 'utf8').toString('base64url');
}

function decodeFileId(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    env: ENV_ID,
    studioAdmin: studioAdminProcess && studioAdminProcess.exitCode === null ? 'running' : 'stopped',
  });
});

app.post('/api/auth/login', (req, res) => {
  if (req.body.username === adminUsername && req.body.password === adminPassword) {
    return res.json({ token: adminToken, username: adminUsername });
  }
  res.status(401).json({ error: 'Invalid username or password' });
});

app.get('/api/cases', async (req, res, next) => {
  try {
    const cases = await list(COLLECTIONS.cases);
    const filtered = req.query.community
      ? cases.filter((item) => item.community === req.query.community)
      : cases;
    res.json(filtered);
  } catch (err) {
    next(err);
  }
});

app.get('/api/cases/communities', async (_req, res, next) => {
  try {
    const cases = await list(COLLECTIONS.cases);
    res.json([...new Set(cases.map((item) => item.community))]);
  } catch (err) {
    next(err);
  }
});

app.get('/api/cases/:id', async (req, res, next) => {
  try {
    const item = await findOne(COLLECTIONS.cases, req.params.id);
    if (!item) return res.status(404).json({ error: 'Case not found' });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

app.post('/api/cases', requireAdmin, async (req, res, next) => {
  try {
    const { name, community, houseType, style } = req.body;
    if (!name || !community || !houseType || !style) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const item = await addOne(COLLECTIONS.cases, {
      ...req.body,
      area: req.body.area || 0,
      description: req.body.description || '',
      coverImage: req.body.coverImage || '',
      featured: Boolean(req.body.featured),
      sortOrder: req.body.sortOrder || 0,
      status: req.body.status || 'draft',
      designerId: req.body.designerId || '',
      images: [],
    });
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

app.put('/api/cases/:id', requireAdmin, async (req, res, next) => {
  try {
    const item = await updateOne(COLLECTIONS.cases, req.params.id, req.body);
    if (!item) return res.status(404).json({ error: 'Case not found' });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/cases/:id', requireAdmin, async (req, res, next) => {
  try {
    if (!(await deleteOne(COLLECTIONS.cases, req.params.id))) {
      return res.status(404).json({ error: 'Case not found' });
    }
    res.json({ message: 'Case deleted successfully' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/cases/:id/images', requireAdmin, async (req, res, next) => {
  try {
    const item = await findOne(COLLECTIONS.cases, req.params.id);
    if (!item) return res.status(404).json({ error: 'Case not found' });
    const image = {
      id: Date.now().toString(),
      caseId: req.params.id,
      url: req.body.url,
      order: (item.images || []).length,
      alt: req.body.alt || '',
    };
    await updateOne(COLLECTIONS.cases, req.params.id, {
      images: [...(item.images || []), image],
    });
    res.status(201).json(image);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/cases/:id/images/:imageId', requireAdmin, async (req, res, next) => {
  try {
    const item = await findOne(COLLECTIONS.cases, req.params.id);
    if (!item) return res.status(404).json({ error: 'Case not found' });
    const images = (item.images || [])
      .filter((image) => image.id !== req.params.imageId)
      .map((image, order) => ({ ...image, order }));
    await updateOne(COLLECTIONS.cases, req.params.id, { images });
    res.json({ message: 'Image deleted successfully' });
  } catch (err) {
    next(err);
  }
});

app.get('/api/designers', async (_req, res, next) => {
  try {
    res.json(withCount(await list(COLLECTIONS.designers), await list(COLLECTIONS.cases), 'designerId'));
  } catch (err) {
    next(err);
  }
});

app.get('/api/designers/:id', async (req, res, next) => {
  try {
    const item = await findOne(COLLECTIONS.designers, req.params.id);
    if (!item) return res.status(404).json({ error: 'Designer not found' });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

app.post('/api/designers', requireAdmin, async (req, res, next) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Name is required' });
    res.status(201).json(await addOne(COLLECTIONS.designers, req.body, 'd'));
  } catch (err) {
    next(err);
  }
});

app.put('/api/designers/:id', requireAdmin, async (req, res, next) => {
  try {
    const item = await updateOne(COLLECTIONS.designers, req.params.id, req.body);
    if (!item) return res.status(404).json({ error: 'Designer not found' });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/designers/:id', requireAdmin, async (req, res, next) => {
  try {
    const cases = await list(COLLECTIONS.cases);
    const casesCount = cases.filter((item) => item.designerId === req.params.id).length;
    if (casesCount > 0) return res.status(400).json({ error: 'Cannot delete designer with existing cases', casesCount });
    if (!(await deleteOne(COLLECTIONS.designers, req.params.id))) {
      return res.status(404).json({ error: 'Designer not found' });
    }
    res.json({ message: 'Designer deleted successfully' });
  } catch (err) {
    next(err);
  }
});

app.get('/api/communities', async (_req, res, next) => {
  try {
    const communities = await list(COLLECTIONS.communities);
    const cases = await list(COLLECTIONS.cases);
    res.json(withCount(communities, cases, 'community').sort((a, b) => a.sortOrder - b.sortOrder));
  } catch (err) {
    next(err);
  }
});

app.get('/api/communities/:id', async (req, res, next) => {
  try {
    const item = await findOne(COLLECTIONS.communities, req.params.id);
    if (!item) return res.status(404).json({ error: 'Community not found' });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

app.post('/api/communities', requireAdmin, async (req, res, next) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: 'Name is required' });
    res.status(201).json(await addOne(COLLECTIONS.communities, req.body, 'c'));
  } catch (err) {
    next(err);
  }
});

app.put('/api/communities/:id', requireAdmin, async (req, res, next) => {
  try {
    const item = await updateOne(COLLECTIONS.communities, req.params.id, req.body);
    if (!item) return res.status(404).json({ error: 'Community not found' });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

app.delete('/api/communities/:id', requireAdmin, async (req, res, next) => {
  try {
    const community = await findOne(COLLECTIONS.communities, req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    const cases = await list(COLLECTIONS.cases);
    const casesCount = cases.filter((item) => item.community === community.name).length;
    if (casesCount > 0) return res.status(400).json({ error: 'Cannot delete community with existing cases', casesCount });
    await deleteOne(COLLECTIONS.communities, req.params.id);
    res.json({ message: 'Community deleted successfully' });
  } catch (err) {
    next(err);
  }
});

app.post('/api/upload', requireAdmin, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = path.extname(req.file.originalname) || '.jpg';
    const cloudPath = `website/uploads/${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
    const result = await getCloudApp().uploadFile({ cloudPath, fileContent: req.file.buffer });
    const fileID = result.fileID;
    res.json({ fileID, url: `/api/files/${encodeFileId(fileID)}` });
  } catch (err) {
    next(err);
  }
});

app.post('/api/upload/multiple', requireAdmin, upload.array('images', 10), async (req, res, next) => {
  try {
    const files = req.files || [];
    const uploads = await Promise.all(files.map(async (file) => {
      const ext = path.extname(file.originalname) || '.jpg';
      const cloudPath = `website/uploads/${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
      const result = await getCloudApp().uploadFile({ cloudPath, fileContent: file.buffer });
      return `/api/files/${encodeFileId(result.fileID)}`;
    }));
    res.json({ urls: uploads });
  } catch (err) {
    next(err);
  }
});

app.get('/api/files/:fileID', async (req, res, next) => {
  try {
    const fileID = decodeFileId(req.params.fileID);
    const result = await getCloudApp().getTempFileURL({ fileList: [fileID] });
    const item = (result.fileList || [])[0];
    if (!item || !item.tempFileURL) return res.status(404).send('File not found');
    const upstream = await fetch(item.tempFileURL);
    if (!upstream.ok || !upstream.body) return res.status(upstream.status || 502).send('File fetch failed');
    res.setHeader('Cache-Control', 'private, max-age=300');
    if (upstream.headers.get('content-type')) res.setHeader('Content-Type', upstream.headers.get('content-type'));
    if (upstream.headers.get('content-length')) res.setHeader('Content-Length', upstream.headers.get('content-length'));
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    next(err);
  }
});

app.use('/erp', express.static(erpDist));
app.get('/erp', (_req, res) => res.redirect('/erp/'));
app.get(/^\/erp\/.*/, (_req, res) => res.sendFile(path.join(erpDist, 'index.html')));

app.get('/ljCjuUEYbP.txt', (_req, res) => {
  res.type('text/plain').send('0ab969a492437da11868eb8efc2bb05d');
});

function proxyToStudioAdmin(req, res) {
  const proxyReq = http.request({
    hostname: '127.0.0.1',
    port: STUDIO_ADMIN_PORT,
    method: req.method,
    path: req.originalUrl || req.url,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${STUDIO_ADMIN_PORT}`,
      'x-forwarded-host': req.headers.host || '',
      'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'https',
    },
  }, (proxyRes) => {
    res.status(proxyRes.statusCode || 500);
    Object.entries(proxyRes.headers).forEach(([name, value]) => {
      if (value !== undefined) res.setHeader(name, value);
    });
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (error) => {
    console.error('Studio admin proxy failed:', error.message);
    if (!res.headersSent) {
      res.status(503).type('text/plain').send('案例库服务正在启动，请稍后刷新');
    } else {
      res.end();
    }
  });
  req.pipe(proxyReq);
}

app.use((req, res) => proxyToStudioAdmin(req, res));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server internal error' });
});

function startStudioAdmin() {
  if (!fs.existsSync(studioAdminCli)) {
    throw new Error(`Studio admin runtime is missing: ${studioAdminCli}`);
  }
  studioAdminProcess = spawn(
    process.execPath,
    [studioAdminCli, 'start', '-p', String(STUDIO_ADMIN_PORT)],
    {
      cwd: studioAdminRoot,
      env: { ...process.env, PORT: String(STUDIO_ADMIN_PORT) },
      stdio: 'inherit',
    },
  );
  studioAdminProcess.on('exit', (code, signal) => {
    console.error(`Studio admin exited (code=${code}, signal=${signal || 'none'})`);
  });
}

startStudioAdmin();

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`PNZJ website + ERP server listening on ${PORT}`);
  console.log(`Studio admin internal server: 127.0.0.1:${STUDIO_ADMIN_PORT}`);
  console.log(`CloudBase env: ${ENV_ID}`);
});

function shutdown() {
  server.close();
  if (studioAdminProcess && studioAdminProcess.exitCode === null) {
    studioAdminProcess.kill('SIGTERM');
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

seedWebsiteData().catch((err) => {
  console.error('Failed to initialize website data; service is still running.', err);
});
