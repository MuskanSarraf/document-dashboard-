import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';
const MAX_FILES_PER_BATCH = 20;

const statusMeta = {
  pending: { label: 'Pending', icon: FileText },
  uploading: { label: 'Uploading', icon: Loader2 },
  complete: { label: 'Complete', icon: CheckCircle2 },
  failed: { label: 'Failed', icon: XCircle },
};

const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const formatDate = (date) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(date));

const getFileKey = (file) =>
  `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`;

export default function App() {
  const fileInputRef = useRef(null);
  const [documents, setDocuments] = useState([]);
  const [queue, setQueue] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);

  const queuedCount = queue.length;
  const completedCount = useMemo(
    () => queue.filter((item) => item.status === 'complete').length,
    [queue]
  );

  const loadDocuments = async () => {
    setIsLoadingDocs(true);

    try {
      const response = await axios.get(`${API_BASE_URL}/api/documents`);
      setDocuments(response.data);
    } catch {
      toast.error('Could not load the document list.');
    } finally {
      setIsLoadingDocs(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    axios
      .get(`${API_BASE_URL}/api/documents`)
      .then((response) => {
        if (isMounted) setDocuments(response.data);
      })
      .catch(() => {
        if (isMounted) toast.error('Could not load the document list.');
      })
      .finally(() => {
        if (isMounted) setIsLoadingDocs(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const setFileState = (id, update) => {
    setQueue((current) =>
      current.map((item) => (item.id === id ? { ...item, ...update } : item))
    );
  };

  const uploadFile = async (item) => {
    const formData = new FormData();
    formData.append('files', item.file);

    setFileState(item.id, { status: 'uploading', progress: 0, error: '' });

    try {
      const response = await axios.post(`${API_BASE_URL}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (!event.total) return;
          const progress = Math.min(99, Math.round((event.loaded * 100) / event.total));
          setFileState(item.id, { progress });
        },
      });

      setFileState(item.id, { status: 'complete', progress: 100 });
      setDocuments((current) => [...response.data.documents, ...current]);
    } catch (err) {
      const message = err.response?.data?.error || 'Upload failed.';
      setFileState(item.id, { status: 'failed', progress: 100, error: message });
      toast.error(`${item.file.name}: ${message}`);
    }
  };

  const handleFiles = (fileList) => {
    const selectedFiles = Array.from(fileList || []);
    if (selectedFiles.length === 0) return;

    const pdfFiles = selectedFiles.filter(
      (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    );
    const rejectedCount = selectedFiles.length - pdfFiles.length;

    if (rejectedCount > 0) {
      toast.error(`${rejectedCount} non-PDF file${rejectedCount > 1 ? 's were' : ' was'} skipped.`);
    }

    if (pdfFiles.length === 0) return;

    const uploadItems = pdfFiles.slice(0, MAX_FILES_PER_BATCH).map((file) => ({
      id: getFileKey(file),
      file,
      progress: 0,
      status: 'pending',
      error: '',
    }));

    if (pdfFiles.length > MAX_FILES_PER_BATCH) {
      toast.info(`Only the first ${MAX_FILES_PER_BATCH} PDFs were queued.`);
    }

    setQueue((current) => [...uploadItems, ...current]);
    uploadItems.forEach(uploadFile);
  };

  const handleInputChange = (event) => {
    handleFiles(event.target.files);
    event.target.value = '';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  return (
    <main className="page-shell">
      <Toaster richColors position="top-right" />

      <header className="page-header">
        <div>
          <p className="eyebrow">Document center</p>
          <h1>PDF uploads</h1>
        </div>
        <button className="secondary-action" type="button" onClick={loadDocuments}>
          Refresh list
        </button>
      </header>

      <section
        className={`dropzone ${isDragging ? 'dropzone-active' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={handleInputChange}
          hidden
        />
        <div className="dropzone-icon">
          <Upload size={28} />
        </div>
        <div>
          <h2>Select or drop PDF files</h2>
          <p>Upload one file or a bulk batch. Each file is tracked individually.</p>
        </div>
      </section>

      <section className="upload-panel" aria-live="polite">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Current batch</p>
            <h2>Upload progress</h2>
          </div>
          {queuedCount > 0 && (
            <span className="count-pill">
              {completedCount}/{queuedCount} complete
            </span>
          )}
        </div>

        {queue.length === 0 ? (
          <div className="empty-state">
            <FileText size={24} />
            <span>No active uploads yet.</span>
          </div>
        ) : (
          <div className="upload-list">
            {queue.map((item) => {
              const StatusIcon = statusMeta[item.status].icon;
              return (
                <article className="upload-item" key={item.id}>
                  <div className="file-icon">
                    <FileText size={22} />
                  </div>
                  <div className="file-main">
                    <div className="file-row">
                      <div>
                        <h3>{item.file.name}</h3>
                        <p>
                          {formatBytes(item.file.size)} · {item.file.type || 'application/pdf'}
                        </p>
                      </div>
                      <span className={`status-badge status-${item.status}`}>
                        <StatusIcon size={16} className={item.status === 'uploading' ? 'spin' : ''} />
                        {statusMeta[item.status].label}
                      </span>
                    </div>
                    <div className="progress-track" aria-label={`${item.file.name} upload progress`}>
                      <div className="progress-fill" style={{ width: `${item.progress}%` }} />
                    </div>
                    <div className="progress-meta">
                      <span>{item.error || `${item.progress}% uploaded`}</span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="documents-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Stored files</p>
            <h2>Document list</h2>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Size</th>
                <th>Type</th>
                <th>Upload date</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingDocs ? (
                <tr>
                  <td colSpan="5" className="table-empty">
                    Loading documents...
                  </td>
                </tr>
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan="5" className="table-empty">
                    No files uploaded yet.
                  </td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr key={doc._id}>
                    <td>
                      <div className="doc-name">
                        <FileText size={18} />
                        <span>{doc.name}</span>
                      </div>
                    </td>
                    <td>{formatBytes(doc.size)}</td>
                    <td>{doc.type || 'application/pdf'}</td>
                    <td>{formatDate(doc.uploadDate)}</td>
                    <td>
                      {doc.downloadUrl ? (
                        <a
                          className="download-link"
                          href={`${API_BASE_URL}${doc.downloadUrl}`}
                          download
                          aria-label={`Download ${doc.name}`}
                        >
                          <Download size={18} />
                        </a>
                      ) : (
                        <span className="download-missing">Unavailable</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="note-row">
        <AlertCircle size={16} />
        <span>PDF only. Maximum 25 MB per file, up to 20 files per batch.</span>
      </div>
    </main>
  );
}
