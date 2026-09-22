import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../supabaseClient'
import { useAuthContext } from '../contexts/authContextValue'
import { Sound } from '../utils/Sound'
import { calculateStats, getOperationalOrderUnits } from '../utils/daily/dailyOrderCalculations'
import { getItemOperationalQuantity } from '../utils/order/orderOperationalTotals'
import { notifyError, notifyInfo, notifySuccess } from '../utils/notice'
import { confirmAction } from '../utils/confirm'
import { getTomorrowISOInTimeZone } from '../utils/dateUtils'
import { getUserFriendlyErrorMessage } from '../utils'
import { isAdminExtraOrder, resolveAdminExtraCreator } from '../utils/daily/adminExtraOrders'

export const useDailyOrdersData = (user) => {
  const {
    isAdmin: isGlobalAdmin,
    isCompanyAdmin,
    canCreateLateAdminExtraOrder,
    canManageLateExtraHistory,
    canManageOrderDiscounts,
    adminCompanies
  } = useAuthContext()
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [availableDishes, setAvailableDishes] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [ordersError, setOrdersError] = useState('')
  const [reportRun, setReportRun] = useState(null)
  const [reportRunError, setReportRunError] = useState('')
  const [lastUpdatedAt, setLastUpdatedAt] = useState('')
  const [operationalDate, setOperationalDate] = useState(() => getTomorrowISOInTimeZone())
  const [cancellingExtraOrders, setCancellingExtraOrders] = useState(false)
  const [discountingOrders, setDiscountingOrders] = useState(false)
  const [stats, setStats] = useState({
    total: 0,
    byLocation: {},
    byDish: {},
    totalItems: 0,
    archived: 0,
    pending: 0,
    postReportExtra: 0
  })
  const requestSequenceRef = useRef(0)
  const loadingRequestRef = useRef(null)
  const userId = user?.id || ''
  const hasAdminAccess = isGlobalAdmin || isCompanyAdmin

  const fetchDailyReportRunStatus = useCallback(async (reportDate, requestId = null) => {
    if (!reportDate) return
    const isCurrentRequest = () => requestId === null || requestId === requestSequenceRef.current

    try {
      if (isCurrentRequest()) {
        setReportRunError('')
      }
      const { data, error } = await db.getDailyReportRunStatus({ reportDate })
      if (!isCurrentRequest()) return
      if (error) {
        console.error('Error fetching daily report run status:', error)
        setReportRun(null)
        setReportRunError('No se pudo consultar el estado del reporte automático.')
        return
      }
      setReportRun(data || null)
    } catch (err) {
      if (!isCurrentRequest()) return
      console.error('Error fetching daily report run status:', err)
      setReportRun(null)
      setReportRunError('No se pudo consultar el estado del reporte automático.')
    }
  }, [])

  const fetchDailyOrders = useCallback(async (silent = false, deliveryDate = operationalDate) => {
    if (!userId) return []

    const requestId = ++requestSequenceRef.current
    const isLatestRequest = () => requestId === requestSequenceRef.current
    const nextOperationalDate = deliveryDate || getTomorrowISOInTimeZone()

    if (!silent) {
      loadingRequestRef.current = requestId
      setOrdersLoading(true)
    }

    try {
      const { data: ordersData, error } = await db.getDailyOrdersForAdmin({
        deliveryDate: nextOperationalDate,
        statuses: ['pending', 'archived', 'post_report_extra']
      })

      if (!isLatestRequest()) return []

      if (error) {
        console.error('Error fetching orders:', error)
        if (!silent) {
          setOrders([])
          setAvailableDishes([])
          setStats(calculateStats([]))
        }
        setOrdersError('No se pudieron cargar los pedidos diarios. Usá Actualizar para reintentar.')
      } else {
        let peopleData = []
        try {
          const peopleResult = await db.getAdminPeopleUnified()
          peopleData = peopleResult?.data || []
        } catch (peopleError) {
          if (import.meta.env.DEV) {
            console.warn('[daily-orders] No se pudo enriquecer personas:', peopleError)
          }
        }

        if (!isLatestRequest()) return []

        const personById = new Map()
        ;(Array.isArray(peopleData) ? peopleData : []).forEach((person) => {
          ;[person?.person_id, person?.id, person?.primary_user_id, ...(Array.isArray(person?.user_ids) ? person.user_ids : [])]
            .filter(Boolean)
            .forEach((id) => personById.set(String(id), person))
        })

        const dishesSet = new Set()

        const todayOrders = Array.isArray(ordersData) ? ordersData.map(order => {
          if (!order) return false
          const personId = order.person_key || (order.user_id ? String(order.user_id) : null)
          const person = personId ? personById.get(personId) : null
          const emails = Array.isArray(person?.emails) ? person.emails.filter(Boolean) : []
          const orderEmail = order.customer_email || order.user_email || ''
          const orderName = order.customer_name || order.user_name || order.user_full_name || order.full_name || ''
          const isExtra = isAdminExtraOrder(order)
          const adminCreator = isExtra ? resolveAdminExtraCreator(order, { peopleById: personById }) : null
          let userName = isExtra ? adminCreator.label : orderName || (orderEmail ? orderEmail.split('@')[0] : '') || 'Usuario'
          if (!isExtra && person) {
            userName = (person.display_name !== undefined ? person.display_name : null)
              || (emails[0] ? emails[0].split('@')[0] : null)
              || orderName
              || 'Usuario'
          }

          if (Array.isArray(order.items)) {
            order.items.forEach(item => {
              if (
                item &&
                typeof item === 'object' &&
                item.name !== undefined &&
                getItemOperationalQuantity(item) > 0
              ) {
                dishesSet.add(item.name)
              }
            })
          }
          return {
            ...order,
            ...(isExtra
              ? {
                  admin_extra_creator_name: adminCreator.hasTraceability ? adminCreator.name : '',
                  admin_extra_creator_email: adminCreator.email
                }
              : {}),
            user_name: userName,
            user_email: isExtra ? adminCreator.email : orderEmail || emails[0] || ''
          }
        }).filter(Boolean) : []

        if (!isLatestRequest()) return []

        setOrdersError('')
        setOrders(todayOrders)
        setAvailableDishes(Array.from(dishesSet).sort())
        setStats(calculateStats(todayOrders))
        setLastUpdatedAt(new Date().toISOString())
        await fetchDailyReportRunStatus(nextOperationalDate, requestId)
        return todayOrders
      }
    } catch (err) {
      if (!isLatestRequest()) return []
      console.error('Error:', err)
      if (!silent) {
        setOrders([])
        setAvailableDishes([])
        setStats(calculateStats([]))
      }
      setOrdersError('No se pudieron cargar los pedidos diarios. Usá Actualizar para reintentar.')
    } finally {
      if (!silent && loadingRequestRef.current === requestId) {
        loadingRequestRef.current = null
        setOrdersLoading(false)
      }
    }
    return []
  }, [fetchDailyReportRunStatus, operationalDate, userId])

  useEffect(() => {
    if (!userId || !hasAdminAccess) return

    fetchDailyOrders()

    const liveOperationalDate = getTomorrowISOInTimeZone()
    if (operationalDate !== liveOperationalDate) return

    const refreshIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      fetchDailyOrders(true, operationalDate)
    }

    const interval = setInterval(refreshIfVisible, 30000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshIfVisible()
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    return () => {
      clearInterval(interval)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [hasAdminAccess, operationalDate, userId, fetchDailyOrders])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    const refreshedOrders = await fetchDailyOrders(false, operationalDate)
    setRefreshing(false)
    return refreshedOrders
  }, [fetchDailyOrders, operationalDate])

  const handleDeliveryDateChange = useCallback((nextDate) => {
    if (!nextDate || nextDate === operationalDate) return
    setOperationalDate(nextDate)
  }, [operationalDate])

  const handleArchiveOrder = useCallback(async (order) => {
    if (!order?.id || order.status === 'archived') return
    const confirmArchive = await confirmAction({
      title: 'Archivar pedido',
      message: `¿Archivar el pedido de ${order.user_name || 'cliente'}?`,
      confirmText: 'Archivar'
    })
    if (!confirmArchive) return

    const { error } = await db.updateOrderStatus(order.id, 'archived')
    if (error) {
      notifyError(getUserFriendlyErrorMessage(error, 'No pudimos archivar el pedido. Intentá nuevamente.'))
      return
    }
    Sound.playSuccess()
    setOrders((prev) => {
      if (!Array.isArray(prev)) return prev
      const next = prev.map((item) =>
        item?.id === order.id ? { ...item, status: 'archived' } : item
      )
      setStats(calculateStats(next))
      return next
    })
    handleRefresh()
  }, [handleRefresh])

  const handleArchiveAllPending = useCallback(async () => {
    const pendingOrders = (Array.isArray(orders) ? orders : []).filter((order) => (
      String(order?.status || '').toLowerCase() === 'pending' &&
      String(order?.delivery_date || '') === operationalDate
    ))
    const pendingCount = pendingOrders.length
    const pendingUnits = pendingOrders.reduce((sum, order) => sum + getOperationalOrderUnits(order), 0)

    if (pendingCount === 0) {
      notifyInfo('No hay pedidos pendientes para archivar.')
      return
    }

    const confirmed = await confirmAction({
      title: 'Archivar todos los pedidos pendientes',
      message: `Se archivarán ${pendingCount} pedido${pendingCount === 1 ? '' : 's'} pendiente${pendingCount === 1 ? '' : 's'} (${pendingUnits} vianda${pendingUnits === 1 ? '' : 's'}) con fecha de entrega ${operationalDate}. Esta acción no se puede deshacer.`,
      confirmText: 'Archivar todos'
    })
    if (confirmed) {
      const { data, error } = await db.archivePendingOrdersByDeliveryDate({
        deliveryDate: operationalDate,
        statuses: ['pending']
      })
      if (!error) {
        const affected = Array.isArray(data) ? data.length : 0
        if (affected === 0) {
          notifyInfo('No hay pedidos pendientes para archivar.')
        } else {
          notifySuccess(`Pedidos archivados correctamente: ${affected}`)
        }
        Sound.playSuccess()
        setOrders((prev) => {
          if (!Array.isArray(prev)) return prev
          const next = prev.map((item) =>
            item?.status === 'pending' && String(item?.delivery_date || '') === operationalDate
              ? { ...item, status: 'archived' }
              : item
          )
          setStats(calculateStats(next))
          return next
        })
        handleRefresh()
      } else {
        notifyError(getUserFriendlyErrorMessage(error, 'No pudimos archivar los pedidos. Intentá nuevamente.'))
      }
    }
  }, [handleRefresh, operationalDate, orders])

  const handleDeleteExtraOrder = useCallback(async (order) => {
    if (!order?.id || !isAdminExtraOrder(order)) return
    const confirmed = await confirmAction({
      title: 'Cancelar pedido extra',
      message: 'Se cancelará este pedido extra solicitado por admin. Esta acción queda auditada con snapshot completo.',
      confirmText: 'Continuar'
    })
    if (!confirmed) return

    const reason = typeof window !== 'undefined'
      ? window.prompt('Motivo obligatorio para cancelar el pedido extra:')
      : ''
    const normalizedReason = String(reason || '').trim()
    if (!normalizedReason) {
      notifyError('Indicá el motivo para cancelar el pedido extra.')
      return
    }

    const { error } = await db.deleteAdminExtraOrder({
      orderId: order.id,
      reason: normalizedReason
    })
    if (error) {
      notifyError(getUserFriendlyErrorMessage(error, 'No pudimos cancelar el pedido extra. Intentá nuevamente.'))
      return
    }

    notifySuccess('Pedido extra cancelado correctamente.')
    Sound.playSuccess()
    setOrders((prev) => {
      if (!Array.isArray(prev)) return prev
      const next = prev.filter((item) => item?.id !== order.id)
      setStats(calculateStats(next))
      return next
    })
    handleRefresh()
  }, [handleRefresh])

  const handleCancelExtraOrders = useCallback(async ({
    orders: selectedOrders = [],
    scope = 'single',
    companyLabel = ''
  } = {}) => {
    if (cancellingExtraOrders) return

    const extraOrders = (Array.isArray(selectedOrders) ? selectedOrders : [])
      .filter((order) =>
        order?.id &&
        isAdminExtraOrder(order) &&
        String(order.delivery_date || '') === String(operationalDate || '')
      )

    if (extraOrders.length === 0) {
      notifyInfo('No hay pedidos extra seleccionados para cancelar.')
      return
    }

    const uniqueOrders = Array.from(
      new Map(extraOrders.map((order) => [String(order.id), order])).values()
    )
    const count = uniqueOrders.length
    const title = scope === 'single' ? 'Cancelar pedido extra' : 'Cancelar pedidos extra'
    const message = scope === 'company'
      ? `Cancelar ${count} pedido${count === 1 ? '' : 's'} extra de ${companyLabel || 'esta empresa'} para ${operationalDate}.`
      : scope === 'all'
        ? `Cancelar los ${count} pedido${count === 1 ? '' : 's'} extra de este día (${operationalDate}).`
        : `Cancelar este pedido extra para ${operationalDate}.`

    const confirmed = await confirmAction({
      title,
      message,
      confirmText: 'Cancelar extras'
    })
    if (!confirmed) return

    setCancellingExtraOrders(true)
    try {
      const failures = []
      for (const order of uniqueOrders) {
        const { error } = await db.deleteAdminExtraOrder({
          orderId: order.id,
          reason: 'Cancelación administrativa de pedido extra'
        })
        if (error) failures.push({ order, error })
      }

      if (failures.length > 0) {
        notifyError(`No pudimos cancelar ${failures.length} pedido${failures.length === 1 ? '' : 's'} extra. Actualizá y revisá el listado.`)
      }

      const successCount = count - failures.length
      if (successCount > 0) {
        notifySuccess(`Pedidos extra cancelados correctamente: ${successCount}`)
        Sound.playSuccess()
        setOrders((prev) => {
          if (!Array.isArray(prev)) return prev
          const cancelledIds = new Set(uniqueOrders.filter((order) =>
            !failures.some((failure) => String(failure.order.id) === String(order.id))
          ).map((order) => String(order.id)))
          const next = prev.filter((item) => !cancelledIds.has(String(item?.id)))
          setStats(calculateStats(next))
          return next
        })
      }
      handleRefresh()
    } finally {
      setCancellingExtraOrders(false)
    }
  }, [cancellingExtraOrders, handleRefresh, operationalDate])

  const handleCreateOrderDiscount = useCallback(async (payload = {}) => {
    if (discountingOrders) return { error: new Error('discount_in_progress') }

    const normalizedPayload = {
      ...payload,
      delivery_date: operationalDate
    }

    setDiscountingOrders(true)
    try {
      const { data, error } = await db.createOrderDiscount(normalizedPayload)
      if (error) {
        notifyError(getUserFriendlyErrorMessage(error, 'No pudimos descontar pedidos. Revisá cantidad disponible y permisos.'))
        return { data, error }
      }

      notifySuccess('Descuento registrado correctamente.')
      Sound.playSuccess()
      await handleRefresh()
      return { data, error: null }
    } finally {
      setDiscountingOrders(false)
    }
  }, [discountingOrders, handleRefresh, operationalDate])

  return {
    orders,
    ordersLoading,
    isAdmin: hasAdminAccess,
    isGlobalAdmin,
    isCompanyAdmin,
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
    cancellingExtraOrders,
    discountingOrders,
    handleRefresh,
    handleDeliveryDateChange,
    handleArchiveOrder,
    handleArchiveAllPending,
    handleDeleteExtraOrder,
    handleCancelExtraOrders,
    handleCreateOrderDiscount
  }
}
