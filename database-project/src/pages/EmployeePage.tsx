import { useState, type FormEvent } from 'react'
import {
  formatErrorList,
  isExactDigits,
  isMoneyAtLeast,
  isSingleDigit,
  isTwoLetterState,
  isValidPhone,
} from '../lib/formValidation'
import { createEmployee } from '../lib/restaurantRepository'
import type {
  ChefSpecialization,
  CreateEmployeeInput,
  EmployeeRole,
  EmployeeShift,
} from '../lib/restaurantTypes'
import { getErrorMessage, idleStatus, type PageStatus } from './pageStatus'

type EmployeeFormState = {
  employeeId: string
  name: string
  hireDate: string
  phoneNumber: string
  addressNumber: string
  street: string
  city: string
  state: string
  zipcode: string
  hoursWorked: string
  shift: EmployeeShift
  role: EmployeeRole
  managerSalary: string
  officeNumber: string
  chefWage: string
  stationNumber: string
  chefSpecialization: ChefSpecialization
  serverWage: string
  sectionNumber: string
  cashierWage: string
  registerNumber: string
}

const roles: EmployeeRole[] = ['Manager', 'Chef', 'Server', 'Cashier']
const shifts: EmployeeShift[] = ['Morning', 'Night']
const chefSpecializations: ChefSpecialization[] = ['appetizer', 'entree', 'dessert', 'drink']

function getToday() {
  return new Date().toISOString().slice(0, 10)
}

function createInitialEmployeeForm(): EmployeeFormState {
  return {
    employeeId: '',
    name: '',
    hireDate: getToday(),
    phoneNumber: '',
    addressNumber: '',
    street: '',
    city: '',
    state: 'TX',
    zipcode: '',
    hoursWorked: '',
    shift: 'Morning',
    role: 'Server',
    managerSalary: '',
    officeNumber: '',
    chefWage: '',
    stationNumber: '',
    chefSpecialization: 'entree',
    serverWage: '',
    sectionNumber: '',
    cashierWage: '',
    registerNumber: '',
  }
}

function validateBaseEmployee(form: EmployeeFormState) {
  const errors: string[] = []
  const hoursWorked = Number(form.hoursWorked)

  if (!isExactDigits(form.employeeId, 5)) {
    errors.push('Employee ID must be exactly 5 digits.')
  }

  if (!form.name.trim()) {
    errors.push('Employee name is required.')
  }

  if (!form.hireDate) {
    errors.push('Hire date is required.')
  }

  if (!isValidPhone(form.phoneNumber)) {
    errors.push('Phone number must use a valid phone format.')
  }

  if (!Number.isInteger(Number(form.addressNumber)) || Number(form.addressNumber) <= 0) {
    errors.push('Address number must be a positive whole number.')
  }

  if (!form.street.trim()) {
    errors.push('Street is required.')
  }

  if (!form.city.trim()) {
    errors.push('City is required.')
  }

  if (!isTwoLetterState(form.state)) {
    errors.push('State must be a 2-letter postal code.')
  }

  if (!isExactDigits(form.zipcode, 5)) {
    errors.push('Zipcode must be exactly 5 digits.')
  }

  if (!Number.isFinite(hoursWorked) || hoursWorked < 0 || hoursWorked > 40) {
    errors.push('Hours worked must be between 0 and 40.')
  }

  return errors
}

function validateRole(form: EmployeeFormState) {
  const errors: string[] = []

  if (form.role === 'Manager') {
    if (!isMoneyAtLeast(form.managerSalary, 0)) {
      errors.push('Manager salary must be greater than or equal to 0.')
    }

    if (!isSingleDigit(form.officeNumber)) {
      errors.push('Manager office number must be a single digit.')
    }
  }

  if (form.role === 'Chef') {
    if (!isMoneyAtLeast(form.chefWage, 0)) {
      errors.push('Chef wage must be greater than or equal to 0.')
    }

    if (!isSingleDigit(form.stationNumber)) {
      errors.push('Chef station number must be a single digit.')
    }
  }

  if (form.role === 'Server') {
    if (!isMoneyAtLeast(form.serverWage, 0)) {
      errors.push('Server wage must be greater than or equal to 0.')
    }

    if (!isSingleDigit(form.sectionNumber)) {
      errors.push('Server section number must be a single digit.')
    }
  }

  if (form.role === 'Cashier') {
    if (!isMoneyAtLeast(form.cashierWage, 0)) {
      errors.push('Cashier wage must be greater than or equal to 0.')
    }

    if (!isSingleDigit(form.registerNumber)) {
      errors.push('Cashier register number must be a single digit.')
    }
  }

  return errors
}

