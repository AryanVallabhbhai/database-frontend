export type PageStatus =
  | {
      tone: 'idle'
      message: string
    }
  | {
      tone: 'success' | 'error'
      message: string
    }

export const idleStatus: PageStatus = {
  tone: 'idle',
  message: '',
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected database error.'
}
