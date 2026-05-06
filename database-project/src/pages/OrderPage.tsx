import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createOrder, listMenuItems, listServers, type MenuItemOption, type ServerOption } from '../lib/restaurantRepository'
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
    hasRewardsProfile: true,
    items: [{ itemId: '', quantity: '1' }],
    staff: [{ employeeId: '', notes: '' }],
  }
}

function validateOrderForm(form: OrderFormState) {
  const errors: string[] = []
  const orderHour = getHourFromDatetimeLocal(form.orderedAt)

  if (!isExactDigits(form.customerId, 9)) {
    errors.push('Customer ID must be exactly 9 digits.')
  }

  if (!form.customerName.trim()) {
    errors.push('Customer name is required.')
  }

  if (!isExactDigits(form.orderId, 9)) {
    errors.push('Order ID must be exactly 9 digits.')
  }

  if (!form.orderedAt || orderHour < 9 || orderHour > 22) {
    errors.push('Order time must be during operating hours, 9 AM through 10 PM.')
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

  const calculatedItemsTotal = useMemo(() => {
    return form.items.reduce((sum, item) => {
      const qty = Number(item.quantity)
      if (!Number.isFinite(qty) || qty <= 0) return sum

      const menuItem = menuItems.find((m) => String(m.itemId) === item.itemId)
      if (!menuItem || typeof (menuItem as any).price !== 'number') return sum

      return sum + (menuItem as any).price * qty
    }, 0)
  }, [form.items, menuItems])

  // Auto-update total when items change
  useEffect(() => {
    if (calculatedItemsTotal > 0) {
      setForm((current) => ({
        ...current,
        total: calculatedItemsTotal.toFixed(2),
      }))
    }
  }, [calculatedItemsTotal])

  const pointsEarned = useMemo(() => {
    const total = Number(form.total)

    if (!form.hasRewardsProfile || !Number.isFinite(total) || total <= 0) {
      return 0
    }

    return Math.floor(total)
  }, [form.hasRewardsProfile, form.total])

  function updateItem(index: number, field: keyof OrderItemRow, value: string) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }))
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
      await createOrder({
        customerId: Number(form.customerId),
        customerName: form.customerName.trim(),
        orderId: Number(form.orderId),
        total: Number(form.total),
        time: form.orderedAt,
        method: form.method,
        payment: form.payment,
        pointsEarned,
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
          Creates the customer when needed, inserts the order, then writes item quantities and
          serving employees in one transactional database request.
        </p>
      </div>

      {status.tone !== 'idle' && (
        <div className={`status-banner ${status.tone}`} role="status">
          {status.message}
        </div>
      )}

      <form className="data-form" onSubmit={handleSubmit}>
        <section className="form-section" aria-labelledby="customer-order-heading">
          <h2 id="customer-order-heading">Customer and order</h2>
          <div className="form-grid">
            <label className="field">
              <span>Customer ID</span>
              <input
                value={form.customerId}
                onChange={(event) => setForm({ ...form, customerId: event.target.value })}
                inputMode="numeric"
                maxLength={9}
                placeholder="100000001"
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
            <label className="field">
              <span>Order ID</span>
              <input
                value={form.orderId}
                onChange={(event) => setForm({ ...form, orderId: event.target.value })}
                inputMode="numeric"
                maxLength={9}
                placeholder="200000001"
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
            <label className="check-field">
              <input
                checked={form.hasRewardsProfile}
                onChange={(event) =>
                  setForm({ ...form, hasRewardsProfile: event.target.checked })
                }
                type="checkbox"
              />
              <span>Customer has a rewards profile</span>
            </label>
            <div className="computed-field">
              <span>Points earned</span>
              <strong>{pointsEarned}</strong>
            </div>
          </div>
        </section>

        <section className="form-section" aria-labelledby="items-heading">
          <div className="section-title-row">
            <h2 id="items-heading">Ordered items</h2>
            <button
              className="secondary-button"
              type="button"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  items: [...current.items, { itemId: '', quantity: '1' }],
                }))
              }
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
                        {typeof (menuItem as any).price === 'number' &&
                          ` ($${(menuItem as any).price.toFixed(2)})`}
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
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      items: current.items.filter((_, itemIndex) => itemIndex !== index),
                    }))
                  }
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
