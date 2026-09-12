export function getRequestId(req) {
  return req['id']
}

export function globToRegExp(glob) {
  let regex = ''

  const isAbsolute = glob.length > 0 && glob[0] == '/'
  const isDirectory = glob.length > 0 && glob[glob.length - 1] == '/'
  const parts = glob.split('/').filter(s => s != '')
  
  if(isAbsolute) {
    regex += '^[/]*'
  } else {
    regex += '^((.*)/)?'
  }
  for(let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const isLast = i == parts.length - 1
    if(/[*][*]+/.test(part)) {
      // Special segment of many asterisks: Zero or more segments
      if(!isLast || isDirectory) {
        regex += '((.*)/)?'
      } else {
        regex += '(.*)'
      }
    } else if(/[*]/.test(part)) {
      // Special segment of one asterisk: One arbitrary and non-empty segment
      regex += '([^/]+)'
      if(!isLast || isDirectory) {
        regex += '[/]+'
      }
    } else {
      // Normal segment, where:
      // - `?` is one non-slash character
      // - one asterisk is zero or more non-slash characters
      // - many asterisks are zero or more arbitrary characters
      const rectifiedPart = part.replace(/[*][*]+/g, '**')
      for(let j = 0; j < rectifiedPart.length; j++) {
        const currentChar = rectifiedPart[j]
        const nextChar = j < rectifiedPart.length - 1 ? rectifiedPart[j+1] : ''
        if(currentChar == '?') {
          regex += '([^/])'
        } else if(currentChar == '*') {
          if(nextChar == '*') {
            regex += '(.*)'
          } else {
            regex += '([^/]*)'
          }
        } else {
          regex += RegExp.escape("\\" + currentChar).substring(2)
        }
      }
      if(!isLast || isDirectory) {
        regex += '[/]+'
      }
    }
  }
  if(!isDirectory) {
    regex += '[/]*'
  }

  regex += '$'
  return RegExp(regex)
}
export function globTest(glob, path) {
  return globToRegExp(glob).test(path)
}
export function globsTest(globs, path) {
  for(let glob of globs) {
    if(globTest(glob, path)) {
      return true
    }
  }
  return false
}

export function getFocusableElements(container) {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'details',
    'summary',
    'iframe',
    'object',
    'embed',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
    '[contenteditable=""]' // empty string also means true
  ].join(',');

  const candidates = container.querySelectorAll(selector);

  return Array.from(candidates).filter(el => {
    // Visibility
    if (el.offsetParent === null) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;

    // Inert (self or ancestor)
    let parent = el;
    while (parent) {
      if (parent.hasAttribute('inert')) return false;
      parent = parent.parentElement;
    }

    // Disabled (includes fieldset)
    if (el.disabled === true) return false;

    // For contenteditable, ensure it's not set to false
    if (el.hasAttribute('contenteditable') && el.getAttribute('contenteditable') === 'false') return false;

    return true;
  });
}

const sandbox = new IframeSandbox()
export async function parseRespondText(text) {
  const fncall_regexp = /^#([A-Za-z0-9_\-$]+)\((.*?)\)(\n|$)/mg

  const callParseMap = {}
  Object.setPrototypeOf(callParseMap, null)

  const matches = text.matchAll(fncall_regexp)
  for(const item of matches) {
    const fn_args = item[2]
    if(fn_args in callParseMap) {
      continue
    }
    const args_parse_payload_dict = `
      ({${fn_args}})
    `
    const args_parse_payload_value = `
      (${fn_args})
    `
    let args_parse_result = null
    sandbox.forceReset()
    try {
      args_parse_result = {
        success: true, 
        data: await sandbox.eval(args_parse_payload_dict, { timeout: 1000 })
      }
    } catch(err) {
      try {
        args_parse_result = {
          success: true, 
          data: await sandbox.eval(args_parse_payload_value, { timeout: 1000 })
        }
      } catch(err) {
        args_parse_result = {
          success: false,
          data: err
        }
      }
    }
    callParseMap[fn_args] = args_parse_result
  }

  const fncalls = []
  const errors = []
  const clearedText = text.replace(fncall_regexp, (match, fn_name, fn_args, newline) => {
    const args_parse_result = callParseMap[fn_args]
    if(args_parse_result['success']) {
      fncalls.push({
        id: 'call_' + (fncalls.length + 1),
        name: fn_name,
        arguments: args_parse_result['data']
      })
      return ''
    } else {
      if('message' in args_parse_result['data']) {
        errors.push(args_parse_result['data']['message'])
      } else {
        errors.push(args_parse_result['data'])
      }
      
      return ''
    }
  })

  return [ clearedText, fncalls, errors ]
}
