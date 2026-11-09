/* Today's food numbers, on Home (kcal and protein), against the daily target they are for.
 *
 * Two fields and a target: without the target the numbers are trivia, and the Coach has nothing
 * to compare them with. The target is an estimate from body weight and the goal picked at intake,
 * always editable, because nobody's maintenance is 32 kcal/kg exactly.
 *
 * Three ways in, in the order a person actually uses them: the numbers you ate yesterday (one
 * tap, then adjust), a saved pair, or typing two numbers. The presets are the difference between
 * logging for a week and logging for a day.
 */
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { todayISO, fmtDate } from '../lib/format.js'
import {
  intakeOn, intakeSummary, withIntake, goalOf, readGoal, estimateGoal, presetsOf, addPreset, removePreset, recentIntakes,
  KCAL_MAX, PROTEIN_MAX
} from '../lib/nutrition.js'
import { convertWeight } from '../lib/units.js'
import { Button, NumberField } from './ui.jsx'

const pct = (v, g) => (g > 0 ? Math.min(100, Math.round(((v || 0) / g) * 100)) : 0)

function Bar({ value, goal }) {
  const p = pct(value, goal)
  const over = goal > 0 && (value || 0) > goal
  return <>
    <div className="row" style={{ gap: 6, alignItems: 'baseline', marginTop: 8 }}>
      <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.021em' }}>{value || 0}</span>
      <span className="muted small">/ {goal}</span>
      <span className="dim small" style={{ marginInlineStart: 'auto', color: over ? 'var(--orange)' : undefined }}>
        {goal > 0 ? Math.round(((value || 0) / goal) * 100) + '%' : ''}
      </span>
    </div>
    <div style={{ height: 6, borderRadius: 3, background: 'var(--sep)', overflow: 'hidden', margin: '6px 0 2px' }}>
      <div style={{ height: '100%', width: p + '%', background: over ? 'var(--orange)' : 'var(--acc)' }} />
    </div>
  </>
}

function NutritionSheet({ close }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const iso = todayISO()
  const now = intakeOn(S, iso) || { kcal: 0, protein: 0 }
  const goal = goalOf(S) || { kcal: 0, protein: 0 }
  const [kcal, setKcal] = useState(now.kcal || '')
  const [protein, setProtein] = useState(now.protein || '')
  const [gkcal, setGkcal] = useState(goal.kcal || '')
  const [gprotein, setGprotein] = useState(goal.protein || '')

  // Recent days first, then the saved pairs: the two kinds of one tap, in one row, deduped.
  const saved = presetsOf(S)
  const chips = [...recentIntakes(S, { today: iso }), ...saved]
    .filter((e, i, all) => all.findIndex(x => x.kcal === e.kcal && x.protein === e.protein) === i)
    .slice(0, 6)
  const pair = { kcal: Math.round(Number(kcal) || 0), protein: Math.round(Number(protein) || 0) }
  const isSaved = saved.some(x => x.kcal === pair.kcal && x.protein === pair.protein)

  const fill = e => { setKcal(e.kcal || ''); setProtein(e.protein || '') }
  const savePreset = () => {
    if (!pair.kcal && !pair.protein) return
    update(s => { s.nutritionPresets = addPreset(s.nutritionPresets, pair) })
    toast(t('Save as preset'))
  }
  const dropPreset = e => update(s => { s.nutritionPresets = removePreset(s.nutritionPresets, e) })

  const bw = [...(S.bodyweight || [])].sort((a, b) => (a.d < b.d ? -1 : 1)).at(-1)
  const estimate = () => {
    const e = estimateGoal({ weightKg: bw ? convertWeight(bw.w, S.unit, 'kg') : null, goal: S.coach?.profile?.goal })
    if (!e) { toast(t('Log your body weight first')); return }
    setGkcal(e.kcal || ''); setGprotein(e.protein || '')
  }

  const save = () => {
    if ((pair.kcal && (pair.kcal < 0 || pair.kcal > KCAL_MAX)) || (pair.protein && (pair.protein < 0 || pair.protein > PROTEIN_MAX))) {
      toast(t('Enter a valid amount')); return
    }
    const g = readGoal({ kcal: Math.round(Number(gkcal) || 0), protein: Math.round(Number(gprotein) || 0) })
    update(s => {
      s.nutrition = withIntake(s.nutrition, iso, pair, Date.now())
      s.nutritionGoal = g
    })
    close()
    toast(t('Saved'))
  }

  return <>
    <h3>{t('Food')}</h3>
    <div className="muted small">{t('Today') + ', ' + fmtDate(iso, true)}</div>

    <div style={{ height: 12 }} />
    <label className="small dim">{t('Calories')}</label>
    <div className="row" style={{ gap: 8, alignItems: 'center', margin: '6px 0 14px' }}>
      <NumberField value={kcal} onChange={setKcal} aria-label={t('Calories')} enterKeyHint="next" />
      <span className="small dim">kcal</span>
    </div>
    <label className="small dim">{t('Protein')}</label>
    <div className="row" style={{ gap: 8, alignItems: 'center', margin: '6px 0 6px' }}>
      <NumberField value={protein} onChange={setProtein} aria-label={t('Protein')} enterKeyHint="next" />
      <span className="small dim">g</span>
    </div>

    {!!chips.length && <>
      <div className="small dim" style={{ marginTop: 6 }}>{t('Presets')}</div>
      <div className="chips" style={{ flexWrap: 'wrap', margin: '6px 0 4px' }}>
        {chips.map(e => <span key={e.kcal + '-' + e.protein} className="row" style={{ gap: 2 }}>
          <button className="chip" onClick={() => fill(e)}>{e.kcal || '–'} · {e.protein || '–'} g</button>
          {saved.some(x => x.kcal === e.kcal && x.protein === e.protein) &&
            <button className="iconbtn" style={{ width: 24, height: 24 }} aria-label={t('Remove')} onClick={() => dropPreset(e)}>×</button>}
        </span>)}
      </div>
    </>}
    {(pair.kcal > 0 || pair.protein > 0) && !isSaved &&
      <div className="row" style={{ margin: '4px 0 2px' }}><Button size="sm" variant="ghost" onClick={savePreset}>{t('Save as preset')}</Button></div>}

    <h4 className="sec" style={{ marginTop: 16 }}>{t('Target')}</h4>
    <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 8 }}>
      <NumberField value={gkcal} onChange={setGkcal} aria-label={t('Target') + ' · ' + t('Calories')} enterKeyHint="next" />
      <span className="small dim">kcal</span>
      <NumberField value={gprotein} onChange={setGprotein} aria-label={t('Target') + ' · ' + t('Protein')} enterKeyHint="done" />
      <span className="small dim">g</span>
    </div>
    <div className="row between">
      <span className="small dim" style={{ maxWidth: '62%' }}>{t('Targets are estimates — edit them.')}</span>
      <Button size="sm" variant="ghost" icon="sparkles" onClick={estimate}>{t('Estimate from body weight')}</Button>
    </div>

    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={save}>{t('Save')}</Button>
  </>
}

