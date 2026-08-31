/** Saved column layout. Recency is order only. Who is open comes from
 *  nimue-expand-* keys. Server HTML always expands Maybe, so we never treat
 *  current DOM classes as the source of truth. */

function boardEl(root) {
  return root?.querySelector?.("[data-collapsible-columns-board-value]") || null
}

function columnEls(board) {
  return [...board.querySelectorAll('[data-collapsible-columns-target~="column"]')]
}

function storedExpanded(boardId, columnId) {
  const state = localStorage.getItem("nimue-expand-" + boardId + "-" + columnId)
    || localStorage.getItem("expand-" + boardId + "-" + columnId)
  return state === "expanded" || state === "true"
}

function loadRecency(boardId) {
  try {
    const parsed = JSON.parse(
      localStorage.getItem("nimue-expand-order-" + boardId)
        || localStorage.getItem("expand-order-" + boardId)
        || "[]"
    )
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function desiredOpenIds(board) {
  const boardId = board.dataset.collapsibleColumnsBoardValue
  const columns = columnEls(board)
  const ids = columns.map((column) => column.id).filter((id) => id && id !== "not-now")
  const recency = loadRecency(boardId).filter((id) => ids.includes(id))
  const storedOpen = ids.filter((id) => storedExpanded(boardId, id))

  const keep = []
  recency.forEach((id) => {
    if (storedOpen.includes(id) && !keep.includes(id)) keep.push(id)
  })
  storedOpen.forEach((id) => {
    if (!keep.includes(id)) keep.push(id)
  })
  if (keep.includes("maybe") && keep.some((id) => id !== "maybe" && id !== "closed") && recency[0] !== "maybe") {
    keep.splice(keep.indexOf("maybe"), 1)
  }
  if (keep.length > 0) return keep.slice(0, 2)

  const doing = ids.find((id) => id !== "maybe" && id !== "closed")
  if (doing) return [doing]
  if (ids.includes("maybe")) return ["maybe"]
  return []
}

function applySavedColumnLayout(root) {
  const board = boardEl(root)
  if (!board) return
  const keep = desiredOpenIds(board)
  board.classList.add("no-transitions")
  columnEls(board).forEach((column) => {
    if (column.id === "not-now") return
    const open = keep.includes(column.id)
    column.classList.toggle("is-collapsed", !open)
    column.classList.toggle("is-expanded", open)
    const button = column.querySelector('[data-collapsible-columns-target="button"]')
    button?.setAttribute("aria-expanded", open ? "true" : "false")
  })
}

function persistOpenColumns(root) {
  const board = boardEl(root)
  if (!board) return
  const boardId = board.dataset.collapsibleColumnsBoardValue
  if (!boardId) return

  const recency = loadRecency(boardId)
  const openIds = []
  columnEls(board).forEach((column) => {
    if (column.id === "not-now") return
    let open = column.classList.contains("is-expanded") && !column.classList.contains("is-collapsed")
    if (column.id === "maybe" && open && recency[0] !== "maybe") open = false
    localStorage.setItem("nimue-expand-" + boardId + "-" + column.id, open ? "expanded" : "collapsed")
    if (open) openIds.push(column.id)
  })

  const rest = recency.filter((id) => !openIds.includes(id))
  localStorage.setItem("nimue-expand-order-" + boardId, JSON.stringify([...openIds, ...rest]))
}

document.addEventListener("keydown", (event) => {
  window.__nimueColumnArrow = event.key === "ArrowLeft" || event.key === "ArrowRight"
}, true)

document.addEventListener("turbo:before-render", (event) => {
  window.__nimueColumnArrow = false
  applySavedColumnLayout(event.detail?.newBody)
})

document.addEventListener("turbo:render", () => {
  applySavedColumnLayout(document)
})

document.addEventListener("turbo:after-stream-render", () => {
  applySavedColumnLayout(document)
})

document.addEventListener("turbo:before-visit", () => {
  persistOpenColumns(document)
})
