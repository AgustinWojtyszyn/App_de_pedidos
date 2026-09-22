import { useState, useMemo } from 'react'
import '../styles/daily-orders.css'
import { useNavigate } from 'react-router-dom'
import { Shield } from 'lucide-react'
import RequireUser from './RequireUser'
import { COMPANY_LOCATIONS } from '../constants/companyConfig'
import DailyFilters from './daily/DailyFilters'
import DailyHeader from './daily/DailyHeader'
import DailyLoader from './daily/DailyLoader'
import DailyClosePanel from './daily/DailyClosePanel'
import SystemHealthPanel from './daily/SystemHealthPanel'
import DailyOrdersTable from './daily/DailyOrdersTable'
import DailySummary from './daily/DailySummary'
import DailyPrintStyles from './daily/DailyPrintStyles'
import AdminExtraOrderModal from './daily/AdminExtraOrderModal'
import AdminExtraCancelPanel from './daily/AdminExtraCancelPanel'
import OrderDiscountModal from './daily/OrderDiscountModal'
import DailyRemitosPanel from './daily/DailyRemitosPanel'
import DailySearchPanel from './daily/DailySearchPanel'
import LateAdminExtraHistoryPanel from './daily/LateAdminExtraHistoryPanel'
import { useDailyOrdersData } from '../hooks/useDailyOrdersData'
import { matchesDailyOrderStatusFilter, useDailyOrdersFilters } from '../hooks/useDailyOrdersFilters'
import {
  buildLocationCards,
  buildOperationalSummary,
  buildDailyOperationalSplit,
  calculateStats,
  buildPrintStats,
  filterOrdersByCompany,
  getOperationalOrderUnits,
  withoutPostReportExtras
} from '../utils/daily/dailyOrderCalculations'
import { getDailyOperationalStatus } from '../utils/daily/dailyCloseStatus'
import { formatDeliveryDateLabel } from '../utils/daily/dailyOrderFormatters'
import { exportDailyOrdersExcel } from '../utils/daily/exportDailyOrdersExcel'
import { exportDailyOrderNotesExcel } from '../utils/daily/exportDailyOrderNotesExcel'
import { exportDailyOrdersPdf } from '../utils/daily/exportDailyOrdersPdf'
import { shareDailyOrdersWhatsApp } from '../utils/daily/shareDailyOrdersWhatsApp'

