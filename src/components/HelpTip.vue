<template>
  <el-tooltip :content="text" placement="top" effect="dark" popper-class="help-tip-popper">
    <el-icon class="help-tip" @click.stop><QuestionFilled /></el-icon>
  </el-tooltip>
</template>

<script setup>
defineProps({
  text: {
    type: String,
    default: ''
  }
})
</script>

<style scoped>
.help-tip {
  margin-left: 4px;
  color: var(--el-text-color-secondary);
  cursor: help;
  vertical-align: middle;
}
.help-tip:hover {
  color: var(--el-color-primary);
}
</style>

<style>
.help-tip-popper {
  max-width: 420px;
  white-space: pre-line;
  line-height: 1.6;
}
</style>
