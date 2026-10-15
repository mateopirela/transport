# Kickoff meeting notes

## Platform Concept and Core Problem

- Uber-style platform for cargo transport in Mexico: connects companies needing freight moved with trucking companies
- Key pain points JP identified for carriers:
  - No visibility on when unloading ends (can take 3-10 days), blocking next trip planning
  - Rates that don’t cover costs when searching last-minute
  - Truck/cargo incompatibility and legal/safety concerns
  - Long unloading waits with no way to pre-book next load

## Product Features and User Profiles

- Four profiles, each with distinct onboarding requirements:
  - Client: publishes loads (origin, destination, dates, weight, truck type), receives offers, monitors deliveries
  - Transporter (company/manager): registers trucks, operators, routes; negotiates rates; manages active trips
  - Operator (driver): receives assigned trips, shares location, updates status, uploads photo evidence
  - Admin: approves companies, resolves incidents, manages payments and permissions
- Single app with profile-based views preferred over separate apps (BeGo uses 3 separate apps)
- In-app chat for client-transporter negotiation, not WhatsApp, for traceability and legal compliance
- GPS tracking: operators share location via phone; background mode preferred so it stays active if app closes
- Documentation: companies upload legal docs (RFC, permits) once at registration; operators upload photo evidence per trip
- AI to match photo of cargo at pickup vs. delivery to verify complete, undamaged delivery

## GPS and Hardware

- Trucking companies already have proprietary GPS systems; JP’s family business could grant access as a starting point
- Plan B if GPS access not granted: operator shares phone location
- Physical device idea floated: custom hardware mounted in cab, shows route and GPS, avoids reliance on driver’s phone
  - Mateo has hardware experience (currently building a wearable device)
  - Scalability concern raised: 1,000 companies x 50 trucks = 50,000 units; cost and maintenance TBD
- Google Maps API preferred for routing over building own mapping

## Competitive Landscape: BeGo

- Direct competitor operating in Mexico (and US); connects companies and transporters via logistics tech
- Three separate apps: BeGo (clients), BeGo Driver (operators), BeGo Black (transport companies)
- Features: load search, GPS tracking, documentation, fleet management, AI, Carta Porte
- Pricing: free download; per-trip commission (unconfirmed publicly); BeGo Black by custom quote
- Weakness: 10,000+ downloads but near-zero App Store reviews after 5 years, very low brand awareness
- Key gaps vs. BeGo (our differentiation opportunities):
  - Return-trip recommendations (unverified if BeGo does this in real time)
  - Availability prediction and automated assignment
  - Better UX, simpler admin processes, lower search time

## Go-to-Market

- Start with one route: Monterrey to Guadalajara, then scale
- Launch with JP’s family trucking company as first client and GPS data source
- Pricing models to define later: monthly subscriptions, per-trip commissions, enterprise plans by fleet size
- Apps needed for both iOS and Android (truck operators don’t all have iPhones)
- Spanish first, English later when expanding
- Mateo’s company (Fulmis) building AI solutions; this would be their fifth project, team of engineers available
- Framed as a partnership with complementary skills, not one-sided help

## Next Steps

- [ ] Share presentation deck with Mateo (JP)
- [ ] Clarify required legal documentation for carrier onboarding (JP)
- [ ] Research GPS chip cost and maintenance requirements (Mateo)
- [ ] Schedule follow-up to align on project scope, roles, and economics

---

Meeting transcript: https://notes.granola.ai/t/925db83f-b0ee-493b-8ec2-4be53e1d9b1e
