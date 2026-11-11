<script setup lang="ts">
import type { Component } from 'vue'
import type { EditorTool } from './editor-state'
import { Circle, Crop, Grid3x3, Hash, MoveUpRight, PaintBucket, Pen, Square, Type } from '@lucide/vue'

/** The tools down the left: crop on its own, then the marks, then mosaic. */
defineProps<{ activeTool: EditorTool, disabled: boolean }>()
const emit = defineEmits<{ select: [tool: EditorTool] }>()

const TOOLS: { id: EditorTool, label: string, icon: Component }[] = [
  { id: 'crop', label: '裁切', icon: Crop },
  { id: 'arrow', label: '箭頭', icon: MoveUpRight },
  { id: 'pen', label: '畫筆', icon: Pen },
  { id: 'rect', label: '方框', icon: Square },
  { id: 'ellipse', label: '橢圓', icon: Circle },
  { id: 'text', label: '文字', icon: Type },
  { id: 'counter', label: '編號', icon: Hash },
  { id: 'cover', label: '遮蓋', icon: PaintBucket },
  { id: 'mosaic', label: '馬賽克', icon: Grid3x3 },
]
</script>

<template>
  <div class="hlx-picture-editor-rail" role="toolbar" aria-orientation="vertical" aria-label="工具">
    <template v-for="(tool, index) in TOOLS" :key="tool.id">
      <button
        type="button"
        class="hlx-picture-editor-tool"
        :aria-label="tool.label"
        :title="tool.label"
        :aria-pressed="activeTool === tool.id"
        :disabled="disabled"
        @click="emit('select', tool.id)"
      >
        <component :is="tool.icon" :size="18" aria-hidden="true" />
      </button>
      <div v-if="index === 0" class="hlx-picture-editor-rail-divider" />
    </template>
  </div>
</template>
