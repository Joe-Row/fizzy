import { Controller } from "@hotwired/stimulus"
import { nextFrame, debounce } from "helpers/timing_helpers";
import { isNative } from "helpers/platform_helpers";

export default class extends Controller {
  static classes = [ "collapsed", "expanded", "noTransitions", "titleNotVisible" ]
  static targets = [ "column", "button", "title", "maybeColumn" ]
  static values = {
    board: String,
    desktopBreakpoint: { type: String, default: "(min-width: 640px)" }
  }

  initialize() {
    this.restoreState = debounce(this.restoreState.bind(this), 10)
    this._recency = []
    this._userInteracted = false
  }

  async connect() {
    this.mediaQuery = window.matchMedia(this.desktopBreakpointValue)
    this.handlePlatform = this.#handlePlatform.bind(this)
    this.mediaQuery.addEventListener("change", this.handlePlatform)
    this._restoring = true
    await this.#restoreColumnsDisablingTransitions()
    this.#setupIntersectionObserver()
    await nextFrame()
    this._restoring = false
  }

  disconnect() {
    if (this._intersectionObserver) {
      this._intersectionObserver.disconnect()
      this._intersectionObserver = null
    }
    this.mediaQuery.removeEventListener("change", this.handlePlatform)
  }

  toggle({ target }) {
    this._userInteracted = true
    const column = target.closest('[data-collapsible-columns-target~="column"]')
    this.#toggleColumn(column)
  }

  preventToggle(event) {
    if (event.target.hasAttribute("data-collapsible-columns-target") && event.detail.attributeName === "class") {
      event.preventDefault()
    }
  }

  async restoreState(event) {
    await nextFrame()
    await this.#restoreColumnsDisablingTransitions()
  }

  focusOnColumn({ target }) {
    if (this._restoring) return
    if (window.__nimueColumnArrow !== true) return
    window.__nimueColumnArrow = false
    if (!this.#isDesktop) return
    if (!this.#isCollapsed(target)) return
    this.#openKeepingLastRecent(target)
  }

  frameColumnOnMobile(event) {
    if (!this.#isDesktop) {
      event.currentTarget.scrollIntoView({ behavior: "smooth", inline: "center" })
    }
  }

  async #restoreColumnsDisablingTransitions() {
    this.#disableTransitions()
    this.#restoreColumns()
    this.#handlePlatform()
    await nextFrame()
    this.#enableTransitions()
  }

  #disableTransitions() {
    this.element.classList.add(this.noTransitionsClass)
  }

