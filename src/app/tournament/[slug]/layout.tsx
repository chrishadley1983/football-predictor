import { PunditBubbleWrapper } from '@/components/pundit/PunditBubbleWrapper'

export default async function TournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <>
      {children}
      <PunditBubbleWrapper tournamentSlug={slug} />
    </>
  )
}
