// Nested Fizzy task cards under parent stories.
// Flatten before Turbo morph so live updates stay intact. No MutationObserver.
const PLACEHOLDER_TITLE = "sp"
const FOLD_STORAGE_KEY = "fizzy-task-folds"

function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content || ""
}

function appPrefix() {
  const href = document.querySelector("article.card a.card__link[href]")?.getAttribute("href")
    || location.pathname
  const m = href.match(/^(\/\d+)(?=\/)/)
  return m ? m[1] : ""
}

function boardId() {
  return document.querySelector(".card-columns")?.dataset?.collapsibleColumnsBoardValue || null
}

function columnIdFromCard(card) {
  const section = card.closest("section.cards")
  const id = section?.id || ""
  if (id.startsWith("column_")) return id.slice("column_".length)
  return null
}

function cardTitle(card) {
  return (card.querySelector(".card__title")?.textContent || "").trim()
}

function isPlaceholder(card) {
  return cardTitle(card) === PLACEHOLDER_TITLE
}

function lists(root = document) {
  return root.querySelectorAll(".cards__list")
}

function selectedCard() {
  const focused = document.activeElement?.closest?.("article.card")
  if (focused && !focused.hidden) {
    const column = focused.closest("section.cards")
    if (column && !column.classList.contains("is-collapsed")) return focused
  }
  return document.querySelector("section.cards:not(.is-collapsed) article.card[aria-selected='true']")
}

function loadCollapsedIds() {
  try {
    const raw = localStorage.getItem(FOLD_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set()
  }
}

function saveCollapsedIds(ids) {
  localStorage.setItem(FOLD_STORAGE_KEY, JSON.stringify([...ids]))
}

function isColumnFullscreen(list) {
  if (list?.closest) return !!list.closest("section.cards.cards--grid")
  return !!document.querySelector("section.cards.cards--grid")
}

function clearIndexLabel(card) {
  card.querySelectorAll(".task-cards-index").forEach((el) => el.remove())
}

function boardNumber(card) {
  return String(card.dataset.cardNumberOrig || card.dataset.id || "").trim()
}

function setBadgeNumber(card, display) {
  const idEl = card.querySelector(".card__id")
  if (!idEl) return
  if (!card.dataset.cardNumberOrig) {
    const raw = (idEl.textContent || "").replace(/Card number/i, "").trim()
    card.dataset.cardNumberOrig = raw || card.dataset.id || ""
  }
  let sr = idEl.querySelector(".for-screen-reader")
  if (!sr) {
    sr = document.createElement("span")
    sr.className = "for-screen-reader"
    sr.textContent = "Card number"
  }
  idEl.replaceChildren(sr, document.createTextNode(` ${display}`))
}

function restoreBadgeNumber(card) {
  if (!card.dataset.cardNumberOrig) return
  setBadgeNumber(card, card.dataset.cardNumberOrig)
  delete card.dataset.cardNumberOrig
}

function applySubNumbers(parentNum, kids) {
  if (!parentNum) return
  kids.forEach((kid, i) => {
    setBadgeNumber(kid, `${parentNum}.${i + 1}`)
  })
}

function clearFoldChrome(card) {
  card.querySelectorAll(".task-cards-fold").forEach((el) => el.remove())
  card.classList.remove("task-card-parent", "task-card-parent-collapsed")
}

function ensureFoldChrome(parent, count, collapsed) {
  parent.classList.add("task-card-parent")
  parent.classList.toggle("task-card-parent-collapsed", collapsed)
  let el = parent.querySelector(".task-cards-fold")
  if (!el) {
    el = document.createElement("button")
    el.type = "button"
    el.className = "task-cards-fold"
    el.setAttribute("aria-label", "Toggle tasks")
    el.addEventListener("click", (event) => {
      event.preventDefault()
      event.stopPropagation()
      toggleFold(parent)
    })
    const header = parent.querySelector(".card__header")
    if (header) header.append(el)
    else parent.prepend(el)
  }
  el.textContent = collapsed ? `▸ ${count}` : `▾ ${count}`
  el.title = collapsed ? "Expand tasks (e)" : "Collapse tasks (e)"
  el.setAttribute("aria-expanded", collapsed ? "false" : "true")
}

function lastChildAnchor(parent) {
  let anchor = parent
  let sib = parent.nextElementSibling
  while (sib) {
    if (sib.classList?.contains("task-cards-form")) {
      anchor = sib
      sib = sib.nextElementSibling
      continue
    }
    if (sib.matches?.("article.card") && sib.dataset.parentCardId === parent.dataset.cardId) {
      anchor = sib
      sib = sib.nextElementSibling
      continue
    }
    break
  }
  return anchor
}

function startAddTask(parent) {
  if (!parent || parent.dataset.parentCardId) {
    const pid = parent?.dataset?.parentCardId
    parent = pid
      ? document.querySelector(`article.card[data-card-id="${pid}"]`)
      : parent
  }
  if (!parent || parent.dataset.parentCardId) return

  if (parent.classList.contains("task-card-parent-collapsed")) {
    setFold(parent, false)
  }

  const existing = parent.parentElement?.querySelector(
    `.task-cards-form[data-parent-card-id="${parent.dataset.cardId}"]`
  )
  if (existing) {
    existing.querySelector("input")?.focus()
    return
  }

  // Ephemeral: only while adding. Enter saves, Esc cancels. No standing + Task chrome.
  const form = document.createElement("form")
  form.className = "task-cards-form"
  form.dataset.parentCardId = parent.dataset.cardId
  form.innerHTML = `<input type="text" name="title" placeholder="Task title — Enter to save, Esc to cancel" required autocomplete="off" aria-label="New task title">`
  lastChildAnchor(parent).after(form)
  const input = form.querySelector("input")
  input.focus()

  const cancel = () => form.remove()
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      cancel()
    }
  })

  form.addEventListener("submit", async (event) => {
    event.preventDefault()
    event.stopPropagation()
    const title = input.value.trim()
    if (!title) return
    input.disabled = true
    try {
      await createChildCard(parent, title)
      form.remove()
    } catch (err) {
      input.disabled = false
      input.focus()
      alert(err.message || "Could not create task")
    }
  })
}

