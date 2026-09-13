<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { doAction } from '@/api'
import { getMovieRssList, getTvRssList, type RssMediaItem } from '@/api/rss'
import PageHeader from '@/components/PageHeader.vue'
import { useModalStore } from '@/stores/modal'

interface CalendarEvent {
  id: string | number
  title: string
  start: string
  poster?: string
  vote_average?: string | number
  year?: string
  type: string
  rssid?: string | number
}

const modal = useModalStore()
const loading = ref(false)
const loadError = ref('')
const currentDate = ref(new Date())
const events = ref<CalendarEvent[]>([])
const viewMode = ref<'week' | 'month' | 'schedule'>('week')
const viewOptions = [
  { label: '周', value: 'week', icon: 'view_week' },
  { label: '月', value: 'month', icon: 'calendar_month' },
  { label: '日程', value: 'schedule', icon: 'view_agenda' }
]
const dayNames = ['日', '一', '二', '三', '四', '五', '六']
const dayNamesLong = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

onMounted(load)

async function load() {
  if (loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    const [movieRes, tvRes] = await Promise.all([getMovieRssList(), getTvRssList()])
    const movieItems: RssMediaItem[] = movieRes.code === 0 ? Object.values(movieRes.result || {}) : []
    const tvItems: RssMediaItem[] = tvRes.code === 0 ? Object.values(tvRes.result || {}) : []
    const collected: CalendarEvent[] = []
    await Promise.all(movieItems.map(async (media) => {
      try {
        const result = await doAction<{ code: number; id?: string | number; title?: string; start?: string; poster?: string; vote_average?: string | number; year?: string; type?: string; rssid?: string | number }>('movie_calendar_data', { id: media.tmdbid, rssid: media.id })
        if (result.code === 0 && result.start) collected.push({ id: result.id ?? media.id, title: result.title ?? media.name, start: result.start, poster: result.poster, vote_average: result.vote_average, year: result.year, type: result.type ?? '电影', rssid: result.rssid ?? media.id })
      } catch { /* one unavailable calendar item should not block the page */ }
    }))
    await Promise.all(tvItems.map(async (media) => {
      try {
        const season = media.season ? parseInt((media.season as string).replace('S', ''), 10) : undefined
        const result = await doAction<{ code: number; events?: CalendarEvent[] }>('tv_calendar_data', { id: media.tmdbid, season, name: media.name, rssid: media.id })
        if (result.code === 0 && result.events) collected.push(...result.events)
      } catch { /* one unavailable calendar item should not block the page */ }
    }))
    events.value = collected.sort((a, b) => a.start.localeCompare(b.start))
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '获取日历数据失败'
  } finally {
    loading.value = false
  }
}

function pad(value: number) { return value < 10 ? `0${value}` : `${value}` }
function dateKey(date: Date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` }
function formatDate(date: Date) { return dateKey(date) }
function monthLabel(date: Date) { return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月` }
function isToday(date: Date) { const now = new Date(); return dateKey(date) === dateKey(now) }
function eventsOf(date: Date) { const key = dateKey(date); return events.value.filter((event) => (event.start || '').slice(0, 10) === key) }
function isMovie(event: CalendarEvent) { return event.type === '电影' || event.type === 'MOV' }
function posterStyle(event: CalendarEvent): Record<string, string> { return event.poster ? { backgroundImage: `url(${event.poster})` } : {} }

const weekStart = computed(() => {
  const date = new Date(currentDate.value)
  const day = date.getDay()
  date.setDate(date.getDate() - day + (day === 0 ? -6 : 1))
  date.setHours(0, 0, 0, 0)
  return date
})
const weekDays = computed(() => Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart.value); date.setDate(date.getDate() + index); return date }))
const weekLabel = computed(() => `${formatDate(weekDays.value[0])} ~ ${formatDate(weekDays.value[6])}`)

