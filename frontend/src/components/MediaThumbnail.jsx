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

/**
 * Thumbnail dengan lazy loading dan local cache
 */
const MediaThumbnail = ({ file, className }) => {
  const [srcUrl, setSrcUrl] = useState('');
  const [mediaStatus, setMediaStatus] = useState('idle'); // idle | loading | loaded | error
  const [visible, setVisible] = useState(false);
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
      { rootMargin: '150px', threshold: 0.01 }
    );

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isImage, isVideo]);

  // Cek cache saat file terlihat
  useEffect(() => {
    if (!visible) return;

    const resolveMediaUrl = async () => {
      // Coba cari di local cache dulu
      const cached = await mediaCache.get(file);
      if (cached) {
        setSrcUrl(cached);
        setMediaStatus('loaded');
      } else {
        // Jika tidak ada di cache, gunakan URL network normal
        const rawUrl = isImage
          ? filesAPI.getThumbnailUrl(file.path)
          : filesAPI.getStreamUrl(file.path);
        setSrcUrl(rawUrl);
      }
    };

    resolveMediaUrl();
  }, [visible, file, isImage]);

  // Simpan ke cache jika pemuatan dari network berhasil
  const handleImageLoad = () => {
    setMediaStatus('loaded');
    if (srcUrl && !srcUrl.startsWith('blob:')) {
      mediaCache.set(file, srcUrl);
    }
  };

  // Timeout loading video agar tidak stuck di skeleton jika format video tidak disupport browser
  useEffect(() => {
    if (visible && isVideo && mediaStatus === 'loading') {
      const timer = setTimeout(() => {
        setMediaStatus('error');
      }, 3000); // 3 detik timeout
      return () => clearTimeout(timer);
    }
  }, [visible, mediaStatus, isVideo]);

  // ============ VIDEO THUMBNAIL ============
  if (isVideo) {
    const gradient = getVideoColor(file.name);
    return (
      <div
        ref={containerRef}
        className={clsx(
          'relative w-full overflow-hidden bg-dark-900 flex items-center justify-center',
          className
        )}
      >
        {visible && srcUrl && mediaStatus !== 'error' && (
          <video
            src={srcUrl}
            className={clsx(
              'w-full h-full object-cover transition-opacity duration-300',
              mediaStatus === 'loaded' ? 'opacity-100' : 'opacity-0'
            )}
            preload="metadata"
            muted
            playsInline
            onLoadedData={() => setMediaStatus('loaded')}
            onError={() => setMediaStatus('error')}
          />
        )}

        {/* Loading / Placeholder state sebelum termuat */}
        {(mediaStatus === 'loading' || mediaStatus === 'idle') && (
          <div className="absolute inset-0 bg-dark-850 animate-pulse" />
        )}

        {/* Fallback ke gradient jika video error / tidak didukung browser */}
        {mediaStatus === 'error' && (
          <div className={clsx('absolute inset-0 bg-gradient-to-br flex items-center justify-center', gradient)}>
            <Film className="absolute w-12 h-12 text-white/5" />
          </div>
        )}

        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/15">
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center shadow-lg">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>
      </div>
    );
  }

  // ============ IMAGE THUMBNAIL ============
  return (
    <div
      ref={containerRef}
      className={clsx(
        'relative w-full overflow-hidden bg-dark-800',
        className
      )}
    >
      {/* Loading skeleton */}
      {mediaStatus === 'loading' && (
        <div className="absolute inset-0 bg-dark-700 animate-pulse" />
      )}

      {/* Gambar */}
      {visible && srcUrl && mediaStatus !== 'error' && (
        <img
          src={srcUrl}
          alt={file.name}
          className={clsx(
            'w-full h-full object-cover transition-opacity duration-300',
            mediaStatus === 'loaded' ? 'opacity-100' : 'opacity-0'
          )}
          onLoad={handleImageLoad}
          onError={() => setMediaStatus('error')}
        />
      )}

      {/* Error state */}
      {mediaStatus === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center bg-dark-800">
          <ImageOff className="w-8 h-8 text-dark-600" />
        </div>
      )}
    </div>
  );
};

export default MediaThumbnail;
