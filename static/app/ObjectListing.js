import { ref, reactive, computed } from 'vue'
import { globsTest } from './util.js'

// TODO: Add path-specified expand-by-default feature
const ObjectListing = {
  props: {
    /**
     * Name of the tag.
     */
    name: { type: String, required: false },
    /**
     * The data to be viewed.
     * 
     * Properties that begin with `__` will not be listed.
     * Object or arrays will be collapsed by default, unless they have property `__expand` set to a truthy.
     * Any string will be expandable to its full form, but not expanded by default.
     */
    data: { required: true },
    /**
     * Level of existing indentations.
     */
    indent: { type: Number, default: 0 },
    /**
     * Path prefix (including trailing slash) of the current node.
     */
    pathPrefix: { type: String, default: '' },
    /**
     * Extra path globs (slash-separated) that should be expanded by default.
     */
    expandedGlobs: { type: Array, default: [] },
  },
  setup(props, ctx) {
    function isNameIncludable(name) {
      return !name.toString().startsWith('__')
    }
    function formatName(name) {
      if(typeof name == 'number') {
        return '[' + name + ']'
      }
      return name
    }
    const entryCount = computed(() => {
      if(Array.isArray(props.data)) {
        return props.data.length
      }
      if(typeof props.data != 'object' || props.data == null) {
        return -1
      }
      let count = 0
      for(let key in props.data) {
        if(!isNameIncludable(key)) {
          continue
        }
        count += 1
      }
      return count
    })
    const isLeaf = computed(() => {
      if(props.data === '') {
        return true
      }
      if(typeof props.data != 'string' && typeof props.data != 'function' && entryCount.value <= 0) {
        return true
      }
      return false
    })
    const defaultExpanded = computed(() => {
      if(globsTest(props.expandedGlobs, props.pathPrefix)) {
        return true
      }
      if(typeof props.data != 'object' || props.data == null) {
        return false
      }
      return !!props.data['__expanded']
    })
    const expanded = ref(defaultExpanded.value)
    const hasExpanded = ref(defaultExpanded.value)

    function toggleExpanded() {
      if(expanded.value) {
        tryCollapse()
      } else {
        tryExpand()
      }
    }
    function tryExpand() {
      if(!isLeaf.value) {
        expanded.value = true
        hasExpanded.value = true
      }
    }
    function tryCollapse() {
      expanded.value = false
    }

    return { isLeaf, expanded, toggleExpanded, tryExpand, tryCollapse, isNameIncludable, formatName, entryCount, hasExpanded }
  },
  components: { },
  template: /*html*/`
    <button
      tabindex="0"
      :class="'object-listing-line ' + (isLeaf ? 'leaf ' : '') + (expanded ? 'expanded ' : '')"
      :style="{ paddingLeft: 'calc(' + (indent+1) + ' * var(--dimen-tree-indent))' }"
      @click="toggleExpanded"
      @keydown.left="tryCollapse"
      @keydown.right="tryExpand"
    >
      <template v-if="name !== null">
        <span>{{name}}: </span>
      </template>
      <template v-if="data == null">
        <i style="color: var(--color-t1)">(nullish) </i>
        <span>{{ data === undefined ? 'undefined' : 'null' }}</span>
      </template>
      <template v-else-if="typeof data == 'boolean'">
        <i style="color: var(--color-t1)">(boolean) </i>
        <span :style="{color: data ? 'var(--color-primary)' : 'var(--color-caution-text)'}">{{ data ? 'true' : 'false' }}</span>
      </template>
      <template v-else-if="typeof data == 'number'">
        <i style="color: var(--color-t1)">(number) </i>
        <span style="color: var(--color-tertiary)">{{ data }}</span>
      </template>
      <template v-else-if="typeof data == 'string'">
        <i style="color: var(--color-t1)">(string) </i>
        <br v-if="expanded" />
        <span style="color: var(--color-success)">{{ data }}</span>
      </template>
      <template v-else-if="Array.isArray(data)">
        <i style="color: var(--color-t1)">(array) </i>
        <span style="color: var(--color-t1)">{{ entryCount }} entries</span>
      </template>
      <template v-else-if="typeof data == 'object'">
        <i style="color: var(--color-t1)">(object) </i>
        <span style="color: var(--color-t1)">{{ entryCount }} entries</span>
      </template>
      <template v-else>
        <i style="color: var(--color-t1)">({{ typeof data }})</i>
        <br v-if="expanded" />
        <span v-if="expanded">{{ data }}</span>
      </template>
    </button>
    <div v-if="entryCount > 0 && hasExpanded" :style="{ display: expanded ? 'block': 'none' }">
      <template v-for="item, name in data">
        <ObjectListing
          v-if="isNameIncludable(name)"
          :key="name"
          :name="formatName(name)"
          :data="item"
          :indent="indent + 1"
          :pathPrefix="pathPrefix + formatName(name) + '/'"
          :expandedGlobs="expandedGlobs"
        />
      </template>
    </div>
  `
}
Object.assign(ObjectListing['components'], { ObjectListing })
export default ObjectListing
