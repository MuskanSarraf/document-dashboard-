const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  },
});

const PORT = process.env.PORT || 5001;
const uploadDir = path.join(__dirname, 'uploads');
const resolvedUploadDir = path.resolve(uploadDir);

fs.mkdirSync(uploadDir, { recursive: true });

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch((err) => console.error('Database connection error:', err.message));

const documentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    size: { type: Number, required: true },
    type: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'uploading', 'complete', 'failed'],
      default: 'complete',
    },
    storedName: { type: String, required: true },
    path: { type: String, required: true },
    uploadDate: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

const Document = mongoose.model('Document', documentSchema);

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase() || '.pdf';
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isPdf =
      file.mimetype === 'application/pdf' &&
      path.extname(file.originalname).toLowerCase() === '.pdf';

    if (!isPdf) {
      cb(new Error('Only PDF files are allowed.'));
      return;
    }

    cb(null, true);
  },
});

const toDocumentResponse = (doc) => ({
  _id: doc._id,
  name: doc.name,
  size: doc.size,
  type: doc.type,
  status: doc.status,
  uploadDate: doc.uploadDate,
  downloadUrl: doc.path ? `/api/documents/${doc._id}/download` : null,
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/documents', async (req, res) => {
  try {
    const docs = await Document.find().sort({ uploadDate: -1 });
    res.json(docs.map(toDocumentResponse));
  } catch (err) {
    res.status(500).json({ error: 'Unable to load documents.' });
  }
});

app.get('/api/documents/:id/download', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);

    if (!doc) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }

    if (!doc.path) {
      res.status(404).json({ error: 'Stored file is missing.' });
      return;
    }

    const filePath = path.resolve(doc.path);
    if (!filePath.startsWith(`${resolvedUploadDir}${path.sep}`) || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Stored file is missing.' });
      return;
    }

    res.download(filePath, doc.name);
  } catch (err) {
    res.status(400).json({ error: 'Invalid document id.' });
  }
});

app.post('/api/upload', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      res.status(400).json({ error: 'Select at least one PDF file.' });
      return;
    }

    const docs = await Document.insertMany(
      req.files.map((file) => ({
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
        status: 'complete',
        storedName: file.filename,
        path: file.path,
      }))
    );

    io.emit('documents:created', docs.map(toDocumentResponse));
    res.status(201).json({ documents: docs.map(toDocumentResponse) });
  } catch (err) {
    if (req.files) {
      req.files.forEach((file) => {
        fs.rm(file.path, { force: true }, () => {});
      });
    }

    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Each PDF must be 25 MB or smaller.'
        : err.message;
    res.status(400).json({ error: message });
    return;
  }

  if (err) {
    res.status(400).json({ error: err.message || 'Upload failed.' });
    return;
  }

  next();
});

server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