async function createChildCard(parent, title) {
  const board = boardId()
  if (!board) throw new Error("Board not found")
  const parentId = parent.dataset.cardId
  if (!parentId) throw new Error("Parent card id missing")

  const payload = { card: { title, parent_card_id: parentId } }
  const columnId = columnIdFromCard(parent)
  if (columnId) payload.card.column_id = columnId

  const res = await fetch(`${appPrefix()}/boards/${board}/cards.json`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-CSRF-Token": csrfToken()
    },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Create failed (${res.status})${text ? ": " + text.slice(0, 180) : ""}`)
  }

  const frame = parent.closest("turbo-frame")
  if (frame && typeof frame.reload === "function") {
    frame.reload()
  } else {
    nestAll()
  }
}

async function deleteCard(card) {
  if (!card) return
  const number = card.dataset.id
  if (!number) throw new Error("Card number missing")

  const kids = childrenOf(card)
  const isChild = !!card.dataset.parentCardId
  const msg = isChild
    ? "Delete this task?"
    : kids.length > 0
      ? `Delete this card and ${kids.length} task${kids.length === 1 ? "" : "s"}?`
      : "Delete this card?"

  if (!confirm(msg)) return

  const res = await fetch(`${appPrefix()}/cards/${number}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: {
      "Accept": "text/vnd.turbo-stream.html, text/html, application/json",
      "X-CSRF-Token": csrfToken()
    }
  })

  if (!res.ok && res.status !== 204 && res.status !== 302) {
    const text = await res.text().catch(() => "")
    throw new Error(`Delete failed (${res.status})${text ? ": " + text.slice(0, 180) : ""}`)
  }

  const parentId = card.dataset.parentCardId
  card.remove()
  kids.forEach((kid) => kid.remove())
  document.querySelectorAll(".task-cards-form").forEach((el) => {
    const prev = el.previousElementSibling
    if (!prev || !document.contains(prev)) el.remove()
  })

  if (parentId) {
    const parent = document.querySelector(`article.card[data-card-id="${parentId}"]`)
    if (parent) parent.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
  }
  nestAll()
}

function childrenOf(parent) {
  if (!parent?.dataset?.cardId) return []
  const pid = parent.dataset.cardId
  const list = parent.closest(".cards__list")
  if (!list) return []
  return [...list.querySelectorAll(`article.card[data-parent-card-id="${pid}"]`)]
}