function validateEmployeeForm(form: EmployeeFormState) {
  return [...validateBaseEmployee(form), ...validateRole(form)]
}

function toEmployeeInput(form: EmployeeFormState): CreateEmployeeInput {
  const base = {
    employeeId: Number(form.employeeId),
    name: form.name.trim(),
    hireDate: form.hireDate,
    phoneNumber: form.phoneNumber.trim(),
    addressNumber: Number(form.addressNumber),
    street: form.street.trim(),
    city: form.city.trim(),
    state: form.state.trim().toUpperCase(),
    zipcode: Number(form.zipcode),
    hoursWorked: Number(form.hoursWorked),
    shift: form.shift,
  }

  switch (form.role) {
    case 'Manager':
      return {
        ...base,
        roleDetails: {
          role: 'Manager',
          salary: Number(form.managerSalary),
          officeNumber: Number(form.officeNumber),
        },
      }
    case 'Chef':
      return {
        ...base,
        roleDetails: {
          role: 'Chef',
          wage: Number(form.chefWage),
          stationNumber: Number(form.stationNumber),
          specialization: form.chefSpecialization,
        },
      }
    case 'Server':
      return {
        ...base,
        roleDetails: {
          role: 'Server',
          wage: Number(form.serverWage),
          sectionNumber: Number(form.sectionNumber),
        },
      }
    case 'Cashier':
      return {
        ...base,
        roleDetails: {
          role: 'Cashier',
          wage: Number(form.cashierWage),
          registerNumber: Number(form.registerNumber),
        },
      }
  }
}

