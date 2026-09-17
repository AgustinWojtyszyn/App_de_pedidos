import { useCallback, useEffect, useRef, useState } from 'react'

const DASHBOARD_ORDER_LIMIT = 200

const isVisibleDashboardOrder = (order = {}) =>
  String(order?.displayStatus || order?.status || '').toLowerCase() !== 'cancelled'

export const useDashboardOrders = ({ user, db, usersService } = {}) => {
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    archived: 0
  })
  const isFetchingRef = useRef(false)

  const calculateStats = useCallback((ordersData) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const todayOrders = (Array.isArray(ordersData) ? ordersData : []).filter(order => {
      if (!isVisibleDashboardOrder(order)) return false
      const orderDate = new Date(order.created_at)
      orderDate.setHours(0, 0, 0, 0)
      return orderDate.getTime() === today.getTime()
    })

    const total = todayOrders.length
    const pending = todayOrders.filter(order => (order.displayStatus || order.status) === 'pending').length
    const archived = todayOrders.filter(order => (order.displayStatus || order.status) === 'archived').length

    setStats({ total, pending, archived })
  }, [])

  const fetchOrders = useCallback(async (silent = false) => {
    if (!user?.id) return
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      if (!silent) {
        setOrdersLoading(true)
      }

      // El Dashboard es personal: leer solamente pedidos del usuario autenticado.
      // No necesita consultar la vista administrativa de personas para resolver su nombre.
      const { data, error } = await db.getOrders(user.id, { limit: DASHBOARD_ORDER_LIMIT })

      if (error) {
        console.error('Error fetching orders:', error)
      } else {
        const fallbackUserName = user?.user_metadata?.full_name ||
          user?.email?.split('@')[0] ||
          'Usuario'

        const ordersWithUserNames = (data || []).filter(isVisibleDashboardOrder).map(order => ({
          ...order,
          displayStatus: order.status,
          user_name: order.customer_name || fallbackUserName,
          user_email: order.customer_email || user?.email || ''
        }))

        setOrders(ordersWithUserNames)
        calculateStats(ordersWithUserNames)
      }
    } catch (err) {
      console.error('Error:', err)
    } finally {
      isFetchingRef.current = false
      if (!silent) {
        setOrdersLoading(false)
      }
    }
  }, [calculateStats, db, user?.email, user?.id, user?.user_metadata?.full_name])

  const checkIfAdmin = useCallback(async () => {
    if (!user?.id) return
    try {
      const { data, error } = await usersService.getUserById(user.id)
      if (!error && data) {
        setIsAdmin(data?.role === 'admin')
      }
    } catch (err) {
      console.error('Error checking admin status:', err)
    }
  }, [user?.id, usersService])

  useEffect(() => {
    if (!user?.id) return
    checkIfAdmin()
  }, [checkIfAdmin, user?.id])

  useEffect(() => {
    if (!user?.id) return undefined

    fetchOrders()

    // Mantener el Dashboard actualizado sin volver a descargar datos administrativos.
    const interval = setInterval(() => {
      fetchOrders(true)
    }, 30000)

    return () => clearInterval(interval)
  }, [fetchOrders, user?.id])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchOrders()
    setRefreshing(false)
  }, [fetchOrders])

  return {
    orders,
    setOrders,
    ordersLoading,
    isAdmin,
    refreshing,
    stats,
    fetchOrders,
    calculateStats,
    handleRefresh
  }
}
