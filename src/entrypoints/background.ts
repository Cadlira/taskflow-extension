export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    console.info('TaskFlow instalado e pronto para uso.');
  });
});
