import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  createOrder,
  ensureCustomerExists,
  findCustomerProfileByEmail,
  findCustomerProfileById,
  findCustomerProfileByPhone,
  findCustomersByName,
  getNextOrderId,
  getNextCustomerId,
  listMenuItems,
  listServers,
  type MenuItemOption,
  type ServerOption,
} from '../lib/restaurantRepository'
import type { OrderMethod, PaymentMethod } from '../lib/restaurantTypes'
import {
  formatErrorList,
  getHourFromDatetimeLocal,
  isExactDigits,
  isMoneyAtLeast,
  isValidEmail,
  isValidPhone,
  isWholeNumberAtLeast,
} from '../lib/formValidation'
import { getErrorMessage, idleStatus, type PageStatus } from './pageStatus'

type OrderItemRow = {
  itemId: string
  quantity: string
}

type StaffRow = {
  employeeId: string
  notes: string
}

type OrderFormState = {
  customerId: string
  customerName: string
  customerEmail: string
  customerPhone: string
  orderId: string
  orderedAt: string
  method: OrderMethod
  payment: PaymentMethod
  total: string
  hasRewardsProfile: boolean
  items: OrderItemRow[]
  staff: StaffRow[]
}

type ResolvedOrderCustomer = {
  customerId: number
  customerName: string
  customerEmail: string
  customerPhone: string
  hasRewardsProfile: boolean
}

type RewardsLookupStatus = 'idle' | 'checking' | 'found' | 'missing' | 'error'

const orderMethods: OrderMethod[] = ['dine-in', 'online', 'delivery']
const paymentMethods: PaymentMethod[] = ['card', 'cash', 'giftcard']

function getLocalDatetimeValue() {
  const date = new Date()
  date.setSeconds(0, 0)
  const timezoneOffset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16)
}

function createInitialOrderForm(orderId = ''): OrderFormState {
  return {
    customerId: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    orderId,
    orderedAt: getLocalDatetimeValue(),
    method: 'dine-in',
    payment: 'card',
    total: '',
    hasRewardsProfile: false,
    items: [{ itemId: '', quantity: '1' }],
    staff: [{ employeeId: '', notes: '' }],
  }
}

function calculateItemsTotal(items: OrderItemRow[], menuItems: MenuItemOption[]) {
  return items.reduce((sum, item) => {
    const quantity = Number(item.quantity)
    if (!Number.isFinite(quantity) || quantity <= 0) return sum

    const menuItem = menuItems.find((option) => String(option.itemId) === item.itemId)
    if (typeof menuItem?.price !== 'number') return sum

    return sum + menuItem.price * quantity
  }, 0)
}

function updateItemsAndTotal(
  current: OrderFormState,
  items: OrderItemRow[],
  menuItems: MenuItemOption[],
): OrderFormState {
  const calculatedTotal = calculateItemsTotal(items, menuItems)

  return {
    ...current,
    items,
    ...(calculatedTotal > 0 ? { total: calculatedTotal.toFixed(2) } : {}),
  }
}

function calculatePointsEarned(totalValue: string, hasRewardsProfile: boolean) {
  const total = Number(totalValue)

  if (!hasRewardsProfile || !Number.isFinite(total) || total <= 0) {
    return 0
  }

  const wholeDollars = Math.floor(total)
  const cents = total - wholeDollars

  return wholeDollars + (cents > 0.5 ? 1 : 0)
}

