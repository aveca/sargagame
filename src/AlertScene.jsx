import React from "react"

function AlertScene(){
  return(
    <div aria-hidden style={{borderRadius:20,overflow:"hidden",border:"1px solid rgba(255,255,255,.09)",
      background:"linear-gradient(180deg,#0C1D21 0%,#120821 100%)"}}>
      <svg viewBox="0 0 560 240" style={{display:"block",width:"100%",height:"auto"}}>
        <style>{`
.sgas-notif{animation:sgasNotif 9s cubic-bezier(.22,1,.36,1) 1 both}
@keyframes sgasNotif{0%,6%{opacity:0;transform:translateY(14px)}12%,100%{opacity:1;transform:translateY(0)}}
.sgas-raft{animation:sgasRaft 9s linear 1 both}
@keyframes sgasRaft{0%{transform:translateX(46px)}100%{transform:translateX(-30px)}}
.sgas-route{stroke-dasharray:4 6;animation:sgasRoute 9s linear 1 both}
@keyframes sgasRoute{0%,18%{opacity:0}26%,100%{opacity:1}}
.sgas-dot{animation:sgasDot 9s cubic-bezier(.45,.05,.4,1) 1 both}
@keyframes sgasDot{0%,24%{offset-distance:0%;opacity:0}30%{opacity:1}62%,100%{offset-distance:100%;opacity:1}}
.sgas-ok{animation:sgasOk 9s ease-out 1 both;transform-origin:468px 96px}
@keyframes sgasOk{0%,60%{transform:scale(.4);opacity:0}68%{transform:scale(1.25);opacity:1}74%,100%{transform:scale(1);opacity:1}}
.sgas-sun{animation:sgasSun 9s ease-in-out 1 both}
@keyframes sgasSun{0%,8%{transform:translateY(16px);opacity:.4}30%,100%{transform:translateY(0);opacity:.9}}
@media (prefers-reduced-motion:reduce){.sgas-notif,.sgas-raft,.sgas-route,.sgas-dot,.sgas-ok,.sgas-sun{animation:none}}
        `}</style>
        {/* aube : soleil qui se lève + heure */}
        <g className="sgas-sun"><circle cx="60" cy="52" r="16" fill="#FFC72C"/><circle cx="60" cy="52" r="26" fill="#FFC72C" opacity=".12"/></g>
        <text x="92" y="58" fontFamily="ui-monospace,monospace" fontSize="15" fontWeight="700" fill="rgba(255,255,255,.75)">06:00</text>
        {/* téléphone + notification */}
        <g>
          <rect x="36" y="84" width="118" height="128" rx="16" fill="#10231E" stroke="rgba(255,255,255,.16)"/>
          <rect x="78" y="92" width="34" height="5" rx="2.5" fill="rgba(255,255,255,.18)"/>
          <g className="sgas-notif">
            <rect x="46" y="108" width="98" height="44" rx="10" fill="#1A2F29" stroke="rgba(255,199,44,.45)"/>
            <text x="56" y="126" fontSize="13">⚠️</text>
            <rect x="76" y="118" width="58" height="5" rx="2.5" fill="rgba(255,255,255,.55)"/>
            <rect x="76" y="128" width="42" height="5" rx="2.5" fill="rgba(255,255,255,.28)"/>
            <rect x="56" y="138" width="50" height="7" rx="3.5" fill="#FFC72C"/>
          </g>
        </g>
        {/* plage ⚠️ (le banc arrive) */}
        <path d="M205 196 Q255 176 310 182 L310 240 L205 240 Z" fill="#1A2A23"/>
        <g className="sgas-raft" transform="translate(232,186)">
          <ellipse cx="0" cy="0" rx="14" ry="5" fill="#8a6a1a"/><ellipse cx="-8" cy="-2" rx="7" ry="3.5" fill="#9a7a22"/>
          <ellipse cx="8" cy="-2" rx="8" ry="3.5" fill="#6b4a12"/><circle cx="-4" cy="-5" r="1.8" fill="#b8962e"/><circle cx="6" cy="-4" r="1.8" fill="#b8962e"/>
        </g>
        <g transform="translate(258,160)">
          <circle cx="0" cy="0" r="11" fill="#E8522A"/>
          <text x="0" y="4.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">!</text>
        </g>
        {/* itinéraire bascule : pointillés du téléphone vers la plage ✓ */}
        <path id="sgasPath" d="M160 150 Q300 70 440 116" fill="none" className="sgas-route" stroke="#FFC72C" strokeWidth="2.4"/>
        <circle className="sgas-dot" r="6" fill="#FFC72C" style={{offsetPath:"path('M160 150 Q300 70 440 116')"}}/>
        {/* plage ✓ propre */}
        <path d="M388 178 Q452 152 560 160 L560 240 L388 240 Z" fill="#1A2A23"/>
        <path d="M402 178 Q462 158 552 162" stroke="#FFC72C" strokeWidth="1.3" fill="none" opacity=".5"/>
        <g fill="none" stroke="#3F6B52" strokeWidth="3.4" strokeLinecap="round">
          <path d="M512 164 Q506 140 512 122"/>
          <path d="M512 122 Q524 112 538 114"/><path d="M512 122 Q500 110 488 112"/><path d="M512 122 Q514 106 518 100"/>
        </g>
        <g className="sgas-ok">
          <circle cx="468" cy="96" r="15" fill="#FFC72C"/>
          <path d="M461 96 L466 101 L476 90" stroke="#120821" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </g>
      </svg>
    </div>
  )
}

export default AlertScene
