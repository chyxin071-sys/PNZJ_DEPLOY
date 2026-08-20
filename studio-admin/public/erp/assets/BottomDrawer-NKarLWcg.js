import{aw as d,a4 as e}from"./index-NdtV7orw.js";import{f as i,r as n}from"./vendor-DApabLmi.js";function u({open:s,onClose:a,children:r,title:t}){const o=d(s,a,"pnzjDrawerId");return i.useEffect(()=>(s?document.body.style.overflow="hidden":document.body.style.overflow="",()=>{document.body.style.overflow=""}),[s]),s?n.createPortal(e.jsxs("div",{className:"fixed inset-0 z-[110] md:hidden",onClick:o,children:[e.jsx("div",{className:"absolute inset-0 bg-black/30"}),e.jsxs("div",{className:"absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl animate-slide-up",onClick:l=>l.stopPropagation(),children:[e.jsx("div",{className:"flex justify-center pt-2 pb-1",children:e.jsx("div",{className:"w-8 h-1 bg-gray-200 rounded-full"})}),t&&e.jsx("div",{className:"px-5 py-2 border-b border-gray-50",children:e.jsx("span",{className:"text-sm font-semibold text-gray-800",children:t})}),e.jsx("div",{className:"max-h-[60vh] overflow-y-auto px-2 py-2",children:r})]}),e.jsx("style",{children:`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .animate-slide-up {
          animation: slide-up 0.25s ease-out;
        }
      `})]}),document.body):null}export{u as B};
