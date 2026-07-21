import Reveal from './Reveal'
import { BookmarkIcon, CompassIcon, PinIcon, SparkleIcon } from './icons'

const STEPS = [
  {
    title: 'Tell us where',
    body: 'Destination, budget, trip length, and the vibe you want — solo, couple, family, or friends.',
    icon: CompassIcon,
  },
  {
    title: 'AI builds your itinerary',
    body: "A day-by-day plan with real activities, timings, and cost estimates that add up to your budget — not just filler.",
    icon: SparkleIcon,
  },
  {
    title: 'Everything mapped & verified',
    body: 'Real geocoded locations, real photos where they exist, and honest search links for hotels and flights — no fake data.',
    icon: PinIcon,
  },
  {
    title: 'Save it, tweak it, take it with you',
    body: 'Add your own notes, save the trip, and come back to edit anytime before you go.',
    icon: BookmarkIcon,
  },
]

export default function HowItWorks() {
  return (
    <section className="how-it-works how-it-works-stacked">
      <h2>How GoNext plans your trip</h2>
      <div className="how-it-works-stacked-list">
        {STEPS.map((step, i) => {
          const Icon = step.icon
          return (
            <Reveal key={step.title} delay={i * 70}>
              <div className="how-it-works-card">
                <span className="how-it-works-icon-badge">
                  <Icon size={30} />
                </span>
                <span className="how-it-works-step-label">
                  Step {i + 1} of {STEPS.length}
                </span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </Reveal>
          )
        })}
      </div>
    </section>
  )
}