const monthDays = computed(() => {
  const first = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth(), 1)
  const startOffset = first.getDay() === 0 ? 6 : first.getDay() - 1
  const start = new Date(first)
  start.setDate(first.getDate() - startOffset)
  return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date })
})

const groupedSchedule = computed(() => {
  const map = new Map<string, CalendarEvent[]>()
  for (const event of events.value) { const key = (event.start || '').slice(0, 10); if (!map.has(key)) map.set(key, []); map.get(key)!.push(event) }
  const today = dateKey(new Date())
  if (!map.has(today)) map.set(today, [])
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
})
const totalEvents = computed(() => events.value.length)

function inCurrentMonth(date: Date) { return date.getMonth() === currentDate.value.getMonth() }
function onPrev() { const date = new Date(currentDate.value); if (viewMode.value === 'week') date.setDate(date.getDate() - 7); else date.setMonth(date.getMonth() - 1); currentDate.value = date }
function onNext() { const date = new Date(currentDate.value); if (viewMode.value === 'week') date.setDate(date.getDate() + 7); else date.setMonth(date.getMonth() + 1); currentDate.value = date }
function onToday() { currentDate.value = new Date() }

function scrollScheduleToToday() {
  if (viewMode.value !== 'schedule') return
  void nextTick(() => document.querySelector<HTMLElement>('.schedule-view .is-today')?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
}

watch(viewMode, scrollScheduleToToday)
watch(() => events.value.length, scrollScheduleToToday)
</script>

<template>
  <div class="page-shell rss-calendar">
    <PageHeader title="订阅日历" description="电影与电视剧上线日程">
      <template #actions>
        <q-btn-toggle v-model="viewMode" :options="viewOptions" unelevated toggle-color="primary" color="grey-2" text-color="grey-8" />
        <div class="row no-wrap q-gutter-xs">
          <q-btn flat round icon="chevron_left" aria-label="上一个周期" @click="onPrev" />
          <q-btn outline label="今天" @click="onToday" />
          <q-btn flat round icon="chevron_right" aria-label="下一个周期" @click="onNext" />
        </div>
        <q-btn outline icon="refresh" label="刷新" :loading="loading" @click="load" />
      </template>
    </PageHeader>

    <q-banner v-if="loadError" class="q-mb-md" rounded inline-actions dense>
      <template #avatar><q-icon name="error_outline" color="negative" /></template>
      {{ loadError }}
      <template #action><q-btn flat color="primary" label="重试" @click="load" /></template>
    </q-banner>

    <q-card flat bordered class="calendar-card">
      <q-inner-loading :showing="loading"><q-spinner-dots color="primary" size="40px" /></q-inner-loading>
      <q-card-section class="calendar-heading">
        <div class="text-subtitle1 text-weight-medium">{{ viewMode === 'month' ? monthLabel(currentDate) : viewMode === 'week' ? weekLabel : '全部订阅日程' }}</div>
        <q-space />
        <div class="row items-center q-gutter-xs"><q-badge color="positive" label="电影" /><q-badge color="primary" label="电视剧" /><span class="text-caption text-secondary">共 {{ totalEvents }} 个事件</span></div>
      </q-card-section>
      <q-separator />

      <q-card-section v-if="viewMode === 'week'" class="week-scroll">
        <div class="week-grid">
          <div v-for="day in weekDays" :key="day.getTime()" class="week-col">
            <div class="col-header" :class="{ 'is-today': isToday(day) }"><span class="col-day-name">星期{{ dayNames[day.getDay()] }}</span><span class="col-day-num">{{ day.getDate() }}</span></div>
            <div class="col-events">
              <div v-for="event in eventsOf(day)" :key="`${event.id}-${event.start}`" class="col-event" :class="isMovie(event) ? 'movie' : 'tv'">
                <div class="event-poster-sm" :style="posterStyle(event)"><q-icon v-if="!event.poster" name="movie" size="14px" /></div>
                <div class="event-info"><div class="event-title" :title="event.title">{{ event.title }}</div><q-badge :color="isMovie(event) ? 'positive' : 'primary'" :label="isMovie(event) ? '电影' : '剧集'" /></div>
              </div>
              <div v-if="!eventsOf(day).length" class="empty-day">—</div>
            </div>
          </div>
        </div>
      </q-card-section>

      <q-card-section v-else-if="viewMode === 'month'" class="month-section">
        <div class="month-weekdays"><div v-for="name in ['一', '二', '三', '四', '五', '六', '日']" :key="name">周{{ name }}</div></div>
        <div class="month-grid">
          <div v-for="day in monthDays" :key="day.getTime()" class="month-cell" :class="{ outside: !inCurrentMonth(day), today: isToday(day) }">
            <div class="day-num">{{ day.getDate() }}</div>
            <div class="event-list"><div v-for="event in eventsOf(day)" :key="`${event.id}-${event.start}`" class="event-item" :class="isMovie(event) ? 'movie' : 'tv'" :title="event.title">{{ event.title }}</div></div>
          </div>
        </div>
      </q-card-section>

      <q-card-section v-else class="schedule-view">
        <div v-if="!groupedSchedule.length" class="empty-state"><q-icon name="event_busy" size="40px" /><div>暂无订阅事件</div></div>
        <div v-for="[date, dayEvents] in groupedSchedule" :key="date" class="schedule-day">
          <div class="schedule-date-header" :class="{ 'is-today': date === dateKey(new Date()) }"><span class="schedule-date-label">{{ date }}</span><span class="schedule-date-weekday">{{ date === dateKey(new Date()) ? '今天 · ' : '' }}{{ dayNamesLong[new Date(date).getDay()] }}</span></div>
          <div v-if="!dayEvents.length" class="schedule-empty-day">今天暂无订阅事件</div>
          <div v-for="event in dayEvents" :key="`${event.id}-${event.start}`" class="schedule-item" :class="isMovie(event) ? 'movie' : 'tv'">
            <div class="schedule-poster" :style="posterStyle(event)"><q-icon v-if="!event.poster" name="movie" size="20px" /></div>
            <div class="schedule-info"><div class="schedule-title">{{ event.title }}</div><div class="schedule-meta"><q-badge :color="isMovie(event) ? 'positive' : 'primary'" :label="event.type" /><span v-if="event.vote_average" class="vote">★ {{ event.vote_average }}</span><span v-if="event.year" class="text-secondary">{{ event.year }}</span></div></div>
          </div>
        </div>
      </q-card-section>
    </q-card>
  </div>
</template>

<style scoped>
.rss-calendar { max-width: 1440px; margin: 0 auto; }
.calendar-card { position: relative; overflow: hidden; }
.calendar-heading { display: flex; align-items: center; gap: 12px; }
.week-scroll { overflow-x: auto; }
.week-grid { display: grid; grid-template-columns: repeat(7, minmax(130px, 1fr)); min-width: 840px; gap: 1px; overflow: hidden; border: 1px solid var(--border-subtle); border-radius: 10px; background: var(--border-subtle); }
.week-col { min-height: 190px; background: var(--surface); }
.col-header { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 4px 8px; border-bottom: 1px solid var(--border-subtle); }
.col-header.is-today { background: color-mix(in srgb, var(--q-primary) 8%, transparent); }
.col-header.is-today .col-day-name, .col-header.is-today .col-day-num { color: var(--q-primary); font-weight: 700; }
.col-day-name { color: var(--text-secondary); font-size: 12px; }
.col-day-num { color: var(--text-primary); font-size: 18px; line-height: 1.2; }
.col-events { display: flex; min-height: 145px; flex-direction: column; gap: 5px; padding: 6px; }
.col-event { display: flex; align-items: center; gap: 5px; padding: 4px; border-left: 3px solid var(--q-primary); border-radius: 5px; background: var(--surface-muted); }
.col-event.movie { border-left-color: var(--q-positive); }
.event-poster-sm, .schedule-poster { display: grid; flex: 0 0 auto; place-items: center; background-color: var(--surface-muted); background-position: center; background-size: cover; color: var(--text-secondary); }
.event-poster-sm { width: 24px; height: 32px; border-radius: 3px; }
.event-info { min-width: 0; }
.event-title { overflow: hidden; color: var(--text-primary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.empty-day { padding-top: 36px; color: var(--text-tertiary); text-align: center; }
.month-section { overflow-x: auto; }
.month-weekdays, .month-grid { display: grid; grid-template-columns: repeat(7, minmax(90px, 1fr)); min-width: 630px; }
.month-weekdays { color: var(--text-secondary); font-size: 12px; text-align: center; }
.month-weekdays > div { padding: 8px 4px; }
.month-grid { gap: 1px; border: 1px solid var(--border-subtle); background: var(--border-subtle); }
.month-cell { min-height: 108px; padding: 6px; background: var(--surface); }
.month-cell.outside { background: var(--surface-muted); }
.month-cell.today .day-num { display: inline-grid; width: 24px; height: 24px; place-items: center; border-radius: 50%; background: var(--q-primary); color: #fff; }
.day-num { color: var(--text-secondary); font-size: 12px; text-align: right; }
.event-list { display: flex; flex-direction: column; gap: 3px; margin-top: 4px; }
.event-item { overflow: hidden; padding: 3px 5px; border-left: 2px solid var(--q-primary); border-radius: 3px; background: var(--surface-muted); color: var(--text-primary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.event-item.movie { border-left-color: var(--q-positive); }
.schedule-view { display: grid; gap: 4px; }
.schedule-date-header { display: flex; align-items: baseline; gap: 8px; margin-top: 12px; padding: 6px 4px; border-bottom: 1px solid var(--border-subtle); color: var(--text-primary); font-weight: 650; }
.schedule-date-header:first-child { margin-top: 0; }
.schedule-date-weekday { color: var(--text-secondary); font-size: 12px; font-weight: 400; }
.schedule-date-header.is-today { color: var(--q-primary); background: var(--primary-soft); }
.schedule-empty-day { padding: 10px; color: var(--text-secondary); font-size: 12px; }
.schedule-item { display: flex; align-items: center; gap: 12px; padding: 10px; border-left: 4px solid var(--q-primary); border-radius: 8px; background: var(--surface-muted); }
.schedule-item.movie { border-left-color: var(--q-positive); }
.schedule-poster { width: 44px; height: 62px; border-radius: 5px; }
.schedule-info { min-width: 0; }
.schedule-title { overflow: hidden; color: var(--text-primary); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.schedule-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 6px; color: var(--text-secondary); font-size: 12px; }
.vote { color: var(--q-warning); }
.empty-state { display: grid; justify-items: center; gap: 8px; padding: 64px 16px; color: var(--text-secondary); }
@media (max-width: 599px) { .rss-calendar { padding-bottom: 8px; } .calendar-heading { align-items: flex-start; flex-wrap: wrap; } .calendar-heading > .q-space { display: none; } .calendar-heading > .row { width: 100%; } .week-scroll { overflow-x: visible; } .week-grid { grid-template-columns: 1fr; min-width: 0; gap: 8px; border: 0; background: transparent; } .week-col { min-height: 0; overflow: hidden; border: 1px solid var(--border-subtle); border-radius: 10px; } .col-header { flex-direction: row; justify-content: space-between; padding-inline: 12px; } .col-events { min-height: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); } .col-event { min-width: 0; } .event-title { white-space: normal; overflow-wrap: anywhere; } .schedule-item { min-width: 0; padding: 9px 8px; } .schedule-title { white-space: normal; overflow-wrap: anywhere; } }
</style>
