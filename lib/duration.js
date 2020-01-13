const durationMultipliers = {
  'ms':1, 's':1000, 'm':60*1000, 'h':60*60*1000, 'd':24*60*60*1000,
  'w':7*24*60*60*1000, 'n':30*24*60*60*1000, 'y':365*24*60*60*1000
}
function parseDuration(text) {
  const [all, prefix, sufix] = text.match(/^([0-9]*)([a-z]?)$/i)
  const amount = (+prefix) || 1
  const multiplier = durationMultipliers[sufix]
  if(sufix && !multiplier) throw new Error(`unknown duration sufix "${sufix}"`)
  return amount * multiplier
}

module.exports = { parseDuration }