let deferredPrompt;
const installButton = document.getElementById("install_pwa_btn");

window.addEventListener("beforeinstallprompt", (e) => {
  console.log("beforeinstallprompt event fired");
  e.preventDefault();
  deferredPrompt = e;
  if (installButton) {
    installButton.style.display = "block";
  }
});

if (installButton) {
  installButton.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      deferredPrompt = null;
      installButton.style.display = "none";
    }
  });
}

window.addEventListener("appinstalled", () => {
  console.log("PWA was installed");
  deferredPrompt = null;
  if (installButton) {
    installButton.style.display = "none";
  }
});