function resolveParent(card) {
  if (!card) return null
  if (!card.dataset.parentCardId) return card
  return document.querySelector(`article.card[data-card-id="${card.dataset.parentCardId}"]`) || card
}

function setFold(parent, collapsed) {
  if (!parent?.dataset?.cardId) return
  const ids = loadCollapsedIds()
  if (collapsed) ids.add(String(parent.dataset.cardId))
  else ids.delete(String(parent.dataset.cardId))
  saveCollapsedIds(ids)

  const selected = selectedCard()
  if (collapsed && selected?.dataset?.parentCardId === parent.dataset.cardId) {
    parent.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
  }

  applyFoldsInList(parent.closest(".cards__list") || parent.parentElement)
}

function toggleFold(card) {
  const parent = resolveParent(card)
  if (!parent || parent.dataset.parentCardId) return
  const kids = childrenOf(parent).filter((k) => !isPlaceholder(k))
  if (kids.length === 0) return
  const collapsed = !parent.classList.contains("task-card-parent-collapsed")
  setFold(parent, collapsed)
}

function expandAllFolds() {
  saveCollapsedIds(new Set())
  lists().forEach(applyFoldsInList)
}

function collapseAllFolds() {
  const ids = new Set()
  lists().forEach((list) => {
    list.querySelectorAll("article.card").forEach((card) => {
      if (card.dataset.parentCardId || isPlaceholder(card)) return
      const kids = childrenOf(card).filter((k) => !isPlaceholder(k))
      if (kids.length === 0) return
      ids.add(String(card.dataset.cardId))
    })
  })
  saveCollapsedIds(ids)
  lists().forEach(applyFoldsInList)
}

function toggleAllFolds() {
  const anyCollapsed = [...lists()].some((list) =>
    [...list.querySelectorAll("article.card.task-card-parent-collapsed")].length > 0
  )
  if (anyCollapsed) expandAllFolds()
  else collapseAllFolds()
}

function applyFoldsInList(list) {
  if (!list) return
  const collapsedIds = loadCollapsedIds()
  list.querySelectorAll("article.card.task-card-parent, article.card:not([data-parent-card-id])").forEach((parent) => {
    if (parent.dataset.parentCardId) return
    if (isPlaceholder(parent)) return
    const kids = childrenOf(parent).filter((k) => !isPlaceholder(k))
    if (kids.length === 0) {
      clearFoldChrome(parent)
      parent.classList.remove("task-card-parent-collapsed")
      return
    }

    const collapsed = collapsedIds.has(String(parent.dataset.cardId))
    ensureFoldChrome(parent, kids.length, collapsed)
    kids.forEach((kid) => {
      kid.hidden = collapsed
    })

    let el = parent.nextElementSibling
    while (el) {
      if (el.classList?.contains("task-cards-form")
        && el.dataset.parentCardId === parent.dataset.cardId) {
        el.hidden = collapsed
        el = el.nextElementSibling
        continue
      }
      if (el.matches?.("article.card") && el.dataset.parentCardId === parent.dataset.cardId) {
        el = el.nextElementSibling
        continue
      }
      break
    }
  })
}

function flattenList(list) {
  list.querySelectorAll(".task-cards-form, .task-cards-fold, .task-cards-index").forEach((el) => el.remove())

  const cards = [...list.querySelectorAll("article.card")]
  cards.forEach((card) => {
    card.classList.remove("task-card-child", "task-card-parent", "task-card-parent-collapsed", "task-card-placeholder-sp")
    card.hidden = false
    clearIndexLabel(card)
    clearFoldChrome(card)
    restoreBadgeNumber(card)
    const board = card.querySelector(".card__board")
    const title = card.querySelector(".card__title")
    if (board) {
      board.style.removeProperty("background-color")
      board.style.removeProperty("color")
    }
    if (title) title.style.removeProperty("color")
    list.appendChild(card)
  })
}

function flattenAll() {
  lists().forEach(flattenList)
}

