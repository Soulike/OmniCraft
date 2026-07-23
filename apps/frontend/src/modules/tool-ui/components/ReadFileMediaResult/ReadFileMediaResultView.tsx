import {FileImage, FileText} from 'lucide-react';

import styles from './styles.module.css';

interface ReadFileMediaResultViewProps {
  filePath: string;
  mediaType: string;
  byteSize: number;
  kind: 'image' | 'document';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ReadFileMediaResultView({
  filePath,
  mediaType,
  byteSize,
  kind,
}: ReadFileMediaResultViewProps) {
  const Icon = kind === 'image' ? FileImage : FileText;
  return (
    <div className={styles.chip}>
      <Icon aria-hidden='true' className={styles.icon} size={14} />
      <code className={styles.filePath} title={filePath}>
        {filePath}
      </code>
      <span className={styles.meta}>
        {mediaType} · {formatBytes(byteSize)}
      </span>
    </div>
  );
}
