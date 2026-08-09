;(function() {
	const safeGlobals = [
		"AbortController",
		"AbortSignal",
		"AggregateError",
		"Array",
		"ArrayBuffer",
		"Atomics",
		"BigInt",
		"BigInt64Array",
		"BigUint64Array",
		"Blob",
		"Boolean",
		"BroadcastChannel",
		"ByteLengthQueuingStrategy",
		"CompressionStream",
		"CountQueuingStrategy",
		"Crypto",
		"CryptoKey",
		"CustomEvent",
		"DOMException",
		"DataView",
		"Date",
		"DecompressionStream",
		"Error",
		"EvalError",
		"Event",
		"EventTarget",
		"File",
		"FinalizationRegistry",
		"Float32Array",
		"Float64Array",
		"FormData",
		"Function",
		"Headers",
		"Infinity",
		"Int16Array",
		"Int32Array",
		"Int8Array",
		"Intl",
		"Iterator",
		"JSON",
		"Map",
		"Math",
		"MessageChannel",
		"MessageEvent",
		"MessagePort",
		"NaN",
		"Navigator",
		"Number",
		"Object",
		"Performance",
		"PerformanceEntry",
		"PerformanceMark",
		"PerformanceMeasure",
		"PerformanceObserver",
		"PerformanceObserverEntryList",
		"PerformanceResourceTiming",
		"Promise",
		"Proxy",
		"RangeError",
		"ReadableByteStreamController",
		"ReadableStream",
		"ReadableStreamBYOBReader",
		"ReadableStreamBYOBRequest",
		"ReadableStreamDefaultController",
		"ReadableStreamDefaultReader",
		"ReferenceError",
		"Reflect",
		"RegExp",
		"Request",
		"Response",
		"Set",
		"String",
		"SubtleCrypto",
		"Symbol",
		"SyntaxError",
		"TextDecoder",
		"TextDecoderStream",
		"TextEncoder",
		"TextEncoderStream",
		"TransformStream",
		"TransformStreamDefaultController",
		"TypeError",
		"URIError",
		"URL",
		"URLSearchParams",
		"Uint16Array",
		"Uint32Array",
		"Uint8Array",
		"Uint8ClampedArray",
		"WeakMap",
		"WeakRef",
		"WeakSet",
		"WebAssembly",
		"WebSocket",
		"WritableStream",
		"WritableStreamDefaultController",
		"WritableStreamDefaultWriter",
		"atob",
		"btoa",
		"clearInterval",
		"clearTimeout",
		"console",
		"crypto",
		"decodeURI",
		"decodeURIComponent",
		"encodeURI",
		"encodeURIComponent",
		"escape",
		"eval",
		"fetch",
		"globalThis",
		"isFinite",
		"isNaN",
		"navigator",
		"parseFloat",
		"parseInt",
		"performance",
		"queueMicrotask",
		"setInterval",
		"setTimeout",
		"structuredClone",
		"undefined",
		"unescape",
	]
	safeGlobals.push('onmessage')
	safeGlobals.push('postMessage')
	const globalRemovalList = [];
	for(let api of Object.getOwnPropertyNames(window)) {
		if(safeGlobals.indexOf(api) == -1) {
			globalRemovalList.push(api)
		}
	}

	/**
	 * Checks if variable name is valid
	 */
	function IsVarnameValid(str) {
		return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(str)
	}

	/**
	 * Evaluate expression in a supposedly secure sandbox
	 * 
	 * @param {string} code Code passed to `eval()`
	 * @param {any} input The value to be natively posted into the sandbox, available to the expression as `input`.
	 * @param {number} timeLimitMs Time limit in milliseconds, use -1 for unlimited time.
	 * @returns Promise that resolves to the result or rejects with the error on finish
	 */
	async function workerEvalAsync(code, input, timeLimitMs = 3000) {
		let payload = ''
		payload += `
			for(const item of ${JSON.stringify(globalRemovalList)}) {
				if(item in self) {
					self[item] = undefined
					delete self[item]
				}
			}
		`
		payload += `
			self.onmessage = (event) => {
				const input = event.data
				const result = eval(${JSON.stringify(code)})
				self.postMessage(result)
			}
		`

		return await new Promise((resolve, reject) => {
			var worker = new Worker('data:text/javascript,' + encodeURIComponent(payload))

			worker.onmessage = (event) => {
				worker.terminate()
				resolve(event.data)
			}

			worker.onerror = (event) => {
				worker.terminate()
				event.preventDefault()
				reject(event)
			}

			worker.postMessage(input)

			if(timeLimitMs > 0) {
				setTimeout(() => {
					worker.terminate()
					reject(new Error(`Timeout of ${timeLimitMs}ms expired`))
				}, timeLimitMs)
			}
		})
	}

	window.WorkerSandbox = {
		evalAsync: workerEvalAsync
	}
})()
