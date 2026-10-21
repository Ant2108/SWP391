import { Link } from 'react-router-dom'
import { ShieldCheck, Eye, Lock, Users, Check } from 'lucide-react'
import { PageHeader, Card, Button } from '../components/ui.jsx'

const VALUES = [
  { icon: ShieldCheck, title: 'Security first', text: 'Monitored facilities and controlled access at every site.' },
  { icon: Eye, title: 'Transparency', text: 'Clear pricing rules, so you always know what you pay and why.' },
  { icon: Lock, title: 'Privacy', text: 'Your belongings stay yours. Only you decide who gets access.' },
  { icon: Users, title: 'Real support', text: 'Friendly staff on hand to help you choose and manage your space.' },
]

export default function About() {
  return (
    <section className="section">
      <div className="container">
        <PageHeader eyebrow="About" title="Storage you can rely on"
          subtitle="SafeSpace Storage provides secure, flexible storage for households and businesses, from a single box to a full warehouse bay." />
        <div className="grid grid-4">
          {VALUES.map(({ icon: Icon, title, text }) => (
            <Card hover key={title}>
              <div className="icon-tile"><Icon size={26} /></div>
              <h3>{title}</h3>
              <p className="muted" style={{ marginTop: 8 }}>{text}</p>
            </Card>
          ))}
        </div>
        <div className="about-split">
          <div>
            <div className="eyebrow">What we offer</div>
            <h2 style={{ fontSize: 'clamp(28px,3vw,40px)' }}>Storage that fits how you live and work</h2>
            <p className="muted" style={{ marginTop: 12 }}>Whether you are clearing a spare room, keeping seasonal items or holding stock for your business, you can find, price and book a unit online.</p>
            <ul>
              <li><Check size={18} /><span>Standard storage for furniture, documents, equipment and stock</span></li>
              <li><Check size={18} /><span>Clear monthly prices and deposits, shown before you pay</span></li>
              <li><Check size={18} /><span>Appointments, payments and support in one account</span></li>
            </ul>
          </div>
          <div className="step">
            <div className="eyebrow" style={{ marginBottom: 0 }}>How we work</div>
            <h3>Simple from start to finish</h3>
            <p className="muted">Choose a facility, pick a unit size, pay online and your unit is reserved. Our staff are available through the Support page whenever you need help choosing or managing your space.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              <Button as={Link} to="/storage-options">Browse storage options</Button>
              <Button as={Link} to="/contact" variant="secondary">Contact us</Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
