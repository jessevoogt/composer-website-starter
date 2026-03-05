// source.config.mjs
// Committed to the repo. Contains no secrets.
// All build-time configuration lives here — no .env files needed.

export default {
  // Local source/works folder (checked into the repo, binary assets gitignored)
  sourceDir: './source/works',

  // Default composer name inserted into generated MDX when work.yaml omits it
  defaultComposer: 'Composer Name',

  // MP3 conversion settings (for WAV → MP3 via ffmpeg)
  mp3Bitrate: 320, // kbps
}