async function resolveOrderCustomer(form: OrderFormState): Promise<ResolvedOrderCustomer> {
  const customerIdText = form.customerId.trim()
  const customerName = form.customerName.trim()
  const customerEmail = form.customerEmail.trim()
  const customerPhone = form.customerPhone.trim()

  // Try to find by customer ID first
  if (customerIdText) {
    const customerId = Number(customerIdText)
    const existingCustomer = await findCustomerProfileById(customerId)

    if (existingCustomer) {
      return {
        customerId,
        customerName: existingCustomer.customerName,
        customerEmail: existingCustomer.email || customerEmail,
        customerPhone: existingCustomer.phoneNumber || customerPhone,
        hasRewardsProfile: existingCustomer.hasRewardsProfile,
      }
    }

    // ID not found - use as new ID with provided name
    return {
      customerId,
      customerName: customerName || `Customer ${customerId}`,
      customerEmail,
      customerPhone,
      hasRewardsProfile: false,
    }
  }

  // Try to find by email
  if (customerEmail) {
    const existingCustomer = await findCustomerProfileByEmail(customerEmail)

    if (existingCustomer) {
      return {
        customerId: existingCustomer.customerId,
        customerName: existingCustomer.customerName,
        customerEmail: existingCustomer.email || customerEmail,
        customerPhone: existingCustomer.phoneNumber || customerPhone,
        hasRewardsProfile: existingCustomer.hasRewardsProfile,
      }
    }

    // Email not found - generate new ID for this customer
    const nextCustomerId = await getNextCustomerId()
    return {
      customerId: nextCustomerId,
      customerName: customerName || `Customer ${nextCustomerId}`,
      customerEmail,
      customerPhone,
      hasRewardsProfile: false,
    }
  }

  // Try to find by phone
  if (customerPhone) {
    const existingCustomer = await findCustomerProfileByPhone(customerPhone)

    if (existingCustomer) {
      return {
        customerId: existingCustomer.customerId,
        customerName: existingCustomer.customerName,
        customerEmail: existingCustomer.email || customerEmail,
        customerPhone: existingCustomer.phoneNumber || customerPhone,
        hasRewardsProfile: existingCustomer.hasRewardsProfile,
      }
    }

    // Phone not found - generate new ID for this customer
    const nextCustomerId = await getNextCustomerId()
    return {
      customerId: nextCustomerId,
      customerName: customerName || `Customer ${nextCustomerId}`,
      customerEmail,
      customerPhone,
      hasRewardsProfile: false,
    }
  }

  // Only name provided - try to find by name
  if (customerName) {
    const matches = await findCustomersByName(customerName)

    if (matches.length === 1) {
      const customer = matches[0]
      const profile = await findCustomerProfileById(customer.customerId)

      return {
        customerId: customer.customerId,
        customerName: profile?.customerName || customer.name,
        customerEmail: profile?.email || '',
        customerPhone: profile?.phoneNumber || '',
        hasRewardsProfile: Boolean(profile?.hasRewardsProfile),
      }
    }

    // Name not found or multiple matches - generate new ID for this customer
    const nextCustomerId = await getNextCustomerId()
    return {
      customerId: nextCustomerId,
      customerName,
      customerEmail,
      customerPhone,
      hasRewardsProfile: false,
    }
  }

  // Should not reach here due to form validation
  throw new Error('No customer identifier provided.')
}

