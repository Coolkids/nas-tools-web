<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Refresh, ArrowLeft, ArrowRight, Film as FilmIcon } from '@element-plus/icons-vue'
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
const currentDate = ref(new Date())
const events = ref<CalendarEvent[]>([])
const viewMode = ref<'week' | 'month' | 'schedule'>('week')

const dayNames = ['日', '一', '二', '三', '四', '五', '六']

onMounted(load)

async function load() {
  loading.value = true
  try {
    const [movieRes, tvRes] = await Promise.all([getMovieRssList(), getTvRssList()])
    const movieItems: RssMediaItem[] = movieRes.code === 0 ? Object.values(movieRes.result || {}) : []
    const tvItems: RssMediaItem[] = tvRes.code === 0 ? Object.values(tvRes.result || {}) : []

    const evs: CalendarEvent[] = []
    await Promise.all(
      movieItems.map(async (m) => {
        try {
          const res = await doAction<{ code: number; id?: string | number; title?: string; start?: string; poster?: string; vote_average?: string | number; year?: string; type?: string; rssid?: string | number }>(
            'movie_calendar_data',
            { id: m.tmdbid, rssid: m.id }
          )
          if (res.code === 0 && res.start) {
            evs.push({
              id: res.id ?? m.id,
              title: res.title ?? m.name,
              start: res.start,
              poster: res.poster,
              vote_average: res.vote_average,
              year: res.year,
              type: res.type ?? '电影',
              rssid: res.rssid ?? m.id
            })
          }
        } catch {
          /* ignore */
        }
      })
    )
    await Promise.all(
      tvItems.map(async (t) => {
        try {
          const seasonNum = t.season ? parseInt((t.season as string).replace('S', ''), 10) : undefined
          const res = await doAction<{ code: number; events?: CalendarEvent[] }>('tv_calendar_data', {
            id: t.tmdbid,
            season: seasonNum,
            name: t.name,
            rssid: t.id
          })
          if (res.code === 0 && res.events) {
            for (const e of res.events) evs.push(e)
          }
        } catch {
          /* ignore */
        }
      })
    )
    events.value = evs
  } catch (e) {
    modal.error(e instanceof Error ? e.message : '获取日历数据失败')
  } finally {
    loading.value = false
  }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function isToday(d: Date): boolean {
  const t = new Date()
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function eventsOf(date: Date): CalendarEvent[] {
  const key = dateKey(date)
  return events.value.filter((e) => (e.start || '').slice(0, 10) === key)
}

function isMovie(e: CalendarEvent): boolean {
  return e.type === '电影' || e.type === 'MOV'
}

function posterStyle(e: CalendarEvent): Record<string, string> {
  if (!e.poster) return {}
  return { backgroundImage: `url(${e.poster})` }
}

const weekStart = computed(() => {
  const d = new Date(currentDate.value)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
})

const weekDays = computed(() => {
  const start = weekStart.value
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d
  })
})

const weekLabel = computed(() => {
  const first = weekDays.value[0]
  const last = weekDays.value[6]
  return `${formatDate(first)} ~ ${formatDate(last)}`
})

const totalEvents = computed(() => events.value.length)

function onPrev() {
  const d = new Date(currentDate.value)
  if (viewMode.value === 'week') {
    d.setDate(d.getDate() - 7)
  } else if (viewMode.value === 'month') {
    d.setMonth(d.getMonth() - 1)
  }
  currentDate.value = d
}

function onNext() {
  const d = new Date(currentDate.value)
  if (viewMode.value === 'week') {
    d.setDate(d.getDate() + 7)
  } else if (viewMode.value === 'month') {
    d.setMonth(d.getMonth() + 1)
  }
  currentDate.value = d
}

function onToday() {
  currentDate.value = new Date()
}
</script>

