import { ref, reactive, computed, onUnmounted } from 'vue'
import RequestsList from './RequestsList.js'
import { getRequestId } from './util.js'
import RequestView from './RequestView.js'
import ObjectListing from './ObjectListing.js'
import ListingFocusWrap from './ListingFocusWrap.js'

export default {
  setup() {
    const hasLoadedOnce = ref(false)
    const requests = ref([])
    const selectedIdentifier = ref('')

    const selectedRequest = computed(() => {
      for(let request of requests.value) {
        if(getRequestId(request) == selectedIdentifier.value) {
          return request
        }
      }
      return null
    })

    function ensureSelection() {
      if(requests.value.length > 0 && !selectedRequest.value) {
        selectedIdentifier.value = getRequestId(requests.value[0])
      }
    }

    const API_BASE = ""
    async function refresh() {
      try {
        const res = await fetch(`${API_BASE}/__mock/api/requests`)
        const data = await res.json()

        requests.value = data['requests']
        ensureSelection()
        hasLoadedOnce.value = true
      } catch (err) {
        if(!hasLoadedOnce.value) {
          alert('Failed to load pending list.')
        }
      }
    }
    ;(() => {
      let timer = setInterval(refresh, 2000)
      refresh()
      onUnmounted(() => clearInterval(timer))
    })()

    async function nukeAll() {
      try {
        const res = await fetch(`${API_BASE}/__mock/api/reject-all`, {method: 'POST'})
        const data = await res.json()

        if(!data['ok']) {
          throw new Error('not ok')
        }
        requests.value = requests.value.filter(r => data['rejected'].indexOf(getRequestId(r)) == -1)
        ensureSelection()
      } catch(err) {
        console.error('NukeAll error', err)
        alert('NukeAll failed.')
      }
    }

    async function rejectRequest(id) {
      try {
        const res = await fetch(`${API_BASE}/__mock/api/reject/${id}`, {method: 'POST'})
        const data = await res.json()

        if(!data['ok']) {
          throw new Error('not ok')
        }
        requests.value = requests.value.filter(r => id != getRequestId(r))
        ensureSelection()
      } catch(err) {
        console.error('Reject', id, 'error', err)
        alert('Reject ' + id + ' failed.')
      }
    }

    async function respondRequest(id, body) {
      try {
        const res = await fetch(`${API_BASE}/__mock/api/respond/${id}`, {
          method: 'POST',
          body: JSON.stringify({payload: body}),
          headers: {
            'Content-Type': 'application/json',
          }
        })
        const data = await res.json()

        if(!data['ok']) {
          throw new Error('not ok')
        }
        requests.value = requests.value.filter(r => id != getRequestId(r))
        ensureSelection()
      } catch(err) {
        console.error('Respond', id, 'error', err)
        alert('Respond ' + id + ' failed.')
      }
    }

    return {
      requests, selectedIdentifier, selectedRequest, window,
      nukeAll, rejectRequest, getRequestId, respondRequest
    }
  },
  components: {
    RequestsList,
    RequestView,
    ObjectListing,
    ListingFocusWrap,
  },
  template: /*html*/`
    <div class="app">
      <h1>能工智人应答终端</h1>
      <button :disabled="requests.length == 0" @click="nukeAll">Nuke all</button>
      <p></p>
      <RequestsList :requests="requests" v-model:selectedIdentifier="selectedIdentifier" />
      <template v-for="request in requests">
        <div class="request-view-wrap" :style="{ display: request == selectedRequest ? 'block': 'none' }">
          <RequestView
            :key="getRequestId(request)"
            :request="request"
            @reject="rejectRequest(getRequestId(request))"
            @respond="body => respondRequest(getRequestId(request), body)"
          />
        </div>
      </template>

      <!-- <ListingFocusWrap>
        <ObjectListing
          :name="'root'"
          :pathPrefix="'/'"
          :expandedGlobs="[
            '/',
            '/ml',
            '/arr/*',
            '/obj',
            '/obj/g',
            '/func',
            '/unexplainable/location',
            '/unexplainable/document/location',
          ]"
          :data="{
            n: null,
            u: undefined,
            b: true,
            c: false,
            ar: 114514.1919810,
            sl: 'Hello, world!rg3vfyqvi0fkopkwmng87e89f 31989 b3rj0v92 ngj2jqe0dbwio i2ruojriofmevi2r n0r2 jb jb 2rngvb  n02ir 0i42rwi 3rwn o i0b2r0n fe0i i3rnr0n riwf jrwfevdj h2wrii r2uw 142ruhwvi',
            ml: 'A\\nB\\nC\\nD',
            arr: [3, 4, null, 552, 'Hello', 'help', [7, 9, 11], {a:1, b:2}, undefined],
            obj: {c:3, d:4, e:null, f:552, g:'Hello', h:'help', i:[7, 9, 11], j:{a:1, b:2}, k:undefined},
            func: () => {},
            unexplainable: window
          }"
        />
      </ListingFocusWrap> -->
    </div>
  `
}
