import { useEffect, useState } from 'react'
import { listRewardsMemberships, type RewardsMembershipSummary } from '../lib/restaurantRepository'

export default function MembershipPage() {
  const [memberships, setMemberships] = useState<RewardsMembershipSummary[]>([])
  const [filters, setFilters] = useState({ name: '', email: '', phone: '' })

  useEffect(() => {
    let active = true

    void listRewardsMemberships()
      .then((rows) => {
        if (active) setMemberships(rows)
      })
      .catch(() => {
        if (active) setMemberships([])
      })

    return () => {
      active = false
    }
  }, [])

  const filteredMemberships = memberships.filter((membership) => {
    const nameMatch = !filters.name || membership.customerName.toLowerCase().includes(filters.name.toLowerCase())
    const emailMatch = !filters.email || (membership.email?.toLowerCase().includes(filters.email.toLowerCase()) ?? false)
    const phoneMatch = !filters.phone || (membership.phoneNumber?.toLowerCase().includes(filters.phone.toLowerCase()) ?? false)

    return nameMatch && emailMatch && phoneMatch
  })
  return (
    <section className="page-panel">
      <div className="page-heading">
        <span className="eyebrow">Rewards memberships</span>
        <h1>View profiles</h1>
      </div>
      <section className="form-section" aria-labelledby="membership-list-heading">
        <div className="section-title-row">
          <h2 id="membership-list-heading">All rewards memberships</h2>
          <span className="section-count">{filteredMemberships.length} records</span>
        </div>

        <div className="filter-row">
          <label className="field">
            <span>Name</span>
            <input
              value={filters.name}
              onChange={(event) => setFilters((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Search by customer name"
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              value={filters.email}
              onChange={(event) => setFilters((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="Search by email"
            />
          </label>
          <label className="field">
            <span>Phone</span>
            <input
              value={filters.phone}
              onChange={(event) => setFilters((prev) => ({ ...prev, phone: event.target.value }))}
              placeholder="Search by phone"
            />
          </label>
        </div>

        {filteredMemberships.length > 0 ? (
          <table className="orders-table">
            <thead>
              <tr>
                <th>Customer ID</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {filteredMemberships.map((membership) => (
                <tr key={membership.customerId}>
                  <td>{membership.customerId}</td>
                  <td>{membership.customerName}</td>
                  <td>{membership.phoneNumber ?? '—'}</td>
                  <td>{membership.email ?? '—'}</td>
                  <td>{membership.joinDate ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty-state">No rewards memberships were found.</p>
        )}
      </section>
    </section>
  )
}
