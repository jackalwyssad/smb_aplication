import React from 'react';
import {
  Folder, Image, Video, Music, FileText, File,
  Archive, Code2, Smartphone, FolderOpen
} from 'lucide-react';
import clsx from 'clsx';

const iconConfig = {
  folder: {
    Icon: Folder,
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10',
    label: 'Folder',
  },
  image: {
    Icon: Image,
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
    label: 'Foto',
  },
  video: {
    Icon: Video,
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
    label: 'Video',
  },
  audio: {
    Icon: Music,
    color: 'text-purple-400',
    bg: 'bg-purple-400/10',
    label: 'Audio',
  },
  document: {
    Icon: FileText,
    color: 'text-orange-400',
    bg: 'bg-orange-400/10',
    label: 'Dokumen',
  },
  archive: {
    Icon: Archive,
    color: 'text-pink-400',
    bg: 'bg-pink-400/10',
    label: 'Arsip',
  },
  code: {
    Icon: Code2,
    color: 'text-cyan-400',
    bg: 'bg-cyan-400/10',
    label: 'Kode',
  },
  apk: {
    Icon: Smartphone,
    color: 'text-green-400',
    bg: 'bg-green-400/10',
    label: 'APK',
  },
  file: {
    Icon: File,
    color: 'text-dark-300',
    bg: 'bg-dark-300/10',
    label: 'File',
  },
};

const sizeMap = {
  sm: { icon: 'w-5 h-5', container: 'w-10 h-10' },
  md: { icon: 'w-7 h-7', container: 'w-14 h-14' },
  lg: { icon: 'w-9 h-9', container: 'w-18 h-18' },
};

const FileIcon = ({ type = 'file', size = 'md', className }) => {
  const config = iconConfig[type] || iconConfig.file;
  const { Icon, color, bg } = config;
  const { icon: iconSize, container } = sizeMap[size] || sizeMap.md;

  return (
    <div className={clsx(
      'rounded-2xl flex items-center justify-center flex-shrink-0',
      bg, container, className
    )}>
      <Icon className={clsx(iconSize, color)} strokeWidth={1.8} />
    </div>
  );
};

export default FileIcon;
export { iconConfig };
