import { Controller } from "@hotwired/stimulus"
import { post } from "@rails/request.js"
import { nextFrame } from "helpers/timing_helpers"

export default class extends Controller {
  static targets = [ "item", "container" ]
  static classes = [ "draggedItem", "hoverContainer" ]

  async dragStart(event) {
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.dropEffect = "move"
    event.dataTransfer.setData("37ui/move", event.target)

    await nextFrame()
    this.dragItem = this.#itemContaining(event.target)
    if (!this.dragItem) return

    this.sourceContainer = this.#containerContaining(this.dragItem)
    this.originalDraggedItemCssVariable = this.#containerCssVariableFor(this.sourceContainer)
    this.dragGroup = this.#groupFor(this.dragItem)
    this.origin = this.dragGroup.map((el) => ({
      el,
      parent: el.parentNode,
      next: el.nextElementSibling
    }))
    this.dragItem.classList.add(this.draggedItemClass)
  }

  dragOver(event) {
    event.preventDefault()
    if (!this.dragItem) return

    const container = this.#containerContaining(event.target)
    this.#clearContainerHoverClasses()

    if (!container) return

    if (container === this.sourceContainer) {
      this.#restoreOriginalDraggedItemCssVariable()
      this.#reorderWithinList(event)
    } else if (!this.dragItem.dataset.parentCardId) {
      container.classList.add(this.hoverContainerClass)
      this.#applyContainerCssVariableToDraggedItem(container)
    }
  }

  async drop(event) {
    const targetContainer = this.#containerContaining(event.target)
    if (!this.dragItem || !targetContainer) return

    if (this.dragItem.dataset.parentCardId && targetContainer !== this.sourceContainer) {
      return
    }

    if (targetContainer === this.sourceContainer) {
      this.wasDropped = true
      this.#writeDomPositions()
      await this.#submitPositionRequest()
      return
    }

    this.wasDropped = true
    this.#increaseCounter(targetContainer)
    this.#decreaseCounter(this.sourceContainer)

    const sourceContainer = this.sourceContainer
    window.__nimueDropping = true
    this.#insertDraggedItem(targetContainer, this.dragItem)
    await this.#submitDropRequest(this.dragItem, targetContainer)
    this.#reloadSourceFrame(sourceContainer)
    setTimeout(() => { window.__nimueDropping = false }, 2000)
  }

  dragEnd() {
    if (this.dragItem) this.dragItem.classList.remove(this.draggedItemClass)
    this.#clearContainerHoverClasses()

    if (!this.wasDropped) {
      this.#restoreOrigin()
      this.#restoreOriginalDraggedItemCssVariable()
    }

    this.sourceContainer = null
    this.dragItem = null
    this.dragGroup = null
    this.origin = null
    this.wasDropped = false
    this.originalDraggedItemCssVariable = null
  }

