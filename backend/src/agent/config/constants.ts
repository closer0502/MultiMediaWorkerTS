export type ToolDefinition = {
  title: string;
  description: string;
};

export type ToolDefinitionMap = Record<string, ToolDefinition>;

export const DEFAULT_TOOL_DEFINITIONS: ToolDefinitionMap = {
  ffmpeg: {
    title: 'FFmpeg',
    description: 'Handles audio and video conversions and processing.'
  },
  magick: {
    title: 'ImageMagick',
    description: 'Performs rich image conversions, resizing, and effects.'
  },
  exiftool: {
    title: 'ExifTool',
    description: 'Reads and edits embedded metadata for media files.'
  },
  'yt-dlp': {
    title: 'yt-dlp',
    description: 'Downloads media from supported online services.'
  },
  none: {
    title: 'No command',
    description: 'Choose when no CLI tool is appropriate for the task.'
  }
};

export const DEFAULT_MODEL = 'gpt-5-nano';
