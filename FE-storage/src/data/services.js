import { Warehouse, Snowflake } from 'lucide-react'

// Nội dung mô tả hai dịch vụ kho (tĩnh), dùng chung cho trang Services và Pricing.
// `category` khớp storageCategory của UnitType ở BE (STANDARD / COLD).
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
  {
    category: 'COLD',
    icon: Snowflake,
    title: 'Cold storage',
    text: 'Temperature-controlled units for goods that must stay cool.',
    suitable: 'Food and beverages, medicine, cosmetics, flowers and other temperature-sensitive goods.',
    features: ['Controlled low temperature (2-8°C)', 'Suitable for perishable goods', 'Monitored around the clock', 'Same booking and payment flow as standard units'],
    terms: ['Monthly rental, from 1 to 12 months', 'Higher deposit than standard units', 'Ask our staff about special handling'],
    adviceSubject: 'Advice about cold storage',
  },
]
