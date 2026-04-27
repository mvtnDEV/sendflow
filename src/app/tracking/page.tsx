import TrackingClient from './client'

export default function TrackingPage({
  searchParams
}: {
  searchParams: { q?: string }
}) {
  return <TrackingClient initialQuery={searchParams.q || ''} />
}
