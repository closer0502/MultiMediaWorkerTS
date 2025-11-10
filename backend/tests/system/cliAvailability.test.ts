import { spawn } from 'node:child_process';

const REQUIRED_COMMANDS = [
  {
    command: 'ffmpeg',
    args: ['-version'],
    description: 'FFmpeg is required for audio/video processing.'
  },
  {
    command: 'magick',
    args: ['--version'],
    description: 'ImageMagick (magick) is required for image transformations.'
  },
  {
    command: 'exiftool',
    args: ['-ver'],
    description: 'ExifTool is required for metadata inspection.'
  },
  {
    command: 'yt-dlp',
    args: ['--version'],
    description: 'yt-dlp is required for media downloads.'
  }
];

const COMMAND_TIMEOUT_MS = 5_000;

/**
 * Verifies that required CLI commands resolve from PATH.
 */
export default async function runCliAvailabilityTests() {
  for (const entry of REQUIRED_COMMANDS) {
    await assertCommandReachable(entry);
  }
}

function assertCommandReachable({ command, args, description }) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    const timeoutId = setTimeout(() => {
      child.kill();
      reject(
        new Error(
          `Timed out while checking ${command}. ${description} Confirm the command runs quickly with ${command} ${args.join(
            ' '
          )}.`
        )
      );
    }, COMMAND_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(
        new Error(
          `Expected ${command} to be accessible via PATH. ${description} Original error: ${error.message}`
        )
      );
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      if (code !== 0) {
        reject(
          new Error(
            `Checking ${command} ${args.join(
              ' '
            )} exited with code ${code}. Output: ${stderr || stdout || '<<empty>>'}`
          )
        );
        return;
      }

      if (!stdout.trim() && !stderr.trim()) {
        reject(
          new Error(
            `Expected ${command} ${args.join(
              ' '
            )} to print version information, but no output was captured.`
          )
        );
        return;
      }

      resolve();
    });
  });
}
