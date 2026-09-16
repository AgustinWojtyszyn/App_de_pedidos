export const createCustomOptionsService = ({
  supabase,
  invalidateCache = () => {}
} = {}) => {
  if (!supabase) {
    throw new Error('createCustomOptionsService requires a supabase client')
  }

  // Opciones personalizables (admin listing sin filtros).
  // Se leen siempre desde Supabase para evitar divergencias entre sesiones admin.
  const getCustomOptions = async () => {
    const { data, error } = await supabase
      .from('custom_options')
      .select('*')
      .order('order_position', { ascending: true })

    return { data, error }
  }

  // Opciones visibles por contexto (usa RPC con reglas de meal/días/feriados)
  const getVisibleCustomOptions = async ({ company, meal, date, countryCode = 'AR' }) => {
    const { data, error } = await supabase.rpc('get_visible_custom_options', {
      p_company: company || null,
      p_meal: meal,
      p_date: date,
      p_country_code: countryCode
    })
    return { data, error }
  }

  const createCustomOption = async (option) => {
    invalidateCache()
    const { data, error } = await supabase
      .from('custom_options')
      .insert([option])
      .select()
    return { data, error }
  }

  const updateCustomOption = async (id, updates) => {
    invalidateCache()
    const { data, error } = await supabase
      .from('custom_options')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
    return { data, error }
  }

  const deleteCustomOption = async (id) => {
    invalidateCache()
    const { data, error } = await supabase
      .from('custom_options')
      .delete()
      .eq('id', id)
    return { data, error }
  }

  const updateCustomOptionsOrder = async (options) => {
    invalidateCache()
    // Actualizar el orden de múltiples opciones
    const promises = options.map((option, index) =>
      supabase
        .from('custom_options')
        .update({ order_position: index })
        .eq('id', option.id)
    )
    const results = await Promise.all(promises)
    const error = results.find(r => r.error)?.error
    return { error }
  }

  // Overrides para opciones (ej: habilitar postre en fin de semana)
  const getCustomOptionOverride = async ({ optionId, date }) => {
    const { data, error } = await supabase
      .from('custom_option_overrides')
      .select('enabled, date')
      .eq('option_id', optionId)
      .eq('date', date)
      .maybeSingle()

    // fallback para clientes sin maybeSingle (por compatibilidad)
    if (!data && !error) {
      const { data: rows, error: err } = await supabase
        .from('custom_option_overrides')
        .select('enabled, date')
        .eq('option_id', optionId)
        .eq('date', date)
        .limit(1)
      return { data: rows?.[0] || null, error: err }
    }

    return { data, error }
  }

  const setCustomOptionOverride = async ({ optionId, date, enabled }) => {
    invalidateCache()
    const payload = { option_id: optionId, date, enabled }
    const { data, error } = await supabase
      .from('custom_option_overrides')
      .upsert(payload, { onConflict: 'option_id,date' })
      .select()
    return { data, error }
  }

  return {
    getCustomOptions,
    getVisibleCustomOptions,
    createCustomOption,
    updateCustomOption,
    deleteCustomOption,
    updateCustomOptionsOrder,
    getCustomOptionOverride,
    setCustomOptionOverride
  }
}

