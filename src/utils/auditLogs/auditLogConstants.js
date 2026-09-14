export const ACTION_LABELS = {
  role_transfer: 'Transferencia de rol',
  role_changed: 'Cambio de rol',
  user_created: 'Alta de usuario',
  user_invited: 'Invitación de usuario',
  user_deleted: 'Eliminación de usuario',
  member_removed: 'Baja de miembro',
  login_as: 'Ingreso como otro usuario',
  permission_updated: 'Actualización de permisos',
  menu_updated: 'Carga/actualización del menú diario',
  admin_order_updated: 'Pedido actualizado por administrador',
  admin_order_cancelled: 'Pedido dado de baja',
  admin_extra_order_created: 'Extra administrativo creado',
  late_admin_extra_order_created: 'Extra fuera de horario creado',
  admin_extra_order_deleted: 'Extra administrativo eliminado',
  order_item_discount_created: 'Descuento de pedido'
}

export const ACTION_FILTERS = [
  { id: 'role', label: 'Cambios de rol', actions: ['role_transfer', 'role_changed'] },
  { id: 'create', label: 'Altas de usuarios', actions: ['user_created', 'user_invited'] },
  { id: 'delete', label: 'Bajas / eliminaciones', actions: ['user_deleted', 'member_removed'] },
  { id: 'perm', label: 'Permisos', actions: ['permission_updated'] },
  { id: 'menu', label: 'Cambios de menú', actions: ['menu_updated'] },
  { id: 'orders', label: 'Pedidos', actions: ['admin_order_updated'] },
  { id: 'extras', label: 'Extras', actions: ['admin_extra_order_created', 'late_admin_extra_order_created', 'admin_extra_order_deleted'] },
  { id: 'discounts', label: 'Descuentos', actions: ['order_item_discount_created'] },
  { id: 'cancellations', label: 'Bajas de pedidos', actions: ['admin_order_cancelled'] }
]

export const AUDIT_EVENT_TYPE_LABELS = {
  order: 'Pedido normal',
  admin_extra: 'Extra administrativo',
  post_report_extra: 'Extra post reporte',
  discount: 'Descuento',
  cancellation: 'Baja de pedido',
  other: 'Otro'
}

export const ENABLE_DUPLICATE_GROUPING = true
export const DUPLICATE_WINDOW_SECONDS = 120