<template>
  <div class="rss-calendar" v-loading="loading">
    <PageHeader title="订阅日历" description="电影/电视剧上线日程">
      <template #actions>
        <el-radio-group v-model="viewMode">
          <el-radio-button value="week">周</el-radio-button>
          <el-radio-button value="month">月</el-radio-button>
          <el-radio-button value="schedule">日程</el-radio-button>
        </el-radio-group>
        <el-button-group class="nav-group">
          <el-button :icon="ArrowLeft" @click="onPrev" />
          <el-button @click="onToday">今天</el-button>
          <el-button :icon="ArrowRight" @click="onNext" />
        </el-button-group>
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <el-card shadow="never">
      <div v-if="viewMode === 'week'" class="week-view">
        <div class="week-label-bar">{{ weekLabel }}</div>
        <div class="week-grid">
          <div v-for="day in weekDays" :key="day.getTime()" class="week-col">
            <div class="col-header" :class="{ 'is-today': isToday(day) }">
              <span class="col-day-name">{{ dayNames[day.getDay()] }}</span>
              <span class="col-day-num">{{ day.getDate() }}</span>
            </div>
            <div class="col-events">
              <div
                v-for="e in eventsOf(day)"
                :key="`${e.id}-${e.start}`"
                class="col-event"
                :class="isMovie(e) ? 'movie' : 'tv'"
              >
                <div class="event-poster-sm" :style="posterStyle(e)">
                  <el-icon v-if="!e.poster" :size="14"><FilmIcon /></el-icon>
                </div>
                <div class="event-info">
                  <div class="event-title" :title="e.title">{{ e.title }}</div>
                  <div class="event-meta">
                    <el-tag size="small" :type="isMovie(e) ? 'success' : 'primary'" effect="dark">
                      {{ isMovie(e) ? '电影' : '剧集' }}
                    </el-tag>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <el-calendar v-else-if="viewMode === 'month'" v-model="currentDate">
        <template #date-cell="{ data }">
          <div class="calendar-cell">
            <div class="day-num" :class="{ today: isToday(new Date(data.day)) }">
              {{ data.day.split('-').slice(2).join('') }}
            </div>
            <div class="event-list">
              <div
                v-for="e in eventsOf(new Date(data.day))"
                :key="`${e.id}-${e.start}`"
                class="event-item"
                :class="isMovie(e) ? 'movie' : 'tv'"
              >
                <div class="event-poster" :style="posterStyle(e)">
                  <el-icon v-if="!e.poster"><FilmIcon /></el-icon>
                </div>
                <div class="event-info">
                  <div class="event-title" :title="e.title">{{ e.title }}</div>
                  <div class="event-meta">
                    <el-tag size="small" :type="isMovie(e) ? 'success' : 'primary'" effect="plain">
                      {{ e.type }}
                    </el-tag>
                    <span v-if="e.vote_average" class="vote">★ {{ e.vote_average }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </el-calendar>

      <div v-else class="schedule-view">
        <div class="schedule-list">
          <template v-for="ev in events" :key="`${ev.id}-${ev.start}`">
            <div class="schedule-item" :class="isMovie(ev) ? 'movie' : 'tv'">
              <div class="schedule-date">
                <div class="schedule-month">{{ (ev.start || '').slice(5, 7) }}月</div>
                <div class="schedule-day">{{ (ev.start || '').slice(8, 10) }}</div>
              </div>
              <div class="schedule-poster" :style="posterStyle(ev)">
                <el-icon v-if="!ev.poster" :size="20"><FilmIcon /></el-icon>
              </div>
              <div class="schedule-info">
                <div class="schedule-title">{{ ev.title }}</div>
                <div class="schedule-meta">
                  <el-tag size="small" :type="isMovie(ev) ? 'success' : 'primary'" effect="plain">
                    {{ ev.type }}
                  </el-tag>
                  <span v-if="ev.vote_average" class="vote">★ {{ ev.vote_average }}</span>
                  <span v-if="ev.year" class="schedule-year">{{ ev.year }}</span>
                </div>
              </div>
            </div>
          </template>
          <el-empty v-if="!events.length" description="暂无订阅事件" />
        </div>
      </div>
    </el-card>

    <div class="legend">
      <el-tag type="success" effect="dark">电影</el-tag>
      <el-tag type="primary" effect="dark">电视剧</el-tag>
      <span class="muted">共 {{ totalEvents }} 个订阅事件</span>
    </div>
  </div>
</template>

<style scoped>
.rss-calendar {
  padding: 16px;
}
.nav-group {
  margin: 0 8px;
}
.week-label-bar {
  text-align: center;
  font-size: 15px;
  font-weight: 600;
  padding-bottom: 12px;
  color: var(--el-text-color-primary);
}
.week-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  background: var(--el-border-color-light);
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  overflow: hidden;
}
.week-col {
  background: var(--el-bg-color);
  min-height: 180px;
  display: flex;
  flex-direction: column;
}
.col-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 4px 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.col-header.is-today .col-day-name,
.col-header.is-today .col-day-num {
  color: var(--el-color-primary);
  font-weight: 600;
}
.col-day-name {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.col-day-num {
  font-size: 18px;
  color: var(--el-text-color-primary);
  line-height: 1.2;
}
.col-events {
  flex: 1;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow-y: auto;
}
.col-event {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border-radius: 3px;
  background: var(--el-fill-color-light);
  border-left: 3px solid var(--el-color-primary);
}
.col-event.movie {
  border-left-color: var(--el-color-success);
}
.event-poster-sm {
  width: 22px;
  height: 30px;
  flex-shrink: 0;
  background-size: cover;
  background-position: center;
  background-color: var(--el-fill-color-darker);
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
}

.calendar-cell {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.day-num {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: right;
  padding: 2px 4px;
}
.day-num.today {
  color: var(--el-color-primary);
  font-weight: 600;
}
.event-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
}
.event-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  border-left: 3px solid var(--el-color-primary);
  border-radius: 2px;
  background-color: var(--el-fill-color-light);
}
.event-item.movie {
  border-left-color: var(--el-color-success);
}
.event-item.tv {
  border-left-color: var(--el-color-primary);
}
.event-poster {
  width: 28px;
  height: 36px;
  flex-shrink: 0;
  background-size: cover;
  background-position: center;
  background-color: var(--el-fill-color-darker);
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
}
.event-info {
  flex: 1;
  min-width: 0;
}
.event-title {
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.event-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}
.vote {
  font-size: 11px;
  color: var(--el-color-warning);
}

.schedule-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0;
}
.schedule-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  border-left: 4px solid var(--el-color-primary);
  transition: background 0.15s;
}
.schedule-item:hover {
  background: var(--el-fill-color);
}
.schedule-item.movie {
  border-left-color: var(--el-color-success);
}
.schedule-date {
  text-align: center;
  flex-shrink: 0;
  width: 44px;
}
.schedule-month {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.schedule-day {
  font-size: 22px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  line-height: 1.2;
}
.schedule-poster {
  width: 42px;
  height: 60px;
  flex-shrink: 0;
  background-size: cover;
  background-position: center;
  background-color: var(--el-fill-color-darker);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
}
.schedule-info {
  flex: 1;
  min-width: 0;
}
.schedule-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.schedule-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
.schedule-year {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.legend {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 0 4px;
}
.muted {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
