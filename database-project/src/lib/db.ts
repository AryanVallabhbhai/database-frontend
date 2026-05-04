export type SqlStatement = {
  sql: string
  params: unknown[]
}

export type DbMutationResponse = Record<string, unknown>

type RowsEnvelope<T> = {
  rows?: T[]
  data?: T[]
}

type DbRequestBody =
  | SqlStatement
  | {
      statements: SqlStatement[]
      transactional: true
    }

function getDbEndpoint() {
  const endpoint = import.meta.env.VITE_DB_ENDPOINT

  if (!endpoint) {
    throw new Error('Missing VITE_DB_ENDPOINT. Add the browser database endpoint to your .env file.')
  }

  return endpoint
}

function getErrorMessage(payload: unknown, status: number) {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const error = payload.error
    if (typeof error === 'string') {
      return error
    }
  }

  return `Database request failed with status ${status}.`
}

async function postDb<T>(body: DbRequestBody): Promise<T> {
  const token = import.meta.env.VITE_DB_TOKEN
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(getDbEndpoint(), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const text = await response.text()
  const payload = text ? (JSON.parse(text) as unknown) : {}

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, response.status))
  }

  return payload as T
}

function extractRows<T>(payload: T[] | RowsEnvelope<T>) {
  if (Array.isArray(payload)) {
    return payload
  }

  if (Array.isArray(payload.rows)) {
    return payload.rows
  }

  if (Array.isArray(payload.data)) {
    return payload.data
  }

  return []
}

export async function query<T>(sql: string, params: unknown[] = []) {
  const payload = await postDb<T[] | RowsEnvelope<T>>({ sql, params })
  return extractRows(payload)
}

export function execute(sql: string, params: unknown[] = []) {
  return postDb<DbMutationResponse>({ sql, params })
}

export function executeBatch(statements: SqlStatement[]) {
  return postDb<DbMutationResponse>({
    statements,
    transactional: true,
  })
}
