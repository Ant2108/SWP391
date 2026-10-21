import { Warehouse } from 'lucide-react'

// Mô tả dịch vụ kho (tĩnh), dùng chung cho trang Services và Pricing.
export const SERVICES = [
  {
    category: 'STANDARD',
    icon: Warehouse,
    title: 'Standard storage',
    text: 'Dry, secure units for everyday belongings and business inventory.',
    suitable: 'Furniture, household items, documents, equipment, shop and e-commerce stock.',
    features: ['Small, medium and large unit sizes', 'Dry, clean, ventilated units', '24/7 security monitoring', 'Flexible access, with appointments for viewings and moves'],
    terms: ['Monthly rental, from 1 to 12 months', 'Refundable deposit', 'Renew before your term ends'],
    adviceSubject: 'Advice about standard storage',
  },
]
