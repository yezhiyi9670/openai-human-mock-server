import { ref, reactive, computed, useTemplateRef, watchEffect } from 'vue'
import { getFocusableElements, getRequestId } from './util.js'


// TODO: Finish listing focus wrap, enable navigation using up/down
export default {
  props: { },
  emits: [ ],
  setup(props, ctx) {
    const container = useTemplateRef('container')

    function handleNav(delta) {
      const element = container.value
      if(element == null) {
        return
      }
      const focuses = getFocusableElements(element)
      const index = focuses.indexOf(document.activeElement)
      const newIndex = Math.max(0, Math.min(focuses.length - 1, index + delta))
      focuses[newIndex].focus()
    }

    return { handleNav }
  },
  template: /*html*/`
    <div
      ref="container"
      class="listing-focus-wrap"
      @keydown.up.prevent="handleNav(-1)"
      @keydown.down.prevent="handleNav(1)"
    >
      <slot />
    </div>
  `
}
