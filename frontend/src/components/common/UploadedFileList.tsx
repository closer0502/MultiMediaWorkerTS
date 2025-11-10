import { formatFileSize } from '../../utils/formatters';
import { MESSAGES } from '../../i18n/messages';

export default function UploadedFileList({ files }) {
  const messages = MESSAGES.uploaded;
  if (!files || !files.length) {
    return <p>{messages.none}</p>;
  }
  return (
    <ul className="uploaded-files">
      {files.map((file, index) => (
        <li key={file.id || `${file.originalName || 'file'}-${index}`}>
          <span>{file.originalName || file.name}</span>
          {file.size != null && <span>{formatFileSize(file.size)}</span>}
        </li>
      ))}
    </ul>
  );
}
