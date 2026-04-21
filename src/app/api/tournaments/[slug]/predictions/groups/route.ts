import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { scheduleAuditEmail } from '@/lib/email/audit'
import type { GroupPredictionChange, GroupPredictionSnapshot } from '@/lib/email/audit'

// GET: Get player's group predictions
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const player = await requireAuth()
    const { slug } = await params
    const supabase = await createClient()

    // Get tournament
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    // Get player's entry
    const { data: entry } = await supabase
      .from('tournament_entries')
      .select('id')
      .eq('tournament_id', tournament.id)
      .eq('player_id', player.id)
      .single()

    if (!entry) {
      return NextResponse.json({ error: 'Not entered in this tournament' }, { status: 404 })
    }

    // Get group predictions with team details
    const { data: predictions, error } = await supabase
      .from('group_predictions')
      .select(`
        *,
        group:groups (*),
        predicted_1st_team:teams!group_predictions_predicted_1st_fkey (*),
        predicted_2nd_team:teams!group_predictions_predicted_2nd_fkey (*),
        predicted_3rd_team:teams!group_predictions_predicted_3rd_fkey (*)
      `)
      .eq('entry_id', entry.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      entry_id: entry.id,
      predictions: predictions ?? [],
    })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

type Diff = {
  groupId: string
  old: { first: string | null; second: string | null; third: string | null } | null
  new: { first: string; second: string; third: string | null }
}