function validateOrderForm(form: OrderFormState) {
  const errors: string[] = []
  const orderHour = getHourFromDatetimeLocal(form.orderedAt)
  const hasCustomerId = Boolean(form.customerId.trim())
  const hasCustomerName = Boolean(form.customerName.trim())
  const hasCustomerEmail = Boolean(form.customerEmail.trim())
  const hasCustomerPhone = Boolean(form.customerPhone.trim())

  if (!hasCustomerId && !hasCustomerName && !hasCustomerEmail && !hasCustomerPhone) {
    errors.push('Enter a customer ID, email, phone number, or customer name.')
  }

  if (hasCustomerId && !isWholeNumberAtLeast(form.customerId, 1)) {
    errors.push('Customer ID must be a positive whole number.')
  }

  if (hasCustomerEmail && !isValidEmail(form.customerEmail)) {
    errors.push('Email must use the format user@domain.com.')
  }

  if (hasCustomerPhone && !isValidPhone(form.customerPhone)) {
    errors.push('Phone number must use a valid phone format.')
  }

  if (!isWholeNumberAtLeast(form.orderId, 1)) {
    errors.push('Order ID must be a positive whole number.')
  }

  if (!form.orderedAt || orderHour < 9 || orderHour >= 22) {
    errors.push('Order time must be during operating hours, 9 AM until 10 PM.')
  }

  if (!isMoneyAtLeast(form.total, 0.01)) {
    errors.push('Order total must be greater than 0.')
  }

  if (form.items.length === 0) {
    errors.push('At least one item is required.')
  }

  form.items.forEach((item, index) => {
    if (!isExactDigits(item.itemId, 4)) {
      errors.push(`Item ${index + 1} must use a 4-digit Item ID.`)
    }

    if (!isWholeNumberAtLeast(item.quantity, 1)) {
      errors.push(`Item ${index + 1} quantity must be at least 1.`)
    }
  })

  if (form.staff.length === 0) {
    errors.push('At least one serving employee is required.')
  }

  form.staff.forEach((staff, index) => {
    if (!isExactDigits(staff.employeeId, 5)) {
      errors.push(`Staff ${index + 1} must use a 5-digit Employee ID.`)
    }
  })

  return errors
}

