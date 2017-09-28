/* eslint-disable */
import { isFunction, uniqueId, remove, every, find, isNumber, isString, keys, assign, noop, isEqual, pick } from 'lodash'
import { getNodes } from '../utils/context'
import { contains } from '../utils/dom'

let handlerBindings = []
const bindingKey = '__veui_outside__'

document.addEventListener('click', e => {
  handlerBindings.forEach(item => {
    item[bindingKey] && item[bindingKey].handler(e)
  })
}, true)

function getElementsByRefs (refs, context) {
  const elements = []
  refs.forEach((ref) => {
    elements.push(...getNodes(ref, context))
  })
  return elements
}

function parseParams (el, arg, modifiers, value, context) {
  let includeTargets
  let handler
  let trigger
  // delay 表示如果鼠标移动到 includeTargets 元素之外多少秒之后，才会触发 handler
  let delay

  // 如果 value 是 Function 的话，其余参数就尽量从 modifier、arg 里面去解析
  // 否则从value里面去解析
  if (isFunction(value)) {
    handler = value

    const refs = arg ? arg.split(',') : []
    includeTargets = [el, ...getElementsByRefs(refs, context)]

    trigger = modifiers.hover ? 'hover' : 'click'

    delay = find(keys(modifiers), key => isNumber(parseInt(key, 10)) && modifiers[key])
    delay = delay ? parseInt(delay, 10) : 0
  } else {
    const normalizedValue = value || {}
    handler = isFunction(normalizedValue.handler) ? normalizedValue.handler : noop

    const refs = Array.isArray(normalizedValue.refs) ? normalizedValue.refs
      : (isString(normalizedValue.refs) ? normalizedValue.refs.split(',') : [normalizedValue.refs])
    includeTargets = [el, ...getElementsByRefs(refs, context)]

    trigger = normalizedValue.trigger === 'hover' ? 'hover' : 'click'

    delay = parseInt(normalizedValue.delay, 10)
    if (isNaN(delay)) {
      delay = 0
    }
  }

  return {
    includeTargets,
    handler,
    trigger,
    delay
  }
}

function generate (el, { includeTargets, handler, trigger, delay }) {
  return function (e) {
    // click 模式，直接判断元素包含情况
    if (e.type === trigger && every(includeTargets, element => !contains(element, e.target))) {
      handler(e)
    }
  }
}

let currentMousePos = {
  left: 0,
  top: 0
}
window.addEventListener('mousemove', event => {
  currentMousePos.top = event.pageY - document.body.scrollTop
  currentMousePos.left = event.pageX - document.body.scrollLeft
})

function bindHover (el, { includeTargets, handler, delay }, value) {
  unbindHover(el)

  function isOutside (element, targets) {
    return !targets.some(target => contains(target, element))
  }

  function checkLeave (element) {
    if (!isOutside(element, includeTargets)) {
      return
    }

    bindingData.hoverData.state = 'out'
    bindingData.hoverData.prevEvent = {
      target: el,
      relatedTarget: element
    }

    clearTimeout(bindingData.hoverData.timer)
    let check = () => {
      // 超时没移回，就要触发handler了
      if (bindingData.hoverData.state === 'out') {
        // 此处用最后一次记录的event对象
        handler(bindingData.hoverData.prevEvent || { target: element })
        // 重置状态
        bindingData.hoverData.state = 'ready'
      }
    }

    if (bindingData.delay) {
      bindingData.hoverData.timer = setTimeout(check, bindingData.delay)
    } else {
      check()
    }
  }

  const bindingData = assign(
    {},
    el[bindingKey] || {},
    {
      value,
      includeTargets,
      handler,
      delay,
      trigger: 'hover',
      hoverData: {
        state: 'ready',
        prevEvent: null,
        timer: null
      },
      mouseenterHandler: event => {
        bindingData.hoverData.state = 'in'
        bindingData.hoverData.prevEvent = event
      },
      mouseleaveHandler: event => checkLeave(event.relatedTarget)
    }
  )

  // 所有目标元素都绑定一遍事件
  bindHoverEvents(bindingData)

  el[bindingKey] = bindingData

  if (el.initialCheckTimer) {
    clearTimeout(el.initialCheckTimer)
  }
  el.initialCheckTimer = setTimeout(() => {
    let { left, top } = currentMousePos
    console.log('timer', el, document.elementFromPoint(left, top), includeTargets)
    checkLeave(document.elementFromPoint(left, top))
  }, 400)
}

function bindHoverEvents (bindingData) {
  bindingData.includeTargets.forEach((target) => {
    target.addEventListener('mouseenter', bindingData.mouseenterHandler)
    target.addEventListener('mouseleave', bindingData.mouseleaveHandler)
  })
}

function unbindHoverEvents (bindingData) {
  bindingData.includeTargets.forEach((target) => {
    target.removeEventListener('mouseenter', bindingData.mouseenterHandler)
    target.removeEventListener('mouseleave', bindingData.mouseleaveHandler)
  })
}

function unbindHover (el) {
  const bindingData = el[bindingKey]
  if (bindingData && bindingData.trigger === 'hover') {
    unbindHoverEvents(bindingData)
    el[bindingKey] = null
    clearTimeout(bindingData.hoverData.timer)
  }
}

function clear (el) {
  remove(handlerBindings, item => el[bindingKey] && item[bindingKey].id === el[bindingKey].id)
  unbindHover(el)
}

function refresh (el, { value, arg, modifiers, oldValue }, vnode) {
  const params = parseParams(el, arg, modifiers, value, vnode.context)

  // 真正发生了变化，才重刷
  let fields = params.trigger === 'click'
    ? ['includeTargets', 'trigger']
    : ['includeTargets', 'trigger', 'delay']
  if (isEqual(pick(el[bindingKey], fields), pick(params, fields))) {
    return
  }

  clear(el)
  if (params.trigger === 'click') {
    el[bindingKey] = {
      id: uniqueId('veui-outside-'),
      handler: generate(el, params),
      trigger: 'click'
    }
    handlerBindings.push(el)
  } else if (params.trigger === 'hover') {
    bindHover(el, params, value)
  }
}

export default {
  bind: refresh,
  update: refresh,
  unbind: clear
}
