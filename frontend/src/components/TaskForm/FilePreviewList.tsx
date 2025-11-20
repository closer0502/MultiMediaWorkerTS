import { useCallback, useEffect, useMemo, useState } from 'react';
import { extractFileExtension, formatFileSize } from '../../utils/formatters';
import { MESSAGES } from '../../i18n/messages';

export default function FilePreviewList({ files, onClear, onAdd, disabled }) {
  const messages = MESSAGES.filePreview;
  const totalSize = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const [previewItems, setPreviewItems] = useState([]);
  const hasFiles = files.length > 0;

  const handleAddClick = useCallback(() => {
    if (disabled) {
      return;
    }
    if (typeof onAdd === 'function') {
      onAdd();
    }
  }, [disabled, onAdd]);

  const handleClearClick = useCallback(() => {
    if (disabled || !hasFiles) {
      return;
    }
    if (typeof onClear === 'function') {
      onClear();
    }
  }, [disabled, hasFiles, onClear]);

  useEffect(() => {
    if (!files.length) {
      setPreviewItems([]);
      return undefined;
    }

    const nextItems = files.map((file) => {
      const key = `${file.name}-${file.size}-${file.lastModified ?? ''}`;
      const extension = (extractFileExtension(file.name) || '').toUpperCase();
      return {
        key,
        file,
        previewUrl: null,
        fallbackLabel: extension || (file.type ? file.type.split('/')[0].toUpperCase() : 'FILE')
      };
    });

    setPreviewItems(nextItems);

    return undefined;
  }, [files]);

  return (
    <div className={`file-preview ${hasFiles ? 'has-files' : 'is-empty'}`}>
      <div className="file-preview-header">
        <div className="file-preview-header-info">
          <strong>{messages.selectedLabel(files.length)}</strong>
          {hasFiles && <span className="file-preview-total-size">{formatFileSize(totalSize)}</span>}
        </div>
        <button type="button" onClick={handleClearClick} disabled={disabled || !hasFiles}>
          {messages.clear}
        </button>
      </div>
      {hasFiles ? (
        <ul>
          {previewItems.map(({ key, file, fallbackLabel }) => (
            <li key={key}>
              <div className="file-preview-thumb">
                <span>{fallbackLabel}</span>
              </div>
              <div className="file-preview-info">
                <span className="file-preview-name" title={file.name}>
                  {file.name}
                </span>
                <span className="file-preview-size">{formatFileSize(file.size)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="file-preview-empty">{messages.none}</p>
      )}
      <div className="file-preview-footer">
        <button
          type="button"
          className="file-input-trigger file-preview-add-button"
          onClick={handleAddClick}
          disabled={disabled}
        >
          {messages.add}
        </button>
      </div>
    </div>
  );
}
