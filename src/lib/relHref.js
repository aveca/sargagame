import {IS_NEW_REGION} from "../Sargasses_PROD.jsx"

export default function relHref(l){
  return IS_NEW_REGION?(l==="es"?"/fiabilidad/":"/reliability/"):"/fiabilite/"
}
