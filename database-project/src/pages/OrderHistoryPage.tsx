import { useEffect, useMemo, useState } from 'react'
import {
  listOrderHistory,
  getOrderDetails,
  customerHasRewardsProfile,
  type OrderHistoryItem,
  type OrderDetailItem,
} from '../lib/restaurantRepository'
import { getErrorMessage, idleStatus, type PageStatus } from './pageStatus'

type FilterState = {
  orderId: string
  customerId: string
  customerName: string
  email: string
  phoneNumber: string
}

function createInitialFilterState(): FilterState {
  return {
    orderId: '',
    customerId: '',
    customerName: '',
    email: '',
    phoneNumber: '',
  }
}

export default function OrderHistoryPage() {
  const [orders, setOrders] = useState<OrderHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<PageStatus>(idleStatus)
  const [filters, setFilters] = useState(createInitialFilterState)
  const [expanded, setExpanded] = useState<
    Record<
      number,
      { loading: boolean; items: OrderDetailItem[] | null; total: number | null; hasRewards: boolean | null }
    >
  >({})

  // Load orders on mount
  useEffect(() => {
    async function loadOrders() {
      setLoading(true)
      try {
        const data = await listOrderHistory()
        setOrders(data)
        setStatus(idleStatus)
      } catch (error) {
        setStatus({
          tone: 'error',
          message: `Failed to load order history. ${getErrorMessage(error)}`,
        })
      } finally {
        setLoading(false)
      }
    }

    loadOrders()
  }, [])

  // Filter orders based on current filter state
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const orderIdMatch =
        !filters.orderId || order.orderId.toString().includes(filters.orderId)
      const customerIdMatch =
        !filters.customerId || order.customerId.toString().includes(filters.customerId)
      const nameMatch =
        !filters.customerName ||
        order.customerName.toLowerCase().includes(filters.customerName.toLowerCase())
      const emailMatch =
        !filters.email ||
        (order.email?.toLowerCase().includes(filters.email.toLowerCase()) ?? false)
      const phoneMatch =
        !filters.phoneNumber ||
        (order.phoneNumber?.includes(filters.phoneNumber) ?? false)

      return orderIdMatch && customerIdMatch && nameMatch && emailMatch && phoneMatch
    })
  }, [orders, filters])

  function handleClearFilters() {
    setFilters(createInitialFilterState())
  }

  async function toggleDetails(orderId: number, customerId: number) {
    const entry = expanded[orderId]
    if (entry) {
      // collapse
      setExpanded((prev) => {
        const copy = { ...prev }
        delete copy[orderId]
        return copy
      })
      return
    }

    // expand and fetch details
    setExpanded((prev) => ({ ...prev, [orderId]: { loading: true, items: null, total: null, hasRewards: null } }))

    try {
      const [items, hasRewards] = await Promise.all([getOrderDetails(orderId), customerHasRewardsProfile(customerId)])
      const total = items.reduce((s, it) => s + (typeof it.price === 'number' ? it.price * it.quantity : 0), 0)
      setExpanded((prev) => ({ ...prev, [orderId]: { loading: false, items, total, hasRewards } }))
    } catch (err) {
      setExpanded((prev) => ({ ...prev, [orderId]: { loading: false, items: null, total: null, hasRewards: null } }))
      setStatus({ tone: 'error', message: `Failed to load order details. ${getErrorMessage(err)}` })
    }
  }

  function formatDateTime(dateTimeStr: string) {
    const date = new Date(dateTimeStr)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="page-panel">
      <div className="page-heading">
        <div className="eyebrow">Order Management</div>
        <h1>Order History</h1>
      </div>

      {status.tone && (
        <div className={`page-status ${status.tone}`} role="status">
          {status.message}
        </div>
      )}

      <div className="filter-section">
        <fieldset className="filter-group">
          <legend>Filter Orders</legend>
          <div className="filter-row">
            <label>
              <span>Order ID</span>
              <input
                type="text"
                value={filters.orderId}
                onChange={(e) => setFilters((prev) => ({ ...prev, orderId: e.target.value }))}
                placeholder="e.g., 42"
              />
            </label>

            <label>
              <span>Customer ID</span>
              <input
                type="text"
                value={filters.customerId}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, customerId: e.target.value }))
                }
                placeholder="e.g., 123"
              />
            </label>

            <label>
              <span>Customer Name</span>
              <input
                type="text"
                value={filters.customerName}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, customerName: e.target.value }))
                }
                placeholder="e.g., John"
              />
            </label>

            <label>
              <span>Email</span>
              <input
                type="email"
                value={filters.email}
                onChange={(e) => setFilters((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="e.g., john@example.com"
              />
            </label>

            <label>
              <span>Phone</span>
              <input
                type="tel"
                value={filters.phoneNumber}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, phoneNumber: e.target.value }))
                }
                placeholder="e.g., 555-1234-1234"
              />
            </label>

            <button type="button" onClick={handleClearFilters} className="btn-secondary">
              Clear Filters
            </button>
          </div>
        </fieldset>
      </div>

      <div className="results-section">
        {loading ? (
          <div>Loading order history...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="empty-state">
            {orders.length === 0 ? 'No orders found.' : 'No orders match the selected filters.'}
          </div>
        ) : (
          <>
            <div className="results-header">
              <p>
                Showing <strong>{filteredOrders.length}</strong> of <strong>{orders.length}</strong>{' '}
                orders
              </p>
            </div>
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Date &amp; Time</th>
                  <th>Method</th>
                  <th>Payment</th>
                  <th>Customer ID</th>
                  <th>Customer Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const entry = expanded[order.orderId]
                  return (
                    <>
                      <tr key={`order-${order.orderId}`}>
                        <td>{order.orderId}</td>
                        <td>{formatDateTime(order.dateTime)}</td>
                        <td>{order.method}</td>
                        <td>{order.payment}</td>
                        <td>{order.customerId}</td>
                        <td>{order.customerName}</td>
                        <td>{order.email ?? '—'}</td>
                        <td>{order.phoneNumber ?? '—'}</td>
                        <td>
                          <button type="button" onClick={() => toggleDetails(order.orderId, order.customerId)}>
                            {entry ? 'Hide' : 'Details'}
                          </button>
                        </td>
                      </tr>
                      {entry && (
                        <tr key={`details-${order.orderId}`} className="details-row">
                          <td colSpan={9}>
                            {entry.loading ? (
                              <div>Loading details...</div>
                            ) : entry.items && entry.items.length > 0 ? (
                              <div className="details-panel">
                                <table className="details-table">
                                  <thead>
                                    <tr>
                                      <th>Item name</th>
                                      <th>Qty</th>
                                      <th>Price</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {entry.items.map((it) => (
                                      <tr key={`it-${it.itemId}`}>
                                        <td>{it.name}</td>
                                        <td>{it.quantity}</td>
                                        <td>{typeof it.price === 'number' ? `$${it.price.toFixed(2)}` : '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr>
                                      <td colSpan={2} style={{ textAlign: 'right' }}>
                                        <strong>Total:</strong>
                                      </td>
                                      <td>
                                        <strong>{entry.total !== null ? `$${entry.total.toFixed(2)}` : '—'}</strong>
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                                <div className="details-rewards" style={{ marginTop: 8 }}>
                                  Rewards member: {entry.hasRewards === null ? '—' : entry.hasRewards ? 'Yes' : 'No'}
                                </div>
                              </div>
                            ) : (
                              <div>No items found for this order.</div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
