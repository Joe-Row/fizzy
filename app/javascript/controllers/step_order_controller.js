import { Controller } from "@hotwired/stimulus"
import { post } from "@rails/request.js"

export default class extends Controller {
  dragStart(event) {
    const item = event.target.closest("[data-step-id]")
    if (!item) {
      event.preventDefault()
      return
    }
    if (event.target.closest("input, textarea, a.step__content, a.step__card")) {
      event.preventDefault()
      return
    }

    event.stopPropagation()
    event.dataTransfer.effectAllowed = "move"
    this.item = item
    this.origin = { parent: item.parentNode, next: item.nextElementSibling }
    item.classList.add("drag-and-drop__dragged-item")
  }

  dragOver(event) {
    if (!this.item) return
    event.preventDefault()
    event.stopPropagation()

    const over = event.target.closest("[data-step-id]")
    if (!over || over === this.item) return

    const rect = over.getBoundingClientRect()
    if (event.clientY < rect.top + rect.height / 2) over.before(this.item)
    else over.after(this.item)
  }

  async drop(event) {
    if (!this.item) return
    event.preventDefault()
    event.stopPropagation()
    this.wasDropped = true

    const cardPath = this.element.dataset.cardPath
    const stepId = this.item.dataset.stepId
    if (!cardPath || !stepId) return

    const next = this.item.nextElementSibling
    const body = new FormData()
    if (next?.dataset?.stepId) body.append("before_id", next.dataset.stepId)

    await post(`${cardPath}/steps/${stepId}/position`, { body })
  }

  dragEnd(event) {
    event.stopPropagation()
    if (this.item) this.item.classList.remove("drag-and-drop__dragged-item")

    if (!this.wasDropped && this.origin && this.item) {
      const { parent, next } = this.origin
      if (next) parent.insertBefore(this.item, next)
      else parent.appendChild(this.item)
    }

    this.item = null
    this.origin = null
    this.wasDropped = false
  }
}
