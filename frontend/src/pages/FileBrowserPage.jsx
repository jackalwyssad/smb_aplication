import React, { useState, useCallback, useEffect } from 'react';
import {
  ArrowLeft, LogOut, RefreshCw, Grid2X2, List,
  LayoutGrid, AlertCircle, FolderOpen, Server,
  Plus, Upload, FolderPlus, X, Edit, Trash2, Download, CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { filesAPI } from '../utils/api';
import { folderCache } from '../utils/folderCache';
import { mediaCache } from '../utils/mediaCache';
import Breadcrumb from '../components/Breadcrumb';
import LoadingSpinner from '../components/LoadingSpinner';
import MediaViewer from '../components/MediaViewer';
import FileIcon from '../components/FileIcon';
import UploadPickerModal from '../components/UploadPickerModal';
import { FileGridItem, FileListItem, GalleryGridItem } from '../components/FileItem';
import clsx from 'clsx';

// Utilitas untuk membandingkan isi list folder guna mencegah re-render & re-loading flash di HP
const areFilesEqual = (arr1, arr2) => {
  if (!arr1 || !arr2) return false;
  if (arr1.length !== arr2.length) return false;
  
  for (let i = 0; i < arr1.length; i++) {
    const f1 = arr1[i];
    const f2 = arr2[i];
    if (
      f1.name !== f2.name ||
      f1.type !== f2.type ||
      f1.isDirectory !== f2.isDirectory ||
      f1.size !== f2.size ||
      f1.modifiedAt !== f2.modifiedAt ||
      f1.path !== f2.path
    ) {
      return false;
    }
  }
  return true;
};

const getMediaFiles = (files) =>
  files.filter(f => f.type === 'image' || f.type === 'video');

const FileBrowserPage = () => {
  const { user, logout } = useAuth();

  // State File Manager
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list' | 'gallery'
  const [history, setHistory] = useState(['/']); // riwayat navigasi
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  // State CRUD Modals & Menus
  const [activeFile, setActiveFile] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newName, setNewName] = useState('');

  // Upload State
  const [uploadQueue, setUploadQueue] = useState([]); // array of File objects
  const [uploadingFile, setUploadingFile] = useState('');  // current file name
  const [uploadProgress, setUploadProgress] = useState(0); // current file %
  const [uploadCurrent, setUploadCurrent] = useState(0);   // index in queue
  const [uploadTotal, setUploadTotal] = useState(0);       // total in queue
  const [uploadDone, setUploadDone] = useState(false);     // all done flag
  const [showUploadPicker, setShowUploadPicker] = useState(false);

  // Media viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Logout confirm
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const mediaFiles = getMediaFiles(files);
  const hasMedia = mediaFiles.length > 0;
  const isGalleryMode = viewMode === 'gallery' && hasMedia;

  // ============
  // LOAD FILES
  // ============
  const loadFiles = useCallback(async (path, forceRefresh = false) => {
    setError('');
    
    // Coba ambil dari local cache terlebih dahulu
    const cachedFiles = folderCache.get(path);
    if (cachedFiles && !forceRefresh) {
      setFiles(cachedFiles);
      setIsLoading(false);
      
      // Auto-switch view mode dari cache
      const nonFolderFiles = cachedFiles.filter(f => !f.isDirectory);
      const mediaCount = nonFolderFiles.filter(f => f.type === 'image' || f.type === 'video').length;
      if (nonFolderFiles.length > 0 && mediaCount === nonFolderFiles.length && mediaCount > 0) {
        setViewMode('gallery');
      } else {
        setViewMode(prev => prev === 'gallery' ? 'grid' : prev);
      }

      // Pre-cache folder thumbnails in background
      mediaCache.preCacheFolder(cachedFiles);
    } else {
      setIsLoading(true);
    }

    try {
      const response = await filesAPI.list(path);
      const freshFiles = response.data.files || [];
      
      // HP Optimization: Jika data cache dan server sama persis, lewati setFiles
      // Cara ini mencegah reload/flash gambar dan video di layar HP
      if (!forceRefresh && cachedFiles && areFilesEqual(cachedFiles, freshFiles)) {
        setIsOfflineMode(false);
        setIsLoading(false);
        // Tetap jalankan pre-cache di background untuk mengantisipasi ada thumbnail baru yang belum lengkap
        mediaCache.preCacheFolder(freshFiles);
        return;
      }

      setFiles(freshFiles);
      setIsOfflineMode(false);
      
      // Simpan listing folder terbaru ke cache
      folderCache.set(path, freshFiles);

      // Auto-switch view mode berdasarkan data fresh
      const nonFolderFiles = freshFiles.filter(f => !f.isDirectory);
      const mediaCount = nonFolderFiles.filter(f => f.type === 'image' || f.type === 'video').length;
      if (nonFolderFiles.length > 0 && mediaCount === nonFolderFiles.length && mediaCount > 0) {
        setViewMode('gallery');
      } else {
        setViewMode(prev => prev === 'gallery' ? 'grid' : prev);
      }

      // Pre-cache folder thumbnails in background
      mediaCache.preCacheFolder(freshFiles);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Gagal memuat isi folder';
      if (cachedFiles) {
        setIsOfflineMode(true);
      } else {
        setError(errorMsg);
        setFiles([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles(currentPath);
  }, [currentPath, loadFiles]);

  // ============
  // NAVIGATION
  // ============
  const navigateTo = useCallback((path) => {
    setCurrentPath(path);
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(path);
      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
  }, [historyIndex]);

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setCurrentPath(history[newIndex]);
    }
  }, [history, historyIndex]);

  const canGoBack = historyIndex > 0;

  // ============
  // FILE CLICK
  // ============
  const handleFileClick = useCallback((file) => {
    if (file.isDirectory) {
      navigateTo(file.path);
    } else if (file.type === 'image' || file.type === 'video') {
      const idx = mediaFiles.findIndex(f => f.path === file.path);
      setViewerIndex(idx >= 0 ? idx : 0);
      setViewerOpen(true);
    } else {
      // Default: Unduh file
      const url = filesAPI.getDownloadUrl(file.path);
      window.open(url, '_blank');
    }
  }, [navigateTo, mediaFiles]);

  // Open Options Menu Bottom Sheet
  const handleMenuClick = useCallback((file, e) => {
    setActiveFile(file);
    setShowMenu(true);
  }, []);

  // Download File
  const handleDownloadFile = useCallback((file) => {
    const url = filesAPI.getDownloadUrl(file.path);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
  }, []);

  // ============
  // CRUD HANDLERS
  // ============
  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      setShowCreateFolder(false);
      setIsLoading(true);
      await filesAPI.mkdir(currentPath, newFolderName.trim());
      setNewFolderName('');
      await loadFiles(currentPath, true);
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal membuat folder');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRename = async (e) => {
    e.preventDefault();
    if (!newName.trim() || newName.trim() === activeFile.name) return;
    try {
      setShowRename(false);
      setIsLoading(true);
      await filesAPI.rename(activeFile.path, newName.trim());
      setNewName('');
      await loadFiles(currentPath, true);
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal mengubah nama');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      setShowDeleteConfirm(false);
      setIsLoading(true);
      await filesAPI.delete(activeFile.path);
      await loadFiles(currentPath, true);
    } catch (err) {
      alert(err.response?.data?.error || 'Gagal menghapus');
    } finally {
      setIsLoading(false);
    }
  };

  // Memulai upload antrian file secara sequential
  const handleStartUpload = useCallback(async (filesToUpload) => {
    if (!filesToUpload || filesToUpload.length === 0) return;

    const total = filesToUpload.length;
    setUploadTotal(total);
    setUploadCurrent(0);
    setUploadDone(false);
    setShowFabMenu(false);

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      setUploadingFile(file.name);
      setUploadProgress(0);
      setUploadCurrent(i + 1);

      try {
        await filesAPI.upload(currentPath, file, (progressEvent) => {
          if (progressEvent.total) {
            const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(pct);
          }
        });
      } catch (err) {
        // Tampilkan error tapi lanjutkan upload file berikutnya
        console.error('[UPLOAD] Gagal upload file:', file.name, err.message);
      }
    }

    // Semua selesai
    setUploadingFile('');
    setUploadDone(true);
    setTimeout(() => setUploadDone(false), 2500);
    await loadFiles(currentPath, true);
  }, [currentPath, loadFiles]);

  const handleLogout = async () => {
    folderCache.clear();
    await logout();
  };

  return (
    <div className="flex flex-col min-h-dvh bg-dark-950 text-dark-100">
      {/* Top AppBar - Minimal Flat Design */}
      <header className="bg-dark-900 border-b border-dark-800/40 sticky top-0 z-30 safe-top">
        <div className="flex items-center gap-2 px-3 py-2">
          {/* Back button */}
          <button
            onClick={goBack}
            disabled={!canGoBack}
            className={clsx(
              'btn-icon flex-shrink-0 !w-8 !h-8',
              !canGoBack && 'opacity-20 cursor-not-allowed'
            )}
            aria-label="Kembali"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Breadcrumb - scrollable */}
          <div className="flex-1 min-w-0">
            <Breadcrumb path={currentPath} onNavigate={navigateTo} />
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-0.5 bg-dark-950 p-0.5 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={clsx('btn-icon !w-7 !h-7 !rounded-md', viewMode === 'grid' && 'text-accent-400 bg-dark-900')}
              aria-label="Grid"
            >
              <Grid2X2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={clsx('btn-icon !w-7 !h-7 !rounded-md', viewMode === 'list' && 'text-accent-400 bg-dark-900')}
              aria-label="List"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            {hasMedia && (
              <button
                onClick={() => setViewMode('gallery')}
                className={clsx('btn-icon !w-7 !h-7 !rounded-md', viewMode === 'gallery' && 'text-accent-400 bg-dark-900')}
                aria-label="Gallery"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Refresh */}
          <button
            onClick={() => loadFiles(currentPath, true)}
            disabled={isLoading}
            className="btn-icon flex-shrink-0 !w-8 !h-8"
            aria-label="Refresh"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', isLoading && 'animate-spin')} />
          </button>

          {/* Logout */}
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="btn-icon flex-shrink-0 !w-8 !h-8 text-red-500 hover:bg-red-500/10"
            aria-label="Logout"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* User info strip & Offline mode indicator */}
        <div className="flex items-center justify-between px-3.5 pb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Server className="w-3 h-3 text-dark-500 flex-shrink-0" />
            <span className="text-dark-500 text-[10px] font-medium truncate">
              {user?.host}\{user?.share}
            </span>
          </div>
          {isOfflineMode && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold animate-pulse flex-shrink-0">
              Offline (Cache)
            </span>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-20">
        {/* Loading State */}
        {isLoading && files.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner size="lg" text="Memuat folder..." />
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="flex flex-col items-center justify-center py-16 px-6 gap-3 animate-fade-in">
            <AlertCircle className="w-10 h-10 text-red-500" />
            <div className="text-center">
              <p className="text-dark-200 text-sm font-semibold mb-0.5">Gagal Memuat Folder</p>
              <p className="text-dark-500 text-xs whitespace-pre-line">{error}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full max-w-[240px] mt-2">
              <button
                onClick={() => loadFiles(currentPath, true)}
                className="btn-primary text-xs py-2 w-full"
              >
                Coba Lagi
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-dark-900 border border-dark-800 text-dark-400 hover:text-white active:scale-95 transition-all text-xs font-semibold"
              >
                Ganti Server
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && files.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-6 gap-3 animate-fade-in">
            <FolderOpen className="w-10 h-10 text-dark-600" />
            <div className="text-center">
              <p className="text-dark-400 text-sm font-semibold">Folder Kosong</p>
              <p className="text-dark-600 text-xs mt-0.5">Ketuk tombol (+) untuk membuat folder atau unggah file</p>
            </div>
          </div>
        )}

        {/* File List */}
        {!error && files.length > 0 && (
          <div className="animate-fade-in">
            {/* Gallery Mode - media only grid 3 col */}
            {isGalleryMode && (
              <div className="px-3 pt-3">
                {/* Show folders first in gallery mode */}
                {files.filter(f => f.isDirectory).length > 0 && (
                  <div className="mb-4">
                    <p className="text-dark-500 text-[10px] font-bold uppercase tracking-wider px-1 mb-1.5">Folder</p>
                    <div className="rounded-xl overflow-hidden border border-dark-800/30 bg-dark-900/20">
                      {files.filter(f => f.isDirectory).map((file) => (
                        <FileListItem key={file.path} file={file} onClick={handleFileClick} onMenuClick={handleMenuClick} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Media grid */}
                {mediaFiles.length > 0 && (
                  <div>
                    <p className="text-dark-500 text-[10px] font-bold uppercase tracking-wider px-1 mb-1.5">
                      Media · {mediaFiles.length} item
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {mediaFiles.map((file, idx) => (
                        <GalleryGridItem
                          key={file.path}
                          file={file}
                          onClick={() => {
                            setViewerIndex(idx);
                            setViewerOpen(true);
                          }}
                          onMenuClick={handleMenuClick}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Grid Mode - 2 columns */}
            {viewMode === 'grid' && !isGalleryMode && (
              <div className="grid grid-cols-2 gap-2.5 p-3">
                {files.map((file) => (
                  <FileGridItem key={file.path} file={file} onClick={handleFileClick} onMenuClick={handleMenuClick} />
                ))}
              </div>
            )}

            {/* List Mode */}
            {viewMode === 'list' && (
              <div className="divide-y divide-dark-900 bg-dark-950">
                {files.map((file) => (
                  <FileListItem key={file.path} file={file} onClick={handleFileClick} onMenuClick={handleMenuClick} />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Uploading progress notification */}
      {uploadingFile && (
        <div className="fixed bottom-24 left-4 right-4 z-40 max-w-sm mx-auto p-3.5 rounded-2xl bg-dark-900 border border-dark-800 shadow-2xl flex items-center gap-3 animate-slide-up">
          <LoadingSpinner size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-dark-100 text-xs font-semibold truncate">
              {uploadTotal > 1 ? `File ${uploadCurrent}/${uploadTotal}: ` : 'Mengunggah: '}
              {uploadingFile}
            </p>
            <div className="w-full bg-dark-800 rounded-full h-1 mt-1.5 overflow-hidden">
              <div className="bg-accent-500 h-1 rounded-full transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
            </div>
          </div>
          <span className="text-dark-400 text-[10px] font-bold">{uploadProgress}%</span>
        </div>
      )}

      {/* Upload done notification */}
      {uploadDone && !uploadingFile && (
        <div className="fixed bottom-24 left-4 right-4 z-40 max-w-sm mx-auto p-3.5 rounded-2xl bg-emerald-900/80 border border-emerald-700/50 shadow-2xl flex items-center gap-3 animate-slide-up">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <p className="text-emerald-100 text-xs font-semibold">
            {uploadTotal > 1 ? `${uploadTotal} file berhasil diunggah!` : 'File berhasil diunggah!'}
          </p>
        </div>
      )}

      {/* Floating Action Button (FAB) + menu */}
      <div className="fixed bottom-6 right-6 z-35 flex flex-col items-end gap-3 safe-bottom">
        {showFabMenu && (
          <div className="flex flex-col gap-2 animate-scale-in items-end">
            {/* Create Folder button */}
            <button
              onClick={() => {
                setShowFabMenu(false);
                setNewFolderName('');
                setShowCreateFolder(true);
              }}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-dark-900 border border-dark-800 text-dark-100 font-semibold text-xs shadow-2xl active:scale-95 transition-transform"
            >
              <FolderPlus className="w-4 h-4 text-yellow-400" />
              <span>Buat Folder</span>
            </button>

            {/* Upload File button */}
            <button
              onClick={() => {
                setShowFabMenu(false);
                setShowUploadPicker(true);
              }}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-dark-900 border border-dark-800 text-dark-100 font-semibold text-xs shadow-2xl active:scale-95 transition-transform"
            >
              <Upload className="w-4 h-4 text-blue-400" />
              <span>Unggah File</span>
            </button>
          </div>
        )}

        {/* Main FAB button */}
        <button
          onClick={() => setShowFabMenu(v => !v)}
          className={clsx(
            "w-12 h-12 rounded-full bg-accent-500 text-white flex items-center justify-center shadow-2xl active:scale-90 transition-all duration-150",
            showFabMenu ? "rotate-45 bg-dark-800 border border-dark-700" : ""
          )}
          aria-label="Tambah"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* File Options Bottom Sheet (untuk mobile & tablet) */}
      {showMenu && activeFile && (
        <div className="fixed inset-0 z-40 bg-black/60 flex items-end justify-center animate-fade-in" onClick={() => setShowMenu(false)}>
          <div className="card w-full max-w-md p-5 rounded-t-3xl rounded-b-none border-t border-dark-800 animate-slide-up bg-dark-900 pb-safe" onClick={(e) => e.stopPropagation()}>
            {/* Header info */}
            <div className="flex items-center gap-3 pb-3 mb-3 border-b border-dark-800/40">
              <div className="p-2 rounded-lg bg-dark-800 text-dark-200">
                {activeFile.isDirectory ? (
                  <FolderOpen className="w-5 h-5 text-yellow-400" />
                ) : (
                  <FileIcon type={activeFile.type} size="sm" className="!w-6 !h-6" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-dark-100 font-bold text-sm truncate">{activeFile.name}</p>
                <p className="text-dark-500 text-[10px]">
                  {activeFile.isDirectory ? 'Folder' : activeFile.sizeFormatted}
                </p>
              </div>
              <button onClick={() => setShowMenu(false)} className="btn-icon !w-8 !h-8">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Options List */}
            <div className="space-y-0.5">
              {!activeFile.isDirectory && (
                <button
                  onClick={() => {
                    setShowMenu(false);
                    handleDownloadFile(activeFile);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-xl text-dark-200 hover:bg-dark-850 active:bg-dark-800 transition-colors"
                >
                  <Download className="w-4 h-4 text-accent-400" />
                  <span className="font-semibold text-xs">Download File</span>
                </button>
              )}
              <button
                onClick={() => {
                  setShowMenu(false);
                  setNewName(activeFile.name);
                  setShowRename(true);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-xl text-dark-200 hover:bg-dark-850 active:bg-dark-800 transition-colors"
              >
                <Edit className="w-4 h-4 text-blue-400" />
                <span className="font-semibold text-xs">Ubah Nama (Rename)</span>
              </button>
              <button
                onClick={() => {
                  setShowMenu(false);
                  setShowDeleteConfirm(true);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-xl text-red-450 hover:bg-red-500/10 active:bg-red-500/15 transition-colors"
              >
                <Trash2 className="w-4 h-4 text-red-400" />
                <span className="font-semibold text-xs">Hapus</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in" onClick={() => setShowCreateFolder(false)}>
          <div className="card w-full max-w-xs p-5 animate-scale-in bg-dark-900 border border-dark-800" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-dark-50 font-bold text-sm mb-3 flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-yellow-400" />
              <span>Buat Folder Baru</span>
            </h3>
            <form onSubmit={handleCreateFolder}>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Nama folder..."
                className="input-field mb-4 text-xs py-2 px-3 rounded-lg"
                autoFocus
                required
              />
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCreateFolder(false)}
                  className="flex-1 btn-ghost border border-dark-700 text-xs py-2 rounded-lg font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 btn-primary text-xs py-2 rounded-lg font-semibold"
                >
                  Buat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in" onClick={() => setShowRename(false)}>
          <div className="card w-full max-w-xs p-5 animate-scale-in bg-dark-900 border border-dark-800" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-dark-50 font-bold text-sm mb-3 flex items-center gap-2">
              <Edit className="w-4 h-4 text-blue-400" />
              <span>Ubah Nama</span>
            </h3>
            <form onSubmit={handleRename}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nama baru..."
                className="input-field mb-4 text-xs py-2 px-3 rounded-lg"
                autoFocus
                required
              />
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowRename(false)}
                  className="flex-1 btn-ghost border border-dark-700 text-xs py-2 rounded-lg font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 btn-primary text-xs py-2 rounded-lg font-semibold"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && activeFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in" onClick={() => setShowDeleteConfirm(false)}>
          <div className="card w-full max-w-xs p-5 animate-scale-in bg-dark-900 border border-dark-800" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-dark-50 font-bold text-sm mb-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span>Hapus Item?</span>
            </h3>
            <p className="text-dark-400 text-xs mb-5 leading-relaxed">
              Apakah Anda yakin ingin menghapus <strong>{activeFile.name}</strong>? Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 btn-ghost border border-dark-700 text-xs py-2 rounded-lg font-semibold"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 btn-primary bg-red-600 hover:bg-red-700 border-red-700 text-xs py-2 rounded-lg font-semibold"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Media Viewer */}
      {viewerOpen && mediaFiles.length > 0 && (
        <MediaViewer
          files={mediaFiles}
          initialIndex={viewerIndex}
          onClose={() => setViewerOpen(false)}
        />
      )}

      {/* Upload Picker Modal */}
      {showUploadPicker && (
        <UploadPickerModal
          onClose={() => setShowUploadPicker(false)}
          onUpload={handleStartUpload}
        />
      )}

      {/* Logout Confirmation */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 animate-fade-in" onClick={() => setShowLogoutConfirm(false)}>
          <div className="card w-full max-w-xs p-5 animate-slide-up bg-dark-900 border-t border-dark-800" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-dark-50 font-bold text-sm mb-1">Keluar?</h3>
            <p className="text-dark-400 text-xs mb-5">
              Sesi Anda akan berakhir dan Anda perlu login kembali.
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 btn-ghost border border-dark-700 text-xs py-2 rounded-lg font-semibold"
              >
                Batal
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 btn-primary bg-red-650 hover:bg-red-700 border-red-700 text-xs py-2 rounded-lg font-semibold"
              >
                <LogOut className="w-3.5 h-3.5" />
                Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileBrowserPage;
