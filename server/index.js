const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Cloud DB Connected Successfully! ✅"))
  .catch(err => console.log("Database connection error: ", err));

// Schemas
const Document = mongoose.model('Document', new mongoose.Schema({
  name: String, 
  size: Number, 
  status: String, 
  uploadDate: { type: Date, default: Date.now }
}));

const Notification = mongoose.model('Notification', new mongoose.Schema({
  message: String, 
  type: String, 
  read: { type: Boolean, default: false }, 
  timestamp: { type: Date, default: Date.now }
}));

// Multer Config
const upload = multer({ dest: 'uploads/' });

// --- ROUTES ---

// 1. Fetch all documents (for data persistence on refresh)
app.get('/api/documents', async (req, res) => {
  try {
    const docs = await Document.find().sort({ uploadDate: -1 });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Fetch all notifications (for the Bell icon on refresh)
app.get('/api/notifications', async (req, res) => {
  try {
    const data = await Notification.find().sort({ timestamp: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Upload Route
app.post('/api/upload', upload.array('files'), async (req, res) => {
  const files = req.files;
  const isBulk = files.length > 3;

  try {
    // Save metadata to DB
    const docs = await Promise.all(files.map(f => 
      new Document({ name: f.originalname, size: f.size, status: 'Completed' }).save()
    ));

    if (isBulk) {
      // REQUIREMENT: Simulate background processing for > 3 files
      setTimeout(async () => {
        const notif = new Notification({ 
          message: `${files.length} files uploaded successfully`, 
          type: 'success' 
        });
        await notif.save();
        io.emit('notification', notif); // Real-time push via Socket.io
      }, 4000);
    }

    res.json({ success: true, isBulk, docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

server.listen(5001, () => console.log("Server listening on port 5001"));