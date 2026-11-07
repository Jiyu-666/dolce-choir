const practice=()=>location.hash.startsWith("#/practice");
const initial=practice();
if(initial)document.body.classList.add("practice-route");
window.addEventListener("hashchange",()=>{if(practice()!==initial)location.reload();});
void (initial?import("./choir/standalone").then(m=>m.bootPractice()):import("./main")).catch(async error=>{
  console.error(error);const {t}=await import("./i18n");document.body.textContent=t("choir.failed");
});