function nestList(list) {
  if (document.activeElement && document.activeElement.closest(".task-cards-form")) return

  list.querySelectorAll(".task-cards-form, .task-cards-fold, .task-cards-index").forEach((el) => el.remove())

  const storiesOnly = isColumnFullscreen(list)
  const byId = new Map()
  list.querySelectorAll("article.card").forEach((card) => {
    const id = card.dataset.cardId
    if (!id || byId.has(id)) return
    byId.set(id, card)
    const child = !!card.dataset.parentCardId
    card.classList.toggle("task-card-child", child)
    if (isPlaceholder(card) || (storiesOnly && child)) {
      card.hidden = true
      if (isPlaceholder(card)) card.classList.add("task-card-placeholder-sp")
    } else {
      card.hidden = false
      card.classList.remove("task-card-placeholder-sp")
    }
  })

  // Column fullscreen: stories only — no nesting, no fold chrome, no child rows.
  if (storiesOnly) {
    byId.forEach((card) => {
      if (card.dataset.parentCardId) return
      clearFoldChrome(card)
    })
    return
  }

  const childrenByParent = new Map()
  byId.forEach((card) => {
    const pid = card.dataset.parentCardId
    if (!pid) return
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, [])
    childrenByParent.get(pid).push(card)
  })

  const collapsedIds = loadCollapsedIds()

  byId.forEach((card) => {
    if (card.dataset.parentCardId) return
    if (isPlaceholder(card)) return
    if (!list.contains(card)) return

    const kids = (childrenByParent.get(card.dataset.cardId) || []).filter((k) => !isPlaceholder(k))
    let anchor = card
    kids.forEach((kid) => {
      if (kid.closest(".cards__list") !== list) return
      clearIndexLabel(kid)
      anchor.insertAdjacentElement("afterend", kid)
      anchor = kid
    })

    const nestedKids = kids.filter((k) => k.closest(".cards__list") === list)

    const collapsed = nestedKids.length > 0 && collapsedIds.has(String(card.dataset.cardId))

    if (nestedKids.length > 0) {
      ensureFoldChrome(card, nestedKids.length, collapsed)
      nestedKids.forEach((kid) => { kid.hidden = collapsed })
    } else {
      clearFoldChrome(card)
    }
  })
}

/** Rewrite task badges to parent.N (keeps data-id / URLs as the real board number). */
function labelAllTaskBadges(root = document) {
  const byParent = new Map()
  root.querySelectorAll("article.card[data-parent-card-id]").forEach((kid) => {
    if (isPlaceholder(kid)) return
    const pid = kid.dataset.parentCardId
    if (!pid) return
    if (!byParent.has(pid)) byParent.set(pid, [])
    byParent.get(pid).push(kid)
  })

  byParent.forEach((kids, pid) => {
    const parent = root.querySelector(`article.card[data-card-id="${CSS.escape(pid)}"]`)
    const parentNum = parent
      ? boardNumber(parent)
      : String(kids[0]?.dataset.parentCardNumber || "").trim()
    if (!parentNum) return

    const parentList = parent?.closest(".cards__list") || null
    const same = []
    const other = []
    kids.forEach((kid) => {
      if (parentList && kid.closest(".cards__list") === parentList) same.push(kid)
      else other.push(kid)
    })
    same.sort((a, b) => Number(boardNumber(a)) - Number(boardNumber(b)))
    other.sort((a, b) => Number(boardNumber(a)) - Number(boardNumber(b)))
    applySubNumbers(parentNum, parentList ? [...same, ...other] : [...kids].sort((a, b) => Number(boardNumber(a)) - Number(boardNumber(b))))
  })
}

let nestTimer = null
let nesting = false
let flattening = false

function paintPerma() {
  const perma = document.querySelector(".card-perma.task-card-child, .card-perma[data-parent-card-id]")
  if (!perma) return
  perma.classList.add("task-card-child")
  const article = perma.querySelector("article.card")
  if (!article) return
  article.classList.add("task-card-child")
  const orig = getComputedStyle(article).getPropertyValue("--card-color").trim()
  if (orig && !orig.includes("color-mix") && !perma.style.getPropertyValue("--story-color")) {
    perma.style.setProperty("--story-color", orig)
  }
  const display = article.dataset.displayNumber
    || perma.dataset.displayNumber
    || null
  if (display) {
    setBadgeNumber(article, display)
    const idEl = perma.querySelector(".card__id")
    if (idEl && idEl.closest("article.card") !== article) {
      let sr = idEl.querySelector(".for-screen-reader")
      if (!sr) {
        sr = document.createElement("span")
        sr.className = "for-screen-reader"
        sr.textContent = "Card number"
      }
      idEl.replaceChildren(sr, document.createTextNode(` ${display}`))
    }
  }
}

