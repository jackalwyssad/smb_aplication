import React, { useState, useRef, useEffect } from 'react';
import { filesAPI } from '../utils/api';
import { mediaCache } from '../utils/mediaCache';
import clsx from 'clsx';
import { ImageOff, Play, Film } from 'lucide-react';

// Warna gradient untuk video berdasarkan nama file (deterministik)
const getVideoColor = (name) => {
  const colors = [
    'from-violet-900/80 to-purple-800/60',
    'from-blue-900/80 to-cyan-800/60',
    'from-rose-900/80 to-pink-800/60',
    'from-amber-900/80 to-orange-800/60',
    'from-emerald-900/80 to-teal-800/60',
    'from-indigo-900/80 to-blue-800/60',
    'from-red-900/80 to-rose-800/60',
    'from-fuchsia-900/80 to-violet-800/60',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
};

const SUPPORTED_VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'mov'];

const isSupportedVideo = (filename) => {
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return SUPPORTED_VIDEO_EXTENSIONS.includes(ext);
};

/**
 * Thumbnail dengan lazy loading dan local cache
 */
const MediaThumbnail = ({ file, className, objectFit = 'cover' }) => {
  const [srcUrl, setSrcUrl] = useState('');
  const [mediaStatus, setMediaStatus] = useState('idle'); // idle | loading | loaded | error
  const [visible, setVisible] = useState(false);
  const [isThumbCached, setIsThumbCached] = useState(false);
  const containerRef = useRef(null);

  const isImage = file.type === 'image';
  const isVideo = file.type === 'video';

  // Intersection Observer — lazy load untuk gambar dan video
  useEffect(() => {
    if (!isImage && !isVideo) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          setMediaStatus('loading');
          observer.disconnect();
        }
      },
      { rootMargin: '200px', threshold: 0.01 }
    );

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isImage, isVideo]);

  // Cek cache saat file terlihat
  useEffect(() => {
    if (!visible) return;

    const resolveMediaUrl = async () => {
      // 1. Coba cari di thumbnail cache dulu (baik untuk image maupun video frame)
      const cachedThumb = await mediaCache.getThumbnail(file);
      if (cachedThumb === 'FAILED') {
        setMediaStatus('error');
        return;
      }
      if (cachedThumb) {
        setSrcUrl(cachedThumb);
        setMediaStatus('loaded');
        setIsThumbCached(true);
        return;
      }

      // 2. Jika tidak ada di thumbnail cache, gunakan URL network
      const rawUrl = isImage
        ? filesAPI.getThumbnailUrl(file.path)
        : filesAPI.getStreamUrl(file.path);
      setSrcUrl(rawUrl);
    };

    resolveMediaUrl();
  }, [visible, file, isImage, isVideo]);

  // Simpan gambar ke thumbnail cache jika berhasil dimuat dari network
  const handleImageLoad = async () => {
    setMediaStatus('loaded');
    if (srcUrl && !srcUrl.startsWith('blob:') && isImage) {
      try {
        const response = await fetch(srcUrl);
        if (response.ok) {
          const blob = await response.blob();
          await mediaCache.setThumbnail(file, blob);
        } else {
          await mediaCache.setFailedThumbnail(file);
        }
      } catch (err) {
        console.warn('[MediaThumbnail] Gagal menyimpan thumbnail gambar ke cache:', err);
        await mediaCache.setFailedThumbnail(file);
      }
    }
  };

  const handleImageError = () => {
    setMediaStatus('error');
    if (srcUrl && !srcUrl.startsWith('blob:')) {
      mediaCache.setFailedThumbnail(file);
    }
  };

  // Ekstrak frame video pertama ke canvas dan simpan ke thumbnail cache
  const handleVideoLoad = async (e) => {
    setMediaStatus('loaded');
    if (srcUrl && !srcUrl.startsWith('blob:') && isVideo && !isThumbCached) {
      try {
        const video = e.target;
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(async (blob) => {
            if (blob) {
              await mediaCache.setThumbnail(file, blob);
              const localThumbUrl = await mediaCache.getThumbnail(file);
              if (localThumbUrl) {
                setSrcUrl(localThumbUrl);
                setIsThumbCached(true);
              }
            } else {
              await mediaCache.setFailedThumbnail(file);
            }
          }, 'image/jpeg', 0.6);
        } else {
          await mediaCache.setFailedThumbnail(file);
        }
      } catch (err) {
        console.warn('[MediaThumbnail] Gagal mengekstrak frame video:', err);
        await mediaCache.setFailedThumbnail(file);
      }
    }
  };

  const handleVideoError = () => {
    setMediaStatus('error');
    if (srcUrl && !srcUrl.startsWith('blob:')) {
      mediaCache.setFailedThumbnail(file);
    }
  };

  // Timeout loading video agar tidak stuck di skeleton jika format video tidak disupport browser
  useEffect(() => {
    if (visible && isVideo && mediaStatus === 'loading' && !isThumbCached) {
      const timer = setTimeout(() => {
        setMediaStatus('error');
        mediaCache.setFailedThumbnail(file);
      }, 5000); // 5 detik timeout
      return () => clearTimeout(timer);
    }
  }, [visible, mediaStatus, isVideo, isThumbCached]);

  // ============ RENDER LOGIC ============
  const gradient = isVideo ? getVideoColor(file.name) : '';

  return (
    <div
      ref={containerRef}
      className={clsx(
        'relative w-full overflow-hidden bg-dark-900 flex items-center justify-center',
        className
      )}
    >
      {/* Loading / Placeholder state sebelum termuat */}
      {(mediaStatus === 'loading' || mediaStatus === 'idle') && (
        <div className="absolute inset-0 bg-dark-850 animate-pulse" />
      )}

      {/* Render Gambar (untuk image asli, atau video yang sudah memiliki cached image thumbnail) */}
      {visible && srcUrl && mediaStatus !== 'error' && (isImage || isThumbCached) && (
        <img
          src={srcUrl}
          alt={file.name}
          className={clsx(
            'w-full h-full transition-opacity duration-300',
            objectFit === 'contain' ? 'object-contain' : 'object-cover',
            mediaStatus === 'loaded' ? 'opacity-100' : 'opacity-0'
          )}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      )}

      {/* Render Video Player mini (hanya jika video belum di-cache thumbnail-nya) */}
      {visible && srcUrl && mediaStatus !== 'error' && isVideo && !isThumbCached && (
        <video
          src={srcUrl}
          className={clsx(
            'w-full h-full transition-opacity duration-300',
            objectFit === 'contain' ? 'object-contain' : 'object-cover',
            mediaStatus === 'loaded' ? 'opacity-100' : 'opacity-0'
          )}
          preload="metadata"
          muted
          playsInline
          onLoadedData={handleVideoLoad}
          onError={handleVideoError}
        />
      )}

      {/* Fallback ke gradient jika video error / tidak didukung browser */}
      {mediaStatus === 'error' && (
        isVideo ? (
          <div className={clsx('absolute inset-0 bg-gradient-to-br flex items-center justify-center', gradient)}>
            <Film className="absolute w-12 h-12 text-white/5" />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-800">
            <ImageOff className="w-8 h-8 text-dark-600" />
          </div>
        )
      )}

      {/* Play button overlay jika ini adalah video (baik sedang dimuat sebagai video atau gambar cached) */}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/15">
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center shadow-lg">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaThumbnail;
