<script setup>
import { ref, onMounted, onBeforeUnmount, watch, shallowRef } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  option: { type: Object, required: true },
  height: { type: String, default: '320px' },
})

const el = ref(null)
const chart = shallowRef(null)
let ro = null

function render() {
  if (!chart.value) return
  chart.value.setOption(props.option, true)
}

onMounted(() => {
  chart.value = echarts.init(el.value, null, { renderer: 'canvas' })
  render()
  ro = new ResizeObserver(() => chart.value && chart.value.resize())
  ro.observe(el.value)
})

onBeforeUnmount(() => {
  if (ro) ro.disconnect()
  if (chart.value) chart.value.dispose()
})

watch(
  () => props.option,
  () => render(),
  { deep: true },
)
</script>

<template>
  <div ref="el" class="chart" :style="{ height }"></div>
</template>

<style scoped>
.chart {
  width: 100%;
}
</style>
