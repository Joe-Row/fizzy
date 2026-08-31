// Vim board keys. hjkl navigate. e fold, E toggle expand/collapse all, i add task, x delete.
// w toggles the highlighted column. h/l move that highlight across columns
// (open or collapsed) without using Fizzy's arrow keys.
// Fizzy keeps s/o/c/a/m/t/[ /]/Enter — do not steal those.
// Open-card uses e for closure; only steal e on the board (.card-columns).

function isTyping(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable
    || !!el.closest("input, textarea, [contenteditable], lexxy-editor, dialog, .task-cards-form")
}

function columnOf(card) {
  return card?.closest?.('[data-collapsible-columns-target~="column"]')
    || card?.closest?.("section.cards")
    || null
}

function columnIsOpen(column) {
  return !!column && !column.classList.contains("is-collapsed") && column.id !== "not-now"
}

function selectedCard() {
  const focused = document.activeElement?.closest?.("article.card")
  if (focused && !focused.hidden && columnIsOpen(columnOf(focused))) return focused

  const inOpenColumn = [...document.querySelectorAll("section.cards:not(.is-collapsed) article.card[aria-selected='true']")]
    .find((el) => !el.hidden)
  if (inOpenColumn) return inOpenColumn

  return null
}

function firstVisibleCard() {
  const open = [...document.querySelectorAll("section.cards")].filter((el) => {
    if (el.id === "not-now") return false
    return !el.classList.contains("is-collapsed")
  })
  const doing = open.find((el) => el.id !== "maybe" && !el.classList.contains("cards--maybe"))
  const column = doing || open[0]
  if (!column) return null
  return [...column.querySelectorAll("article.card")].find((el) => !el.hidden) || null
}

function ensureHighlight() {
  const state = loadFocus()
  if (state?.restore) {
    const saved = findBoardCard(state)
    if (saved && !saved.hidden && columnIsOpen(columnOf(saved))) {
      selectCard(saved)
      return saved
    }
  }
  const current = selectedCard()
  if (current && !current.hidden && columnIsOpen(columnOf(current))) return current
  const card = firstVisibleCard()
  if (!card) return null
  selectCard(card)
  return card
}

function onBoard() {
  return !!document.querySelector(".card-columns")
}

function onCardPerma() {
  return !!document.querySelector(".card-perma") && !onBoard()
}

const FOCUS_KEY = "fizzy-board-focus"

function currentBoardId() {
  return document.querySelector(".card-columns")?.dataset?.collapsibleColumnsBoardValue
    || document.querySelector("[data-collapsible-columns-board-value]")?.dataset?.collapsibleColumnsBoardValue
    || null
}

// Fizzy card URLs use to_param = number ("12"). Board previews use data-card-id = DB id
// and data-id = number. Match either.
function findBoardCard(state) {
  if (!state) return null
  if (state.cardId) {
    const byDb = document.querySelector(`article.card[data-card-id="${CSS.escape(String(state.cardId))}"]`)
    if (byDb) return byDb
  }
  if (state.cardNumber != null && state.cardNumber !== "") {
    const byNum = document.querySelector(`article.card[data-id="${CSS.escape(String(state.cardNumber))}"]`)
    if (byNum) return byNum
  }
  return null
}

