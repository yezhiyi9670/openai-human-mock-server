import { ref, reactive, computed, watchEffect } from 'vue'
import { getRequestId, parseRespondText } from './util.js'
import ListingFocusWrap from './ListingFocusWrap.js'
import ObjectListing from './ObjectListing.js'

export default {
  props: {
    request: { type: Object, required: true }
  },
  emits: ['reject', 'respond'],
  setup(props, ctx) {
    const body = computed(() => {
      return props.request['body']
    })
    const composedText = ref('')
    const canRespond = ref(false)
    const responseBody = ref({})
    const responseParseErrors = ref([])
    
    let responseParseNonce = 0
    watchEffect(async () => {
      canRespond.value = false
      const text = composedText.value
      const nonce = responseParseNonce = (responseParseNonce + 1) % Number.MAX_SAFE_INTEGER
      const [ clearedText, fncalls, errors ] = await parseRespondText(text)
      if(nonce != responseParseNonce) {
        return
      }
      if(props.request['path'] == '/v1/responses') {
        responseBody.value = {
          output: [
            {
              type: "message",
              role: "assistant",
              content: [
                {
                  type: "output_text",
                  text: clearedText,
                },
              ],
            },
            ...fncalls.map(item => ({
              type: 'function_call',
              id: item.id,
              name: item.name,
              arguments: typeof item.arguments == 'string' ? item.arguments : JSON.stringify(item.arguments),
              call_id: item.id
            }))
          ],
        }
        responseParseErrors.value = errors
      } else {
        responseBody.value = {
          choices: [
            {
              message: {
                role: "assistant",
                content: clearedText,
                tool_calls: fncalls.map(item => ({
                  id: item.id,
                  type: 'function',
                  function: {
                    name: item.name,
                    arguments: typeof item.arguments == 'string' ? item.arguments : JSON.stringify(item.arguments)
                  }
                }))
              },
              finish_reason: "stop",
            },
          ],
        }
        responseParseErrors.value = errors
      }
      canRespond.value = true
    })

    return { body, getRequestId, composedText, responseBody, canRespond, responseParseErrors }
  },
  components: { ListingFocusWrap, ObjectListing },
  template: /*html*/`
    <div class="request-view">
      <button @click="$emit('reject')">Reject this</button>
      <p></p>
      <ListingFocusWrap>
        <ObjectListing
          :name="'metadata'"
          :pathPrefix="'/'"
          :expandedGlobs="[
            '/'
          ]"
          :data="{
            id: request['id'],
            received_at: request['received_at'],
            path: request['path'],
          }"
        />
        <ObjectListing
          :name="'request_body'"
          :pathPrefix="'/'"
          :expandedGlobs="[
            '/messages/',
            '/messages/*/',
            '/input/*/',
            '/input/*/content/',
            '/input/*/content/*/',
            '/tools/',
            '/tools/*/',
          ]"
          :data="body"
        />
      </ListingFocusWrap>

      <p></p>
      
      <textarea
        class="compose-area"
        v-model="composedText"
        @keydown.ctrl.enter="canRespond && $emit('respond', responseBody)"
      ></textarea>
      <p></p>
      <button @click="canRespond && $emit('respond', responseBody)" :disabled="!canRespond">Respond this</button>
      <p></p>
      <ListingFocusWrap>
        <ObjectListing
          :name="'parsing_errors'"
          :pathPrefix="'/'"
          :data="responseParseErrors"
          :expandedGlobs="[
            '/',
          ]"
        />
        <ObjectListing
          :name="'response'"
          :pathPrefix="'/'"
          :data="responseBody"
          :expandedGlobs="[
            '/choices/',
            '/choices/*/',
            '/choices/*/message/',
            '/choices/*/message/tool_calls/',
            '/choices/*/message/tool_calls/*/',
            '/choices/*/message/tool_calls/*/function/',
            '/choices/*/message/tool_calls/*/function/arguments/',
            '/output/',
            '/output/*/',
            '/output/*/arguments/',
            '/output/*/content/',
            '/output/*/content/*',
            '/tools/',
            '/tools/*/',
          ]"
        />
      </ListingFocusWrap>
    </div>
  `
}
