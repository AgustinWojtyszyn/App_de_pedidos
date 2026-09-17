import React from '/node_modules/.vite/deps/react.js'
const { useState } = React
import { calculateStats } from '/src/utils/daily/dailyOrderCalculations.js'

const names = ['María Fernández', 'Juan Martín López', 'Lucía Rodríguez', 'Carlos González', 'Sofía Martínez', 'Diego Pérez']
const locations = ['EPSE - Los Caracoles', 'Greif', 'Genneia']
const dishes = ['Carne al horno', 'Bife con ensalada', 'Ensalada completa']
window.__dailyActions = []
const record = name => (...args) => window.__dailyActions.push({ name, args })
export function useDailyOrdersData() {
  const [operationalDate, setDate] = useState('2026-09-18')
  const params = new URLSearchParams(window.location.search)
  const orders = params.has('empty') ? [] : Array.from({ length: 12 }, (_, i) => ({
    id: `test-${i}`, customer_name: names[i % names.length], customer_email: `cliente${i}@empresa.com.ar`,
    location: locations[i % 3], delivery_location: locations[i % 3], company_slug: ['epse', 'greif', 'genneia'][i % 3],
    delivery_date: operationalDate, created_at: '2026-09-17T15:30:00Z',
    status: i === 3 ? 'post_report_extra' : i > 8 ? 'archived' : 'pending',
    order_origin: i === 3 ? 'admin_extra' : 'customer',
    service: i % 4 === 0 ? 'dinner' : 'lunch', total_items: i % 3 + 1,
    items: [{ name: dishes[i % 3], quantity: i % 3 + 1 }],
    custom_responses: [{ title: 'Bebida', response: 'Agua' }, { title: 'Guarnición', response: 'Papas fritas' }]
  }))
  return {
    orders, ordersLoading: params.has('loading'), isAdmin: !params.has('restricted'), isGlobalAdmin: !params.has('limited'),
    canCreateLateAdminExtraOrder: !params.has('limited'), canManageLateExtraHistory: !params.has('limited'), canManageOrderDiscounts: !params.has('limited'),
    adminCompanies: [{slug: 'epse', name: 'EPSE'}, {slug: 'greif', name: 'Greif'}], availableDishes: dishes,
    refreshing: false, ordersError: params.has('error') ? 'No se pudieron actualizar los pedidos.' : '',
    reportRun: null, reportRunError: '', lastUpdatedAt: '2026-09-17T15:35:00Z', operationalDate,
    stats: calculateStats(orders), handleDeliveryDateChange: setDate, handleRefresh: record('refresh'),
    handleArchiveOrder: record('archive'), handleArchiveAllPending: record('archiveAll'), handleDeleteExtraOrder: record('deleteExtra'),
    cancellingExtraOrders: false, handleCancelExtraOrders: record('cancelExtras'), discountingOrders: false, handleCreateOrderDiscount: record('discount')
  }
}
