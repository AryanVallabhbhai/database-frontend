import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  createOrder,
  customerHasRewardsProfile,
  findCustomerById,
  findCustomersByName,
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
  hasRewardsProfile: boolean
}

type RewardsLookupStatus = 'idle' | 'found' | 'missing' | 'error'

const orderMethods: OrderMethod[] = ['dine-in', 'online', 'delivery']
const paymentMethods: PaymentMethod[] = ['card', 'cash', 'giftcard']

function getLocalDatetimeValue() {
  const date = new Date()
  date.setMinutes(0, 0, 0)
  const timezoneOffset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16)
}

function createInitialOrderForm(): OrderFormState {
  return {
    customerId: '',
    customerName: '',
    orderId: '',
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

  return Math.floor(total)
}

function namesMatch(firstName: string, secondName: string) {
  return firstName.trim().toLowerCase() === secondName.trim().toLowerCase()
}

async function resolveOrderCustomer(form: OrderFormState): Promise<ResolvedOrderCustomer> {
  const customerIdText = form.customerId.trim()
  const customerName = form.customerName.trim()

  if (customerIdText) {
    const customerId = Number(customerIdText)
    const existingCustomer = await findCustomerById(customerId)

    if (!customerName && !existingCustomer) {
      throw new Error('Customer name is required when the Customer ID is not already in the database.')
    }

    if (customerName && existingCustomer && !namesMatch(customerName, existingCustomer.name)) {
      throw new Error(
        `Customer ID ${customerId} belongs to ${existingCustomer.name}. Clear the customer name or enter the matching customer.`,
      )
    }

    const hasRewardsProfile = await customerHasRewardsProfile(customerId)

    return {
      customerId,
      customerName: existingCustomer?.name || customerName,
      hasRewardsProfile,
    }
  }

  const matches = await findCustomersByName(customerName)

  if (matches.length === 0) {
    throw new Error('No customer with that name was found. Enter a Customer ID to identify the customer.')
  }

  if (matches.length > 1) {
    throw new Error('Multiple customers have that name. Enter the Customer ID to choose the right customer.')
  }

  const customer = matches[0]
  const hasRewardsProfile = await customerHasRewardsProfile(customer.customerId)

  return {
    customerId: customer.customerId,
    customerName: customer.name,
    hasRewardsProfile,
  }
}

function validateOrderForm(form: OrderFormState) {
  const errors: string[] = []
  const orderHour = getHourFromDatetimeLocal(form.orderedAt)
  const hasCustomerId = Boolean(form.customerId.trim())
  const hasCustomerName = Boolean(form.customerName.trim())

  if (!hasCustomerId && !hasCustomerName) {
    errors.push('Enter either Customer ID or customer name.')
  }

  if (hasCustomerId && !isWholeNumberAtLeast(form.customerId, 1)) {
    errors.push('Customer ID must be a positive whole number.')
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

  useEffect(() => {
    let didCancel = false

    async function checkRewardsProfile() {
      const customerIdText = form.customerId.trim()

      if (!customerIdText || !isWholeNumberAtLeast(customerIdText, 1)) {
        setCheckingRewardsProfile(false)
        setRewardsLookupStatus('idle')
        setForm((current) =>
          current.hasRewardsProfile ? { ...current, hasRewardsProfile: false } : current,
        )
        return
      }

      setCheckingRewardsProfile(true)
      setRewardsLookupStatus('idle')

      try {
        const hasRewardsProfile = await customerHasRewardsProfile(Number(customerIdText))

        if (didCancel) {
          return
        }

        setForm((current) =>
          current.hasRewardsProfile === hasRewardsProfile
            ? current
            : { ...current, hasRewardsProfile },
        )
        setRewardsLookupStatus(hasRewardsProfile ? 'found' : 'missing')
      } catch {
        if (didCancel) {
          return
        }

        setForm((current) =>
          current.hasRewardsProfile ? { ...current, hasRewardsProfile: false } : current,
        )
        setRewardsLookupStatus('error')
      } finally {
        if (!didCancel) {
          setCheckingRewardsProfile(false)
        }
      }
    }

    checkRewardsProfile()

    return () => {
      didCancel = true
    }
  }, [form.customerId])

  const calculatedItemsTotal = useMemo(() => {
    return calculateItemsTotal(form.items, menuItems)
  }, [form.items, menuItems])

  const hasValidCustomerId = isWholeNumberAtLeast(form.customerId, 1)
  const hasRewardsProfileForCustomer = hasValidCustomerId && form.hasRewardsProfile

  const pointsEarned = useMemo(() => {
    return calculatePointsEarned(form.total, hasRewardsProfileForCustomer)
  }, [form.total, hasRewardsProfileForCustomer])

  const rewardsLookupLabel = useMemo(() => {
    if (!form.customerId.trim()) {
      return 'Enter Customer ID to check rewards'
    }

    if (!hasValidCustomerId) {
      return 'Enter a valid Customer ID to check rewards'
    }

    if (checkingRewardsProfile) {
      return 'Checking rewards profile'
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

    return 'Rewards profile'
  }, [checkingRewardsProfile, form.customerId, hasValidCustomerId, rewardsLookupStatus])

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

      setForm((current) => ({
        ...current,
        customerId: String(resolvedCustomer.customerId),
        customerName: resolvedCustomer.customerName,
        hasRewardsProfile: resolvedCustomer.hasRewardsProfile,
      }))

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

      setForm(createInitialOrderForm())
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
        <h1>Record a restaurant order</h1>
        <p>
          Starts with the ordered items, then records order details, customer lookup, and serving
          employees in one transactional database request.
        </p>
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
            <div className="computed-field">
              <span>Points earned</span>
              <strong>{pointsEarned}</strong>
            </div>
          </div>
        </section>

        <section className="form-section" aria-labelledby="customer-info-heading">
          <h2 id="customer-info-heading">Customer info</h2>
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
              <span>Customer name</span>
              <input
                value={form.customerName}
                onChange={(event) => setForm({ ...form, customerName: event.target.value })}
                placeholder="Alice Johnson"
              />
            </label>
            <label className="check-field">
              <input checked={hasRewardsProfileForCustomer} readOnly type="checkbox" />
              <span>{rewardsLookupLabel}</span>
            </label>
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
