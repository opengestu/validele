export interface Product {
  id: string;
  vendor_id: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
  image_url?: string;
  stock_quantity?: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
  code: string;
  warranty?: string;
  profiles?: {
    company_name: string;
    full_name?: string;
  };
}

export interface Order {
  id: string;
  buyer_id: string;
  vendor_id: string;
  product_id: string;
  delivery_person_id?: string;
  total_amount: number;
  payment_method: string;
  delivery_address: string;
  buyer_phone: string;
  order_code?: string;
  qr_code?: string;
  status?: string;
  payment_confirmed_at?: string;
  assigned_at?: string;
  delivered_at?: string;
  created_at: string;
  updated_at: string;
  products?: {
    name: string;
  };
  profiles?: {
    company_name?: string;
    phone?: string;
    address?: string;
  };
  delivery_person?: {
    phone?: string;
  };
  token?: string;
}
