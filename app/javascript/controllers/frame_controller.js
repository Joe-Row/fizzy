import { Controller } from "@hotwired/stimulus"
import { Turbo } from "@hotwired/turbo-rails"

export default class extends Controller {
  morphRender({ detail }) {
    detail.render = function (currentElement, newElement) {
      Turbo.morphChildren(currentElement, newElement)
    }
  }

  morphReload(event) {
    const newElement = event.detail.newElement
    if (newElement && newElement.tagName === "TURBO-FRAME" && newElement.matches('[data-controller~="frame"]')) {
      event.preventDefault()
      if (window.__nimueDropping && this.element.querySelector("article.card")) return
      this.element.reload()
    }
  }

  reload() {
    this.element.reload()
  }
}
