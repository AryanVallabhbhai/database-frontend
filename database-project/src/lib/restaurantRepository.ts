import { executeBatch, type SqlStatement } from './db'
import type {
  CreateEmployeeInput,
  CreateMembershipInput,
  CreateOrderInput,
  EmployeeRoleDetails,
} from './restaurantTypes'

function nullableText(value: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function toSqlDateTime(value: string) {
  return value.includes('T') ? `${value.replace('T', ' ')}:00` : value
}

function customerUpsert(customerId: number, customerName: string): SqlStatement {
  return {
    sql: `
      INSERT INTO customer (customer_id, name)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE name = VALUES(name)
    `,
    params: [customerId, customerName],
  }
}

function employeeRoleInsert(employeeId: number, roleDetails: EmployeeRoleDetails): SqlStatement {
  switch (roleDetails.role) {
    case 'Manager':
      return {
        sql: 'INSERT INTO manager (employee_id, salary, office_number) VALUES (?, ?, ?)',
        params: [employeeId, roleDetails.salary, roleDetails.officeNumber],
      }
    case 'Chef':
      return {
        sql: 'INSERT INTO chef (employee_id, wage, station_number, specialization) VALUES (?, ?, ?, ?)',
        params: [
          employeeId,
          roleDetails.wage,
          roleDetails.stationNumber,
          roleDetails.specialization,
        ],
      }
    case 'Server':
      return {
        sql: 'INSERT INTO server (employee_id, wage, section_number) VALUES (?, ?, ?)',
        params: [employeeId, roleDetails.wage, roleDetails.sectionNumber],
      }
    case 'Cashier':
      return {
        sql: 'INSERT INTO cashier (employee_id, wage, register_number) VALUES (?, ?, ?)',
        params: [employeeId, roleDetails.wage, roleDetails.registerNumber],
      }
  }
}

export function createOrder(input: CreateOrderInput) {
  const statements: SqlStatement[] = [
    customerUpsert(input.customerId, input.customerName),
    {
      sql: `
        INSERT INTO orders
          (order_id, total, time, method, payment, points_earned, customer_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        input.orderId,
        input.total,
        toSqlDateTime(input.time),
        input.method,
        input.payment,
        input.pointsEarned,
        input.customerId,
      ],
    },
    ...input.items.map((item) => ({
      sql: 'INSERT INTO contain (order_id, item_id, quantity) VALUES (?, ?, ?)',
      params: [input.orderId, item.itemId, item.quantity],
    })),
    ...input.servedBy.map((staff) => ({
      sql: 'INSERT INTO serve (employee_id, order_id, notes) VALUES (?, ?, ?)',
      params: [staff.employeeId, input.orderId, nullableText(staff.notes)],
    })),
  ]

  return executeBatch(statements)
}

export function createMembership(input: CreateMembershipInput) {
  return executeBatch([
    customerUpsert(input.customerId, input.customerName),
    {
      sql: `
        INSERT INTO rewards_profile
          (customer_id, phone_number, email, current_points, join_date, points_redeemed)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          phone_number = VALUES(phone_number),
          email = VALUES(email),
          current_points = VALUES(current_points),
          join_date = VALUES(join_date),
          points_redeemed = VALUES(points_redeemed)
      `,
      params: [
        input.customerId,
        nullableText(input.phoneNumber),
        nullableText(input.email),
        input.currentPoints,
        input.joinDate,
        input.pointsRedeemed,
      ],
    },
  ])
}

export function createEmployee(input: CreateEmployeeInput) {
  return executeBatch([
    {
      sql: `
        INSERT INTO employee
          (
            employee_id,
            name,
            hire_date,
            phone_number,
            address_number,
            street,
            city,
            state,
            zipcode,
            hours_worked,
            shift
          )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      params: [
        input.employeeId,
        input.name,
        input.hireDate,
        input.phoneNumber,
        input.addressNumber,
        input.street,
        input.city,
        input.state,
        input.zipcode,
        input.hoursWorked,
        input.shift,
      ],
    },
    employeeRoleInsert(input.employeeId, input.roleDetails),
  ])
}
