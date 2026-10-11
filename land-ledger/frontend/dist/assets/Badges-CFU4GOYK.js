import{c as n,j as r,g as p,C as o,T as g,h as x}from"./index-C4_ow1mn.js";import{S as m,c as u,d as b}from"./constants-BaNLx-p_.js";import{F as y}from"./file-check-2-DMSuRrmb.js";/**
 * @license lucide-react v0.441.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const c=n("CircleDot",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["circle",{cx:"12",cy:"12",r:"1",key:"41hilf"}]]);/**
 * @license lucide-react v0.441.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=n("CircleX",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m15 9-6 6",key:"1uzhvr"}],["path",{d:"m9 9 6 6",key:"z0biqf"}]]);/**
 * @license lucide-react v0.441.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=n("Clock3",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["polyline",{points:"12 6 12 12 16.5 12",key:"1aq6pp"}]]);/**
 * @license lucide-react v0.441.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=n("Link2",[["path",{d:"M9 17H7A5 5 0 0 1 7 7h2",key:"8i5ue5"}],["path",{d:"M15 7h2a5 5 0 1 1 0 10h-2",key:"1b9ql8"}],["line",{x1:"8",x2:"16",y1:"12",y2:"12",key:"1jonct"}]]);/**
 * @license lucide-react v0.441.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=n("ShieldAlert",[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"M12 8v4",key:"1got3b"}],["path",{d:"M12 16h.01",key:"1drbdi"}]]),l={ok:"text-[rgb(var(--ll-accent-foreground))] border-[rgb(var(--ll-accent)/0.4)] bg-[rgb(var(--ll-accent-soft))]",pending:"text-[rgb(var(--ll-warn))] border-[rgb(var(--ll-warn)/0.4)] bg-[rgb(var(--ll-warn-soft))]",bad:"text-destructive border-destructive/40 bg-[rgb(var(--ll-destructive-soft))]",info:"text-[rgb(var(--ll-info))] border-[rgb(var(--ll-info)/0.4)] bg-[rgb(var(--ll-info-soft))]",primary:"text-primary border-primary/40 bg-[rgb(var(--ll-primary-soft))]",neutral:"text-muted-foreground border-border-strong bg-muted/60"},S={ok:o,pending:h,bad:f,info:c,primary:p,neutral:c};function T({status:e,tone:t,icon:a,label:s}){const i=t||u[e]||"neutral",d=a||S[i]||c;return r.jsxs("span",{className:`status-badge ${l[i]}`,children:[r.jsx(d,{}),s||m[e]||e]})}function A({risk:e}){const t=b[e]||"neutral",a=e==="HIGH"?j:e==="MEDIUM"?g:o;return r.jsxs("span",{className:`status-badge ${l[t]}`,children:[r.jsx(a,{}),e||"—"," risk"]})}function E({operation:e}){const t=e==="OWNERSHIP_TRANSFER";return r.jsxs("span",{className:`status-badge ${t?l.primary:l.info}`,children:[t?r.jsx(x,{}):r.jsx(y,{}),t?"Ownership transfer":"Property registration"]})}function L({tone:e="idle",label:t}){return r.jsxs("span",{className:"inline-flex items-center gap-2 text-[12.5px] font-semibold text-muted-foreground",children:[r.jsx("span",{className:`status-dot ${e}`}),t]})}function O({children:e,primary:t,icon:a,className:s=""}){return r.jsxs("span",{className:`pill ${t?"pill-primary":""} ${s}`,children:[a?r.jsx(a,{size:12}):null,e]})}function R({hash:e,href:t}){if(!e)return r.jsx("span",{className:"tr-muted text-[12px]",children:"—"});const a=`${e.slice(0,12)}…${e.slice(-10)}`,s=r.jsxs(r.Fragment,{children:[r.jsx(k,{size:11,className:"flex-none opacity-70"}),r.jsx("span",{className:"truncate",children:a})]});return t?r.jsx("a",{className:"hash-chip link no-underline",href:t,target:"_blank",rel:"noreferrer",title:e,children:s}):r.jsx("span",{className:"hash-chip",title:e,children:s})}export{f as C,R as H,k as L,E as O,O as P,A as R,T as S,j as a,L as b};
