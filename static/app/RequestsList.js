import { ref, reactive, computed, useTemplateRef, watchEffect } from 'vue'
import { getRequestId } from './util.js'

export default {
  props: {
    requests: { type: Array, required: true },
    selectedIdentifier: { type: String, required: true }
  },
  emits: ['update:selectedIdentifier'],
  setup(props, ctx) {
    const selectedIndex = computed(() => {
      for(let i = 0; i < props.requests.length; i++) {
        const request = props.requests[i]
        if(getRequestId(request) == props.selectedIdentifier) {
          return i
        }
      }
      return -1
    })

    const itemRefs = useTemplateRef('items')
    function moveSelection(delta) {
      if(props.requests.length == 0) {
        return
      }
      const newIndex = Math.max(0, Math.min(props.requests.length - 1, selectedIndex.value + delta))
      ctx.emit('update:selectedIdentifier', getRequestId(props.requests[newIndex]))
    }

    watchEffect(() => {
      if(itemRefs.value) {
        const element = itemRefs.value[selectedIndex.value]
        if(element) {
          element.scrollIntoView({ block: 'nearest' })
        }
      }
    })

    return { getRequestId, moveSelection }
  },
  template: /*html*/`
    <div
      class="requests-list"
      tabindex="0"
      @keydown.down.prevent="moveSelection(1)"
      @keydown.up.prevent="moveSelection(-1)"
    >
      <template v-if="requests.length > 0">
        <button
          ref="items"
          v-for="item in requests"
          :class="'request-item ' + (selectedIdentifier == getRequestId(item) ? 'active' : '')"
          @click="$emit('update:selectedIdentifier', getRequestId(item))"
          tabindex="-1"
        >
          {{ getRequestId(item) }} @ {{ item['received_at'] }}
        </button>
      </template>
      <div v-else style="margin: auto;">
        No work
      </div>
    </div>
  `
}
