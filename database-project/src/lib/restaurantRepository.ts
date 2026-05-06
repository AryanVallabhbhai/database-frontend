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

export type CustomerProfileOption = {
  customerId: number
  customerName: string
  email: string | null
  phoneNumber: string | null
  hasRewardsProfile: boolean
}

export type OrderHistoryItem = {
  orderId: number
  dateTime: string
  method: string
  payment: string
  customerId: number
  customerName: string
  email: string | null
  phoneNumber: string | null
}

export type RewardsMembershipSummary = {
  customerId: number
  customerName: string
  email: string | null
  phoneNumber: string | null
  currentPoints: number | null
  joinDate: string | null
  pointsRedeemed: number | null
}

export type EmployeeSummary = {
  employeeId: number
  name: string
  hireDate: string | null
  phoneNumber: string
  wage: number | null
  shift: string
  role: string
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

function projectCustomerUpsert(customerId: number, customerName: string): SqlStatement {
  return {
    sql: `
      INSERT INTO Customer (CustomerID, Name)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE Name = VALUES(Name)
    `,
    params: [customerId, customerName],
  }
}

function projectRewardsUpsert(customerId: number, email: string | null, phone: string | null, joined: string): SqlStatement {
  return {
    sql: `
      INSERT INTO Rewards (CustomerID, Email, Phone_No, Joined)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE Email = VALUES(Email), Phone_No = VALUES(Phone_No)
    `,
    params: [customerId, nullableText(email), nullableText(phone), joined],
  }
}

function rewardsUpsert(customerId: number, email: string | null, phone: string | null, joinDate: string): SqlStatement {
  return {
    sql: `
      INSERT INTO rewards_profile (customer_id, email, phone_number, join_date)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE email = VALUES(email), phone_number = VALUES(phone_number), join_date = VALUES(join_date)
    `,
    params: [customerId, nullableText(email), nullableText(phone), joinDate],
  }
}

function legacyRewardsUpsert(customerId: number, email: string | null, phone: string | null, joined: string): SqlStatement {
  return {
    sql: `
      INSERT INTO rewards (customer_id, email, phone_number, Joined)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE email = VALUES(email), phone_number = VALUES(phone_number)
    `,
    params: [customerId, nullableText(email), nullableText(phone), joined],
  }
}

function toProjectOrderMethod(method: CreateOrderInput['method']) {
  switch (method) {
    case 'online':
      return 'Online'
    case 'delivery':
      return 'Delivery'
    case 'dine-in':
      return 'Dine-In'
  }
}

function toProjectPaymentMethod(payment: CreateOrderInput['payment']) {
  switch (payment) {
    case 'cash':
      return 'Cash'
    case 'card':
      return 'Card'
    case 'giftcard':
      return 'Giftcard'
  }
}

function getErrorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function shouldTryLegacyOrderSchema(error: unknown) {
  const message = getErrorText(error).toLowerCase()

  return (
    message.includes("doesn't exist") ||
    message.includes('unknown column') ||
    message.includes('unknown table')
  )
}

async function queryFirstCustomerProfile(queries: SqlStatement[]) {
  for (const statement of queries) {
    try {
      const rows = await query<CustomerProfileOption>(statement.sql, statement.params)
      return rows[0] ?? null
    } catch {
      // Try the next schema variant.
    }
  }

  return null
}

async function queryNextOrderId(queries: SqlStatement[]) {
  for (const statement of queries) {
    try {
      const rows = await query<{ nextOrderId: number }>(statement.sql, statement.params)
      return toFiniteNumber(rows[0]?.nextOrderId)
    } catch {
      // Try the next schema variant.
    }
  }

  return null
}

function employeeRoleInsertStatement(employeeId: number, roleDetails: EmployeeRoleDetails, projectSchema = true): SqlStatement {
  // projectSchema: true -> use capitalized table/column names (project schema)
  // projectSchema: false -> use lowercase legacy names
  if (projectSchema) {
    switch (roleDetails.role) {
      case 'Manager':
        return {
          sql: 'INSERT INTO Manager (EmployeeID, Salary, Office_No) VALUES (?, ?, ?)',
          params: [employeeId, roleDetails.salary, roleDetails.officeNumber],
        }
      case 'Chef':
        return {
          sql: 'INSERT INTO Chef (EmployeeID, Wage, Station_No, Specialization) VALUES (?, ?, ?, ?)',
          params: [
            employeeId,
            roleDetails.wage,
            roleDetails.stationNumber,
            roleDetails.specialization,
          ],
        }
      case 'Server':
        return {
          sql: 'INSERT INTO Server (EmployeeID, Wage, Section_No) VALUES (?, ?, ?)',
          params: [employeeId, roleDetails.wage, roleDetails.sectionNumber],
        }
      case 'Cashier':
        return {
          sql: 'INSERT INTO Cashier (EmployeeID, Wage, Register_No) VALUES (?, ?, ?)',
          params: [employeeId, roleDetails.wage, roleDetails.registerNumber],
        }
    }
  }

  // Legacy lowercase schema
  switch (roleDetails.role) {
    case 'Manager':
      return {
        sql: 'INSERT INTO Manager (EmployeeID, salary, office_no) VALUES (?, ?, ?)',
        params: [employeeId, roleDetails.salary, roleDetails.officeNumber],
      }
    case 'Chef':
      return {
        sql: 'INSERT INTO Chef (EmployeeID, Wage, Station_No, Specialization) VALUES (?, ?, ?, ?)',
        params: [
          employeeId,
          roleDetails.wage,
          roleDetails.stationNumber,
          roleDetails.specialization,
        ],
      }
    case 'Server':
      return {
        sql: 'INSERT INTO Server (EmployeeID, Wage, Section_No) VALUES (?, ?, ?)',
        params: [employeeId, roleDetails.wage, roleDetails.sectionNumber],
      }
    case 'Cashier':
      return {
        sql: 'INSERT INTO Cashier (EmployeeID, Wage, Register_No) VALUES (?, ?, ?)',
        params: [employeeId, roleDetails.wage, roleDetails.registerNumber],
      }
  }

  // Fallback no-op (shouldn't happen with valid role)
  return { sql: 'SELECT 1', params: [] }
}

function createProjectOrderStatements(input: CreateOrderInput): SqlStatement[] {
  const statements: SqlStatement[] = [
    projectCustomerUpsert(input.customerId, input.customerName),
    {
      sql: `
        INSERT INTO Orders
          (OrderID, Date_Time, Method, Payment, CustomerID)
        VALUES (?, ?, ?, ?, ?)
      `,
      params: [
        input.orderId,
        toSqlDateTime(input.time),
        toProjectOrderMethod(input.method),
        toProjectPaymentMethod(input.payment),
        input.customerId,
      ],
    },
    ...input.items.map((item) => ({
      sql: 'INSERT INTO Contain (OrderID, ItemID, Quantity) VALUES (?, ?, ?)',
      params: [input.orderId, item.itemId, item.quantity],
    })),
    ...input.servedBy.map((staff) => ({
      sql: 'INSERT INTO Serve (EmployeeID, OrderID, Notes) VALUES (?, ?, ?)',
      params: [staff.employeeId, input.orderId, nullableText(staff.notes)],
    })),
  ]

  if (input.pointsEarned > 0) {
    statements.push({
      sql: 'UPDATE Rewards SET Points = Points + ? WHERE CustomerID = ?',
      params: [input.pointsEarned, input.customerId],
    })
  }

  return statements
}

function createLegacyOrderStatements(input: CreateOrderInput): SqlStatement[] {
  return [
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
}

export async function createOrder(input: CreateOrderInput) {
  try {
    return await executeBatch(createProjectOrderStatements(input))
  } catch (error) {
    if (!shouldTryLegacyOrderSchema(error)) {
      throw error
    }

    return executeBatch(createLegacyOrderStatements(input))
  }
}

export async function ensureCustomerExists(
  customerId: number,
  customerName: string,
  email: string | null = null,
  phone: string | null = null,
) {
  // Try project schema first (Customer + Rewards)
  try {
    const statements: SqlStatement[] = [projectCustomerUpsert(customerId, customerName)]
    if (email || phone) {
      const joined = new Date().toISOString().slice(0, 10)
      statements.push(projectRewardsUpsert(customerId, email, phone, joined))
    }

    return await executeBatch(statements)
  } catch (error) {
    // Fallback to legacy customer + rewards_profile
    try {
      const statements: SqlStatement[] = [customerUpsert(customerId, customerName)]
      if (email || phone) {
        const joinDate = new Date().toISOString().slice(0, 10)
        statements.push(rewardsUpsert(customerId, email, phone, joinDate))
      }

      return await executeBatch(statements)
    } catch (_) {
      // Final fallback to legacy "rewards" table
      try {
        const statements: SqlStatement[] = [customerUpsert(customerId, customerName)]
        if (email || phone) {
          const joined = new Date().toISOString().slice(0, 10)
          statements.push(legacyRewardsUpsert(customerId, email, phone, joined))
        }

        return await executeBatch(statements)
      } catch {
        // If all fail, throw the original project error
        throw error
      }
    }
  }
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

export async function findCustomerProfileById(customerId: number) {
  return queryFirstCustomerProfile([
    {
      sql: `
        SELECT
          c.CustomerID AS customerId,
          c.Name AS customerName,
          r.Email AS email,
          r.Phone_No AS phoneNumber,
          CASE WHEN r.CustomerID IS NULL THEN 0 ELSE 1 END AS hasRewardsProfile
        FROM Customer c
        LEFT JOIN Rewards r ON r.CustomerID = c.CustomerID
        WHERE c.CustomerID = ?
        LIMIT 1
      `,
      params: [customerId],
    },
    {
      sql: `
        SELECT
          c.customer_id AS customerId,
          c.name AS customerName,
          r.email AS email,
          r.phone_number AS phoneNumber,
          CASE WHEN r.customer_id IS NULL THEN 0 ELSE 1 END AS hasRewardsProfile
        FROM customer c
        LEFT JOIN rewards_profile r ON r.customer_id = c.customer_id
        WHERE c.customer_id = ?
        LIMIT 1
      `,
      params: [customerId],
    },
    {
      sql: `
        SELECT
          c.customer_id AS customerId,
          c.name AS customerName,
          r.email AS email,
          r.phone_number AS phoneNumber,
          CASE WHEN r.customer_id IS NULL THEN 0 ELSE 1 END AS hasRewardsProfile
        FROM customer c
        LEFT JOIN rewards r ON r.customer_id = c.customer_id
        WHERE c.customer_id = ?
        LIMIT 1
      `,
      params: [customerId],
    },
  ])
}

export async function findCustomerProfileByEmail(email: string) {
  return queryFirstCustomerProfile([
    {
      sql: `
        SELECT
          c.CustomerID AS customerId,
          c.Name AS customerName,
          r.Email AS email,
          r.Phone_No AS phoneNumber,
          1 AS hasRewardsProfile
        FROM Customer c
        INNER JOIN Rewards r ON r.CustomerID = c.CustomerID
        WHERE r.Email = ?
        LIMIT 1
      `,
      params: [email],
    },
    {
      sql: `
        SELECT
          c.customer_id AS customerId,
          c.name AS customerName,
          r.email AS email,
          r.phone_number AS phoneNumber,
          1 AS hasRewardsProfile
        FROM customer c
        INNER JOIN rewards_profile r ON r.customer_id = c.customer_id
        WHERE r.email = ?
        LIMIT 1
      `,
      params: [email],
    },
    {
      sql: `
        SELECT
          c.customer_id AS customerId,
          c.name AS customerName,
          r.email AS email,
          r.phone_number AS phoneNumber,
          1 AS hasRewardsProfile
        FROM customer c
        INNER JOIN rewards r ON r.customer_id = c.customer_id
        WHERE r.email = ?
        LIMIT 1
      `,
      params: [email],
    },
  ])
}

export async function findCustomerProfileByPhone(phoneNumber: string) {
  return queryFirstCustomerProfile([
    {
      sql: `
        SELECT
          c.CustomerID AS customerId,
          c.Name AS customerName,
          r.Email AS email,
          r.Phone_No AS phoneNumber,
          1 AS hasRewardsProfile
        FROM Customer c
        INNER JOIN Rewards r ON r.CustomerID = c.CustomerID
        WHERE r.Phone_No = ?
        LIMIT 1
      `,
      params: [phoneNumber],
    },
    {
      sql: `
        SELECT
          c.customer_id AS customerId,
          c.name AS customerName,
          r.email AS email,
          r.phone_number AS phoneNumber,
          1 AS hasRewardsProfile
        FROM customer c
        INNER JOIN rewards_profile r ON r.customer_id = c.customer_id
        WHERE r.phone_number = ?
        LIMIT 1
      `,
      params: [phoneNumber],
    },
    {
      sql: `
        SELECT
          c.customer_id AS customerId,
          c.name AS customerName,
          r.email AS email,
          r.phone_number AS phoneNumber,
          1 AS hasRewardsProfile
        FROM customer c
        INNER JOIN rewards r ON r.customer_id = c.customer_id
        WHERE r.phone_number = ?
        LIMIT 1
      `,
      params: [phoneNumber],
    },
  ])
}

export async function getNextOrderId() {
  const nextOrderId = await queryNextOrderId([
    {
      sql: `
        SELECT COALESCE(MAX(OrderID), 0) + 1 AS nextOrderId
        FROM Orders
      `,
      params: [],
    },
    {
      sql: `
        SELECT COALESCE(MAX(order_id), 0) + 1 AS nextOrderId
        FROM orders
      `,
      params: [],
    },
  ])

  return nextOrderId ?? 1
}

export async function getNextCustomerId() {
  try {
    const rows = await query<{ nextCustomerId: number }>(
      `
        SELECT COALESCE(MAX(CustomerID), 0) + 1 AS nextCustomerId
        FROM Customer
      `,
    )

    return rows[0]?.nextCustomerId ?? 1
  } catch {
    try {
      const rows = await query<{ nextCustomerId: number }>(
        `
          SELECT COALESCE(MAX(customer_id), 0) + 1 AS nextCustomerId
          FROM customer
        `,
      )

      return rows[0]?.nextCustomerId ?? 1
    } catch {
      return 1
    }
  }
}

export async function listOrderHistory() {
  try {
    return await query<OrderHistoryItem>(
      `
        SELECT
          o.OrderID AS orderId,
          o.Date_Time AS dateTime,
          o.Method AS method,
          o.Payment AS payment,
          c.CustomerID AS customerId,
          c.Name AS customerName,
          r.Email AS email,
          r.Phone_No AS phoneNumber
        FROM Orders o
        INNER JOIN Customer c ON o.CustomerID = c.CustomerID
        LEFT JOIN Rewards r ON r.CustomerID = c.CustomerID
        ORDER BY o.Date_Time DESC
      `,
    )
  } catch {
    try {
      return await query<OrderHistoryItem>(
        `
          SELECT
            o.order_id AS orderId,
            o.date_time AS dateTime,
            o.method AS method,
            o.payment AS payment,
            c.customer_id AS customerId,
            c.name AS customerName,
            r.email AS email,
            r.phone_number AS phoneNumber
          FROM orders o
          INNER JOIN customer c ON o.customer_id = c.customer_id
          LEFT JOIN rewards_profile r ON r.customer_id = c.customer_id
          ORDER BY o.date_time DESC
        `,
      )
    } catch {
      return await query<OrderHistoryItem>(
        `
          SELECT
            o.order_id AS orderId,
            o.date_time AS dateTime,
            o.method AS method,
            o.payment AS payment,
            c.customer_id AS customerId,
            c.name AS customerName,
            r.email AS email,
            r.phone_number AS phoneNumber
          FROM orders o
          INNER JOIN customer c ON o.customer_id = c.customer_id
          LEFT JOIN rewards r ON r.customer_id = c.customer_id
          ORDER BY o.date_time DESC
        `,
      )
    }
  }
}

export async function listRewardsMemberships() {
  const attempts = [
    `
      SELECT
        c.CustomerID AS customerId,
        c.Name AS customerName,
        r.Email AS email,
        r.Phone_No AS phoneNumber,
        r.Points AS currentPoints,
        r.Joined AS joinDate,
        r.Redeemed AS pointsRedeemed
      FROM Customer c
      INNER JOIN Rewards r ON r.CustomerID = c.CustomerID
      ORDER BY c.CustomerID
    `,
    `
      SELECT
        c.customer_id AS customerId,
        c.name AS customerName,
        r.email AS email,
        r.phone_number AS phoneNumber,
        r.current_points AS currentPoints,
        r.join_date AS joinDate,
        r.points_redeemed AS pointsRedeemed
      FROM customer c
      INNER JOIN rewards_profile r ON r.customer_id = c.customer_id
      ORDER BY c.customer_id
    `,
    `
      SELECT
        c.customer_id AS customerId,
        c.name AS customerName,
        r.email AS email,
        r.phone_number AS phoneNumber,
        NULL AS currentPoints,
        NULL AS joinDate,
        NULL AS pointsRedeemed
      FROM customer c
      INNER JOIN rewards r ON r.customer_id = c.customer_id
      ORDER BY c.customer_id
    `,
  ]

  for (const sql of attempts) {
    try {
      return await query<RewardsMembershipSummary>(sql)
    } catch {
      // Try the next schema variant.
    }
  }

  return []
}

export async function listEmployees() {
  const attempts = [
    `
      SELECT
        e.EmployeeID AS employeeId,
        e.Name AS name,
        e.Hired AS hireDate,
        e.Phone_No AS phoneNumber,
        COALESCE(m.Salary, ch.Wage, s.Wage, c.Wage) AS wage,
        e.Shift AS shift,
        CASE
          WHEN m.EmployeeID IS NOT NULL THEN 'Manager'
          WHEN ch.EmployeeID IS NOT NULL THEN 'Chef'
          WHEN s.EmployeeID IS NOT NULL THEN 'Server'
          WHEN c.EmployeeID IS NOT NULL THEN 'Cashier'
          ELSE 'Employee'
        END AS role
      FROM Employee e
      LEFT JOIN Manager m ON m.EmployeeID = e.EmployeeID
      LEFT JOIN Chef ch ON ch.EmployeeID = e.EmployeeID
      LEFT JOIN Server s ON s.EmployeeID = e.EmployeeID
      LEFT JOIN Cashier c ON c.EmployeeID = e.EmployeeID
      ORDER BY e.EmployeeID
    `,
    `
      SELECT
        e.employee_id AS employeeId,
        e.name AS name,
        e.hire_date AS hireDate,
        e.phone_number AS phoneNumber,
        COALESCE(m.salary, ch.wage, s.wage, c.wage) AS wage,
        e.shift AS shift,
        CASE
          WHEN m.employee_id IS NOT NULL THEN 'Manager'
          WHEN ch.employee_id IS NOT NULL THEN 'Chef'
          WHEN s.employee_id IS NOT NULL THEN 'Server'
          WHEN c.employee_id IS NOT NULL THEN 'Cashier'
          ELSE 'Employee'
        END AS role
      FROM employee e
      LEFT JOIN manager m ON m.employee_id = e.employee_id
      LEFT JOIN chef ch ON ch.employee_id = e.employee_id
      LEFT JOIN server s ON s.employee_id = e.employee_id
      LEFT JOIN cashier c ON c.employee_id = e.employee_id
      ORDER BY e.employee_id
    `,
  ]

  for (const sql of attempts) {
    try {
      return await query<EmployeeSummary>(sql)
    } catch {
      // Try the next schema variant.
    }
  }

  return []
}

export async function getNextEmployeeId() {
  try {
    const rows = await query<{ nextEmployeeId: number }>(
      `
        SELECT COALESCE(MAX(EmployeeID), 0) + 1 AS nextEmployeeId
        FROM Employee
      `,
    )

    return rows[0]?.nextEmployeeId ?? 1
  } catch {
    try {
      const rows = await query<{ nextEmployeeId: number }>(
        `
          SELECT COALESCE(MAX(employee_id), 0) + 1 AS nextEmployeeId
          FROM employee
        `,
      )

      return rows[0]?.nextEmployeeId ?? 1
    } catch {
      return 1
    }
  }
}

export type OrderDetailItem = {
  itemId: number
  name: string
  price: number | null
  quantity: number
}

export async function getOrderDetails(orderId: number) {
  const attempts = [
    `
      SELECT c.ItemID AS itemId, i.Name AS name, i.Price AS price, c.Quantity AS quantity
      FROM Contain c
      JOIN Items i ON c.ItemID = i.ItemID
      WHERE c.OrderID = ?
      ORDER BY c.ItemID
    `,
    `
      SELECT c.item_id AS itemId, i.name AS name, i.price AS price, c.quantity AS quantity
      FROM contain c
      JOIN items i ON c.item_id = i.item_id
      WHERE c.order_id = ?
      ORDER BY c.item_id
    `,
    `
      SELECT c.item_id AS itemId, i.name AS name, i.price AS price, c.quantity AS quantity
      FROM contain c
      JOIN item i ON c.item_id = i.item_id
      WHERE c.order_id = ?
      ORDER BY c.item_id
    `,
  ]

  let rows: Array<Record<string, unknown>> = []

  for (const sql of attempts) {
    try {
      // eslint-disable-next-line no-await-in-loop
      rows = await query(sql, [orderId]) as Array<Record<string, unknown>>
      break
    } catch {
      // try next
    }
  }

  // Normalize rows into OrderDetailItem and ensure numeric types
  const items: OrderDetailItem[] = rows.map((r) => {
    const itemId = toFiniteNumber(r.itemId ?? r.ItemID) ?? 0
    const name = (r.name ?? r.Name ?? '') as string
    const price = toFiniteNumber(r.price ?? r.Price)
    const quantity = toFiniteNumber(r.quantity ?? r.Quantity) ?? 0

    return { itemId, name, price, quantity }
  })

  // If any item has missing price, try to resolve from menu JSON or Items table via listMenuItems
  if (items.some((it) => it.price === null)) {
    try {
      const menu = await listMenuItems()
      const menuMap = new Map<number, MenuItemOption>()
      for (const m of menu) menuMap.set(m.itemId, m)

      for (const it of items) {
        if (it.price === null) {
          const found = menuMap.get(it.itemId)
          if (found && typeof found.price === 'number') {
            it.price = found.price
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return items
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

export async function createEmployee(input: CreateEmployeeInput) {
  // Try project schema first (capitalized table names)
  try {
    return await executeBatch([
      {
        sql: `
          INSERT INTO Employee
            (
              EmployeeID,
              Name,
              Hired,
              Phone_No,
              Address_No,
              Street,
              City,
              State,
              Zipcode,
              Hours_Worked,
              Shift
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
      employeeRoleInsertStatement(input.employeeId, input.roleDetails, true),
    ])
  } catch (error) {
    // Fallback to legacy lowercase schema
    return executeBatch([
      {
        sql: `
          INSERT INTO Employee
            (
              EmployeeID,
              Name,
              Hired,
              Phone_No,
              Address_No,
              Street,
              City,
              State,
              Zipcode,
              Shift
            )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          input.shift,
        ],
      },
      employeeRoleInsertStatement(input.employeeId, input.roleDetails, false),
    ])
  }
}