function cardNumberFromUrl() {
  const m = location.pathname.match(/\/cards\/([^/?#]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

function captureScrolls() {
  const columns = {}
  document.querySelectorAll("section.cards").forEach((section) => {
    if (!section.id) return
    const card = section.querySelector("article.card")
    if (!card) return
    const scroller = findScrollParent(card)
    if (!scroller || scroller === document.scrollingElement
      || scroller === document.documentElement
      || scroller === document.body) return
    columns[section.id] = scroller.scrollTop
  })
  const board = document.querySelector(".card-columns")
  return { columns, boardX: board?.scrollLeft || 0 }
}

function applyScrolls(state) {
  if (!state) return
  const board = document.querySelector(".card-columns")
  if (board && typeof state.boardX === "number") board.scrollLeft = state.boardX
  Object.entries(state.columns || {}).forEach(([id, top]) => {
    const section = document.getElementById(id)
    if (!section) return
    const card = section.querySelector("article.card")
    if (!card) return
    const scroller = findScrollParent(card)
    if (scroller) scroller.scrollTop = top
  })
}

function loadFocus() {
  try {
    const raw = sessionStorage.getItem(FOCUS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeFocus(state) {
  try {
    sessionStorage.setItem(FOCUS_KEY, JSON.stringify(state))
  } catch { /* quota */ }
}

function saveFocus(overrides = {}) {
  const prev = loadFocus() || {}
  const card = onBoard() ? selectedCard() : null
  const cardId = overrides.cardId !== undefined
    ? overrides.cardId
    : (card?.dataset?.cardId || prev.cardId || null)
  const cardNumber = overrides.cardNumber !== undefined
    ? overrides.cardNumber
    : (card?.dataset?.id || (onCardPerma() ? cardNumberFromUrl() : null) || prev.cardNumber || null)
  const boardId = overrides.boardId || currentBoardId() || prev.boardId || null
  const scrolls = onBoard() ? captureScrolls() : (prev.scrolls || { columns: {}, boardX: 0 })
  const restore = overrides.restore !== undefined ? overrides.restore : !!prev.restore
  writeFocus({
    boardId,
    cardId,
    cardNumber,
    scrolls,
    restore,
    at: Date.now()
  })
}

function markRestore() {
  const prev = loadFocus() || {}
  writeFocus({ ...prev, restore: true, at: Date.now() })
}

function clearRestoreFlag() {
  const prev = loadFocus()
  if (!prev) return
  writeFocus({ ...prev, restore: false })
}

function chromeInsets() {
  const header = document.querySelector("#header")
  const footer = document.querySelector("#footer") || document.querySelector(".bar")
  const top = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0
  const bottom = footer
    ? Math.max(0, window.innerHeight - footer.getBoundingClientRect().top)
    : 0
  return { top, bottom }
}

function findScrollParent(el) {
  let node = el?.parentElement
  while (node && node !== document.body && node !== document.documentElement) {
    const style = getComputedStyle(node)
    const oy = style.overflowY
    if ((oy === "auto" || oy === "scroll" || oy === "overlay")
      && node.scrollHeight > node.clientHeight + 1) {
      return node
    }
    node = node.parentElement
  }
  return document.scrollingElement || document.documentElement
}

function visibleCardsInColumn(card) {
  const column = columnOf(card)
  if (!columnIsOpen(column)) return []
  // Column section only. A board-wide query (or leftover aria-selected in a
  // collapsed column) walked card numbers 8 → 9 → 10 across columns.
  return [...column.querySelectorAll("article.card")].filter((el) => {
    if (el.hidden) return false
    return columnOf(el) === column
  })
}

function fizzySelect(card) {
  const list = card.closest(".cards__transition-container")
    || card.closest("[data-controller~='navigable-list']")
  const stim = window.Stimulus
  if (!list || !stim) return
  const ctl = stim.getControllerForElementAndIdentifier(list, "navigable-list")
  ctl?.selectItem?.(card, true)
}

function selectCard(card) {
  if (!card) return
  document.querySelectorAll("article.card[aria-selected='true']").forEach((el) => {
    if (el !== card) el.removeAttribute("aria-selected")
  })
  card.setAttribute("aria-selected", "true")
  const column = columnOf(card)
  document.querySelectorAll(".nimue-column-focus").forEach((el) => {
    if (el !== column) el.classList.remove("nimue-column-focus")
  })
  column?.classList.add("nimue-column-focus")
  fizzySelect(card)
  card.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
  try { card.focus({ preventScroll: true }) } catch { /* ignore */ }
  saveFocus({
    cardId: card.dataset.cardId || null,
    cardNumber: card.dataset.id || null
  })
}

function boardColumns() {
  return [...document.querySelectorAll('[data-collapsible-columns-target~="column"]')]
    .filter((el) => el.id !== "not-now")
}

function focusedColumn() {
  return document.querySelector(".nimue-column-focus")
    || columnOf(selectedCard())
    || null
}

function clearCardSelection() {
  document.querySelectorAll("article.card[aria-selected='true']").forEach((el) => {
    el.removeAttribute("aria-selected")
  })
}

function setFocusedColumn(column) {
  document.querySelectorAll(".nimue-column-focus").forEach((el) => {
    el.classList.remove("nimue-column-focus")
  })
  if (!column) return
  column.classList.add("nimue-column-focus")
  column.scrollIntoView({ block: "nearest", inline: "nearest" })
  if (columnIsOpen(column)) {
    const current = selectedCard()
    const card = (current && columnOf(current) === column)
      ? current
      : [...column.querySelectorAll("article.card")].find((el) => !el.hidden)
    if (card) selectCard(card)
    return
  }
  clearCardSelection()
}

function moveColumnHighlight(direction) {
  const columns = boardColumns()
  if (columns.length === 0) return
  const current = focusedColumn()
  const idx = columns.indexOf(current)
  const from = idx < 0 ? 0 : idx
  const next = direction === "right" ? columns[from + 1] : columns[from - 1]
  if (!next) {
    if (!current) setFocusedColumn(columns[0])
    return
  }
  setFocusedColumn(next)
}

function toggleFocusedColumn() {
  const column = focusedColumn()
  if (!column) return
  const button = column.querySelector('[data-collapsible-columns-target="button"]')
  if (!button) return
  button.click()
  column.classList.add("nimue-column-focus")
  if (columnIsOpen(column)) {
    const card = [...column.querySelectorAll("article.card")].find((el) => !el.hidden)
    if (card) selectCard(card)
    else clearCardSelection()
    return
  }
  clearCardSelection()
}

// j/k stay inside the current column. Fizzy's nested navigable-list relays
// ArrowDown to the parent column list and can jump sideways (Research ← In Progress).
function moveInColumn(card, direction) {
  const siblings = visibleCardsInColumn(card)
  const idx = siblings.indexOf(card)
  if (idx < 0) return card
  const next = direction === "down" ? siblings[idx + 1] : siblings[idx - 1]
  if (!next) return card
  selectCard(next)
  return next
}

function ensureCardInView(card) {
  if (!card || card.hidden) return

  const scroller = findScrollParent(card)
  const siblings = visibleCardsInColumn(card)
  const isFirst = siblings[0] === card
  const isLast = siblings.length > 0 && siblings[siblings.length - 1] === card

  // Top of the column: pin scroll to 0 so header chrome / column title isn't clipped.
  if (isFirst) {
    if (scroller === document.scrollingElement
      || scroller === document.documentElement
      || scroller === document.body) {
      window.scrollTo(0, 0)
    } else {
      scroller.scrollTop = 0
    }
    return
  }

  const pad = 10
  const { top: chromeTop, bottom: chromeBottom } = chromeInsets()
  const safeTop = chromeTop + pad
  const safeBottom = window.innerHeight - chromeBottom - pad
  const rect = card.getBoundingClientRect()

  let delta = 0
  if (rect.bottom > safeBottom) delta = rect.bottom - safeBottom
  else if (rect.top < safeTop) delta = rect.top - safeTop

  // Last card: if still clipped after delta, pin to max scroll.
  if (isLast && (rect.bottom > safeBottom || Math.abs(delta) >= 1)) {
    if (scroller === document.scrollingElement
      || scroller === document.documentElement
      || scroller === document.body) {
      const max = Math.max(0, (document.scrollingElement || document.documentElement).scrollHeight - window.innerHeight)
      window.scrollTo(0, max)
    } else {
      scroller.scrollTop = scroller.scrollHeight
    }
    return
  }

  if (Math.abs(delta) < 1) return

  if (scroller === document.scrollingElement
    || scroller === document.documentElement
    || scroller === document.body) {
    window.scrollBy(0, delta)
  } else {
    scroller.scrollTop += delta
  }
}

function afterNavScroll() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const card = selectedCard()
      ensureCardInView(card)
      saveFocus()
    })
  })
}

function scrollPerma(direction) {
  const amount = Math.max(80, Math.round(window.innerHeight * 0.28))
  const scroller = document.scrollingElement || document.documentElement
  scroller.scrollBy(0, direction === "down" ? amount : -amount)
}

function restoreFocus(attempt = 0) {
  if (!onBoard()) return
  const state = loadFocus()
  if (!state?.restore) return
  const boardId = currentBoardId()
  if (state.boardId && boardId && String(state.boardId) !== String(boardId)) {
    clearRestoreFlag()
    return
  }

  applyScrolls(state.scrolls)

  let card = findBoardCard(state)
  if (!card) {
    if (attempt < 40) requestAnimationFrame(() => restoreFocus(attempt + 1))
    else clearRestoreFlag()
    return
  }

  const parentId = card.dataset.parentCardId
  if (parentId && (card.hidden || card.checkVisibility?.() === false)) {
    const parent = document.querySelector(`article.card[data-card-id="${CSS.escape(String(parentId))}"]`)
    if (parent?.classList.contains("task-card-parent-collapsed") && window.FizzyTasks?.toggleFold) {
      window.FizzyTasks.toggleFold(parent)
      card = findBoardCard(state)
    }
  }

  if (card && !card.hidden) {
    selectCard(card)
    ensureCardInView(card)
    clearRestoreFlag()
    requestAnimationFrame(() => {
      try { card.focus({ preventScroll: true }) } catch { /* ignore */ }
    })
    return
  }

  if (attempt < 40) requestAnimationFrame(() => restoreFocus(attempt + 1))
  else clearRestoreFlag()
}

document.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  if (isTyping(document.activeElement) || isTyping(event.target)) return

  const tasks = window.FizzyTasks
  const key = event.key
  const lower = key.toLowerCase()

  if (key === "ArrowUp" || key === "ArrowDown") {
    if (!onBoard() || onCardPerma()) return
    event.preventDefault()
    event.stopImmediatePropagation()
    document.dispatchEvent(new CustomEvent("fizzy:column-nav", {
      detail: { direction: key === "ArrowDown" ? "down" : "up" }
    }))
    return
  }

  if (lower === "e") {
    if (!onBoard()) return
    const card = selectedCard() || findBoardCard(loadFocus())
    if (!card || !tasks) return
    const parent = tasks.resolveParent(card) || card
    const kids = (tasks.childrenOf(parent) || []).filter((k) => (k.querySelector(".card__title")?.textContent || "").trim() !== "sp")
    if (!event.shiftKey && kids.length === 0) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.shiftKey) tasks.toggleAllFolds()
    else tasks.toggleFold(card)
    return
  }

  if (lower === "i" && !event.shiftKey) {
    if (!onBoard()) return
    event.preventDefault()
    event.stopPropagation()
    const card = ensureHighlight()
    if (!card || !tasks) return
    tasks.startAddTask(tasks.resolveParent(card) || card)
    return
  }

  if (lower === "x" && !event.shiftKey) {
    if (!onBoard()) return
    event.preventDefault()
    event.stopPropagation()
    const card = ensureHighlight()
    if (!card || !tasks) return
    tasks.deleteCard(card).catch((err) => alert(err.message || "Could not delete"))
    return
  }

  if (key === "Enter" && !event.shiftKey) {
    if (!onBoard() || onCardPerma()) return
    const card = selectedCard() || findBoardCard(loadFocus())
    const link = card?.querySelector("a.card__link")
    if (!link) return
    event.preventDefault()
    event.stopImmediatePropagation()
    link.click()
    return
  }

  if (event.shiftKey) return

  // Open card: j/k scroll the page.
  if (onCardPerma()) {
    if (lower === "j" || lower === "k") {
      event.preventDefault()
      event.stopPropagation()
      scrollPerma(lower === "j" ? "down" : "up")
    }
    return
  }

  if (!onBoard()) return

  if (lower === "j" || lower === "k") {
    event.preventDefault()
    event.stopImmediatePropagation()
    const already = selectedCard()
    const card = ensureHighlight()
    if (!card) return
    if (already) moveInColumn(card, lower === "j" ? "down" : "up")
    afterNavScroll()
    return
  }

  if (lower === "h" || lower === "l") {
    event.preventDefault()
    event.stopImmediatePropagation()
    const already = focusedColumn()
    if (!already) {
      const col = columnOf(selectedCard()) || boardColumns().find(columnIsOpen) || boardColumns()[0]
      setFocusedColumn(col)
      return
    }
    moveColumnHighlight(lower === "l" ? "right" : "left")
    return
  }

  if (lower === "w") {
    event.preventDefault()
    event.stopImmediatePropagation()
    if (!focusedColumn()) {
      const col = columnOf(selectedCard()) || boardColumns().find(columnIsOpen)
      if (col) setFocusedColumn(col)
    }
    toggleFocusedColumn()
    return
  }
}, true)