const DailyOrders = ({ user, loading }) => {
  const [selectedLocation, setSelectedLocation] = useState('all')
  const [exportCompany, setExportCompany] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [selectedDish, setSelectedDish] = useState('all')
  const [selectedSide, setSelectedSide] = useState('all')
  const [sortBy, setSortBy] = useState('recent')
  const [excludePostReportExtrasFromExports, setExcludePostReportExtrasFromExports] = useState(true)
  const [extraOrderOpen, setExtraOrderOpen] = useState(false)
  const [discountModalOpen, setDiscountModalOpen] = useState(false)
  const [extraOrderMode, setExtraOrderMode] = useState('standard')
  const [activeSubtab, setActiveSubtab] = useState('orders')

  const locations = COMPANY_LOCATIONS
  const navigate = useNavigate()

  const {
    orders,
    ordersLoading,
    isAdmin,
    isGlobalAdmin,
    canCreateLateAdminExtraOrder,
    canManageLateExtraHistory,
    canManageOrderDiscounts,
    adminCompanies,
    availableDishes,
    refreshing,
    ordersError,
    reportRun,
    reportRunError,
    lastUpdatedAt,
    operationalDate,
    stats,
    handleRefresh,
    handleDeliveryDateChange,
    handleArchiveOrder,
    handleArchiveAllPending,
    handleDeleteExtraOrder,
    cancellingExtraOrders,
    handleCancelExtraOrders,
    discountingOrders,
    handleCreateOrderDiscount
  } = useDailyOrdersData(user)

  const handleOperationalDateChange = (nextDate) => {
    if (!nextDate || nextDate === operationalDate) return
    setSelectedLocation('all')
    setSelectedStatus('all')
    setSelectedDish('all')
    setSelectedSide('all')
    handleDeliveryDateChange(nextDate)
  }

  const {
    allOrders,
    sortedOrders,
    availableSides
  } = useDailyOrdersFilters({
    orders,
    selectedLocation,
    selectedStatus,
    selectedDish,
    selectedSide,
    sortBy
  })

  const exportToExcel = async () => {
    await exportDailyOrdersExcel({
      sortedOrders: exportOrders,
      exportCompany,
      selectedLocation,
      selectedStatus,
      stats
    })
  }

  const generateNotaPedido = async () => {
    await exportDailyOrderNotesExcel({
      sortedOrders: exportOrders,
      exportCompany,
      selectedLocation,
      selectedStatus,
      stats
    })
  }

  const exportToPdf = () => {
    exportDailyOrdersPdf(manualExportOrders)
  }

  const shareViaWhatsApp = () => {
    shareDailyOrdersWhatsApp(manualExportOrders, selectedStatus)
  }

  const operationalSummary = useMemo(
    () => buildOperationalSummary(sortedOrders),
    [sortedOrders]
  )

  const statusFilteredOrders = useMemo(() => {
    return allOrders.filter(order => matchesDailyOrderStatusFilter(order, selectedStatus))
  }, [allOrders, selectedStatus])

  const statsForFilters = useMemo(
    () => calculateStats(statusFilteredOrders),
    [statusFilteredOrders]
  )

  const operationalSplit = useMemo(
    () => buildDailyOperationalSplit(allOrders),
    [allOrders]
  )

  const activeLocationsCount = useMemo(
    () => Object.values(stats.byLocation || {}).filter(count => Number(count) > 0).length,
    [stats.byLocation]
  )

  const locationCards = useMemo(
    () => buildLocationCards(allOrders),
    [allOrders]
  )

  const printStats = useMemo(() => buildPrintStats(allOrders), [allOrders])
  const manualExportOrders = useMemo(
    () => filterOrdersByCompany(sortedOrders, exportCompany),
    [sortedOrders, exportCompany]
  )
  const exportOrders = useMemo(
    () => excludePostReportExtrasFromExports
      ? withoutPostReportExtras(manualExportOrders)
      : manualExportOrders,
    [excludePostReportExtrasFromExports, manualExportOrders]
  )
  const countOperationalUnits = (ordersList = []) =>
    (Array.isArray(ordersList) ? ordersList : [])
      .reduce((sum, order) => sum + getOperationalOrderUnits(order), 0)
  const exportableOrdersCount = countOperationalUnits(exportOrders)
  const sortedOrdersUnits = countOperationalUnits(sortedOrders)
  const deliveryDateLabel = formatDeliveryDateLabel(operationalDate)
  const remitoCompanyOptions = useMemo(
    () => locations.map((location) => ({ value: location, label: location })),
    [locations]
  )
  const dailyCloseStatus = useMemo(
    () => getDailyOperationalStatus({
      orders: allOrders,
      deliveryDate: operationalDate,
      selectedStatus: 'all',
      reportRun,
      reportRunError,
      lastUpdatedAt,
      exportCompany
    }),
    [allOrders, exportCompany, lastUpdatedAt, operationalDate, reportRun, reportRunError]
  )

  if (!isAdmin) {
    return (
      <RequireUser user={user} loading={loading}>
        <div className="p-6 max-w-2xl mx-auto">
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="p-4 bg-red-100 rounded-full">
                <Shield className="h-12 w-12 text-red-600" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-red-900 mb-2">Acceso Restringido</h2>
            <p className="text-red-700">Solo los administradores pueden ver los pedidos diarios.</p>
          </div>
        </div>
      </RequireUser>
    )
  }

  if (ordersLoading) {
    return (
      <RequireUser user={user} loading={loading}>
        <DailyLoader />
      </RequireUser>
    )
  }

  return (
    <RequireUser user={user} loading={loading}>
      <DailyPrintStyles />
      <div className="daily-workspace print-wrap print-content">
        <DailySummary
          mode="print"
          stats={stats}
          printStats={printStats}
          tomorrowLabel={deliveryDateLabel}
        />

        <DailyHeader
          dailyCloseStatus={dailyCloseStatus}
          stats={stats}
          operationalSplit={operationalSplit}
          activeLocationsCount={activeLocationsCount}
          tomorrowLabel={deliveryDateLabel}
          operationalDate={operationalDate}
          onDeliveryDateChange={handleOperationalDateChange}
          exportCompany={exportCompany}
          onExportCompanyChange={setExportCompany}
          locations={locations}
          exportableOrdersCount={exportableOrdersCount}
          excludePostReportExtrasFromExports={excludePostReportExtrasFromExports}
          onExcludePostReportExtrasFromExportsChange={setExcludePostReportExtrasFromExports}
          onExportExcel={exportToExcel}
          onGenerateNotaPedido={generateNotaPedido}
          onShareWhatsApp={shareViaWhatsApp}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onExportPdf={exportToPdf}
          onArchiveAll={handleArchiveAllPending}
          onAddExtraOrder={() => {
            setExtraOrderMode('standard')
            setExtraOrderOpen(true)
          }}
          onAddLateExtraOrder={canCreateLateAdminExtraOrder ? () => {
            setExtraOrderMode('late')
            setExtraOrderOpen(true)
          } : null}
          onDiscountOrders={canManageOrderDiscounts ? () => setDiscountModalOpen(true) : null}
          sortedOrdersLength={sortedOrdersUnits}
          pendingOrdersCount={dailyCloseStatus.pendingCount}
          isAdmin={isGlobalAdmin}
        />

        <AdminExtraOrderModal
          open={extraOrderOpen}
          onClose={() => setExtraOrderOpen(false)}
          onCreated={(result) => {
            const nextDate = result?.delivery_date || result?.order?.delivery_date || result?.deliveryDate
            if (nextDate && nextDate !== operationalDate) {
              handleOperationalDateChange(nextDate)
              return
            }
            handleRefresh()
          }}
          operationalDate={operationalDate}
          lateWindowMode={extraOrderMode === 'late'}
          isGlobalAdmin={isGlobalAdmin}
          adminCompanies={adminCompanies}
        />

        <OrderDiscountModal
          open={discountModalOpen}
          orders={allOrders}
          operationalDate={operationalDate}
          submitting={discountingOrders}
          onClose={() => setDiscountModalOpen(false)}
          onSubmit={handleCreateOrderDiscount}
        />

        {ordersError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 print-hide">
            {ordersError}
          </div>
        )}

        <DailyClosePanel
          status={dailyCloseStatus}
        />

        <SystemHealthPanel enabled={isGlobalAdmin} />

        <nav aria-label="Secciones de pedidos diarios" className="daily-workspace-nav print-hide">
          {[
            ['orders', 'Pedidos'],
            ['remitos', 'Remitos'],
            ['search', 'Buscar'],
            ...(canManageLateExtraHistory ? [['extra-history', 'Histórico de extras']] : [])
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setActiveSubtab(value)}
              aria-current={activeSubtab === value ? 'page' : undefined}
              className={`daily-workspace-tab ${activeSubtab === value ? 'is-active' : ''}`}
            >
              {label}
            </button>
          ))}
        </nav>

        {activeSubtab === 'orders' && (
          <>
            <DailyFilters
              stats={statsForFilters}
              locations={locations}
              selectedLocation={selectedLocation}
              onLocationChange={setSelectedLocation}
              selectedStatus={selectedStatus}
              onStatusChange={setSelectedStatus}
              selectedDish={selectedDish}
              onDishChange={setSelectedDish}
              selectedSide={selectedSide}
              onSideChange={setSelectedSide}
              availableDishes={availableDishes}
              availableSides={availableSides}
              sortBy={sortBy}
              onSortChange={setSortBy}
            />

            <DailySummary
              mode="main"
              stats={stats}
              operationalSummary={operationalSummary}
              sortedOrdersLength={sortedOrdersUnits}
              selectedLocation={selectedLocation}
              locationCards={locationCards}
            />

            <AdminExtraCancelPanel
              orders={allOrders}
              operationalDate={operationalDate}
              cancelling={cancellingExtraOrders}
              onCancelExtras={handleCancelExtraOrders}
            />

            <DailyOrdersTable
              sortedOrders={sortedOrders}
              sortBy={sortBy}
              selectedLocation={selectedLocation}
              selectedStatus={selectedStatus}
              onArchiveOrder={isGlobalAdmin ? handleArchiveOrder : null}
              onDeleteExtraOrder={handleDeleteExtraOrder}
              onViewOrder={(orderId) => navigate(`/orders/${orderId}`)}
            />
          </>
        )}

        {activeSubtab === 'remitos' && (
          <DailyRemitosPanel
            orders={allOrders}
            deliveryDate={operationalDate}
            exportCompany={exportCompany}
            onExportCompanyChange={setExportCompany}
            companyOptions={remitoCompanyOptions}
            onDeliveryDateChange={handleOperationalDateChange}
            onRefresh={handleRefresh}
          />
        )}

        {activeSubtab === 'search' && (
          <DailySearchPanel
            companyOptions={(Array.isArray(adminCompanies) ? adminCompanies : []).map((company) => ({
              value: company.slug,
              label: company.name
            }))}
            onViewOrder={(orderId) => navigate(`/orders/${orderId}`)}
          />
        )}

        {activeSubtab === 'extra-history' && canManageLateExtraHistory && (
          <LateAdminExtraHistoryPanel operationalDate={operationalDate} />
        )}
      </div>
    </RequireUser>
  )
}

export default DailyOrders
