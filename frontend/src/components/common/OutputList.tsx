import { deriveDownloadName, formatFileSize, resolvePublicHref } from '../../utils/formatters';
import { MESSAGES } from '../../i18n/messages';

export default function OutputList({ outputs }) {
  const messages = MESSAGES.output;
  if (!outputs.length) {
    return <p>{messages.none}</p>;
  }

  return (
    <ul className="output-list">
      {outputs.map((item) => {
        const href = resolvePublicHref(item.publicPath);
        const downloadName = deriveDownloadName(item);
        return (
          <li key={item.path}>
            <div className="output-path">
              <strong>{item.description || messages.descriptionFallback}</strong>
              <span>{item.absolutePath || item.path}</span>
            </div>
            <div className="output-meta">
              <span>{item.exists ? messages.exists : messages.missing}</span>
              {item.size != null && <span>{formatFileSize(item.size)}</span>}
              {href && (
                <a className="button-link" href={href} download={downloadName} rel="noreferrer">
                  {messages.download}
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
