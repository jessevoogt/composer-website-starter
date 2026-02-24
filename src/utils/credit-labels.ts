function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function normalizeCreditKey(value: string): string {
  return collapseWhitespace(value).toLowerCase()
}

function getPerformerCreditBaseLabel(compactValue: string): string {
  // Strip comma-suffixed instrument/details: "Name, violin" -> "Name"
  const commaIndex = compactValue.indexOf(',')
  const withoutCommaSuffix = commaIndex <= 0 ? compactValue : compactValue.slice(0, commaIndex).trim()

  // Strip trailing parenthetical instrument/details: "Name (viola)" -> "Name"
  const withoutTrailingParenthetical = withoutCommaSuffix.replace(/(?:\s*\([^)]*\)\s*)+$/, '').trim()

  return withoutTrailingParenthetical || withoutCommaSuffix || compactValue
}

export function getPerformerCreditLabel(value: string): string {
  const compactValue = collapseWhitespace(value)
  if (!compactValue) return ''
  return getPerformerCreditBaseLabel(compactValue)
}

export function splitPerformerCreditLabel(value: string): { label: string; name: string; suffix: string } {
  const label = collapseWhitespace(value)
  if (!label) return { label: '', name: '', suffix: '' }

  const name = getPerformerCreditBaseLabel(label)
  const suffix = label.startsWith(name) ? label.slice(name.length) : ''

  return { label, name: name || label, suffix }
}

export function getPerformerCreditKey(value: string): string {
  return normalizeCreditKey(getPerformerCreditLabel(value))
}
