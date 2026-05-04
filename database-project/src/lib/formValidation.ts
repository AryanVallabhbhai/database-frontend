const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phonePattern = /^[+()\-\s\d]{7,15}$/

export function isExactDigits(value: string, digits: number) {
  return new RegExp(`^\\d{${digits}}$`).test(value.trim())
}

export function isWholeNumberAtLeast(value: string, minimum: number) {
  const number = Number(value)
  return Number.isInteger(number) && number >= minimum
}

export function isMoneyAtLeast(value: string, minimum: number) {
  const number = Number(value)
  return Number.isFinite(number) && number >= minimum
}

export function isSingleDigit(value: string) {
  return /^\d$/.test(value.trim())
}

export function isTwoLetterState(value: string) {
  return /^[A-Z]{2}$/.test(value.trim())
}

export function isValidEmail(value: string) {
  return emailPattern.test(value.trim())
}

export function isValidPhone(value: string) {
  return phonePattern.test(value.trim())
}

export function getHourFromDatetimeLocal(value: string) {
  if (!value) {
    return Number.NaN
  }

  const date = new Date(value)
  return date.getHours()
}

export function formatErrorList(errors: string[]) {
  if (errors.length === 0) {
    return ''
  }

  return errors.join(' ')
}
