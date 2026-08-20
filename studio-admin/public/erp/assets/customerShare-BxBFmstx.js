import{t as c,ac as i}from"./index-CzCSwRJd.js";/**
 * @license lucide-react v0.511.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const s=[["path",{d:"M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",key:"1kt360"}]],x=c("folder",s);/**
 * @license lucide-react v0.511.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=[["polygon",{points:"6 3 20 12 6 21 6 3",key:"1oa8hb"}]],S=c("play",d);/**
 * @license lucide-react v0.511.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=[["circle",{cx:"18",cy:"5",r:"3",key:"gq8acd"}],["circle",{cx:"6",cy:"12",r:"3",key:"w7nqdw"}],["circle",{cx:"18",cy:"19",r:"3",key:"1xt0gg"}],["line",{x1:"8.59",x2:"15.42",y1:"13.51",y2:"17.49",key:"47mynk"}],["line",{x1:"15.41",x2:"8.59",y1:"6.51",y2:"10.49",key:"1n3mei"}]],I=c("share-2",y),u="/pages/shareBridge/index";function l(){if(typeof window>"u")return{};const e=["pnzj_erp_user","userInfo","pnzj_user"];for(const t of e){const r=window.localStorage.getItem(t);if(r)try{const o=JSON.parse(r),n=o.role||o.accessRole;if(o!=null&&o.name&&n)return{staffName:o.name,staffRole:n==="staff"?o.role||"employee":n}}catch{}}return{}}function a(e){return Object.entries(e).filter(([,t])=>t!=null&&t!=="").map(([t,r])=>`${t}=${encodeURIComponent(String(r))}`).join("&")}function f(e){return`/pages/projectShare/index?${a({id:e.id,shareType:e.shareType,majorIdx:e.majorIdx,secIdx:e.secIdx,subIdx:e.subIdx,shareMajor:e.shareMajor,shareSec:e.shareSec,shareSubs:e.shareSubs,logId:e.logId,tab:e.tab,categories:e.categories})}`}function h(e){return`${u}?${a({...e,...l()})}`}async function b(e){var o;const t=h(e);if(i(t))return!0;const r=f(e);try{await((o=navigator.clipboard)==null?void 0:o.writeText(r)),alert("已复制小程序分享路径。请在微信小程序内打开 ERP 时使用原生分享卡片发送给客户。")}catch{alert(`请手动复制分享路径：
${r}`)}return!1}export{x as F,S as P,I as S,b as o};
