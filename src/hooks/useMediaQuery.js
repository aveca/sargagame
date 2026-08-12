import {useState,useEffect} from "react"

export default function useMediaQuery(query){
  const [matches, setMatches] = useState(false)
  useEffect(()=>{
    if(typeof window==="undefined") return
    const mq = window.matchMedia(query)
    setMatches(mq.matches)
    const handler = (e)=>setMatches(e.matches)
    mq.addEventListener?.("change", handler)
    return ()=>mq.removeEventListener?.("change", handler)
  },[query])
  return matches
}
