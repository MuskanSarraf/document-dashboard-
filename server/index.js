const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// MongoDB - Update with your URI if using Atlas
mongoose.connect('mongodb://127.0.0.1:27017/sws_assessment').then(() => console.log("DB Connected"));

// Schemas
const Document = mongoose.model('Document', new mongoose.Schema({
  name: String, size: Number, status: String, uploadDate: { type: Date, default: Date.now }
}));

const Notification = mongoose.model('Notification', new mongoose.Schema({
  message: String, type: String, read: { type: Boolean, default: false }, timestamp: { type: Date, default: Date.now }
}));

// Multer Storage
const upload = multer({ dest: 'uploads/' });

// API: Upload Route
app.post('/api/upload', upload.array('files'), async (req, res) => {
  const files = req.files;
  const isBulk = files.length > 3;

  // Save docs to DB
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
      io.emit('notification', notif); // Push real-time notification
    }, 4000);
  }

  res.json({ success: true, isBulk, docs });
});

// API: Get Notifications
app.get('/api/notifications', async (req, res) => {
  const data = await Notification.find().sort({ timestamp: -1 });
  res.json(data);
});

server.listen(5001, () => console.log("Server listening on port 5001"));