function matchProperties(match, properties) {
  for(const key in match) {
    const value = match[key]
    const property = properties[key]
    if(typeof value == 'object') {
      if(typeof property != 'object') return false
      if(!matchProperties(value, property)) return false
    } else {
      if(value != property) return false
    }
  }
  return true
}

function eventElementMatch(event, element) {
  console.log("CHECK ELEMENT", element)
  if(element.type != event.type) return false
  if(element.match) {
    console.log("MATCH PROPERTIES", event, element)
    if(!event.properties) return false
    if(!matchProperties(element.match, event.properties)) return false
  }
  console.log("ELEMENT FOUND", event, element)
  return true
}

module.exports = { eventElementMatch, matchProperties }