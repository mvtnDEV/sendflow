import TrackingPublicClient from './client'

export default function TrackingPublicPage({
  searchParams
}: {
  searchParams: { q?: string }
}) {
  return <TrackingPublicClient initialQuery={searchParams.q || ''} />
}