export default function EmployeePage() {
  const [form, setForm] = useState(createInitialEmployeeForm)
  const [status, setStatus] = useState<PageStatus>(idleStatus)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const errors = validateEmployeeForm(form)
    if (errors.length > 0) {
      setStatus({ tone: 'error', message: formatErrorList(errors) })
      return
    }

    setSubmitting(true)
    setStatus(idleStatus)

    try {
      await createEmployee(toEmployeeInput(form))
      setForm(createInitialEmployeeForm())
      setStatus({ tone: 'success', message: 'Employee and role specialization were saved.' })
    } catch (error) {
      setStatus({ tone: 'error', message: getErrorMessage(error) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="page-panel">
      <div className="page-heading">
        <span className="eyebrow">Employee information</span>
        <h1>Add an employee and one role</h1>
        <p>
          Inserts the employee supertype row and exactly one specialization row for manager, chef,
          server, or cashier.
        </p>
      </div>

      {status.tone !== 'idle' && (
        <div className={`status-banner ${status.tone}`} role="status">
          {status.message}
        </div>
      )}

      <form className="data-form" onSubmit={handleSubmit}>
        <section className="form-section" aria-labelledby="employee-base-heading">
          <h2 id="employee-base-heading">Employee</h2>
          <div className="form-grid">
            <label className="field">
              <span>Employee ID</span>
              <input
                value={form.employeeId}
                onChange={(event) => setForm({ ...form, employeeId: event.target.value })}
                inputMode="numeric"
                maxLength={5}
                placeholder="10009"
              />
            </label>
            <label className="field">
              <span>Name</span>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Emma Thompson"
              />
            </label>
            <label className="field">
              <span>Hire date</span>
              <input
                value={form.hireDate}
                onChange={(event) => setForm({ ...form, hireDate: event.target.value })}
                type="date"
              />
            </label>
            <label className="field">
              <span>Phone number</span>
              <input
                value={form.phoneNumber}
                onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })}
                placeholder="2145550201"
              />
            </label>
            <label className="field">
              <span>Address number</span>
              <input
                value={form.addressNumber}
                onChange={(event) => setForm({ ...form, addressNumber: event.target.value })}
                inputMode="numeric"
                placeholder="1234"
              />
            </label>
            <label className="field">
              <span>Street</span>
              <input
                value={form.street}
                onChange={(event) => setForm({ ...form, street: event.target.value })}
                placeholder="Oak Street"
              />
            </label>
            <label className="field">
              <span>City</span>
              <input
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
                placeholder="Garland"
              />
            </label>
            <label className="field">
              <span>State</span>
              <input
                value={form.state}
                onChange={(event) =>
                  setForm({ ...form, state: event.target.value.toUpperCase() })
                }
                maxLength={2}
                placeholder="TX"
              />
            </label>
            <label className="field">
              <span>Zipcode</span>
              <input
                value={form.zipcode}
                onChange={(event) => setForm({ ...form, zipcode: event.target.value })}
                inputMode="numeric"
                maxLength={5}
                placeholder="75040"
              />
            </label>
            <label className="field">
              <span>Hours worked</span>
              <input
                value={form.hoursWorked}
                onChange={(event) => setForm({ ...form, hoursWorked: event.target.value })}
                inputMode="decimal"
                placeholder="40"
              />
            </label>
            <label className="field">
              <span>Shift</span>
              <select
                value={form.shift}
                onChange={(event) =>
                  setForm({ ...form, shift: event.target.value as EmployeeShift })
                }
              >
                {shifts.map((shift) => (
                  <option key={shift} value={shift}>
                    {shift}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Role</span>
              <select
                value={form.role}
                onChange={(event) => setForm({ ...form, role: event.target.value as EmployeeRole })}
              >
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="form-section" aria-labelledby="employee-role-heading">
          <h2 id="employee-role-heading">{form.role} details</h2>

          {form.role === 'Manager' && (
            <div className="form-grid compact-grid">
              <label className="field">
                <span>Salary</span>
                <input
                  value={form.managerSalary}
                  onChange={(event) => setForm({ ...form, managerSalary: event.target.value })}
                  inputMode="decimal"
                  placeholder="75000.00"
                />
              </label>
              <label className="field">
                <span>Office number</span>
                <input
                  value={form.officeNumber}
                  onChange={(event) => setForm({ ...form, officeNumber: event.target.value })}
                  inputMode="numeric"
                  maxLength={1}
                  placeholder="1"
                />
              </label>
            </div>
          )}

          {form.role === 'Chef' && (
            <div className="form-grid compact-grid">
              <label className="field">
                <span>Wage</span>
                <input
                  value={form.chefWage}
                  onChange={(event) => setForm({ ...form, chefWage: event.target.value })}
                  inputMode="decimal"
                  placeholder="28.50"
                />
              </label>
              <label className="field">
                <span>Station number</span>
                <input
                  value={form.stationNumber}
                  onChange={(event) => setForm({ ...form, stationNumber: event.target.value })}
                  inputMode="numeric"
                  maxLength={1}
                  placeholder="1"
                />
              </label>
              <label className="field">
                <span>Specialization</span>
                <select
                  value={form.chefSpecialization}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      chefSpecialization: event.target.value as ChefSpecialization,
                    })
                  }
                >
                  {chefSpecializations.map((specialization) => (
                    <option key={specialization} value={specialization}>
                      {specialization}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {form.role === 'Server' && (
            <div className="form-grid compact-grid">
              <label className="field">
                <span>Wage</span>
                <input
                  value={form.serverWage}
                  onChange={(event) => setForm({ ...form, serverWage: event.target.value })}
                  inputMode="decimal"
                  placeholder="12.50"
                />
              </label>
              <label className="field">
                <span>Section number</span>
                <input
                  value={form.sectionNumber}
                  onChange={(event) => setForm({ ...form, sectionNumber: event.target.value })}
                  inputMode="numeric"
                  maxLength={1}
                  placeholder="1"
                />
              </label>
            </div>
          )}

          {form.role === 'Cashier' && (
            <div className="form-grid compact-grid">
              <label className="field">
                <span>Wage</span>
                <input
                  value={form.cashierWage}
                  onChange={(event) => setForm({ ...form, cashierWage: event.target.value })}
                  inputMode="decimal"
                  placeholder="13.00"
                />
              </label>
              <label className="field">
                <span>Register number</span>
                <input
                  value={form.registerNumber}
                  onChange={(event) => setForm({ ...form, registerNumber: event.target.value })}
                  inputMode="numeric"
                  maxLength={1}
                  placeholder="1"
                />
              </label>
            </div>
          )}
        </section>

        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save employee'}
          </button>
        </div>
      </form>
    </section>
  )
}
