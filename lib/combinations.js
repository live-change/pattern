function combinations(x, n ,p=[]) {
  if(x.length == 0 || n > x.length) return []
  if(n == 1 || x.length == 1) return x.map(e=>p.concat([e]))
  let acc = []
  for(let i = 0; i < x.length; i++) acc.push(
      ...combinations(x.slice(i+1), n - 1, p.concat([x[i]]))
  )
  return acc
}

function allCombinations(x) {
  let acc = []
  for(let i = 1; i<=x.length; i++) acc.push(...combinations(x,i))
  return acc
}

module.exports = { combinations, allCombinations }