import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { Bell, Upload, FileText, CheckCircle, Clock } from 'lucide-react';
import { Toaster, toast } from 'sonner';

const socket = io('http://localhost:5001');

export default function App() {
  const [uploadingFiles, setUploadingFiles] = useState({}); 
  const [documents, setDocuments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);

  useEffect(() => {
    fetchData();
    socket.on('notification', (notif) => {
      setNotifications(prev => [notif, ...prev]);
      toast.success(notif.message);
      fetchData(); // Refresh table when background task finishes
    });
    return () => socket.off('notification');
  }, []);

  const fetchData = async () => {
    try {
      const [docsRes, notifsRes] = await Promise.all([
        axios.get('http://localhost:5001/api/documents'),
        axios.get('http://localhost:5001/api/notifications')
      ]);
      setDocuments(docsRes.data);
      setNotifications(notifsRes.data);
    } catch (err) { console.error(err); }
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 3) {
      toast.info(`Processing ${files.length} files in background...`);
    }

    files.forEach(async (file) => {
      const formData = new FormData();
      formData.append('files', file);

      try {
        await axios.post('http://localhost:5001/api/upload', formData, {
          onUploadProgress: (p) => {
            const percent = Math.round((p.loaded * 100) / p.total);
            setUploadingFiles(prev => ({ ...prev, [file.name]: percent }));
          }
        });
        
        setTimeout(() => {
          setUploadingFiles(prev => {
            const next = { ...prev };
            delete next[file.name];
            return next;
          });
        }, 1500);
      } catch (err) {
        toast.error(`Error uploading ${file.name}`);
      }
    });
  };

  return (
    <div className="container">
      <Toaster richColors position="top-right" />
      
      <header className="header">
        <h1 style={{ color: '#2563eb' }}>SWS Dashboard</h1>
        <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setShowNotifs(!showNotifs)}>
          <Bell size={28} />
          {notifications.length > 0 && <span className="notif-badge">{notifications.length}</span>}
        </div>
      </header>

      {showNotifs && (
        <div className="notif-panel">
          <h3 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Updates</h3>
          {notifications.map((n, i) => (
            <div key={i} className="notif-item">{n.message}</div>
          ))}
        </div>
      )}

      <div className="upload-card" onClick={() => document.getElementById('fileInput').click()}>
        <Upload size={40} color="#2563eb" />
        <p style={{ fontWeight: '600' }}>Click to upload PDF documents</p>
        <input id="fileInput" type="file" multiple hidden accept=".pdf" onChange={handleUpload} />
      </div>

      <div style={{ marginTop: '20px' }}>
        {Object.entries(uploadingFiles).map(([name, progress]) => (
          <div key={name} style={{ marginBottom: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span>{name}</span>
              <span>{progress}%</span>
            </div>
            <div className="progress-bar-container">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        ))}
      </div>

      <section style={{ marginTop: '40px' }}>
        <h2>Recent Files</h2>
        <table>
          <thead>
            <tr><th>File Name</th><th>Status</th></tr>
          </thead>
          <tbody>
            {documents.map(doc => (
              <tr key={doc._id}>
                <td>{doc.name}</td>
                <td><span className="badge">Success</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}