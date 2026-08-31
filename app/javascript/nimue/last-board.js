const STORAGE_KEY = "nimue-last-board"

function isTyping(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable
    || !!el.closest("input, textarea, [contenteditable], lexxy-editor")
}

function boardPath(pathname = location.pathname) {
  const match = pathname.match(/^(.*?\/boards\/[^/]+)/)
  if (!match) return null
  return match[1]
}

function rememberBoard() {
  if (!document.querySelector(".card-columns")) return
  const path = boardPath()
  if (path) sessionStorage.setItem(STORAGE_KEY, path)
}

function lastBoardPath() {
  return sessionStorage.getItem(STORAGE_KEY)
}

function visitLastBoard(event) {
  const path = lastBoardPath()
  if (!path) {
    if (event) event.preventDefault()
    return
  }
  if (event) event.preventDefault()
  if (location.pathname === path) return
  window.Turbo.visit(path)
}

function onKeydown(event) {
  if (event.key !== "5" || event.altKey || event.ctrlKey || event.metaKey) return
  if (isTyping(event.target)) return
  visitLastBoard(event)
}

document.addEventListener("turbo:load", rememberBoard)
document.addEventListener("turbo:render", rememberBoard)
document.addEventListener("keydown", onKeydown)
document.addEventListener("click", (event) => {
  const link = event.target.closest?.("#filter-hotkey-5")
  if (link) visitLastBoard(event)
})

rememberBoard()
