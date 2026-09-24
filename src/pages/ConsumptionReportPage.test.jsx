import { readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const currentDir = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(currentDir, 'ConsumptionReportPage.jsx'), 'utf8')

describe('ConsumptionReportPage', () => {
  it('shows and exports the order origin location next to the user name', () => {
    expect(source).toContain("['Usuario', 'Lugar / Sede'")
    expect(source).toContain('row.locationLabel')
    expect(source).toContain('Lugar / Sede')
    expect(source).toContain('worksheet.autoFilter')
    expect(source).toContain('to: { row: worksheet.rowCount, column: headers.length }')
  })

  it('loads the generic company-scoped consumption RPC', () => {
    expect(source).toContain('getCompanyConsumptionOrders')
    expect(source).not.toContain('getIgarretaIsemarConsumptionOrders')
    expect(source).toContain('Reporte de consumo por empresa')
  })

  it('builds company filters from the authorization context before falling back to report rows', () => {
    expect(source).toContain('usersService.getAdminAccessContext()')
    expect(source).toContain('consumption_report_companies')
    expect(source).toContain('const [authorizedCompanies, setAuthorizedCompanies] = useState([])')
    expect(source).toContain('authorizedCompanies.forEach((company) =>')
    expect(source).toContain('orders.forEach((order) =>')
    expect(source).toContain('{companyOptions.map((company) =>')
    expect(source).toContain('Todas las autorizadas')
    expect(source).not.toContain('<option value="igarreta">')
    expect(source).not.toContain('<option value="isemar">')
  })

  it('loads the report from the RPC even while auth-context permissions are refreshing', () => {
    expect(source).toContain('// La ruta ya exige sesión. El RPC es la fuente de verdad de permisos:')
    expect(source).toContain('loadReport()')
    expect(source).not.toContain('if (isAdmin || canViewConsumptionReport) loadReport()')
    expect(source).not.toContain("useAuthContext")
  })

  it('does not clear known authorized companies when access-context refresh fails', () => {
    expect(source).toContain("if (!accessResult?.error && Array.isArray(accessResult?.data?.consumption_report_companies))")
    expect(source).toContain('setAuthorizedCompanies(accessResult.data.consumption_report_companies)')
    expect(source).not.toContain('setAuthorizedCompanies([])')
  })

  it('filters locations generically after selecting a company', () => {
    expect(source).toContain('const locationOptions = useMemo')
    expect(source).toContain("disabled={companyFilter === 'all'}")
    expect(source).toContain("companyFilter === 'all' ? 'Elegí una empresa' : 'Todas las sedes'")
    expect(source).toContain('resolveConsumptionLocationLabel(order) !== locationFilter')
  })

  it('shows monthly totals per authorized company without hardcoded company cards', () => {
    expect(source).toContain('const companyTotals = useMemo')
    expect(source).toContain('{totalConsumption}')
    expect(source).toContain('{companyTotals[company.slug] || 0}')
    expect(source).toContain("applyQuickFilter(company.slug)")
    expect(source).not.toContain('ISEMAR · Predio 1')
    expect(source).not.toContain('ISEMAR · Predio 2')
  })

  it('filters by user search and clears the search from the input', () => {
    expect(source).toContain("const [searchQuery, setSearchQuery] = useState('')")
    expect(source).toContain('Buscar usuario')
    expect(source).toContain('placeholder="Nombre o email"')
    expect(source).toContain('resolveConsumptionPersonName(order)')
    expect(source).toContain("onClick={() => setSearchQuery('')}")
  })

  it('shows a dynamic summary for the active view', () => {
    expect(source).toContain('Vista actual')
    expect(source).toContain('{activeFilterLabel}')
    expect(source).toContain('{activePeopleCount}')
    expect(source).toContain('{model.grandTotal}')
    expect(source).toContain('Búsqueda: “{searchQuery.trim()}”')
  })
})
