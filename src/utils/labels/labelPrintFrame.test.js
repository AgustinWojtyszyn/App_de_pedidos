import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupDirectLabelPrint,
  getDirectLabelPrintState,
  prepareDirectLabelPrint,
  printLabelsDirectly
} from './labelPrintFrame'

const createClassList = (initial = []) => {
  const values = new Set(initial)
  return {
    add: value => values.add(value),
    remove: value => values.delete(value),
    contains: value => values.has(value)
  }
}

const createStyle = (values = {}) => ({
  values: { ...values },
  setProperty(name, value) {
    this.values[name] = String(value)
  },
  getPropertyValue(name) {
    return this.values[name] || ''
  }
})

const createSurface = (count, previewRoot) => {
  const cards = Array.from({ length: count }, (_, index) => ({
    textContent: `Etiqueta ${index + 1}`
  }))
  const pages = Array.from({ length: count }, () => ({}))

  const surface = {
    classList: createClassList(['labels-print-surface', 'labels-print-thermal']),
    attributes: {},
    querySelectorAll(selector) {
      if (selector === '.sf-label-card') return cards
      if (selector === '.thermal-label-page') return pages
      return []
    },
    closest(selector) {
      return selector === '.labels-preview-root' ? previewRoot : null
    },
    cloneNode() {
      return createSurface(count, previewRoot)
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value)
    }
  }

  return surface
}

const installFakeBrowser = (count = 2) => {
  const previewRoot = {
    style: createStyle({
      '--thermal-label-width': '100mm',
      '--thermal-label-height': '50mm',
      '--label-a4-columns': '2'
    })
  }
  const sourceSurface = createSurface(count, previewRoot)
  const mounts = new Map()

  const body = {
    classList: createClassList(),
    appendChild(node) {
      node.parentNode = this
      mounts.set(node.id, node)
      return node
    }
  }

  const documentMock = {
    body,
    fonts: { ready: Promise.resolve() },
    querySelector(selector) {
      return selector === '.labels-preview-root .labels-print-surface'
        ? sourceSurface
        : null
    },
    getElementById(id) {
      return mounts.get(id) || null
    },
    createElement(tagName) {
      expect(tagName).toBe('div')
      const node = {
        id: '',
        className: '',
        attributes: {},
        children: [],
        style: createStyle(),
        setAttribute(name, value) {
          this.attributes[name] = String(value)
        },
        appendChild(child) {
          this.children.push(child)
          return child
        },
        querySelectorAll(selector) {
          return this.children.flatMap(child => child.querySelectorAll(selector))
        },
        remove() {
          mounts.delete(this.id)
          this.parentNode = null
        }
      }
      return node
    }
  }

  const listeners = new Map()
  const windowMock = {
    getComputedStyle(node) {
      return node.style
    },
    requestAnimationFrame(callback) {
      callback()
      return 1
    },
    addEventListener(name, callback) {
      listeners.set(name, callback)
    },
    removeEventListener(name, callback) {
      if (listeners.get(name) === callback) listeners.delete(name)
    },
    setTimeout: vi.fn(() => 99),
    clearTimeout: vi.fn(),
    print: vi.fn(() => {
      const afterPrint = listeners.get('afterprint')
      if (afterPrint) {
        listeners.delete('afterprint')
        afterPrint()
      }
    })
  }

  vi.stubGlobal('document', documentMock)
  vi.stubGlobal('window', windowMock)

  return {
    documentMock,
    windowMock,
    mounts
  }
}

afterEach(() => {
  try {
    cleanupDirectLabelPrint()
  } catch (_error) {
    // El test puede haber restaurado globals antes de que exista document.
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('direct label printing', () => {
  it('creates exactly one top-level mount with the exact cloned label count', () => {
    const { documentMock } = installFakeBrowser(2)

    const prepared = prepareDirectLabelPrint(2)

    expect(prepared.labelCount).toBe(2)
    expect(documentMock.getElementById('label-print-mount')).toBe(prepared.mount)
    expect(documentMock.body.classList.contains('is-printing-labels')).toBe(true)
    expect(prepared.mount.querySelectorAll('.sf-label-card')).toHaveLength(2)
    expect(prepared.mount.querySelectorAll('.thermal-label-page')).toHaveLength(2)
  })

  it('cleans the mount and body print class after afterprint', async () => {
    const { windowMock } = installFakeBrowser(2)

    const result = await printLabelsDirectly(2)

    expect(result).toEqual({ printed: true, labelCount: 2 })
    expect(windowMock.print).toHaveBeenCalledTimes(1)
    expect(getDirectLabelPrintState()).toEqual({
      mounted: false,
      bodyClassActive: false,
      labelTexts: []
    })
  })

  it('never creates or depends on an iframe', async () => {
    const { documentMock } = installFakeBrowser(1)
    const createElementSpy = vi.spyOn(documentMock, 'createElement')

    await printLabelsDirectly(1)

    expect(createElementSpy).toHaveBeenCalledWith('div')
    expect(createElementSpy).not.toHaveBeenCalledWith('iframe')
  })
})