document.addEventListener("fizzy:column-nav", (event) => {
  if (!onBoard() || onCardPerma()) return
  const already = selectedCard()
  const card = ensureHighlight()
  if (!card) return
  if (already) moveInColumn(card, event.detail?.direction === "down" ? "down" : "up")
  afterNavScroll()
})

// Remember selection + column scroll across Enter → Esc (Turbo.visit back).
// Flag lives in sessionStorage so a module reload cannot wipe it.
document.addEventListener("turbo:before-visit", () => {
  if (onBoard()) {
    saveFocus({ restore: true })
  } else if (onCardPerma()) {
    // Keep DB cardId from the board visit; only fill number from the URL.
    saveFocus({ cardNumber: cardNumberFromUrl(), restore: true })
  }
})
document.addEventListener("click", (event) => {
  const link = event.target?.closest?.("a.card__link")
  if (!link) return
  const card = link.closest("article.card")
  if (!card) return
  saveFocus({
    cardId: card.dataset.cardId || null,
    cardNumber: card.dataset.id || null,
    restore: true
  })
}, true)

document.addEventListener("fizzy:nest-done", () => {
  if (loadFocus()?.restore) restoreFocus()
})
;["turbo:load", "turbo:render", "turbo:morph", "turbo:frame-load"].forEach((name) => {
  document.addEventListener(name, () => {
    if (onCardPerma()) {
      saveFocus({ cardNumber: cardNumberFromUrl(), restore: true })
    } else if (onBoard() && loadFocus()?.restore) {
      restoreFocus()
    }
  })
})
