const DIRECT_KEYWORDS = /(?:什么|干什么|为什么|谁|多少|几)/u
const CHOICE_PATTERN = /[\u4e00-\u9fffA-Za-z0-9]+(?:还是[\u4e00-\u9fffA-Za-z0-9]+)+/u
const XOR_PATTERN = /([\u4e00-\u9fff])不\1/u
const PROBABILITY_PATTERN = /.{1,12}(?:的)?(?:概率|几率)/u

function hasReplaceableKeyword(text) {
  const value = String(text || "")
  return DIRECT_KEYWORDS.test(value)
    || CHOICE_PATTERN.test(value)
    || XOR_PATTERN.test(value)
    || PROBABILITY_PATTERN.test(value)
    || /[你我]/u.test(value)
}

module.exports = { hasReplaceableKeyword }