export default function NutritionCard() {
  const S = useStore(s => s.S)
  const openSheet = useUI(s => s.openSheet)
  const iso = todayISO()
  const today = intakeOn(S, iso)
  const week = intakeSummary(S, { days: 7, today: iso })
  const goal = goalOf(S)
  const open = () => openSheet(close => <NutritionSheet close={close} />)

  return <div className="card">
    <div className="row between" style={{ marginBottom: 6 }}>
      <h2 style={{ margin: 0 }}>{t('Food')}</h2>
      <button className="iconbtn" onClick={open} aria-label={t('Edit')}><span className="small" style={{ fontWeight: 600 }}>{t('Edit')}</span></button>
    </div>
    {goal ? <>
      <div className="small dim">{t('Calories')}</div>
      <Bar value={today?.kcal} goal={goal.kcal} />
      <div className="small dim" style={{ marginTop: 10 }}>{t('Protein')}</div>
      <Bar value={today?.protein} goal={goal.protein} />
    </> : today ? <>
      <div className="row" style={{ gap: 7, fontSize: 22, fontWeight: 600, letterSpacing: '-.021em' }}>
        <span>{today.kcal || '–'}</span><span className="small dim" style={{ fontWeight: 500 }}>kcal</span>
        <span style={{ width: 8 }} />
        <span>{today.protein || '–'}</span><span className="small dim" style={{ fontWeight: 500 }}>g</span>
      </div>
      <div style={{ height: 10 }} />
      <Button size="sm" onClick={open}>{t('Set a target')}</Button>
    </> : <>
      <div className="small muted">{t('No food logged yet.')}</div>
      <div style={{ height: 10 }} />
      <Button size="sm" onClick={open}>{t('Edit')}</Button>
    </>}
    <div className="small dim" style={{ marginTop: 10 }}>
      {t('Last 7 days') + ' · ' + t('{0} logged', week.daysLogged) + (week.kcalAvg ? ' · ' + week.kcalAvg + ' kcal · ' + (week.proteinAvg || '–') + ' g' : '')}
    </div>
  </div>
}
