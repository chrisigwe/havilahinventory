import { supabase } from './supabase'

export async function loadBootstrap() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // accept both identity mappings: explicit auth_user_id link,
  // or innflow-style staff.id === auth uid
  const { data: staff, error: e1 } = await supabase
    .from('staff').select('*')
    .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
    .eq('is_active', true).limit(1).maybeSingle()
  if (e1) throw e1
  if (!staff) return { staff: null }
  const b = staff.branch_id
  const [locs, tiers, methods, items, assigned] = await Promise.all([
    supabase.from('stock_locations').select('*').eq('branch_id', b).order('sort_order'),
    supabase.from('branch_price_tiers').select('tier').eq('branch_id', b),
    supabase.from('branch_payment_methods').select('method').eq('branch_id', b),
    supabase.from('stock_items').select('*').eq('branch_id', b).eq('is_active', true).order('name'),
    supabase.from('staff_locations').select('location_id').eq('staff_id', staff.id),
  ])
  for (const r of [locs, tiers, methods, items]) if (r.error) throw r.error

  // Departments this person works. Storekeepers and managers see all;
  // so does anyone with no assignment yet. The store itself is only
  // shown to roles that handle it.
  const OVERSEER = ['storekeeper', 'manager', 'gm', 'admin']
  const mine = new Set((assigned?.data || []).map(r => r.location_id))
  const seesAll = OVERSEER.includes(staff.role) || mine.size === 0
  const visible = seesAll
    ? locs.data
    : locs.data.filter(l => mine.has(l.id))

  return {
    staff,
    seesAll,
    allLocations: locs.data,
    locations: visible,
    tiers: tiers.data.map(t => t.tier),
    methods: methods.data.map(m => m.method),
    items: items.data,
  }
}

export async function loadStockMap(branchId) {
  const { data, error } = await supabase
    .from('v_stock_on_hand')
    .select('stock_item_id, location_id, qty_on_hand')
    .eq('branch_id', branchId)
  if (error) throw error
  const map = {}
  for (const r of data) map[`${r.stock_item_id}:${r.location_id}`] = Number(r.qty_on_hand)
  return map
}

// most-sold item ids over the last 14 days, for picker ordering
export async function loadPopular(branchId, sinceDate) {
  const { data, error } = await supabase
    .from('sales').select('stock_item_id, qty')
    .eq('branch_id', branchId).gte('business_date', sinceDate)
  if (error) throw error
  const c = {}
  for (const r of data) c[r.stock_item_id] = (c[r.stock_item_id] || 0) + Number(r.qty)
  return c
}

export async function loadToday(branchId, date) {
  const { data, error } = await supabase
    .from('sales')
    .select('id, stock_item_id, location_id, tier, qty, unit_price, amount, created_at')
    .eq('branch_id', branchId).eq('business_date', date)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function saveSale({ staff, item, locationId, tier, qty, unitPrice, payments, date }) {
  const { data: sale, error } = await supabase.from('sales').insert({
    branch_id: staff.branch_id,
    business_date: date,
    occurred_at: new Date().toISOString(),
    stock_item_id: item.id,
    location_id: locationId,
    tier, qty, unit_price: unitPrice,
    recorded_by: staff.id,
  }).select('id').single()
  if (error) throw error
  const rows = payments.filter(p => p.amount > 0)
    .map(p => ({ sale_id: sale.id, method: p.method, amount: p.amount }))
  if (rows.length) {
    const { error: e2 } = await supabase.from('sale_payments').insert(rows)
    if (e2) throw e2
  }
  return sale.id
}

export async function saveWriteoff({ staff, item, locationId, kind, qty, unitValue, note, date }) {
  const { error } = await supabase.from('stock_movements').insert({
    branch_id: staff.branch_id,
    stock_item_id: item.id,
    movement_type: kind, // 'complimentary' | 'damage'
    from_location: locationId,
    to_location: null,
    qty, unit_cost: unitValue,
    business_date: date,
    occurred_at: new Date().toISOString(),
    recorded_by: staff.id,
    is_migrated: false,
    note: note || (kind === 'damage' ? 'damaged' : 'PR / complimentary'),
  })
  if (error) throw error
}
