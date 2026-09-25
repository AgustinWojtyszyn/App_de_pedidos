import { describe, expect, it } from 'vitest'
import { isStaleAssetError } from './staleAssetRecovery'

describe('stale asset recovery detection', () => {
  it('detects dynamic import chunk failures', () => {
    expect(isStaleAssetError(new Error('Failed to fetch dynamically imported module'))).toBe(true)
    expect(isStaleAssetError(new Error('ChunkLoadError: Loading chunk 42 failed'))).toBe(true)
  })

  it('detects module MIME fallback responses', () => {
    expect(isStaleAssetError(new Error('Expected a JavaScript module script but the server responded with a MIME type of "text/html"'))).toBe(true)
  })

  it('ignores unrelated application errors', () => {
    expect(isStaleAssetError(new Error('Validation failed'))).toBe(false)
  })
})
