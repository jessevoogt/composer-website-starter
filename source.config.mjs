// source.config.mjs
// Committed to the repo. Contains no secrets.
// Override sourceDir with WORKS_SOURCE_DIR in .env.local for per-machine paths.

export default {
  // Local source/works folder (generated from source-template/ and ignored by default)
  // Override with WORKS_SOURCE_DIR in .env.local if you need a different path.
  sourceDir: './source/works',

  // Default composer name inserted into generated MDX when work.yaml omits it
  defaultComposer: 'FirstName LastName',

  // MP3 conversion settings (for WAV → MP3 via ffmpeg)
  mp3Bitrate: 320, // kbps
}
