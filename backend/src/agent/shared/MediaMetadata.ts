import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * @param {string} filePath
 * @returns {Promise<import('./types.js').AgentFileMetadata|null>}
 */
export async function collectMediaMetadata(filePath) {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration,bit_rate',
        '-show_entries',
        'stream=index,codec_type,codec_name,width,height,channels,sample_rate,bit_rate,avg_frame_rate,pix_fmt,bits_per_raw_sample,bits_per_sample',
        '-of',
        'json',
        filePath
      ],
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024
      }
    );
    const payload = JSON.parse(stdout);
    const streams = Array.isArray(payload?.streams) ? payload.streams : [];
    const format = payload?.format || {};
    const primaryStream =
      streams.find((stream) => stream.codec_type === 'video') ||
      streams.find((stream) => stream.codec_type === 'audio') ||
      streams[0] ||
      null;

    const streamSummaries = streams.map((stream) => summarizeStream(stream));

    return {
      formatName: typeof format.format_name === 'string' ? format.format_name : undefined,
      durationSeconds: parseDuration(format.duration),
      bitRate: parseBitRate(format.bit_rate),
      primaryStream: primaryStream ? summarizeStream(primaryStream) : null,
      otherStreams: streamSummaries.filter((summary, index) => streams[index] !== primaryStream),
      raw: payload
    };
  } catch {
    return null;
  }
}

/**
 * @param {import('./types.js').AgentFile} file
 * @returns {Promise<string[]|null>}
 */
export async function formatMediaMetadataLines(file) {
  if (!file?.absolutePath) {
    return null;
  }
  const metadata = await collectMediaMetadata(file.absolutePath);
  if (!metadata) {
    return null;
  }

  const lines = [];
  if (metadata.formatName) {
    lines.push(`format: ${metadata.formatName}`);
  }

  if (metadata.primaryStream) {
    const { type, codec, width, height, frameRate, channels, sampleRate, pixelFormat, bitDepth } = metadata.primaryStream;
    if (type || codec) {
      lines.push(
        ['type', type, codec ? `(${codec})` : ''].filter(Boolean).join(' ')
      );
    }
    if (width && height) {
      lines.push(`resolution: ${width}x${height}`);
    }
    if (frameRate) {
      lines.push(`frame rate: ${frameRate}`);
    }
    if (channels) {
      lines.push(`channels: ${channels}`);
    }
    if (sampleRate) {
      lines.push(`sample rate: ${sampleRate} Hz`);
    }
    if (pixelFormat) {
      lines.push(`pixel format: ${pixelFormat}`);
    }
    if (bitDepth) {
      lines.push(`bit depth: ${bitDepth}-bit`);
    }
  }

  if (typeof metadata.durationSeconds === 'number') {
    lines.push(`duration: ${metadata.durationSeconds.toFixed(2)} s`);
  }
  if (typeof metadata.bitRate === 'number') {
    lines.push(`bitrate: ${Math.round(metadata.bitRate / 1000)} kbps`);
  }

  if (metadata.otherStreams.length > 0) {
    const others = metadata.otherStreams
      .map((stream) => {
        const parts = [stream.type];
        if (stream.codec) {
          parts.push(`(${stream.codec})`);
        }
        if (stream.channels) {
          parts.push(`${stream.channels}ch`);
        }
        if (stream.sampleRate) {
          parts.push(`${stream.sampleRate}Hz`);
        }
        if (stream.width && stream.height) {
          parts.push(`${stream.width}x${stream.height}`);
        }
        return parts.filter(Boolean).join(' ');
      })
      .filter(Boolean)
      .join(', ');
    if (others) {
      lines.push(`other streams: ${others}`);
    }
  }

  return lines.length ? lines : null;
}

function summarizeStream(stream) {
  const frameRate = normalizeFrameRate(stream?.avg_frame_rate);
  const bitDepth =
    parseIntSafe(stream?.bits_per_raw_sample) ||
    parseIntSafe(stream?.bits_per_sample) ||
    undefined;
  return {
    type: typeof stream?.codec_type === 'string' ? stream.codec_type : undefined,
    codec: typeof stream?.codec_name === 'string' ? stream.codec_name : undefined,
    width: parseIntSafe(stream?.width),
    height: parseIntSafe(stream?.height),
    frameRate,
    channels: parseIntSafe(stream?.channels),
    sampleRate: parseIntSafe(stream?.sample_rate),
    pixelFormat: typeof stream?.pix_fmt === 'string' ? stream.pix_fmt : undefined,
    bitDepth
  };
}

function parseDuration(value) {
  const numeric = parseFloat(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function parseBitRate(value) {
  const numeric = parseFloat(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function parseIntSafe(value) {
  const numeric = parseInt(value, 10);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeFrameRate(rate) {
  if (!rate || typeof rate !== 'string') {
    return undefined;
  }
  if (rate.includes('/')) {
    const [numerator, denominator] = rate.split('/').map((part) => parseFloat(part));
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      return (numerator / denominator).toFixed(2);
    }
    return undefined;
  }
  const numeric = parseFloat(rate);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric.toFixed(2);
  }
  return undefined;
}