  #itemContaining(element) {
    return this.itemTargets.find(item => item.contains(element) || item === element)
  }

  #containerContaining(element) {
    return this.containerTargets.find(container => container.contains(element) || container === element)
  }

  #clearContainerHoverClasses() {
    this.containerTargets.forEach(container => container.classList.remove(this.hoverContainerClass))
  }

  #applyContainerCssVariableToDraggedItem(container) {
    const cssVariable = this.#containerCssVariableFor(container)
    if (cssVariable) {
      this.dragItem.style.setProperty(cssVariable.name, cssVariable.value)
    }
  }

  #restoreOriginalDraggedItemCssVariable() {
    if (this.originalDraggedItemCssVariable) {
      const { name, value } = this.originalDraggedItemCssVariable
      this.dragItem.style.setProperty(name, value)
    }
  }

  #containerCssVariableFor(container) {
    const { dragAndDropCssVariableName, dragAndDropCssVariableValue } = container.dataset
    if (dragAndDropCssVariableName && dragAndDropCssVariableValue) {
      return { name: dragAndDropCssVariableName, value: dragAndDropCssVariableValue }
    }
    return null
  }

  #increaseCounter(container) {
    this.#modifyCounter(container, count => count + 1)
  }

  #decreaseCounter(container) {
    this.#modifyCounter(container, count => Math.max(0, count - 1))
  }

  #modifyCounter(container, fn) {
    const counterElement = container.querySelector("[data-drag-and-drop-counter]")
    if (counterElement) {
      const currentValue = counterElement.textContent.trim()

      if (!/^\d+$/.test(currentValue)) return

      counterElement.textContent = fn(parseInt(currentValue))
    }
  }

  #insertDraggedItem(container, item) {
    const itemContainer = container.querySelector("[data-drag-drop-item-container]")
    const topItems = itemContainer.querySelectorAll("[data-drag-and-drop-top]")
    const firstTopItem = topItems[0]
    const lastTopItem = topItems[topItems.length - 1]

    const isTopItem = item.hasAttribute("data-drag-and-drop-top")
    const referenceItem = isTopItem ? firstTopItem : lastTopItem

    if (referenceItem) {
      referenceItem[isTopItem ? "before" : "after"](item)
    } else {
      itemContainer.prepend(item)
    }

    this.#placeGroupAfter(item)
  }

  async #submitDropRequest(item, container) {
    const body = new FormData()
    const id = item.dataset.id
    const url = container.dataset.dragAndDropUrl.replaceAll("__id__", id)

    return post(url, { body, headers: { Accept: "text/vnd.turbo-stream.html" } })
  }

  #reloadSourceFrame(sourceContainer) {
    const frame = sourceContainer.querySelector("[data-drag-and-drop-refresh]")
    if (frame) frame.reload()
  }

  #groupFor(item) {
    if (item.dataset.parentCardId) return [ item ]

    const kids = this.itemTargets.filter((el) => el.dataset.parentCardId === item.dataset.cardId)
    return [ item, ...kids ]
  }

  #blockEnd(item) {
    const group = this.#groupFor(item)
    return group[group.length - 1]
  }

  #parentCard(item) {
    const pid = item.dataset.parentCardId
    if (!pid) return item
    return this.itemTargets.find((el) => el.dataset.cardId === pid) || item
  }

  #reorderWithinList(event) {
    const overItem = this.#itemContaining(event.target)
    if (!overItem || this.dragGroup.includes(overItem)) return

    const pid = this.dragItem.dataset.parentCardId
    let target = overItem

    if (pid) {
      if (overItem.dataset.parentCardId !== pid) return
    } else if (overItem.dataset.parentCardId) {
      target = this.#parentCard(overItem)
      if (this.dragGroup.includes(target)) return
    }

    const rect = target.getBoundingClientRect()
    const before = event.clientY < rect.top + rect.height / 2

    if (before) {
      target.before(this.dragItem)
    } else {
      this.#blockEnd(target).after(this.dragItem)
    }

    this.#placeGroupAfter(this.dragItem)
  }

  #placeGroupAfter(anchor) {
    let cursor = anchor
    this.dragGroup.forEach((el) => {
      if (el === anchor) return
      cursor.after(el)
      cursor = el
    })
  }

  #nextPeer() {
    let el = this.#blockEnd(this.dragItem).nextElementSibling
    const pid = this.dragItem.dataset.parentCardId

    while (el) {
      if (!el.matches?.("article.card")) {
        el = el.nextElementSibling
        continue
      }

      if (pid) {
        if (el.dataset.parentCardId === pid) return el
        return null
      }

      if (!el.dataset.parentCardId) return el
      el = el.nextElementSibling
    }

    return null
  }

  async #submitPositionRequest() {
    const href = this.dragItem.querySelector("a.card__link")?.getAttribute("href")
    if (!href) return

    const next = this.#nextPeer()
    const body = new FormData()
    if (next?.dataset?.id) body.append("before_id", next.dataset.id)

    return post(`${href}/position`, { body })
  }

  #writeDomPositions() {
    const list = this.dragItem.closest(".cards__list")
    if (!list) return

    const pid = this.dragItem.dataset.parentCardId
    if (pid) {
      [...list.querySelectorAll(`article.card[data-parent-card-id="${pid}"]`)].forEach((el, i) => {
        el.dataset.position = String(i)
      })
    } else {
      [...list.querySelectorAll("article.card:not([data-parent-card-id])")].forEach((el, i) => {
        el.dataset.position = String(i)
      })
    }
  }

  #restoreOrigin() {
    if (!this.origin) return

    ;[...this.origin].reverse().forEach(({ el, parent, next }) => {
      if (!parent) return
      if (next && next.parentNode === parent) parent.insertBefore(el, next)
      else parent.appendChild(el)
    })
  }
}