export default function OrderPage() {
  const [form, setForm] = useState(createInitialOrderForm)
  const [status, setStatus] = useState<PageStatus>(idleStatus)
  const [submitting, setSubmitting] = useState(false)
  const [menuItems, setMenuItems] = useState<MenuItemOption[]>([])
  const [loadingMenuItems, setLoadingMenuItems] = useState(true)
  const [servers, setServers] = useState<ServerOption[]>([])
  const [loadingServers, setLoadingServers] = useState(true)
  const [checkingRewardsProfile, setCheckingRewardsProfile] = useState(false)
  const [rewardsLookupStatus, setRewardsLookupStatus] = useState<RewardsLookupStatus>('idle')

  useEffect(() => {
    let didCancel = false

    async function loadNextOrderId() {
      try {
        const nextOrderId = await getNextOrderId()

        if (!didCancel) {
          setForm((current) =>
            current.orderId ? current : { ...current, orderId: String(nextOrderId) },
          )
        }
      } catch (error) {
        if (!didCancel) {
          setStatus({
            tone: 'error',
            message: `Could not load the next order ID from the database. ${getErrorMessage(error)}`,
          })
        }
      }
    }

    loadNextOrderId()

    return () => {
      didCancel = true
    }
  }, [])

  useEffect(() => {
    let didCancel = false

    async function loadNextCustomerId() {
      try {
        const nextCustomerId = await getNextCustomerId()

        if (!didCancel) {
          setForm((current) =>
            current.customerId ? current : { ...current, customerId: String(nextCustomerId) },
          )
        }
      } catch (error) {
        if (!didCancel) {
          setStatus({
            tone: 'error',
            message: `Could not load the next customer ID from the database. ${getErrorMessage(error)}`,
          })
        }
      }
    }

    loadNextCustomerId()

    return () => {
      didCancel = true
    }
  }, [])

  useEffect(() => {
    async function loadMenuItems() {
      try {
        const items = await listMenuItems()
        setMenuItems(items)
      } catch (error) {
        setStatus({
          tone: 'error',
          message: `Could not load menu items from database. ${getErrorMessage(error)}`,
        })
      } finally {
        setLoadingMenuItems(false)
      }
    }

    async function loadServers() {
      try {
        const serverList = await listServers()
        setServers(serverList)
      } catch (error) {
        setStatus({
          tone: 'error',
          message: `Could not load servers from database. ${getErrorMessage(error)}`,
        })
      } finally {
        setLoadingServers(false)
      }
    }

    loadMenuItems()
    loadServers()
  }, [])

  async function handleCheckCustomer() {
    const customerIdText = form.customerId.trim()
    const customerEmail = form.customerEmail.trim()
    const customerPhone = form.customerPhone.trim()

    // If no search field is populated, show error
    if (!customerIdText && !customerEmail && !customerPhone) {
      setRewardsLookupStatus('missing')
      return
    }

    setCheckingRewardsProfile(true)
    setRewardsLookupStatus('checking')

    try {
      const lookupAttempts: Array<() => Promise<Awaited<ReturnType<typeof findCustomerProfileById>>>> = []

      if (customerIdText && isWholeNumberAtLeast(customerIdText, 1)) {
        lookupAttempts.push(() => findCustomerProfileById(Number(customerIdText)))
      }

      if (customerEmail && isValidEmail(customerEmail)) {
        lookupAttempts.push(() => findCustomerProfileByEmail(customerEmail))
      }

      if (customerPhone && isValidPhone(customerPhone)) {
        lookupAttempts.push(() => findCustomerProfileByPhone(customerPhone))
      }

      let lookup = null
      for (const attempt of lookupAttempts) {
        lookup = await attempt()
        if (lookup) {
          break
        }
      }

      if (!lookup) {
        // No record found - keep all fields unchanged
        setRewardsLookupStatus('missing')
        return
      }

      // Record found - populate all fields with lookup result
      setForm((current) => ({
        ...current,
        customerId: String(lookup.customerId),
        customerName: lookup.customerName,
        customerEmail: lookup.email || '',
        customerPhone: lookup.phoneNumber || '',
        hasRewardsProfile: lookup.hasRewardsProfile,
      }))
      setRewardsLookupStatus(lookup.hasRewardsProfile ? 'found' : 'missing')
    } catch {
      // Lookup error - keep all fields unchanged
      setRewardsLookupStatus('error')
    } finally {
      setCheckingRewardsProfile(false)
    }
  }

  const calculatedItemsTotal = useMemo(() => {
    return calculateItemsTotal(form.items, menuItems)
  }, [form.items, menuItems])

  const hasRewardsProfileForCustomer = form.hasRewardsProfile

  const pointsEarned = useMemo(() => {
    return calculatePointsEarned(form.total, hasRewardsProfileForCustomer)
  }, [form.total, hasRewardsProfileForCustomer])

  const rewardsLookupLabel = useMemo(() => {
    if (checkingRewardsProfile || rewardsLookupStatus === 'checking') {
      return 'Checking rewards profile...'
    }

    if (rewardsLookupStatus === 'found') {
      return 'Rewards profile found'
    }

    if (rewardsLookupStatus === 'missing') {
      return 'No rewards profile found'
    }

    if (rewardsLookupStatus === 'error') {
      return 'Rewards check unavailable'
    }

    return 'Not checked'
  }, [checkingRewardsProfile, rewardsLookupStatus])

  function updateItem(index: number, field: keyof OrderItemRow, value: string) {
    setForm((current) =>
      updateItemsAndTotal(
        current,
        current.items.map((item, itemIndex) =>
          itemIndex === index ? { ...item, [field]: value } : item,
        ),
        menuItems,
      ),
    )
  }

  function addItem() {
    setForm((current) =>
      updateItemsAndTotal(current, [...current.items, { itemId: '', quantity: '1' }], menuItems),
    )
  }

  function removeItem(index: number) {
    setForm((current) =>
      updateItemsAndTotal(
        current,
        current.items.filter((_, itemIndex) => itemIndex !== index),
        menuItems,
      ),
    )
  }

  function updateStaff(index: number, field: keyof StaffRow, value: string) {
    setForm((current) => ({
      ...current,
      staff: current.staff.map((staff, staffIndex) =>
        staffIndex === index ? { ...staff, [field]: value } : staff,
      ),
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const errors = validateOrderForm(form)
    if (errors.length > 0) {
      setStatus({ tone: 'error', message: formatErrorList(errors) })
      return
    }

    setSubmitting(true)
    setStatus(idleStatus)

    try {
      const resolvedCustomer = await resolveOrderCustomer(form)
      const resolvedPointsEarned = calculatePointsEarned(
        form.total,
        resolvedCustomer.hasRewardsProfile,
      )

      // Ensure the customer exists in the database (creates if not found)
      await ensureCustomerExists(
        resolvedCustomer.customerId,
        resolvedCustomer.customerName,
        resolvedCustomer.customerEmail || null,
        resolvedCustomer.customerPhone || null,
      )

      await createOrder({
        customerId: resolvedCustomer.customerId,
        customerName: resolvedCustomer.customerName,
        orderId: Number(form.orderId),
        total: Number(form.total),
        time: form.orderedAt,
        method: form.method,
        payment: form.payment,
        pointsEarned: resolvedPointsEarned,
        items: form.items.map((item) => ({
          itemId: Number(item.itemId),
          quantity: Number(item.quantity),
        })),
        servedBy: form.staff.map((staff) => ({
          employeeId: Number(staff.employeeId),
          notes: staff.notes.trim() || null,
        })),
      })

      setForm(createInitialOrderForm(String(Number(form.orderId) + 1)))

      setStatus({ tone: 'success', message: 'Order was submitted to the database endpoint.' })
    } catch (error) {
      setStatus({ tone: 'error', message: getErrorMessage(error) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="page-panel">
      <div className="page-heading">
        <span className="eyebrow">Order input</span>
        <h1>Take Orders
        </h1>
      </div>

      {status.tone !== 'idle' && (
        <div className={`status-banner ${status.tone}`} role="status">
          {status.message}
        </div>
      )}

      <form className="data-form" onSubmit={handleSubmit}>
        <section className="form-section" aria-labelledby="items-heading">
          <div className="section-title-row">
            <h2 id="items-heading">Ordered items</h2>
            <button
              className="secondary-button"
              type="button"
              onClick={addItem}
            >
              Add item
            </button>
          </div>

          <div className="entry-list">
            {form.items.map((item, index) => (
              <div className="line-row" key={`item-${index}`}>
                <label className="field">
                  <span>Item ID</span>
                  <select
                    value={item.itemId}
                    onChange={(event) => updateItem(index, 'itemId', event.target.value)}
                    disabled={loadingMenuItems || menuItems.length === 0}
                  >
                    <option value="">
                      {loadingMenuItems
                        ? 'Loading items...'
                        : menuItems.length === 0
                          ? 'No menu items found'
                          : 'Select an item'}
                    </option>
                    {menuItems.map((menuItem) => (
                      <option key={menuItem.itemId} value={String(menuItem.itemId)}>
                        {menuItem.itemId} - {menuItem.name}
                        {typeof menuItem.price === 'number' && ` ($${menuItem.price.toFixed(2)})`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Quantity</span>
                  <input
                    value={item.quantity}
                    onChange={(event) => updateItem(index, 'quantity', event.target.value)}
                    inputMode="numeric"
                    placeholder="1"
                  />
                </label>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Remove item ${index + 1}`}
                  title="Remove item"
                  disabled={form.items.length === 1}
                  onClick={() => removeItem(index)}
                >
                  x
                </button>
              </div>
            ))}
          </div>
          <div className="computed-field">
            <span>Items total</span>
            <strong>${calculatedItemsTotal.toFixed(2)}</strong>
          </div>
        </section>

        <section className="form-section" aria-labelledby="order-details-heading">
          <h2 id="order-details-heading">Order details</h2>
          <div className="form-grid">
            <label className="field">
              <span>Order ID</span>
              <input
                value={form.orderId}
                onChange={(event) => setForm({ ...form, orderId: event.target.value })}
                inputMode="numeric"
                placeholder="101"
              />
            </label>
            <label className="field">
              <span>Order time</span>
              <input
                value={form.orderedAt}
                onChange={(event) => setForm({ ...form, orderedAt: event.target.value })}
                type="datetime-local"
              />
            </label>
            <label className="field">
              <span>Method</span>
              <select
                value={form.method}
                onChange={(event) =>
                  setForm({ ...form, method: event.target.value as OrderMethod })
                }
              >
                {orderMethods.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Payment</span>
              <select
                value={form.payment}
                onChange={(event) =>
                  setForm({ ...form, payment: event.target.value as PaymentMethod })
                }
              >
                {paymentMethods.map((payment) => (
                  <option key={payment} value={payment}>
                    {payment}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Total</span>
              <input
                value={form.total}
                onChange={(event) => setForm({ ...form, total: event.target.value })}
                inputMode="decimal"
                placeholder="35.47"
              />
            </label>
          </div>
        </section>

        <section className="form-section" aria-labelledby="customer-info-heading">
          <div className="section-title-row">
            <h2 id="customer-info-heading">Customer info</h2>
            <button
              className="secondary-button"
              type="button"
              onClick={handleCheckCustomer}
              disabled={checkingRewardsProfile}
            >
              {checkingRewardsProfile ? 'Checking...' : 'Check customer'}
            </button>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Customer ID</span>
              <input
                value={form.customerId}
                onChange={(event) => setForm({ ...form, customerId: event.target.value })}
                inputMode="numeric"
                placeholder="53"
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                value={form.customerEmail}
                onChange={(event) => setForm({ ...form, customerEmail: event.target.value })}
                placeholder="alice.j@email.com"
                type="email"
              />
            </label>
            <label className="field">
              <span>Phone</span>
              <input
                value={form.customerPhone}
                onChange={(event) => setForm({ ...form, customerPhone: event.target.value })}
                inputMode="tel"
                placeholder="214-555-0101"
              />
            </label>
            <label className="field">
              <span>Customer name</span>
              <input
                value={form.customerName}
                onChange={(event) => setForm({ ...form, customerName: event.target.value })}
                placeholder="Alice Johnson"
              />
            </label>
            <div className="computed-field">
              <span>Rewards profile</span>
              <strong>{rewardsLookupLabel}</strong>
            </div>
            <div className="computed-field">
              <span>Points earned</span>
              <strong>{pointsEarned}</strong>
            </div>
          </div>
        </section>

        <section className="form-section" aria-labelledby="staff-heading">
          <div className="section-title-row">
            <h2 id="staff-heading">Serving employees</h2>
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  staff: [...current.staff, { employeeId: '', notes: '' }],
                }))
              }
            >
              Add employee
            </button>
          </div>

          <div className="entry-list">
            {form.staff.map((staff, index) => (
              <div className="line-row staff-row" key={`staff-${index}`}>
                <label className="field">
                  <span>Server</span>
                  <select
                    value={staff.employeeId}
                    onChange={(event) => updateStaff(index, 'employeeId', event.target.value)}
                    disabled={loadingServers || servers.length === 0}
                  >
                    <option value="">
                      {loadingServers
                        ? 'Loading servers...'
                        : servers.length === 0
                          ? 'No servers found'
                          : 'Select a server'}
                    </option>
                    {servers.map((server) => (
                      <option key={server.employeeId} value={String(server.employeeId)}>
                        {server.employeeId} - {server.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field wide-field">
                  <span>Notes</span>
                  <input
                    value={staff.notes}
                    onChange={(event) => updateStaff(index, 'notes', event.target.value)}
                    placeholder="Customer requested extra napkins"
                  />
                </label>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Remove employee ${index + 1}`}
                  title="Remove employee"
                  disabled={form.staff.length === 1}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      staff: current.staff.filter((_, staffIndex) => staffIndex !== index),
                    }))
                  }
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </section>

        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit order'}
          </button>
        </div>
      </form>
    </section>
  )
}
