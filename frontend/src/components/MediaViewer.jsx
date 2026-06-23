import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Download, ZoomIn, RotateCcw, Film } from 'lucide-react';
import { useSwipeable } from 'react-swipeable';
import { filesAPI } from '../utils/api';
import { mediaCache } from '../utils/mediaCache';
import LoadingSpinner from './LoadingSpinner';
import clsx from 'clsx';

const SUPPORTED_VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'mov'];

const isSupportedVideo = (filename) => {
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return SUPPORTED_VIDEO_EXTENSIONS.includes(ext);
};

const MediaViewer = ({ files, initialIndex = 0, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isLoading, setIsLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [srcUrl, setSrcUrl] = useState('');
  const controlsTimerRef = useRef(null);
  const videoRef = useRef(null);

  const currentFile = files[currentIndex];
  const isVideo = currentFile?.type === 'video';
  const isImage = currentFile?.type === 'image';

  // Auto-hide controls after 3 seconds
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    if (isVideo) {
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [isVideo]);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [currentIndex, resetControlsTimer]);

  // Resolve media URL (cache vs network) & background caching
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setImageError(false);
    setSrcUrl('');

    const resolveMedia = async () => {
      if (!currentFile) return;

      // Cegah network stream untuk format video yang tidak didukung browser
      if (currentFile.type === 'video' && !isSupportedVideo(currentFile.name)) {
        if (active) {
          setIsLoading(false);
          setImageError(true);
        }
        return;
      }

      // Coba cari di local cache dulu
      const cached = await mediaCache.get(currentFile);
      if (!active) return;

      if (cached) {
        setSrcUrl(cached);
        setIsLoading(false);
      } else {
        const streamUrl = filesAPI.getStreamUrl(currentFile.path);
        setSrcUrl(streamUrl);

        // Jika ini gambar, unduh dan simpan ke cache secara sinkron untuk kemudahan
        if (currentFile.type === 'image') {
          try {
            await mediaCache.set(currentFile, streamUrl);
            const newCached = await mediaCache.get(currentFile);
            if (active && newCached) {
              setSrcUrl(newCached);
            }
          } catch (_) {}
        }

        // Jika ini video dan ukurannya di bawah 150MB, cache di background agar pemutaran selanjutnya instan
        if (currentFile.type === 'video' && currentFile.size && currentFile.size < 150 * 1024 * 1024) {
          mediaCache.set(currentFile, streamUrl).catch((err) => {
            console.warn('Gagal men-cache video di background:', err);
          });
        }
      }
    };

    resolveMedia();

    return () => {
      active = false;
    };
  }, [currentIndex, currentFile]);

  // Timeout loading state agar tidak stuck berputar selamanya jika video/gambar tidak didukung
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        setIsLoading(false);
        setImageError(true);
      }, 5000); // 5 detik timeout
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentIndex]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
      setIsLoading(true);
      setImageError(false);
    }
  }, [currentIndex]);

  const goToNext = useCallback(() => {
    if (currentIndex < files.length - 1) {
      setCurrentIndex(i => i + 1);
      setIsLoading(true);
      setImageError(false);
    }
  }, [currentIndex, files.length]);

  // Swipe handlers
  const swipeHandlers = useSwipeable({
    onSwipedLeft: goToNext,
    onSwipedRight: goToPrev,
    trackMouse: false,
    trackTouch: true,
    delta: 50,
    preventScrollOnSwipe: true,
  });

  const handleMediaClick = (e) => {
    e.stopPropagation();
    resetControlsTimer();
  };

  const handleDownload = () => {
    const url = filesAPI.getDownloadUrl(currentFile.path);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFile.name;
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      onClick={resetControlsTimer}
    >
      {/* Tombol X — selalu visible, tidak ikut auto-hide */}
      <button
        onClick={onClose}
        className="absolute top-4 left-4 z-20 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors touch-manipulation safe-top"
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
        aria-label="Tutup"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Top Bar (file info + download) — auto-hide untuk video */}
      <div className={clsx(
        'absolute top-0 left-0 right-0 z-10 transition-all duration-300',
        'safe-top',
        (showControls || isImage) ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full'
      )}>
        <div className="flex items-center justify-between px-4 py-3 pl-16">
          {/* File info */}
          <div className="flex-1 text-center px-2">
            <p className="text-white font-medium text-sm truncate leading-tight drop-shadow">{currentFile?.name}</p>
            <p className="text-white/60 text-xs drop-shadow">{currentIndex + 1} / {files.length}</p>
          </div>

          {/* Download button */}
          <button
            onClick={handleDownload}
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors touch-manipulation"
            aria-label="Download"
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Media Area */}
      <div
        className="flex-1 flex items-center justify-center relative"
        {...swipeHandlers}
        onClick={handleMediaClick}
      >
        {/* Loading */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <LoadingSpinner size="lg" text="Memuat..." />
          </div>
        )}

        {/* Image */}
        {isImage && !imageError && srcUrl && (
          <img
            key={currentFile.path}
            src={srcUrl}
            alt={currentFile.name}
            className={clsx(
              'max-w-full max-h-full object-contain select-none',
              'transition-opacity duration-200',
              isLoading ? 'opacity-0' : 'opacity-100'
            )}
            onLoad={() => setIsLoading(false)}
            onError={() => { setIsLoading(false); setImageError(true); }}
            draggable={false}
          />
        )}

        {/* Image error fallback */}
        {isImage && imageError && (
          <div className="flex flex-col items-center gap-4 text-dark-400">
            <ZoomIn className="w-16 h-16" />
            <p className="text-sm">Tidak bisa memuat gambar</p>
            <button
              onClick={() => { setImageError(false); setIsLoading(true); }}
              className="btn-ghost text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              Coba lagi
            </button>
          </div>
        )}

        {/* Video */}
        {isVideo && srcUrl && !imageError && (
          <video
            key={currentFile.path}
            ref={videoRef}
            src={srcUrl}
            className={clsx(
              'max-w-full max-h-full',
              isLoading ? 'opacity-0' : 'opacity-100',
              'transition-opacity duration-200'
            )}
            controls
            playsInline
            preload="metadata"
            onLoadedData={() => setIsLoading(false)}
            onCanPlay={() => setIsLoading(false)}
            onError={() => { setIsLoading(false); setImageError(true); }}
            onClick={(e) => e.stopPropagation()}
            style={{
              // Tidak paksa landscape
              maxHeight: 'calc(100dvh - 120px)',
            }}
          >
            Browser Anda tidak mendukung video HTML5.
          </video>
        )}

        {/* Video error fallback */}
        {isVideo && imageError && (
          <div className="flex flex-col items-center gap-4 text-dark-400 p-6 text-center max-w-xs animate-scale-in">
            <Film className="w-14 h-14 text-dark-500 animate-pulse" />
            <p className="text-sm font-semibold">Format Video Tidak Didukung</p>
            <p className="text-xs text-dark-600 leading-relaxed">
              Browser tidak dapat memutar video ini langsung (format mpeg/mkv/avi memerlukan media player eksternal).
            </p>
            <button
              onClick={handleDownload}
              className="btn-primary text-xs px-4 py-2 mt-2"
            >
              <Download className="w-4 h-4" />
              Download & Putar Lokal
            </button>
          </div>
        )}
      </div>

      {/* Navigation Arrows - tampil di tengah kiri/kanan */}
      <div className={clsx(
        'absolute inset-y-0 left-0 right-0 flex items-center justify-between px-2 pointer-events-none z-10',
        'transition-opacity duration-300',
        showControls ? 'opacity-100' : 'opacity-0'
      )}>
        <button
          onClick={(e) => { e.stopPropagation(); goToPrev(); }}
          disabled={currentIndex === 0}
          className={clsx(
            'w-11 h-11 rounded-full glass-dark flex items-center justify-center pointer-events-auto',
            'transition-all duration-150 touch-manipulation',
            'disabled:opacity-30 disabled:cursor-not-allowed',
            'active:scale-90 text-white'
          )}
          aria-label="Sebelumnya"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); goToNext(); }}
          disabled={currentIndex === files.length - 1}
          className={clsx(
            'w-11 h-11 rounded-full glass-dark flex items-center justify-center pointer-events-auto',
            'transition-all duration-150 touch-manipulation',
            'disabled:opacity-30 disabled:cursor-not-allowed',
            'active:scale-90 text-white'
          )}
          aria-label="Berikutnya"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Bottom dot indicators */}
      {files.length > 1 && files.length <= 20 && (
        <div className={clsx(
          'absolute bottom-8 left-0 right-0 flex items-center justify-center gap-1.5 z-10',
          'transition-opacity duration-300 safe-bottom',
          showControls ? 'opacity-100' : 'opacity-0'
        )}>
          {files.map((_, idx) => (
            <button
              key={idx}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); setIsLoading(true); setImageError(false); }}
              className={clsx(
                'rounded-full transition-all duration-200 touch-manipulation',
                idx === currentIndex
                  ? 'w-5 h-2 bg-accent-500'
                  : 'w-2 h-2 bg-white/30 hover:bg-white/50'
              )}
              aria-label={`Go to item ${idx + 1}`}
            />
          ))}
        </div>
      )}

      {/* Swipe hint untuk jumlah file banyak */}
      {files.length > 20 && (
        <div className={clsx(
          'absolute bottom-6 left-0 right-0 text-center z-10',
          'transition-opacity duration-300',
          showControls ? 'opacity-100' : 'opacity-0'
        )}>
          <span className="text-white/40 text-xs">
            {currentIndex + 1} / {files.length} — Swipe untuk navigasi
          </span>
        </div>
      )}
    </div>
  );
};

export default MediaViewer;
