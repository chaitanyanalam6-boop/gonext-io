import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Tooltip, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Activity } from '../types'

interface TripMapProps {
  activities: Activity[]
  selectedActivityId?: string | null
}

const pinIcon = L.divIcon({
  className: 'trip-map-pin',
  html: '<span class="trip-map-pin-dot"></span>',
  iconSize: [26, 34],
  iconAnchor: [13, 32],
})

const pinIconSelected = L.divIcon({
  className: 'trip-map-pin trip-map-pin-selected',
  html: '<span class="trip-map-pin-dot"></span>',
  iconSize: [32, 42],
  iconAnchor: [16, 40],
})

function FlyToSelected({ activity }: { activity: Activity | undefined }) {
  const map = useMap()
  useEffect(() => {
    if (activity) {
      map.flyTo([activity.lat, activity.lon], Math.max(map.getZoom(), 15), { duration: 0.6 })
    }
  }, [activity, map])
  return null
}

export default function TripMap({ activities, selectedActivityId }: TripMapProps) {
  const withCoords = activities.filter(
    (a) => Number.isFinite(a.lat) && Number.isFinite(a.lon),
  )
  const markerRefs = useRef<Record<string, L.Marker | null>>({})

  useEffect(() => {
    if (selectedActivityId) {
      markerRefs.current[selectedActivityId]?.openPopup()
    }
  }, [selectedActivityId])

  if (withCoords.length === 0) {
    return <div className="trip-map-empty">No map coordinates for this day.</div>
  }

  const center: [number, number] = [withCoords[0].lat, withCoords[0].lon]
  // Permanent labels read well for a handful of pins; beyond that they'd overlap and
  // clutter the map, so fall back to click-to-reveal popups.
  const showPermanentLabels = withCoords.length <= 8
  const selectedActivity = withCoords.find((a) => a.id === selectedActivityId)

  return (
    <MapContainer center={center} zoom={13} scrollWheelZoom className="trip-map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />
      <FlyToSelected activity={selectedActivity} />
      {withCoords.map((activity) => {
        const isSelected = activity.id === selectedActivityId
        const icon = isSelected ? pinIconSelected : pinIcon

        return showPermanentLabels ? (
          <Marker key={activity.id} position={[activity.lat, activity.lon]} icon={icon}>
            <Tooltip permanent direction="top" offset={[0, -30]} className="trip-map-tooltip">
              <strong>{activity.title}</strong>
              <span>{activity.location}</span>
            </Tooltip>
          </Marker>
        ) : (
          <Marker
            key={activity.id}
            position={[activity.lat, activity.lon]}
            icon={icon}
            ref={(el) => {
              markerRefs.current[activity.id] = el
            }}
          >
            <Popup>
              <strong>{activity.title}</strong>
              <br />
              {activity.time} · {activity.location}
            </Popup>
          </Marker>
        )
      })}
    </MapContainer>
  )
}
