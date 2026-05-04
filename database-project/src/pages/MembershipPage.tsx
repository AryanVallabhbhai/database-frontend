import { useState, type FormEvent } from 'react'
import {
  formatErrorList,
  isExactDigits,
  isValidEmail,
  isValidPhone,
  isWholeNumberAtLeast,
} from '../lib/formValidation'
import { createMembership } from '../lib/restaurantRepository'
import { getErrorMessage, idleStatus, type PageStatus } from './pageStatus'

type MembershipFormState = {
  customerId: string
  customerName: string
  phoneNumber: string
  email: string
  currentPoints: string
  joinDate: string
  pointsRedeemed: string
}

function getToday() {
  return new Date().toISOString().slice(0, 10)
}

function createInitialMembershipForm(): MembershipFormState {
  return {
    customerId: '',
    customerName: '',
    phoneNumber: '',
    email: '',
    currentPoints: '0',
    joinDate: getToday(),
    pointsRedeemed: '0',
  }
}

function validateMembershipForm(form: MembershipFormState) {
  const errors: string[] = []
  const hasPhone = Boolean(form.phoneNumber.trim())
  const hasEmail = Boolean(form.email.trim())

  if (!isExactDigits(form.customerId, 9)) {
    errors.push('Customer ID must be exactly 9 digits.')
  }

  if (!form.customerName.trim()) {
    errors.push('Customer name is required.')
  }

  if (!hasPhone && !hasEmail) {
    errors.push('A rewards profile needs at least a phone number or an email.')
  }

  if (hasPhone && !isValidPhone(form.phoneNumber)) {
    errors.push('Phone number must use a valid phone format.')
  }

  if (hasEmail && !isValidEmail(form.email)) {
    errors.push('Email must use the format user@domain.com.')
  }

  if (!isWholeNumberAtLeast(form.currentPoints, 0)) {
    errors.push('Current points must be a whole number greater than or equal to 0.')
  }

  if (!form.joinDate) {
    errors.push('Join date is required.')
  }

  if (!isWholeNumberAtLeast(form.pointsRedeemed, 0)) {
    errors.push('Points redeemed must be a whole number greater than or equal to 0.')
  }

  return errors
}

export default function MembershipPage() {
  const [form, setForm] = useState(createInitialMembershipForm)
  const [status, setStatus] = useState<PageStatus>(idleStatus)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const errors = validateMembershipForm(form)
    if (errors.length > 0) {
      setStatus({ tone: 'error', message: formatErrorList(errors) })
      return
    }

    setSubmitting(true)
    setStatus(idleStatus)

    try {
      await createMembership({
        customerId: Number(form.customerId),
        customerName: form.customerName.trim(),
        phoneNumber: form.phoneNumber.trim() || null,
        email: form.email.trim() || null,
        currentPoints: Number(form.currentPoints),
        joinDate: form.joinDate,
        pointsRedeemed: Number(form.pointsRedeemed),
      })

      setForm(createInitialMembershipForm())
      setStatus({ tone: 'success', message: 'Rewards membership was saved.' })
    } catch (error) {
      setStatus({ tone: 'error', message: getErrorMessage(error) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="page-panel">
      <div className="page-heading">
        <span className="eyebrow">Rewards memberships</span>
        <h1>Create or update a rewards profile</h1>
        <p>
          Saves the customer row first, then writes the one-to-one rewards profile with the required
          contact method and point balances.
        </p>
      </div>

      {status.tone !== 'idle' && (
        <div className={`status-banner ${status.tone}`} role="status">
          {status.message}
        </div>
      )}

      <form className="data-form" onSubmit={handleSubmit}>
        <section className="form-section" aria-labelledby="membership-customer-heading">
          <h2 id="membership-customer-heading">Customer</h2>
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
          </div>
        </section>

        <section className="form-section" aria-labelledby="membership-profile-heading">
          <h2 id="membership-profile-heading">Rewards profile</h2>
          <div className="form-grid">
            <label className="field">
              <span>Phone number</span>
              <input
                value={form.phoneNumber}
                onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })}
                placeholder="214-555-0101"
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="alice.j@email.com"
                type="email"
              />
            </label>
            <label className="field">
              <span>Current points</span>
              <input
                value={form.currentPoints}
                onChange={(event) => setForm({ ...form, currentPoints: event.target.value })}
                inputMode="numeric"
                placeholder="145"
              />
            </label>
            <label className="field">
              <span>Join date</span>
              <input
                value={form.joinDate}
                onChange={(event) => setForm({ ...form, joinDate: event.target.value })}
                type="date"
              />
            </label>
            <label className="field">
              <span>Points redeemed</span>
              <input
                value={form.pointsRedeemed}
                onChange={(event) => setForm({ ...form, pointsRedeemed: event.target.value })}
                inputMode="numeric"
                placeholder="50"
              />
            </label>
          </div>
        </section>

        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save membership'}
          </button>
        </div>
      </form>
    </section>
  )
}
