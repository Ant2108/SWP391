import { Link } from 'react-router-dom'
import { ShieldCheck, Eye, Lock, Users } from 'lucide-react'
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
        <div style={{ marginTop: 56 }}><Button as={Link} to="/storage-options" size="lg">Browse storage options</Button></div>
      </div>
    </section>
  )
}
