import PopularDestinations from './PopularDestinations'

interface DiscoverProps {
  onSelectDestination: (destination: string) => void
}

export default function Discover({ onSelectDestination }: DiscoverProps) {
  return (
    <div className="discover-page">
      <div className="discover-page-head">
        <h1>Discover</h1>
        <p>Browse popular destinations for the season — tap one to start planning a trip there.</p>
      </div>
      <PopularDestinations onSelect={onSelectDestination} />
    </div>
  )
}