  #enableTransitions() {
    this.element.classList.remove(this.noTransitionsClass)
  }

  #toggleColumn(column) {
    if (!this.#isDesktop) {
      this.#collapseAllExcept(column)
      if (this.#isCollapsed(column)) {
        this.#expand({ column })
      } else {
        this.#collapse(column)
      }
      return
    }

    if (this.#isCollapsed(column)) {
      this.#openKeepingLastRecent(column)
    } else {
      this.#collapse(column)
      this._recency = this._recency.filter(id => id !== column.id)
      this.#saveRecency()
    }
  }

  #openKeepingLastRecent(column) {
    const keepOther = this.#columnById(this.#lastRecentOpenId(column.id))
    this.#expand({ column })
    this.#touchRecency(column)
    this.columnTargets.forEach(c => {
      if (c.id === "not-now") return
      if (c === column) return
      if (keepOther && c === keepOther) return
      if (!this.#isCollapsed(c)) this.#collapse(c)
    })
  }

  #lastRecentOpenId(exceptId) {
    return this._recency.find(id => id !== exceptId && id !== "not-now" && this.#isOpenId(id))
  }

  #isOpenId(id) {
    const column = this.#columnById(id)
    return !!(column && !this.#isCollapsed(column))
  }

  #columnById(id) {
    if (!id) return null
    return this.columnTargets.find(column => column.id === id) || null
  }

  #touchRecency(column) {
    this._recency = this._recency.filter(id => id !== column.id)
    this._recency.unshift(column.id)
    this.#saveRecency()
  }

  #saveRecency() {
    localStorage.setItem(this.#recencyKey(), JSON.stringify(this._recency))
  }

  #recencyKey() {
    return "nimue-expand-order-" + this.boardValue
  }

  #loadRecency() {
    try {
      const saved = JSON.parse(localStorage.getItem(this.#recencyKey()) || localStorage.getItem("expand-order-" + this.boardValue) || "[]")
      this._recency = Array.isArray(saved) ? saved.filter(id => this.#columnById(id)) : []
    } catch (e) {
      this._recency = []
    }
  }

  #collapseAllExcept(clickedColumn) {
    this.columnTargets.forEach(column => {
      if (column !== clickedColumn) this.#collapse(column)
    })
  }

  #isCollapsed(column) {
    return column.classList.contains(this.collapsedClass)
  }

  #collapse(column, { saveState = true } = {}) {
    this.#buttonFor(column)?.setAttribute("aria-expanded", "false")
    column.classList.remove(this.expandedClass)
    column.classList.add(this.collapsedClass)
    if (saveState) {
      localStorage.setItem(this.#localStorageKeyFor(column), "collapsed")
    }
  }

  #expand({ column, saveState = true, scrollBehavior = "smooth" }) {
    this.#buttonFor(column)?.setAttribute("aria-expanded", "true")
    column.classList.remove(this.collapsedClass)
    column.classList.add(this.expandedClass)
    if (saveState) {
      localStorage.setItem(this.#localStorageKeyFor(column), "expanded")
    }
    if (window.matchMedia("(max-width: 639px)").matches) {
      column.scrollIntoView({ behavior: scrollBehavior, inline: "center" })
    }
  }

  #buttonFor(column) {
    return this.buttonTargets.find(button => column.contains(button))
  }

  #restoreColumns() {
    this.#loadRecency()
    this.#forgetStockKeys()

    // Decide the final open set first, then apply once. Expanding every
    // saved column and collapsing extras afterward flashes a full board.
    const keep = this.#desiredOpenIds()
    this.columnTargets.forEach((column) => {
      if (column.id === "not-now") return
      if (keep.includes(column.id)) {
        this.#expand({ column, saveState: false, scrollBehavior: "instant" })
      } else {
        this.#collapse(column, { saveState: false })
      }
    })
  }

  #desiredOpenIds() {
    const storedOpen = this.columnTargets
      .filter((column) => column.id !== "not-now" && this.#storedExpanded(column))
      .map((column) => column.id)

    if (!this.#isDesktop) {
      const fromRecency = this._recency.find((id) => storedOpen.includes(id) && id !== "maybe")
      if (fromRecency) return [fromRecency]
      const doing = storedOpen.find((id) => id !== "maybe" && id !== "closed")
      if (doing) return [doing]
      if (storedOpen[0]) return [storedOpen[0]]
      const custom = this.columnTargets.find((column) =>
        column.id !== "not-now" && column.id !== "maybe" && column.id !== "closed"
      )
      if (custom) return [custom.id]
      return this.maybeColumnTarget ? [this.maybeColumnTarget.id] : []
    }

    const keep = []
    this._recency.forEach((id) => {
      if (storedOpen.includes(id) && !keep.includes(id)) keep.push(id)
    })
    storedOpen.forEach((id) => {
      if (!keep.includes(id)) keep.push(id)
    })
    if (keep.includes("maybe") && keep.some((id) => id !== "maybe" && id !== "closed") && this._recency[0] !== "maybe") {
      keep.splice(keep.indexOf("maybe"), 1)
    }
    if (keep.length > 0) return keep.slice(0, 2)

    const custom = this.columnTargets.find((column) =>
      column.id !== "not-now" && column.id !== "maybe" && column.id !== "closed"
    )
    if (custom) return [custom.id]
    return this.maybeColumnTarget ? [this.maybeColumnTarget.id] : []
  }

  #storedExpanded(column) {
    const id = column.getAttribute("id")
    const state = localStorage.getItem(this.#localStorageKeyFor(column))
      || localStorage.getItem("expand-" + this.boardValue + "-" + id)
    return state === "expanded" || state === "true"
  }

  #localStorageKeyFor(column) {
    return "nimue-expand-" + this.boardValue + "-" + column.getAttribute("id")
  }

  #forgetStockKeys() {
    const prefixes = ["expand-" + this.boardValue + "-", "expand-order-" + this.boardValue]
    const remove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      if (key.startsWith("nimue-")) continue
      if (prefixes.some(prefix => key === prefix || key.startsWith(prefix))) remove.push(key)
    }
    remove.forEach(key => localStorage.removeItem(key))
  }

  #setupIntersectionObserver() {
    if (typeof IntersectionObserver === "undefined") return
    if (this._intersectionObserver) this._intersectionObserver.disconnect()
    this._intersectionObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const title = entry.target
        const column = title.closest(".cards")
        if (!column) return
        column.classList.toggle(this.titleNotVisibleClass, entry.intersectionRatio === 0)
      })
    }, { threshold: [0] })
    this.titleTargets.forEach(title => this._intersectionObserver.observe(title))
  }

  get #isDesktop() {
    return this.mediaQuery?.matches
  }

  #handlePlatform() {
    this.#isDesktop ? this.#handleDesktopMode() : this.#handleMobileMode()
  }

  async #handleDesktopMode() {
    this.#maybeButton?.removeAttribute("disabled")
  }

  #handleMobileMode() {
    this.#maybeButton?.removeAttribute("disabled")
    const expandedColumn = this.columnTargets.find(column => column !== this.maybeColumnTarget && !this.#isCollapsed(column))
    if (expandedColumn) {
      this.#collapseAllExcept(expandedColumn)
    } else if (this.maybeColumnTarget) {
      this.#collapseAllExcept(this.maybeColumnTarget)
      this.#expand({ column: this.maybeColumnTarget, saveState: false })
    }
  }

  get #maybeButton() {
    return this.maybeColumnTarget?.querySelector('[data-collapsible-columns-target="button"]')
  }
}
