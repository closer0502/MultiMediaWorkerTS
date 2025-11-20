import { deriveDownloadName, determinePreviewType, formatFileSize, resolvePublicHref } from '../../utils/formatters';
import { MESSAGES } from '../../i18n/messages';

export default function OutputList({ outputs, showPreview = true }) {
  const messages = MESSAGES.output;
  if (!outputs.length) {
    return <p>{messages.none}</p>;
  }

  return (
    <ul className="output-list">
      {outputs.map((item) => {
        const href = showPreview ? resolvePublicHref(item.publicPath) : '';
        const downloadName = showPreview ? deriveDownloadName(item) : undefined;
        const previewElement =
          showPreview && href && item.exists
            ? renderOutputPreview(href, { filename: downloadName, description: item.description, messages })
            : null;
        return (
          <li key={item.path}>
            <div className="output-path">
              <strong>{item.description || messages.descriptionFallback}</strong>
              <span>{item.absolutePath || item.path}</span>
            </div>
            <div className="output-meta">
              <span>{item.exists ? messages.exists : messages.missing}</span>
              {item.size != null && <span>{formatFileSize(item.size)}</span>}
              {showPreview && href && (
                <a className="button-link" href={href} download={downloadName} rel="noreferrer">
                  {messages.download}
                </a>
              )}
            </div>
            {showPreview && previewElement && <div className="output-preview">{previewElement}</div>}
          </li>
        );
      })}
    </ul>
  );
}

function renderOutputPreview(href, { filename, description, messages }) {
  const previewType = determinePreviewType(filename);
  if (previewType === 'image') {
    return <img src={href} alt={description || filename || messages.previewAlt} className="output-preview-media" />;
  }
  if (previewType === 'audio') {
    return <audio controls preload="metadata" src={href} className="output-preview-media" />;
  }
  if (previewType === 'video') {
    return <video controls preload="metadata" src={href} className="output-preview-media" />;
  }
  return null;
}
