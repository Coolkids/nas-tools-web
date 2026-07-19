<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  Aim,
  Bell, Calendar, ChatDotRound, CircleClose, Clock, Collection,
  Compass, Connection,
  Document, Download, EditPen, Files,
  Film, Filter,
  Histogram,
  HomeFilled, List, Loading, Monitor, Postcard, Refresh,
  Search, Setting, SetUp, Tools, User,
  VideoCamera,
  VideoPlay
} from "@element-plus/icons-vue";

const route = useRoute()
const activeMenu = computed(() => route.path)
</script>

<template>
  <el-menu
    :default-active="activeMenu"
    router
    class="app-sidebar-menu"
    background-color="transparent"
  >
    <el-menu-item index="/index">
      <el-icon><HomeFilled /></el-icon>
      <span>首页</span>
    </el-menu-item>

    <el-sub-menu index="discovery">
      <template #title>
        <el-icon><Compass /></el-icon>
        <span>探索</span>
      </template>
      <el-menu-item index="/recommend">
        <el-icon><Histogram /></el-icon>
        <span>推荐</span>
      </el-menu-item>
      <el-menu-item index="/ranking">
        <el-icon><Histogram /></el-icon>
        <span>榜单</span>
      </el-menu-item>
      <el-menu-item index="/bangumi">
        <el-icon><VideoPlay /></el-icon>
        <span>BANGUMI</span>
      </el-menu-item>
    </el-sub-menu>

    <el-menu-item index="/search">
      <el-icon><Search /></el-icon>
      <span>资源搜索</span>
    </el-menu-item>

    <el-sub-menu index="rss">
      <template #title>
        <el-icon><Bell /></el-icon>
        <span>订阅管理</span>
      </template>
      <el-menu-item index="/movie_rss">
        <el-icon><Film /></el-icon>
        <span>电影订阅</span>
      </el-menu-item>
      <el-menu-item index="/tv_rss">
        <el-icon><VideoCamera /></el-icon>
        <span>电视剧订阅</span>
      </el-menu-item>
      <el-menu-item index="/user_rss">
        <el-icon><Document /></el-icon>
        <span>自定义订阅</span>
      </el-menu-item>
      <el-menu-item index="/rss_history">
        <el-icon><Clock /></el-icon>
        <span>订阅历史</span>
      </el-menu-item>
      <el-menu-item index="/rss_calendar">
        <el-icon><Calendar /></el-icon>
        <span>订阅日历</span>
      </el-menu-item>
    </el-sub-menu>

    <el-sub-menu index="download">
      <template #title>
        <el-icon><Download /></el-icon>
        <span>下载管理</span>
      </template>
      <el-menu-item index="/downloading">
        <el-icon><Loading /></el-icon>
        <span>正在下载</span>
      </el-menu-item>
      <el-menu-item index="/downloaded">
        <el-icon><Download /></el-icon>
        <span>最近下载</span>
      </el-menu-item>
      <el-menu-item index="/torrent_remove">
        <el-icon><CircleClose /></el-icon>
        <span>自动删种</span>
      </el-menu-item>
    </el-sub-menu>

    <el-sub-menu index="rename">
      <template #title>
        <el-icon><Files /></el-icon>
        <span>媒体整理</span>
      </template>
      <el-menu-item index="/mediafile">
        <el-icon><Files /></el-icon>
        <span>文件管理</span>
      </el-menu-item>
      <el-menu-item index="/unidentification">
        <el-icon><Aim /></el-icon>
        <span>手动识别</span>
      </el-menu-item>
      <el-menu-item index="/history">
        <el-icon><Clock /></el-icon>
        <span>转移历史</span>
      </el-menu-item>
      <el-menu-item index="/tmdbcache">
        <el-icon><Postcard /></el-icon>
        <span>TMDB缓存</span>
      </el-menu-item>
    </el-sub-menu>

    <el-menu-item index="/service">
      <el-icon><Setting /></el-icon>
      <span>服务</span>
    </el-menu-item>

    <el-sub-menu index="setting">
      <template #title>
        <el-icon><Tools /></el-icon>
        <span>系统设置</span>
      </template>
      <el-menu-item index="/basic">
        <el-icon><Setting /></el-icon>
        <span>基础设置</span>
      </el-menu-item>
      <el-menu-item index="/customwords">
        <el-icon><EditPen /></el-icon>
        <span>自定义识别词</span>
      </el-menu-item>
      <el-menu-item index="/downloader">
        <el-icon><Download /></el-icon>
        <span>下载器</span>
      </el-menu-item>
      <el-menu-item index="/download_setting">
        <el-icon><SetUp /></el-icon>
        <span>下载设置</span>
      </el-menu-item>
      <el-menu-item index="/directorysync">
        <el-icon><Refresh /></el-icon>
        <span>目录同步</span>
      </el-menu-item>
      <el-menu-item index="/indexer">
        <el-icon><List /></el-icon>
        <span>索引器</span>
      </el-menu-item>
      <el-menu-item index="/mediaserver">
        <el-icon><Monitor /></el-icon>
        <span>媒体服务器</span>
      </el-menu-item>
      <el-menu-item index="/library">
        <el-icon><Collection /></el-icon>
        <span>媒体库</span>
      </el-menu-item>
      <el-menu-item index="/notification">
        <el-icon><Bell /></el-icon>
        <span>消息通知</span>
      </el-menu-item>
      <el-menu-item index="/subtitle">
        <el-icon><ChatDotRound /></el-icon>
        <span>字幕</span>
      </el-menu-item>
      <el-menu-item index="/douban">
        <el-icon><Connection /></el-icon>
        <span>豆瓣同步</span>
      </el-menu-item>
      <el-menu-item index="/filterrule">
        <el-icon><Filter /></el-icon>
        <span>过滤规则</span>
      </el-menu-item>
      <el-menu-item index="/users">
        <el-icon><User /></el-icon>
        <span>用户管理</span>
      </el-menu-item>
    </el-sub-menu>
  </el-menu>
</template>

<style scoped>
.app-sidebar-menu {
  border-right: none;
  height: 100%;
}
</style>
