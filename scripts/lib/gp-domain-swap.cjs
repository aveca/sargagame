'use strict'
// Swap de domaine MQ → GP pour l'overlay Guadeloupe, SANS casser les énumérations
// qui nomment les deux sites (pages légales : « sargasses-martinique.com et
// sargasses-guadeloupe.com »). Sans protection, le swap global produisait
// « sargasses-guadeloupe.com et sargasses-guadeloupe.com » (PR #922, commentaire
// 6179145528). Les paires sont rendues à l'identique du texte MQ.
const PAIR_RE = /sargasses-martinique\.com((?:<\/strong>)?(?: et |, | and | y )(?:<strong>)?)sargasses-guadeloupe\.com/g

function swapMqDomainToGp(content) {
  const kept = []
  let out = String(content).replace(PAIR_RE, (m) => { kept.push(m); return `##GP_DOMAIN_PAIR_${kept.length - 1}##` })
  out = out.replace(/sargasses-martinique\.com/g, 'sargasses-guadeloupe.com')
  out = out.replace(/##GP_DOMAIN_PAIR_(\d+)##/g, (_, i) => kept[Number(i)])
  return out
}

module.exports = { swapMqDomainToGp, PAIR_RE }
