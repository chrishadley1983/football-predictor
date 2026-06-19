import { redirect } from 'next/navigation'

// Dedicated URL for looking back at the Group Stage predictions. The main
// Predictions page renders the group-only view when ?stage=group is set.
export default async function GroupPredictionsPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/tournament/${slug}/predictions?stage=group`)
}
