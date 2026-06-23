import React, { memo } from 'react';
import FileIcon from './FileIcon';
import MediaThumbnail from './MediaThumbnail';
import { MoreVertical } from 'lucide-react';
import clsx from 'clsx';

const isMedia = (type) => type === 'image' || type === 'video';

/**
 * Grid view item (2 kolom, untuk file manager utama)
 */
export const FileGridItem = memo(({ file, onClick, onMenuClick }) => {
  const showThumbnail = isMedia(file.type);

  return (
    <div className="relative group w-full flex flex-col rounded-2xl bg-dark-900 border border-dark-800/40 overflow-hidden active:scale-95 transition-transform duration-100">
      <button
        className="file-item w-full text-left flex flex-col items-center"
        onClick={() => onClick(file)}
        aria-label={file.name}
      >
        {/* Icon atau thumbnail */}
        {showThumbnail ? (
          <MediaThumbnail
            file={file}
            className="w-full aspect-square"
          />
        ) : (
          <div className="w-full aspect-square flex items-center justify-center bg-dark-850">
            <FileIcon type={file.type} size="md" />
          </div>
        )}

        {/* Info */}
        <div className="w-full px-2.5 py-2 text-center">
          <p className="text-dark-100 text-xs font-semibold leading-tight line-clamp-1 w-full">
            {file.name}
          </p>

          <div className="flex items-center justify-center gap-1.5 mt-0.5">
            {file.sizeFormatted && (
              <span className="text-dark-500 text-[10px]">{file.sizeFormatted}</span>
            )}
            {file.isDirectory && (
              <span className="text-yellow-500/70 text-[10px] font-semibold">Folder</span>
            )}
          </div>
        </div>
      </button>

      {/* Option button (three-dots) */}
      <button
        className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform duration-100"
        onClick={(e) => {
          e.stopPropagation();
          onMenuClick(file, e);
        }}
        aria-label="Opsi file"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
    </div>
  );
});

/**
 * List view item (1 kolom, lebih detail)
 */
export const FileListItem = memo(({ file, onClick, onMenuClick }) => {
  const showThumbnail = isMedia(file.type);

  return (
    <div className="flex items-center w-full hover:bg-dark-900/40 transition-colors pr-2 border-b border-dark-800/20">
      <button
        className="file-item-list flex-1 text-left flex items-center gap-3 p-2.5 min-w-0"
        onClick={() => onClick(file)}
        aria-label={file.name}
      >
        {/* Icon/Thumb */}
        {showThumbnail ? (
          <MediaThumbnail
            file={file}
            className="w-10 h-10 rounded-xl flex-shrink-0"
          />
        ) : (
          <FileIcon type={file.type} size="sm" className="!w-10 !h-10 rounded-xl" />
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-dark-100 text-sm font-semibold truncate leading-tight">
            {file.name}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {file.sizeFormatted && (
              <span className="text-dark-500 text-xs">{file.sizeFormatted}</span>
            )}
            {file.modifiedAt && (
              <span className="text-dark-600 text-xs">
                {new Date(file.modifiedAt).toLocaleDateString('id-ID', {
                  day: 'numeric', month: 'short'
                })}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Options button */}
      <button
        className="w-9 h-9 rounded-full flex items-center justify-center text-dark-400 hover:text-white hover:bg-dark-800 active:scale-95 transition-all duration-100 flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          onMenuClick(file, e);
        }}
        aria-label="Opsi file"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
    </div>
  );
});

/**
 * Media Gallery grid item — tampilkan thumbnail + nama file di bawah
 */
export const GalleryGridItem = memo(({ file, onClick, onMenuClick }) => {
  return (
    <div className="relative group w-full flex flex-col rounded-xl overflow-hidden bg-dark-900 border border-dark-800/40">
      <button
        className="relative w-full flex flex-col focus:outline-none"
        onClick={() => onClick(file)}
        aria-label={file.name}
      >
        {/* Thumbnail */}
        <div className="relative w-full aspect-square">
          <MediaThumbnail
            file={file}
            className="absolute inset-0 w-full h-full rounded-none"
          />
        </div>

        {/* Nama file */}
        <div className="w-full px-1.5 py-1.5 pr-8">
          <p className="text-dark-200 text-[11px] font-semibold leading-tight line-clamp-1 text-left">
            {file.name}
          </p>
          {file.sizeFormatted && (
            <p className="text-dark-600 text-[10px] mt-0.5 text-left">{file.sizeFormatted}</p>
          )}
        </div>
      </button>

      {/* Options button */}
      <button
        className="absolute bottom-1 right-1 z-10 w-7 h-7 rounded-full flex items-center justify-center text-dark-400 hover:text-white hover:bg-dark-700/50 active:scale-90 transition-transform duration-100"
        onClick={(e) => {
          e.stopPropagation();
          onMenuClick(file, e);
        }}
        aria-label="Opsi file"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
    </div>
  );
});

FileGridItem.displayName = 'FileGridItem';
FileListItem.displayName = 'FileListItem';
GalleryGridItem.displayName = 'GalleryGridItem';
