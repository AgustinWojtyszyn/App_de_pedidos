import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const usersServiceSource = readFileSync(
  new URL('./usersService.js', import.meta.url),
  'utf8'
)
const legacyUsersSource = readFileSync(
  new URL('../users.js', import.meta.url),
  'utf8'
)
const roleUpdatesSource = readFileSync(
  new URL('./roleUpdates.js', import.meta.url),
  'utf8'
)

const userServiceSources = [
  usersServiceSource,
  legacyUsersSource,
  roleUpdatesSource
].join('\n')

describe('user services anti-regression guards', () => {
  it('mantiene el cambio de rol en la implementacion canonica', () => {
    expect(usersServiceSource).toContain('updateUserRoleWithRpc({')
    expect(roleUpdatesSource).toContain("rpc('admin_update_user_role'")
    expect(legacyUsersSource).toContain('db.updateUserRole(...args)')
    expect(legacyUsersSource).not.toContain('updateUserRoleWithRpc({')
    expect(legacyUsersSource).not.toContain('class UsersService')
  })

  it('no reintroduce updates directos de role en servicios de usuarios', () => {
    expect(userServiceSources).not.toMatch(/\.from\(['"]users['"]\)[\s\S]{0,240}\.update\(\s*\{[^}]*\brole\b/)
    expect(userServiceSources).not.toMatch(/\.update\(\s*\{[^}]*\brole\b/)
  })

  it('mantiene el lookup puntual y el contexto de acceso resiliente en el facade legacy', () => {
    expect(legacyUsersSource).toContain(".select('id, email, full_name, role, created_at, email_confirmed_at')")
    expect(legacyUsersSource).toContain('const getAdminAccessContext = async () =>')
    expect(legacyUsersSource).toContain('const result = await db.getAdminAccessContext()')
    expect(legacyUsersSource).toContain('ACCESS_RETRY_ATTEMPTS = 4')
    expect(legacyUsersSource).toContain('getCachedAccessContext(userId)')
    expect(legacyUsersSource).toContain('db.deleteUser(...args)')
    expect(legacyUsersSource).not.toContain('supabaseService')
    expect(legacyUsersSource).not.toContain(".select('*')")
  })

  it('no intenta usar auth.admin.listUsers desde servicios frontend', () => {
    expect(userServiceSources).not.toContain('auth.admin.listUsers')
    expect(userServiceSources).not.toContain('syncUserNames')
  })
})
