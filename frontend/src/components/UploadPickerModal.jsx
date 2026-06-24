import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  X, Upload, Film, Trash2, File, FolderOpen, GalleryHorizontal
} from 'lucide-react';
import clsx from 'clsx';

// Format ukuran file untuk display
const formatSize = (bytes) => {
  if (!bytes) return '?';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

// Deteksi apakah file adalah gambar atau video berdasarkan mime type
const isMediaFile = (file) => file.type.startsWith('image/') || file.type.startsWith('video/');
const isImageFile = (file) => file.type.startsWith('image/');
const isVideoFile = (file) => file.type.startsWith('video/');

// Generate object URL thumbnail untuk preview
const useFilePreview = (file) => {
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (!file || !isImageFile(file)) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return previewUrl;
};

// Card untuk satu file di preview list
const FilePreviewCard = ({ file, onRemove }) => {
  const previewUrl = useFilePreview(file);
  const isImg = isImageFile(file);
  const isVid = isVideoFile(file);

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-dark-850 border border-dark-800/50 group">
      {/* Thumbnail / Icon */}
      <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-dark-800 flex items-center justify-center">
        {isImg && previewUrl ? (
          <img src={previewUrl} alt={file.name} className="w-full h-full object-cover" />
        ) : isVid ? (
          <Film className="w-6 h-6 text-blue-400" />
        ) : (
          <File className="w-6 h-6 text-dark-400" />
        )}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-dark-100 text-xs font-semibold truncate">{file.name}</p>
        <p className="text-dark-500 text-[10px] mt-0.5">{formatSize(file.size)}</p>
      </div>

      {/* Remove button */}
      <button
        onClick={() => onRemove(file)}
        className="w-7 h-7 rounded-full flex items-center justify-center text-dark-500 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
        aria-label="Hapus dari daftar"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

/**
 * Modal untuk memilih dan mengupload file dengan tampilan galeri
 */
const UploadPickerModal = ({ onClose, onUpload }) => {
  const [activeTab, setActiveTab] = useState('gallery'); // 'gallery' | 'file'
  const [selectedFiles, setSelectedFiles] = useState([]);
  const galleryInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const addFiles = useCallback((newFiles) => {
    setSelectedFiles(prev => {
      const existingNames = new Set(prev.map(f => f.name + f.size));
      const fresh = Array.from(newFiles).filter(f => !existingNames.has(f.name + f.size));
      return [...prev, ...fresh];
    });
  }, []);

  const removeFile = useCallback((fileToRemove) => {
    setSelectedFiles(prev => prev.filter(f => !(f.name === fileToRemove.name && f.size === fileToRemove.size)));
  }, []);

  const handleGalleryChange = (e) => {
    if (e.target.files?.length) addFiles(e.target.files);
    // Reset input agar bisa pilih file yang sama lagi
    e.target.value = '';
  };

  const handleFileChange = (e) => {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = '';
  };

  const handleUploadClick = () => {
    if (selectedFiles.length === 0) return;
    onUpload(selectedFiles);
    onClose();
  };

  const totalSize = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-dark-900 border border-dark-800 rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden animate-slide-up"
        style={{ maxHeight: '90dvh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
          <div>
            <h2 className="text-dark-50 font-bold text-base flex items-center gap-2">
              <Upload className="w-4 h-4 text-accent-400" />
              Unggah File
            </h2>
            <p className="text-dark-500 text-xs mt-0.5">
              Pilih file dari galeri atau penyimpanan
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-dark-400 hover:bg-dark-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 px-5 pb-3 flex-shrink-0">
          <button
            onClick={() => setActiveTab('gallery')}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all',
              activeTab === 'gallery'
                ? 'bg-accent-500 text-white'
                : 'bg-dark-800 text-dark-400 hover:text-dark-200'
            )}
          >
            <GalleryHorizontal className="w-3.5 h-3.5" />
            Galeri Foto & Video
          </button>
          <button
            onClick={() => setActiveTab('file')}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all',
              activeTab === 'file'
                ? 'bg-accent-500 text-white'
                : 'bg-dark-800 text-dark-400 hover:text-dark-200'
            )}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Semua File
          </button>
        </div>

        {/* Picker Area */}
        <div className="px-5 pb-3 flex-shrink-0">
          {activeTab === 'gallery' ? (
            <label className="flex flex-col items-center justify-center gap-3 w-full py-8 rounded-2xl border-2 border-dashed border-dark-700 hover:border-accent-500/50 bg-dark-850/50 hover:bg-dark-800/50 transition-all cursor-pointer active:scale-98">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500/20 to-violet-500/20 border border-pink-500/20 flex items-center justify-center">
              <GalleryHorizontal className="w-7 h-7 text-pink-400" />
              </div>
              <div className="text-center">
                <p className="text-dark-200 text-sm font-semibold">Buka Galeri Foto & Video</p>
                <p className="text-dark-500 text-xs mt-0.5">Pilih banyak sekaligus</p>
              </div>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={handleGalleryChange}
              />
            </label>
          ) : (
            <label className="flex flex-col items-center justify-center gap-3 w-full py-8 rounded-2xl border-2 border-dashed border-dark-700 hover:border-accent-500/50 bg-dark-850/50 hover:bg-dark-800/50 transition-all cursor-pointer active:scale-98">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/20 flex items-center justify-center">
                <FolderOpen className="w-7 h-7 text-blue-400" />
              </div>
              <div className="text-center">
                <p className="text-dark-200 text-sm font-semibold">Buka Penyimpanan</p>
                <p className="text-dark-500 text-xs mt-0.5">Semua jenis file, pilih banyak</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="*/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          )}
        </div>

        {/* Selected file list */}
        {selectedFiles.length > 0 && (
          <div className="flex-1 overflow-y-auto px-5 pb-2 min-h-0">
            <div className="flex items-center justify-between mb-2">
              <p className="text-dark-400 text-[10px] font-bold uppercase tracking-wider">
                {selectedFiles.length} file dipilih · {formatSize(totalSize)}
              </p>
              <button
                onClick={() => setSelectedFiles([])}
                className="text-[10px] text-red-400 hover:text-red-300 font-semibold flex items-center gap-1"
              >
                <Trash2 className="w-2.5 h-2.5" />
                Hapus Semua
              </button>
            </div>
            <div className="space-y-1.5">
              {selectedFiles.map((file, idx) => (
                <FilePreviewCard
                  key={`${file.name}-${file.size}-${idx}`}
                  file={file}
                  onRemove={removeFile}
                />
              ))}
            </div>
          </div>
        )}

        {/* Footer / Upload button */}
        <div className="px-5 py-4 border-t border-dark-800/40 flex-shrink-0 safe-bottom">
          {selectedFiles.length === 0 ? (
            <p className="text-center text-dark-600 text-xs py-1">
              Pilih file di atas untuk memulai upload
            </p>
          ) : (
            <button
              onClick={handleUploadClick}
              className="w-full btn-primary py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Unggah {selectedFiles.length} File
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UploadPickerModal;
