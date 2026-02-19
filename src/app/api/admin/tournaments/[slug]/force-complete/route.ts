import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  forceCompleteGroupStageLogic,
  forceCompleteKnockoutRoundLogic,
} from '@/lib/testing/seed-helpers'
import type { KnockoutRound } from '@/lib/types'

interface ForceCompletePayload {
  phase: 'group_stage' | 'knockout_round'
  round?: 'round_of_16' | 'quarter_final' | 'semi_final' | 'final'
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireAdmin()
    const { slug } = await params
    const admin = createAdminClient()

    const { data: tournament } = await admin
      .from('tournaments')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    const body: ForceCompletePayload = await request.json()

    if (body.phase === 'group_stage') {
      const validStatuses = ['group_stage_open', 'group_stage_closed']
      if (!validStatuses.includes(tournament.status)) {
        return NextResponse.json(
          { error: `Cannot force-complete group stage from status '${tournament.status}'. Tournament must be in group_stage_open or group_stage_closed.` },
          { status: 400 }
        )
      }
      const thirdPlaceCount = (tournament as Record<string, unknown>).third_place_qualifiers_count as number | null

      try {
        await forceCompleteGroupStageLogic(admin, tournament.id, thirdPlaceCount)
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Failed to force-complete group stage' },
          { status: 500 }
        )
      }

      await admin
        .from('tournaments')
        .update({ status: 'group_stage_closed' })
        .eq('slug', slug)

      return NextResponse.json({
        success: true,
        message: 'Group stage force-completed with random results',
      })
    } else if (body.phase === 'knockout_round') {
      if (!body.round) {
        return NextResponse.json({ error: 'round is required for knockout_round phase' }, { status: 400 })
      }
      const validStatuses = ['group_stage_closed', 'knockout_open', 'knockout_closed']
      if (!validStatuses.includes(tournament.status)) {
        return NextResponse.json(
          { error: `Cannot force-complete knockout round from status '${tournament.status}'. Tournament must be past group stage.` },
          { status: 400 }
        )
      }

      try {
        const result = await forceCompleteKnockoutRoundLogic(admin, tournament.id, body.round as KnockoutRound)

        if (result.allKnockoutComplete) {
          await admin
            .from('tournaments')
            .update({ status: 'completed' })
            .eq('id', tournament.id)
        }

        return NextResponse.json({
          success: true,
          message: `Force-completed ${body.round}: ${result.decidedCount} matches decided`,
          all_knockout_complete: result.allKnockoutComplete,
        })
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Failed to force-complete knockout round' },
          { status: 500 }
        )
      }
    } else {
      return NextResponse.json({ error: 'Invalid phase' }, { status: 400 })
    }
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
