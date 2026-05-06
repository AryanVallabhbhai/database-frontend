import { executeBatch, query, type SqlStatement } from './db'
import type {
  CreateEmployeeInput,
  CreateMembershipInput,
  CreateOrderInput,
  EmployeeRoleDetails,
} from './restaurantTypes'

export type MenuItemOption = {
  itemId: number
  name: string
  price?: number
}

export type ServerOption = {
  employeeId: number
  name: string
}

export type CustomerOption = {
  customerId: number
  name: string
}

function toFiniteNumber(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeMenuItem(value: unknown): MenuItemOption | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const record = value as Record<string, unknown>
  const itemId = toFiniteNumber(record.itemId ?? record.ItemID)
  const name = record.name ?? record.Name
  const price = toFiniteNumber(record.price ?? record.Price)

  if (itemId === null || typeof name !== 'string') {
    return null
  }

  return {
    itemId,
    name,
    ...(price === null ? {} : { price }),
  }
}

function normalizeMenuItems(data: unknown) {
  if (!Array.isArray(data)) {
    return null
  }

  return data
    .map(normalizeMenuItem)
    .filter((menuItem): menuItem is MenuItemOption => menuItem !== null)
}

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

export async function findCustomerById(customerId: number) {
  try {
    const rows = await query<CustomerOption>(
      `
        SELECT CustomerID AS customerId, Name AS name
        FROM Customer
        WHERE CustomerID = ?
        LIMIT 1
      `,
      [customerId],
    )

    return rows[0] ?? null
  } catch {
    const rows = await query<CustomerOption>(
      `
        SELECT customer_id AS customerId, name
        FROM customer
        WHERE customer_id = ?
        LIMIT 1
      `,
      [customerId],
    )

    return rows[0] ?? null
  }
}

export async function findCustomersByName(name: string) {
  try {
    return await query<CustomerOption>(
      `
        SELECT CustomerID AS customerId, Name AS name
        FROM Customer
        WHERE Name = ?
        ORDER BY CustomerID
      `,
      [name],
    )
  } catch {
    return query<CustomerOption>(
      `
        SELECT customer_id AS customerId, name
        FROM customer
        WHERE name = ?
        ORDER BY customer_id
      `,
      [name],
    )
  }
}

export async function customerHasRewardsProfile(customerId: number) {
  try {
    const rows = await query<{ customerId: number }>(
      `
        SELECT CustomerID AS customerId
        FROM Rewards
        WHERE CustomerID = ?
        LIMIT 1
      `,
      [customerId],
    )

    return rows.length > 0
  } catch {
    try {
      const rows = await query<{ customerId: number }>(
        `
          SELECT customer_id AS customerId
          FROM rewards_profile
          WHERE customer_id = ?
          LIMIT 1
        `,
        [customerId],
      )

      return rows.length > 0
    } catch {
      const rows = await query<{ customerId: number }>(
        `
          SELECT customer_id AS customerId
          FROM rewards
          WHERE customer_id = ?
          LIMIT 1
        `,
        [customerId],
      )

      return rows.length > 0
    }
  }
}

export async function listMenuItems() {
  // First try a local public JSON file (served by the frontend) for fast reads.
  const localMenuUrl = '/menu_items.json'
  try {
    const resp = await fetch(localMenuUrl)
    if (resp.ok) {
      const data = await resp.json()
      const items = normalizeMenuItems(data)
      if (items) {
        return items
      }
    }
  } catch {
    // ignore and fall back to backend JSON then DB
  }

  // Try backend-exported JSON (if configured)
  const backendMenuUrl = import.meta.env.VITE_MENU_JSON_URL ?? 'http://localhost:3001/menu_items.json'
  try {
    const resp2 = await fetch(backendMenuUrl)
    if (resp2.ok) {
      const data2 = await resp2.json()
      const items = normalizeMenuItems(data2)
      if (items) {
        return items
      }
    }
  } catch {
    // ignore and fall back to DB
  }

  // Fallback to querying the database via backend SQL endpoint
  try {
    return await query<MenuItemOption>(
      `
        SELECT ItemID AS itemId, Name AS name, Price AS price
        FROM Items
        ORDER BY ItemID
      `,
    )
  } catch {
    // Fallback to lowercase table name
    try {
      return await query<MenuItemOption>(
        `
          SELECT item_id AS itemId, name
          FROM items
          ORDER BY item_id
        `,
      )
    } catch {
      // Final fallback with singular form
      return query<MenuItemOption>(
        `
          SELECT item_id AS itemId, name
          FROM item
          ORDER BY item_id
        `,
      )
    }
  }
}

export async function listServers() {
  // First try a local public JSON file (served by the frontend) for fast reads.
  const localServersUrl = '/servers.json'
  try {
    const resp = await fetch(localServersUrl)
    if (resp.ok) {
      const data = await resp.json()
      if (Array.isArray(data)) {
        return data as ServerOption[]
      }
    }
  } catch {
    // ignore and fall back to backend JSON then DB
  }

  // Try backend-exported JSON
  const backendServersUrl = 'http://localhost:3001/servers.json'
  try {
    const resp2 = await fetch(backendServersUrl)
    if (resp2.ok) {
      const data2 = await resp2.json()
      if (Array.isArray(data2)) {
        return data2 as ServerOption[]
      }
    }
  } catch {
    // ignore and fall back to DB
  }

  // Fallback to querying the database for all servers
  try {
    return await query<ServerOption>(
      `
        SELECT e.employee_id AS employeeId, e.name
        FROM employee e
        WHERE e.employee_id IN (SELECT employee_id FROM server)
        ORDER BY e.employee_id
      `,
    )
  } catch {
    // Fallback with uppercase table names
    try {
      return await query<ServerOption>(
        `
          SELECT e.EmployeeID AS employeeId, e.Name AS name
          FROM Employee e
          WHERE e.EmployeeID IN (SELECT EmployeeID FROM Server)
          ORDER BY e.EmployeeID
        `,
      )
    } catch {
      // Return empty array if query fails
      return []
    }
  }
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
