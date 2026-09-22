import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

const currentDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(currentDir, 'useAuth.js'), 'utf8')

describe('useAuth tab refocus stability', () => {
  it('does not revalidate protected-route permissions for repeated SIGNED_IN events from the same user', () => {
    expect(source).toContain('const authenticatedUserIdRef = useRef(null)')
    expect(source).toContain('const isSameAuthenticatedUser = Boolean(')
    expect(source).toContain('authenticatedUserIdRef.current === nextUserId')
    expect(source).toContain('if (!isSameAuthenticatedUser) {')
    expect(source).toContain('validateUserRole(nextSession.user)')
  })

  it('updates refreshed sessions without touching protected-route permission state', () => {
    expect(source).toContain("event === 'TOKEN_REFRESHED'")
    expect(source).toContain('setSession(nextSession)')
    expect(source).toContain('authenticatedUserIdRef.current = null')
  })
})