function nestAll(root = document) {
  const live = root === document
  if (live && flattening) {
    nestSoon()
    return
  }
  if (live && nesting) return
  if (live && document.activeElement && document.activeElement.closest(".task-cards-form")) return
  if (live) nesting = true
  try {
    lists(root).forEach(nestList)
    labelAllTaskBadges(root)
    if (live || root.querySelector?.(".card-perma")) paintPerma()
  } finally {
    if (live) {
      requestAnimationFrame(() => {
        nesting = false
        document.dispatchEvent(new CustomEvent("fizzy:nest-done"))
      })
    }
  }
}

function nestSoon() {
  clearTimeout(nestTimer)
  if (flattening) {
    nestTimer = setTimeout(nestSoon, 16)
    return
  }
  nestAll()
}

/** Fizzy DnD only moves the dragged card. Pull nested tasks under the parent
 *  in the new column so they never sit alone looking like stories. */
function accompanyChildren(parent) {
  if (!parent?.dataset?.cardId || parent.dataset.parentCardId) return
  if (!document.contains(parent)) return
  if (isColumnFullscreen()) return

  const pid = parent.dataset.cardId
  const kids = [...document.querySelectorAll(`article.card[data-parent-card-id="${CSS.escape(pid)}"]`)]
    .filter((k) => !isPlaceholder(k))
  if (kids.length === 0) return

  kids.sort((a, b) => Number(boardNumber(a)) - Number(boardNumber(b)))
  let anchor = parent
  kids.forEach((kid) => {
    kid.classList.add("task-card-child")
    kid.hidden = false
    clearIndexLabel(kid)
    anchor.insertAdjacentElement("afterend", kid)
    anchor = kid
  })

  const collapsed = loadCollapsedIds().has(String(pid))
  ensureFoldChrome(parent, kids.length, collapsed)
  kids.forEach((kid) => { kid.hidden = collapsed })
  applySubNumbers(boardNumber(parent), kids)
}

let dragParent = null

document.addEventListener("dragstart", (event) => {
  const card = event.target?.closest?.("article.card")
  if (!card || card.dataset.parentCardId) {
    dragParent = null
    return
  }
  dragParent = card
}, true)

document.addEventListener("drop", () => {
  if (!dragParent) return
  // Fizzy inserts the parent into the target list in the same turn; pull kids after.
  requestAnimationFrame(() => {
    if (dragParent) accompanyChildren(dragParent)
  })
}, true)

document.addEventListener("dragend", () => {
  const parent = dragParent
  dragParent = null
  if (!parent) return
  accompanyChildren(parent)
  nestSoon()
}, true)

function onBeforeStreamMorph() {
  if (document.activeElement && document.activeElement.closest(".task-cards-form")) return
  flattening = true
  try {
    flattenAll()
  } finally {
    requestAnimationFrame(() => { flattening = false })
  }
}

// Full-page visits must not flatten the live board. That paints every task
// as a story, then nestAll "collapses" them a frame later.
document.addEventListener("turbo:before-stream-render", onBeforeStreamMorph)

document.addEventListener("turbo:before-render", (event) => {
  const body = event.detail?.newBody
  if (body) nestAll(body)
})

document.addEventListener("turbo:before-frame-render", (event) => {
  const frame = event.detail?.newFrame
  if (frame) nestAll(frame)
})

// Do not flatten on morph. Esc restore morphs server HTML onto the board;
// flattening first paints every task as a story for a frame.

;["turbo:load", "turbo:frame-load", "turbo:render"].forEach((name) => {
  document.addEventListener(name, () => nestAll())
})

;["turbo:morph", "turbo:after-stream-render"].forEach((name) => {
  document.addEventListener(name, () => nestAll())
})

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { nestAll(); paintPerma() })
} else {
  nestAll()
}

window.FizzyTasks = {
  toggleFold,
  expandAllFolds,
  collapseAllFolds,
  toggleAllFolds,
  startAddTask,
  deleteCard,
  resolveParent,
  childrenOf,
  nestAll,
  accompanyChildren,
  selectedCard
}
