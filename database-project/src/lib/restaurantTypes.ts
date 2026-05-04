export type OrderMethod = 'online' | 'delivery' | 'dine-in'

export type PaymentMethod = 'cash' | 'card' | 'giftcard'

export type EmployeeShift = 'Morning' | 'Night'

export type EmployeeRole = 'Manager' | 'Chef' | 'Server' | 'Cashier'

export type ChefSpecialization = 'appetizer' | 'entree' | 'dessert' | 'drink'

export type OrderItemInput = {
  itemId: number
  quantity: number
}

export type ServedByInput = {
  employeeId: number
  notes: string | null
}

export type CreateOrderInput = {
  customerId: number
  customerName: string
  orderId: number
  total: number
  time: string
  method: OrderMethod
  payment: PaymentMethod
  pointsEarned: number
  items: OrderItemInput[]
  servedBy: ServedByInput[]
}

export type CreateMembershipInput = {
  customerId: number
  customerName: string
  phoneNumber: string | null
  email: string | null
  currentPoints: number
  joinDate: string
  pointsRedeemed: number
}

export type EmployeeBaseInput = {
  employeeId: number
  name: string
  hireDate: string
  phoneNumber: string
  addressNumber: number
  street: string
  city: string
  state: string
  zipcode: number
  hoursWorked: number
  shift: EmployeeShift
}

export type ManagerDetails = {
  role: 'Manager'
  salary: number
  officeNumber: number
}

export type ChefDetails = {
  role: 'Chef'
  wage: number
  stationNumber: number
  specialization: ChefSpecialization
}

export type ServerDetails = {
  role: 'Server'
  wage: number
  sectionNumber: number
}

export type CashierDetails = {
  role: 'Cashier'
  wage: number
  registerNumber: number
}

export type EmployeeRoleDetails =
  | ManagerDetails
  | ChefDetails
  | ServerDetails
  | CashierDetails

export type CreateEmployeeInput = EmployeeBaseInput & {
  roleDetails: EmployeeRoleDetails
}