// POST: Submit/update group predictions
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const player = await requireAuth()
    const { slug } = await params
    const supabase = await createClient()

    // Get tournament
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!tournament) {
      return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    }

    // Enforce deadline: tournament must be in group_stage_open and before deadline
    if (tournament.status !== 'group_stage_open') {
      return NextResponse.json(
        { error: 'Group stage predictions are not currently open' },
        { status: 400 }
      )
    }

    if (tournament.group_stage_deadline && new Date(tournament.group_stage_deadline) < new Date()) {
      return NextResponse.json(
        { error: 'Group stage prediction deadline has passed' },
        { status: 400 }
      )
    }

    // Get player's entry (with tiebreaker_goals for diffing)
    const { data: entry } = await supabase
      .from('tournament_entries')
      .select('id, tiebreaker_goals')
      .eq('tournament_id', tournament.id)
      .eq('player_id', player.id)
      .single()

    if (!entry) {
      return NextResponse.json({ error: 'Not entered in this tournament' }, { status: 404 })
    }

    const oldTiebreaker = entry.tiebreaker_goals

    const body = await request.json()
    // Expected body: { predictions: [{ group_id, predicted_1st, predicted_2nd, predicted_3rd? }], tiebreaker_goals? }
    const { predictions, tiebreaker_goals } = body

    if (!Array.isArray(predictions)) {
      return NextResponse.json({ error: 'predictions must be an array' }, { status: 400 })
    }

    const hasThirdPlaceFeature = !!(tournament as Record<string, unknown>).third_place_qualifiers_count

    // Validate all predictions have required fields
    for (const pred of predictions) {
      if (!pred.group_id || !pred.predicted_1st || !pred.predicted_2nd) {
        return NextResponse.json(
          { error: '1st and 2nd positions are required for each group' },
          { status: 400 }
        )
      }

      // For standard tournaments, 3rd is always required
      if (!hasThirdPlaceFeature && !pred.predicted_3rd) {
        return NextResponse.json(
          { error: 'All three positions (1st, 2nd, 3rd) are required for each group' },
          { status: 400 }
        )
      }

      // Validate no duplicate team IDs within a prediction
      const teamIds = [pred.predicted_1st, pred.predicted_2nd, pred.predicted_3rd].filter(Boolean)
      if (new Set(teamIds).size !== teamIds.length) {
        return NextResponse.json(
          { error: 'Each team can only be predicted once per group' },
          { status: 400 }
        )
      }

      // Validate all predicted teams belong to this group
      const { data: groupTeams } = await supabase
        .from('group_teams')
        .select('team_id')
        .eq('group_id', pred.group_id)

      if (!groupTeams) {
        return NextResponse.json({ error: 'Group not found' }, { status: 404 })
      }

      const validTeamIds = new Set(groupTeams.map((gt) => gt.team_id))
      for (const teamId of teamIds) {
        if (!validTeamIds.has(teamId)) {
          return NextResponse.json(
            { error: `Team ${teamId} does not belong to the specified group` },
            { status: 400 }
          )
        }
      }
    }

    // Upsert each group prediction, capturing before/after for the audit email
    const diffs: Diff[] = []
    for (const pred of predictions) {
      // Capture existing prediction (full row) for diffing
      const { data: existing } = await supabase
        .from('group_predictions')
        .select('id, predicted_1st, predicted_2nd, predicted_3rd')
        .eq('entry_id', entry.id)
        .eq('group_id', pred.group_id)
        .maybeSingle()

      diffs.push({
        groupId: pred.group_id,
        old: existing
          ? { first: existing.predicted_1st, second: existing.predicted_2nd, third: existing.predicted_3rd }
          : null,
        new: {
          first: pred.predicted_1st,
          second: pred.predicted_2nd,
          third: pred.predicted_3rd ?? null,
        },
      })

      if (existing) {
        // Update existing prediction (preserve points_earned)
        const { error: updateErr } = await supabase
          .from('group_predictions')
          .update({
            predicted_1st: pred.predicted_1st,
            predicted_2nd: pred.predicted_2nd,
            predicted_3rd: pred.predicted_3rd ?? null,
          })
          .eq('id', existing.id)

        if (updateErr) {
          return NextResponse.json({ error: updateErr.message }, { status: 400 })
        }
      } else {
        // Insert new prediction
        const { error: insertErr } = await supabase
          .from('group_predictions')
          .insert({
            entry_id: entry.id,
            group_id: pred.group_id,
            predicted_1st: pred.predicted_1st,
            predicted_2nd: pred.predicted_2nd,
            predicted_3rd: pred.predicted_3rd ?? null,
            points_earned: 0,
          })

        if (insertErr) {
          return NextResponse.json({ error: insertErr.message }, { status: 400 })
        }
      }
    }

    // Update tiebreaker if provided
    let newTiebreaker = oldTiebreaker
    if (tiebreaker_goals !== undefined) {
      const parsedGoals = Number(tiebreaker_goals)
      if (!Number.isInteger(parsedGoals) || parsedGoals < 0 || parsedGoals > 999) {
        return NextResponse.json(
          { error: 'tiebreaker_goals must be a non-negative integer (0-999)' },
          { status: 400 }
        )
      }
      await supabase
        .from('tournament_entries')
        .update({ tiebreaker_goals: parsedGoals })
        .eq('id', entry.id)
      newTiebreaker = parsedGoals
    }

    // Audit email: build changes with team/group names, skip if nothing changed.
    await fireGroupPredictionsAudit({
      supabase,
      player,
      tournament,
      diffs,
      oldTiebreaker,
      newTiebreaker,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof Response) return err
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function fireGroupPredictionsAudit(opts: {
  supabase: Awaited<ReturnType<typeof createClient>>
  player: { id: string; display_name: string; nickname: string | null; email: string }
  tournament: { id: string; name: string; slug: string; year: number }
  diffs: Diff[]
  oldTiebreaker: number | null
  newTiebreaker: number | null
}): Promise<void> {
  const { supabase, player, tournament, diffs, oldTiebreaker, newTiebreaker } = opts

  if (diffs.length === 0 && oldTiebreaker === newTiebreaker) return

  // Batch-fetch team names
  const teamIds = new Set<string>()
  for (const d of diffs) {
    for (const v of [d.old, d.new]) {
      if (!v) continue
      if (v.first) teamIds.add(v.first)
      if (v.second) teamIds.add(v.second)
      if (v.third) teamIds.add(v.third)
    }
  }
  const { data: teams } = teamIds.size
    ? await supabase.from('teams').select('id, name').in('id', [...teamIds])
    : { data: [] as { id: string; name: string }[] }
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]))

  // Batch-fetch group names
  const groupIds = [...new Set(diffs.map((d) => d.groupId))]
  const { data: groups } = groupIds.length
    ? await supabase.from('groups').select('id, name').in('id', groupIds)
    : { data: [] as { id: string; name: string }[] }
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]))

  const snap = (
    v: { first: string | null; second: string | null; third: string | null } | null
  ): GroupPredictionSnapshot | null =>
    v
      ? {
          first: v.first ? teamName.get(v.first) ?? null : null,
          second: v.second ? teamName.get(v.second) ?? null : null,
          third: v.third ? teamName.get(v.third) ?? null : null,
        }
      : null

  const changes: GroupPredictionChange[] = diffs.map((d) => {
    const oldSnap = snap(d.old)
    const newSnap = snap({ first: d.new.first, second: d.new.second, third: d.new.third })!
    const changed =
      !oldSnap ||
      oldSnap.first !== newSnap.first ||
      oldSnap.second !== newSnap.second ||
      oldSnap.third !== newSnap.third
    return {
      groupName: groupName.get(d.groupId) ?? 'Unknown group',
      old: oldSnap,
      new: newSnap,
      changed,
    }
  })

  const anyGroupChanged = changes.some((c) => c.changed)
  const tiebreakerChanged = oldTiebreaker !== newTiebreaker
  if (!anyGroupChanged && !tiebreakerChanged) return

  scheduleAuditEmail({
    event: 'group_predictions_submitted',
    player: {
      id: player.id,
      displayName: player.display_name,
      nickname: player.nickname,
      email: player.email,
    },
    tournament: {
      id: tournament.id,
      name: tournament.name,
      slug: tournament.slug,
      year: tournament.year,
    },
    changes,
    tiebreaker: tiebreakerChanged
      ? { old: oldTiebreaker, new: newTiebreaker, changed: true }
      : null,
  })
}
