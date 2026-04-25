// @endpoint
export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  /** @enum admin,user,moderator */
  role: string;
  age: number;
}

// @endpoint
export interface Product {
  id: string;
  name: string;
  /** @min 0 */
  price: number;
  /** @enum electronics,clothing,food */
  category: string;
  inStock: boolean;
}

// @endpoint
export interface Order {
  id: string;
  userId: number;
  /** @min 0 */
  total: number;
  /** @enum pending,processing,shipped,delivered,cancelled */
  status: string;
}
