const markitdownResourceFilter = Object.freeze([
  'workwise-markitdown',
  'workwise-markitdown.exe',
  'requirements.lock',
  'README.md',
  'THIRD_PARTY_NOTICES.md',
  '_internal/**/*',
  '_internal/PIL/.dylibs/**/*',
  '_internal/Python.framework/**/*'
])

module.exports = { markitdownResourceFilter }
